const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const state = { user: null, page: 'dashboard', language: localStorage.getItem('language') || 'en', search: '', owners: [], buses: [], routes: [], funds: [], members: [], duesMonth: new Date().toISOString().slice(0, 7) };

const words = {
  en: {
    brand: 'Bus Malik Somiti', workspace: 'ASSOCIATION WORKSPACE', offline: 'Offline ready', logout: 'Sign out',
    dashboard: 'Dashboard', owners: 'Bus Owners', buses: 'Buses', routes: 'Routes', trips: 'Trip Management',
    members: 'Members', dues: 'Monthly Chanda', finance: 'Income & Expense', reports: 'Reports',
    users: 'Users & Permissions', settings: 'Settings & Backup', totalBuses: 'Total Buses', totalOwners: 'Bus Owners',
    totalRoutes: 'Routes', totalTrips: 'Total Trips', today: "Today's Collection", month: 'Monthly Collection',
    fundBalance: 'Total Fund Balance', expenses: 'Total Expenses', outstanding: 'Outstanding Dues',
    recent: 'Recent Transactions', fundsSummary: 'Fund Balances', add: 'Add New', search: 'Search records...',
    actions: 'Actions', edit: 'Edit', delete: 'Delete', save: 'Save', cancel: 'Cancel', noRows: 'No records found.',
    name: 'Name', mobile: 'Mobile Number', address: 'Address', nominee_name: 'Nominee Name', father_name: "Father's Name",
    photo_path: 'Photograph', route_number: 'Route Number', starting_point: 'Starting Point', destination: 'Destination',
    charge_bdt: 'Charge per trip (BDT)', description: 'Description', registration_number: 'Bus Registration Number',
    owner_id: 'Bus Owner', route_id: 'Route', driver_name: 'Driver Name', helper_name: 'Helper Name', status: 'Status',
    membership_date: 'Membership Date', member_type: 'Member Type', monthly_fee_bdt: 'Monthly Fee (BDT)',
    opening_balance_bdt: 'Opening Balance (BDT)', is_active: 'Active', date: 'Date', bus_id: 'Bus',
    trip_count: 'Number of Trips', payment_status: 'Payment Status', note: 'Note', fund_id: 'Fund',
    transaction_type: 'Transaction Type', category: 'Category', amount_bdt: 'Amount (BDT)', member_id: 'Member',
    description_label: 'Description', from_fund_id: 'From Fund', to_fund_id: 'To Fund',
    generate: 'Generate Monthly Dues', month_label: 'Month', pay: 'Record Payment', exportPdf: 'Export PDF',
    exportExcel: 'Export Excel', from: 'From Date', to: 'To Date', ledger: 'Transaction History',
    addIncome: 'Add Income', addExpense: 'Add Expense', transfer: 'Fund Transfer', backup: 'Backup Database',
    restore: 'Restore Database', changePassword: 'Change Password', username: 'Username', full_name: 'Full Name',
    password: 'Password (min 8 characters)', role: 'Role', administrator: 'Administrator', staff: 'Staff',
    login: 'Sign in', setup: 'Create administrator account', signInPrompt: 'Sign in to manage association operations.',
    setupPrompt: 'First-time setup: create your administrator account.', current_password: 'Current password',
    new_password: 'New password', transactions: 'Transactions', tripsReport: 'Trip Report', duesReport: 'Outstanding Dues',
    loading: 'Loading...', owner_code: 'Owner ID', member_code: 'Member ID', total: 'Total',
    confirmDelete: 'Delete this record? This may be blocked if related financial records exist.',
    saved: 'Saved successfully.', paymentSaved: 'Payment recorded and receipt generated.',
    noPermission: 'You do not have permission to perform this action.', routeIncome: 'Trip Collection',
    reportType: 'Report Type', tripDate: 'Trip Date', tripAmount: 'Trip Amount', receipt: 'Receipt',
    appSettings: 'Association Setup', setupHint: 'Change your password, manage local database backups, and configure staff accounts.',
    userHint: 'Only administrators can add users and configure staff access.',
    modal: 'Record details', invalid: 'Please check the required fields.',
    paid: 'Paid', unpaid: 'Unpaid', partial: 'Partial', active: 'Active', inactive: 'Inactive',
    transferDone: 'Fund transfer recorded.', backupDone: 'Database backup saved.', restoreDone: 'Database restored. Sign in again.',
    passwordChanged: 'Password changed.', selectFund: 'Select fund', selectOwner: 'Select owner',
    selectRoute: 'Select route', selectBus: 'Select bus', selectMember: 'Select member',
    tripCalculation: 'Calculated amount', amountWords: 'All amounts are stored as integer poisha.',
    typeIncome: 'Income', typeExpense: 'Expense', other: 'Other', starting: 'Start date'
  },
  bn: {
    brand: 'বাস মালিক সমিতি', workspace: 'সমিতি ব্যবস্থাপনা', offline: 'অফলাইনে প্রস্তুত', logout: 'লগ আউট',
    dashboard: 'ড্যাশবোর্ড', owners: 'বাস মালিক', buses: 'বাসসমূহ', routes: 'রুটসমূহ', trips: 'ট্রিপ ব্যবস্থাপনা',
    members: 'সদস্য', dues: 'মাসিক চাঁদা', finance: 'আয় ও ব্যয়', reports: 'রিপোর্ট',
    users: 'ব্যবহারকারী ও অনুমতি', settings: 'সেটিংস ও ব্যাকআপ', totalBuses: 'মোট বাস', totalOwners: 'বাস মালিক',
    totalRoutes: 'রুট', totalTrips: 'মোট ট্রিপ', today: 'আজকের আদায়', month: 'মাসিক আদায়',
    fundBalance: 'মোট তহবিল', expenses: 'মোট ব্যয়', outstanding: 'বকেয়া চাঁদা',
    recent: 'সাম্প্রতিক লেনদেন', fundsSummary: 'তহবিলের স্থিতি', add: 'নতুন যোগ করুন', search: 'খুঁজুন...',
    actions: 'কার্যক্রম', edit: 'সম্পাদনা', delete: 'মুছুন', save: 'সংরক্ষণ', cancel: 'বাতিল', noRows: 'কোনো তথ্য পাওয়া যায়নি।',
    name: 'নাম', mobile: 'মোবাইল নম্বর', address: 'ঠিকানা', nominee_name: 'মনোনীত ব্যক্তি', father_name: 'পিতার নাম',
    photo_path: 'ছবি', route_number: 'রুট নম্বর', starting_point: 'শুরুর স্থান', destination: 'গন্তব্য',
    charge_bdt: 'প্রতি ট্রিপ চার্জ (টাকা)', description: 'বিবরণ', registration_number: 'বাসের রেজিস্ট্রেশন নম্বর',
    owner_id: 'বাস মালিক', route_id: 'রুট', driver_name: 'চালকের নাম', helper_name: 'সহকারীর নাম', status: 'অবস্থা',
    membership_date: 'সদস্যপদ তারিখ', member_type: 'সদস্যের ধরন', monthly_fee_bdt: 'মাসিক চাঁদা (টাকা)',
    opening_balance_bdt: 'প্রারম্ভিক জমা (টাকা)', is_active: 'সক্রিয়', date: 'তারিখ', bus_id: 'বাস',
    trip_count: 'ট্রিপ সংখ্যা', payment_status: 'পরিশোধের অবস্থা', note: 'নোট', fund_id: 'তহবিল',
    transaction_type: 'লেনদেনের ধরন', category: 'খাত', amount_bdt: 'পরিমাণ (টাকা)', member_id: 'সদস্য',
    description_label: 'বিবরণ', from_fund_id: 'যে তহবিল থেকে', to_fund_id: 'যে তহবিলে',
    generate: 'মাসিক চাঁদা তৈরি', month_label: 'মাস', pay: 'চাঁদা গ্রহণ', exportPdf: 'PDF রপ্তানি',
    exportExcel: 'Excel রপ্তানি', from: 'শুরুর তারিখ', to: 'শেষ তারিখ', ledger: 'লেনদেনের তালিকা',
    addIncome: 'আয় যোগ', addExpense: 'ব্যয় যোগ', transfer: 'তহবিল স্থানান্তর', backup: 'ডাটাবেস ব্যাকআপ',
    restore: 'ডাটাবেস পুনরুদ্ধার', changePassword: 'পাসওয়ার্ড পরিবর্তন', username: 'ইউজারনেম', full_name: 'পূর্ণ নাম',
    password: 'পাসওয়ার্ড (কমপক্ষে ৮ অক্ষর)', role: 'ভূমিকা', administrator: 'প্রশাসক', staff: 'কর্মী',
    login: 'লগ ইন', setup: 'প্রশাসক অ্যাকাউন্ট তৈরি', signInPrompt: 'সমিতির কার্যক্রম পরিচালনায় লগ ইন করুন।',
    setupPrompt: 'প্রথমবার ব্যবহার: প্রশাসক অ্যাকাউন্ট তৈরি করুন।', current_password: 'বর্তমান পাসওয়ার্ড',
    new_password: 'নতুন পাসওয়ার্ড', transactions: 'লেনদেন', tripsReport: 'ট্রিপ রিপোর্ট', duesReport: 'বকেয়া চাঁদা',
    loading: 'লোড হচ্ছে...', owner_code: 'মালিক আইডি', member_code: 'সদস্য আইডি', total: 'মোট',
    confirmDelete: 'এই তথ্যটি মুছে ফেলবেন? সংশ্লিষ্ট আর্থিক তথ্য থাকলে মুছতে বাধা দেওয়া হবে।',
    saved: 'সফলভাবে সংরক্ষণ হয়েছে।', paymentSaved: 'পেমেন্ট সংরক্ষিত এবং রসিদ তৈরি হয়েছে.',
    noPermission: 'এই কাজের অনুমতি আপনার নেই।', routeIncome: 'ট্রিপ আদায়',
    reportType: 'রিপোর্টের ধরন', tripDate: 'ট্রিপের তারিখ', tripAmount: 'ট্রিপের পরিমাণ', receipt: 'রসিদ',
    appSettings: 'সমিতির সেটআপ', setupHint: 'পাসওয়ার্ড পরিবর্তন, ডাটাবেস ব্যাকআপ এবং কর্মী অ্যাকাউন্ট পরিচালনা করুন।',
    userHint: 'শুধু প্রশাসক ব্যবহারকারী যোগ এবং কর্মী অনুমতি নির্ধারণ করতে পারেন.',
    modal: 'তথ্য বিবরণ', invalid: 'আবশ্যক তথ্যগুলো যাচাই করুন।',
    paid: 'পরিশোধিত', unpaid: 'বকেয়া', partial: 'আংশিক', active: 'সক্রিয়', inactive: 'নিষ্ক্রিয়',
    transferDone: 'তহবিল স্থানান্তর সংরক্ষিত।', backupDone: 'ডাটাবেস ব্যাকআপ সংরক্ষিত।', restoreDone: 'ডাটাবেস পুনরুদ্ধার হয়েছে। আবার লগ ইন করুন।',
    passwordChanged: 'পাসওয়ার্ড পরিবর্তন হয়েছে।', selectFund: 'তহবিল নির্বাচন', selectOwner: 'মালিক নির্বাচন',
    selectRoute: 'রুট নির্বাচন', selectBus: 'বাস নির্বাচন', selectMember: 'সদস্য নির্বাচন',
    tripCalculation: 'হিসাবকৃত পরিমাণ', amountWords: 'সব অর্থ পয়সার পূর্ণসংখ্যা হিসেবে সংরক্ষিত হয়।',
    typeIncome: 'আয়', typeExpense: 'ব্যয়', other: 'অন্যান্য', starting: 'শুরুর তারিখ'
  }
};

