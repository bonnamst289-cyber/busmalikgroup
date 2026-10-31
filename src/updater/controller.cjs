const fs = require('node:fs');
const path = require('node:path');
const { isSnoozed, isSkipped } = require('./policy.cjs');

const SNOOZE_HOURS = 24;
const CHECK_INTERVAL_HOURS = 6;
const FIRST_CHECK_DELAY_MS = 8000;
// Every office PC in the association boots around the same time and GitHub only
// answers a limited number of anonymous release lookups per hour per address,
// so the checks are spread out instead of firing together.
const CHECK_JITTER_MS = 10 * 60 * 1000;

// A failed fetch from GitHub is what "offline" looks like for an association
// office with no internet; a throttled answer is the same for the customer.
const NETWORK_ERROR = /(ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EPIPE|socket hang up|net::|ERR_|getaddrinfo|unable to verify|self-signed|certificate|network|403|rate limit|Forbidden)/i;

function jittered(delayMs) {
  return delayMs + Math.floor(Math.random() * CHECK_JITTER_MS);
}

function formatReleaseNotes(notes) {
  if (!notes) return '';
  if (typeof notes === 'string') return notes.trim();
  if (Array.isArray(notes)) {
    return notes.map((entry) => (typeof entry === 'string' ? entry : [entry.version, entry.note].filter(Boolean).join(' — ')))
      .join('\n').trim();
  }
  return String(notes).trim();
}

class UpdateController {
  constructor({ app, getWindows, updater = null, logger = null, enabled = true, disabledReason = null,
    now = () => new Date(), forceDevConfig = false }) {
    this.app = app;
    this.getWindows = getWindows;
    this.now = now;
    this._updater = updater;
    this.externalLogger = logger;
    this.stateDir = path.join(app.getPath('userData'), 'updates');
    this.stateFile = path.join(this.stateDir, 'state.json');
    this.saved = this.readState();
    this.enabled = enabled !== false;
    this.forceDevConfig = forceDevConfig === true;
    this.progressToken = null;
    this.readyFile = null;
    this.busy = false;
    this.listenersAttached = false;
    this.checkTimer = null;
    this.state = {
      status: this.enabled ? 'idle' : 'disabled',
      enabled: this.enabled,
      current_version: app.getVersion(),
      latest_version: null,
      release_notes: '',
      release_date: null,
      mandatory: false,
      blocking: false,
      update_available: false,
      download: null,
      error: this.enabled ? null : (disabledReason || 'Automatic updates are only active in the installed application.'),
      last_check: this.saved.last_check || null
    };
  }

  get updater() {
    if (!this._updater) {
      // eslint-disable-next-line global-require
      const { autoUpdater } = require('electron-updater');
      this._updater = autoUpdater;
    }
    return this._updater;
  }

  readState() {
    try {
      return JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
    } catch {
      return {};
    }
  }

  writeState(patch) {
    this.saved = { ...this.saved, ...patch };
    try {
      fs.mkdirSync(this.stateDir, { recursive: true });
      const tmp = `${this.stateFile}.tmp`;
      fs.writeFileSync(tmp, `${JSON.stringify(this.saved, null, 2)}\n`);
      fs.renameSync(tmp, this.stateFile);
    } catch (error) {
      console.error('[updates] could not save update state:', error.message);
    }
  }

  log(message) {
    const line = `[${this.now().toISOString()}] ${message}`;
    if (this.externalLogger) this.externalLogger(line);
    try {
      fs.mkdirSync(this.stateDir, { recursive: true });
      fs.appendFileSync(path.join(this.stateDir, 'updates.log'), `${line}\r\n`);
    } catch { /* logging must never break the application */ }
  }

  getState() {
    return { ...this.state };
  }

  emit() {
    const snapshot = this.getState();
    for (const win of this.getWindows()) {
      if (win && !win.isDestroyed()) win.webContents.send('updates:event', snapshot);
    }
  }

  setState(patch) {
    this.state = { ...this.state, ...patch };
    this.emit();
  }

  start() {
    if (!this.enabled) return;
    const updater = this.updater;
    // The download is started by this controller so that a snoozed or skipped
    // release never costs the association its bandwidth.
    updater.autoDownload = false;
    // "Remind me later" keeps the already downloaded installer and the NSIS
    // updater installs it silently the next time the application is closed.
    updater.autoInstallOnAppQuit = true;
    updater.allowDowngrade = false;
    updater.logger = {
      info: (message) => this.log(String(message)),
      warn: (message) => this.log(String(message)),
      error: (message) => this.log(String(message))
    };
    if (this.forceDevConfig) updater.forceDevUpdateConfig = true;
    this.attachEvents();
    this.scheduleCheck(jittered(FIRST_CHECK_DELAY_MS));
  }

  scheduleCheck(delayMs) {
    this.firstCheckTimer = setTimeout(() => {
      this.firstCheckTimer = null;
      this.check({ manual: false }).catch(() => {});
      if (!this.checkTimer) {
        const intervalMs = jittered(CHECK_INTERVAL_HOURS * 60 * 60 * 1000);
        this.checkTimer = setInterval(() => this.check({ manual: false }).catch(() => {}), intervalMs);
      }
    }, delayMs);
    this.firstCheckTimer.unref?.();
  }

  stop() {
    if (this.firstCheckTimer) clearTimeout(this.firstCheckTimer);
    if (this.checkTimer) clearInterval(this.checkTimer);
    this.firstCheckTimer = null;
    this.checkTimer = null;
  }

