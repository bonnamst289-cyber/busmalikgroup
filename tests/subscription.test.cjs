const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { AssociationDatabase } = require('../src/database.cjs');
const { SubscriptionService } = require('../src/subscription/subscription-service.cjs');
const { isPrivilegedKey } = require('../src/subscription/config.cjs');

const BUSINESS_ID = '11111111-2222-4333-8444-555555555555';
const NOW = Date.parse('2026-11-01T00:00:00.000Z');

function setup() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'somiti-sub-'));
  const database = new AssociationDatabase(path.join(directory, 'association.sqlite'));
  const admin = database.createUser({ username: 'admin', full_name: 'Admin', password: 'secure-password', role: 'admin' }, null);
  return { directory, database, admin };
}

function withContext(run) {
  const context = setup();
  return Promise.resolve()
    .then(() => run(context))
    .finally(() => {
      context.database.close();
      fs.rmSync(context.directory, { recursive: true, force: true });
    });
}

function configure(database, admin, overrides = {}) {
  return database.saveSubscriptionSettings(admin, {
    supabase_url: 'https://example-project.supabase.co',
    anon_key: 'a'.repeat(48),
    business_id: BUSINESS_ID,
    client_key: 'c'.repeat(48),
    business_name: 'Test Association',
    contact_number: '01700000000',
    enforced: true,
    offline_grace_days: 3,
    ...overrides
  });
}

function payload({ status = 'active', expiry = new Date(NOW + 365 * 86400000).toISOString(), requests = [] } = {}) {
  return {
    server_time: new Date(NOW).toISOString(),
    business: { id: BUSINESS_ID, name: 'Test Association' },
    package: {
      package_code: 'YEARLY_8000', package_name: 'Yearly Business Package',
      price: 8000, currency: 'BDT', duration_days: 365
    },
    subscription: status === null ? null : {
      id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      status,
      start_date: new Date(NOW).toISOString(),
      expiry_date: expiry,
      payment_request_id: null
    },
    days_remaining: 365,
    payment_settings: [
      { payment_method: 'bkash', account_number: '01331707900', account_type: 'Personal', instructions: 'Send Money to this bKash Personal number.', is_enabled: true },
      { payment_method: 'nagad', account_number: '01783026754', account_type: 'Personal', instructions: 'Send Money to this Nagad Personal number.', is_enabled: true }
    ],
    payment_requests: requests
  };
}

function fakeFetch(response, calls = [], fail = false) {
  return async (url, options) => {
    if (fail) throw new Error('offline');
    calls.push({ url, body: JSON.parse(options.body || '{}') });
    return { ok: true, status: 200, text: async () => JSON.stringify(response) };
  };
}

test('unconfigured installations keep existing local features available', () =>
  withContext(({ database, directory }) => {
    const service = new SubscriptionService({ database, userDataDir: directory, safeStorage: null, now: () => NOW });
    const status = service.evaluate({ online: false });
    assert.equal(status.configured, false);
    assert.equal(status.canUse, true);
    assert.equal(status.state, 'not_configured');
    assert.equal(service.requireAccess().state, 'not_configured');
  }));

test('settings validation rejects an unsafe URL and a non-UUID business id', () =>
  withContext(({ database, admin }) => {
    assert.throws(() => configure(database, admin, { supabase_url: 'ftp://example.com' }), /https/);
    assert.throws(() => configure(database, admin, { business_id: 'not-a-uuid' }), /UUID/);
    assert.throws(() => configure(database, admin, { client_key: 'short' }), /client key/);
  }));

