const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  centralManifestUrl, createCentralManifestFetcher, readManifestPolicy, evaluateGate,
  effectiveGate, gateBlocked, normalizeGraceHours, DEFAULT_OUTAGE_GRACE_HOURS
} = require('../src/updater/gate.cjs');
const { UpdateController, sha256File } = require('../src/updater/controller.cjs');
const { writeManifest } = require('../scripts/update-manifest.cjs');

const INSTALLER = 'https://github.com/bonnamst289-cyber/busmalikgroup/releases/download/v1.1.0/BusMalikGroup-Setup-1.1.0-x64.exe';

function policy(latest = '1.1.0', minimum = latest, overrides = {}) {
  return {
    latest_version: latest,
    minimum_required_version: minimum,
    download_url: INSTALLER,
    sha256: 'a'.repeat(64),
    release_notes: 'Security update',
    release_date: '2026-11-01T00:00:00Z',
    mandatory: minimum === latest,
    ...overrides
  };
}

function cacheFor(manifest, patch = {}) {
  return {
    manifest,
    verified_version: '1.0.0',
    verified_at: '2026-11-01T10:00:00Z',
    verified_at_server: '2026-11-01T10:00:00Z',
    highest_server_time: '2026-11-01T10:00:00Z',
    grace_hours: 12,
    ...patch
  };
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

class FakeUpdater {
  constructor({ available = null, downloadedFile = null } = {}) {
    this.handlers = {};
    this.calls = [];
    this.updateInfo = null;
    this.available = available;
    this.downloadedFile = downloadedFile;
    this.autoDownload = true;
    this.autoInstallOnAppQuit = false;
    this.allowDowngrade = true;
    this.logger = null;
  }

  on(event, handler) {
    (this.handlers[event] ||= []).push(handler);
  }

  fire(event, ...args) {
    for (const handler of this.handlers[event] || []) handler(...args);
  }

  async checkForUpdates() {
    this.calls.push('check');
    this.updateInfo = this.available;
    if (this.available) this.fire('update-available', this.available);
    else this.fire('update-not-available', { version: '1.0.0' });
    return { updateInfo: this.available };
  }

  async downloadUpdate() {
    this.calls.push('download');
    const version = (this.available && this.available.version) || '1.1.0';
    this.fire('download-progress', { percent: 50, transferred: 50, total: 100 });
    this.fire('update-downloaded', {
      ...(this.available || {}),
      version,
      downloadedFile: this.downloadedFile
    });
    return [this.downloadedFile];
  }

  quitAndInstall(isSilent, isForceRunAfter) {
    this.calls.push('install');
    this.installArgs = [isSilent, isForceRunAfter];
  }
}

function controllerHarness({ version = '1.0.0', gateFetcher, updater, downloadedFile, prepareInstall } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'somiti-gate-'));
  const fake = updater || new FakeUpdater({ available: { version: '1.1.0' }, downloadedFile });
  const controller = new UpdateController({
    app: makeApp(directory, version),
    getWindows: () => [],
    updater: fake,
    logger: () => {},
    enabled: true,
    now: () => new Date('2026-11-01T10:00:00Z'),
    gateFetcher: gateFetcher || (async () => ({ manifest: policy(version, '0.0.0'), error: null, serverTime: null })),
    graceHours: 12,
    prepareInstall
  });
  return {
    controller,
    updater: fake,
    directory,
    cleanup: () => {
      controller.stop();
      fs.rmSync(directory, { recursive: true, force: true });
    }
  };
}

test('The central policy lives at the latest-release download address', () => {
  assert.equal(
    centralManifestUrl({ owner: 'o', repo: 'r' }),
    'https://github.com/o/r/releases/latest/download/version.json'
  );
  assert.equal(centralManifestUrl({}), null);
});

