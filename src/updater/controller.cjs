const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { isSnoozed, isSkipped } = require('./policy.cjs');
const { compareVersions, isValidVersion } = require('./version.cjs');
const { readPublishConfig } = require('./publish.cjs');
const {
  createCentralManifestFetcher, evaluateGate, effectiveGate, gateBlocked, normalizeGraceHours
} = require('./gate.cjs');

const SNOOZE_HOURS = 24;
const CHECK_INTERVAL_HOURS = 6;
const FIRST_CHECK_DELAY_MS = 8000;
const OFFLINE_RETRY_MINUTES = 15;
const MAX_HISTORY = 50;
const MANIFEST_TIMEOUT_MS = 10000;
// The min-version policy is re-read independently of the optional-update
// interval because it is an access gate, not a notification.
const GATE_RECHECK_MINUTES = 30;
// Every office PC in the association boots around the same time and GitHub only
// answers a limited number of anonymous release lookups per hour per address,
// so the checks are spread out instead of firing together.
const CHECK_JITTER_MS = 10 * 60 * 1000;

// A failed fetch from GitHub is what "offline" looks like for an association
// office with no internet; a throttled answer is the same for the customer.
const NETWORK_ERROR = /(ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EPIPE|socket hang up|net::|ERR_|getaddrinfo|unable to verify|self-signed|certificate|network|403|rate limit|Forbidden)/i;
const SHA256_PATTERN = /^[a-f0-9]{64}$/i;
const TRUSTED_DOWNLOAD_HOST = /(^|\.)github\.com$|(^|\.)githubusercontent\.com$/i;

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

function readPackageJson(app) {
  try {
    const file = path.join(app.getAppPath(), 'package.json');
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

function releaseTag(publish, version) {
  return `${publish && publish.vPrefixedTagName === false ? '' : 'v'}${version}`;
}

function releaseManifestUrl(publish, version) {
  if (!publish || !publish.owner || !publish.repo) return null;
  const tag = encodeURIComponent(releaseTag(publish, version));
  return `https://github.com/${publish.owner}/${publish.repo}/releases/download/${tag}/version.json`;
}

function validateReleaseManifest(raw, expectedVersion) {
  if (!raw || typeof raw !== 'object') return null;
  const version = String(raw.version ?? raw.latest_version ?? '').trim();
  if (!isValidVersion(version) || version !== expectedVersion) return null;
  if (!SHA256_PATTERN.test(String(raw.sha256 || ''))) return null;
  let downloadUrl;
  try {
    downloadUrl = new URL(String(raw.downloadUrl ?? raw.download_url ?? ''));
  } catch {
    return null;
  }
  if (downloadUrl.protocol !== 'https:' || !TRUSTED_DOWNLOAD_HOST.test(downloadUrl.hostname)) return null;
  const rawDate = raw.releaseDate ?? raw.release_date;
  const releaseDate = rawDate && !Number.isNaN(Date.parse(rawDate))
    ? new Date(rawDate).toISOString()
    : null;
  return {
    version,
    downloadUrl: downloadUrl.toString(),
    sha256: String(raw.sha256).toLowerCase(),
    releaseNotes: String(raw.releaseNotes ?? raw.release_notes ?? '').trim(),
    releaseDate,
    mandatory: raw.mandatory === true,
    minimumRequiredVersion: String(raw.minimum_required_version ?? raw.minimumVersion ?? version).trim(),
    size: Number(raw.size) || null
  };
}

function createReleaseManifestFetcher({ app, publish = null, fetchImpl = globalThis.fetch, timeoutMs = MANIFEST_TIMEOUT_MS } = {}) {
  const resolved = publish || readPublishConfig(app) || {};
  return async (version) => {
    const url = releaseManifestUrl(resolved, version);
    if (!url || typeof fetchImpl !== 'function') return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        redirect: 'follow',
        signal: controller.signal,
        headers: { Accept: 'application/json', 'User-Agent': 'bus-malik-somiti-updater' }
      });
      if (!response.ok) return null;
      const text = await response.text();
      return validateReleaseManifest(JSON.parse(text), version);
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  };
}

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