test('online sync activates a 365-day package and caches it for offline use', () =>
  withContext(async ({ database, admin, directory }) => {
    configure(database, admin);
    let clock = NOW;
    const calls = [];
    const service = new SubscriptionService({
      database, userDataDir: directory, safeStorage: null,
      fetchImpl: fakeFetch(payload(), calls), now: () => clock
    });
    const online = await service.sync();
    assert.equal(online.state, 'active');
    assert.equal(online.canUse, true);
    assert.equal(online.daysRemaining, 365);
    assert.equal(calls[0].url, 'https://example-project.supabase.co/rest/v1/rpc/get_business_subscription');
    assert.equal(calls[0].body.p_business_id, BUSINESS_ID);

    // A second process with no network still trusts the verified cache.
    clock = NOW + 10 * 86400000;
    const offline = new SubscriptionService({
      database, userDataDir: directory, safeStorage: null,
      fetchImpl: fakeFetch(null, [], true), now: () => clock
    });
    const cached = offline.evaluate({ online: false });
    assert.equal(cached.state, 'active');
    assert.equal(cached.source, 'cache');
    assert.equal(cached.canUse, true);
    assert.equal(cached.daysRemaining, 355);
  }));

test('offline expiry uses a bounded grace period and then blocks data access', () =>
  withContext(async ({ database, admin, directory }) => {
    configure(database, admin, { offline_grace_days: 3 });
    const expiry = new Date(NOW + 5 * 86400000).toISOString();
    let clock = NOW;
    await new SubscriptionService({
      database, userDataDir: directory, safeStorage: null,
      fetchImpl: fakeFetch(payload({ expiry })), now: () => clock
    }).sync();

    clock = NOW + 6 * 86400000;
    const offline = new SubscriptionService({
      database, userDataDir: directory, safeStorage: null,
      fetchImpl: fakeFetch(null, [], true), now: () => clock
    });
    const grace = offline.evaluate({ online: false });
    assert.equal(grace.state, 'offline_grace');
    assert.equal(grace.canUse, true);

    clock = NOW + 9 * 86400000;
    const expired = offline.evaluate({ online: false });
    assert.equal(expired.state, 'expired');
    assert.equal(expired.canUse, false);
    assert.throws(() => offline.requireAccess(), /SUBSCRIPTION_BLOCKED:expired/);
  }));

test('an online expired subscription is blocked even inside the offline grace window', () =>
  withContext(async ({ database, admin, directory }) => {
    configure(database, admin, { offline_grace_days: 30 });
    const expiry = new Date(NOW + 86400000).toISOString();
    let clock = NOW;
    const service = new SubscriptionService({
      database, userDataDir: directory, safeStorage: null,
      fetchImpl: fakeFetch(payload({ expiry })), now: () => clock
    });
    await service.sync();
    clock = NOW + 2 * 86400000;
    const online = service.evaluate({ online: true });
    assert.equal(online.state, 'expired');
    assert.equal(online.canUse, false);
  }));

test('a pending subscription never unlocks the application', () =>
  withContext(async ({ database, admin, directory }) => {
    configure(database, admin);
    const service = new SubscriptionService({
      database, userDataDir: directory, safeStorage: null,
      fetchImpl: fakeFetch(payload({ status: 'pending' })), now: () => NOW
    });
    const status = await service.sync();
    assert.equal(status.state, 'pending');
    assert.equal(status.canUse, false);
  }));

test('a missing or tampered cache cannot be used to fake activation', () =>
  withContext(async ({ database, admin, directory }) => {
    configure(database, admin);
    const service = new SubscriptionService({
      database, userDataDir: directory, safeStorage: null,
      fetchImpl: fakeFetch(payload()), now: () => NOW
    });
    await service.sync();
    const file = path.join(directory, 'subscription-cache.bin');
    const bytes = fs.readFileSync(file);
    bytes[bytes.length - 2] ^= 0xff;
    fs.writeFileSync(file, bytes);

    const offline = new SubscriptionService({
      database, userDataDir: directory, safeStorage: null,
      fetchImpl: fakeFetch(null, [], true), now: () => NOW
    });
    const status = offline.evaluate({ online: false });
    assert.equal(status.state, 'verification_required');
    assert.equal(status.canUse, false);
  }));

