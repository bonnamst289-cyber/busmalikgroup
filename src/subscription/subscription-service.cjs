const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {
  inspectSubscriptionConfig,
  describeConfigProblem,
  isPrivilegedKey,
  normalizeBusinessId,
  normalizeUrl,
  storageKind,
  validateField,
  withConnectionDefaults,
  FIELD_LABELS
} = require('./config.cjs');

// The only package this build sells.
const PACKAGE = Object.freeze({
  packageCode: 'YEARLY_8000',
  packageName: 'Yearly Business Package',
  price: 8000,
  currency: 'BDT',
  durationDays: 365
});

// Used only before Supabase is configured (or while the first online sync has
// not completed) so the Buy Package screen still shows the personal numbers the
// customer must pay. Once Supabase answers, its payment_settings rows win.
const FALLBACK_PAYMENT_SETTINGS = Object.freeze([
  {
    paymentMethod: 'bkash',
    accountNumber: '01331707900',
    accountType: 'Personal',
    instructions: 'Send exactly ৳8,000 to this bKash Personal number with Send Money. Do not use Merchant Payment or Checkout. Then submit the Transaction ID below.',
    enabled: true
  },
  {
    paymentMethod: 'nagad',
    accountNumber: '01783026754',
    accountType: 'Personal',
    instructions: 'Send exactly ৳8,000 to this Nagad Personal number with Send Money. Do not use Merchant Payment or Checkout. Then submit the Transaction ID below.',
    enabled: true
  }
]);

