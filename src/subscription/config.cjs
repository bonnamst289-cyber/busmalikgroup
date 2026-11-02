// Shared validation for the Supabase connection settings. The desktop client
// only ever holds the public anon/publishable key and the per-business client
// key; the service_role key must never reach this application.

const REQUIRED_FIELDS = Object.freeze(['supabase_url', 'anon_key', 'business_id', 'client_key']);

// This build ships pointed at the owner's Supabase project. Only the public
// anon key is embedded — RLS and the server-side RPCs restrict what it can do,
// and an empty saved value means "use this preset".
const DEFAULT_CONNECTION = Object.freeze({
  supabase_url: 'https://hgavhgssxmbtqiqvrsyd.supabase.co',
  anon_key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhnYXZoZ3NzeG1idHFpcXZyc3lkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM0NjIwMDMsImV4cCI6MjEwOTAzODAwM30.LszC_9aViW1_SiU_AkhGOtzpIRpZEnbJtE3r0bSgK3M'
});

const FIELD_LABELS = Object.freeze({
  supabase_url: 'Supabase project URL',
  anon_key: 'Supabase publishable/anon key',
  business_id: 'Business ID',
  client_key: 'Client key'
});

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HTTPS_URL_PATTERN = /^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*$/i;
const LOCALHOST_URL_PATTERN = /^http:\/\/localhost(:\d+)?$/i;

function normalizeUrl(value) {
  return String(value ?? '').trim().replace(/\/+$/, '');
}

function normalizeBusinessId(value) {
  return String(value ?? '').trim().toLowerCase();
}

function trimValue(value) {
  return String(value ?? '').trim();
}

function withConnectionDefaults(settings = {}) {
  return {
    ...settings,
    supabase_url: trimValue(settings.supabase_url) || DEFAULT_CONNECTION.supabase_url,
    anon_key: trimValue(settings.anon_key) || DEFAULT_CONNECTION.anon_key
  };
}

// A service_role (or new-style sb_secret_) value can bypass every RLS policy on
// the Supabase project, so it is refused everywhere: in the UI, in the database
// layer and before an RPC is attempted.
function isPrivilegedKey(value) {
  const text = trimValue(value);
  if (!text) return false;
  if (/service_role/i.test(text)) return true;
  if (/^sb_secret_/i.test(text)) return true;
  const parts = text.split('.');
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
      if (payload && String(payload.role || '').toLowerCase() === 'service_role') return true;
    } catch {
      // Not a decodable JWT; the literal checks above are enough.
    }
  }
  return false;
}

function validateField(field, value) {
  switch (field) {
    case 'supabase_url': {
      const url = normalizeUrl(value);
      if (!HTTPS_URL_PATTERN.test(url) && !LOCALHOST_URL_PATTERN.test(url)) {
        return 'Supabase URL must be an https:// address.';
      }
      return null;
    }
    case 'anon_key':
      if (isPrivilegedKey(value)) {
        return 'Never use the Supabase service_role or secret key. Paste the public anon/publishable key instead.';
      }
      if (trimValue(value).length < 20) return 'The Supabase anon key is too short.';
      return null;
    case 'business_id':
      if (!UUID_PATTERN.test(normalizeBusinessId(value))) return 'Business ID must be a valid UUID.';
      return null;
    case 'client_key':
      if (isPrivilegedKey(value)) {
        return 'Never use the Supabase service_role or secret key as the client key.';
      }
      if (trimValue(value).length < 16) return 'The business client key is too short.';
      return null;
    default:
      return null;
  }
}

// Inspects a full (already merged) configuration and reports exactly what is
// missing or invalid, instead of one generic error.
function inspectSubscriptionConfig(settings = {}) {
  const missingFields = [];
  const invalidFields = [];
  for (const field of REQUIRED_FIELDS) {
    if (!trimValue(settings[field])) {
      missingFields.push(field);
      continue;
    }
    const message = validateField(field, settings[field]);
    if (message) invalidFields.push({ field, message });
  }
  return {
    complete: missingFields.length === 0,
    valid: invalidFields.length === 0,
    configured: missingFields.length === 0 && invalidFields.length === 0,
    missingFields,
    invalidFields,
    errors: invalidFields.map((entry) => entry.message)
  };
}

function missingFieldLabels(inspection) {
  return inspection.missingFields.map((field) => FIELD_LABELS[field] || field);
}

// The exact sentence shown to the user when online payment is unavailable.
function describeConfigProblem(inspection) {
  if (inspection.complete && inspection.valid) return '';
  const parts = [];
  if (inspection.missingFields.length) parts.push(`missing ${missingFieldLabels(inspection).join(', ')}`);
  if (inspection.invalidFields.length) parts.push(inspection.errors.join(' '));
  return `Online payment is not configured: ${parts.join('; ')}. Ask your administrator to fix the Subscription settings.`;
}

function storageKind(anonKey, clientKey) {
  const values = [anonKey, clientKey].filter((value) => trimValue(value));
  if (!values.length) return 'none';
  if (values.every((value) => String(value).startsWith('enc1:'))) return 'encrypted-safe';
  if (values.every((value) => String(value).startsWith('aes1:'))) return 'encrypted-aes';
  return 'plaintext';
}

module.exports = {
  REQUIRED_FIELDS,
  FIELD_LABELS,
  DEFAULT_CONNECTION,
  withConnectionDefaults,
  normalizeUrl,
  normalizeBusinessId,
  isPrivilegedKey,
  validateField,
  inspectSubscriptionConfig,
  missingFieldLabels,
  describeConfigProblem,
  storageKind
};