test('submitting a payment sends the exact package amount and does not approve locally', () =>
  withContext(async ({ database, admin, directory }) => {
    configure(database, admin);
    const calls = [];
    const fetchImpl = async (url, options) => {
      const body = JSON.parse(options.body || '{}');
      calls.push({ url, body });
      const response = url.endsWith('/submit_payment_request')
        ? { id: 'aaaaaaaa-bbbb-4ccc-8ddd-ffffffffffff', status: 'pending', message: 'Your payment request has been submitted successfully. Please wait for manual verification.' }
        : payload({ status: 'pending', requests: [{ id: 'aaaaaaaa-bbbb-4ccc-8ddd-ffffffffffff', payment_method: 'bkash', transaction_id: 'TXN12345', amount: 8000, status: 'pending', submitted_at: new Date(NOW).toISOString() }] });
      return { ok: true, status: 200, text: async () => JSON.stringify(response) };
    };
    const service = new SubscriptionService({ database, userDataDir: directory, safeStorage: null, fetchImpl, now: () => NOW });
    const result = await service.submitPayment({
      business_name: 'Test Association', contact_number: '01700000000',
      payment_method: 'BKASH', transaction_id: ' TXN12345 ', amount: 8000, payment_date: '2026-11-01'
    });
    assert.equal(result.status, 'pending');
    const submit = calls.find((call) => call.url.endsWith('/submit_payment_request'));
    assert.equal(submit.body.p_amount, 8000);
    assert.equal(submit.body.p_payment_method, 'bkash');
    assert.equal(submit.body.p_transaction_id, 'TXN12345');
    assert.equal(submit.body.p_business_id, BUSINESS_ID);

    await assert.rejects(
      service.submitPayment({
        business_name: 'Test Association', contact_number: '01700000000',
        payment_method: 'nagad', transaction_id: 'TXN99999', amount: 7000
      }),
      /exactly 8000/
    );
  }));

test('the desktop settings never contain a service_role key', () =>
  withContext(({ database, admin }) => {
    configure(database, admin);
    const values = Object.fromEntries(database.db.prepare('SELECT key, value FROM settings').all().map((row) => [row.key, row.value]));
    assert.equal(Object.keys(values).some((key) => /service_role/i.test(key)), false);
    assert.equal(Object.values(values).some((value) => /service_role/i.test(String(value))), false);
    assert.equal(values.subscription_business_id, BUSINESS_ID);
  }));

test('the configuration report names every missing field', () =>
  withContext(async ({ database, directory }) => {
    const service = new SubscriptionService({ database, userDataDir: directory, safeStorage: null, now: () => NOW });
    const info = service.publicConfig();
    assert.equal(info.configured, false);
    // The project URL and public anon key are built in; only the per-business
    // credentials still have to be pasted.
    assert.equal(info.supabase_url, 'https://hgavhgssxmbtqiqvrsyd.supabase.co');
    assert.equal(info.has_anon_key, true);
    assert.deepEqual(info.missingFields, ['business_id', 'client_key']);
    assert.match(info.configError, /Business ID/);
    assert.match(info.configError, /Client key/);
    const status = service.evaluate({ online: false });
    assert.equal(status.configured, false);
    assert.match(status.configError, /missing/i);
    await assert.rejects(
      service.submitPayment({}),
      (error) => /Online payment is not configured/.test(error.message) && /Business ID/.test(error.message)
    );
  }));

test('a sync attempted before setup does not pin the not-configured state', () =>
  withContext(async ({ database, admin, directory }) => {
    const calls = [];
    const service = new SubscriptionService({
      database, userDataDir: directory, safeStorage: null,
      fetchImpl: fakeFetch(payload(), calls), now: () => NOW
    });
    const before = await service.sync();
    assert.equal(before.state, 'not_configured');

    service.saveConfig(admin, {
      supabase_url: 'https://example-project.supabase.co',
      anon_key: 'a'.repeat(48),
      business_id: BUSINESS_ID,
      client_key: 'c'.repeat(48),
      business_name: 'Test Association',
      contact_number: '01700000000'
    });
    const after = await service.sync();
    assert.equal(after.configured, true);
    assert.equal(after.state, 'active');
    assert.equal(after.businessName, 'Test Association');
    assert.equal(calls.length, 1);

    const stored = service.publicConfig();
    assert.equal(stored.business_name, 'Test Association');
    assert.equal(stored.contact_number, '01700000000');
  }));