const menu = [
  ['dashboard', '⌂'], ['owners', '♙'], ['buses', '▣'], ['routes', '⇄'], ['trips', '↗'],
  ['members', '♧'], ['dues', '৳'], ['finance', '◈'], ['reports', '▤'], ['users', '♙'], ['settings', '⚙']
];

const entityConfig = {
  owners: { title: 'owners', fields: [['name', 'text', true], ['nominee_name', 'text'], ['father_name', 'text'], ['mobile', 'tel'], ['address', 'textarea'], ['photo_path', 'photo']] },
  routes: { title: 'routes', fields: [['name', 'text', true], ['route_number', 'text', true], ['starting_point', 'text', true], ['destination', 'text', true], ['charge_bdt', 'number', true], ['description', 'textarea']] },
  buses: { title: 'buses', fields: [['registration_number', 'text', true], ['owner_id', 'owner', true], ['route_id', 'route'], ['driver_name', 'text'], ['helper_name', 'text'], ['status', 'bus-status']] },
  members: { title: 'members', fields: [['name', 'text', true], ['mobile', 'tel'], ['address', 'textarea'], ['membership_date', 'date', true], ['member_type', 'text'], ['status', 'member-status'], ['monthly_fee_bdt', 'number', true]] },
  funds: { title: 'funds', fields: [['name', 'text', true], ['opening_balance_bdt', 'number', true], ['is_active', 'checkbox']] },
  income_categories: { title: 'Income Categories', fields: [['name', 'text', true], ['is_active', 'checkbox']] },
  expense_categories: { title: 'Expense Categories', fields: [['name', 'text', true], ['is_active', 'checkbox']] }
};

function t(key) { return words[state.language][key] || key; }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }
function formatMoney(paisa) { return `৳ ${new Intl.NumberFormat(state.language === 'bn' ? 'bn-BD' : 'en-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format((Number(paisa) || 0) / 100)}`; }
function today() { return new Date().toISOString().slice(0, 10); }
function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  window.setTimeout(() => el.classList.remove('show'), 2700);
}
function setLanguage() {
  document.documentElement.lang = state.language;
  $$('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  $('#language-toggle').textContent = state.language === 'en' ? 'বাংলা' : 'English';
}
function label(field) { return t(field); }
function nav() {
  $('#navigation').innerHTML = menu.filter(([page]) => page !== 'users' || state.user?.role === 'admin')
    .map(([page, icon]) => `<button class="nav-link ${state.page === page ? 'active' : ''}" data-page="${page}"><span class="nav-icon">${icon}</span>${escapeHtml(t(page))}</button>`).join('');
  $$('#navigation [data-page]').forEach((button) => button.addEventListener('click', () => renderPage(button.dataset.page)));
}

async function showAuth() {
  $('#app').hidden = true;
  $('#auth').hidden = false;
  const setupNeeded = !(await window.somiti.auth.status());
  $('#auth-title').textContent = setupNeeded ? t('setup') : t('brand');
  $('#auth-description').textContent = setupNeeded ? t('setupPrompt') : t('signInPrompt');
  $('#auth-form').innerHTML = `${setupNeeded ? `<div class="field"><label>${t('full_name')}</label><input name="full_name" required></div>` : ''}
    <div class="field"><label>${t('username')}</label><input name="username" required autocomplete="username"></div>
    ${setupNeeded ? `<div class="field"><label>${t('password')}</label><input name="password" type="password" required minlength="8" autocomplete="new-password"></div>` :
      `<div class="field"><label>${t('password')}</label><input name="password" type="password" required autocomplete="current-password"></div>`}
    <button class="button button-primary" type="submit">${setupNeeded ? t('setup') : t('login')}</button>`;
  $('#auth-error').textContent = '';
  $('#auth-form').onsubmit = async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      state.user = setupNeeded ? await window.somiti.auth.setup(data) : await window.somiti.auth.login(data);
      $('#auth').hidden = true;
      $('#app').hidden = false;
      await initializeApp();
    } catch (error) { $('#auth-error').textContent = error.message; }
  };
}