  attachEvents() {
    if (this.listenersAttached) return;
    this.listenersAttached = true;
    const updater = this.updater;
    updater.on('checking-for-update', () => this.setState({ status: 'checking', error: null }));
    updater.on('update-available', (info) => this.onUpdateAvailable(info));
    updater.on('update-not-available', () => {
      this.writeState({ snooze_until: null, skipped_version: null });
      this.setState({ status: 'up_to_date', update_available: false, latest_version: null, download: null, error: null });
    });
    updater.on('download-progress', (progress) => this.setState({
      status: 'downloading',
      update_available: true,
      download: {
        received: Math.round(progress.transferred),
        total: Math.round(progress.total),
        percent: Math.max(0, Math.min(100, Math.round(progress.percent)))
      }
    }));
    updater.on('update-downloaded', (info) => {
      this.readyFile = (info && info.downloadedFile) || null;
      this.progressToken = null;
      this.setState({
        status: 'ready',
        update_available: true,
        latest_version: (info && info.version) || this.state.latest_version,
        download: { received: this.state.download?.total || 0, total: this.state.download?.total || 0, percent: 100 },
        error: null
      });
    });
    updater.on('update-cancelled', () => this.setState({ status: 'idle', download: null }));
    updater.on('error', (error) => this.onUpdateError(error));
  }

  onUpdateAvailable(info) {
    const version = info.version || null;
    const notes = formatReleaseNotes(info.releaseNotes);
    const releaseDate = info.releaseDate || null;
    const suppressed = isSnoozed(this.saved.snooze_until, this.now()) || isSkipped(this.saved.skipped_version, version);
    if (suppressed) {
      this.setState({ status: 'idle', update_available: false, latest_version: version, release_notes: notes, release_date: releaseDate });
      return;
    }
    this.setState({ status: 'optional', update_available: true, latest_version: version, release_notes: notes, release_date: releaseDate, error: null });
    this.startDownload().catch((error) => this.onUpdateError(error));
  }

  onUpdateError(error) {
    const message = error instanceof Error ? error.message : String(error || 'Unknown update error');
    const offline = NETWORK_ERROR.test(message);
    this.writeState({ last_error: message, last_check: this.now().toISOString() });
    this.log(`update ${offline ? 'request failed while offline' : 'error'}: ${message}`);
    // An update that was already found stays offered; only the failed download
    // is dropped, otherwise the customer loses the notice they acted on.
    const keepOffer = Boolean(this.state.latest_version);
    this.setState({
      status: offline ? 'offline' : (keepOffer ? 'optional' : 'error'),
      error: offline ? null : message,
      update_available: offline ? false : keepOffer,
      download: null
    });
  }

  async check({ manual = false } = {}) {
    if (!this.enabled) return this.getState();
    if (this.busy) return this.getState();
    if (manual && this.saved.snooze_until) this.writeState({ snooze_until: null });
    this.busy = true;
    try {
      await this.updater.checkForUpdates();
      this.writeState({ last_check: this.now().toISOString(), last_error: null });
      this.setState({ last_check: this.now().toISOString() });
    } catch (error) {
      // The same failure arrives through the error event; this only un-sticks
      // the UI if the event was never emitted.
      if (this.state.status === 'checking') this.onUpdateError(error);
    } finally {
      this.busy = false;
    }
    return this.getState();
  }

  async startDownload() {
    if (!this.enabled) return this.getState();
    if (this.state.status === 'ready' || this.state.status === 'installing') return this.getState();
    // An install request that arrives while the download is still running waits
    // for it instead of failing, so the button is never a dead end.
    if (this.downloadPromise) {
      await this.downloadPromise;
      return this.getState();
    }
    if (!this.state.update_available) throw new Error('There is no update to download.');
    const { CancellationToken } = require('electron-updater');
    const token = new CancellationToken();
    this.progressToken = token;
    this.setState({ status: 'downloading', error: null, download: { received: 0, total: 0, percent: 0 } });
    this.downloadPromise = this.runDownload(token).finally(() => {
      this.downloadPromise = null;
    });
    await this.downloadPromise;
    return this.getState();
  }

  async runDownload(token) {
    try {
      const files = await this.updater.downloadUpdate(token);
      if (token.isCanceled) return;
      this.readyFile = Array.isArray(files) ? files[files.length - 1] : null;
      this.setState({
        status: 'ready',
        update_available: true,
        download: { received: this.state.download?.total || 0, total: this.state.download?.total || 0, percent: 100 }
      });
    } catch (error) {
      if (!token.isCanceled) this.onUpdateError(error);
    } finally {
      this.progressToken = null;
    }
  }

  snooze() {
    const until = new Date(this.now().getTime() + SNOOZE_HOURS * 60 * 60 * 1000).toISOString();
    this.writeState({ snooze_until: until });
    this.cancelDownload();
    this.setState({ status: 'idle', update_available: false, download: null });
    return this.getState();
  }

  skipVersion() {
    if (!this.state.latest_version) return this.getState();
    this.writeState({ skipped_version: this.state.latest_version });
    this.cancelDownload();
    this.setState({ status: 'idle', update_available: false, download: null });
    return this.getState();
  }

  cancelDownload() {
    if (this.progressToken && !this.progressToken.isCanceled) this.progressToken.cancel();
  }

  async installAndRestart() {
    if (!this.enabled) throw new Error('Automatic updates are only active in the installed application.');
    if (this.state.status !== 'ready') await this.startDownload();
    if (this.state.status !== 'ready') throw new Error('The update has not finished downloading yet.');
    this.setState({ status: 'installing', error: null });
    this.log(`installing update ${this.state.current_version} -> ${this.state.latest_version}`);
    // Silent install into the recorded folder, then relaunch. The installer only
    // replaces program files: the SQLite database and settings live in the
    // per-user application data folder and are never touched.
    this.updater.quitAndInstall(true, true);
    return { restarting: true };
  }
}

module.exports = { UpdateController, SNOOZE_HOURS, CHECK_INTERVAL_HOURS, formatReleaseNotes };