test('The central policy accepts the documented snake_case fields', () => {
  const manifest = readManifestPolicy(policy('1.2.0', '1.1.0'));
  assert.equal(manifest.latest_version, '1.2.0');
  assert.equal(manifest.minimum_required_version, '1.1.0');
  assert.equal(manifest.download_url, INSTALLER);
  assert.equal(manifest.sha256, 'a'.repeat(64));
  assert.equal(manifest.release_notes, 'Security update');
  assert.equal(manifest.mandatory, false);

  const legacy = readManifestPolicy({
    version: '1.2.0',
    minimumVersion: '1.0.0',
    downloadUrl: INSTALLER,
    sha256: 'b'.repeat(64),
    releaseNotes: 'Old shape',
    mandatory: true
  });
  assert.equal(legacy.latest_version, '1.2.0');
  assert.equal(legacy.minimum_required_version, '1.0.0');

  assert.equal(readManifestPolicy(null), null);
  assert.equal(readManifestPolicy({ ...policy(), latest_version: '1' }), null, 'invalid semver');
  assert.equal(readManifestPolicy(policy('1.1.0', '1.2.0')), null, 'minimum cannot be newer');
  assert.equal(readManifestPolicy({ ...policy(), sha256: 'abc' }), null, 'bad checksum');
  assert.equal(readManifestPolicy({ ...policy(), download_url: 'http://github.com/x.exe' }), null, 'plain HTTP');
  assert.equal(readManifestPolicy({ ...policy(), download_url: 'https://example.com/x.exe' }), null, 'untrusted host');
});

