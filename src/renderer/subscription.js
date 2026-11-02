/* Subscription screens: modern buy flow, status page and expired gate.
   Loaded before app.js; every reference to app.js helpers is resolved at call
   time, after the main script has run. */
(function () {
  const api = () => window.somiti.subscription;
  const subState = { status: null, info: null, selectedMethod: 'bkash', timer: null, configOpen: false };

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

  // Electron prefixes thrown IPC errors; the administrator only needs the text.
  function cleanError(message) {
    return String(message || '')
      .replace(/^Error invoking remote method '[^']*':\s*/, '')
      .replace(/^Error:\s*/, '');
  }

  function notify(message) {
    if (typeof window.toast === 'function') window.toast(message);
  }

  function money(amount) {
    return `৳${Number(amount || 0).toLocaleString('en-US')}`;
  }

  function date(value) {
    if (!value) return '—';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '—';
    return parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function dateTime(value) {
    if (!value) return '—';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '—';
    return parsed.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function methodLabel(method) {
    return method === 'nagad' ? 'Nagad' : 'bKash';
  }

  function methodLogo(method) {
    return method === 'nagad' ? '../../assets/nagad.png' : '../../assets/bkash.png';
  }

  function statusMeta(status) {
    if (!status) return { label: 'Checking…', cls: 'pending', detail: 'Reading the saved package status.' };
    if (!status.configured) {
      return { label: 'Not configured', cls: 'none', detail: 'Online subscription is not configured on this installation.' };
    }
    if (!status.enforced) {
      return { label: 'Enforcement off', cls: 'none', detail: 'Your administrator has not enabled subscription enforcement.' };
    }
    const map = {
      active: ['Active', 'active'],
      offline_grace: ['Offline grace', 'pending'],
      expired: ['Expired', 'expired'],
      pending: ['Pending Approval', 'pending'],
      rejected: ['Rejected', 'rejected'],
      verification_required: ['Verification required', 'pending'],
      disabled: ['Enforcement off', 'none'],
      not_configured: ['Not configured', 'none']
    };
    const [label, cls] = map[status.state] || [status.state || 'Unknown', 'none'];
    return { label, cls, detail: status.message || '' };
  }

  function badge(status) {
    const meta = statusMeta(status);
    return `<span class="buy-badge ${meta.cls}">${esc(meta.label)}</span>`;
  }

  function packageOf(status) {
    return status?.package || { packageCode: 'YEARLY_8000', packageName: 'Yearly Business Package', price: 8000, currency: 'BDT', durationDays: 365 };
  }

  function subscriptionFacts(status) {
    const pkg = packageOf(status);
    const sub = status?.subscription || null;
    return {
      packageName: pkg.packageName || 'Yearly Business Package',
      price: Number(pkg.price || 8000),
      days: Number(pkg.durationDays || 365),
      start: sub?.startDate ? date(sub.startDate) : '—',
      expiry: sub?.expiryDate ? date(sub.expiryDate) : '—',
      remaining: status?.daysRemaining ?? 0,
      status: sub?.status || 'none'
    };
  }

  function factsHtml(status) {
    const facts = subscriptionFacts(status);
    return `<div class="buy-status-row"><span>Package</span><strong>${esc(facts.packageName)}</strong></div>
      <div class="buy-status-row"><span>Price</span><strong>${money(facts.price)} · ${facts.days} days</strong></div>
      <div class="buy-status-row"><span>Status</span><strong>${badge(status)}</strong></div>
      <div class="buy-status-row"><span>Start date</span><strong>${esc(facts.start)}</strong></div>
      <div class="buy-status-row"><span>Expiry date</span><strong>${esc(facts.expiry)}</strong></div>
      <div class="buy-status-row"><span>Days remaining</span><strong>${esc(String(facts.remaining))}</strong></div>`;
  }

  // -------------------------------------------------------------------------
  // Login-screen package card
  // -------------------------------------------------------------------------
  async function refreshAuthCard() {
    const body = document.getElementById('auth-package-body');
    if (!body) return;
    try {
      const status = await api().status();
      subState.status = status;
      const meta = statusMeta(status);
      const facts = subscriptionFacts(status);
      const detail = !status.configured
        ? esc(status.configError || 'Ask your administrator to connect this installation to Supabase.')
        : (!status.enforced
          ? 'Existing features remain available. Subscription enforcement is off.'
          : (status.state === 'active'
            ? `Active until <strong>${esc(facts.expiry)}</strong> · ${facts.remaining} days remaining`
            : esc(meta.detail || meta.label)));
      body.innerHTML = `<div>${badge(status)}</div><div>${detail}</div>
        <div class="muted">Last verified: ${esc(dateTime(status.lastSyncAt))}</div>`;
    } catch (error) {
      body.innerHTML = `<div>${esc(cleanError(error.message) || 'Package status is unavailable.')}</div>`;
    }
  }

  // -------------------------------------------------------------------------
  // Buy package
  // -------------------------------------------------------------------------
  function showBuy() {
    const shell = document.getElementById('buy-package');
    if (!shell) return;
    shell.hidden = false;
    shell.scrollTop = 0;
    const mounted = loadBuy();
    mounted.catch(() => {});
  }

  function hideBuy() {
    const shell = document.getElementById('buy-package');
    if (shell) shell.hidden = true;
    const success = document.getElementById('buy-success');
    if (success) { success.hidden = true; success.innerHTML = ''; }
    const error = document.getElementById('buy-error');
    if (error) error.textContent = '';
  }

  async function loadBuy() {
    const shell = document.getElementById('buy-package');
    if (!shell || shell.hidden) return;
    try {
      const info = await api().buyInfo();
      subState.info = info;
      subState.status = info;
      renderBuy(info);
    } catch (error) {
      const methods = document.getElementById('buy-methods');
      if (methods) methods.innerHTML = `<div class="buy-history-empty">${esc(cleanError(error.message))}</div>`;
    }
  }

  function renderBuy(info) {
    const summary = document.getElementById('buy-summary');
    if (!summary) return;
    const facts = subscriptionFacts(info);
    summary.innerHTML = `<div>
        <h2>Yearly Business Package</h2>
        <p>One package for your whole business. Every cashier and staff account shares it. Pay manually with bKash or Nagad, then wait for verification.</p>
        <div class="buy-actions buy-badge-row">${badge(info)}</div>
      </div>
      <div class="buy-hero-facts">
        <div><span>Price</span><strong>${money(facts.price)}</strong></div>
        <div><span>Duration</span><strong>${facts.days} days</strong></div>
        <div><span>Currency</span><strong>BDT</strong></div>
      </div>`;

    const methods = info.paymentSettings && info.paymentSettings.length
      ? info.paymentSettings.filter((row) => row.enabled !== false)
      : [
        { paymentMethod: 'bkash', accountNumber: '01331707900', accountType: 'Personal', instructions: '', enabled: true },
        { paymentMethod: 'nagad', accountNumber: '01783026754', accountType: 'Personal', instructions: '', enabled: true }
      ];
    if (!methods.length) methods.push(
      { paymentMethod: 'bkash', accountNumber: '01331707900', accountType: 'Personal', instructions: '', enabled: true },
      { paymentMethod: 'nagad', accountNumber: '01783026754', accountType: 'Personal', instructions: '', enabled: true }
    );

    if (!methods.some((row) => row.paymentMethod === subState.selectedMethod)) {
      subState.selectedMethod = methods[0].paymentMethod;
    }

    const holder = document.getElementById('buy-methods');
    holder.innerHTML = methods.map((row) => `<button type="button" class="buy-method ${row.paymentMethod === subState.selectedMethod ? 'is-active' : ''}" data-method="${esc(row.paymentMethod)}">
        <span class="buy-method-logo"><img src="${methodLogo(row.paymentMethod)}" alt="${esc(methodLabel(row.paymentMethod))} logo"></span>
        <span><strong>${esc(methodLabel(row.paymentMethod))}</strong><span>Personal · Send Money</span></span>
        <span class="buy-method-check">✓</span>
      </button>`).join('');
    holder.querySelectorAll('[data-method]').forEach((button) => button.addEventListener('click', () => {
      subState.selectedMethod = button.dataset.method;
      const select = document.getElementById('buy-method-select');
      if (select) select.value = subState.selectedMethod;
      holder.querySelectorAll('[data-method]').forEach((item) => item.classList.toggle('is-active', item === button));
      renderAccount(methods);
    }));

    const select = document.getElementById('buy-method-select');
    if (select) {
      select.innerHTML = methods.map((row) => `<option value="${esc(row.paymentMethod)}" ${row.paymentMethod === subState.selectedMethod ? 'selected' : ''}>${esc(methodLabel(row.paymentMethod))}</option>`).join('');
      select.value = subState.selectedMethod;
      select.onchange = () => {
        subState.selectedMethod = select.value;
        renderBuy(info);
      };
    }

    renderAccount(methods);
    renderBuyStatus(info);
    renderHistory(info.paymentRequests || []);

    const businessName = document.getElementById('buy-business-name');
    const contact = document.getElementById('buy-contact');
    if (businessName && !businessName.value) businessName.value = info.businessName || '';
    if (contact && !contact.value) contact.value = info.contactNumber || '';

    const submit = document.getElementById('buy-submit');
    const notice = document.getElementById('buy-error');
    if (submit) {
      submit.disabled = !info.configured;
      if (!info.configured) {
        if (notice) notice.textContent = info.configError
          || 'Online payment is not configured. Ask your administrator to add the Supabase URL, anon key, Business ID and client key in Subscription settings.';
      } else if (!notice.textContent || notice.textContent.startsWith('Online payment is not configured')) {
        notice.textContent = '';
      }
    }
  }

  function renderAccount(methods) {
    const holder = document.getElementById('buy-account');
    if (!holder) return;
    const selected = methods.find((row) => row.paymentMethod === subState.selectedMethod) || methods[0];
    if (!selected) { holder.innerHTML = ''; return; }
    holder.innerHTML = `<div class="buy-account-top">
        <div class="buy-account-brand">
          <img class="buy-account-logo" src="${methodLogo(selected.paymentMethod)}" alt="${esc(methodLabel(selected.paymentMethod))} logo">
          <div>
            <div class="buy-account-label">${esc(methodLabel(selected.paymentMethod))} personal number</div>
            <div class="buy-account-number">${esc(selected.accountNumber)}</div>
            <div class="buy-account-tags">
              <span class="buy-account-type">${esc(selected.accountType || 'Personal')}</span>
              <span class="buy-account-instruction">Send Money</span>
            </div>
          </div>
        </div>
        <button type="button" class="buy-copy" id="buy-copy">Copy Number</button>
      </div>
      <p>${esc(selected.instructions || `Send exactly ৳8,000 to this ${methodLabel(selected.paymentMethod)} Personal number using Send Money. Do not use Merchant Payment or Checkout. Then submit the Transaction ID below.`)}</p>`;
    const copy = document.getElementById('buy-copy');
    if (copy) copy.addEventListener('click', async () => {
      try {
        await api().copy(selected.accountNumber);
        copy.textContent = 'Copied ✓';
        setTimeout(() => { copy.textContent = 'Copy Number'; }, 1800);
      } catch (error) {
        notify(cleanError(error.message) || 'The number could not be copied.');
      }
    });
  }

  function renderBuyStatus(info) {
    const holder = document.getElementById('buy-status');
    if (!holder) return;
    const facts = subscriptionFacts(info);
    holder.innerHTML = `${factsHtml(info)}
      <div class="buy-status-row"><span>Last verified</span><strong>${esc(dateTime(info.lastSyncAt))}</strong></div>
      ${info.configured ? '' : `<div class="buy-status-row"><span>Online payment</span><strong>Not configured</strong></div>
        <div class="buy-status-row"><span>Missing</span><strong>${esc((info.missingFields || []).map((field) => ({ supabase_url: 'Supabase URL', anon_key: 'Anon key', business_id: 'Business ID', client_key: 'Client key' })[field] || field).join(', ') || 'Connection settings')}</strong></div>`}`;
    void facts;
  }

  function statusBadgeText(value) {
    return ({ pending: 'Pending Approval', approved: 'Approved', rejected: 'Rejected' })[value] || value;
  }

  function renderHistory(requests) {
    const holder = document.getElementById('buy-history');
    if (!holder) return;
    if (!requests.length) {
      holder.innerHTML = '<div class="buy-history-empty">No payment request has been submitted yet.</div>';
      return;
    }
    holder.innerHTML = requests.slice(0, 8).map((row) => `<div class="buy-history-item">
        <div class="buy-history-item-top"><strong><img class="buy-history-logo" src="${methodLogo(row.paymentMethod)}" alt="">${esc(methodLabel(row.paymentMethod))} · ${money(row.amount)}</strong><span class="buy-badge ${row.status === 'approved' ? 'active' : row.status === 'rejected' ? 'rejected' : 'pending'}">${esc(statusBadgeText(row.status))}</span></div>
        <span class="buy-range">TXN ${esc(row.transactionId)}</span>
        <span>Submitted ${esc(dateTime(row.submittedAt))}</span>
        ${row.status === 'rejected' && row.rejectionReason ? `<span>Reason: ${esc(row.rejectionReason)}</span>` : ''}
      </div>`).join('');
  }

  async function submitPayment(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = document.getElementById('buy-submit');
    const errorBox = document.getElementById('buy-error');
    const successBox = document.getElementById('buy-success');
    if (errorBox) errorBox.textContent = '';
    if (successBox) { successBox.hidden = true; successBox.innerHTML = ''; }
    const formData = Object.fromEntries(new FormData(form).entries());
    formData.business_name = String(formData.business_name || '').trim();
    formData.contact_number = String(formData.contact_number || '').trim();
    formData.transaction_id = String(formData.transaction_id || '').trim();
    formData.amount = Number(formData.amount || 8000);

    if (formData.business_name.length < 2) { if (errorBox) errorBox.textContent = 'Enter the business name.'; return; }
    if (!/^[0-9+\- ]{6,30}$/.test(formData.contact_number)) { if (errorBox) errorBox.textContent = 'Enter a valid contact number.'; return; }
    if (!['bkash', 'nagad'].includes(formData.payment_method)) { if (errorBox) errorBox.textContent = 'Choose bKash or Nagad.'; return; }
    if (formData.transaction_id.length < 4) { if (errorBox) errorBox.textContent = 'Enter the transaction ID from the payment confirmation.'; return; }
    if (formData.amount !== 8000) { if (errorBox) errorBox.textContent = 'Payment amount must be exactly 8000 BDT.'; return; }

    if (button) { button.disabled = true; button.textContent = 'Submitting…'; }
    try {
      await api().submitPayment(formData);
      if (successBox) {
        successBox.hidden = false;
        successBox.innerHTML = `<div class="buy-success-head"><strong>Payment request submitted</strong><span class="buy-badge pending">Pending Approval</span></div>
          <p>Transaction ID <b>${esc(formData.transaction_id)}</b> is waiting for the administrator to verify the payment. Your Yearly Business Package activates for 365 days only after approval.</p>`;
      }
      form.reset();
      const amount = document.getElementById('buy-amount');
      if (amount) amount.value = '8000';
      const select = document.getElementById('buy-method-select');
      if (select) select.value = subState.selectedMethod;
      await loadBuy();
      await refreshAuthCard();
    } catch (error) {
      if (errorBox) errorBox.textContent = cleanError(error.message) || 'The payment request could not be submitted.';
    } finally {
      if (button) { button.disabled = false; button.textContent = 'Submit Payment Request'; }
    }
  }

  // -------------------------------------------------------------------------
  // Post-login gate and polling
  // -------------------------------------------------------------------------
  function renderGate(status) {
    const gate = document.getElementById('sub-gate');
    if (!gate) return;
    const meta = statusMeta(status);
    const facts = subscriptionFacts(status);
    const title = status?.state === 'expired'
      ? 'Your package has expired'
      : status?.state === 'pending'
        ? 'Payment verification pending'
        : status?.state === 'rejected'
          ? 'Payment request rejected'
          : status?.state === 'verification_required'
            ? 'Verify your package online'
            : 'Subscription required';
    gate.innerHTML = `<div class="sub-gate-card">
      <img class="brand-mark brand-logo" src="../../assets/logo.png" alt="">

      <h2>${esc(title)}</h2>
      <p class="sub-gate-message">${esc(meta.detail || 'Activate the Yearly Business Package to continue.')}</p>
      <div class="sub-gate-facts">
        <div><span>Package</span><strong>${esc(facts.packageName)}</strong></div>
        <div><span>Status</span><strong>${esc(meta.label)}</strong></div>
        <div><span>Expiry</span><strong>${esc(facts.expiry)}</strong></div>
        <div><span>Days remaining</span><strong>${esc(String(facts.remaining))}</strong></div>
      </div>
      <div class="sub-gate-actions">
        <button type="button" class="button button-primary" id="sub-gate-buy">Buy / Renew Package</button>
        <button type="button" class="button button-outline" id="sub-gate-sync">Retry verification</button>
        ${window.somitiState?.user?.role === 'admin' ? '<button type="button" class="button button-outline" id="sub-gate-setup">Setup Supabase</button>' : ''}
        <button type="button" class="button button-outline" id="sub-gate-logout">Sign out</button>
      </div>
    </div>`;
    gate.hidden = false;
    const buy = document.getElementById('sub-gate-buy');
    if (buy) buy.addEventListener('click', showBuy);
    const logout = document.getElementById('sub-gate-logout');
    if (logout) logout.addEventListener('click', async () => {
      try { await window.somiti.auth.logout(); } catch { /* ignore */ }
      if (window.somitiState) window.somitiState.user = null;
      stop();
      gate.hidden = true;
      hideBuy();
      if (typeof window.showAuth === 'function') window.showAuth();
    });
    const sync = document.getElementById('sub-gate-sync');
    if (sync) sync.addEventListener('click', async () => {
      sync.disabled = true;
      sync.textContent = 'Verifying…';
      try {
        const next = await api().sync();
        subState.status = next;
        if (next.canUse || !next.enforced) {
          gate.hidden = true;
          await resumeApp(next);
        } else {
          renderGate(next);
        }
      } catch (error) {
        notify(cleanError(error.message) || 'Verification failed.');
      } finally {
        sync.disabled = false;
        sync.textContent = 'Retry verification';
      }
    });
    const setup = document.getElementById('sub-gate-setup');
    if (setup) setup.addEventListener('click', openConfigModal);
  }

  async function resumeApp(status) {
    const app = document.getElementById('app');
    const auth = document.getElementById('auth');
    if (auth) auth.hidden = true;
    if (app) app.hidden = false;
    if (typeof window.initializeApp === 'function') await window.initializeApp();
    if (status?.enforced) startPolling();
  }

  async function afterLogin(loginStatus) {
    const gate = document.getElementById('sub-gate');
    let status = loginStatus;
    if (!status) {
      try { status = await api().status({ forceSync: true }); } catch { status = await api().status({ allowNetwork: false }); }
    }
    subState.status = status;
    const blocked = status && status.configured && status.enforced && !status.canUse;
    if (blocked) {
      const app = document.getElementById('app');
      if (app) app.hidden = true;
      renderGate(status);
      startPolling();
      return false;
    }
    if (gate) gate.hidden = true;
    const app = document.getElementById('app');
    if (app) app.hidden = false;
    startPolling();
    return true;
  }

  function startPolling() {
    stop();
    subState.timer = setInterval(async () => {
      try {
        const status = await api().status({ allowNetwork: true });
        subState.status = status;
        if (status?.configured && status.enforced && !status.canUse) {
          const app = document.getElementById('app');
          if (app) app.hidden = true;
          renderGate(status);
        } else if (status?.canUse) {
          const gate = document.getElementById('sub-gate');
          if (gate && !gate.hidden) {
            gate.hidden = true;
            await resumeApp(status);
          }
        }
      } catch {
        // Offline is normal; the verified cache remains authoritative.
      }
    }, 5 * 60 * 1000);
  }

  function stop() {
    if (subState.timer) clearInterval(subState.timer);
    subState.timer = null;
  }

  // -------------------------------------------------------------------------
  // Subscription page and admin configuration
  // -------------------------------------------------------------------------
  const KEY_STORAGE_LABELS = {
    'encrypted-safe': 'Encrypted with Windows secure storage',
    'encrypted-aes': 'Encrypted with a local key file',
    plaintext: 'Stored as plain text (legacy)',
    none: 'Not stored'
  };

  function keyStorageLabel(value) {
    return KEY_STORAGE_LABELS[value] || KEY_STORAGE_LABELS.none;
  }

  function looksPrivileged(value) {
    const text = String(value || '').trim();
    if (!text) return false;
    if (/service_role/i.test(text)) return true;
    if (/^sb_secret_/i.test(text)) return true;
    const parts = text.split('.');
    if (parts.length === 3) {
      try {
        const base = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const padded = base + '='.repeat((4 - (base.length % 4)) % 4);
        const payload = JSON.parse(atob(padded));
        if (payload && String(payload.role || '').toLowerCase() === 'service_role') return true;
      } catch {
        // Not a decodable JWT.
      }
    }
    return false;
  }

  // Mirrors the main-process validator so the administrator sees the exact
  // problem before a round trip. Blank keys are allowed only when one is saved.
  function validateConfigDraft(values, saved) {
    const errors = {};
    const url = String(values.supabase_url || '').trim().replace(/\/+$/, '');
    const anonKey = String(values.anon_key || '').trim();
    const businessId = String(values.business_id || '').trim();
    const clientKey = String(values.client_key || '').trim();

    if (!url) errors.supabase_url = 'Supabase project URL is required.';
    else if (!/^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*$/i.test(url) && !/^http:\/\/localhost(:\d+)?$/i.test(url)) {
      errors.supabase_url = 'Enter an https:// project URL, for example https://your-project.supabase.co';
    }

    if (!anonKey && !saved.has_anon_key) errors.anon_key = 'The Supabase publishable/anon key is required.';
    else if (anonKey && looksPrivileged(anonKey)) errors.anon_key = 'This is a secret/service_role key. Paste the public anon or publishable key instead.';
    else if (anonKey && anonKey.length < 20) errors.anon_key = 'The anon key is too short. Paste the complete key.';

    if (!businessId) errors.business_id = 'Business ID is required.';
    else if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(businessId)) {
      errors.business_id = 'Business ID must be the business UUID from the Supabase table.';
    }

    if (!clientKey && !saved.has_client_key) errors.client_key = 'The business client key is required.';
    else if (clientKey && looksPrivileged(clientKey)) errors.client_key = 'Never use a service_role key as the client key.';
    else if (clientKey && clientKey.length < 16) errors.client_key = 'The client key is too short. Paste the complete value.';

    return errors;
  }

  function configState(settings, health) {
    if (!settings) return { label: 'Unavailable', cls: 'none', detail: 'Configuration could not be loaded.' };
    if (settings.secretError) return { label: 'Key unreadable', cls: 'expired', detail: settings.secretError };
    if (settings.configured) {
      return {
        label: health?.lastVerifiedAt ? 'Verified' : 'Saved · not verified',
        cls: health?.lastVerifiedAt ? 'active' : 'pending',
        detail: health?.lastError || ''
      };
    }
    if (settings.complete) return { label: 'Invalid values', cls: 'expired', detail: settings.configError || '' };
    return { label: 'Not configured', cls: 'none', detail: settings.configError || 'Add the Supabase URL, anon key, Business ID and client key.' };
  }

  function statusRowHtml(settings, health) {
    const state = configState(settings, health);
    const missing = (settings?.missingFields || []).map((field) => ({
      supabase_url: 'Supabase project URL', anon_key: 'Supabase anon key',
      business_id: 'Business ID', client_key: 'Client key'
    })[field] || field);
    return `<div class="sub-config-view">
      <div class="sub-config-head">
        <span class="buy-badge ${state.cls}">${esc(state.label)}</span>
        <span class="muted">${esc(settings?.supabase_url || 'No Supabase project saved')}</span>
      </div>
      ${state.detail ? `<p class="sub-config-message">${esc(state.detail)}</p>` : ''}
      ${missing.length ? `<p class="sub-config-message sub-config-missing">Missing: ${esc(missing.join(', '))}</p>` : ''}
      ${settings?.invalidFields?.length ? `<ul class="sub-config-errors">${settings.invalidFields.map((entry) => `<li>${esc(entry.message)}</li>`).join('')}</ul>` : ''}
      ${settings?.secretError ? `<p class="sub-config-message sub-config-missing">${esc(settings.secretError)} Save the keys again.</p>` : ''}
      <div class="sub-config-facts">
        <div><span>Business</span><strong>${esc(settings?.business_name || '—')}</strong></div>
        <div><span>Business ID</span><strong class="sub-mono">${esc(settings?.business_id || '—')}</strong></div>
        <div><span>Contact</span><strong>${esc(settings?.contact_number || '—')}</strong></div>
        <div><span>Anon key</span><strong>${settings?.has_anon_key ? 'Saved' : 'Missing'}</strong></div>
        <div><span>Client key</span><strong>${settings?.has_client_key ? 'Saved' : 'Missing'}</strong></div>
        <div><span>Key storage</span><strong>${esc(keyStorageLabel(settings?.keyStorage))}</strong></div>
        <div><span>Enforcement</span><strong>${settings?.enforced ? 'Package required' : 'Not enforced'}</strong></div>
        <div><span>Offline grace</span><strong>${esc(String(settings?.offline_grace_days ?? 0))} days</strong></div>
        <div><span>Last verified</span><strong>${esc(dateTime(health?.lastVerifiedAt))}</strong></div>
      </div>
      <div class="sub-actions">
        <button type="button" class="button button-primary" data-role="sub-config-edit">Edit configuration</button>
        <button type="button" class="button button-outline" data-role="sub-config-test-saved">Test connection</button>
      </div>
      <div class="sub-test-result" data-role="sub-test-result" hidden></div>
    </div>`;
  }

  function configFormHtml(settings) {
    const value = (key) => esc(settings?.[key] || '');
    return `<form class="sub-config sub-config-form" novalidate>
      <div class="form-grid">
        <div class="field full">
          <label for="sub-url">Supabase project URL *</label>
          <input id="sub-url" name="supabase_url" type="url" placeholder="https://your-project.supabase.co" value="${value('supabase_url')}" autocomplete="off" spellcheck="false">
          <div class="sub-field-error" data-for="supabase_url"></div>
        </div>
        <div class="field full">
          <label for="sub-anon">Supabase publishable / anon key *</label>
          <div class="sub-secret">
            <input id="sub-anon" name="anon_key" type="password" autocomplete="off" spellcheck="false" placeholder="${settings?.has_anon_key ? 'Saved — leave blank to keep it' : 'Public anon or publishable key'}">
            <button type="button" class="button button-outline sub-reveal" data-reveal="sub-anon">Show</button>
          </div>
          <div class="sub-field-error" data-for="anon_key"></div>
        </div>
        <div class="field">
          <label for="sub-business-id">Business ID (UUID) *</label>
          <input id="sub-business-id" name="business_id" type="text" spellcheck="false" placeholder="00000000-0000-0000-0000-000000000000" value="${value('business_id')}" autocomplete="off">
          <div class="sub-field-error" data-for="business_id"></div>
        </div>
        <div class="field">
          <label for="sub-client-key">Business client key *</label>
          <div class="sub-secret">
            <input id="sub-client-key" name="client_key" type="password" autocomplete="off" spellcheck="false" placeholder="${settings?.has_client_key ? 'Saved — leave blank to keep it' : 'Client key from the businesses table'}">
            <button type="button" class="button button-outline sub-reveal" data-reveal="sub-client-key">Show</button>
          </div>
          <div class="sub-field-error" data-for="client_key"></div>
        </div>
        <div class="field">
          <label for="sub-business-name">Business name</label>
          <input id="sub-business-name" name="business_name" type="text" maxlength="200" placeholder="Association name" value="${value('business_name')}">
        </div>
        <div class="field">
          <label for="sub-contact">Contact number</label>
          <input id="sub-contact" name="contact_number" type="tel" maxlength="30" placeholder="01XXXXXXXXX" value="${value('contact_number')}">
        </div>
        <div class="field">
          <label for="sub-grace">Offline grace days (0–30)</label>
          <input id="sub-grace" name="offline_grace_days" type="number" min="0" max="30" value="${esc(String(settings?.offline_grace_days ?? 3))}">
        </div>
        <div class="field">
          <label>Enforcement</label>
          <label class="sub-check"><input type="checkbox" name="enforced" ${settings?.enforced ? 'checked' : ''}> Require an active package</label>
          <div class="sub-field-hint">The app cannot require a package until all four connection values are valid.</div>
        </div>
      </div>
      <p class="sub-config-hint">The desktop app stores only the public anon/publishable key and this business's client key, encrypted on this computer. Never paste the Supabase service_role key here. Payments are approved only in the Supabase Dashboard.</p>
      <div class="sub-config-error" data-role="sub-config-error"></div>
      <div class="sub-actions">
        <button class="button button-primary" type="submit" data-role="sub-config-save">Save configuration</button>
        <button class="button button-outline" type="button" data-role="sub-config-test">Test connection</button>
        <button class="button button-outline" type="button" data-role="sub-config-cancel">Cancel</button>
      </div>
      <div class="sub-test-result" data-role="sub-test-result" hidden></div>
    </form>`;
  }

  function configPanelHtml(info) {
    const settings = info?.settings || null;
    const health = info?.health || null;
    return `<div class="sub-config-panel" data-configured="${settings?.configured ? '1' : '0'}">
      ${statusRowHtml(settings, health)}
      ${configFormHtml(settings)}
    </div>`;
  }

  function setFieldErrors(root, errors) {
    root.querySelectorAll('.sub-field-error').forEach((node) => { node.textContent = ''; });
    root.querySelectorAll('.field input').forEach((input) => input.classList.remove('is-invalid'));
    for (const [field, message] of Object.entries(errors)) {
      const holder = root.querySelector(`.sub-field-error[data-for="${field}"]`);
      if (holder) holder.textContent = message;
      const input = root.querySelector(`[name="${field}"]`);
      if (input) input.classList.add('is-invalid');
    }
  }

  function mapServerError(message) {
    const text = String(message || '');
    if (/supabase url/i.test(text)) return { supabase_url: text };
    if (/anon|publishable/i.test(text)) return { anon_key: text };
    if (/business id/i.test(text)) return { business_id: text };
    if (/client key/i.test(text)) return { client_key: text };
    return {};
  }

  function renderTestResult(scope, result) {
    const box = scope?.querySelector('[data-role="sub-test-result"]');
    if (!box) return;
    box.hidden = false;
    if (!result) {
      box.className = 'sub-test-result is-error';
      box.innerHTML = `${esc(scope.dataset.testError || 'The connection test failed.')}`;
      return;
    }
    const methods = (result.paymentMethods || []).map((method) => methodLabel(method)).join(' / ');
    box.className = 'sub-test-result is-ok';
    box.innerHTML = `<strong>Connection verified</strong>
      <span>${esc(result.businessName || 'Business')} · ${esc(result.packageName || 'Yearly Business Package')}</span>
      <span>Server subscription: ${esc(result.subscriptionStatus || 'none')} · ${esc(String(result.daysRemaining ?? 0))} days remaining</span>
      <span>Payment methods: ${esc(methods || 'none configured')} · checked ${esc(dateTime(result.testedAt))}</span>`;
  }

  function readConfigDraft(form) {
    const data = Object.fromEntries(new FormData(form).entries());
    return {
      supabase_url: String(data.supabase_url || '').trim(),
      anon_key: String(data.anon_key || '').trim(),
      business_id: String(data.business_id || '').trim(),
      client_key: String(data.client_key || '').trim(),
      business_name: String(data.business_name || '').trim(),
      contact_number: String(data.contact_number || '').trim(),
      offline_grace_days: Number(data.offline_grace_days || 0),
      enforced: Boolean(form.querySelector('[name="enforced"]').checked)
    };
  }

  function bindConfigPanel(container, info, { onSaved } = {}) {
    const panel = container.querySelector('.sub-config-panel');
    const form = panel?.querySelector('.sub-config-form');
    if (!panel || !form) return;
    const view = panel.querySelector('.sub-config-view');
    const settings = info?.settings || {};
    const setMode = (mode) => {
      panel.dataset.mode = mode;
      view.hidden = mode !== 'view';
      form.hidden = mode !== 'edit';
      panel.querySelectorAll('[data-role="sub-test-result"]').forEach((box) => {
        box.hidden = true;
        box.innerHTML = '';
      });
      delete form.dataset.testError;
      delete view.dataset.testError;
    };
    setMode(settings.configured ? 'view' : 'edit');

    panel.querySelector('[data-role="sub-config-edit"]')?.addEventListener('click', () => setMode('edit'));
    panel.querySelector('[data-role="sub-config-cancel"]')?.addEventListener('click', () => {
      form.reset();
      setFieldErrors(form, {});
      setMode(settings.configured ? 'view' : 'edit');
    });
    panel.querySelectorAll('[data-reveal]').forEach((button) => button.addEventListener('click', () => {
      const input = panel.querySelector(`#${button.dataset.reveal}`);
      if (!input) return;
      const reveal = input.type === 'password';
      input.type = reveal ? 'text' : 'password';
      button.textContent = reveal ? 'Hide' : 'Show';
    }));

    const errorBox = panel.querySelector('[data-role="sub-config-error"]');
    const setError = (message) => { if (errorBox) errorBox.textContent = message || ''; };

    const runTest = async (draft, button, { skipValidation = false } = {}) => {
      const scope = form.hidden ? view : form;
      setError('');
      setFieldErrors(form, {});
      if (!skipValidation) {
        const errors = validateConfigDraft(draft, settings);
        if (Object.keys(errors).length) {
          setFieldErrors(form, errors);
          setError('Fix the highlighted fields before testing the connection.');
          return;
        }
      }
      const label = button?.textContent;
      if (button) { button.disabled = true; button.textContent = 'Testing…'; }
      try {
        const result = await api().testConfig(draft);
        renderTestResult(scope, result);
        notify(`Connection verified for ${result.businessName || 'this business'}.`);
      } catch (error) {
        const message = cleanError(error.message) || 'The connection test failed.';
        scope.dataset.testError = message;
        renderTestResult(scope, null);
        setFieldErrors(form, mapServerError(message));
        setError(message);
      } finally {
        if (button) { button.disabled = false; button.textContent = label; }
      }
    };

    panel.querySelector('[data-role="sub-config-test-saved"]')?.addEventListener('click', (event) => {
      runTest({}, event.currentTarget, { skipValidation: true });
    });
    panel.querySelector('[data-role="sub-config-test"]')?.addEventListener('click', (event) => {
      runTest(readConfigDraft(form), event.currentTarget);
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      setError('');
      setFieldErrors(form, {});
      const data = readConfigDraft(form);
      const errors = validateConfigDraft(data, settings);
      if (Object.keys(errors).length) {
        setFieldErrors(form, errors);
        setError('Fix the highlighted fields before saving.');
        return;
      }
      const button = form.querySelector('[data-role="sub-config-save"]');
      if (button) { button.disabled = true; button.textContent = 'Saving…'; }
      try {
        await api().saveConfig(data);
        notify('Subscription settings saved.');
        if (typeof onSaved === 'function') await onSaved();
      } catch (error) {
        const message = cleanError(error.message) || 'The settings could not be saved.';
        setFieldErrors(form, mapServerError(message));
        setError(message);
      } finally {
        if (button) { button.disabled = false; button.textContent = 'Save configuration'; }
      }
    });
  }

  async function afterConfigSaved() {
    await refreshAuthCard();
    let status = null;
    try { status = await api().sync(); } catch { status = null; }
    if (status) subState.status = status;
    if (status?.configured && status.enforced && !status.canUse) {
      renderGate(status);
      startPolling();
    } else if (status?.canUse) {
      const gate = document.getElementById('sub-gate');
      if (gate) gate.hidden = true;
      const app = document.getElementById('app');
      if (app && app.hidden) await resumeApp(status);
    }
    const page = document.getElementById('content');
    if (page && page.querySelector('.sub-hero')) await renderSubscriptionPage();
  }

  async function openConfigModal() {
    let info;
    try {
      info = await api().config();
    } catch (error) {
      notify(cleanError(error.message) || 'Subscription settings are available to administrators only.');
      return;
    }
    const root = document.getElementById('modal-root');
    if (!root) return;
    root.innerHTML = `<div class="modal-backdrop"><div class="modal modal-subconfig" role="dialog" aria-modal="true">
      <h2>Supabase subscription setup</h2>
      ${configPanelHtml(info)}
      <div class="modal-actions"><button type="button" class="button button-outline" id="sub-config-close">Close</button></div>
    </div></div>`;
    const close = () => { root.innerHTML = ''; };
    root.querySelector('#sub-config-close').addEventListener('click', close);
    root.querySelector('.modal-backdrop').addEventListener('click', (event) => { if (event.target === event.currentTarget) close(); });
    bindConfigPanel(root, info, { onSaved: async () => { close(); await afterConfigSaved(); } });
  }

  async function renderSubscriptionPage() {
    const content = document.getElementById('content');
    if (!content) return;
    let status;
    try {
      status = await api().sync();
    } catch {
      status = await api().status({ allowNetwork: false });
    }
    subState.status = status;
    const facts = subscriptionFacts(status);
    const meta = statusMeta(status);
    const isAdmin = window.somitiState?.user?.role === 'admin';
    let configInfo = null;
    if (isAdmin) {
      try { configInfo = await api().config(); } catch { configInfo = null; }
    }
    content.innerHTML = `<div class="sub-hero">
        <div class="sub-hero-card">
          <h2>${esc(facts.packageName)}</h2>
          <p>${esc(meta.detail || 'One package for every user in this business.')}</p>
          <div class="sub-hero-meta">
            <div><span>Price</span><strong>${money(facts.price)} / ${facts.days} days</strong></div>
            <div><span>Start date</span><strong>${esc(facts.start)}</strong></div>
            <div><span>Expiry date</span><strong>${esc(facts.expiry)}</strong></div>
          </div>
          <div class="sub-actions">
            <button type="button" class="button button-primary" id="sub-renew">Buy / Renew Package</button>
            <button type="button" class="button button-outline" id="sub-sync-now">Sync now</button>
          </div>
        </div>
        <div class="sub-metrics">
          <div class="sub-metric"><span>Current status</span><strong>${esc(meta.label)}</strong></div>
          <div class="sub-metric"><span>Days remaining</span><strong>${esc(String(facts.remaining))}</strong></div>
          <div class="sub-metric"><span>Last verified</span><strong class="sub-metric-small">${esc(dateTime(status.lastSyncAt))}</strong></div>
          <div class="sub-metric"><span>Offline grace</span><strong>${esc(String(status.offlineGraceDays ?? 0))} days</strong></div>
        </div>
      </div>
      <div class="panel"><div class="panel-heading"><h2>Payment requests</h2><span class="muted">${esc(status.configured ? 'Verified through Supabase' : 'Online payment is not configured')}</span></div>
        <div id="sub-page-history" class="buy-history"></div>
      </div>
      ${isAdmin ? `<div class="panel"><div class="panel-heading"><h2>Supabase configuration</h2><span class="muted">Administrator only</span></div>${configInfo ? configPanelHtml(configInfo) : '<div class="sub-empty">Configuration could not be loaded.</div>'}</div>` : ''}`;

    const renew = document.getElementById('sub-renew');
    if (renew) renew.addEventListener('click', showBuy);
    const sync = document.getElementById('sub-sync-now');
    if (sync) sync.addEventListener('click', async () => {
      sync.disabled = true;
      sync.textContent = 'Syncing…';
      try {
        subState.status = await api().sync();
        await refreshAuthCard();
        await renderSubscriptionPage();
      } catch (error) {
        notify(cleanError(error.message) || 'Sync failed.');
      } finally {
        sync.disabled = false;
        sync.textContent = 'Sync now';
      }
    });
    renderHistoryInto(document.getElementById('sub-page-history'), status.paymentRequests || []);
    if (isAdmin && configInfo) bindConfigPanel(content, configInfo, { onSaved: afterConfigSaved });
  }

  function renderHistoryInto(holder, requests) {
    if (!holder) return;
    if (!requests.length) { holder.innerHTML = '<div class="buy-history-empty">No payment request has been submitted yet.</div>'; return; }
    holder.innerHTML = requests.slice(0, 20).map((row) => `<div class="buy-history-item">
      <div class="buy-history-item-top"><strong>${esc(methodLabel(row.paymentMethod))} · ${money(row.amount)}</strong><span class="buy-badge ${row.status === 'approved' ? 'active' : row.status === 'rejected' ? 'rejected' : 'pending'}">${esc(statusBadgeText(row.status))}</span></div>
      <span class="buy-range">TXN ${esc(row.transactionId)}</span>
      <span>Submitted ${esc(dateTime(row.submittedAt))}${row.approvedAt ? ` · Approved ${esc(dateTime(row.approvedAt))}` : ''}</span>
      ${row.status === 'rejected' && row.rejectionReason ? `<span>Reason: ${esc(row.rejectionReason)}</span>` : ''}
    </div>`).join('');
  }

  // -------------------------------------------------------------------------
  // Wiring
  // -------------------------------------------------------------------------
  function bindStatic() {
    const form = document.getElementById('buy-form');
    if (form) form.addEventListener('submit', submitPayment);
    const back = document.getElementById('buy-back');
    if (back) back.addEventListener('click', hideBuy);
    const refresh = document.getElementById('buy-sync');
    if (refresh) refresh.addEventListener('click', async () => {
      refresh.disabled = true;
      refresh.textContent = 'Refreshing…';
      try { await loadBuy(); await refreshAuthCard(); } finally {
        refresh.disabled = false;
        refresh.textContent = 'Refresh status';
      }
    });
    const buy = document.getElementById('auth-buy-button');
    if (buy) buy.addEventListener('click', showBuy);
    const gateBuy = document.getElementById('sub-gate-buy');
    if (gateBuy) gateBuy.addEventListener('click', showBuy);
    const forgot = document.getElementById('auth-forgot');
    if (forgot) forgot.addEventListener('click', () => {
      const notice = document.getElementById('auth-notice');
      if (!notice) return;
      notice.hidden = false;
      notice.innerHTML = '<strong>Password help</strong><br>Ask an administrator to set a new password from <em>Users &amp; Permissions</em>. If you are the only administrator, contact AVA IT SOLUTION support for account recovery.';
    });
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      const buy = document.getElementById('buy-package');
      if (buy && !buy.hidden) hideBuy();
    });
  }

  window.SomitiSubscription = {
    refreshAuthCard,
    showBuy,
    hideBuy,
    afterLogin,
    stop,
    renderPage: renderSubscriptionPage,
    openConfigModal
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindStatic);
  else bindStatic();
})();


