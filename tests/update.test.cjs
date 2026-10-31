const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { compareVersions, isValidVersion } = require('../src/updater/version.cjs');
const { isSnoozed, isSkipped } = require('../src/updater/policy.cjs');
const { UpdateController, formatReleaseNotes, SNOOZE_HOURS } = require('../src/updater/controller.cjs');

const RELEASE = { version: '1.1.0', releaseDate: '2026-10-31T00:00:00Z', releaseNotes: '- নতুন রিপোর্ট যোগ হয়েছে' };

// Stands in for electron-updater's autoUpdater so the whole state machine runs
// without a network, an installed application or a real Setup.exe.
class FakeUpdater {
  constructor(options = {}) {
    this.handlers = {};
    this.calls = [];
    this.autoDownload = true;
    this.autoInstallOnAppQuit = false;
    this.allowDowngrade = true;
    this.logger = null;
    this.available = options.available || null;
    this.notAvailable = options.notAvailable === true;
    this.checkThrows = options.checkThrows || null;
    this.downloadThrows = options.downloadThrows || null;
    this.slowDownload = options.slowDownload === true;
  }

  on(event, handler) {
    (this.handlers[event] ||= []).push(handler);
  }

  fire(event, ...args) {
    for (const handler of this.handlers[event] || []) handler(...args);
  }

  async checkForUpdates() {
    this.calls.push('check');
    this.fire('checking-for-update');
    if (this.checkThrows) throw new Error(this.checkThrows);
    if (this.available) this.fire('update-available', this.available);
    else if (this.notAvailable) this.fire('update-not-available', { version: '1.0.0' });
    return { updateInfo: this.available || { version: '1.0.0' } };
  }

  async downloadUpdate(token) {
    this.calls.push('download');
    this.token = token;
    if (this.slowDownload) await new Promise((resolve) => setImmediate(resolve));
    if (this.downloadThrows) throw new Error(this.downloadThrows);
    if (token && token.isCanceled) return [];
    const version = (this.available && this.available.version) || '1.1.0';
    const installer = `C:/tmp/BusMalikSomiti-Setup-${version}-x64.exe`;
    this.fire('download-progress', { percent: 24.7, transferred: 24_700_000, total: 100_000_000, bytesPerSecond: 1_000_000 });
    this.fire('update-downloaded', { ...(this.available || RELEASE), version, downloadedFile: installer });
    return [installer];
  }

  quitAndInstall(isSilent, isForceRunAfter) {
    this.calls.push('install');
    this.installArgs = [isSilent, isForceRunAfter];
  }
}

function makeApp(directory, version) {
  return {
    getVersion: () => version,
    getPath: (name) => (name === 'userData' ? directory : path.join(directory, name))
  };
}

function harness(options = {}) {
  const ownsDirectory = !options.directory;
  const directory = options.directory || fs.mkdtempSync(path.join(os.tmpdir(), 'somiti-updates-'));
  const updater = options.updater || new FakeUpdater(options);
  const windows = [];
  const controller = new UpdateController({
    app: makeApp(directory, options.version || '1.0.0'),
    getWindows: () => windows,
    updater,
    logger: () => {},
    enabled: options.enabled,
    disabledReason: options.disabledReason,
    now: options.now
  });
  return {
    controller,
    updater,
    windows,
    directory,
    reopen: (nextOptions = {}) => {
      const reopened = new FakeUpdater(nextOptions);
      const next = new UpdateController({
        app: makeApp(directory, nextOptions.version || '1.0.0'),
        getWindows: () => [],
        updater: reopened,
        logger: () => {},
        enabled: true,
        now: nextOptions.now
      });
      return { controller: next, updater: reopened };
    },
    cleanup: () => {
      controller.stop();
      if (ownsDirectory) fs.rmSync(directory, { recursive: true, force: true });
    }
  };
}

async function withHarness(options, run) {
  const context = harness(options);
  try {
    return await run(context);
  } finally {
    context.cleanup();
  }
}

test('Version comparison follows semantic version ordering', () => {
  assert.equal(compareVersions('1.0.0', '1.0.1'), -1);
  assert.equal(compareVersions('1.1.0', '1.0.9'), 1);
  assert.equal(compareVersions('1.0.0', '1.0.0'), 0);
  assert.equal(compareVersions('1.0.0-rc.2', '1.0.0-rc.10'), -1);
  assert.equal(compareVersions('1.0.0-rc.1', '1.0.0'), -1);
  assert.equal(isValidVersion('1.0.0'), true);
  assert.equal(isValidVersion('1.0'), false);
  assert.throws(() => compareVersions('nope', '1.0.0'), /Invalid version/);
});