test('a server-reported expiry still blocks data access during offline grace', () =>
  withContext(async ({ database, admin, directory }) => {
    configure(database, admin, { offline_grace_days: 30 });
    const expiry = new Date(NOW + 86400000).toISOString();
    let clock = NOW;
    const fetchImpl = async () => ({
      ok: true, status: 200,
      text: async () => JSON.stringify({ ...payload({ expiry }), server_time: new Date(clock).toISOString() })
    });
    const service = new SubscriptionService({
      database, userDataDir: directory, safeStorage: null,
      fetchImpl, now: () => clock
    });
    await service.sync();
    assert.equal(service.requireAccess().state, 'active');

    // Two days later the online answer says expired even though the offline
    // grace window is still open.
    clock = NOW + 2 * 86400000;
    const online = await service.sync();
    assert.equal(online.state, 'expired');
    assert.equal(service.evaluate({ online: false }).state, 'offline_grace');
    assert.throws(() => service.requireAccess(), /SUBSCRIPTION_BLOCKED:expired/);
  }));

test('the privileged key detector understands service_role literals and JWTs', () => {
  const jwt = `x.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.y`;
  assert.equal(isPrivilegedKey('service_role'), true);
  assert.equal(isPrivilegedKey(`sb_secret_${'a'.repeat(20)}`), true);
  assert.equal(isPrivilegedKey(jwt), true);
  assert.equal(isPrivilegedKey('a'.repeat(48)), false);
  assert.equal(isPrivilegedKey(''), false);
});

test('the service_role key is refused by the database and the service', () =>
  withContext(({ database, admin, directory }) => {
    assert.throws(() => configure(database, admin, { anon_key: 'service_role_'.repeat(4) }), /service_role/);
    assert.throws(() => configure(database, admin, { client_key: `sb_secret_${'k'.repeat(24)}` }), /service_role|secret/);

    const service = new SubscriptionService({ database, userDataDir: directory, safeStorage: null, now: () => NOW });
    assert.throws(
      () => service.saveConfig(admin, {
        supabase_url: 'https://example-project.supabase.co',
        anon_key: 'service_role_'.repeat(4),
        business_id: BUSINESS_ID,
        client_key: 'c'.repeat(48)
      }),
      /service_role/
    );
  }));

test('saved keys are encrypted at rest and still usable for sync', () =>
  withContext(async ({ database, admin, directory }) => {
    const service = new SubscriptionService({
      database, userDataDir: directory, safeStorage: null,
      fetchImpl: fakeFetch(payload()), now: () => NOW
    });
    service.saveConfig(admin, {
      supabase_url: 'https://example-project.supabase.co',
      anon_key: 'a'.repeat(48),
      business_id: BUSINESS_ID,
      client_key: 'c'.repeat(48),
      enforced: true,
      offline_grace_days: 3
    });

    const rows = Object.fromEntries(database.db.prepare("SELECT key, value FROM settings WHERE key LIKE 'subscription_%'").all().map((row) => [row.key, row.value]));
    assert.match(rows.subscription_anon_key, /^aes1:/);
    assert.match(rows.subscription_client_key, /^aes1:/);
    assert.equal(rows.subscription_anon_key.includes('a'.repeat(48)), false);
    assert.equal(rows.subscription_client_key.includes('c'.repeat(48)), false);
    assert.equal(service.config().anon_key, 'a'.repeat(48));
    assert.equal(service.config().client_key, 'c'.repeat(48));
    assert.equal(service.publicConfig().keyStorage, 'encrypted-aes');
    assert.equal(service.publicConfig().configured, true);
    assert.equal(service.publicConfig().missingFields.length, 0);

    const status = await service.sync();
    assert.equal(status.state, 'active');
    assert.equal(status.canUse, true);
  }));