async function initializeApp() {
  $('#user-label').textContent = `${state.user.full_name} · ${state.user.role === 'admin' ? t('administrator') : t('staff')}`;
  setLanguage();
  await loadLookups();
  await renderPage(state.page);
}

async function loadLookups() {
  const [owners, buses, routes, funds, members] = await Promise.all([
    window.somiti.records.list('owners'), window.somiti.records.list('buses'),
    window.somiti.records.list('routes'), window.somiti.records.list('funds'),
    window.somiti.records.list('members')
  ]);
  Object.assign(state, { owners, buses, routes, funds: funds.filter((fund) => fund.is_active), members });
}

function card(title, value, icon, note = '') {
  return `<div class="metric-card"><span class="metric-icon">${icon}</span><div class="metric-title">${escapeHtml(title)}</div><div class="metric-value">${escapeHtml(value)}</div><div class="metric-note">${escapeHtml(note)}</div></div>`;
}

async function renderDashboard() {
  const data = await window.somiti.dashboard.get();
  const values = data.totals;
  const recentRows = data.recent.map((row) => [row.date, row.category, row.party || '—', row.transaction_type === 'income' ? t('typeIncome') : t('typeExpense'), formatMoney(row.amount_paisa)]);
  const max = Math.max(1, ...data.funds.map((fund) => fund.balance_paisa));
  const fundRows = data.funds.map((fund) => `<div class="fund-row"><span class="fund-dot"></span>${escapeHtml(fund.name)}<strong>${formatMoney(fund.balance_paisa)}</strong></div>`).join('');
  const cards = [
    [t('totalBuses'), values.buses, '▣'], [t('totalOwners'), values.owners, '♙'], [t('totalRoutes'), values.routes, '⇄'], [t('totalTrips'), values.trips, '↗'],
    [t('today'), formatMoney(values.today_collection_paisa), '৳'], [t('month'), formatMoney(values.month_collection_paisa), '◷'],
    [t('fundBalance'), formatMoney(values.funds_paisa), '◈'], [t('expenses'), formatMoney(values.expenses_paisa), '↘'],
    [t('outstanding'), formatMoney(values.dues_paisa), '!']
  ];
  $('#content').innerHTML = `<div class="cards">${cards.map((item) => card(...item)).join('')}</div>
    <div class="dashboard-grid"><div class="panel"><div class="panel-heading"><h2>${t('recent')}</h2><button class="button button-outline button-small" data-go="finance">${t('ledger')}</button></div>
      ${table(['Date', t('category'), t('name'), t('transaction_type'), t('amount_bdt')], recentRows)}</div>
      <div class="panel"><div class="panel-heading"><h2>${t('fundsSummary')}</h2></div>${fundRows || `<div class="empty">${t('noRows')}</div>`}
      <div class="chart">${data.funds.map((fund) => `<div class="chart-column" title="${escapeHtml(fund.name)}: ${formatMoney(fund.balance_paisa)}"><div class="chart-bar chart-bar-${Math.min(10, Math.max(1, Math.ceil(fund.balance_paisa / max * 10)))}"></div><span class="chart-label">${escapeHtml(fund.name.slice(0, 8))}</span></div>`).join('')}</div></div></div>`;
  $$('[data-go]').forEach((button) => button.addEventListener('click', () => renderPage(button.dataset.go)));
}