class UpdateController {
  constructor({ app, getWindows, updater = null, logger = null, enabled = true, disabledReason = null,
    now = () => new Date(), forceDevConfig = false, releaseManifest = null, hashFile = sha256File,
    gateFetcher = null, graceHours = null, gateIntervalMinutes = GATE_RECHECK_MINUTES,
    prepareInstall = null }) {
    this.app = app;
    this.getWindows = getWindows;
    this.now = now;
    this._updater = updater;
    this.externalLogger = logger;
    this.packageJson = readPackageJson(app);
    this.publish = readPublishConfig(app);
    this.releaseManifest = typeof releaseManifest === 'function' ? releaseManifest : null;
    this.gateFetcher = typeof gateFetcher === 'function' ? gateFetcher : createCentralManifestFetcher({ app, publish: this.publish });
    this.graceHours = normalizeGraceHours(graceHours ?? process.env.SOMITI_OFFLINE_GRACE_HOURS);
    this.gateIntervalMs = Math.max(5, Number(gateIntervalMinutes) || GATE_RECHECK_MINUTES) * 60 * 1000;
    this.prepareInstall = typeof prepareInstall === 'function' ? prepareInstall : null;
    this.hashFile = hashFile;
    this.stateDir = path.join(app.getPath('userData'), 'updates');
    this.stateFile = path.join(this.stateDir, 'state.json');
    this.saved = this.readState();
    this.enabled = enabled !== false;
    this.autoUpdate = this.saved.auto_update !== false;
    this.forceDevConfig = forceDevConfig === true;
    this.downloadPromise = null;
    this.pendingWork = null;
    this.downloadedTask = null;
    this.progressToken = null;
    this.readyFile = null;
    this.busy = false;
    this.listenersAttached = false;
    this.checkTimer = null;
    this.firstCheckTimer = null;
    this.offlineRetryTimer = null;
    this.gateTimer = null;
    this.gatePromise = null;
    this.state = {
      status: this.enabled ? 'idle' : 'disabled',
      enabled: this.enabled,
      auto_update: this.autoUpdate,
      // electron-builder strips build.productName from the packaged
      // package.json, so the visible name must not fall back to app.getName()
      // (that is the lowercase package id used for the data folder).
      software_name: this.packageJson.build?.productName || this.packageJson.productName || 'Bus Malik Group',
      current_version: app.getVersion(),
      latest_version: null,
      minimum_required_version: null,
      release_notes: '',
      release_date: null,
      mandatory: false,
      blocking: false,
      update_available: false,
      checksum: null,
      download: null,
      gate: this.initialGate(disabledReason),
      history: Array.isArray(this.saved.history) ? this.saved.history.slice(0, 20) : [],
      error: this.enabled ? null : (disabledReason || 'Automatic updates are only active in the installed application.'),
      last_check: this.saved.last_check || null
    };
  }

