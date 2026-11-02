const { compareVersions, isValidVersion } = require('./version.cjs');
const { readPublishConfig } = require('./publish.cjs');

const MANIFEST_TIMEOUT_MS = 10000;
const DEFAULT_OUTAGE_GRACE_HOURS = 12;
const MAX_OUTAGE_GRACE_HOURS = 24 * 7;
// Small clock drift is normal; a rollback large enough to extend the offline
// grace window is not.
const CLOCK_TOLERANCE_MS = 10 * 60 * 1000;
const SHA256_PATTERN = /^[a-f0-9]{64}$/i;
const TRUSTED_DOWNLOAD_HOST = /(^|\.)github\.com$|(^|\.)githubusercontent\.com$/i;

// One address that always answers with the newest published release, so an
// installed copy never has to know the current tag before it can be checked.
function centralManifestUrl(publish) {
  if (!publish || !publish.owner || !publish.repo) return null;
  return `https://github.com/${publish.owner}/${publish.repo}/releases/latest/download/version.json`;
}

function httpDate(value) {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

function parseDownloadUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:' || !TRUSTED_DOWNLOAD_HOST.test(url.hostname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

// The policy document is deliberately small: latest release, the oldest
// version still allowed, and the exact installer that satisfies it. Anything
// that fails validation is treated as unreachable rather than trusted.
function readManifestPolicy(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const latest = String(raw.latest_version ?? raw.version ?? '').trim();
  if (!isValidVersion(latest)) return null;
  const minimum = String(raw.minimum_required_version ?? raw.minimumVersion ?? latest).trim();
  if (!isValidVersion(minimum)) return null;
  if (compareVersions(minimum, latest) > 0) return null;
  const downloadUrl = parseDownloadUrl(raw.download_url ?? raw.downloadUrl);
  if (!downloadUrl) return null;
  const sha256 = String(raw.sha256 || '').toLowerCase();
  if (!SHA256_PATTERN.test(sha256)) return null;
  const releaseDate = raw.release_date ?? raw.releaseDate;
  const parsedDate = releaseDate && !Number.isNaN(Date.parse(releaseDate))
    ? new Date(releaseDate).toISOString()
    : null;
  return {
    latest_version: latest,
    minimum_required_version: minimum,
    download_url: downloadUrl,
    sha256,
    release_notes: String(raw.release_notes ?? raw.releaseNotes ?? '').trim(),
    release_date: parsedDate,
    mandatory: raw.mandatory === true,
    size: Number(raw.size) || null
  };
}

// A fresh install that has never seen a policy must still work offline. The
// build itself then acts as its own baseline: it can run, but it can never
// claim a newer version, and the first policy that is fetched wins.
function selfPolicyFor(app) {
  const version = String(app?.getVersion?.() || '').trim();
  if (!isValidVersion(version)) return null;
  return { latest_version: version, minimum_required_version: version };
}

function createCentralManifestFetcher({ app, publish = null, fetchImpl = globalThis.fetch, timeoutMs = MANIFEST_TIMEOUT_MS } = {}) {
  const url = centralManifestUrl(publish || readPublishConfig(app));
  const selfPolicy = selfPolicyFor(app);
  return async () => {
    if (!url || typeof fetchImpl !== 'function') {
      return { manifest: null, error: 'The update server address is not configured for this installation.', serverTime: null, url, selfPolicy: null };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
          'User-Agent': 'bus-malik-somiti-updater'
        }
      });
      const serverTime = httpDate(response.headers?.get?.('date'));
      if (!response.ok) {
        return {
          manifest: null,
          error: response.status === 404
            ? 'No update policy has been published yet.'
            : `The update server answered HTTP ${response.status}.`,
          serverTime,
          url,
          selfPolicy
        };
      }
      let raw;
      try {
        raw = JSON.parse(await response.text());
      } catch {
        return { manifest: null, error: 'The update policy could not be read.', serverTime, url, selfPolicy };
      }
      const manifest = readManifestPolicy(raw);
      if (!manifest) {
        return { manifest: null, error: 'The update policy is incomplete or invalid.', serverTime, url, selfPolicy };
      }
      return { manifest, error: null, serverTime, url };
    } catch (error) {
      const message = error?.name === 'AbortError'
        ? 'The update server did not answer in time.'
        : String(error?.message || error || 'The update server could not be reached.');
      return { manifest: null, error: message, serverTime: null, url, selfPolicy };
    } finally {
      clearTimeout(timer);
    }
  };
}