test('Snooze and skip hide only what the customer dismissed', () => {
  const now = new Date('2026-10-31T10:00:00Z');
  assert.equal(isSnoozed(null, now), false);
  assert.equal(isSnoozed(new Date(now.getTime() + 60_000).toISOString(), now), true);
  assert.equal(isSnoozed(new Date(now.getTime() - 60_000).toISOString(), now), false);
  assert.equal(isSkipped('1.1.0', '1.1.0'), true);
  assert.equal(isSkipped('1.1.0', '1.0.9'), true);
  assert.equal(isSkipped('1.1.0', '1.2.0'), false);
});

test('A GitHub release body becomes readable in-application notes', () => {
  assert.equal(formatReleaseNotes('  - Fixed the cash book  '), '- Fixed the cash book');
  assert.equal(formatReleaseNotes([{ version: '1.1.0', note: 'Noto' }, 'plain']), '1.1.0 — Noto\nplain');
  assert.equal(formatReleaseNotes(null), '');
});

test('A disabled installation explains itself and never contacts GitHub', () =>
  withHarness({ enabled: false, disabledReason: 'The portable version cannot update itself.' }, async ({ controller, updater }) => {
    controller.start();
    let state = controller.getState();
    assert.equal(state.status, 'disabled');
    assert.equal(state.enabled, false);
    assert.match(state.error, /portable/i);
    state = await controller.check({ manual: true });
    assert.equal(state.status, 'disabled');
    assert.deepEqual(updater.calls, [], 'no update request is made');
  }));

test('Start configures electron-updater for controlled downloads and quit-time install', () =>
  withHarness({}, ({ controller, updater }) => {
    controller.start();
    assert.equal(updater.autoDownload, false, 'a skipped release must not waste bandwidth');
    assert.equal(updater.autoInstallOnAppQuit, true, 'Later installs on the next close');
    assert.equal(updater.allowDowngrade, false, 'a released version is never replaced by an older one');
    assert.equal(typeof updater.logger.info, 'function', 'the update log is written for support');
  }));

test('A new release is found, downloaded in the background and offered with Install Now', () =>
  withHarness({ available: RELEASE }, async ({ controller, updater, windows }) => {
    const events = [];
    windows.push({ isDestroyed: () => false, webContents: { send: (channel, snapshot) => events.push([channel, snapshot]) } });
    controller.start();
    const state = await controller.check({ manual: true });
    assert.equal(state.status, 'ready');
    assert.equal(state.update_available, true);
    assert.equal(state.latest_version, '1.1.0');
    assert.equal(state.release_notes, '- নতুন রিপোর্ট যোগ হয়েছে');
    assert.equal(state.release_date, '2026-10-31T00:00:00Z');
    assert.deepEqual(state.download, { received: 100_000_000, total: 100_000_000, percent: 100 });
    assert.deepEqual(updater.calls, ['check', 'download']);
    assert.ok(events.length >= 3, 'every state change is pushed to the window');
    assert.deepEqual(events.map(([channel]) => channel).filter((c) => c === 'updates:event').length, events.length);
    assert.equal(events.at(-1)[1].status, 'ready');
  }));

test('Progress percentages reach the banner while accounting stays usable', () =>
  withHarness({ available: RELEASE, slowDownload: true }, async ({ controller, windows }) => {
    const snapshots = [];
    windows.push({ isDestroyed: () => false, webContents: { send: (_channel, snapshot) => snapshots.push(snapshot) } });
    controller.start();
    controller.setState({ status: 'optional', update_available: true, latest_version: '1.1.0' });
    await controller.startDownload();
    const downloading = snapshots.filter((snapshot) => snapshot.status === 'downloading').at(-1);
    assert.ok(downloading, 'the in-progress state is published to the window');
    assert.equal(downloading.download.percent, 25);
    assert.equal(downloading.download.received, 24_700_000);
    assert.equal(downloading.download.total, 100_000_000);
    assert.equal(snapshots.at(-1).status, 'ready');
  }));

test('Install Now runs the silent installer and restarts the application', () =>
  withHarness({ available: RELEASE }, async ({ controller, updater }) => {
    controller.start();
    await controller.check({ manual: true });
    const result = await controller.installAndRestart();
    assert.deepEqual(result, { restarting: true });
    assert.deepEqual(updater.installArgs, [true, true], 'no wizard, relaunch afterwards');
    assert.ok(updater.calls.includes('install'));
    assert.equal(controller.getState().status, 'installing');
  }));

test('Install Now waits for an unfinished download instead of failing', () =>
  withHarness({ available: RELEASE, slowDownload: true }, async ({ controller, updater }) => {
    controller.start();
    await controller.check({ manual: true });
    controller.setState({ status: 'downloading', update_available: true, latest_version: '1.1.0', download: { received: 1, total: 100, percent: 1 } });
    await controller.installAndRestart();
    assert.ok(updater.calls.includes('install'), 'the install happens once the download completes');
  }));