  initialGate(disabledReason) {
    const current = this.app.getVersion();
    if (!this.enabled) {
      return {
        status: 'disabled',
        blocked: false,
        reason: 'disabled',
        current_version: current,
        latest_version: null,
        minimum_required_version: null,
        required_version: null,
        mandatory: false,
        release_notes: '',
        release_date: null,
        download_url: null,
        sha256: null,
        checked_at: null,
        checked_online: false,
        checking: false,
        offline: false,
        update_available: false,
        grace_expires_at: null,
        server_time: null,
        clock_suspect: false,
        error: disabledReason || 'Automatic updates are only active in the installed application.'
      };
    }
    // Until the central policy answers, the application is closed for business.
    return {
      status: 'checking',
      blocked: true,
      reason: 'checking',
      current_version: current,
      latest_version: null,
      minimum_required_version: null,
      required_version: null,
      mandatory: true,
      release_notes: '',
      release_date: null,
      download_url: null,
      sha256: null,
      checked_at: null,
      checked_online: false,
      checking: true,
      offline: false,
      update_available: false,
      grace_expires_at: null,
      server_time: null,
      clock_suspect: false,
      error: null
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
    this.state.gate = this.effectiveGateState();
    this.state.blocking = gateBlocked(this.state.gate);
    return {
      ...this.state,
      gate: { ...this.state.gate },
      history: this.state.history.map((entry) => ({ ...entry }))
    };
  }

  effectiveGateState() {
    return effectiveGate(this.state.gate, this.now());
  }

  isGateOpen() {
    if (!this.enabled) return true;
    const gate = this.effectiveGateState();
    return !gateBlocked(gate);
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

  recordHistory(action, details = {}) {
    const entry = {
      at: this.now().toISOString(),
      action,
      version: details.version || this.state.latest_version || null,
      from: this.state.current_version,
      mandatory: details.mandatory === true,
      ...(details.error ? { error: String(details.error) } : {})
    };
    const history = [entry, ...(Array.isArray(this.saved.history) ? this.saved.history : [])].slice(0, MAX_HISTORY);
    this.writeState({ history });
    this.setState({ history: history.slice(0, 20) });
  }

  start() {
    if (!this.enabled) return;
    const updater = this.updater;
    // The download is started only from the "Update now" action so that a
    // check never costs the association bandwidth on its own.
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
    // The min-version gate runs at every launch regardless of the optional
    // "check automatically" preference, because it decides whether this build
    // may open at all.
    this.checkGate({ reason: 'startup' }).catch(() => {});
    if (!this.gateTimer) {
      this.gateTimer = setInterval(() => this.checkGate({ reason: 'periodic' }).catch(() => {}), this.gateIntervalMs);
      this.gateTimer.unref?.();
    }
    if (this.autoUpdate) this.scheduleCheck(jittered(FIRST_CHECK_DELAY_MS));
  }

  scheduleCheck(delayMs) {
    if (this.firstCheckTimer || this.checkTimer) return;
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
    if (this.gateTimer) clearInterval(this.gateTimer);
    this.clearOfflineRetry();
    this.firstCheckTimer = null;
    this.checkTimer = null;
    this.gateTimer = null;
  }

  clearOfflineRetry() {
    if (this.offlineRetryTimer) clearTimeout(this.offlineRetryTimer);
    this.offlineRetryTimer = null;
  }

  scheduleOfflineRetry() {
    if (!this.autoUpdate || this.offlineRetryTimer) return;
    this.offlineRetryTimer = setTimeout(() => {
      this.offlineRetryTimer = null;
      this.check({ manual: false }).catch(() => {});
    }, jittered(OFFLINE_RETRY_MINUTES * 60 * 1000));
    this.offlineRetryTimer.unref?.();
  }

  setAutoUpdate(enabled) {
    this.autoUpdate = enabled !== false;
    this.writeState({ auto_update: this.autoUpdate });
    this.setState({ auto_update: this.autoUpdate });
    if (!this.enabled) return this.getState();
    if (this.autoUpdate) {
      this.scheduleCheck(jittered(FIRST_CHECK_DELAY_MS));
    } else {
      if (this.firstCheckTimer) clearTimeout(this.firstCheckTimer);
      if (this.checkTimer) clearInterval(this.checkTimer);
      this.firstCheckTimer = null;
      this.checkTimer = null;
      this.clearOfflineRetry();
    }
    return this.getState();
  }

  attachEvents() {
    if (this.listenersAttached) return;
    this.listenersAttached = true;
    const updater = this.updater;
    updater.on('checking-for-update', () => this.setState({ status: 'checking', error: null }));
    updater.on('update-available', (info) => {
      const work = this.onUpdateAvailable(info).catch((error) => this.onUpdateError(error));
      this.pendingWork = work;
      work.finally(() => {
        if (this.pendingWork === work) this.pendingWork = null;
      });
    });
    updater.on('update-not-available', (info) => {
      this.clearOfflineRetry();
      this.writeState({ snooze_until: null, skipped_version: null });
      this.setState({
        status: 'up_to_date',
        update_available: false,
        latest_version: (info && info.version) || this.state.current_version,
        release_notes: '',
        release_date: null,
        mandatory: false,
        blocking: false,
        checksum: null,
        download: null,
        error: null
      });
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
      const work = this.onDownloaded(info).catch((error) => this.onUpdateError(error));
      this.downloadedTask = work;
      work.finally(() => {
        if (this.downloadedTask === work) this.downloadedTask = null;
      });
    });
    updater.on('update-cancelled', () => this.setState({ status: 'idle', download: null, checksum: null }));
    updater.on('error', (error) => this.onUpdateError(error));
  }

  async onUpdateAvailable(info) {
    const version = info && info.version ? String(info.version) : null;
    if (!version || !isValidVersion(version) || compareVersions(version, this.state.current_version) <= 0) {
      this.log(`ignoring update ${version || '(unknown)'} because it is not newer than ${this.state.current_version}`);
      this.setState({
        status: 'up_to_date',
        update_available: false,
        latest_version: this.state.current_version,
        release_notes: '',
        release_date: null,
        mandatory: false,
        blocking: false,
        checksum: null,
        download: null,
        error: null
      });
      return;
    }

    let manifest = null;
    if (this.releaseManifest) {
      try {
        manifest = await this.releaseManifest(version);
      } catch (error) {
        this.log(`release manifest could not be read: ${error.message}`);
      }
    }

    const gate = this.state.gate || {};
    const alignedWithPolicy = gate.latest_version === version;
    const notes = manifest?.releaseNotes || (alignedWithPolicy ? gate.release_notes : '') || formatReleaseNotes(info.releaseNotes);
    const releaseDate = manifest?.releaseDate || (alignedWithPolicy ? gate.release_date : null) || info.releaseDate || null;
    const mandatory = manifest?.mandatory === true || (alignedWithPolicy && gate.mandatory === true);
    const expectedSha = manifest?.sha256 || (alignedWithPolicy ? gate.sha256 : null);
    const suppressed = !mandatory && (isSnoozed(this.saved.snooze_until, this.now()) || isSkipped(this.saved.skipped_version, version));
    const details = {
      latest_version: version,
      release_notes: notes,
      release_date: releaseDate,
      mandatory,
      // Only the central minimum-version policy closes the application; a
      // mandatory flag on an otherwise-allowed release is just a louder offer.
      blocking: false,
      checksum: expectedSha ? { algorithm: 'sha256', expected: expectedSha, actual: null, verified: false } : null,
      error: null
    };

    if (suppressed) {
      this.setState({ ...details, status: 'idle', update_available: false, download: null });
      return;
    }

    this.log(`update available ${this.state.current_version} -> ${version}${mandatory ? ' (mandatory)' : ''}${manifest ? ' with SHA256 manifest' : ''}`);
    this.recordHistory('available', { version, mandatory });
    // The installer is about 100 MB and association offices sit on slow, metered
    // links, so a check only announces the release. The download starts when the
    // customer chooses "Update now".
    this.setState({ ...details, status: mandatory ? 'mandatory' : 'optional', update_available: true, download: null });
  }

  async onDownloaded(info) {
    const version = (info && info.version) || this.state.latest_version;
    const file = (info && info.downloadedFile) || this.readyFile;
    const minimum = this.state.gate?.minimum_required_version;
    if (minimum && version && compareVersions(version, minimum) < 0) {
      if (file) {
        try { fs.rmSync(file, { force: true }); } catch { /* the temp file is retried next time */ }
      }
      this.onUpdateError(new Error(`The update server returned ${version}, but version ${minimum} or newer is required.`));
      return;
    }
    let checksum = this.state.checksum;
    if (checksum && checksum.expected) {
      if (!file) {
        this.onUpdateError(new Error('The downloaded update file is missing.'));
        return;
      }
      let actual;
      try {
        actual = await this.hashFile(file);
      } catch (error) {
        this.onUpdateError(new Error(`The downloaded update file could not be read: ${error.message}`));
        return;
      }
      if (!SHA256_PATTERN.test(actual) || actual.toLowerCase() !== checksum.expected.toLowerCase()) {
        this.log(`SHA256 verification failed for ${file}: expected ${checksum.expected}, got ${actual}`);
        // A corrupted download must never be offered again; remove it and make
        // the customer fetch a fresh copy.
        try { fs.rmSync(file, { force: true }); } catch { /* locked files are rejected again on the next verify */ }
        this.readyFile = null;
        this.onUpdateError(new Error('The downloaded update package failed SHA256 verification and was not installed.'));
        return;
      }
      checksum = { ...checksum, actual, verified: true };
      this.log(`SHA256 verified for ${file}`);
    } else {
      this.log('release manifest is unavailable; the installer was verified by electron-updater SHA512 and the GitHub release');
    }
    this.readyFile = file || null;
    this.progressToken = null;
    this.recordHistory('downloaded', { version });
    this.setState({
      status: 'ready',
      update_available: true,
      latest_version: version || this.state.latest_version,
      checksum,
      download: { received: this.state.download?.total || 0, total: this.state.download?.total || 0, percent: 100 },
      error: null
    });
  }

  onUpdateError(error) {
    const message = error instanceof Error ? error.message : String(error || 'Unknown update error');
    const offline = NETWORK_ERROR.test(message);
    this.writeState({ last_error: message, last_check: this.now().toISOString() });
    this.log(`update ${offline ? 'request failed while offline' : 'error'}: ${message}`);
    // An update that was already found stays offered; only the failed download
    // is dropped, otherwise the customer loses the notice they acted on.
    const keepOffer = Boolean(this.state.latest_version && this.state.latest_version !== this.state.current_version);
    this.setState({
      status: offline ? 'offline' : (keepOffer ? 'optional' : 'error'),
      error: offline ? null : message,
      update_available: offline ? false : keepOffer,
      blocking: false,
      checksum: null,
      download: null
    });
    if (offline) {
      this.scheduleOfflineRetry();
    } else {
      this.recordHistory('failed', { version: this.state.latest_version, error: message });
    }
  }

  async checkGate({ reason = 'periodic' } = {}) {
    if (!this.enabled) return this.getState();
    if (this.gatePromise) return this.gatePromise;
    const work = this.runGateCheck(reason).finally(() => {
      if (this.gatePromise === work) this.gatePromise = null;
    });
    this.gatePromise = work;
    return work;
  }

  async runGateCheck(reason) {
    const previous = this.state.gate || {};
    this.setState({
      gate: {
        ...previous,
        checking: true,
        status: previous.status === 'checking' ? 'checking' : previous.status,
        blocked: previous.status === 'checking' ? true : previous.blocked
      }
    });

    let result;
    try {
      result = await this.gateFetcher();
    } catch (error) {
      result = { manifest: null, error: error?.message || String(error), serverTime: null };
    }

    const evaluated = evaluateGate({
      currentVersion: this.state.current_version,
      result,
      cache: this.saved.gate_cache,
      now: this.now(),
      graceHours: this.graceHours
    });
    const gate = evaluated.gate;
    if (evaluated.cache) this.writeState({ gate_cache: evaluated.cache });

    const wasBlocked = gateBlocked(previous);
    if (gate.blocked && (!wasBlocked || previous.status !== gate.status || previous.reason !== gate.reason)) {
      this.recordHistory('gate_blocked', {
        version: gate.latest_version,
        mandatory: true,
        error: gate.reason
      });
      this.log(`update gate closed: installed ${gate.current_version}, required ${gate.minimum_required_version || '?'} (${gate.reason})`);
    }

    const pending = this.saved.pending_update_version;
    if (pending) {
      if (compareVersions(this.state.current_version, pending) >= 0) {
        this.writeState({ pending_update_version: null, pending_from_version: null });
        this.recordHistory('verified', { version: this.state.current_version });
        this.log(`update verified after restart: requested ${pending}, running ${this.state.current_version}`);
      } else {
        this.log(`update ${pending} did not take effect after restart; running ${this.state.current_version}`);
      }
    }

    const patch = {
      gate,
      minimum_required_version: gate.minimum_required_version || null,
      blocking: gateBlocked(gate)
    };

    if (gate.blocked) {
      Object.assign(patch, {
        mandatory: true,
        update_available: true,
        latest_version: gate.latest_version || this.state.latest_version,
        release_notes: gate.release_notes || this.state.release_notes,
        release_date: gate.release_date || this.state.release_date,
        status: ['downloading', 'ready', 'installing'].includes(this.state.status) ? this.state.status : 'mandatory'
      });
      if (gate.sha256 && this.state.checksum?.verified !== true) {
        patch.checksum = {
          algorithm: 'sha256',
          expected: gate.sha256,
          actual: this.state.checksum?.actual || null,
          verified: false
        };
      }
    } else if (wasBlocked && this.state.status === 'mandatory') {
      // The published policy no longer blocks this build; drop the gate-made
      // offer instead of leaving a stale mandatory notice behind.
      Object.assign(patch, {
        status: 'idle',
        update_available: false,
        mandatory: false,
        latest_version: this.state.current_version,
        release_date: null,
        release_notes: '',
        checksum: null
      });
    }

    this.setState(patch);
    return this.getState();
  }

  async check({ manual = false } = {}) {
    if (!this.enabled) return this.getState();
    if (this.busy) return this.getState();
    if (manual && (this.saved.snooze_until || this.saved.skipped_version)) {
      // An explicit "Check for updates" must never answer "up to date" while a
      // release is being hidden by an earlier reminder or skip.
      this.writeState({ snooze_until: null, skipped_version: null });
    }
    this.busy = true;
    try {
      await this.updater.checkForUpdates();
      if (this.pendingWork) await this.pendingWork;
      this.clearOfflineRetry();
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

  // Retry Download from the mandatory page: make sure electron-updater has
  // discovered the release first, then start (or restart) the transfer without
  // installing anything.
  async retryDownload() {
    if (!this.enabled) return this.getState();
    if (!this.updater.updateInfo) {
      await this.updater.checkForUpdates();
      if (this.pendingWork) await this.pendingWork;
    }
    if (!this.state.update_available && this.state.status !== 'ready') {
      throw new Error('The required version is not available from the update server yet. Try again in a few minutes.');
    }
    return this.startDownload();
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
      await this.updater.downloadUpdate(token);
      if (this.downloadedTask) await this.downloadedTask;
      if (token.isCanceled) return;
      // The update-downloaded event publishes "ready" only after the optional
      // SHA256 check; keeping this method quiet prevents installing an
      // unverified file.
    } catch (error) {
      if (!token.isCanceled) this.onUpdateError(error);
    } finally {
      this.progressToken = null;
    }
  }

  snooze() {
    if (this.state.mandatory) return this.getState();
    const until = new Date(this.now().getTime() + SNOOZE_HOURS * 60 * 60 * 1000).toISOString();
    this.writeState({ snooze_until: until });
    this.cancelDownload();
    this.setState({ status: 'idle', update_available: false, download: null });
    return this.getState();
  }

  skipVersion() {
    if (!this.state.latest_version || this.state.mandatory) return this.getState();
    this.writeState({ skipped_version: this.state.latest_version });
    this.cancelDownload();
    this.setState({ status: 'idle', update_available: false, download: null });
    return this.getState();
  }

  cancelDownload() {
    if (this.progressToken && !this.progressToken.isCanceled) this.progressToken.cancel();
  }

  // Checks the downloaded installer against the SHA256 published in the central
  // manifest. A mismatch deletes the file and leaves the mandatory gate closed.
  async verifyDownload() {
    const file = this.readyFile;
    if (!file) throw new Error('The update package has not finished downloading yet.');
    const expected = this.state.checksum?.expected;
    if (!SHA256_PATTERN.test(String(expected || ''))) {
      throw new Error('No SHA256 checksum was published for this update.');
    }
    let actual;
    try {
      actual = await this.hashFile(file);
    } catch (error) {
      throw new Error(`The downloaded update file could not be read: ${error.message}`);
    }
    if (!SHA256_PATTERN.test(actual) || actual.toLowerCase() !== expected.toLowerCase()) {
      this.log(`verify action rejected ${file}: expected ${expected}, got ${actual}`);
      try { fs.rmSync(file, { force: true }); } catch { /* a locked file is rejected again next time */ }
      this.readyFile = null;
      this.onUpdateError(new Error('The downloaded update package failed SHA256 verification and was deleted. Download it again.'));
      throw new Error('SHA256 verification failed. The corrupted download was removed; retry the download.');
    }
    this.setState({
      checksum: { ...this.state.checksum, actual, verified: true },
      error: null
    });
    this.log(`SHA256 verified on request for ${file}`);
    return this.getState();
  }

  // The full mandatory path: make sure an installable package exists, download
  // it, verify it, back up the database, then hand over to the NSIS updater.
  async applyMandatoryUpdate() {
    if (!this.enabled) throw new Error('Automatic updates are only active in the installed application.');
    if (this.state.status !== 'ready') {
      if (!this.updater.updateInfo) {
        await this.updater.checkForUpdates();
        if (this.pendingWork) await this.pendingWork;
      }
      if (this.state.status !== 'ready' && !this.state.update_available) {
        throw new Error('The required version is not available from the update server yet. Try again in a few minutes.');
      }
      await this.startDownload();
    }
    await this.installAndRestart();
    return this.getState();
  }

  async installAndRestart() {
    if (!this.enabled) throw new Error('Automatic updates are only active in the installed application.');
    if (this.state.status !== 'ready') await this.startDownload();
    if (this.state.status !== 'ready') throw new Error('The update has not finished downloading yet.');
    if (this.state.checksum?.expected && this.state.checksum.verified !== true) {
      await this.verifyDownload();
    }
    if (this.prepareInstall) {
      try {
        await this.prepareInstall({
          from: this.state.current_version,
          to: this.state.latest_version
        });
      } catch (error) {
        this.setState({ status: 'ready', error: `The database backup before the update failed: ${error.message}` });
        throw new Error(`The update was stopped because the database backup failed: ${error.message}`);
      }
    }
    this.setState({ status: 'installing', error: null });
    this.recordHistory('installing', { version: this.state.latest_version });
    this.log(`installing update ${this.state.current_version} -> ${this.state.latest_version}`);
    // The next launch reads this marker and re-checks the central policy only
    // after the version on disk has actually reached the requested release.
    this.writeState({
      pending_update_version: this.state.latest_version,
      pending_from_version: this.state.current_version
    });
    // Silent install into the recorded folder, then relaunch. The installer only
    // replaces program files: the SQLite database and settings live in the
    // per-user application data folder and are never touched.
    this.updater.quitAndInstall(true, true);
    return { restarting: true };
  }
}

module.exports = {
  UpdateController,
  SNOOZE_HOURS,
  CHECK_INTERVAL_HOURS,
  OFFLINE_RETRY_MINUTES,
  GATE_RECHECK_MINUTES,
  formatReleaseNotes,
  createReleaseManifestFetcher,
  releaseManifestUrl,
  validateReleaseManifest,
  sha256File
};