function normalizeGraceHours(value) {
  const hours = Number(value);
  if (!Number.isFinite(hours) || hours <= 0) return DEFAULT_OUTAGE_GRACE_HOURS;
  return Math.min(MAX_OUTAGE_GRACE_HOURS, Math.max(1, hours));
}

function normalizeCache(value) {
  if (!value || typeof value !== 'object') return null;
  const manifest = readManifestPolicy(value.manifest);
  if (!manifest) return null;
  const verifiedAt = Date.parse(value.verified_at);
  if (Number.isNaN(verifiedAt)) return null;
  const server = (input) => {
    const parsed = Date.parse(input);
    return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
  };
  return {
    manifest,
    verified_version: String(value.verified_version || ''),
    verified_at: new Date(verifiedAt).toISOString(),
    verified_at_server: server(value.verified_at_server),
    highest_server_time: server(value.highest_server_time),
    grace_hours: normalizeGraceHours(value.grace_hours)
  };
}

function latestServerTime(cache, serverTime) {
  const known = [cache?.highest_server_time, cache?.verified_at_server].filter(Boolean);
  if (serverTime) known.push(serverTime);
  if (!known.length) return null;
  return known.reduce((newest, value) => (Date.parse(value) > Date.parse(newest) ? value : newest));
}

function baseVerdict(currentVersion, manifest, now) {
  return {
    status: 'current',
    blocked: false,
    reason: null,
    current_version: currentVersion,
    latest_version: manifest.latest_version,
    minimum_required_version: manifest.minimum_required_version,
    required_version: manifest.minimum_required_version,
    mandatory: manifest.mandatory,
    release_notes: manifest.release_notes,
    release_date: manifest.release_date,
    download_url: manifest.download_url,
    sha256: manifest.sha256,
    checked_at: now.toISOString(),
    checked_online: true,
    checking: false,
    offline: false,
    update_available: false,
    grace_expires_at: null,
    server_time: null,
    clock_suspect: false,
    error: null
  };
}