test('Later hides the release for a day and a restart does not nag again', () =>
  withHarness({ available: RELEASE }, async ({ controller, updater, directory }) => {
    controller.start();
    await controller.check({ manual: true });
    const later = controller.snooze();
    assert.equal(later.status, 'idle');
    assert.equal(later.update_available, false);
    const saved = JSON.parse(fs.readFileSync(path.join(directory, 'updates', 'state.json'), 'utf8'));
    assert.ok(saved.snooze_until, 'the snooze survives a restart');
    const hours = (new Date(saved.snooze_until) - new Date()) / 3_600_000;
    assert.ok(Math.abs(hours - SNOOZE_HOURS) < 1, 'the reminder is about a day away');

    const reopened = harness({ directory, available: RELEASE });
    reopened.controller.start();
    const state = await reopened.controller.check({ manual: false });
    assert.equal(state.status, 'idle', 'the snoozed release stays quiet after a restart');
    assert.equal(state.latest_version, '1.1.0', 'it is still visible in the settings panel');
    assert.deepEqual(reopened.updater.calls, ['check'], 'a snoozed release is never downloaded');
    reopened.cleanup();
  }));

test('An explicit check clears the reminder', () =>
  withHarness({ available: RELEASE }, async ({ controller }) => {
    controller.start();
    await controller.check({ manual: true });
    controller.snooze();
    const state = await controller.check({ manual: true });
    assert.equal(state.update_available, true, 'when the customer asks, the release is shown again');
    assert.equal(state.status, 'ready');
  }));

test('Skipping a version stays hidden until a newer release appears', () =>
  withHarness({ available: RELEASE }, async ({ controller, updater }) => {
    controller.start();
    await controller.check({ manual: true });
    controller.skipVersion();
    assert.equal(controller.getState().status, 'idle');
    await controller.check({ manual: true });
    assert.equal(controller.getState().update_available, false, '1.1.0 stays hidden');
    updater.available = { ...RELEASE, version: '1.2.0', releaseNotes: 'Better' };
    await controller.check({ manual: true });
    assert.equal(controller.getState().update_available, true, '1.2.0 is offered again');
    assert.equal(controller.getState().latest_version, '1.2.0');
    assert.deepEqual(updater.calls, ['check', 'download', 'check', 'check', 'download'], 'the skipped release is never downloaded');
  }));

test('Being up to date clears the dismissed notices', () =>
  withHarness({ notAvailable: true }, async ({ controller, directory }) => {
    controller.start();
    const state = await controller.check({ manual: true });
    assert.equal(state.status, 'up_to_date');
    assert.equal(state.update_available, false);
    assert.equal(state.latest_version, null);
    const saved = JSON.parse(fs.readFileSync(path.join(directory, 'updates', 'state.json'), 'utf8'));
    assert.equal(saved.snooze_until, null, 'a stale reminder is cleared');
    assert.equal(saved.skipped_version, null, 'a stale skip is cleared');
  }));

test('No internet reads as offline and never blocks the software', () =>
  withHarness({}, async ({ controller, updater }) => {
    controller.start();
    for (const message of [
      'getaddrinfo ENOTFOUND api.github.com',
      'net::ERR_INTERNET_DISCONNECTED',
      'connect ETIMEDOUT 140.82.112.22:443',
      'Request rate limit exceeded'
    ]) {
      updater.fire('error', new Error(message));
      const state = controller.getState();
      assert.equal(state.status, 'offline', `${message} must read as offline`);
      assert.equal(state.error, null);
      assert.equal(state.enabled, true);
      assert.equal(state.blocking, false, 'the gate stays hidden so bookkeeping continues');
    }
  }));

test('A broken update is explained without losing a release that was found', () =>
  withHarness({ available: RELEASE, downloadThrows: 'sha512 mismatch' }, async ({ controller }) => {
    controller.start();
    const state = await controller.check({ manual: true });
    assert.equal(state.status, 'optional', 'the notice survives a damaged download');
    assert.match(state.error, /sha512 mismatch/);
    assert.equal(state.update_available, true);
  }));

test('A failed release lookup keeps the customer out of a dead end', () =>
  withHarness({ checkThrows: 'Cannot find latest.yml of digest' }, async ({ controller }) => {
    controller.start();
    const state = await controller.check({ manual: true });
    assert.equal(state.status, 'error');
    assert.match(state.error, /latest\.yml/);
    const retry = await controller.check({ manual: true });
    assert.notEqual(retry.status, 'checking', 'the button is usable again after a failure');
  }));

test('A cancelled download leaves the notice ready to retry', () =>
  withHarness({ available: RELEASE, slowDownload: true }, async ({ controller }) => {
    controller.start();
    await controller.check({ manual: true });
    const later = controller.snooze();
    assert.equal(later.status, 'idle');
    assert.equal(later.download, null);
  }));

test('The last check time is remembered across restarts', () =>
  withHarness({ available: RELEASE }, async ({ controller, directory }) => {
    controller.start();
    await controller.check({ manual: true });
    const reopened = harness({ directory });
    assert.ok(reopened.controller.getState().last_check, 'the settings panel can show when it last looked');
    reopened.cleanup();
  }));
