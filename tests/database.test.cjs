const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { AssociationDatabase } = require('../src/database.cjs');

function setupDatabase() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'somiti-test-'));
  const filePath = path.join(directory, 'association.sqlite');
  const database = new AssociationDatabase(filePath);
  const admin = database.createUser({ username: 'admin', full_name: 'Admin User', password: 'secure-password', role: 'admin' }, null);
  const owner = database.saveRecord(admin, 'owners', { name: 'Owner One', mobile: '01700000000', join_date: '2026-01-05', status: 'Active' });
  const route = database.saveRecord(admin, 'routes', { name: 'Dhaka-Khulna', charge_paisa: 50000 });
  const bus = database.saveRecord(admin, 'buses', {
    registration_number: 'DHAKA-METRO-11-1234', owner_id: owner.id, route_id: route.id,
    status: 'Active', bus_type: 'Direct', driver_mobile: '01800000001'
  });
  const fund = database.db.prepare(`SELECT id FROM funds WHERE name='General Fund'`).get();
  return { database, directory, filePath, admin, owner, route, bus, fund };
}

function withDatabase(run) {
  const context = setupDatabase();
  return Promise.resolve()
    .then(() => run(context))
    .finally(() => {
      context.database.close();
      fs.rmSync(context.directory, { recursive: true, force: true });
    });
}

const tableNames = (database) => database.db
  .prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => row.name);

test('the removed trip and dues modules leave no tables, indexes or API behind', () =>
  withDatabase(({ database }) => {
    for (const obsolete of ['trips', 'monthly_dues']) assert.equal(tableNames(database).includes(obsolete), false, `${obsolete} table is gone`);
    const leftovers = database.db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND (name LIKE 'idx_trips%' OR name LIKE 'idx_dues%')").all();
    assert.deepEqual(leftovers.map((row) => row.name), []);
    for (const method of ['saveTrip', 'deleteTrip', 'listTrips', 'generateDues', 'listDues', 'payDue', 'correctDue']) assert.equal(database[method], undefined, `${method} is removed`);
  }));