// Decides whether this exact installed build may be used. It is intentionally
// synchronous and side-effect free so every IPC call can consult it cheaply.
function evaluateGate({ currentVersion, result, cache, now = new Date(), graceHours = DEFAULT_OUTAGE_GRACE_HOURS }) {
  const at = now instanceof Date ? now : new Date(now);
  const nowMs = at.getTime();
  const hours = normalizeGraceHours(graceHours);
  const previous = normalizeCache(cache);

  if (result?.manifest) {
    const manifest = result.manifest;
    const gate = baseVerdict(currentVersion, manifest, at);
    const belowMinimum = compareVersions(currentVersion, manifest.minimum_required_version) < 0;
    gate.status = belowMinimum ? 'update_required' : 'current';
    gate.blocked = belowMinimum;
    gate.reason = belowMinimum ? 'below_minimum' : null;
    gate.mandatory = belowMinimum ? true : manifest.mandatory;
    gate.update_available = belowMinimum || compareVersions(currentVersion, manifest.latest_version) < 0;
    gate.offline = false;
    gate.checked_online = true;
    gate.server_time = result.serverTime || null;
    const nextCache = {
      manifest,
      verified_version: currentVersion,
      verified_at: at.toISOString(),
      verified_at_server: result.serverTime || null,
      highest_server_time: latestServerTime(previous, result.serverTime),
      grace_hours: hours
    };
    return { gate, cache: nextCache };
  }

  const error = result?.error || 'The update server could not be reached.';
  const offlineVerdict = (patch) => {
    const manifest = previous?.manifest;
    const gate = manifest
      ? baseVerdict(currentVersion, manifest, at)
      : {
        status: 'connection_error', blocked: true, reason: 'never_verified', current_version: currentVersion,
        latest_version: null, minimum_required_version: null, required_version: null, mandatory: false,
        release_notes: '', release_date: null, download_url: null, sha256: null, checked_at: at.toISOString(),
        checked_online: false, checking: false, offline: true, update_available: false, grace_expires_at: null,
        server_time: null, clock_suspect: false, error: null
      };
    return { ...gate, ...patch, error };
  };

  if (!previous) {
    // No policy has ever been seen, so there is no published minimum to
    // enforce yet. Let this exact build start offline instead of bricking a
    // fresh install before the first release policy is uploaded. This is not
    // cached, so the first successful fetch replaces it immediately.
    const selfVersion = String(result?.selfPolicy?.minimum_required_version || '').trim();
    if (result?.selfPolicy && isValidVersion(selfVersion) && compareVersions(currentVersion, selfVersion) >= 0) {
      return {
        gate: {
          status: 'current',
          blocked: false,
          reason: 'local_policy',
          current_version: currentVersion,
          latest_version: selfVersion,
          minimum_required_version: selfVersion,
          required_version: selfVersion,
          mandatory: false,
          release_notes: '',
          release_date: null,
          download_url: null,
          sha256: null,
          checked_at: at.toISOString(),
          checked_online: false,
          checking: false,
          offline: true,
          update_available: false,
          grace_expires_at: null,
          server_time: null,
          clock_suspect: false,
          error
        },
        cache: null
      };
    }
    return { gate: offlineVerdict({ reason: 'never_verified' }), cache: null };
  }

  const manifest = previous.manifest;
  if (compareVersions(currentVersion, manifest.minimum_required_version) < 0) {
    // A version that was already known to be obsolete never regains access by
    // going offline; it keeps the mandatory page and offers Retry Connection.
    return {
      gate: offlineVerdict({
        status: 'update_required',
        blocked: true,
        reason: 'known_obsolete',
        mandatory: true,
        update_available: true,
        checked_online: false,
        offline: true
      }),
      cache: previous
    };
  }

  if (previous.verified_version !== currentVersion) {
    return { gate: offlineVerdict({ status: 'connection_error', blocked: true, reason: 'build_unverified' }), cache: previous };
  }

  const clockSuspect = nowMs + CLOCK_TOLERANCE_MS < Date.parse(previous.verified_at)
    || (previous.highest_server_time && nowMs + CLOCK_TOLERANCE_MS < Date.parse(previous.highest_server_time));
  if (clockSuspect) {
    return {
      gate: offlineVerdict({ status: 'connection_error', blocked: true, reason: 'clock_suspect', clock_suspect: true }),
      cache: previous
    };
  }

  const expiresMs = Date.parse(previous.verified_at) + hours * 60 * 60 * 1000;
  if (nowMs > expiresMs) {
    return {
      gate: offlineVerdict({ status: 'connection_error', blocked: true, reason: 'grace_expired', grace_expires_at: new Date(expiresMs).toISOString() }),
      cache: previous
    };
  }

  const gate = baseVerdict(currentVersion, manifest, at);
  gate.offline = true;
  gate.checked_online = false;
  gate.update_available = compareVersions(currentVersion, manifest.latest_version) < 0;
  gate.grace_expires_at = new Date(expiresMs).toISOString();
  gate.error = error;
  return { gate, cache: previous };
}

// Re-applies time-based rules between network checks so an expired grace
// window closes without waiting for the next fetch.
function effectiveGate(gate, now = new Date()) {
  if (!gate || gate.status === 'disabled' || gate.status === 'checking') return gate;
  const at = now instanceof Date ? now : new Date(now);
  const nowMs = at.getTime();
  if (gate.status === 'current' && gate.offline) {
    if (gate.checked_at && nowMs + CLOCK_TOLERANCE_MS < Date.parse(gate.checked_at)) {
      return { ...gate, status: 'connection_error', blocked: true, reason: 'clock_suspect', clock_suspect: true };
    }
    if (gate.grace_expires_at && nowMs > Date.parse(gate.grace_expires_at)) {
      return { ...gate, status: 'connection_error', blocked: true, reason: 'grace_expired' };
    }
  }
  return gate;
}

function gateBlocked(gate) {
  if (!gate || gate.status === 'disabled') return false;
  return gate.status === 'checking' || gate.blocked === true;
}

module.exports = {
  MANIFEST_TIMEOUT_MS,
  DEFAULT_OUTAGE_GRACE_HOURS,
  MAX_OUTAGE_GRACE_HOURS,
  CLOCK_TOLERANCE_MS,
  centralManifestUrl,
  createCentralManifestFetcher,
  readManifestPolicy,
  normalizeGraceHours,
  normalizeCache,
  evaluateGate,
  effectiveGate,
  gateBlocked
};