function table(headers, rows, actions = null) {
  if (!rows.length) return `<div class="empty">${t('noRows')}</div>`;
  return `<div class="table-wrap"><table><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}${actions ? `<th>${t('actions')}</th>` : ''}</tr></thead>
    <tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}${actions ? `<td>${actions(row)}</td>` : ''}</tr>`).join('')}</tbody></table></div>`;
}

function ownerName(id) { return state.owners.find((item) => Number(item.id) === Number(id))?.name || '—'; }
function routeName(id) { return state.routes.find((item) => Number(item.id) === Number(id))?.name || '—'; }
function busName(id) { return state.buses.find((item) => Number(item.id) === Number(id))?.registration_number || '—'; }
function memberName(id) { return state.members.find((item) => Number(item.id) === Number(id))?.name || '—'; }
function status(value) { return `<span class="status ${String(value).toLowerCase()}">${escapeHtml(value)}</span>`; }
function standardColumns(entity) {
  const columns = {
    owners: [['owner_code', 'owner_code'], ['name', 'name'], ['mobile', 'mobile'], ['nominee_name', 'nominee_name'], ['address', 'address']],
    routes: [['route_number', 'route_number'], ['name', 'name'], ['starting_point', 'starting_point'], ['destination', 'destination'], ['charge_paisa', 'charge_bdt']],
    buses: [['registration_number', 'registration_number'], ['owner_id', 'owner_id'], ['route_id', 'route_id'], ['driver_name', 'driver_name'], ['status', 'status']],
    members: [['member_code', 'member_code'], ['name', 'name'], ['mobile', 'mobile'], ['member_type', 'member_type'], ['monthly_fee_paisa', 'monthly_fee_bdt'], ['status', 'status']],
    funds: [['name', 'name'], ['opening_balance_paisa', 'opening_balance_bdt'], ['is_active', 'is_active']],
    income_categories: [['name', 'name'], ['is_active', 'is_active']],
    expense_categories: [['name', 'name'], ['is_active', 'is_active']]
  };
  return columns[entity];
}
function displayValue(entity, row, field) {
  const value = row[field];
  if (field === 'owner_id') return escapeHtml(ownerName(value));
  if (field === 'route_id') return escapeHtml(routeName(value));
  if (field.endsWith('_paisa')) return formatMoney(value);
  if (field === 'is_active') return value ? t('active') : t('inactive');
  if (field === 'status') return status(value);
  if (field === 'address' && value?.length > 32) return `${escapeHtml(value.slice(0, 32))}…`;
  return escapeHtml(value || '—');
}

async function renderEntity(entity) {
  const cfg = entityConfig[entity];
  const records = await window.somiti.records.list(entity, state.search);
  if (entity === 'funds') state.funds = records.filter((fund) => fund.is_active);
  const columns = standardColumns(entity);
  const tableRows = records.map((record) => `<tr>${columns.map(([field]) => `<td>${displayValue(entity, record, field)}</td>`).join('')}<td><div class="action-cell">${['owners', 'buses', 'routes'].includes(entity) ? `<button class="button button-outline button-small" data-account-entity="${entity}" data-account-id="${record.id}">Account</button>` : ''}<button class="button button-outline button-small" data-edit="${record.id}">${t('edit')}</button><button class="button button-danger button-small" data-delete="${record.id}">${t('delete')}</button></div></td></tr>`).join('');
  $('#content').innerHTML = `<div class="toolbar"><input id="entity-search" class="search" placeholder="${t('search')}" value="${escapeHtml(state.search)}"><span class="spacer"></span><button id="add-record" class="button button-primary">＋ ${t('add')}</button></div>
    ${records.length ? `<div class="table-wrap"><table><thead><tr>${columns.map(([, title]) => `<th>${escapeHtml(label(title))}</th>`).join('')}<th>${t('actions')}</th></tr></thead><tbody>${tableRows}</tbody></table></div>` : `<div class="panel empty">${t('noRows')}</div>`}`;
  const search = $('#entity-search');
  let searchTimer;
  search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    state.search = search.value;
    searchTimer = setTimeout(() => renderEntity(entity), 180);
  });
  $('#add-record').addEventListener('click', () => openRecordForm(entity));
  $$('[data-edit]').forEach((button) => button.addEventListener('click', () => openRecordForm(entity, records.find((record) => record.id === Number(button.dataset.edit)))));
  $$('[data-account-entity]').forEach((button) => button.addEventListener('click', () => showAccount(button.dataset.accountEntity, Number(button.dataset.accountId))));
  $$('[data-delete]').forEach((button) => button.addEventListener('click', async () => {
    if (!confirm(t('confirmDelete'))) return;
    try { await window.somiti.records.delete(entity, Number(button.dataset.delete)); await loadLookups(); toast(t('saved')); renderEntity(entity); }
    catch (error) { toast(error.message); }
  }));
}

async function showAccount(entity, id) {
  try {
    if (entity === 'buses') {
      const account = await window.somiti.buses.account(id);
      const bus = account.bus;
      const trips = account.trips.map((trip) => `<tr><td>${escapeHtml(trip.date)}</td><td>${escapeHtml(trip.trip_code)}</td><td>${trip.trip_count}</td><td>${formatMoney(trip.total_paisa)}</td><td>${status(trip.payment_status)}</td></tr>`).join('');
      const payments = account.payments.map((item) => `<tr><td>${escapeHtml(item.date)}</td><td>${escapeHtml(item.category)}</td><td>${formatMoney(item.amount_paisa)}</td></tr>`).join('');
      showAccountDialog(`${bus.registration_number} · ${bus.owner_name}`, `<p class="subheading">${escapeHtml(bus.route_name || '—')} · ${escapeHtml(bus.status)}</p><h3>${t('trips')}</h3>${trips ? `<div class="table-wrap"><table><thead><tr><th>${t('date')}</th><th>Trip ID</th><th>${t('trip_count')}</th><th>${t('tripAmount')}</th><th>${t('payment_status')}</th></tr></thead><tbody>${trips}</tbody></table></div>` : `<div class="empty">${t('noRows')}</div>`}<h3>${t('ledger')}</h3>${payments ? `<div class="table-wrap"><table><thead><tr><th>${t('date')}</th><th>${t('category')}</th><th>${t('amount_bdt')}</th></tr></thead><tbody>${payments}</tbody></table></div>` : `<div class="empty">${t('noRows')}</div>`}`);
      return;
    }
    if (entity === 'routes') {
      const account = await window.somiti.routes.account(id);
      const route = account.route;
      const buses = account.buses.map((bus) => `<tr><td>${escapeHtml(bus.registration_number)}</td><td>${escapeHtml(bus.owner_name)}</td><td>${status(bus.status)}</td></tr>`).join('');
      const trips = account.trips.map((trip) => `<tr><td>${escapeHtml(trip.date)}</td><td>${escapeHtml(trip.registration_number)}</td><td>${escapeHtml(trip.owner_name)}</td><td>${trip.trip_count}</td><td>${formatMoney(trip.total_paisa)}</td><td>${status(trip.payment_status)}</td></tr>`).join('');
      showAccountDialog(route.name, `<p class="subheading">${escapeHtml(route.starting_point)} → ${escapeHtml(route.destination)} · ${formatMoney(route.charge_paisa)} / trip · Collection ${formatMoney(account.collection_paisa)}</p><h3>${t('buses')}</h3>${buses ? `<div class="table-wrap"><table><thead><tr><th>${t('registration_number')}</th><th>${t('owner_id')}</th><th>${t('status')}</th></tr></thead><tbody>${buses}</tbody></table></div>` : `<div class="empty">${t('noRows')}</div>`}<h3>${t('trips')}</h3>${trips ? `<div class="table-wrap"><table><thead><tr><th>${t('date')}</th><th>${t('bus_id')}</th><th>${t('owner_id')}</th><th>${t('trip_count')}</th><th>${t('tripAmount')}</th><th>${t('payment_status')}</th></tr></thead><tbody>${trips}</tbody></table></div>` : `<div class="empty">${t('noRows')}</div>`}`);
      return;
    }
    const account = await window.somiti.owners.account(id);
    const owner = account.owner;
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    const payments = account.payments.map((item) => `<tr><td>${escapeHtml(item.date)}</td><td>${escapeHtml(item.category)}</td><td>${item.transaction_type === 'income' ? t('typeIncome') : t('typeExpense')}</td><td>${formatMoney(item.amount_paisa)}</td></tr>`).join('');
    const buses = account.buses.map((bus) => `<tr><td>${escapeHtml(bus.registration_number)}</td><td>${escapeHtml(bus.route_name || '—')}</td><td>${status(bus.status)}</td></tr>`).join('');
    modal.innerHTML = `<div class="modal"><h2>${escapeHtml(owner.name)} · ${escapeHtml(owner.owner_code)}</h2>
      <p class="subheading">${escapeHtml(owner.mobile)} · ${escapeHtml(owner.address)}</p>
      <div class="cards">${card(t('buses'), account.buses.length, '▣')}${card(t('totalTrips'), account.totals.trips, '↗')}${card('Trip Charges', formatMoney(account.totals.trip_total), '৳')}${card(t('outstanding'), formatMoney(account.totals.outstanding), '!', '')}</div>
      <h3>${t('buses')}</h3>${buses ? `<div class="table-wrap"><table><thead><tr><th>${t('registration_number')}</th><th>${t('route_id')}</th><th>${t('status')}</th></tr></thead><tbody>${buses}</tbody></table></div>` : `<div class="empty">${t('noRows')}</div>`}
      <h3>${t('ledger')}</h3>${payments ? `<div class="table-wrap"><table><thead><tr><th>${t('date')}</th><th>${t('category')}</th><th>${t('transaction_type')}</th><th>${t('amount_bdt')}</th></tr></thead><tbody>${payments}</tbody></table></div>` : `<div class="empty">${t('noRows')}</div>`}
      <div class="modal-actions"><button class="button button-outline" id="print-owner">Print Owner Info</button><button class="button button-outline" data-cancel>${t('cancel')}</button></div></div>`;
    $('#modal-root').replaceChildren(modal);
    modal.addEventListener('click', (event) => { if (event.target === modal || event.target.closest('[data-cancel]')) modal.remove(); });
    $('#print-owner', modal).addEventListener('click', async () => {
      const headers = ['Owner ID', 'Owner Name', 'Mobile', 'Address', 'Total Buses', 'Total Trips', 'Trip Charges (paisa)', 'Outstanding (paisa)'];
      const report = [[owner.owner_code, owner.name, owner.mobile, owner.address, account.buses.length, account.totals.trips, account.totals.trip_total, account.totals.outstanding]];
      try { await window.somiti.export.pdf({ title: 'Owner Information', headers, rows: report }); }
      catch (error) { toast(error.message); }
    });
  } catch (error) { toast(error.message); }
}
function showAccountDialog(title, body) {
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  modal.innerHTML = `<div class="modal"><h2>${escapeHtml(title)}</h2>${body}<div class="modal-actions"><button class="button button-outline" data-cancel>${t('cancel')}</button></div></div>`;
  $('#modal-root').replaceChildren(modal);
  modal.addEventListener('click', (event) => { if (event.target === modal || event.target.closest('[data-cancel]')) modal.remove(); });
}

function optionsHtml(options, selected, title) {
  return `<option value="">${escapeHtml(title)}</option>${options.map((item) => `<option value="${item.id}" ${String(selected ?? '') === String(item.id) ? 'selected' : ''}>${escapeHtml(item.label)}</option>`).join('')}`;
}
function fieldControl(field, kind, required, value, record) {
  const labelText = label(field);
  const req = required ? 'required' : '';
  const full = kind === 'textarea' || kind === 'photo' ? ' full' : '';
  if (kind === 'owner') return `<div class="field"><label>${labelText}</label><select name="${field}" ${req}>${optionsHtml(state.owners.map((item) => ({ id: item.id, label: `${item.owner_code} — ${item.name}` })), value, t('selectOwner'))}</select></div>`;
  if (kind === 'route') return `<div class="field"><label>${labelText}</label><select name="${field}">${optionsHtml(state.routes.map((item) => ({ id: item.id, label: `${item.route_number} — ${item.name}` })), value, t('selectRoute'))}</select></div>`;
  if (kind === 'bus-status') return `<div class="field"><label>${labelText}</label><select name="${field}"><option ${value === 'Active' ? 'selected' : ''}>Active</option><option ${value === 'Inactive' ? 'selected' : ''}>Inactive</option><option ${value === 'Repair' ? 'selected' : ''}>Repair</option></select></div>`;
  if (kind === 'member-status') return `<div class="field"><label>${labelText}</label><select name="${field}"><option ${value === 'Active' || !value ? 'selected' : ''}>Active</option><option ${value === 'Inactive' ? 'selected' : ''}>Inactive</option></select></div>`;
  if (kind === 'checkbox') return `<div class="field"><label><input name="${field}" type="checkbox" ${value === undefined || value ? 'checked' : ''}> ${labelText}</label></div>`;
  if (kind === 'photo') return `<div class="field full"><label>${labelText}</label><input name="photo_path" value="${escapeHtml(value || '')}" readonly><button type="button" class="button button-outline" id="photo-pick">Choose photograph</button></div>`;
  if (kind === 'textarea') return `<div class="field${full}"><label>${labelText}</label><textarea name="${field}" ${req}>${escapeHtml(value || '')}</textarea></div>`;
  let inputValue = value ?? '';
  if (field === 'charge_bdt' && record) inputValue = (Number(record.charge_paisa) / 100).toFixed(2);
  if (field === 'opening_balance_bdt' && record) inputValue = (Number(record.opening_balance_paisa) / 100).toFixed(2);
  if (field === 'monthly_fee_bdt' && record) inputValue = (Number(record.monthly_fee_paisa) / 100).toFixed(2);
  if (kind === 'date' && !inputValue) inputValue = today();
  return `<div class="field"><label>${labelText}</label><input name="${field}" type="${kind}" value="${escapeHtml(inputValue)}" ${kind === 'number' ? 'min="0" step="0.01"' : ''} ${req}></div>`;
}

async function openRecordForm(entity, record = {}) {
  const cfg = entityConfig[entity];
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  modal.innerHTML = `<form class="modal"><h2>${record.id ? t('edit') : t('add')} · ${t(cfg.title)}</h2><div class="form-grid">
    ${cfg.fields.map(([field, kind, required]) => fieldControl(field, kind, required, record[field], record)).join('')}
    </div><div class="modal-actions"><button type="button" class="button button-outline" data-cancel>${t('cancel')}</button><button class="button button-primary">${t('save')}</button></div></form>`;
  $('#modal-root').replaceChildren(modal);
  modal.addEventListener('click', (event) => { if (event.target === modal || event.target.closest('[data-cancel]')) modal.remove(); });
  $('#photo-pick', modal)?.addEventListener('click', async () => {
    if (!record.id) { toast('Save the owner record before adding a photograph.'); return; }
    const photo = await window.somiti.files.ownerPhoto(record.owner_code || record.id);
    if (photo) $('[name="photo_path"]', modal).value = photo;
  });
  modal.querySelector('form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    data.id = record.id || undefined;
    for (const [source, target] of [['charge_bdt', 'charge_paisa'], ['opening_balance_bdt', 'opening_balance_paisa'], ['monthly_fee_bdt', 'monthly_fee_paisa']]) {
      if (data[source] !== undefined) { data[target] = Math.round(Number(data[source]) * 100); delete data[source]; }
    }
    if (entity === 'funds' || entity.endsWith('_categories')) data.is_active = event.currentTarget.elements.is_active.checked;
    try {
      await window.somiti.records.save(entity, data);
      modal.remove();
      await loadLookups();
      toast(t('saved'));
      await renderEntity(entity);
    } catch (error) { toast(error.message); }
  });
}

async function renderTrips() {
  const rows = await window.somiti.reports.get({ type: 'trips' });
  const filtered = state.search ? rows.filter((row) => Object.values(row).some((value) => String(value).toLowerCase().includes(state.search.toLowerCase()))) : rows;
  const columns = [['trip_code', 'Trip ID'], ['date', 'date'], ['registration_number', 'registration_number'], ['owner', 'owner_id'], ['route', 'route_id'], ['trip_count', 'trip_count'], ['total_paisa', 'tripAmount'], ['payment_status', 'payment_status']];
  const data = filtered.map((row) => columns.map(([field]) => field === 'total_paisa' ? formatMoney(row[field]) : field === 'payment_status' ? status(row[field]) : escapeHtml(row[field] ?? '—')));
  const htmlRows = filtered.map((row, index) => [...data[index], `<div class="action-cell"><button class="button button-outline button-small" data-edit-trip="${row.trip_code}">${t('edit')}</button>${row.receipt_id ? `<button class="button button-outline button-small" data-receipt="${row.receipt_id}">${t('receipt')}</button>` : ''}<button class="button button-danger button-small" data-delete-trip="${row.id}">${t('delete')}</button></div>`]);
  $('#content').innerHTML = `<div class="toolbar"><input id="trip-search" class="search" placeholder="${t('search')}" value="${escapeHtml(state.search)}"><span class="spacer"></span><button id="add-trip" class="button button-primary">＋ ${t('add')}</button></div>
    ${filtered.length ? renderCustomTable(columns.map(([, labelKey]) => label(labelKey)), htmlRows) : '<div class="panel empty">'+t('noRows')+'</div>'}
    <div class="notice">${t('amountWords')} ${state.user.role === 'admin' ? '' : 'Saved trips can only be corrected by an administrator.'}</div>`;
  $('#trip-search').addEventListener('input', (event) => { state.search = event.target.value; renderTrips(); });
  $('#add-trip').addEventListener('click', () => openTripForm());
  $$('[data-edit-trip]').forEach((button) => button.addEventListener('click', () => {
    const row = rows.find((item) => item.trip_code === button.dataset.editTrip);
    openTripForm({ ...row, id: row.id });
  }));
  $$('[data-receipt]').forEach((button) => button.addEventListener('click', async () => {
    try { await window.somiti.receipt.open(Number(button.dataset.receipt)); }
    catch (error) { toast(error.message); }
  }));
  $$('[data-delete-trip]').forEach((button) => button.addEventListener('click', async () => {
    if (!confirm(t('confirmDelete'))) return;
    try { await window.somiti.trips.delete(Number(button.dataset.deleteTrip)); toast(t('saved')); renderTrips(); }
    catch (error) { toast(error.message); }
  }));
}
function renderCustomTable(headers, rows) {
  return `<div class="table-wrap"><table><thead><tr>${headers.map((item) => `<th>${escapeHtml(item)}</th>`).join('')}<th>${t('actions')}</th></tr></thead><tbody>${rows.map((row) => `<tr>${row.map((item) => `<td>${item}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

function selectField(name, title, options, required = true, selected = '') {
  return `<div class="field"><label>${title}</label><select name="${name}" ${required ? 'required' : ''}>${optionsHtml(options, selected, t('other'))}</select></div>`;
}
async function openTripForm(existing = {}) {
  if (existing.id && state.user.role !== 'admin') { toast('Only administrators can correct a saved trip.'); return; }
  const busOptions = state.buses.map((bus) => ({ id: bus.id, label: `${bus.registration_number} — ${ownerName(bus.owner_id)} / ${routeName(bus.route_id)}` }));
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  modal.innerHTML = `<form class="modal"><h2>${existing.id ? t('edit') : t('add')} · ${t('trips')}</h2><div class="form-grid">
    <div class="field"><label>${t('date')}</label><input type="date" name="date" value="${existing.date || today()}" required></div>
    ${selectField('bus_id', t('bus_id'), busOptions, true, existing.bus_id)}
    ${selectField('fund_id', t('fund_id'), state.funds.map((fund) => ({ id: fund.id, label: fund.name })), true, existing.fund_id || state.funds[0]?.id)}
    <div class="field"><label>${t('trip_count')}</label><input name="trip_count" type="number" min="1" step="1" value="${existing.trip_count || 1}" required></div>
    <div class="field"><label>${t('payment_status')}</label><select name="payment_status"><option ${existing.payment_status !== 'Unpaid' ? 'selected' : ''}>Paid</option><option ${existing.payment_status === 'Unpaid' ? 'selected' : ''}>Unpaid</option></select></div>
    <div class="field"><label>${t('tripCalculation')}</label><output id="trip-total">${formatMoney((Number(existing.total_paisa) || 0))}</output></div>
    <div class="field full"><label>${t('note')}</label><textarea name="note">${escapeHtml(existing.note || '')}</textarea></div>
    </div><div class="modal-actions"><button type="button" class="button button-outline" data-cancel>${t('cancel')}</button><button class="button button-primary">${t('save')}</button></div></form>`;
  $('#modal-root').replaceChildren(modal);
  const updateAmount = () => {
    const bus = state.buses.find((item) => Number(item.id) === Number($('[name="bus_id"]', modal).value));
    const route = state.routes.find((item) => Number(item.id) === Number(bus?.route_id));
    $('#trip-total', modal).textContent = formatMoney((route?.charge_paisa || 0) * (Number($('[name="trip_count"]', modal).value) || 0));
  };
  $('[name="bus_id"]', modal).addEventListener('change', updateAmount);
  $('[name="trip_count"]', modal).addEventListener('input', updateAmount);
  updateAmount();
  modal.addEventListener('click', (event) => { if (event.target === modal || event.target.closest('[data-cancel]')) modal.remove(); });
  modal.querySelector('form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitButton = event.currentTarget.querySelector('[type="submit"]');
    if (submitButton.disabled) return;
    submitButton.disabled = true;
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    if (existing.id) data.id = existing.id;
    else data.request_key = crypto.randomUUID();
    data.trip_count = Number(data.trip_count);
    data.bus_id = Number(data.bus_id);
    data.fund_id = Number(data.fund_id);
    try {
      const result = await window.somiti.trips.save(data);
      modal.remove();
      toast(t('saved'));
      if (result.receipt) window.somiti.receipt.open(result.receipt.id).catch((error) => toast(error.message));
      renderTrips();
    } catch (error) { toast(error.message); }
    finally { submitButton.disabled = false; }
  });
}

async function renderFinance() {
  const filters = { from: `${new Date().getFullYear()}-01-01`, to: '9999-12-31' };
  const [transactions, incomeCats, expenseCats] = await Promise.all([
    window.somiti.finance.list(filters), window.somiti.records.list('income_categories'), window.somiti.records.list('expense_categories')
  ]);
  const rows = transactions.map((item) => `<tr><td>${escapeHtml(item.date)}</td><td>${item.transaction_type === 'income' ? t('typeIncome') : t('typeExpense')}</td><td>${escapeHtml(item.category)}</td><td>${escapeHtml(item.fund_name)}</td><td>${escapeHtml(item.party || '—')}</td><td>${formatMoney(item.amount_paisa)}</td><td>${escapeHtml(item.description)}</td></tr>`).join('');
  $('#content').innerHTML = `<div class="toolbar"><button class="button button-primary" id="income-btn">＋ ${t('addIncome')}</button><button class="button button-outline" id="expense-btn">＋ ${t('addExpense')}</button><button class="button button-outline" id="transfer-btn">${t('transfer')}</button><span class="spacer"></span><button class="button button-outline" data-categories="income_categories">${t('typeIncome')} · ${t('category')}</button><button class="button button-outline" data-categories="expense_categories">${t('typeExpense')} · ${t('category')}</button></div>
    <div class="panel"><div class="panel-heading"><h2>${t('ledger')}</h2></div>${rows ? `<div class="table-wrap"><table><thead><tr>${['date','transaction_type','category','fund_id','name','amount_bdt','description'].map((key) => `<th>${label(key)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>` : `<div class="empty">${t('noRows')}</div>`}</div>`;
  $('#income-btn').addEventListener('click', () => openFinanceForm('income', incomeCats));
  $('#expense-btn').addEventListener('click', () => openFinanceForm('expense', expenseCats));
  $('#transfer-btn').addEventListener('click', openTransferForm);
  $$('[data-categories]').forEach((button) => button.addEventListener('click', () => renderPage(button.dataset.categories)));
}

async function openFinanceForm(type, categories) {
  const options = categories.map((item) => ({ id: item.name, label: item.name }));
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  modal.innerHTML = `<form class="modal"><h2>${type === 'income' ? t('addIncome') : t('addExpense')}</h2><div class="form-grid">
    <div class="field"><label>${t('date')}</label><input name="date" type="date" value="${today()}" required></div>
    ${selectField('category', t('category'), options)}
    ${selectField('fund_id', t('fund_id'), state.funds.map((fund) => ({ id: fund.id, label: fund.name })))}
    <div class="field"><label>${t('amount_bdt')}</label><input name="amount_bdt" type="number" min="0.01" step="0.01" required></div>
    ${selectField('owner_id', t('owner_id'), state.owners.map((item) => ({ id: item.id, label: item.name })), false)}
    ${selectField('member_id', t('member_id'), state.members.map((item) => ({ id: item.id, label: item.name })), false)}
    ${selectField('bus_id', t('bus_id'), state.buses.map((item) => ({ id: item.id, label: item.registration_number })), false)}
    <div class="field full"><label>${t('description_label')}</label><textarea name="description"></textarea></div>
    </div><div class="modal-actions"><button type="button" class="button button-outline" data-cancel>${t('cancel')}</button><button class="button button-primary">${t('save')}</button></div></form>`;
  $('#modal-root').replaceChildren(modal);
  modal.addEventListener('click', (event) => { if (event.target === modal || event.target.closest('[data-cancel]')) modal.remove(); });
  modal.querySelector('form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    data.transaction_type = type;
    data.amount_paisa = Math.round(Number(data.amount_bdt) * 100);
    data.fund_id = Number(data.fund_id);
    for (const field of ['owner_id', 'member_id', 'bus_id']) data[field] = data[field] ? Number(data[field]) : null;
    delete data.amount_bdt;
    try {
      const result = await window.somiti.finance.post(data);
      modal.remove();
      toast(t('saved'));
      if (result.receipt) window.somiti.receipt.open(result.receipt.id).catch((error) => toast(error.message));
      renderFinance();
    } catch (error) { toast(error.message); }
  });
}

function openTransferForm() {
  const funds = state.funds.map((item) => ({ id: item.id, label: item.name }));
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  modal.innerHTML = `<form class="modal"><h2>${t('transfer')}</h2><div class="form-grid">
    ${selectField('from_fund_id', t('from_fund_id'), funds)}
    ${selectField('to_fund_id', t('to_fund_id'), funds)}
    <div class="field"><label>${t('date')}</label><input name="date" type="date" value="${today()}" required></div>
    <div class="field"><label>${t('amount_bdt')}</label><input name="amount_bdt" type="number" min="0.01" step="0.01" required></div>
    <div class="field full"><label>${t('description')}</label><textarea name="description"></textarea></div>
    </div><div class="modal-actions"><button type="button" class="button button-outline" data-cancel>${t('cancel')}</button><button class="button button-primary">${t('save')}</button></div></form>`;
  $('#modal-root').replaceChildren(modal);
  modal.addEventListener('click', (event) => { if (event.target === modal || event.target.closest('[data-cancel]')) modal.remove(); });
  modal.querySelector('form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    data.from_fund_id = Number(data.from_fund_id); data.to_fund_id = Number(data.to_fund_id);
    data.amount_paisa = Math.round(Number(data.amount_bdt) * 100);
    delete data.amount_bdt;
    try { await window.somiti.finance.transfer(data); modal.remove(); toast(t('transferDone')); renderFinance(); }
    catch (error) { toast(error.message); }
  });
}

async function renderDues() {
  const rows = await window.somiti.dues.list(state.duesMonth);
  $('#content').innerHTML = `<div class="toolbar"><div class="field"><label>${t('month_label')}</label><input id="dues-month" type="month" value="${state.duesMonth}"></div><button class="button button-primary" id="generate-dues">${t('generate')}</button><span class="spacer"></span></div>
    ${rows.length ? `<div class="table-wrap"><table><thead><tr>${['member_code','name','mobile','month_label','amount_bdt','paid','outstanding','status','actions'].map((key) => `<th>${key === 'paid' ? t('paid') : key === 'outstanding' ? t('outstanding') : t(key)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((row) => `<tr><td>${escapeHtml(row.member_code)}</td><td>${escapeHtml(row.member_name)}</td><td>${escapeHtml(row.mobile)}</td><td>${escapeHtml(row.month)}</td><td>${formatMoney(row.amount_paisa)}</td><td>${formatMoney(row.paid_paisa)}</td><td>${formatMoney(row.amount_paisa - row.paid_paisa)}</td><td>${status(row.status)}</td><td><button class="button button-outline button-small" data-pay="${row.id}" ${row.status === 'Paid' ? 'disabled' : ''}>${t('pay')}</button></td></tr>`).join('')}</tbody></table></div>` : `<div class="panel empty">${t('noRows')}</div>`}`;
  $('#dues-month').addEventListener('change', (event) => { state.duesMonth = event.target.value; renderDues(); });
  $('#generate-dues').addEventListener('click', async () => {
    try { const result = await window.somiti.dues.generate(state.duesMonth); toast(`${result.generated} dues generated`); renderDues(); }
    catch (error) { toast(error.message); }
  });
  $$('[data-pay]').forEach((button) => button.addEventListener('click', () => openDuePayment(rows.find((item) => item.id === Number(button.dataset.pay)))));
}
function openDuePayment(due) {
  if (!due) return;
  const remaining = due.amount_paisa - due.paid_paisa;
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  modal.innerHTML = `<form class="modal"><h2>${t('pay')} · ${escapeHtml(due.member_name)}</h2><p class="subheading">${escapeHtml(due.month)} · ${t('outstanding')}: ${formatMoney(remaining)}</p>
    <div class="form-grid"><div class="field"><label>${t('date')}</label><input name="date" type="date" value="${today()}" required></div>
    ${selectField('fund_id', t('fund_id'), state.funds.map((fund) => ({ id: fund.id, label: fund.name })))}
    <div class="field"><label>${t('amount_bdt')}</label><input name="amount_bdt" type="number" min="0.01" max="${(remaining / 100).toFixed(2)}" step="0.01" value="${(remaining / 100).toFixed(2)}" required></div></div>
    <div class="modal-actions"><button type="button" class="button button-outline" data-cancel>${t('cancel')}</button><button class="button button-primary">${t('pay')}</button></div></form>`;
  $('#modal-root').replaceChildren(modal);
  modal.addEventListener('click', (event) => { if (event.target === modal || event.target.closest('[data-cancel]')) modal.remove(); });
  modal.querySelector('form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    data.due_id = due.id; data.fund_id = Number(data.fund_id); data.amount_paisa = Math.round(Number(data.amount_bdt) * 100);
    delete data.amount_bdt;
    try {
      const result = await window.somiti.dues.pay(data);
      modal.remove(); toast(t('paymentSaved'));
      window.somiti.receipt.open(result.receipt.id).catch((error) => toast(error.message));
      renderDues();
    } catch (error) { toast(error.message); }
  });
}

async function renderReports() {
  $('#content').innerHTML = `<div class="panel"><div class="report-filters"><div class="field"><label>${t('reportType')}</label><select id="report-type">
    <option value="daily">Daily Collection</option><option value="monthly">Monthly Collection</option><option value="yearly">Yearly Collection</option>
    <option value="buses">Bus-wise Report</option><option value="owners">Owner-wise Report</option><option value="routes">Route-wise Report</option>
    <option value="trips">${t('tripsReport')}</option><option value="funds">Fund-wise Report</option><option value="income">Income Report</option>
    <option value="expense">Expense Report</option><option value="dues">${t('duesReport')}</option><option value="transactions">${t('transactions')}</option>
    </select></div>
    <div class="field"><label>${t('from')}</label><input id="report-from" type="date" value="${new Date().getFullYear()}-01-01"></div>
    <div class="field"><label>${t('to')}</label><input id="report-to" type="date" value="${today()}"></div>
    <button id="run-report" class="button button-primary">Show Report</button><span class="spacer"></span><button id="pdf-report" class="button button-outline">${t('exportPdf')}</button><button id="excel-report" class="button button-outline">${t('exportExcel')}</button></div><div id="report-results" class="empty">${t('loading')}</div></div>`;
  let reportRows = [];
  let headers = [];
  const run = async () => {
    const type = $('#report-type').value;
    reportRows = await window.somiti.reports.get({ type, from: $('#report-from').value, to: $('#report-to').value });
    headers = reportRows.length ? Object.keys(reportRows[0]) : [];
    const display = reportRows.map((row) => headers.map((key) => key.endsWith('_paisa') ? formatMoney(row[key]) : escapeHtml(row[key] ?? '')));
    $('#report-results').innerHTML = display.length ? renderCustomTable(headers.map((key) => t(key)), display) : `<div class="empty">${t('noRows')}</div>`;
  };
  $('#run-report').addEventListener('click', run);
  $('#pdf-report').addEventListener('click', async () => {
    if (!reportRows.length) { toast(t('noRows')); return; }
    try { const file = await window.somiti.export.pdf({ title: $('#report-type').selectedOptions[0].textContent, headers, rows: reportRows.map((row) => headers.map((key) => row[key])) }); if (file) toast(file); }
    catch (error) { toast(error.message); }
  });
  $('#excel-report').addEventListener('click', async () => {
    if (!reportRows.length) { toast(t('noRows')); return; }
    try { const file = await window.somiti.export.excel({ title: $('#report-type').selectedOptions[0].textContent, headers, rows: reportRows.map((row) => headers.map((key) => row[key])) }); if (file) toast(file); }
    catch (error) { toast(error.message); }
  });
  await run();
}

async function renderUsers() {
  if (state.user.role !== 'admin') { $('#content').innerHTML = `<div class="panel notice">${t('noPermission')}</div>`; return; }
  const [users, audit, loginHistory] = await Promise.all([window.somiti.users.list(), window.somiti.audit.list(), window.somiti.audit.loginHistory()]);
  const rows = users.map((user) => `<tr><td>${escapeHtml(user.full_name)}</td><td>${escapeHtml(user.username)}</td><td>${user.role === 'admin' ? t('administrator') : t('staff')}</td><td>${status(user.is_active ? 'Active' : 'Inactive')}</td><td><div class="action-cell">${user.role === 'staff' ? `<button class="button button-outline button-small" data-permissions="${user.id}">Permissions</button>` : ''}<button class="button button-outline button-small" data-toggle-user="${user.id}">${user.is_active ? 'Disable' : 'Enable'}</button></div></td></tr>`).join('');
  const auditRows = audit.slice(0, 40).map((item) => `<tr><td>${escapeHtml(item.created_at)}</td><td>${escapeHtml(item.full_name || item.username || '—')}</td><td>${escapeHtml(item.action)}</td><td>${escapeHtml(item.entity)}</td><td>${escapeHtml(item.entity_id)}</td></tr>`).join('');
  const loginRows = loginHistory.slice(0, 40).map((item) => `<tr><td>${escapeHtml(item.created_at)}</td><td>${escapeHtml(item.username)}</td><td>${item.success ? status('Success') : status('Failed')}</td></tr>`).join('');
  $('#content').innerHTML = `<div class="toolbar"><span class="spacer"></span><button id="add-user" class="button button-primary">＋ ${t('add')}</button></div><div class="notice">${t('userHint')}</div><div class="panel"><div class="table-wrap"><table><thead><tr><th>${t('full_name')}</th><th>${t('username')}</th><th>${t('role')}</th><th>${t('status')}</th><th>${t('actions')}</th></tr></thead><tbody>${rows}</tbody></table></div></div>
    <div class="panel"><div class="panel-heading"><h2>Activity Log</h2></div>${auditRows ? `<div class="table-wrap"><table><thead><tr><th>Date</th><th>User</th><th>Action</th><th>Record</th><th>ID</th></tr></thead><tbody>${auditRows}</tbody></table></div>` : `<div class="empty">${t('noRows')}</div>`}</div>
    <div class="panel"><div class="panel-heading"><h2>Login History</h2></div>${loginRows ? `<div class="table-wrap"><table><thead><tr><th>Date</th><th>${t('username')}</th><th>Result</th></tr></thead><tbody>${loginRows}</tbody></table></div>` : `<div class="empty">${t('noRows')}</div>`}</div>`;
  $('#add-user').addEventListener('click', openUserForm);
  $$('[data-permissions]').forEach((button) => button.addEventListener('click', () => {
    const user = users.find((item) => item.id === Number(button.dataset.permissions));
    let permissions = {};
    try { permissions = JSON.parse(user.permissions_json || '{}'); } catch { permissions = {}; }
    openUserForm(user, permissions);
  }));
  $$('[data-toggle-user]').forEach((button) => button.addEventListener('click', async () => {
    const current = users.find((user) => user.id === Number(button.dataset.toggleUser));
    if (current.id === state.user.id) { toast('You cannot disable your signed-in account.'); return; }
    let permissions = {};
    try { permissions = JSON.parse(current.permissions_json || '{}'); } catch { permissions = {}; }
    try { await window.somiti.users.save({ ...current, permissions, is_active: !current.is_active }); renderUsers(); }
    catch (error) { toast(error.message); }
  }));
}
function openUserForm(existing = null, permissions = {}) {
  const permissionItems = ['owners', 'buses', 'routes', 'members', 'trips', 'dues', 'finance'];
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  modal.innerHTML = `<form class="modal"><h2>${existing ? 'Permissions' : `${t('add')} · ${t('users')}`}</h2><div class="form-grid">
    <div class="field"><label>${t('full_name')}</label><input name="full_name" value="${escapeHtml(existing?.full_name || '')}" required></div>
    ${existing ? '' : `<div class="field"><label>${t('username')}</label><input name="username" required></div>
    <div class="field"><label>${t('password')}</label><input name="password" type="password" minlength="8" required></div>
    <div class="field"><label>${t('role')}</label><select name="role"><option value="staff">${t('staff')}</option><option value="admin">${t('administrator')}</option></select></div>`}
    <div class="field full"><label>Staff access</label>${permissionItems.map((item) => `<label><input type="checkbox" name="permission_manage_${item}" ${permissions[`manage_${item}`] ? 'checked' : ''}> Manage ${item}</label>${['owners', 'buses', 'routes', 'members', 'trips'].includes(item) ? `<label><input type="checkbox" name="permission_delete_${item}" ${permissions[`delete_${item}`] ? 'checked' : ''}> Delete ${item}</label>` : ''}`).join('')}</div>
    </div><div class="modal-actions"><button type="button" class="button button-outline" data-cancel>${t('cancel')}</button><button class="button button-primary">${t('save')}</button></div></form>`;
  $('#modal-root').replaceChildren(modal);
  modal.addEventListener('click', (event) => { if (event.target === modal || event.target.closest('[data-cancel]')) modal.remove(); });
  modal.querySelector('form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const data = Object.fromEntries(formData.entries());
    data.permissions = {};
    for (const item of permissionItems) {
      data.permissions[`manage_${item}`] = formData.has(`permission_manage_${item}`);
      if (['owners', 'buses', 'routes', 'members', 'trips'].includes(item)) data.permissions[`delete_${item}`] = formData.has(`permission_delete_${item}`);
    }
    if (existing) { data.id = existing.id; data.role = existing.role; data.is_active = Boolean(existing.is_active); }
    try { await window.somiti.users.save(data); modal.remove(); toast(t('saved')); renderUsers(); }
    catch (error) { toast(error.message); }
  });
}

async function renderSettings() {
  const receipts = await window.somiti.receipts.list();
  const receiptRows = receipts.slice(0, 50).map((receipt) => `<tr><td>${escapeHtml(receipt.receipt_number)}</td><td>${escapeHtml(receipt.date)}</td><td>${escapeHtml(receipt.party || '—')}</td><td>${escapeHtml(receipt.category)}</td><td>${formatMoney(receipt.amount_paisa)}</td><td><button class="button button-outline button-small" data-reprint="${receipt.id}">${t('receipt')}</button></td></tr>`).join('');
  $('#content').innerHTML = `<div class="panel"><div class="panel-heading"><h2>${t('appSettings')}</h2></div><p class="subheading">${t('setupHint')}</p>
    <div class="toolbar"><button id="backup-button" class="button button-primary">${t('backup')}</button><button id="restore-button" class="button button-outline">${t('restore')}</button></div>
    <h3>${t('changePassword')}</h3><form id="password-form" class="form-grid">
    <div class="field"><label>${t('current_password')}</label><input name="oldPassword" type="password" required></div>
    <div class="field"><label>${t('new_password')}</label><input name="newPassword" type="password" minlength="8" required></div>
    <div class="field"><button class="button button-primary">${t('changePassword')}</button></div></form></div>
    ${state.user.role === 'admin' ? `<div class="panel"><div class="panel-heading"><h2>${t('fundsSummary')}</h2><button class="button button-outline" data-entity="funds">${t('edit')}</button></div><p class="muted">Opening amounts are managed as integer poisha in the database. Keep a separate backup before restoring.</p></div>` : ''}
    <div class="panel"><div class="panel-heading"><h2>Receipts · Reprint</h2></div>${receiptRows ? `<div class="table-wrap"><table><thead><tr><th>Receipt No.</th><th>${t('date')}</th><th>${t('name')}</th><th>${t('category')}</th><th>${t('amount_bdt')}</th><th>${t('actions')}</th></tr></thead><tbody>${receiptRows}</tbody></table></div>` : `<div class="empty">${t('noRows')}</div>`}</div>`;
  $('#backup-button').addEventListener('click', async () => { try { const file = await window.somiti.backup.save(); if (file) toast(t('backupDone')); } catch (error) { toast(error.message); } });
  $('#restore-button').addEventListener('click', async () => {
    if (!confirm('Restore will replace the current association database. Continue?')) return;
    try { const restored = await window.somiti.backup.restore(); if (restored) { toast(t('restoreDone')); state.user = null; showAuth(); } }
    catch (error) { toast(error.message); }
  });
  $('#password-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    try { await window.somiti.auth.changePassword(Object.fromEntries(new FormData(event.currentTarget).entries())); event.currentTarget.reset(); toast(t('passwordChanged')); }
    catch (error) { toast(error.message); }
  });
  $('[data-entity="funds"]')?.addEventListener('click', () => renderPage('funds'));
  $$('[data-reprint]').forEach((button) => button.addEventListener('click', async () => {
    try { await window.somiti.receipt.open(Number(button.dataset.reprint)); }
    catch (error) { toast(error.message); }
  }));
}

