const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { compareVersions, isValidVersion } = require('../src/updater/version.cjs');
const { isSnoozed, isSkipped } = require('../src/updater/policy.cjs');
const {
  UpdateController, formatReleaseNotes, SNOOZE_HOURS, validateReleaseManifest,
  releaseManifestUrl, createReleaseManifestFetcher, sha256File
} = require('../src/updater/controller.cjs');
const { writeManifest } = require('../scripts/update-manifest.cjs');

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
    this.downloadedFile = options.downloadedFile || null;
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
    const installer = this.downloadedFile || `C:/tmp/BusMalikGroup-Setup-${version}-x64.exe`;
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
    name: 'Bus Malik Group',
    getName: () => 'Bus Malik Group',
    getAppPath: () => directory,
    getVersion: () => version,
    getPath: (name) => (name === 'userData' ? directory : path.join(directory, name))
  };
}

function policy(version, minimum = '0.0.0', overrides = {}) {
  return {
    latest_version: version,
    minimum_required_version: minimum,
    download_url: `https://github.com/bonnamst289-cyber/busmalikgroup/releases/download/v${version}/BusMalikGroup-Setup-${version}-x64.exe`,
    sha256: 'c'.repeat(64),
    release_notes: '',
    release_date: null,
    mandatory: minimum === version,
    ...overrides
  };
}

function gateFetching(manifest, extra = {}) {
  return async () => ({ manifest, error: null, serverTime: '2026-11-01T10:00:00Z', ...extra });
}