test('enforcement cannot be switched on with an incomplete configuration', () =>
  withContext(({ database, admin, directory }) => {
    const service = new SubscriptionService({ database, userDataDir: directory, safeStorage: null, now: () => NOW });
    assert.throws(
      () => service.saveConfig(admin, { supabase_url: 'https://example-project.supabase.co', enforced: true }),
      /Cannot require an active package/
    );
    // Saving a partial draft without enforcement stays allowed.
    service.saveConfig(admin, { supabase_url: 'https://example-project.supabase.co', enforced: false });
    const info = service.publicConfig();
    assert.equal(info.enforced, false);
    assert.deepEqual(info.missingFields, ['business_id', 'client_key']);
  }));

test('test connection verifies the trusted business without saving or caching', () =>
  withContext(async ({ database, admin, directory }) => {
    const calls = [];
    const service = new SubscriptionService({
      database, userDataDir: directory, safeStorage: null,
      fetchImpl: fakeFetch(payload(), calls), now: () => NOW
    });
    configure(database, admin);
    const result = await service.testConfig({});
    assert.equal(result.ok, true);
    assert.equal(result.businessName, 'Test Association');
    assert.equal(result.packageName, 'Yearly Business Package');
    assert.equal(result.price, 8000);
    assert.deepEqual(result.paymentMethods, ['bkash', 'nagad']);
    assert.equal(calls.at(-1).url, 'https://example-project.supabase.co/rest/v1/rpc/get_business_subscription');
    assert.equal(service.readCache().verifiedAt, null, 'the test must not verify the cached package');

    const draft = {
      supabase_url: 'https://example-project.supabase.co',
      anon_key: 'b'.repeat(48), business_id: BUSINESS_ID, client_key: 'd'.repeat(48)
    };
    const draftResult = await service.testConfig(draft);
    assert.equal(draftResult.ok, true);
    assert.equal(calls.at(-1).body.p_client_key, 'd'.repeat(48));
    assert.equal(service.config().client_key, 'c'.repeat(48), 'testing a draft must not persist it');

    await assert.rejects(
      service.testConfig({ ...draft, business_id: '22222222-2222-4333-8444-555555555555' }),
      /different business/
    );
  }));

test('test connection reports a rejected business and an unreachable server', () =>
  withContext(async ({ database, admin, directory }) => {
    configure(database, admin);
    const rejected = new SubscriptionService({
      database, userDataDir: directory, safeStorage: null, now: () => NOW,
      fetchImpl: async () => ({
        ok: false, status: 401,
        text: async () => JSON.stringify({ message: 'Invalid business credentials.' })
      })
    });
    await assert.rejects(rejected.testConfig({}), /Invalid business credentials/);

    const offline = new SubscriptionService({
      database, userDataDir: directory, safeStorage: null, now: () => NOW,
      fetchImpl: async () => { throw new Error('offline'); }
    });
    await assert.rejects(offline.testConfig({}), /offline/);
  }));

test('a saved payment flow stays pending and is never activated locally', () =>
  withContext(async ({ database, admin, directory }) => {
    configure(database, admin);
    const fetchImpl = async (url) => {
      if (url.endsWith('/submit_payment_request')) {
        return {
          ok: true, status: 200,
          text: async () => JSON.stringify({
            id: 'aaaaaaaa-bbbb-4ccc-8ddd-ffffffffffff',
            status: 'pending',
            message: 'Your payment request has been submitted successfully. Please wait for manual verification.'
          })
        };
      }
      return {
        ok: true, status: 200,
        text: async () => JSON.stringify(payload({
          status: 'pending',
          requests: [{
            id: 'aaaaaaaa-bbbb-4ccc-8ddd-ffffffffffff', payment_method: 'nagad',
            transaction_id: 'TXN-777', amount: 8000, status: 'pending',
            submitted_at: new Date(NOW).toISOString()
          }]
        }))
      };
    };
    const service = new SubscriptionService({ database, userDataDir: directory, safeStorage: null, fetchImpl, now: () => NOW });
    const result = await service.submitPayment({
      business_name: 'Test Association', contact_number: '01700000000',
      payment_method: 'nagad', transaction_id: 'TXN-777', amount: 8000
    });
    assert.equal(result.status, 'pending');
    const status = service.evaluate({ online: true });
    assert.equal(status.state, 'pending');
    assert.equal(status.canUse, false);
  }));