test('opening an older database preserves archived trip and dues data', () => {
  const context = setupDatabase();
  const { database, directory, filePath } = context;
  try {
    database.db.exec(`CREATE TABLE trips (id INTEGER PRIMARY KEY, bus_id INTEGER REFERENCES buses(id), note TEXT);
      CREATE TABLE monthly_dues (id INTEGER PRIMARY KEY, note TEXT);`);
    database.db.prepare('INSERT INTO trips(bus_id,note) VALUES (?,?)').run(1, 'archived trip');
    database.db.prepare('INSERT INTO monthly_dues(note) VALUES (?)').run('archived due');
    database.db.prepare("INSERT INTO income_categories(name) VALUES ('Trip Collection')").run();
    database.close();
    const upgraded = new AssociationDatabase(filePath);
    try {
      assert.equal(upgraded.db.prepare('SELECT note FROM trips').get().note, 'archived trip');
      assert.equal(upgraded.db.prepare('SELECT note FROM monthly_dues').get().note, 'archived due');
      assert.equal(upgraded.db.prepare('SELECT COUNT(*) AS count FROM buses').get().count, 1, 'business data survives the upgrade');
      assert.equal(upgraded.db.prepare("SELECT COUNT(*) AS count FROM income_categories WHERE name='Trip Collection'").get().count, 0);
    } finally {
      upgraded.close();
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('cashbook distributions are atomic, idempotent and limited by available Cash In', () =>
  withDatabase(({ database, admin, owner, fund }) => {
    const welfare = database.saveRecord(admin, 'funds', { name: 'Welfare Allocation', opening_balance_paisa: 0 });
    database.postTransaction(admin, {
      transaction_type: 'income', date: '2026-10-30', fund_id: fund.id, amount_paisa: 500000, owner_id: owner.id
    });
    database.postTransaction(admin, {
      transaction_type: 'expense', date: '2026-10-30', fund_id: fund.id, amount_paisa: 25000
    });

    const first = database.distributeCash(admin, {
      fund_id: welfare.id, amount_paisa: 300000, request_key: 'cashbook-distribution-1'
    });
    assert.equal(first.duplicate, false);
    assert.equal(first.totals.cash_in_paisa, 500000);
    assert.equal(first.totals.distributed_paisa, 300000);
    assert.equal(first.totals.available_paisa, 200000);

    const duplicate = database.distributeCash(admin, {
      fund_id: welfare.id, amount_paisa: 300000, request_key: 'cashbook-distribution-1'
    });
    assert.equal(duplicate.duplicate, true);
    assert.equal(database.db.prepare('SELECT COUNT(*) AS count FROM fund_distributions').get().count, 1);
    assert.throws(() => database.distributeCash(admin, {
      fund_id: welfare.id, amount_paisa: 250000, request_key: 'cashbook-distribution-1'
    }), /already used for a different distribution/);
    assert.equal(database.cashbook(admin).funds.find((item) => item.id === welfare.id).distributed_paisa, 300000);
    assert.throws(() => database.distributeCash(admin, {
      fund_id: welfare.id, amount_paisa: 200001, request_key: 'cashbook-distribution-2'
    }), /available cash balance/);
    const incomeId = database.db.prepare("SELECT id FROM fund_transactions WHERE transaction_type='income'").get().id;
    assert.throws(() => database.updateTransaction(admin, {
      id: incomeId, fund_id: fund.id, amount_paisa: 299999
    }), /lower than the amount already distributed/);
    assert.throws(() => database.deleteRecord(admin, 'funds', welfare.id), /FOREIGN KEY constraint failed/);
    assert.equal(database.db.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE entity='fund_distribution'").get().count, 1);
  }));

test('route create and edit generate the missing route code, and route deletion retains financial history', () =>
  withDatabase(({ database, admin, owner, route, bus, fund }) => {
    assert.equal(route.starting_point, '');
    assert.equal(route.destination, '');
    const originalNumber = route.route_number;
    const posted = database.postTransaction(admin, {
      transaction_type: 'income', date: '2026-10-30', fund_id: fund.id,
      amount_paisa: 100000, owner_id: owner.id, bus_id: bus.id
    });
    const updated = database.saveRecord(admin, 'routes', { id: route.id, name: 'Dhaka', charge_paisa: 75000 });
    assert.equal(updated.route_number, originalNumber);
    assert.equal(updated.name, 'Dhaka');
    assert.equal(updated.charge_paisa, 75000);
    database.deleteRecord(admin, 'routes', route.id);
    assert.equal(database.db.prepare('SELECT COUNT(*) AS count FROM fund_transactions WHERE id=?').get(posted.transaction.id).count, 1);
    assert.equal(database.db.prepare('SELECT COUNT(*) AS count FROM receipts WHERE id=?').get(posted.receipt.id).count, 1);
  }));


test('route details and fund activity flags are stored', () =>
  withDatabase(({ database, admin }) => {
    const saved = database.saveRecord(admin, 'routes', {
      route_number: 'D-B', name: 'Dhaka-Barishal', starting_point: 'Dhaka', destination: 'Barishal',
      charge_paisa: 65000, status: 'Active', description: 'Daily service'
    });
    assert.equal(saved.route_number, 'D-B');
    assert.equal(saved.starting_point, 'Dhaka');
    assert.equal(saved.destination, 'Barishal');
    assert.equal(saved.charge_paisa, 65000);
    assert.equal(saved.description, 'Daily service');
    const formEdited = database.saveRecord(admin, 'routes', {
      id: saved.id, name: 'Dhaka-Barishal', charge_paisa: 68000
    });
    assert.equal(formEdited.starting_point, 'Dhaka', 'the two-field form does not erase legacy route metadata');
    assert.equal(formEdited.destination, 'Barishal');
    assert.equal(formEdited.description, 'Daily service');
    assert.equal(formEdited.charge_paisa, 68000);
    const edited = database.saveRecord(admin, 'routes', {
      id: saved.id, name: 'Dhaka-Barishal', starting_point: 'Mirpur', destination: 'Barishal',
      charge_paisa: 70000, status: 'Inactive'
    });
    assert.equal(edited.route_number, 'D-B', 'a blank route number keeps the stored code');
    assert.equal(edited.starting_point, 'Mirpur');
    assert.equal(edited.status, 'Inactive');
    assert.equal(edited.description, '');
    assert.equal(database.db.prepare('SELECT COUNT(*) AS count FROM routes WHERE route_number=?').get('D-B').count, 1, 'no duplicate route code was generated');
    assert.throws(() => database.saveRecord(admin, 'routes', { name: 'Broken', starting_point: 'a', destination: 'b', charge_paisa: 0 }), /greater than zero/);
    assert.throws(() => database.saveRecord(admin, 'routes', { name: '', charge_paisa: 100 }), /Route name is required/);
    const fund = database.saveRecord(admin, 'funds', { name: 'Reserve Fund', opening_balance_paisa: 100000, is_active: true });
    assert.equal(fund.is_active, 1);
    const resting = database.saveRecord(admin, 'funds', { id: fund.id, name: 'Reserve Fund', opening_balance_paisa: 100000, is_active: false });
    assert.equal(resting.is_active, 0);
    assert.equal(database.cashbook(admin).funds.some((item) => item.id === fund.id), false, 'inactive funds leave the cashbook');
    const untouched = database.saveRecord(admin, 'funds', { id: fund.id, name: 'Reserve Fund', opening_balance_paisa: 200000 });
    assert.equal(untouched.is_active, 0, 'a save without the checkbox keeps the stored flag');
    assert.equal(untouched.opening_balance_paisa, 200000);
  }));

test('income posts one receipt, corrections follow it and deletion removes both', () =>
  withDatabase(async ({ database, admin, owner, bus, route, fund }) => {
    const posted = database.postTransaction(admin, {
      transaction_type: 'income', date: '2026-10-30', fund_id: fund.id, category: 'Owner Payment',
      amount_paisa: 250000, owner_id: owner.id, bus_id: bus.id, receiver_name: 'Cash Counter',
      reference_number: 'BANK-77', description: 'October contribution'
    });
    assert.equal(posted.receipt.route_id, route.id, 'the receipt carries the route of the paying bus');
    assert.equal(posted.transaction.receiver_name, 'Cash Counter');
    const pdfPath = await database.receiptPath(posted.receipt.id);
    assert.equal(fs.readFileSync(pdfPath).subarray(0, 4).toString(), '%PDF');

    const corrected = database.updateTransaction(admin, {
      id: posted.transaction.id, fund_id: fund.id, date: '2026-11-02', category: 'Owner Payment',
      amount_paisa: 300000, owner_id: owner.id, bus_id: bus.id
    });
    assert.equal(corrected.amount_paisa, 300000);
    const receipt = database.db.prepare('SELECT * FROM receipts WHERE fund_transaction_id=?').get(posted.transaction.id);
    assert.equal(receipt.amount_paisa, 300000, 'the receipt tracks the corrected amount');
    assert.equal(receipt.date, '2026-11-02');

    database.deleteTransaction(admin, posted.transaction.id);
    assert.equal(database.db.prepare('SELECT COUNT(*) AS count FROM receipts WHERE fund_transaction_id=?').get(posted.transaction.id).count, 0);
    assert.equal(database.db.prepare('SELECT COUNT(*) AS count FROM fund_transactions').get().count, 0);
  }));

test('staff can post income but only an administrator can correct or delete it', () =>
  withDatabase(({ database, admin, owner, fund }) => {
    const staff = database.createUser({ username: 'staff', full_name: 'Staff User', password: 'secure-password', role: 'staff' }, admin);
    database.saveUser(admin, { id: staff.id, full_name: staff.full_name, role: 'staff', is_active: true, permissions: { manage_finance: true } });
    const posted = database.postTransaction(staff, {
      transaction_type: 'income', date: '2026-10-30', fund_id: fund.id, amount_paisa: 50000, owner_id: owner.id
    });
    assert.throws(() => database.updateTransaction(staff, { id: posted.transaction.id, fund_id: fund.id, amount_paisa: 60000 }), /administrator/);
    assert.throws(() => database.deleteTransaction(staff, posted.transaction.id), /administrator/);
    assert.throws(() => database.postTransaction(staff, { transaction_type: 'income', fund_id: fund.id, amount_paisa: 0 }), /greater than zero/);
    assert.doesNotThrow(() => database.updateTransaction(admin, { id: posted.transaction.id, fund_id: fund.id, amount_paisa: 60000 }));
  }));

test('fund transfers are balance movements, not income or expense', () =>
  withDatabase(({ database, admin, fund }) => {
    const otherFund = database.db.prepare(`INSERT INTO funds(name,opening_balance_paisa) VALUES ('Welfare',0)`).run().lastInsertRowid;
    database.transfer(admin, { from_fund_id: fund.id, to_fund_id: otherFund, date: '2026-10-30', amount_paisa: 1200 });
    assert.equal(database.db.prepare('SELECT COUNT(*) AS count FROM fund_transactions').get().count, 0);
    assert.equal(database.db.prepare('SELECT COUNT(*) AS count FROM fund_transfers').get().count, 1);
    const balances = Object.fromEntries(database.dashboard(admin).funds.map((row) => [row.name, row.balance_paisa]));
    assert.equal(balances.Welfare, 1200);
    assert.equal(balances['General Fund'], -1200);
  }));

test('the dashboard summarises collections, expenses and the monthly trend', () =>
  withDatabase(({ database, admin, owner, fund }) => {
    database.postTransaction(admin, { transaction_type: 'income', date: '2026-10-30', fund_id: fund.id, amount_paisa: 90000, owner_id: owner.id });
    database.postTransaction(admin, { transaction_type: 'expense', date: '2026-10-28', fund_id: fund.id, amount_paisa: 40000, category: 'Bus Repair' });
    const view = database.dashboard(admin);
    assert.equal(view.totals.month_collection_paisa, 90000);
    assert.equal(view.totals.month_expenses_paisa, 40000);
    assert.equal(view.totals.funds_paisa, 50000);
    const current = view.monthly.find((row) => row.period === new Date().toISOString().slice(0, 7));
    assert.equal(current.income_paisa >= 90000, true);
    assert.equal(view.recent.length, 2);
  }));

test('automatic backup writes one dated copy per day and keeps the newest ones', () =>
  withDatabase(async ({ database, admin, directory }) => {
    const backupRoot = path.join(directory, 'backups');
    fs.mkdirSync(backupRoot, { recursive: true });
    for (const stale of ['daily-2026-01-01', 'daily-2026-01-02', 'daily-2026-01-03']) {
      fs.mkdirSync(path.join(backupRoot, stale));
      fs.writeFileSync(path.join(backupRoot, stale, 'association.sqlite'), 'stale');
    }
    assert.equal(await database.runScheduledBackup(), null, 'backup stays off until the administrator turns it on');
    database.saveSettings(admin, { name: 'Test Somiti', address: 'Test Road', backup_folder: backupRoot, auto_backup: true, keep_copies: 2 });
    const first = await database.runScheduledBackup();
    assert.ok(first && fs.existsSync(first));
    assert.equal(await database.runScheduledBackup(), null, 'the same day is never backed up twice');
    const folders = fs.readdirSync(backupRoot).filter((name) => name.startsWith('daily-')).sort();
    assert.equal(folders.length, 2, 'old copies beyond keep_copies are pruned');
    assert.equal(folders.includes('daily-2026-01-01'), false);
    assert.equal(fs.existsSync(path.join(backupRoot, folders[folders.length - 1], 'association.sqlite')), true);
    const restored = new AssociationDatabase(path.join(directory, 'restored.sqlite'));
    try {
      await restored.backup(path.join(backupRoot, 'manual.sqlite'));
      assert.equal(fs.readFileSync(path.join(backupRoot, 'manual.sqlite')).subarray(0, 15).toString(), 'SQLite format 3');
      const dailyCopy = path.join(backupRoot, folders[folders.length - 1], 'association.sqlite');
      restored.close();
      restored.restore(dailyCopy);
      assert.equal(restored.db.prepare('SELECT COUNT(*) AS count FROM funds').get().count >= 4, true);
      const safetyCopies = fs.readdirSync(directory).filter((name) => name.includes('.before-restore-'));
      assert.equal(safetyCopies.length, 1, 'the database it replaced is kept as a timestamped copy');
    } finally {
      restored.close();
    }
  }));

test('association settings print on the receipt and can be saved only by an administrator', () =>
  withDatabase(async ({ database, admin, owner, fund }) => {
    assert.equal(database.getSettings().name, 'Bus Malik Somiti');
    const staff = database.createUser({ username: 'staff2', full_name: 'Staff Two', password: 'secure-password', role: 'staff' }, admin);
    assert.throws(() => database.saveSettings(staff, { name: 'Nope' }), /administrator/);
    const saved = database.saveSettings(admin, { name: 'Bus Malik Samiti Bangladesh', address: 'Bus Stand Road, Jhenaidah', keep_copies: 999 });
    assert.equal(saved.name, 'Bus Malik Samiti Bangladesh');
    assert.equal(saved.keep_copies, 365, 'retention is clamped to a sane range');
    const posted = database.postTransaction(admin, { transaction_type: 'income', date: '2026-10-30', fund_id: fund.id, amount_paisa: 1234500, owner_id: owner.id });
    const pdf = fs.readFileSync(await database.receiptPath(posted.receipt.id)).toString('latin1');
    assert.equal(pdf.includes('%PDF'), true);
    assert.equal(database.logoFile() === null, false, 'the bundled logo is used when none is configured');
  }));

test('staff has no write permission unless admin explicitly grants it', () =>
  withDatabase(({ database, admin }) => {
    const staff = database.createUser({ username: 'staff', full_name: 'Staff User', password: 'secure-password', role: 'staff' }, admin);
    assert.throws(() => database.saveRecord(staff, 'owners', { name: 'Not Allowed' }), /permission/);
    database.saveUser(admin, { id: staff.id, full_name: staff.full_name, role: 'staff', is_active: true, permissions: { manage_owners: true } });
    assert.equal(database.saveRecord(staff, 'owners', { name: 'Allowed Owner' }).name, 'Allowed Owner');
  }));

test('association report queries return summaries and export valid files', () =>
  withDatabase(async ({ database, directory, admin, owner, bus, route, fund }) => {
    database.postTransaction(admin, { transaction_type: 'income', date: '2026-10-30', fund_id: fund.id, amount_paisa: 100000, owner_id: owner.id, bus_id: bus.id });
    database.postTransaction(admin, { transaction_type: 'expense', date: '2026-10-29', fund_id: fund.id, amount_paisa: 30000, category: 'Route Maintenance' });
    for (const type of ['owners', 'buses', 'routes', 'members', 'funds', 'daily', 'monthly', 'yearly', 'income', 'expense', 'receipts', 'transactions']) {
      const report = database.report(admin, { type, from: '2026-01-01', to: '2026-12-31' });
      assert.ok(Array.isArray(report), `${type} report returns rows`);
    }
    const ownerReport = database.report(admin, { type: 'owners', from: '2026-01-01', to: '2026-12-31' });
    assert.equal(ownerReport.find((row) => row.owner_code === owner.owner_code).income_paisa, 100000);
    const account = database.ownerAccount(admin, owner.id);
    assert.equal(account.totals.income, 100000);
    assert.equal(account.payments.length, 1);
    assert.equal(account.buses[0].registration_number, bus.registration_number);
    assert.equal(database.busAccount(admin, bus.id).payments.length, 1);
    assert.equal(database.routeAccount(admin, route.id).buses.length, 1);
    const transactions = database.report(admin, { type: 'transactions', from: '2026-01-01', to: '2026-12-31' });
    const pdfPath = path.join(directory, 'report.pdf');
    const excelPath = path.join(directory, 'report.xlsx');
    await database.exportPdf(pdfPath, 'Transaction report', Object.keys(transactions[0]), transactions);
    await database.exportExcel(excelPath, 'Transaction report', Object.keys(transactions[0]), transactions);
    assert.equal(fs.readFileSync(pdfPath).subarray(0, 4).toString(), '%PDF');
    assert.equal(fs.readFileSync(excelPath).subarray(0, 2).toString(), 'PK');
  }));