async function renderPage(page) {
  state.page = page;
  state.search = '';
  nav();
  $('#page-title').textContent = t(page);
  const pages = {
    dashboard: renderDashboard, owners: () => renderEntity('owners'), buses: () => renderEntity('buses'),
    routes: () => renderEntity('routes'), trips: renderTrips, members: () => renderEntity('members'),
    dues: renderDues, finance: renderFinance, reports: renderReports, users: renderUsers,
    settings: renderSettings, funds: () => renderEntity('funds'),
    income_categories: () => renderEntity('income_categories'), expense_categories: () => renderEntity('expense_categories')
  };
  try { await (pages[page] || renderDashboard)(); }
  catch (error) { $('#content').innerHTML = `<div class="panel error-text">${escapeHtml(error.message)}</div>`; }
}

$('#language-toggle').addEventListener('click', () => {
  state.language = state.language === 'en' ? 'bn' : 'en';
  localStorage.setItem('language', state.language);
  setLanguage();
  if (state.user) { nav(); $('#page-title').textContent = t(state.page); renderPage(state.page); }
});
$('#logout').addEventListener('click', async () => {
  await window.somiti.auth.logout();
  state.user = null;
  showAuth();
});
showAuth().catch((error) => { $('#auth-error').textContent = error.message; });