test('The fetcher reads the latest release with cache bypass and server time', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'somiti-central-fetch-'));
  try {
    fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({
      build: { publish: { provider: 'github', owner: 'bonnamst289-cyber', repo: 'busmalikgroup' } }
    }));
    let request = null;
    const fetchManifest = createCentralManifestFetcher({
      app: makeApp(directory, '1.0.0'),
      fetchImpl: async (url, options) => {
        request = { url, options };
        return {
          ok: true,
          headers: { get: (name) => (name.toLowerCase() === 'date' ? 'Sun, 01 Nov 2026 10:00:00 GMT' : null) },
          text: async () => JSON.stringify(policy('1.1.0', '1.1.0'))
        };
      }
    });
    const result = await fetchManifest();
    assert.equal(request.url, 'https://github.com/bonnamst289-cyber/busmalikgroup/releases/latest/download/version.json');
    assert.equal(request.options.headers['Cache-Control'], 'no-cache');
    assert.equal(request.options.redirect, 'follow');
    assert.equal(result.manifest.minimum_required_version, '1.1.0');
    assert.equal(result.serverTime, '2026-11-01T10:00:00.000Z');

    const missing = createCentralManifestFetcher({
      app: makeApp(directory, '1.0.0'),
      fetchImpl: async () => ({ ok: false, status: 404, headers: { get: () => null }, text: async () => 'missing' })
    });
    const failure = await missing();
    assert.equal(failure.manifest, null);
    assert.match(failure.error, /policy/i);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('The packaged build resolves its feed from resources/app-update.yml', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'somiti-feed-'));
  try {
    // electron-builder strips `build` from the packaged package.json.
    fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ name: 'bus-malik-somiti', version: '1.0.0' }));
    fs.mkdirSync(path.join(directory, 'resources'));
    fs.writeFileSync(path.join(directory, 'resources', 'app-update.yml'),
      'provider: github\nowner: bonnamst289-cyber\nrepo: busmalikgroup\n');
    let requested = null;
    const fetchManifest = createCentralManifestFetcher({
      app: makeApp(directory, '1.0.0'),
      fetchImpl: async (url) => {
        requested = url;
        return { ok: false, status: 404, headers: { get: () => null }, text: async () => '' };
      }
    });
    const result = await fetchManifest();
    assert.equal(requested,
      'https://github.com/bonnamst289-cyber/busmalikgroup/releases/latest/download/version.json');
    assert.deepEqual(result.selfPolicy, { latest_version: '1.0.0', minimum_required_version: '1.0.0' });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('An explicit publish config wins over the packaged feed file', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'somiti-feed-explicit-'));
  try {
    fs.mkdirSync(path.join(directory, 'resources'));
    fs.writeFileSync(path.join(directory, 'resources', 'app-update.yml'),
      'provider: github\nowner: wrong-owner\nrepo: wrong-repo\n');
    let requested = null;
    const fetchManifest = createCentralManifestFetcher({
      app: makeApp(directory, '1.0.0'),
      publish: { provider: 'github', owner: 'bonnamst289-cyber', repo: 'busmalikgroup' },
      fetchImpl: async (url) => {
        requested = url;
        return { ok: false, status: 404, headers: { get: () => null }, text: async () => '' };
      }
    });
    await fetchManifest();
    assert.equal(requested,
      'https://github.com/bonnamst289-cyber/busmalikgroup/releases/latest/download/version.json');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('A build below the minimum version is blocked with the required version', () => {
  const result = { manifest: readManifestPolicy(policy('1.2.0', '1.1.0')), error: null, serverTime: '2026-11-01T10:00:00Z' };
  const { gate, cache } = evaluateGate({
    currentVersion: '1.0.1', result, cache: null, now: new Date('2026-11-01T10:00:00Z')
  });
  assert.equal(gate.status, 'update_required');
  assert.equal(gate.blocked, true);
  assert.equal(gate.reason, 'below_minimum');
  assert.equal(gate.current_version, '1.0.1');
  assert.equal(gate.minimum_required_version, '1.1.0');
  assert.equal(gate.latest_version, '1.2.0');
  assert.equal(gate.download_url, INSTALLER);
  assert.equal(gate.mandatory, true);
  assert.equal(gateBlocked(gate), true);
  assert.equal(cache.verified_version, '1.0.1');
});

test('A build at or above the minimum is allowed and still sees newer releases', () => {
  const atMinimum = evaluateGate({
    currentVersion: '1.1.0',
    result: { manifest: readManifestPolicy(policy('1.1.0', '1.1.0')) },
    cache: null,
    now: new Date('2026-11-01T10:00:00Z')
  }).gate;
  assert.equal(atMinimum.status, 'current');
  assert.equal(atMinimum.blocked, false);
  assert.equal(atMinimum.update_available, false);

  const newerOptional = evaluateGate({
    currentVersion: '1.1.0',
    result: { manifest: readManifestPolicy(policy('1.2.0', '1.1.0')) },
    cache: null,
    now: new Date('2026-11-01T10:00:00Z')
  }).gate;
  assert.equal(newerOptional.status, 'current');
  assert.equal(newerOptional.blocked, false);
  assert.equal(newerOptional.update_available, true);
});

test('An offline launch with no verified policy stays locked', () => {
  const { gate } = evaluateGate({
    currentVersion: '1.0.0',
    result: { manifest: null, error: 'getaddrinfo ENOTFOUND github.com', serverTime: null },
    cache: null,
    now: new Date('2026-11-01T10:00:00Z')
  });
  assert.equal(gate.status, 'connection_error');
  assert.equal(gate.reason, 'never_verified');
  assert.equal(gate.blocked, true);
  assert.match(gate.error, /ENOTFOUND/);
});

test('An unpublished policy lets the exact installed build start offline', () => {
  const { gate, cache } = evaluateGate({
    currentVersion: '1.0.0',
    result: {
      manifest: null,
      error: 'No update policy has been published yet.',
      serverTime: null,
      selfPolicy: { latest_version: '1.0.0', minimum_required_version: '1.0.0' }
    },
    cache: null,
    now: new Date('2026-11-01T10:00:00Z')
  });
  assert.equal(gate.status, 'current');
  assert.equal(gate.reason, 'local_policy');
  assert.equal(gate.blocked, false);
  assert.equal(gate.offline, true);
  assert.equal(gate.checked_online, false);
  assert.equal(gate.update_available, false);
  assert.equal(cache, null, 'a local baseline is never stored as a verified policy');
});

test('A self-policy cannot authorize a build newer than the installation', () => {
  const { gate } = evaluateGate({
    currentVersion: '1.0.0',
    result: {
      manifest: null, error: 'offline',
      selfPolicy: { latest_version: '1.0.1', minimum_required_version: '1.0.1' }
    },
    cache: null,
    now: new Date('2026-11-01T10:00:00Z')
  });
  assert.equal(gate.blocked, true);
  assert.equal(gate.reason, 'never_verified');
});

test('A verified policy still wins over the local baseline', () => {
  const manifest = readManifestPolicy(policy('1.1.0', '1.1.0'));
  const { gate } = evaluateGate({
    currentVersion: '1.0.0',
    result: {
      manifest: null, error: 'offline',
      selfPolicy: { latest_version: '1.0.0', minimum_required_version: '1.0.0' }
    },
    cache: cacheFor(manifest, { verified_version: '1.0.0', verified_at: '2026-11-01T09:59:00Z' }),
    now: new Date('2026-11-01T10:00:00Z')
  });
  assert.equal(gate.status, 'update_required');
  assert.equal(gate.reason, 'known_obsolete');
  assert.equal(gate.blocked, true);
});

test('A version already known to be obsolete never regains access offline', () => {
  const manifest = readManifestPolicy(policy('1.1.0', '1.1.0'));
  const { gate, cache } = evaluateGate({
    currentVersion: '1.0.0',
    result: { manifest: null, error: 'offline' },
    cache: cacheFor(manifest, { verified_version: '1.0.0', verified_at: '2026-11-01T09:59:00Z' }),
    now: new Date('2026-11-01T10:00:00Z')
  });
  assert.equal(gate.status, 'update_required');
  assert.equal(gate.reason, 'known_obsolete');
  assert.equal(gate.blocked, true);
  assert.equal(gate.offline, true);
  assert.equal(gate.minimum_required_version, '1.1.0');
  assert.equal(cache.verified_version, '1.0.0', 'the cache is not refreshed by a failure');
});

test('A verified current build may work offline only inside the grace window', () => {
  const manifest = readManifestPolicy(policy('1.1.0', '1.1.0'));
  const cache = cacheFor(manifest, { verified_version: '1.1.0', verified_at: '2026-11-01T09:00:00Z' });
  const inside = evaluateGate({
    currentVersion: '1.1.0',
    result: { manifest: null, error: 'offline' },
    cache,
    now: new Date('2026-11-01T10:00:00Z'),
    graceHours: 12
  }).gate;
  assert.equal(inside.status, 'current');
  assert.equal(inside.blocked, false);
  assert.equal(inside.offline, true);
  assert.equal(inside.grace_expires_at, '2026-11-01T21:00:00.000Z');

  const expired = evaluateGate({
    currentVersion: '1.1.0',
    result: { manifest: null, error: 'offline' },
    cache,
    now: new Date('2026-11-01T22:00:00Z'),
    graceHours: 12
  }).gate;
  assert.equal(expired.status, 'connection_error');
  assert.equal(expired.reason, 'grace_expired');
  assert.equal(expired.blocked, true);
});

test('A newly installed build needs its own online verification', () => {
  const manifest = readManifestPolicy(policy('1.1.0', '1.0.0'));
  const { gate } = evaluateGate({
    currentVersion: '1.1.0',
    result: { manifest: null, error: 'offline' },
    cache: cacheFor(manifest, { verified_version: '1.0.0' }),
    now: new Date('2026-11-01T10:00:00Z')
  });
  assert.equal(gate.status, 'connection_error');
  assert.equal(gate.reason, 'build_unverified');
  assert.equal(gate.blocked, true);
});

test('A clock rollback cannot extend the offline window', () => {
  const manifest = readManifestPolicy(policy('1.1.0', '1.1.0'));
  const { gate } = evaluateGate({
    currentVersion: '1.1.0',
    result: { manifest: null, error: 'offline' },
    cache: cacheFor(manifest, { verified_version: '1.1.0', verified_at: '2026-11-01T10:00:00Z' }),
    now: new Date('2026-11-01T09:00:00Z')
  });
  assert.equal(gate.status, 'connection_error');
  assert.equal(gate.reason, 'clock_suspect');
  assert.equal(gate.blocked, true);
});

test('The grace window closes between network checks', () => {
  const gate = {
    status: 'current', blocked: false, offline: true, checked_at: '2026-11-01T10:00:00Z',
    grace_expires_at: '2026-11-01T12:00:00Z'
  };
  assert.equal(effectiveGate(gate, new Date('2026-11-01T11:00:00Z')).blocked, false);
  const closed = effectiveGate(gate, new Date('2026-11-01T13:00:00Z'));
  assert.equal(closed.status, 'connection_error');
  assert.equal(closed.blocked, true);
  assert.equal(closed.reason, 'grace_expired');
  assert.equal(normalizeGraceHours(undefined), DEFAULT_OUTAGE_GRACE_HOURS);
  assert.equal(normalizeGraceHours(0), DEFAULT_OUTAGE_GRACE_HOURS);
  assert.equal(normalizeGraceHours(9999), 24 * 7);
});

test('The controller blocks every non-update call until the central policy allows the build', async () => {
  const harness = controllerHarness({
    version: '1.0.0',
    gateFetcher: async () => ({ manifest: policy('1.1.0', '1.1.0'), error: null, serverTime: null })
  });
  try {
    harness.controller.start();
    await harness.controller.checkGate({ reason: 'startup' });
    const state = harness.controller.getState();
    assert.equal(state.gate.status, 'update_required');
    assert.equal(state.blocking, true);
    assert.equal(state.minimum_required_version, '1.1.0');
    assert.equal(harness.controller.isGateOpen(), false);
  } finally {
    harness.cleanup();
  }
});

test('A failed central check keeps the application locked', async () => {
  const harness = controllerHarness({
    gateFetcher: async () => ({ manifest: null, error: 'The update server did not answer in time.', serverTime: null })
  });
  try {
    harness.controller.start();
    await harness.controller.checkGate({ reason: 'startup' });
    assert.equal(harness.controller.getState().gate.status, 'connection_error');
    assert.equal(harness.controller.isGateOpen(), false);
  } finally {
    harness.cleanup();
  }
});

test('Update Now downloads, verifies, backs up and starts the installer', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'somiti-gate-apply-'));
  const installer = path.join(directory, 'BusMalikGroup-Setup-1.1.0-x64.exe');
  fs.writeFileSync(installer, 'verified installer bytes');
  const checksum = await sha256File(installer);
  const backups = [];
  const updater = new FakeUpdater({
    available: { version: '1.1.0', releaseNotes: 'Security update' },
    downloadedFile: installer
  });
  const controller = new UpdateController({
    app: makeApp(directory, '1.0.0'),
    getWindows: () => [],
    updater,
    logger: () => {},
    enabled: true,
    now: () => new Date('2026-11-01T10:00:00Z'),
    gateFetcher: async () => ({
      manifest: policy('1.1.0', '1.1.0', { sha256: checksum }),
      error: null,
      serverTime: null
    }),
    hashFile: sha256File,
    prepareInstall: async (details) => backups.push(details)
  });
  try {
    controller.start();
    await controller.checkGate({ reason: 'startup' });
    const state = await controller.applyMandatoryUpdate();
    assert.equal(state.status, 'installing');
    assert.equal(state.checksum.verified, true);
    assert.deepEqual(updater.calls, ['check', 'download', 'install']);
    assert.deepEqual(updater.installArgs, [true, true]);
    assert.deepEqual(backups, [{ from: '1.0.0', to: '1.1.0' }]);
    const saved = JSON.parse(fs.readFileSync(path.join(directory, 'updates', 'state.json'), 'utf8'));
    assert.equal(saved.pending_update_version, '1.1.0');
    assert.equal(saved.pending_from_version, '1.0.0');
  } finally {
    controller.stop();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('Verify Update deletes a corrupted installer and keeps the gate closed', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'somiti-gate-verify-'));
  const installer = path.join(directory, 'corrupt.exe');
  fs.writeFileSync(installer, 'corrupt bytes');
  const controller = new UpdateController({
    app: makeApp(directory, '1.0.0'),
    getWindows: () => [],
    updater: new FakeUpdater(),
    logger: () => {},
    enabled: true,
    now: () => new Date('2026-11-01T10:00:00Z'),
    gateFetcher: async () => ({ manifest: policy('1.1.0', '1.1.0'), error: null, serverTime: null }),
    hashFile: async () => 'f'.repeat(64)
  });
  try {
    await controller.checkGate({ reason: 'startup' });
    controller.readyFile = installer;
    controller.setState({
      status: 'ready',
      latest_version: '1.1.0',
      checksum: { algorithm: 'sha256', expected: 'e'.repeat(64), actual: null, verified: false }
    });
    await assert.rejects(() => controller.verifyDownload(), /SHA256 verification failed/);
    assert.equal(fs.existsSync(installer), false, 'the corrupted download is removed');
    assert.equal(controller.getState().checksum, null);
    assert.equal(controller.isGateOpen(), false, 'the gate stays closed');
  } finally {
    controller.stop();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('A restart after the update verifies the new build and clears the marker', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'somiti-gate-restart-'));
  const stateDir = path.join(directory, 'updates');
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(path.join(stateDir, 'state.json'), JSON.stringify({
    pending_update_version: '1.1.0',
    pending_from_version: '1.0.0'
  }));
  const controller = new UpdateController({
    app: makeApp(directory, '1.1.0'),
    getWindows: () => [],
    updater: new FakeUpdater(),
    logger: () => {},
    enabled: true,
    now: () => new Date('2026-11-01T10:00:00Z'),
    gateFetcher: async () => ({ manifest: policy('1.1.0', '1.1.0'), error: null, serverTime: null })
  });
  try {
    controller.start();
    const state = await controller.checkGate({ reason: 'startup' });
    assert.equal(state.gate.status, 'current');
    assert.equal(controller.isGateOpen(), true);
    assert.equal(state.history[0].action, 'verified');
    const saved = JSON.parse(fs.readFileSync(path.join(stateDir, 'state.json'), 'utf8'));
    assert.equal(saved.pending_update_version, null);
  } finally {
    controller.stop();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('The manifest writer publishes the central policy fields', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'somiti-gate-manifest-'));
  try {
    fs.writeFileSync(path.join(directory, 'BusMalikGroup-Setup-1.2.0-x64.exe'), 'installer');
    fs.writeFileSync(path.join(directory, 'latest.yml'), 'version: 1.2.0\n');
    writeManifest({
      distDir: directory,
      version: '1.2.0',
      minimumVersion: '1.1.0',
      notes: 'Security update',
      mandatory: true,
      now: new Date('2026-11-01T12:00:00Z')
    });
    const written = JSON.parse(fs.readFileSync(path.join(directory, 'version.json'), 'utf8'));
    assert.equal(written.latest_version, '1.2.0');
    assert.equal(written.minimum_required_version, '1.1.0');
    assert.equal(
      written.download_url,
      'https://github.com/bonnamst289-cyber/busmalikgroup/releases/download/v1.2.0/BusMalikGroup-Setup-1.2.0-x64.exe'
    );
    assert.equal(written.sha256, localSha256(path.join(directory, 'BusMalikGroup-Setup-1.2.0-x64.exe')));
    assert.equal(written.release_notes, 'Security update');
    assert.equal(written.release_date, '2026-11-01T12:00:00.000Z');
    assert.equal(written.mandatory, true);
    assert.equal(written.version, '1.2.0', 'older builds can still read the tag manifest');
    assert.ok(readManifestPolicy(written));
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function localSha256(file) {
  return require('node:crypto').createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}