const CACHE_PREFIX_SAFE = 'SBC1\n';
const CACHE_PREFIX_AES = 'SBG1\n';
const DAY_MS = 24 * 60 * 60 * 1000;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function isoOrNull(value) {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function normalizeMethod(value) {
  return String(value || '').trim().toLowerCase();
}

function packageFromRow(row) {
  if (!row) return { ...PACKAGE };
  return {
    packageCode: String(row.package_code || PACKAGE.packageCode),
    packageName: String(row.package_name || PACKAGE.packageName),
    price: Number(row.price ?? PACKAGE.price),
    currency: String(row.currency || PACKAGE.currency),
    durationDays: Number(row.duration_days || PACKAGE.durationDays)
  };
}

class SubscriptionService {
  constructor({ database, userDataDir, safeStorage = null, fetchImpl = globalThis.fetch, now = () => Date.now(),
    logger = console, timeoutMs = 12000, appVersion = '' }) {
    this.database = database;
    this.userDataDir = userDataDir;
    this.appVersion = String(appVersion || '');
    this.safeStorage = safeStorage;
    this.fetchImpl = fetchImpl;
    this.now = now;
    this.logger = logger;
    this.timeoutMs = timeoutMs;
    this.cacheFile = path.join(userDataDir, 'subscription-cache.bin');
    this.keyFile = path.join(userDataDir, 'subscription-cache.key');
    this.syncing = null;
    this.lastError = null;
    this.lastOnlineSyncAt = null;
    this.secretError = null;
    this.syncGeneration = 0;
    this.lastSyncedStatus = null;
    try {
      fs.mkdirSync(userDataDir, { recursive: true });
      this.ensureCacheShell();
    } catch (error) {
      this.logger.error('Subscription cache could not be prepared:', error.message);
    }
  }

  // -------------------------------------------------------------------------
  // Configuration and cache
  // -------------------------------------------------------------------------
  config() {
    const settings = this.database.getSubscriptionSettings();
    // Keys are stored encrypted at rest. A value saved by an older build is
    // still read as plaintext so an upgrade never loses an existing setup.
    let anonKey = settings.anon_key;
    let clientKey = settings.client_key;
    this.secretError = null;
    try {
      anonKey = this.decodeSecret(settings.anon_key);
    } catch (error) {
      this.secretError = error.message;
      anonKey = '';
    }
    try {
      clientKey = this.decodeSecret(settings.client_key);
    } catch (error) {
      this.secretError = this.secretError || error.message;
      clientKey = '';
    }

    const config = {
      ...withConnectionDefaults({ ...settings, anon_key: anonKey, client_key: clientKey }),
      offline_grace_days: clamp(Number(settings.offline_grace_days) || 0, 0, 30)
    };
    // Strip whitespace so an accidental trailing space never breaks a request.
    config.supabase_url = normalizeUrl(config.supabase_url);
    config.business_id = normalizeBusinessId(config.business_id);

    const inspection = inspectSubscriptionConfig(config);
    config.configured = inspection.configured;
    config.complete = inspection.complete;
    config.missing_fields = inspection.missingFields;
    config.invalid_fields = inspection.invalidFields;
    config.config_error = inspection.errors[0] || null;
    config.secret_error = this.secretError;
    return config;
  }

  publicConfig() {
    const stored = this.database.getSubscriptionSettings();
    const config = this.config();
    const inspection = inspectSubscriptionConfig(config);
    return {
      ...this.database.getPublicSubscriptionSettings(),
      supabase_url: config.supabase_url,
      has_anon_key: Boolean(config.anon_key),
      configured: config.configured,
      complete: config.complete,
      missingFields: config.missing_fields,
      invalidFields: config.invalid_fields,
      configError: describeConfigProblem(inspection),
      keyStorage: storageKind(stored.anon_key, stored.client_key),
      secretError: config.secret_error
    };
  }

  configHealth() {
    const config = this.config();
    const cache = this.readCache();
    return {
      configured: config.configured,
      complete: config.complete,
      missingFields: config.missing_fields,
      invalidFields: config.invalid_fields,
      keyStorage: storageKind(
        this.database.getSubscriptionSettings().anon_key,
        this.database.getSubscriptionSettings().client_key
      ),
      secretError: config.secret_error,
      enforced: config.enforced,
      businessName: config.business_name,
      contactNumber: config.contact_number,
      lastVerifiedAt: cache?.verifiedAt || null,
      lastError: this.lastError,
      lastSyncAt: this.lastOnlineSyncAt
    };
  }

  // Storage for the anon key and client key: OS keychain via safeStorage when
  // available, AES-256-GCM with a 0600 key file otherwise. Neither is ever a
  // service_role key, which is refused before this point.
  encodeSecret(value) {
    const text = String(value ?? '');
    if (!text) return '';
    if (this.safeStorage && typeof this.safeStorage.isEncryptionAvailable === 'function'
      && this.safeStorage.isEncryptionAvailable() && typeof this.safeStorage.encryptString === 'function') {
      return `enc1:${this.safeStorage.encryptString(text).toString('base64')}`;
    }
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.fallbackKey(), iv);
    const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    return `aes1:${Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64')}`;
  }

  decodeSecret(value) {
    const text = String(value ?? '');
    if (!text) return '';
    if (text.startsWith('enc1:')) {
      if (!this.safeStorage || typeof this.safeStorage.decryptString !== 'function') {
        throw new Error('Secure key storage is not available on this computer.');
      }
      try {
        return this.safeStorage.decryptString(Buffer.from(text.slice(5), 'base64'));
      } catch {
        throw new Error('The stored Supabase key could not be decrypted.');
      }
    }
    if (text.startsWith('aes1:')) {
      try {
        const raw = Buffer.from(text.slice(5), 'base64');
        const iv = raw.subarray(0, 12);
        const tag = raw.subarray(12, 28);
        const payload = raw.subarray(28);
        const decipher = crypto.createDecipheriv('aes-256-gcm', this.fallbackKey(), iv);
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(payload), decipher.final()]).toString('utf8');
      } catch {
        throw new Error('The stored Supabase key could not be decrypted.');
      }
    }
    // Legacy plaintext value written by an earlier build.
    return text;
  }

  fallbackKey() {
    try {
      if (fs.existsSync(this.keyFile)) {
        const stored = fs.readFileSync(this.keyFile);
        if (stored.length === 32) return stored;
      }
      const key = crypto.randomBytes(32);
      fs.writeFileSync(this.keyFile, key, { mode: 0o600 });
      return key;
    } catch {
      // Last resort: derive a stable key so a read-only profile still works.
      return crypto.createHash('sha256').update(`${this.userDataDir}:bus-malik-somiti-subscription`).digest();
    }
  }

  writeCache(value) {
    const json = JSON.stringify(value);
    let buffer;
    if (this.safeStorage && this.safeStorage.isEncryptionAvailable && this.safeStorage.isEncryptionAvailable()) {
      buffer = Buffer.concat([Buffer.from(CACHE_PREFIX_SAFE, 'utf8'), this.safeStorage.encryptString(json)]);
    } else {
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', this.fallbackKey(), iv);
      const encrypted = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()]);
      const tag = cipher.getAuthTag();
      buffer = Buffer.concat([Buffer.from(CACHE_PREFIX_AES, 'utf8'), iv, tag, encrypted]);
    }
    const temporary = `${this.cacheFile}.tmp`;
    fs.writeFileSync(temporary, buffer, { mode: 0o600 });
    fs.renameSync(temporary, this.cacheFile);
  }

  readCache() {
    try {
      if (!fs.existsSync(this.cacheFile)) return null;
      const raw = fs.readFileSync(this.cacheFile);
      const head = raw.subarray(0, 5).toString('utf8');
      let json;
      if (head === CACHE_PREFIX_SAFE) {
        if (!this.safeStorage || !this.safeStorage.decryptString) return null;
        json = this.safeStorage.decryptString(raw.subarray(5));
      } else if (head === CACHE_PREFIX_AES) {
        const iv = raw.subarray(5, 17);
        const tag = raw.subarray(17, 33);
        const payload = raw.subarray(33);
        const decipher = crypto.createDecipheriv('aes-256-gcm', this.fallbackKey(), iv);
        decipher.setAuthTag(tag);
        json = Buffer.concat([decipher.update(payload), decipher.final()]).toString('utf8');
      } else {
        return null;
      }
      const parsed = JSON.parse(json);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (error) {
      this.logger.error('Subscription cache could not be read:', error.message);
      return null;
    }
  }

  ensureCacheShell() {
    if (fs.existsSync(this.cacheFile)) return;
    const stamp = new Date(this.now()).toISOString();
    this.writeCache({
      version: 1,
      firstSeenAt: stamp,
      lastSeenAt: stamp,
      verifiedAt: null,
      offsetMs: 0,
      serverTime: null,
      businessId: null,
      package: null,
      subscription: null,
      paymentSettings: [],
      paymentRequests: []
    });
  }

  clearCache() {
    try {
      fs.rmSync(this.cacheFile, { force: true });
    } catch {
      // ignore
    }
    // Any sync that started with the previous credentials must not write its
    // result into the new cache.
    this.syncGeneration += 1;
    this.lastSyncedStatus = null;
    this.lastError = null;
    this.lastOnlineSyncAt = null;
    this.ensureCacheShell();
  }

  // -------------------------------------------------------------------------
  // Supabase RPC
  // -------------------------------------------------------------------------
  async rpc(name, body, override = null) {
    const config = override ? { ...this.config(), ...override } : this.config();
    if (override) config.configured = inspectSubscriptionConfig(config).configured;
    if (!config.configured) {
      throw new Error(describeConfigProblem(inspectSubscriptionConfig(config))
        || 'Online subscription is not configured.');
    }
    if (typeof this.fetchImpl !== 'function') throw new Error('This build cannot reach Supabase.');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(`${config.supabase_url}/rest/v1/rpc/${name}`, {
        method: 'POST',
        headers: {
          apikey: config.anon_key,
          Authorization: `Bearer ${config.anon_key}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          // Every online business call advertises its build so a Supabase RPC
          // can refuse an obsolete client even if the desktop gate was bypassed.
          ...(this.appVersion ? { 'x-app-version': this.appVersion } : {})
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      const text = await response.text();
      let payload = null;
      if (text) {
        try { payload = JSON.parse(text); } catch { payload = text; }
      }
      if (!response.ok) {
        const message = (payload && (payload.message || payload.error_description || payload.error || payload.hint))
          || `Subscription server error (${response.status}).`;
        throw new Error(String(message));
      }
      return payload;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('The subscription server did not respond. Please try again.');
      // Node's fetch reports DNS/socket failures as a bare TypeError; the user
      // needs the URL and connection hint, not "fetch failed".
      if (error.name === 'TypeError' || /fetch failed|failed to fetch|ENOTFOUND|ECONNREFUSED|EAI_AGAIN|ETIMEDOUT/i.test(error.message || '')) {
        throw new Error('Could not reach Supabase. Check the project URL and the internet connection.');
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  normalizePayload(payload) {
    if (!payload || typeof payload !== 'object') throw new Error('Unexpected subscription response.');
    const serverTime = isoOrNull(payload.server_time);
    if (!serverTime) throw new Error('The subscription server returned an invalid time.');
    const subscriptionRow = payload.subscription || null;
    const subscription = subscriptionRow ? {
      id: subscriptionRow.id || null,
      status: String(subscriptionRow.status || 'pending'),
      startDate: isoOrNull(subscriptionRow.start_date),
      expiryDate: isoOrNull(subscriptionRow.expiry_date),
      paymentRequestId: subscriptionRow.payment_request_id || null
    } : null;
    if (subscription && subscription.status === 'active' && !subscription.expiryDate) {
      throw new Error('The subscription response is missing an expiry date.');
    }
    return {
      businessId: payload.business?.id || null,
      businessName: payload.business?.name || '',
      package: packageFromRow(payload.package),
      subscription,
      daysRemaining: Number(payload.days_remaining) || 0,
      paymentSettings: (Array.isArray(payload.payment_settings) ? payload.payment_settings : []).map((row) => ({
        paymentMethod: normalizeMethod(row.payment_method),
        accountNumber: String(row.account_number || ''),
        accountType: String(row.account_type || 'Personal'),
        instructions: String(row.instructions || ''),
        enabled: row.is_enabled !== false
      })).filter((row) => row.paymentMethod && row.accountNumber),
      paymentRequests: (Array.isArray(payload.payment_requests) ? payload.payment_requests : []).map((row) => ({
        id: row.id,
        paymentMethod: normalizeMethod(row.payment_method),
        transactionId: String(row.transaction_id || ''),
        amount: Number(row.amount) || 0,
        paymentDate: isoOrNull(row.payment_date),
        status: String(row.status || 'pending'),
        submittedAt: isoOrNull(row.submitted_at),
        approvedAt: isoOrNull(row.approved_at),
        rejectionReason: String(row.rejection_reason || '')
      })),
      serverTime,
      offsetMs: Math.max(-DAY_MS, Math.min(DAY_MS, Date.parse(serverTime) - this.now())),
      verifiedAt: new Date(this.now()).toISOString()
    };
  }

  sync() {
    if (this.syncing) return this.syncing;
    const run = (async () => {
      const config = this.config();
      if (!config.configured) return this.evaluate({ online: false });
      const generation = this.syncGeneration;
      try {
        const payload = await this.rpc('get_business_subscription', {
          p_business_id: config.business_id,
          p_client_key: config.client_key
        });
        const normalized = this.normalizePayload(payload);
        if (normalized.businessId && normalized.businessId !== config.business_id) {
          throw new Error('The subscription server returned a different business. Check the Business ID.');
        }
        if (generation !== this.syncGeneration) {
          return this.evaluate({ online: false });
        }
        const previous = this.readCache() || {};
        this.writeCache({
          version: 1,
          firstSeenAt: previous.firstSeenAt || new Date(this.now()).toISOString(),
          lastSeenAt: new Date(this.now()).toISOString(),
          ...normalized
        });
        this.lastError = null;
        this.lastOnlineSyncAt = new Date(this.now()).toISOString();
        const evaluated = this.evaluate({ online: true });
        // Remember what the trusted server last said. The offline grace period
        // must never reopen the ledger when the server itself reported expiry.
        this.lastSyncedStatus = evaluated;
        return evaluated;
      } catch (error) {
        this.lastError = error.message;
        this.logger.error('Subscription sync failed:', error.message);
        return this.evaluate({ online: false });
      }
    })();
    // The in-flight promise must always be cleared, including the
    // not-configured path. Otherwise a sync attempted before the administrator
    // saved the connection would be replayed forever and the app would keep
    // reporting "not configured" until the next restart.
    const tracked = run.finally(() => {
      if (this.syncing === tracked) this.syncing = null;
    });
    this.syncing = tracked;
    return tracked;
  }

  // -------------------------------------------------------------------------
  // Status evaluation (online result or verified offline cache)
  // -------------------------------------------------------------------------
  evaluate({ online = false } = {}) {
    const config = this.config();
    const cache = this.readCache();
    const now = this.now();
    const lastSeenMs = cache?.lastSeenAt ? Date.parse(cache.lastSeenAt) : 0;
    const effectiveNow = Math.max(now, Number.isFinite(lastSeenMs) ? lastSeenMs : 0) + (Number(cache?.offsetMs) || 0);
    const subscription = cache?.subscription || null;
    const expiryMs = subscription?.expiryDate ? Date.parse(subscription.expiryDate) : NaN;
    const graceDays = config.offline_grace_days;
    const graceEndsMs = Number.isFinite(expiryMs) ? expiryMs + graceDays * DAY_MS : NaN;
    const daysRemaining = Number.isFinite(expiryMs)
      ? Math.max(0, Math.ceil((expiryMs - effectiveNow) / DAY_MS))
      : 0;

    let state = 'not_configured';
    let canUse = true;
    let message = '';

    if (config.configured && config.enforced) {
      canUse = false;
      if (!cache || !cache.verifiedAt) {
        state = 'verification_required';
        message = 'Connect to the internet once to verify your subscription.';
      } else if (!subscription) {
        state = 'pending';
        message = 'No active package yet. Submit a payment request and wait for manual verification.';
      } else if (subscription.status === 'active' && Number.isFinite(expiryMs) && effectiveNow <= expiryMs) {
        state = 'active';
        canUse = true;
        message = 'Your package is active.';
      } else if (!online && Number.isFinite(graceEndsMs) && effectiveNow <= graceEndsMs && ['active', 'expired'].includes(subscription.status)) {
        state = 'offline_grace';
        canUse = true;
        message = `You are offline. Your package expired, but an offline grace period is active until ${new Date(graceEndsMs).toISOString().slice(0, 10)}.`;
      } else if (subscription.status === 'rejected') {
        state = 'rejected';
        message = 'Your last payment request was rejected. Please submit a new one.';
      } else if (subscription.status === 'pending') {
        state = 'pending';
        message = 'Your payment is waiting for manual verification.';
      } else if (subscription.status === 'expired' || (Number.isFinite(expiryMs) && effectiveNow > expiryMs)) {
        state = 'expired';
        message = 'Your Yearly Business Package has expired. Renew to continue.';
      } else {
        state = 'pending';
        message = 'Your subscription is not active yet.';
      }
    } else if (config.configured) {
      state = subscription?.status === 'active' ? 'active' : 'disabled';
      canUse = true;
      message = 'Subscription enforcement is turned off for this installation.';
    }

    // Keep the cache's last-seen timestamp moving forward so a backwards clock
    // change cannot silently replay an old expiry window.
    if (cache && (!cache.lastSeenAt || now - Date.parse(cache.lastSeenAt) > 60 * 60 * 1000)) {
      try {
        this.writeCache({ ...cache, lastSeenAt: new Date(Math.max(now, lastSeenMs || 0)).toISOString() });
      } catch {
        // A read-only profile must not break login.
      }
    }

    const packageInfo = cache?.package || { ...PACKAGE };
    return {
      configured: config.configured,
      configurationComplete: config.complete,
      missingFields: config.missing_fields,
      configError: describeConfigProblem(inspectSubscriptionConfig(config)),
      enforced: config.enforced,
      canUse,
      state,
      message,
      source: online ? 'online' : (cache?.verifiedAt ? 'cache' : 'none'),
      businessName: cache?.businessName || config.business_name || '',
      contactNumber: config.contact_number || '',
      package: packageInfo,
      subscription,
      daysRemaining,
      lastSyncAt: cache?.verifiedAt || null,
      serverTime: cache?.serverTime || null,
      offlineGraceDays: graceDays,
      graceEndsAt: Number.isFinite(graceEndsMs) ? new Date(graceEndsMs).toISOString() : null,
      lastError: this.lastError,
      paymentSettings: (cache?.paymentSettings && cache.paymentSettings.length) ? cache.paymentSettings : FALLBACK_PAYMENT_SETTINGS.map((row) => ({ ...row })),
      paymentRequests: cache?.paymentRequests || []
    };
  }

  async getStatus({ forceSync = false, allowNetwork = true } = {}) {
    const config = this.config();
    if (config.configured && allowNetwork) {
      const cache = this.readCache();
      const lastVerified = cache?.verifiedAt ? Date.parse(cache.verifiedAt) : 0;
      const stale = !cache?.verifiedAt || this.now() - lastVerified > 5 * 60 * 1000;
      if (forceSync || stale || !this.lastOnlineSyncAt) return this.sync();
    }
    return this.evaluate({ online: false });
  }

  async getBuyInfo({ allowNetwork = true } = {}) {
    if (allowNetwork && this.config().configured) await this.sync();
    return this.evaluate({ online: false });
  }

  requireAccess() {
    const status = this.evaluate({ online: false });
    if (status.canUse) {
      // The offline grace window only applies while the last server answer did
      // not already mark the package unusable (expired/rejected/pending).
      const last = this.lastSyncedStatus;
      if (!last || !last.configured || !last.enforced || last.canUse) return status;
      const blocked = new Error(`SUBSCRIPTION_BLOCKED:${last.state}`);
      blocked.subscription = last;
      throw blocked;
    }
    const error = new Error(`SUBSCRIPTION_BLOCKED:${status.state}`);
    error.subscription = status;
    throw error;
  }

  async submitPayment(data = {}) {
    const config = this.config();
    if (!config.configured) {
      throw new Error(describeConfigProblem(inspectSubscriptionConfig(config)));
    }
    const businessName = String(data.business_name || '').trim();
    const contactNumber = String(data.contact_number || '').trim();
    const paymentMethod = normalizeMethod(data.payment_method);
    const transactionId = String(data.transaction_id || '').trim();
    const amount = Number(data.amount);
    const paymentDate = data.payment_date ? new Date(`${data.payment_date}T00:00:00`) : null;

    if (businessName.length < 2) throw new Error('Business name is required.');
    if (!/^[0-9+\- ]{6,30}$/.test(contactNumber)) throw new Error('Enter a valid contact number.');
    if (!['bkash', 'nagad'].includes(paymentMethod)) throw new Error('Choose bKash or Nagad.');
    if (transactionId.length < 4) throw new Error('Enter a valid transaction ID.');
    if (amount !== 8000) throw new Error('Payment amount must be exactly 8000 BDT.');
    if (paymentDate && Number.isNaN(paymentDate.getTime())) throw new Error('Enter a valid payment date.');

    const result = await this.rpc('submit_payment_request', {
      p_business_id: config.business_id,
      p_client_key: config.client_key,
      p_business_name: businessName,
      p_contact_number: contactNumber,
      p_payment_method: paymentMethod,
      p_transaction_id: transactionId,
      p_amount: 8000,
      p_payment_date: paymentDate ? paymentDate.toISOString() : null
    });

    try {
      await this.sync();
    } catch {
      // The request is already saved; a failed follow-up sync is harmless.
    }
    return result;
  }

  // Verifies a draft configuration against the trusted Supabase RPC without
  // saving it or touching the verified cache. The server checks the business ID
  // against the client key, so a copied Business ID from another installation
  // cannot be mistaken for this one.
  async testConfig(data = {}) {
    const current = this.config();
    const draft = {
      supabase_url: data.supabase_url !== undefined ? normalizeUrl(data.supabase_url) : current.supabase_url,
      anon_key: data.anon_key !== undefined && String(data.anon_key || '').trim()
        ? String(data.anon_key).trim() : current.anon_key,
      business_id: data.business_id !== undefined && String(data.business_id || '').trim()
        ? normalizeBusinessId(data.business_id) : current.business_id,
      client_key: data.client_key !== undefined && String(data.client_key || '').trim()
        ? String(data.client_key).trim() : current.client_key
    };

    const inspection = inspectSubscriptionConfig(draft);
    if (!inspection.configured) throw new Error(describeConfigProblem(inspection));

    const payload = await this.rpc('get_business_subscription', {
      p_business_id: draft.business_id,
      p_client_key: draft.client_key
    }, draft);
    const normalized = this.normalizePayload(payload);
    if (normalized.businessId && normalizeBusinessId(normalized.businessId) !== draft.business_id) {
      throw new Error('The Supabase project returned a different business. The Business ID and client key belong to another installation.');
    }
    if (!normalized.businessId) {
      throw new Error('The Supabase project did not confirm the business. Apply the subscription migration and check the Business ID.');
    }

    return {
      ok: true,
      testedAt: new Date(this.now()).toISOString(),
      businessName: normalized.businessName,
      packageName: normalized.package.packageName,
      price: normalized.package.price,
      currency: normalized.package.currency,
      subscriptionStatus: normalized.subscription ? normalized.subscription.status : 'none',
      daysRemaining: normalized.daysRemaining,
      paymentMethods: normalized.paymentSettings.map((row) => row.paymentMethod),
      serverTime: normalized.serverTime
    };
  }

  saveConfig(user, data = {}) {
    const current = this.config();
    const draft = {
      supabase_url: data.supabase_url !== undefined ? normalizeUrl(data.supabase_url) : current.supabase_url,
      anon_key: data.anon_key !== undefined && String(data.anon_key || '').trim()
        ? String(data.anon_key).trim() : current.anon_key,
      business_id: data.business_id !== undefined && String(data.business_id || '').trim()
        ? normalizeBusinessId(data.business_id) : current.business_id,
      client_key: data.client_key !== undefined && String(data.client_key || '').trim()
        ? String(data.client_key).trim() : current.client_key,
      enforced: data.enforced !== undefined ? Boolean(data.enforced) : Boolean(current.enforced)
    };

    // Every value that is present must be valid; enforcement additionally
    // requires all four values so the app can never lock itself out with an
    // incomplete connection.
    for (const field of ['supabase_url', 'anon_key', 'business_id', 'client_key']) {
      const value = draft[field];
      if (!String(value || '').trim()) continue;
      if (field === 'anon_key' || field === 'client_key') {
        if (isPrivilegedKey(value)) {
          throw new Error(`Never use the Supabase service_role or secret key. ${FIELD_LABELS[field]} must be the public value.`);
        }
      }
      const message = validateField(field, value);
      if (message) throw new Error(message);
    }
    const inspection = inspectSubscriptionConfig(draft);
    if (draft.enforced && !inspection.configured) {
      throw new Error(`Cannot require an active package until every field is configured. ${describeConfigProblem(inspection)}`);
    }

    const payload = { ...data, enforced: draft.enforced };
    if (data.supabase_url !== undefined) payload.supabase_url = draft.supabase_url;
    if (data.business_id !== undefined) payload.business_id = draft.business_id;
    // Empty values mean "keep the saved key"; only a newly typed key is
    // re-encrypted and written.
    if (data.anon_key !== undefined && String(data.anon_key || '').trim()) {
      payload.anon_key = this.encodeSecret(draft.anon_key);
    } else {
      delete payload.anon_key;
    }
    if (data.client_key !== undefined && String(data.client_key || '').trim()) {
      payload.client_key = this.encodeSecret(draft.client_key);
    } else {
      delete payload.client_key;
    }

    const settings = this.database.saveSubscriptionSettings(user, payload);
    // Enforcement or credentials may have changed; the next sync repopulates it.
    this.lastSyncedStatus = null;

    const credentialsChanged = normalizeUrl(current.supabase_url) !== draft.supabase_url
      || current.business_id !== draft.business_id
      || (data.anon_key !== undefined && String(data.anon_key || '').trim())
      || (data.client_key !== undefined && String(data.client_key || '').trim());
    if (credentialsChanged) this.clearCache();
    return settings;
  }
}

module.exports = {
  SubscriptionService,
  PACKAGE,
  FALLBACK_PAYMENT_SETTINGS
};