// The updater tests are about the release offer, so the central policy always
// allows the build unless a test installs a stricter one.
function allowedGate(version) {
  return gateFetching(policy(version));
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
    now: options.now,
    releaseManifest: options.releaseManifest,
    hashFile: options.hashFile,
    gateFetcher: options.gateFetcher || allowedGate(options.version || '1.0.0')
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
        now: nextOptions.now,
        releaseManifest: nextOptions.releaseManifest,
        hashFile: nextOptions.hashFile,
        gateFetcher: nextOptions.gateFetcher || allowedGate(nextOptions.version || '1.0.0')
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

test('A new release is announced without using bandwidth until the customer asks', () =>
  withHarness({ available: RELEASE }, async ({ controller, updater, windows }) => {
    const events = [];
    windows.push({ isDestroyed: () => false, webContents: { send: (channel, snapshot) => events.push([channel, snapshot]) } });
    controller.start();
    const state = await controller.check({ manual: true });
    assert.equal(state.status, 'optional');
    assert.equal(state.update_available, true);
    assert.equal(state.latest_version, '1.1.0');
    assert.equal(state.release_notes, '- নতুন রিপোর্ট যোগ হয়েছে');
    assert.equal(state.release_date, '2026-10-31T00:00:00Z');
    assert.equal(state.download, null, 'a check never starts the 100 MB download');
    assert.deepEqual(updater.calls, ['check']);
    assert.ok(events.length >= 2, 'every state change is pushed to the window');
    assert.deepEqual(events.map(([channel]) => channel).filter((c) => c === 'updates:event').length, events.length);

    const ready = await controller.startDownload();
    assert.equal(ready.status, 'ready');
    assert.deepEqual(ready.download, { received: 100_000_000, total: 100_000_000, percent: 100 });
    assert.deepEqual(updater.calls, ['check', 'download']);
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
    assert.equal(state.status, 'optional');
  }));

test('Skipping a version keeps automatic checks quiet until a newer release appears', () =>
  withHarness({ available: RELEASE }, async ({ controller, updater }) => {
    controller.start();
    await controller.check({ manual: true });
    controller.skipVersion();
    assert.equal(controller.getState().status, 'idle');
    await controller.check({ manual: false });
    assert.equal(controller.getState().update_available, false, '1.1.0 stays hidden');
    updater.available = { ...RELEASE, version: '1.2.0', releaseNotes: 'Better' };
    await controller.check({ manual: false });
    assert.equal(controller.getState().update_available, true, '1.2.0 is offered again');
    assert.equal(controller.getState().latest_version, '1.2.0');
    assert.deepEqual(updater.calls, ['check', 'check', 'check'], 'a notice never downloads by itself');
  }));

test('An explicit check shows a release that Skip was hiding', () =>
  withHarness({ available: RELEASE }, async ({ controller }) => {
    controller.start();
    await controller.check({ manual: true });
    controller.skipVersion();
    const state = await controller.check({ manual: true });
    assert.equal(state.update_available, true, 'the button must never answer "up to date" while a release exists');
    assert.equal(state.status, 'optional');
  }));

test('Being up to date clears the dismissed notices', () =>
  withHarness({ notAvailable: true }, async ({ controller, directory }) => {
    controller.start();
    const state = await controller.check({ manual: true });
    assert.equal(state.status, 'up_to_date');
    assert.equal(state.update_available, false);
    assert.equal(state.latest_version, '1.0.0');
    const saved = JSON.parse(fs.readFileSync(path.join(directory, 'updates', 'state.json'), 'utf8'));
    assert.equal(saved.snooze_until, null, 'a stale reminder is cleared');
    assert.equal(saved.skipped_version, null, 'a stale skip is cleared');
  }));

test('No internet reads as offline and never blocks the software', () =>
  withHarness({}, async ({ controller, updater }) => {
    controller.start();
    await controller.checkGate({ reason: 'startup' });
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

test('A broken download is explained without losing a release that was found', () =>
  withHarness({ available: RELEASE, downloadThrows: 'sha512 mismatch' }, async ({ controller }) => {
    controller.start();
    const state = await controller.check({ manual: true });
    assert.equal(state.status, 'optional', 'the notice is shown as soon as it is found');
    await controller.startDownload();
    const after = controller.getState();
    assert.equal(after.status, 'optional', 'the notice survives a damaged download');
    assert.match(after.error, /sha512 mismatch/);
    assert.equal(after.update_available, true);
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

test('Release manifest metadata is validated before it is trusted', () => {
  const sha256 = 'a'.repeat(64);
  const valid = {
    version: '1.1.0',
    downloadUrl: 'https://github.com/bonnamst289-cyber/busmalikgroup/releases/download/v1.1.0/BusMalikGroup-Setup-1.1.0-x64.exe',
    sha256,
    releaseNotes: 'Fixed reports',
    releaseDate: '2026-11-01T00:00:00Z',
    mandatory: true,
    size: 123
  };
  const manifest = validateReleaseManifest(valid, '1.1.0');
  assert.equal(manifest.sha256, sha256);
  assert.equal(manifest.mandatory, true);
  assert.equal(validateReleaseManifest({ ...valid, version: '1.2.0' }, '1.1.0'), null, 'wrong version');
  assert.equal(validateReleaseManifest({ ...valid, sha256: 'abc' }, '1.1.0'), null, 'bad checksum');
  assert.equal(validateReleaseManifest({ ...valid, downloadUrl: 'http://example.com/x.exe' }, '1.1.0'), null, 'plain HTTP');
  assert.equal(validateReleaseManifest({ ...valid, downloadUrl: 'https://example.com/x.exe' }, '1.1.0'), null, 'untrusted host');
  assert.equal(releaseManifestUrl({ owner: 'o', repo: 'r' }, '1.1.0'), 'https://github.com/o/r/releases/download/v1.1.0/version.json');
  assert.equal(releaseManifestUrl({ owner: 'o', repo: 'r', vPrefixedTagName: false }, '1.1.0'), 'https://github.com/o/r/releases/download/1.1.0/version.json');
});

test('The release manifest fetcher reads version.json from the matching tag', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'somiti-manifest-fetch-'));
  try {
    fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({
      build: { publish: { provider: 'github', owner: 'bonnamst289-cyber', repo: 'busmalikgroup' } }
    }));
    let requested = null;
    const manifest = {
      version: '1.1.0',
      downloadUrl: 'https://github.com/bonnamst289-cyber/busmalikgroup/releases/download/v1.1.0/BusMalikGroup-Setup-1.1.0-x64.exe',
      sha256: 'b'.repeat(64),
      releaseNotes: 'Improvements',
      mandatory: false
    };
    const fetchManifest = createReleaseManifestFetcher({
      app: makeApp(directory, '1.0.0'),
      fetchImpl: async (url) => {
        requested = url;
        return { ok: true, text: async () => JSON.stringify(manifest) };
      }
    });
    const loaded = await fetchManifest('1.1.0');
    assert.equal(requested, 'https://github.com/bonnamst289-cyber/busmalikgroup/releases/download/v1.1.0/version.json');
    assert.equal(loaded.sha256, 'b'.repeat(64));
    const missing = createReleaseManifestFetcher({
      app: makeApp(directory, '1.0.0'),
      fetchImpl: async () => ({ ok: false, text: async () => 'missing' })
    });
    assert.equal(await missing('1.1.0'), null, 'a missing manifest falls back to electron-updater SHA512');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('The packaged build resolves per-version manifests from resources/app-update.yml', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'somiti-manifest-packaged-'));
  try {
    fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ name: 'bus-malik-somiti', version: '1.0.0' }));
    fs.mkdirSync(path.join(directory, 'resources'));
    fs.writeFileSync(path.join(directory, 'resources', 'app-update.yml'),
      'provider: github\nowner: bonnamst289-cyber\nrepo: busmalikgroup\n');
    let requested = null;
    const fetchManifest = createReleaseManifestFetcher({
      app: makeApp(directory, '1.0.0'),
      fetchImpl: async (url) => {
        requested = url;
        return { ok: false, text: async () => 'missing' };
      }
    });
    assert.equal(await fetchManifest('1.1.0'), null);
    assert.equal(requested,
      'https://github.com/bonnamst289-cyber/busmalikgroup/releases/download/v1.1.0/version.json');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('The release script writes version.json, notes and the installer SHA256', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'somiti-manifest-'));
  try {
    const installer = path.join(directory, 'BusMalikGroup-Setup-1.2.3-x64.exe');
    fs.writeFileSync(installer, 'installer bytes');
    fs.writeFileSync(path.join(directory, 'latest.yml'), 'version: 1.2.3\n');
    const result = await writeManifest({
      distDir: directory,
      version: '1.2.3',
      notes: 'Fixed the cash book',
      mandatory: true,
      now: new Date('2026-11-01T12:00:00Z')
    });
    const versionJson = JSON.parse(fs.readFileSync(path.join(directory, 'version.json'), 'utf8'));
    assert.equal(versionJson.version, '1.2.3');
    assert.equal(versionJson.sha256, result.sha256);
    assert.equal(versionJson.sha256, await sha256File(installer));
    assert.equal(versionJson.mandatory, true);
    assert.equal(versionJson.releaseNotes, 'Fixed the cash book');
    assert.equal(versionJson.downloadUrl, 'https://github.com/bonnamst289-cyber/busmalikgroup/releases/download/v1.2.3/BusMalikGroup-Setup-1.2.3-x64.exe');
    assert.equal(fs.readFileSync(path.join(directory, 'release-notes.md'), 'utf8'), 'Fixed the cash book\n');
    assert.equal(fs.readFileSync(path.join(directory, 'BusMalikGroup-Setup-1.2.3-x64.exe.sha256'), 'utf8'), `${versionJson.sha256}  BusMalikGroup-Setup-1.2.3-x64.exe\n`);
    assert.ok(validateReleaseManifest(versionJson, '1.2.3'));
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('A downloaded installer must match the release SHA256 before it becomes ready', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'somiti-sha-'));
  const installer = path.join(directory, 'setup.exe');
  fs.writeFileSync(installer, 'the exact installer download');
  const hash = await sha256File(installer);
  try {
    await withHarness({
      directory,
      available: RELEASE,
      downloadedFile: installer,
      releaseManifest: async (version) => ({
        version,
        downloadUrl: `https://github.com/bonnamst289-cyber/busmalikgroup/releases/download/v${version}/BusMalikGroup-Setup-${version}-x64.exe`,
        sha256: hash,
        releaseNotes: 'Verified release',
        mandatory: false
      })
    }, async ({ controller }) => {
      controller.start();
      const offered = await controller.check({ manual: true });
      assert.equal(offered.status, 'optional');
      const state = await controller.startDownload();
      assert.equal(state.status, 'ready');
      assert.equal(state.checksum.verified, true);
      assert.equal(state.checksum.actual, hash);
      assert.equal(state.history[0].action, 'downloaded');
    });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('A corrupted installer is rejected and never offered for installation', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'somiti-sha-bad-'));
  const installer = path.join(directory, 'setup.exe');
  fs.writeFileSync(installer, 'not the published installer');
  try {
    await withHarness({
      directory,
      available: RELEASE,
      downloadedFile: installer,
      releaseManifest: async (version) => ({
        version,
        downloadUrl: `https://github.com/bonnamst289-cyber/busmalikgroup/releases/download/v${version}/BusMalikGroup-Setup-${version}-x64.exe`,
        sha256: '0'.repeat(64),
        releaseNotes: 'Tampered release',
        mandatory: false
      })
    }, async ({ controller, updater }) => {
      controller.start();
      const offered = await controller.check({ manual: true });
      assert.equal(offered.status, 'optional');
      await controller.startDownload();
      const state = controller.getState();
      assert.equal(state.status, 'optional', 'the release stays visible so it can be retried');
      assert.match(state.error, /SHA256/);
      assert.equal(state.checksum, null);
      assert.equal(state.update_available, true);
      assert.ok(!updater.calls.includes('install'));
      assert.equal(state.history[0].action, 'failed');
    });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('Automatic update can be switched off and the choice survives a restart', () =>
  withHarness({}, async ({ controller, directory }) => {
    controller.start();
    const disabled = controller.setAutoUpdate(false);
    assert.equal(disabled.auto_update, false);
    const saved = JSON.parse(fs.readFileSync(path.join(directory, 'updates', 'state.json'), 'utf8'));
    assert.equal(saved.auto_update, false);
    const reopened = harness({ directory });
    assert.equal(reopened.controller.getState().auto_update, false, 'the settings panel starts where the customer left it');
    const enabled = reopened.controller.setAutoUpdate(true);
    assert.equal(enabled.auto_update, true);
    reopened.cleanup();
  }));

test('An older release is never offered as an update', () =>
  withHarness({ available: { ...RELEASE, version: '0.9.0' } }, async ({ controller, updater }) => {
    controller.start();
    const state = await controller.check({ manual: true });
    assert.equal(state.status, 'up_to_date');
    assert.equal(state.update_available, false);
    assert.deepEqual(updater.calls, ['check'], 'a downgrade is not downloaded');
  }));

test('A mandatory release ignores a previous reminder and stays blocking', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'somiti-mandatory-'));
  try {
    await withHarness({ directory, available: RELEASE }, async ({ controller }) => {
      controller.start();
      await controller.check({ manual: true });
      controller.snooze();
    });
    const hashFile = async () => 'c'.repeat(64);
    const mandatoryManifest = async (version) => ({
      version,
      downloadUrl: `https://github.com/bonnamst289-cyber/busmalikgroup/releases/download/v${version}/BusMalikGroup-Setup-${version}-x64.exe`,
      sha256: 'c'.repeat(64),
      releaseNotes: 'Security update',
      mandatory: true
    });
    const reopened = harness({
      directory,
      available: RELEASE,
      hashFile,
      releaseManifest: mandatoryManifest,
      gateFetcher: gateFetching(policy('1.1.0', '1.1.0'))
    });
    try {
      reopened.controller.start();
      await reopened.controller.checkGate({ reason: 'startup' });
      // Later must not hide a required release even if an older build asked.
      const snoozeBefore = reopened.controller.saved.snooze_until;
      reopened.controller.snooze();
      assert.equal(reopened.controller.saved.snooze_until, snoozeBefore, 'a required release cannot be snoozed');
      const state = await reopened.controller.check({ manual: false });
      assert.equal(state.mandatory, true, 'a required release is not hidden by the reminder');
      assert.equal(state.blocking, true);
      assert.equal(state.update_available, true);
      assert.deepEqual(reopened.updater.calls, ['check'], 'a required release is still not downloaded without consent');
      const ready = await reopened.controller.startDownload();
      assert.equal(ready.checksum.verified, true);
      assert.deepEqual(reopened.updater.calls, ['check', 'download']);
    } finally {
      reopened.cleanup();
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
