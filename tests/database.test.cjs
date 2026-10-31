const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const { AssociationDatabase, SCHEMA_VERSION } = require('../src/database.cjs');

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
    for (const method of ['saveTrip', 'deleteTrip', 'listTrips', 'generateDues', 'listDues', 'payDue', 'correctDue', 'distributeCash']) assert.equal(database[method], undefined, `${method} is removed`);
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

test('legacy fund distribution records migrate into Cash Out history', () => {
  const context = setupDatabase();
  const { database, directory, filePath, admin, fund } = context;
  try {
    database.postTransaction(admin, {
      transaction_type: 'income', date: '2026-10-29', fund_id: fund.id, amount_paisa: 100000
    });
    database.db.prepare(`INSERT INTO fund_distributions(fund_id,fund_name,date,amount_paisa,request_key)
      VALUES (?,?,?,?,?)`).run(fund.id, 'General Fund', '2026-10-29', 50000, 'legacy-distribution-key');
    database.close();
    const upgraded = new AssociationDatabase(filePath);
    try {
      const migrated = upgraded.db.prepare('SELECT * FROM cash_outs').all();
      assert.equal(migrated.length, 1);
      assert.equal(migrated[0].legacy_distribution_id, 1);
      assert.equal(migrated[0].amount_paisa, 50000);
      assert.equal(upgraded.cashbookTotals().cash_out_paisa, 50000);
      assert.equal(upgraded.cashbookTotals().available_paisa, 50000);
      assert.equal(upgraded.cashbook(admin).cashOuts[0].source, 'legacy');
      assert.equal(upgraded.db.prepare('SELECT COUNT(*) AS count FROM fund_distributions').get().count, 1, 'the original record is kept');
    } finally {
      upgraded.close();
    }
    const reopened = new AssociationDatabase(filePath);
    try {
      assert.equal(reopened.db.prepare('SELECT COUNT(*) AS count FROM cash_outs').get().count, 1, 'migration is idempotent');
    } finally {
      reopened.close();
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('cashbook Cash Out is atomic, idempotent and limited by available Cash In', () =>
  withDatabase(({ database, admin, owner, route, fund }) => {
    const welfare = database.saveRecord(admin, 'funds', {
      name: 'Welfare Allocation', route_id: route.id, amount_paisa: 100000
    });
    database.postTransaction(admin, {
      transaction_type: 'income', date: '2026-10-30', fund_id: fund.id, amount_paisa: 500000, owner_id: owner.id
    });
    database.postTransaction(admin, {
      transaction_type: 'expense', date: '2026-10-30', fund_id: fund.id, amount_paisa: 25000
    });

    const first = database.createCashOut(admin, {
      route_id: route.id, fund_id: welfare.id, total_trips: 3, request_key: 'cash-out-1'
    });
    assert.equal(first.duplicate, false);
    assert.equal(first.cashOut.per_trip_paisa, 100000);
    assert.equal(first.cashOut.amount_paisa, 300000);
    assert.equal(first.totals.cash_in_paisa, 500000);
    assert.equal(first.totals.cash_out_paisa, 300000);
    assert.equal(first.totals.available_paisa, 200000);

    const duplicate = database.createCashOut(admin, {
      route_id: route.id, fund_id: welfare.id, total_trips: 3, request_key: 'cash-out-1'
    });
    assert.equal(duplicate.duplicate, true);
    assert.equal(database.db.prepare('SELECT COUNT(*) AS count FROM cash_outs').get().count, 1);
    assert.throws(() => database.createCashOut(admin, {
      route_id: route.id, fund_id: welfare.id, total_trips: 2, request_key: 'cash-out-1'
    }), /already used for a different entry/);
    assert.equal(database.cashbook(admin).funds.find((item) => item.id === welfare.id).cash_out_paisa, 300000);
    assert.throws(() => database.createCashOut(admin, {
      route_id: route.id, fund_id: welfare.id, total_trips: 3, request_key: 'cash-out-2'
    }), /available cash balance/);
    const incomeId = database.db.prepare("SELECT id FROM fund_transactions WHERE transaction_type='income'").get().id;
    assert.throws(() => database.updateTransaction(admin, {
      id: incomeId, fund_id: fund.id, amount_paisa: 299999
    }), /already paid out/);
    assert.throws(() => database.deleteRecord(admin, 'funds', welfare.id), /FOREIGN KEY constraint failed/);
    assert.equal(database.db.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE entity='cash_out'").get().count, 1);
  }));

test('route Cash In and Cash Out produce the expected balances with multiple funds per route', () =>
  withDatabase(({ database, admin }) => {
    const route = database.saveRecord(admin, 'routes', { name: 'Dhaka', charge_paisa: 89000 });
    const otherRoute = database.saveRecord(admin, 'routes', { name: 'Chattogram', charge_paisa: 70000 });
    const seeded = (name) => database.db.prepare('SELECT * FROM funds WHERE name=?').get(name);
    const maintenance = database.saveRecord(admin, 'funds', {
      name: 'Maintenance Fund', route_id: route.id, amount_paisa: 20000
    });
    const developmentSeed = seeded('Development Fund');
    const development = database.saveRecord(admin, 'funds', {
      id: developmentSeed.id, name: developmentSeed.name, route_id: route.id, amount_paisa: 15000
    });
    const emergencySeed = seeded('Emergency Fund');
    const emergency = database.saveRecord(admin, 'funds', {
      id: emergencySeed.id, name: emergencySeed.name, route_id: route.id, amount_paisa: 10000
    });
    const otherFund = database.saveRecord(admin, 'funds', {
      name: 'Chattogram Fund', route_id: otherRoute.id, amount_paisa: 5000
    });
    assert.deepEqual(database.db.prepare('SELECT name FROM funds WHERE route_id=? ORDER BY name').all(route.id).map((row) => row.name),
      ['Development Fund', 'Emergency Fund', 'Maintenance Fund']);
    assert.throws(() => database.saveRecord(admin, 'funds', {
      name: 'Maintenance Fund', route_id: route.id, amount_paisa: 25000
    }), /UNIQUE/);

    const saved = database.createCashIn(admin, {
      route_id: route.id, total_trips: 2, request_key: 'cash-in-890-2'
    });
    assert.equal(saved.cashIn.per_trip_paisa, 89000);
    assert.equal(saved.cashIn.total_amount_paisa, 178000);
    assert.equal(saved.totals.cash_in_paisa, 178000);
    assert.equal(saved.totals.available_paisa, 178000);

    const maintenanceOut = database.createCashOut(admin, {
      route_id: route.id, fund_id: maintenance.id, total_trips: 2, request_key: 'cash-out-maintenance-2'
    });
    const developmentOut = database.createCashOut(admin, {
      route_id: route.id, fund_id: development.id, total_trips: 2, request_key: 'cash-out-development-2'
    });
    const emergencyOut = database.createCashOut(admin, {
      route_id: route.id, fund_id: emergency.id, total_trips: 2, request_key: 'cash-out-emergency-2'
    });
    assert.equal(maintenanceOut.cashOut.per_trip_paisa, 20000);
    assert.equal(maintenanceOut.cashOut.amount_paisa, 40000);
    assert.equal(developmentOut.cashOut.per_trip_paisa, 15000);
    assert.equal(developmentOut.cashOut.amount_paisa, 30000);
    assert.equal(emergencyOut.cashOut.per_trip_paisa, 10000);
    assert.equal(emergencyOut.cashOut.amount_paisa, 20000);
    assert.equal(emergencyOut.totals.cash_in_paisa, 178000);
    assert.equal(emergencyOut.totals.cash_out_paisa, 90000);
    assert.equal(emergencyOut.totals.available_paisa, 88000);

    const view = database.cashbook(admin);
    assert.equal(view.cashOuts.length, 3);
    assert.equal(view.funds.find((item) => item.id === maintenance.id).balance_paisa, 40000);
    assert.equal(view.funds.find((item) => item.id === development.id).balance_paisa, 30000);
    assert.equal(view.funds.find((item) => item.id === emergency.id).balance_paisa, 20000);
    assert.equal(view.funds.find((item) => item.id === otherFund.id).balance_paisa, 0);
    assert.equal(database.dashboard(admin).totals.funds_paisa, 90000);
    assert.throws(() => database.createCashOut(admin, {
      route_id: route.id, fund_id: otherFund.id, total_trips: 1, request_key: 'cash-out-wrong-route'
    }), /not assigned to this route/);
    assert.throws(() => database.createCashOut(admin, {
      route_id: route.id, fund_id: maintenance.id, total_trips: 5, request_key: 'cash-out-overdraw'
    }), /available cash balance/);
    assert.throws(() => database.createCashOut(admin, {
      route_id: route.id, fund_id: maintenance.id, total_trips: 0, request_key: 'cash-out-zero-trips'
    }), /greater than zero/);
    assert.throws(() => database.deleteCashIn(admin, saved.cashIn.id), /already paid out/);
  }));

test('holiday Cash In and route fund allocation are classified, reported and preserved after reopening', () => {
  const context = setupDatabase();
  const { directory, filePath, admin } = context;
  let database = context.database;
  try {
    const route = database.saveRecord(admin, 'routes', { name: 'Dhaka Holiday Route', charge_paisa: 89000 });
    const maintenance = database.saveRecord(admin, 'funds', {
      name: 'Holiday Maintenance', route_id: route.id, amount_paisa: 20000
    });
    const developmentSeed = database.db.prepare("SELECT * FROM funds WHERE name='Development Fund'").get();
    const development = database.saveRecord(admin, 'funds', {
      id: developmentSeed.id, name: developmentSeed.name, route_id: route.id, amount_paisa: 15000
    });
    const emergencySeed = database.db.prepare("SELECT * FROM funds WHERE name='Emergency Fund'").get();
    const emergency = database.saveRecord(admin, 'funds', {
      id: emergencySeed.id, name: emergencySeed.name, route_id: route.id, amount_paisa: 10000
    });
    const now = new Date();
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const holiday = database.createCashIn(admin, {
      cash_in_type: 'Holiday', date, route_id: route.id, total_trips: 3,
      request_key: 'holiday-cash-in-dhaka-3'
    });
    assert.equal(holiday.cashIn.cash_in_type, 'Holiday');
    assert.equal(holiday.cashIn.date, date);
    assert.equal(holiday.cashIn.per_trip_paisa, 89000);
    assert.equal(holiday.cashIn.total_amount_paisa, 267000);

    const sameRouteAndDate = database.createCashIn(admin, {
      cash_in_type: 'Regular', date, route_id: route.id, total_trips: 1,
      request_key: 'regular-cash-in-same-day'
    });
    assert.equal(sameRouteAndDate.duplicate, false, 'multiple Cash In entries for one route and date are allowed');
    database.deleteCashIn(admin, sameRouteAndDate.cashIn.id);

    const cashOut = database.createCashOutBatch(admin, {
      route_id: route.id, total_trips: 3, request_key: 'holiday-fund-allocation'
    });
    assert.equal(cashOut.cashOuts.length, 3);
    assert.equal(cashOut.cashOuts.find((row) => row.fund_id === maintenance.id).amount_paisa, 60000);
    assert.equal(cashOut.cashOuts.find((row) => row.fund_id === development.id).amount_paisa, 45000);
    assert.equal(cashOut.cashOuts.find((row) => row.fund_id === emergency.id).amount_paisa, 30000);
    assert.deepEqual(cashOut.totals, {
      regular_cash_in_paisa: 0, holiday_cash_in_paisa: 267000, cash_in_paisa: 267000,
      cash_out_paisa: 135000, available_paisa: 132000
    });
    assert.equal(database.cashbook(admin).funds.find((fund) => fund.id === maintenance.id).balance_paisa, 60000);
    assert.equal(database.cashbook(admin).funds.find((fund) => fund.id === development.id).balance_paisa, 45000);
    assert.equal(database.cashbook(admin).funds.find((fund) => fund.id === emergency.id).balance_paisa, 30000);

    assert.equal(database.report(admin, {
      type: 'cash-in-holiday', from: date, to: date
    }).filter((row) => row.cash_in_id === holiday.cashIn.id).length, 1);
    assert.equal(database.report(admin, {
      type: 'cash-in-regular', from: date, to: date
    }).some((row) => row.cash_in_id === holiday.cashIn.id), false);
    const daily = database.report(admin, { type: 'daily-cashbook', from: date, to: date });
    assert.equal(daily.filter((row) => row.transaction_type === 'Cash In').length, 1);
    assert.equal(daily.filter((row) => row.transaction_type === 'Cash Out').length, 3);
    assert.equal(database.report(admin, {
      type: 'cash-out', from: date, to: date
    }).reduce((total, row) => total + row.total_amount_paisa, 0), 135000);
    const fundReport = database.report(admin, { type: 'funds' });
    assert.equal(fundReport.find((row) => row.name === 'Holiday Maintenance').balance_paisa, 60000);
    assert.equal(database.dashboard(admin).totals.holiday_cash_in_paisa, 267000);
    assert.equal(database.dashboard(admin).totals.available_cash_paisa, 132000);

    database.close();
    database = new AssociationDatabase(filePath);
    const persisted = database.cashbook(admin);
    assert.equal(persisted.totals.holiday_cash_in_paisa, 267000);
    assert.equal(persisted.totals.cash_out_paisa, 135000);
    assert.equal(persisted.totals.available_paisa, 132000);
    assert.equal(persisted.income.find((row) => row.id === holiday.cashIn.id).cash_in_type, 'Holiday');
  } finally {
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('Cash Out automatically applies every assigned fund and keeps one batch entry', () =>
  withDatabase(({ database, admin }) => {
    const route = database.saveRecord(admin, 'routes', { name: 'Batch Route', charge_paisa: 89000 });
    const emptyRoute = database.saveRecord(admin, 'routes', { name: 'Empty Route', charge_paisa: 70000 });
    const maintenance = database.saveRecord(admin, 'funds', { name: 'Batch Maintenance', route_id: route.id, amount_paisa: 20000 });
    const development = database.saveRecord(admin, 'funds', { name: 'Batch Development', route_id: route.id, amount_paisa: 15000 });
    const emergency = database.saveRecord(admin, 'funds', { name: 'Batch Emergency', route_id: route.id, amount_paisa: 10000 });
    database.createCashIn(admin, { route_id: route.id, total_trips: 2, request_key: 'batch-cash-in' });

    const batch = database.createCashOutBatch(admin, {
      route_id: route.id, total_trips: 2, request_key: 'batch-cash-out'
    });
    assert.equal(batch.duplicate, false);
    assert.equal(batch.cashOuts.length, 3);
    assert.equal(batch.cashOuts.every((row) => row.batch_key === 'batch-cash-out'), true);
    assert.equal(batch.cashOuts.find((row) => row.fund_id === maintenance.id).amount_paisa, 40000);
    assert.equal(batch.cashOuts.find((row) => row.fund_id === development.id).amount_paisa, 30000);
    assert.equal(batch.cashOuts.find((row) => row.fund_id === emergency.id).amount_paisa, 20000);
    assert.equal(batch.totals.cash_out_paisa, 90000);
    assert.equal(batch.totals.available_paisa, 88000);
    const balances = () => database.cashbook(admin).funds;
    assert.equal(balances().find((fund) => fund.id === maintenance.id).balance_paisa, 40000);
    assert.equal(balances().find((fund) => fund.id === development.id).balance_paisa, 30000);
    assert.equal(balances().find((fund) => fund.id === emergency.id).balance_paisa, 20000);

    const duplicate = database.createCashOutBatch(admin, {
      route_id: route.id, total_trips: 2, request_key: 'batch-cash-out'
    });
    assert.equal(duplicate.duplicate, true);
    assert.equal(database.db.prepare('SELECT COUNT(*) AS count FROM cash_outs').get().count, 3);
    assert.throws(() => database.createCashOutBatch(admin, {
      route_id: route.id, total_trips: 3, request_key: 'batch-cash-out'
    }), /already used for a different entry/);
    assert.throws(() => database.createCashOutBatch(admin, {
      route_id: emptyRoute.id, total_trips: 1, request_key: 'batch-empty-route'
    }), /has no assigned funds/);
    assert.throws(() => database.createCashOutBatch(admin, {
      route_id: route.id, fund_ids: [], total_trips: 1, request_key: 'batch-no-selection'
    }), /at least one assigned fund/);

    const updated = database.updateCashOutBatch(admin, {
      id: batch.cashOuts[0].id, route_id: route.id, total_trips: 3
    });
    assert.equal(updated.cashOuts.length, 3);
    assert.equal(updated.totals.cash_out_paisa, 135000);
    assert.equal(updated.totals.available_paisa, 43000);
    assert.equal(balances().find((fund) => fund.id === maintenance.id).balance_paisa, 60000);
    assert.equal(balances().find((fund) => fund.id === development.id).balance_paisa, 45000);
    assert.equal(balances().find((fund) => fund.id === emergency.id).balance_paisa, 30000);

    const cleared = database.deleteCashOut(admin, updated.cashOuts[0].id);
    assert.equal(cleared.cash_out_paisa, 0);
    assert.equal(cleared.available_paisa, 178000);
    assert.equal(database.db.prepare('SELECT COUNT(*) AS count FROM cash_outs').get().count, 0);
    assert.equal(balances().find((fund) => fund.id === maintenance.id).balance_paisa, 0);
    assert.deepEqual(database.db.prepare("SELECT action FROM audit_logs WHERE entity='cash_out_batch' ORDER BY id").all().map((row) => row.action),
      ['create', 'correct', 'delete']);
  }));

test('Cash Out edits and deletes are audited and recalculate fund balances', () =>
  withDatabase(({ database, admin }) => {
    const route = database.saveRecord(admin, 'routes', { name: 'Dhaka', charge_paisa: 89000 });
    const otherRoute = database.saveRecord(admin, 'routes', { name: 'Chattogram', charge_paisa: 70000 });
    const maintenance = database.saveRecord(admin, 'funds', {
      name: 'Maintenance Fund', route_id: route.id, amount_paisa: 20000
    });
    const development = database.saveRecord(admin, 'funds', {
      name: 'Road Development Fund', route_id: route.id, amount_paisa: 15000
    });
    database.createCashIn(admin, { route_id: route.id, total_trips: 2, request_key: 'cash-out-edit-cash-in' });
    const created = database.createCashOut(admin, {
      route_id: route.id, fund_id: maintenance.id, total_trips: 2, request_key: 'cash-out-edit'
    });
    const second = database.createCashOut(admin, {
      route_id: route.id, fund_id: development.id, total_trips: 3, request_key: 'cash-out-delete'
    });
    assert.throws(() => database.createCashOut(admin, {
      route_id: otherRoute.id, fund_id: maintenance.id, total_trips: 1, request_key: 'cash-out-wrong-route'
    }), /not assigned to this route/);

    const updated = database.updateCashOut(admin, {
      id: created.cashOut.id, route_id: route.id, fund_id: maintenance.id, total_trips: 3
    });
    assert.equal(updated.cashOut.amount_paisa, 60000);
    assert.equal(updated.totals.cash_out_paisa, 105000);
    assert.equal(updated.totals.available_paisa, 73000);
    assert.equal(database.cashbook(admin).funds.find((item) => item.id === maintenance.id).balance_paisa, 60000);

    const totals = database.deleteCashOut(admin, second.cashOut.id);
    assert.equal(totals.cash_out_paisa, 60000);
    assert.equal(totals.available_paisa, 118000);
    assert.equal(database.db.prepare('SELECT COUNT(*) AS count FROM cash_outs').get().count, 1);
    assert.deepEqual(database.db.prepare("SELECT action FROM audit_logs WHERE entity='cash_out' ORDER BY id").all().map((row) => row.action),
      ['create', 'create', 'correct', 'delete']);
  }));

test('Cash In edits and deletes are audited and recalculate totals', () =>
  withDatabase(({ database, admin }) => {
    const route = database.saveRecord(admin, 'routes', { name: 'Dhaka', charge_paisa: 89000 });
    const created = database.createCashIn(admin, {
      route_id: route.id, total_trips: 2, request_key: 'cash-in-edit-delete'
    });
    const updated = database.updateCashIn(admin, {
      id: created.cashIn.id, route_id: route.id, total_trips: 3
    });
    assert.equal(updated.cashIn.total_amount_paisa, 267000);
    assert.equal(updated.totals.available_paisa, 267000);

    const totals = database.deleteCashIn(admin, created.cashIn.id);
    assert.equal(totals.cash_in_paisa, 0);
    assert.equal(database.db.prepare('SELECT COUNT(*) AS count FROM route_cash_ins').get().count, 0);
    assert.deepEqual(database.db.prepare("SELECT action FROM audit_logs WHERE entity='cash_in' ORDER BY id").all().map((row) => row.action),
      ['create', 'correct', 'delete']);
  }));

test('Delete All clears both Cashbook lists and keeps balances consistent', () =>
  withDatabase(({ database, admin, owner, route, fund }) => {
    database.postTransaction(admin, {
      transaction_type: 'income', date: '2026-10-30', fund_id: fund.id, amount_paisa: 100000, owner_id: owner.id
    });
    const welfare = database.saveRecord(admin, 'funds', {
      name: 'Welfare Allocation', route_id: route.id, amount_paisa: 50000
    });
    database.createCashIn(admin, { route_id: route.id, total_trips: 2, request_key: 'clear-all-in' });
    database.createCashOut(admin, { route_id: route.id, fund_id: welfare.id, total_trips: 2, request_key: 'clear-all-out' });
    database.db.prepare(`INSERT INTO fund_distributions(fund_id,fund_name,date,amount_paisa,request_key)
      VALUES (?,?,?,?,?)`).run(fund.id, 'General Fund', '2026-10-29', 25000, 'clear-all-legacy');

    assert.throws(() => database.clearCashIns(admin), /Delete all Cash Out entries before clearing Cash In/);
    const afterOut = database.clearCashOuts(admin);
    assert.equal(afterOut.cash_out_paisa, 0);
    assert.equal(database.db.prepare('SELECT COUNT(*) AS count FROM cash_outs').get().count, 0);
    assert.equal(database.db.prepare('SELECT COUNT(*) AS count FROM fund_distributions').get().count, 0);
    assert.equal(afterOut.cash_in_paisa, 200000);

    const afterIn = database.clearCashIns(admin);
    assert.equal(afterIn.cash_in_paisa, 0);
    assert.equal(afterIn.available_paisa, 0);
    assert.equal(database.db.prepare('SELECT COUNT(*) AS count FROM route_cash_ins').get().count, 0);
    assert.equal(database.db.prepare("SELECT COUNT(*) AS count FROM fund_transactions WHERE transaction_type='income'").get().count, 0);
    assert.equal(database.db.prepare('SELECT COUNT(*) AS count FROM receipts').get().count, 0);
    assert.deepEqual(database.db.prepare("SELECT action,entity FROM audit_logs WHERE action='delete' ORDER BY id DESC LIMIT 2").all(),
      [{ action: 'delete', entity: 'cash_in' }, { action: 'delete', entity: 'cash_out' }]);
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
    const fund = database.saveRecord(admin, 'funds', { name: 'Reserve Fund', route_id: saved.id, amount_paisa: 100000, is_active: true });
    assert.equal(fund.is_active, 1);
    assert.equal(fund.route_id, saved.id);
    assert.equal(fund.amount_paisa, 100000);
    const resting = database.saveRecord(admin, 'funds', { id: fund.id, name: 'Reserve Fund', route_id: saved.id, amount_paisa: 100000, is_active: false });
    assert.equal(resting.is_active, 0);
    assert.equal(database.cashbook(admin).funds.some((item) => item.id === fund.id), false, 'inactive funds leave the cashbook');
    const untouched = database.saveRecord(admin, 'funds', { id: fund.id, name: 'Reserve Fund', route_id: saved.id, amount_paisa: 200000 });
    assert.equal(untouched.is_active, 0, 'a save without the checkbox keeps the stored flag');
    assert.equal(untouched.amount_paisa, 200000);
    assert.equal(database.routeAccount(admin, saved.id).funds.length, 1, 'route account lists assigned funds');
    assert.throws(() => database.saveRecord(admin, 'funds', { name: 'No Route', amount_paisa: 1000 }), /Choose a route for this fund/);
    assert.throws(() => database.saveRecord(admin, 'funds', { name: 'No Amount', route_id: saved.id }), /greater than zero/);
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
    const routeFund = database.saveRecord(admin, 'funds', { name: 'Route Cash Fund', route_id: route.id, amount_paisa: 10000 });
    database.createCashIn(admin, { route_id: route.id, total_trips: 2, request_key: 'report-cash-in' });
    database.createCashOut(admin, { route_id: route.id, fund_id: routeFund.id, total_trips: 2, request_key: 'report-cash-out' });
    for (const type of ['owners', 'buses', 'routes', 'members', 'funds', 'daily', 'monthly', 'yearly', 'income', 'expense', 'cash-in', 'cash-out', 'receipts', 'transactions']) {
      const report = database.report(admin, { type, from: '2026-01-01', to: '2026-12-31' });
      assert.ok(Array.isArray(report), `${type} report returns rows`);
    }
    const cashInReport = database.report(admin, { type: 'cash-in', from: '2026-01-01', to: '2026-12-31' });
    assert.equal(cashInReport.find((row) => row.route_name === route.name).total_amount_paisa, 100000);
    const cashOutReport = database.report(admin, { type: 'cash-out', from: '2026-01-01', to: '2026-12-31' });
    assert.equal(cashOutReport.length, 1);
    assert.equal(cashOutReport[0].fund_name, 'Route Cash Fund');
    assert.equal(cashOutReport[0].total_amount_paisa, 20000);
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
    const cashPdfPath = path.join(directory, 'cash-in-report.pdf');
    const excelPath = path.join(directory, 'report.xlsx');
    await database.exportPdf(pdfPath, 'Transaction report', Object.keys(transactions[0]), transactions);
    await database.exportPdf(cashPdfPath, 'Cash In report', Object.keys(cashInReport[0]), cashInReport, { orientation: 'portrait' });
    await database.exportExcel(excelPath, 'Transaction report', Object.keys(transactions[0]), transactions);
    assert.equal(fs.readFileSync(pdfPath).subarray(0, 4).toString(), '%PDF');
    assert.match(fs.readFileSync(cashPdfPath, 'latin1'), /MediaBox \[0 0 595\.28 841\.89\]/);
    assert.equal(fs.readFileSync(excelPath).subarray(0, 2).toString(), 'PK');
  }));

test('bus list search matches bus number, owner, mobile and route with route/status filters', () =>
  withDatabase(({ database, admin, owner, route, bus }) => {
    const secondOwner = database.saveRecord(admin, 'owners', {
      name: 'Owner Two', mobile: '01911111111', join_date: '2026-02-01', status: 'Active'
    });
    const secondRoute = database.saveRecord(admin, 'routes', { name: 'Dhaka-Chattogram', charge_paisa: 70000 });
    const secondBus = database.saveRecord(admin, 'buses', {
      registration_number: 'CHATTO-METRO-22-5678', owner_id: secondOwner.id, route_id: secondRoute.id,
      status: 'Inactive', bus_type: 'Non-AC', driver_mobile: '01922222222'
    });
    const ids = (rows) => rows.map((row) => row.id);

    assert.deepEqual(ids(database.listRecords(admin, 'buses', 'DHAKA-METRO-11')), [bus.id], 'bus number search');
    assert.deepEqual(ids(database.listRecords(admin, 'buses', 'Owner One')), [bus.id], 'owner name search');
    assert.deepEqual(ids(database.listRecords(admin, 'buses', '01700000000')), [bus.id], 'owner mobile search');
    assert.deepEqual(ids(database.listRecords(admin, 'buses', 'Dhaka-Khulna')), [bus.id], 'route name search');
    assert.deepEqual(ids(database.listRecords(admin, 'buses', '', { route_id: secondRoute.id })), [secondBus.id], 'route filter');
    assert.deepEqual(ids(database.listRecords(admin, 'buses', '', { status: 'Active' })), [bus.id], 'active filter');
    assert.deepEqual(ids(database.listRecords(admin, 'buses', '', { status: 'Inactive' })), [secondBus.id], 'inactive filter');
    assert.deepEqual(ids(database.listRecords(admin, 'buses', 'Owner Two', { route_id: secondRoute.id, status: 'Inactive' })), [secondBus.id], 'combined filters');
    assert.equal(database.listRecords(admin, 'buses', 'Owner Two', { status: 'Active' }).length, 0);
  }));

test('Cash In report includes only the route buses with live statuses and correct counts', () =>
  withDatabase(({ database, admin, owner, route }) => {
    database.db.prepare('UPDATE owners SET address=? WHERE id=?').run('ঢাকা, বাংলাদেশ', owner.id);
    const routeBuses = [null];
    for (let index = 1; index <= 9; index += 1) {
      routeBuses.push(database.saveRecord(admin, 'buses', {
        registration_number: `ROUTE-BUS-${index}`,
        owner_id: owner.id,
        route_id: route.id,
        status: index <= 6 ? 'Active' : 'Inactive'
      }));
    }
    const otherRoute = database.saveRecord(admin, 'routes', {
      name: 'Other Route', charge_paisa: 65000
    });
    database.saveRecord(admin, 'buses', {
      registration_number: 'OTHER-ROUTE-BUS',
      owner_id: owner.id,
      route_id: otherRoute.id,
      status: 'Active'
    });
    const cashIn = database.createCashIn(admin, {
      route_id: route.id, total_trips: 2, request_key: 'route-bus-detail-report'
    });
    const queryReport = () => database.report(admin, {
      type: 'cash-in', from: '0001-01-01', to: '9999-12-31'
    }).filter((row) => row.cash_in_id === cashIn.cashIn.id);

    let rows = queryReport();
    assert.equal(rows.length, 10);
    assert.equal(rows[0].route_name, route.name);
    assert.equal(rows[0].date, cashIn.cashIn.date);
    assert.equal(rows[0].total_trips, 2);
    assert.equal(rows[0].total_amount_paisa, cashIn.cashIn.total_amount_paisa);
    assert.equal(rows[0].total_buses, 10);
    assert.equal(rows[0].active_buses, 7);
    assert.equal(rows[0].inactive_buses, 3);
    assert.equal(rows.every((row) => row.owner_name === owner.name), true);
    assert.equal(rows.every((row) => row.owner_mobile === owner.mobile), true);
    assert.equal(rows.every((row) => row.address === 'ঢাকা, বাংলাদেশ'), true);
    assert.equal(rows.some((row) => row.registration_number === 'OTHER-ROUTE-BUS'), false);
    assert.equal(rows.filter((row) => row.status === 'Active').length, 7);
    assert.equal(rows.filter((row) => row.status === 'Inactive').length, 3);

    database.setBusStatus(admin, routeBuses[1].id, 'Inactive');
    rows = queryReport();
    assert.equal(rows[0].active_buses, 6, 'report counts use current bus status');
    assert.equal(rows[0].inactive_buses, 4, 'report counts use current bus status');
    assert.equal(rows.find((row) => row.registration_number === routeBuses[1].registration_number).status, 'Inactive');
    assert.equal(rows[0].total_trips, 2, 'Cash In history is unchanged by bus status updates');
    assert.equal(rows[0].total_amount_paisa, cashIn.cashIn.total_amount_paisa);
  }));

test('bus status changes keep history and update the dashboard and route report', () =>
  withDatabase(({ database, admin, owner, route, bus, fund }) => {
    database.postTransaction(admin, {
      transaction_type: 'income', date: '2026-10-30', fund_id: fund.id, amount_paisa: 50000,
      owner_id: owner.id, bus_id: bus.id
    });

    const updated = database.setBusStatus(admin, bus.id, 'Inactive');
    assert.equal(updated.status, 'Inactive');
    const inactiveTotals = database.dashboard(admin).totals;
    assert.equal(inactiveTotals.buses, 1);
    assert.equal(inactiveTotals.active_buses, 0);
    assert.equal(inactiveTotals.inactive_buses, 1);

    const grouped = database.report(admin, { type: 'bus-status' });
    assert.equal(grouped.length, 1);
    assert.equal(grouped[0].route_name, route.name);
    assert.equal(grouped[0].total_buses, 1);
    assert.equal(grouped[0].active_buses, 0);
    assert.equal(grouped[0].inactive_buses, 1);

    assert.equal(database.busAccount(admin, bus.id).payments.length, 1, 'bus history survives the status change');
    assert.equal(database.routeAccount(admin, route.id).buses.length, 1, 'route membership survives the status change');
    assert.equal(database.report(admin, { type: 'buses' }).length, 1, 'the inactive bus remains in reports');
    assert.equal(database.listRecords(admin, 'buses', '', { status: 'Inactive' }).length, 1);

    database.setBusStatus(admin, bus.id, 'Active');
    const activeTotals = database.dashboard(admin).totals;
    assert.equal(activeTotals.active_buses, 1);
    assert.equal(activeTotals.inactive_buses, 0);

    const staff = database.createUser({ username: 'status-staff', full_name: 'Status Staff', password: 'secure-password', role: 'staff' }, admin);
    assert.throws(() => database.setBusStatus(staff, bus.id, 'Inactive'), /permission/);
    assert.throws(() => database.setBusStatus(admin, bus.id, 'Repair'), /Active or Inactive/);
  }));

test('route-wise bus status report groups counts and honours route, status and bus number filters', () =>
  withDatabase(({ database, admin, owner, route, bus }) => {
    const secondOwner = database.saveRecord(admin, 'owners', {
      name: 'Owner Two', mobile: '01911111111', join_date: '2026-02-01', status: 'Active'
    });
    const secondRoute = database.saveRecord(admin, 'routes', { name: 'Dhaka-Chattogram', charge_paisa: 70000 });
    database.saveRecord(admin, 'buses', {
      registration_number: 'CHATTO-METRO-22-5678', owner_id: secondOwner.id, route_id: secondRoute.id, status: 'Active'
    });
    database.saveRecord(admin, 'buses', {
      registration_number: 'DHAKA-METRO-33-9999', owner_id: owner.id, route_id: route.id, status: 'Inactive'
    });
    database.saveRecord(admin, 'buses', {
      registration_number: 'UNASSIGNED-44-0001', owner_id: secondOwner.id, status: 'Active'
    });

    const all = database.report(admin, { type: 'bus-status' });
    const routeRow = all.find((row) => row.route_name === route.name);
    assert.equal(routeRow.total_buses, 2);
    assert.equal(routeRow.active_buses, 1);
    assert.equal(routeRow.inactive_buses, 1);
    const secondRouteRow = all.find((row) => row.route_name === secondRoute.name);
    assert.equal(secondRouteRow.total_buses, 1);
    assert.equal(secondRouteRow.active_buses, 1);
    assert.equal(secondRouteRow.inactive_buses, 0);
    assert.equal(all.find((row) => row.route_name === 'Unassigned').total_buses, 1);

    const activeOnly = database.report(admin, { type: 'bus-status', status: 'Active' });
    const activeRouteRow = activeOnly.find((row) => row.route_name === route.name);
    assert.equal(activeRouteRow.total_buses, 1);
    assert.equal(activeRouteRow.active_buses, 1);
    assert.equal(activeRouteRow.inactive_buses, 0);
    assert.equal(activeOnly.some((row) => row.route_name === secondRoute.name), true);

    assert.deepEqual(database.report(admin, { type: 'bus-status', route_id: secondRoute.id, status: 'Inactive' }), []);
    const searched = database.report(admin, { type: 'bus-status', bus_search: 'DHAKA-METRO-33' });
    assert.equal(searched.length, 1);
    assert.equal(searched[0].route_name, route.name);
    assert.equal(searched[0].total_buses, 1);
    assert.equal(searched[0].active_buses, 0);
    assert.equal(searched[0].inactive_buses, 1);

    const totals = database.dashboard(admin).totals;
    assert.equal(totals.buses, 4);
    assert.equal(totals.active_buses, 3);
    assert.equal(totals.inactive_buses, 1);
  }));

test('detailed route-wise bus status report lists each bus with owner, mobile and status', () =>
  withDatabase(({ database, admin, owner, route, bus }) => {
    const secondOwner = database.saveRecord(admin, 'owners', {
      name: 'Owner Two', mobile: '01911111111', join_date: '2026-02-01', status: 'Active'
    });
    const secondRoute = database.saveRecord(admin, 'routes', { name: 'Dhaka-Chattogram', charge_paisa: 70000 });
    database.saveRecord(admin, 'buses', {
      registration_number: 'CHATTO-METRO-22-5678', owner_id: secondOwner.id, route_id: secondRoute.id, status: 'Active'
    });
    database.saveRecord(admin, 'buses', {
      registration_number: 'DHAKA-METRO-33-9999', owner_id: owner.id, route_id: route.id, status: 'Inactive'
    });
    database.saveRecord(admin, 'buses', {
      registration_number: 'UNASSIGNED-44-0001', owner_id: secondOwner.id, status: 'Active'
    });

    const rows = database.report(admin, { type: 'bus-status-list' });
    assert.equal(rows.length, 4);
    assert.deepEqual(Object.keys(rows[0]).sort(),
      ['owner_mobile', 'owner_name', 'registration_number', 'route_name', 'status'].sort());
    const routeRows = rows.filter((row) => row.route_name === route.name);
    assert.deepEqual(routeRows.map((row) => row.registration_number),
      [bus.registration_number, 'DHAKA-METRO-33-9999'], 'active buses are listed before inactive buses');
    assert.equal(routeRows[0].status, 'Active');
    assert.equal(routeRows[1].status, 'Inactive');
    assert.equal(routeRows[0].owner_name, owner.name);
    assert.equal(routeRows[0].owner_mobile, owner.mobile);

    const inactiveOnly = database.report(admin, { type: 'bus-status-list', status: 'Inactive' });
    assert.equal(inactiveOnly.length, 1);
    assert.equal(inactiveOnly[0].registration_number, 'DHAKA-METRO-33-9999');
    const activeOnly = database.report(admin, { type: 'bus-status-list', status: 'Active' });
    assert.equal(activeOnly.length, 3);
    const routeFiltered = database.report(admin, { type: 'bus-status-list', route_id: secondRoute.id });
    assert.equal(routeFiltered.length, 1);
    assert.equal(routeFiltered[0].owner_name, secondOwner.name);
    const searched = database.report(admin, { type: 'bus-status-list', bus_search: 'DHAKA-METRO-33' });
    assert.equal(searched.length, 1);
    assert.equal(searched[0].status, 'Inactive');
    assert.equal(rows.find((row) => row.route_name === 'Unassigned').registration_number, 'UNASSIGNED-44-0001');
  }));


test('six-field bus owner import previews, validates and imports rows without touching existing data', () =>
  withDatabase(({ database, admin, owner, route, bus }) => {
    const mapping = { owner_name: 0, bus_number: 1, father_name: 2, mobile: 3, address: 4, status: 5 };
    const rows = [
      { rowNumber: 2, cells: ['New Owner', 'DHAKA-METRO-22-1111', 'Father', '01811111111', 'বাংলাদেশ', 'Active'] },
      { rowNumber: 3, cells: ['Existing Owner', 'NEW-BUS-2222', 'Father', '01700000000', '', ''] },
      { rowNumber: 4, cells: ['Duplicate Owner', 'dhaka-metro-১১-১২৩৪', 'Father', '01911111111', '', ''] },
      { rowNumber: 5, cells: ['Duplicate File Owner', 'DHAKA-METRO-22-1111', 'Father', '01922222222', '', ''] },
      { rowNumber: 6, cells: ['Owner without route', 'NEW-BUS-3333', 'Father', '01933333333', 'ঠিকানা', 'Active'] },
      { rowNumber: 7, cells: ['Bad Mobile Owner', 'NEW-BUS-4444', 'Father', 'abc', '', ''] },
      { rowNumber: 8, cells: ['Missing Bus Number', '', 'Father', '01944444444', '', ''] },
      { rowNumber: 9, cells: ['বাংলা মালিক', 'ঢাকা-মেট্রো-৫৫-৮৮৮৮', 'পিতা', '০১৮৭৭৭৭৭৭৭৭', 'ঢাকা', 'নিষ্ক্রিয়'] }
    ];

    const preview = database.previewBusOwnerImport(admin, rows, mapping);
    assert.equal(preview.totals.total, 8);
    assert.equal(preview.totals.valid, 4);
    assert.equal(preview.totals.duplicate, 2);
    assert.equal(preview.totals.invalid, 2);
    assert.deepEqual(preview.rows.find((row) => row.row === 8).missing, ['bus_number']);
    assert.equal(preview.rows.find((row) => row.row === 6).result, 'valid', 'a route is not required for the six accepted fields');
    assert.match(preview.rows.find((row) => row.row === 7).reasons.join(' '), /Mobile number is invalid/);
    assert.equal(preview.rows.find((row) => row.row === 3).existing_owner_name, owner.name);
    assert.equal(database.db.prepare('SELECT COUNT(*) AS count FROM buses').get().count, 1, 'preview does not save rows');
    assert.equal(database.db.prepare('SELECT COUNT(*) AS count FROM owners').get().count, 1, 'preview does not save owners');

    const result = database.importBusOwners(admin, rows, mapping);
    assert.equal(result.totals.total, 8);
    assert.equal(result.totals.imported, 4);
    assert.equal(result.totals.duplicates, 2);
    assert.equal(result.totals.failed, 2);
    assert.equal(result.issues.length, 4);
    assert.equal(database.db.prepare('SELECT COUNT(*) AS count FROM owners').get().count, 4, 'one existing owner is reused and three are created');
    assert.equal(database.db.prepare('SELECT COUNT(*) AS count FROM buses').get().count, 5);
    assert.equal(database.db.prepare('SELECT COUNT(*) AS count FROM routes').get().count, 1, 'an import does not modify routes');
    assert.equal(database.db.prepare("SELECT COUNT(*) AS count FROM buses WHERE registration_number='NEW-BUS-2222' AND owner_id=?").get(owner.id).count, 1, 'existing owner is linked by mobile');
    assert.equal(database.db.prepare('SELECT name FROM owners WHERE id=?').get(owner.id).name, owner.name, 'existing owner data is not overwritten');
    assert.equal(database.db.prepare("SELECT COUNT(*) AS count FROM buses WHERE registration_number=?").get(bus.registration_number).count, 1, 'existing bus is untouched');
    const banglaBus = database.db.prepare('SELECT * FROM buses WHERE registration_number=?').get('ঢাকা-মেট্রো-৫৫-৮৮৮৮');
    assert.equal(banglaBus.status, 'Inactive');
    const banglaOwner = database.db.prepare('SELECT * FROM owners WHERE mobile=?').get('01877777777');
    assert.equal(banglaOwner.name, 'বাংলা মালিক');
    assert.equal(banglaOwner.father_name, 'পিতা');
    assert.equal(banglaOwner.address, 'ঢাকা');
    assert.equal(banglaOwner.status, 'Inactive');
  }));

test('invalid rows do not reserve bus numbers and Bangla mobile digits are normalized', () =>
  withDatabase(({ database, admin }) => {
    const mapping = { owner_name: 0, bus_number: 1, mobile: 2, father_name: 3 };
    const rows = [
      { rowNumber: 2, cells: ['Incomplete Owner', 'NEW-BUS-5555', 'abc', 'Father'] },
      { rowNumber: 3, cells: ['Normalized Owner', 'NEW-BUS-5555', '০১৮১১১১১১১১', 'Father'] }
    ];
    const preview = database.previewBusOwnerImport(admin, rows, mapping);
    assert.equal(preview.totals.valid, 1);
    assert.equal(preview.totals.invalid, 1);
    assert.equal(preview.rows[0].result, 'invalid');
    assert.equal(preview.rows[1].result, 'valid');
    assert.equal(preview.rows[1].mobile, '01811111111');

    const result = database.importBusOwners(admin, rows, mapping);
    assert.equal(result.totals.imported, 1);
    assert.equal(result.totals.failed, 1);
    const imported = database.db.prepare(`SELECT b.registration_number,o.mobile FROM buses b
      JOIN owners o ON o.id=b.owner_id WHERE b.registration_number='NEW-BUS-5555'`).get();
    assert.equal(imported.mobile, '01811111111');
  }));

test('Bangladesh mobile normalization accepts Bangla digits, separators and country codes', () =>
  withDatabase(({ database, admin }) => {
    const mapping = { owner_name: 0, bus_number: 1, mobile: 2, father_name: 3 };
    const cases = [
      ['Bangla 017', '০১৭১২৩৪৫৬৭৮', '01712345678'],
      ['Bangla 018', '০১৮১২৩৪৫৬৭৮', '01812345678'],
      ['Bangla 019', '০১৯১২৩৪৫৬৭৮', '01912345678'],
      ['Bangla 013', '০১৩১২৩৪৫৬৭৮', '01312345678'],
      ['Bangla 014', '০১৪১২৩৪৫৬৭৮', '01412345678'],
      ['Bangla 015', '০১৫১২৩৪৫৬৭৮', '01512345678'],
      ['Bangla 016', '০১৬১২৩৪৫৬৭৮', '01612345678'],
      ['English with separators', '017-1234 5679', '01712345679'],
      ['Bangla with separators', '০১৮-১২৩৪ ৫৬৭৯', '01812345679'],
      ['International +880', '+880 1712345680', '01712345680'],
      ['International 88', '88-01812345681', '01812345681'],
      ['Full-width digits and dots', '０１９.１２３４.５６８２', '01912345682'],
      ['Zero-width characters', '017\u200b12345683', '01712345683']
    ];
    const rows = cases.map(([name, phone], index) => ({
      rowNumber: index + 2,
      cells: [name, `MOBILE-TEST-${index + 1}`, phone, 'Father']
    }));

    const preview = database.previewBusOwnerImport(admin, rows, mapping);
    assert.equal(preview.totals.valid, cases.length);
    assert.equal(preview.totals.invalid, 0);
    assert.deepEqual(preview.rows.map((row) => row.mobile), cases.map(([, , normalized]) => normalized));

    const imported = database.importBusOwners(admin, rows, mapping);
    assert.deepEqual(imported.totals, { total: cases.length, imported: cases.length, duplicates: 0, failed: 0 });
    const savedMobiles = database.db.prepare(`SELECT o.mobile FROM buses b
      JOIN owners o ON o.id=b.owner_id WHERE b.registration_number LIKE 'MOBILE-TEST-%'
      ORDER BY b.registration_number`).all().map((row) => row.mobile);
    assert.equal(savedMobiles.length, cases.length);
    assert.equal(savedMobiles.includes('+880 1712345680'), false, 'saved mobile values are normalized');
    assert.equal(savedMobiles.includes('01712345680'), true);
  }));

test('invalid Bangladesh mobile prefixes and numbers return a precise validation reason', () =>
  withDatabase(({ database, admin }) => {
    const preview = database.previewBusOwnerImport(admin, [
      { rowNumber: 2, cells: ['Invalid prefix', 'INVALID-MOBILE-1', '০১২১২৩৪৫৬৭৮', 'Father'] },
      { rowNumber: 3, cells: ['Invalid length', 'INVALID-MOBILE-2', '০১৭১২৩৪৫৬৭', 'Father'] },
      { rowNumber: 4, cells: ['Invalid characters', 'INVALID-MOBILE-3', 'abc০১৭১২৩৪৫৬৭৮', 'Father'] }
    ], { owner_name: 0, bus_number: 1, mobile: 2, father_name: 3 });
    assert.equal(preview.totals.invalid, 3);
    for (const row of preview.rows) assert.deepEqual(row.reasons, ['Mobile number is invalid.']);
  }));

test('unmapped father and mobile are reported as missing while address and status stay optional', () =>
  withDatabase(({ database, admin }) => {
    const mapping = { owner_name: 0, bus_number: 1, father_name: '', mobile: '', address: '', status: '' };
    const preview = database.previewBusOwnerImport(admin, [
      { rowNumber: 2, cells: ['Owner Without Contact Fields', 'OPTIONAL-FIELDS-1'] }
    ], mapping);
    assert.equal(preview.totals.valid, 0);
    assert.equal(preview.totals.invalid, 1);
    assert.deepEqual(preview.rows[0].missing, ['father_name', 'mobile']);
    assert.deepEqual(preview.rows[0].reasons, ["Father's name is required.", 'Mobile number is required.']);

    const completeMapping = { owner_name: 0, bus_number: 1, father_name: 2, mobile: 3, address: '', status: '' };
    const complete = database.previewBusOwnerImport(admin, [
      { rowNumber: 2, cells: ['Owner With Optional Fields', 'OPTIONAL-FIELDS-2', 'Father', '01811111111', 'unmapped address', 'unmapped status'] }
    ], completeMapping);
    assert.equal(complete.totals.valid, 1);
    assert.equal(complete.rows[0].mobile, '01811111111');
    assert.equal(complete.rows[0].address, '');
    assert.equal(complete.rows[0].status, 'Active');

    const result = database.importBusOwners(admin, [
      { rowNumber: 2, cells: ['Owner With Optional Fields', 'OPTIONAL-FIELDS-2', 'Father', '01811111111', 'unmapped address', 'unmapped status'] }
    ], completeMapping);
    assert.equal(result.totals.imported, 1);
    const owner = database.db.prepare("SELECT father_name,mobile,address,status FROM owners WHERE name='Owner With Optional Fields'").get();
    assert.deepEqual(owner, { father_name: 'Father', mobile: '01811111111', address: '', status: 'Active' });
  }));

test('zero valid rows return issues without writing or auditing an import', () =>
  withDatabase(({ database, admin }) => {
    const before = database.db.prepare('SELECT COUNT(*) AS count FROM audit_logs').get().count;
    const result = database.importBusOwners(admin, [
      { rowNumber: 2, cells: ['Invalid mobile', 'INVALID-MOBILE-4', '০১২১২৩৪৫৬৭৮', 'Father'] },
      { rowNumber: 3, cells: ['Missing bus number', '', '০১৭১২৩৪৫৬৭৮', 'Father'] }
    ], { owner_name: 0, bus_number: 1, mobile: 2, father_name: 3 });
    assert.deepEqual(result.totals, { total: 2, imported: 0, duplicates: 0, failed: 2 });
    assert.equal(result.issues.length, 2);
    assert.equal(result.issues[0].reason, 'Mobile number is invalid.');
    assert.equal(result.issues[1].reason, 'Bus number is required.');
    assert.equal(database.db.prepare('SELECT COUNT(*) AS count FROM buses').get().count, 1);
    assert.equal(database.db.prepare('SELECT COUNT(*) AS count FROM owners').get().count, 1);
    assert.equal(database.db.prepare('SELECT COUNT(*) AS count FROM audit_logs').get().count, before);
  }));

test('a database insert error is reported per row and does not roll back successful rows', () =>
  withDatabase(({ database, admin }) => {
    database.db.exec(`CREATE TRIGGER reject_test_bus BEFORE INSERT ON buses
      WHEN NEW.registration_number='FAIL-IMPORT-ROW'
      BEGIN SELECT RAISE(ABORT, 'forced persistence failure'); END;`);
    const mapping = { owner_name: 0, bus_number: 1, father_name: 2, mobile: 3, address: 4, status: 5 };
    const rows = [
      { rowNumber: 2, cells: ['Saved Owner', 'SAVED-IMPORT-ROW', 'Father', '01811111111', 'Address', 'Active'] },
      { rowNumber: 3, cells: ['Failed Owner', 'FAIL-IMPORT-ROW', 'Father', '01822222222', 'Address', 'Active'] }
    ];

    const result = database.importBusOwners(admin, rows, mapping);
    assert.deepEqual(result.totals, { total: 2, imported: 1, duplicates: 0, failed: 1 });
    assert.equal(result.issues[0].reason, 'forced persistence failure');
    assert.equal(database.db.prepare("SELECT COUNT(*) AS count FROM buses WHERE registration_number='SAVED-IMPORT-ROW'").get().count, 1);
    assert.equal(database.db.prepare("SELECT COUNT(*) AS count FROM owners WHERE name='Failed Owner'").get().count, 0, 'failed rows roll back owner creation');
  }));

test('11 Bangla owner records remain searchable in Bus List after reopening the database', () => {
  const context = setupDatabase();
  const { admin, directory, filePath } = context;
  let database = context.database;
  const toBanglaDigits = (value) => String(value).replace(/\d/g, (digit) => String.fromCharCode(0x09e6 + Number(digit)));
  const mapping = { owner_name: 0, bus_number: 1, father_name: 2, mobile: 3, address: 4, status: 5 };
  const prefixes = ['013', '014', '015', '016', '017', '018', '019'];
  const records = Array.from({ length: 11 }, (_, index) => {
    const suffix = String(index + 1).padStart(2, '0');
    const mobile = `${prefixes[index % prefixes.length]}${String(index + 1).padStart(8, '0')}`;
    return {
      rowNumber: index + 2,
      cells: [
        `মালিক ${toBanglaDigits(suffix)}`,
        `ঢাকা-মেট্রো-${toBanglaDigits(suffix)}`,
        `পিতা ${toBanglaDigits(suffix)}`,
        toBanglaDigits(mobile),
        `ঢাকা, বাংলাদেশ ${toBanglaDigits(suffix)}`,
        index % 2 ? 'নিষ্ক্রিয়' : 'সক্রিয়'
      ]
    };
  });
  try {
    const result = database.importBusOwners(admin, records, mapping);
    assert.deepEqual(result.totals, { total: 11, imported: 11, duplicates: 0, failed: 0 });

    database.close();
    database = new AssociationDatabase(filePath);
    for (const record of records) {
      const busNumber = record.cells[1];
      const found = database.listRecords(admin, 'buses', busNumber);
      assert.equal(found.length, 1, `${busNumber} is searchable after reopening`);
      assert.equal(found[0].registration_number, busNumber);
      assert.equal(found[0].owner_name, record.cells[0]);
      assert.equal(found[0].status, record.cells[5] === 'নিষ্ক্রিয়' ? 'Inactive' : 'Active');
      const owner = database.db.prepare('SELECT father_name,address,mobile FROM owners WHERE name=?').get(record.cells[0]);
      assert.equal(owner.father_name, record.cells[2]);
      assert.equal(owner.address, record.cells[4]);
      assert.equal(owner.mobile, record.cells[3].replace(/[\u09e6-\u09ef]/g, (digit) => String(digit.charCodeAt(0) - 0x09e6)));
    }
  } finally {
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('duplicate mobiles inside one file are reported as duplicates instead of being silently dropped', () =>
  withDatabase(({ database, admin }) => {
    const mapping = { owner_name: 0, bus_number: 1, father_name: 2, mobile: 3 };
    const preview = database.previewBusOwnerImport(admin, [
      { rowNumber: 2, cells: ['First Row', 'DUP-MOBILE-1', 'Father', '01811111111'] },
      { rowNumber: 3, cells: ['Second Row', 'DUP-MOBILE-2', 'Father', '০১৮১১১১১১১১'] },
      { rowNumber: 4, cells: ['Third Row', 'DUP-MOBILE-3', 'Father', '01911111111'] }
    ], mapping);
    assert.deepEqual(preview.totals, { total: 3, valid: 2, duplicate: 1, invalid: 0 });
    assert.equal(preview.rows[1].result, 'duplicate');
    assert.match(preview.rows[1].reasons.join(' '), /Duplicate mobile number in this file/);

    const result = database.importBusOwners(admin, [
      { rowNumber: 2, cells: ['First Row', 'DUP-MOBILE-1', 'Father', '01811111111'] },
      { rowNumber: 3, cells: ['Second Row', 'DUP-MOBILE-2', 'Father', '০১৮১১১১১১১১'] },
      { rowNumber: 4, cells: ['Third Row', 'DUP-MOBILE-3', 'Father', '01911111111'] }
    ], mapping);
    assert.deepEqual(result.totals, { total: 3, imported: 2, duplicates: 1, failed: 0 });
    assert.equal(result.issues.length, 1);
    assert.equal(result.issues[0].row, 3);
    assert.equal(database.db.prepare("SELECT COUNT(*) AS count FROM buses WHERE registration_number='DUP-MOBILE-2'").get().count, 0);
  }));

test('an old 13-column Excel template with a Bangla heading imports all 10 owners and they survive reopening', () => {
  const XLSX = require('xlsx');
  const { readBusOwnerImport } = require('../src/bus-owner-import.cjs');
  const context = setupDatabase();
  const { admin, directory, filePath } = context;
  let database = context.database;
  const englishHeaders = [
    'Bus Owner Name', 'Bus Number', 'Nominee Name', "Father's Name", 'Mobile Number', 'Route Name',
    'Address', 'Joining Date', 'Bus Type', 'Driver Name', 'Driver Mobile', 'Helper Name', 'Status'
  ];
  const banglaHeaders = ['বাস মালিকের নাম', 'বাস নম্বর', 'পিতার নাম', 'মোবাইল নম্বর', 'ঠিকানা', 'অবস্থা'];
  const data = [
    ['মোঃ রহিম উদ্দিন', 'ঢাকা-১১-১১০১', 'আব্দুল জলিল', '০১৭১২৩৪৫৬৭৮', 'সোনাডাঙ্গা, খুলনা', 'Active'],
    ['মোঃ করিম হোসেন', 'ঢাকা-১১-১১০২', 'নুরুল ইসলাম', '০১৮১২৩৪৫৬৭৮', 'বয়রা, খুলনা', 'Active'],
    ['মোঃ জামাল আহমেদ', 'চট্টগ্রাম-১১-২২০১', 'আব্দুল করিম', '০১৯১২৩৪৫৬৭৮', 'আগ্রাবাদ, চট্টগ্রাম', 'Inactive'],
    ['মোঃ সেলিম মিয়া', 'সিলেট-১১-৩৩০১', 'মোকবুল হোসেন', '০১৬১২৩৪৫৬৭৮', 'জিন্দাবাজার, সিলেট', 'Active'],
    ['মোঃ হাসান আলী', 'রাজশাহী-১১-৪৪০১', 'আব্দুর রহমান', '০১৫১২৩৪৫৬৭৮', 'সাহেব বাজার, রাজশাহী', 'Active'],
    ['মোঃ রফিক উদ্দিন', 'খুলনা-১১-৫৫০১', 'আব্দুল গফুর', '০১৩১২৩৪৫৬৭৮', 'খালিশপুর, খুলনা', 'Inactive'],
    ['মোঃ মাহমুদ হাসান', 'বরিশাল-১১-৬৬০১', 'হাবিবুর রহমান', '০১৪১২৩৪৫৬৭৮', 'সদর রোড, বরিশাল', 'Active'],
    ['মোঃ নুর ইসলাম', 'ঢাকা-১১-১১০৩', 'শামসুল হক', '০১৭৯৮৭৬৫৪৩২', 'মিরপুর, ঢাকা', 'Active'],
    ['মোঃ মিজানুর রহমান', 'চট্টগ্রাম-১১-২২০২', 'আমিন উদ্দিন', '০১৮৯৮৭৬৫৪৩২', 'হালিশহর, চট্টগ্রাম', 'Inactive'],
    ['মোঃ বাবুল হোসেন', 'খুলনা-১১-৫৫০২', 'কাশেম আলী', '০১৯৯৮৭৬৫৪৩২', 'দৌলতপুর, খুলনা', 'Active']
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    englishHeaders, banglaHeaders, ...data
  ]), 'Bus Owner Import Template');
  const importPath = path.join(directory, 'old-template.xlsx');
  XLSX.writeFile(workbook, importPath);

  return readBusOwnerImport(importPath).then((parsed) => {
    try {
      assert.equal(parsed.headerRow, 2);
      const preview = database.previewBusOwnerImport(admin, parsed.rows, parsed.mapping);
      assert.deepEqual(preview.totals, { total: 10, valid: 10, duplicate: 0, invalid: 0 });

      const result = database.importBusOwners(admin, parsed.rows, parsed.mapping);
      assert.deepEqual(result.totals, { total: 10, imported: 10, duplicates: 0, failed: 0 });
      assert.equal(result.issues.length, 0);

      database.close();
      database = new AssociationDatabase(filePath);
      for (const record of data) {
        const found = database.listRecords(admin, 'buses', record[1]);
        assert.equal(found.length, 1, `${record[1]} is searchable in Bus List after reopening`);
        assert.equal(found[0].owner_name, record[0]);
        assert.equal(found[0].owner_mobile, record[3].replace(/[\u09e6-\u09ef]/g, (digit) => String(digit.charCodeAt(0) - 0x09e6)));
        assert.equal(found[0].route_id, null, 'an imported bus does not need a route');
      }
      const owner = database.db.prepare('SELECT father_name,address,status FROM owners WHERE name=?').get('মোঃ জামাল আহমেদ');
      assert.deepEqual(owner, { father_name: 'আব্দুল করিম', address: 'আগ্রাবাদ, চট্টগ্রাম', status: 'Inactive' });
    } finally {
      database.close();
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});

test('Cash In Report filters by route, bus status and dates and totals Regular plus Holiday Cash In', () =>
  withDatabase(({ database, admin, route, bus, fund }) => {
    const route2 = database.saveRecord(admin, 'routes', { name: 'Dhaka-Chattogram', charge_paisa: 70000 });
    const owner2 = database.saveRecord(admin, 'owners', {
      name: 'Owner Two', father_name: 'Father Two', mobile: '01800000002',
      address: 'Chattogram', join_date: '2026-01-06', status: 'Active'
    });
    database.saveRecord(admin, 'buses', { registration_number: 'CHATTO-22-2222', owner_id: owner2.id, route_id: route2.id, status: 'Inactive' });
    database.saveRecord(admin, 'buses', { registration_number: 'CHATTO-33-3333', owner_id: owner2.id, route_id: route2.id, status: 'Active' });
    database.createCashIn(admin, { route_id: route.id, total_trips: 2, date: '2026-10-05', request_key: 'report-regular-1' });
    database.createCashIn(admin, { route_id: route2.id, cash_in_type: 'Holiday', total_trips: 3, date: '2026-10-06', request_key: 'report-holiday-1' });
    database.createCashIn(admin, { route_id: route.id, total_trips: 1, date: '2026-09-01', request_key: 'report-september-1' });
    database.postTransaction(admin, {
      transaction_type: 'income', date: '2026-10-07', fund_id: fund.id,
      amount_paisa: 12345, category: 'Donation', bus_id: bus.id
    });

    const all = database.cashInReport({ from: '2026-10-01', to: '2026-10-31' });
    assert.deepEqual(all.summary, { total_buses: 3, active_buses: 2, inactive_buses: 1 });
    assert.equal(all.buses.length, 3);
    const routeBus = all.buses.find((bus) => bus.route_id === route.id);
    assert.equal(routeBus.route_name, route.name);
    assert.equal(routeBus.per_trip_paisa, 50000, 'Per Trip Amount comes from the route');
    assert.equal(routeBus.cash_in_paisa, 112345, 'route Cash In plus the legacy income linked to that route');
    const holidayBuses = all.buses.filter((bus) => bus.route_id === route2.id);
    assert.equal(holidayBuses.length, 2);
    for (const bus of holidayBuses) {
      assert.equal(bus.per_trip_paisa, 70000, 'every bus on the route shows the same route amount');
      assert.equal(bus.cash_in_paisa, 210000, 'both buses on the route carry the route total');
    }
    assert.deepEqual(all.busTotals, { count: 3, per_trip_paisa: 190000, cash_in_paisa: 322345 });
    assert.equal(all.busTotals.cash_in_paisa, all.totals.total_paisa, 'the TOTAL row is not a duplicated sum of route totals');
    for (const bus of all.buses) {
      assert.equal(bus.owner_name, undefined, 'owner name stays out of the report');
      assert.equal(bus.father_name, undefined, "father's name stays out of the report");
      assert.equal(bus.mobile, undefined, 'mobile stays out of the report');
      assert.equal(bus.address, undefined, 'address stays out of the report');
    }
    assert.equal(all.cashIns.length, 3, 'the September entry stays outside the range');
    assert.deepEqual(all.cashIns.map((row) => row.serial), [1, 2, 3]);
    assert.equal(all.totals.regular_paisa, 112345);
    assert.equal(all.totals.holiday_paisa, 210000);
    assert.equal(all.totals.total_paisa, 322345);
    for (const row of all.cashIns.filter((item) => item.total_trips)) {
      assert.equal(row.per_trip_paisa * row.total_trips, row.total_amount_paisa, 'Total Amount = Per Trip Amount × Total Trip');
    }
    const legacy = all.cashIns.find((row) => String(row.row_id).startsWith('legacy-'));
    assert.equal(legacy.route_name, route.name);
    assert.equal(legacy.remarks, 'Legacy income · Donation');
    assert.equal(legacy.total_trips, null);

    const single = database.cashInReport({ from: '2026-10-01', to: '2026-10-31', route_id: route2.id, status: 'Inactive' });
    assert.equal(single.route_name, route2.name);
    assert.deepEqual(single.summary, { total_buses: 2, active_buses: 1, inactive_buses: 1 });
    assert.deepEqual(single.buses.map((row) => row.registration_number), ['CHATTO-22-2222']);
    assert.equal(single.buses[0].status, 'Inactive');
    assert.equal(single.buses[0].per_trip_paisa, 70000);
    assert.equal(single.buses[0].cash_in_paisa, 210000);
    assert.deepEqual(single.busTotals, { count: 1, per_trip_paisa: 70000, cash_in_paisa: 210000 });
    assert.equal(single.cashIns.length, 1);
    assert.equal(single.totals.holiday_paisa, 210000);
    assert.equal(single.totals.regular_paisa, 0);

    const range = database.cashInReport({ from: '2026-10-06', to: '2026-10-07' });
    assert.equal(range.cashIns.length, 2);
    assert.equal(range.totals.total_paisa, 222345);
    assert.equal(range.busTotals.cash_in_paisa, 222345);
    assert.equal(range.buses.find((bus) => bus.route_id === route.id).cash_in_paisa, 12345, 'date range is applied to the bus amount too');

    assert.throws(() => database.cashInReport({ from: '2026-10-10', to: '2026-10-01' }), /Start date cannot be after end date/);
    assert.throws(() => database.cashInReport({ from: 'not-a-date' }), /valid report date range/);
  }));

test('Cash In Report keeps buses without a route in the list with zero amounts', () =>
  withDatabase(({ database, admin, route, owner }) => {
    database.saveRecord(admin, 'buses', {
      registration_number: 'NO-ROUTE-99-9999', owner_id: owner.id, status: 'Active'
    });
    database.createCashIn(admin, { route_id: route.id, total_trips: 2, date: '2026-10-05', request_key: 'no-route-bus-1' });
    const report = database.cashInReport({ from: '2026-10-01', to: '2026-10-31' });
    const parked = report.buses.find((bus) => bus.registration_number === 'NO-ROUTE-99-9999');
    assert.equal(parked.route_name, '—');
    assert.equal(parked.per_trip_paisa, 0);
    assert.equal(parked.cash_in_paisa, 0);
    assert.equal(report.buses.find((bus) => bus.route_id === route.id).cash_in_paisa, 100000);
    assert.deepEqual(report.busTotals, { count: 2, per_trip_paisa: 50000, cash_in_paisa: 100000 });
  }));

test('Cash In Report PDF is A4 portrait and repeats table headers over multiple pages', () =>
  withDatabase(async ({ database, admin, route }) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'somiti-cashin-pdf-'));
    try {
      for (let index = 0; index < 60; index += 1) {
        database.createCashIn(admin, {
          route_id: route.id, total_trips: 1 + (index % 3),
          date: `2026-10-${String(1 + (index % 28)).padStart(2, '0')}`,
          request_key: `pdf-report-${index}`
        });
      }
      const output = path.join(directory, 'cash-in-report.pdf');
      await database.exportCashInPdf(output, { from: '2026-10-01', to: '2026-10-31' });
      const buffer = fs.readFileSync(output);
      assert.equal(buffer.subarray(0, 4).toString(), '%PDF');
      assert.ok(buffer.length > 5000, 'the PDF carries both tables and their totals');
      const text = buffer.toString('latin1');
      assert.ok(/\/MediaBox\s*\[\s*0\s+0\s+595\.28\s+841\.89\s*\]/.test(text), 'A4 portrait page size');
      assert.ok((text.match(/\/Type\s*\/Page\b/g) || []).length >= 2, '60 Cash In rows span more than one page');
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  }));

test('Bank deposits move money from the fund to the bank without changing Cash In or Cash Out', () =>
  withDatabase(({ database, admin, fund }) => {
    database.postTransaction(admin, { transaction_type: 'income', date: '2026-10-28', fund_id: fund.id, amount_paisa: 100000 });
    const bank = database.saveBank(admin, {
      name: 'Sonali Bank', branch_name: 'Khulna Main', account_holder: 'Bus Mali Somiti',
      account_number: '0123456789012', account_type: 'Current', routing_number: '200261795',
      opening_balance_paisa: 50000
    });
    const created = database.createDeposit(admin, {
      date: '2026-10-29', bank_id: bank.id, fund_id: fund.id,
      amount_paisa: 30000, transaction_id: 'TXN-1001', note: 'Weekly deposit'
    });
    assert.equal(created.deposit.bank_name, 'Sonali Bank');
    assert.equal(created.fund_balance_paisa, 70000, 'fund balance drops by the deposit');
    assert.equal(created.bank_balance_paisa, 80000, 'bank balance rises by the deposit');
    const overview = database.bankOverview(admin);
    assert.equal(overview.totals.bank_count, 1);
    assert.equal(overview.totals.total_deposit_paisa, 30000);
    assert.equal(overview.totals.total_bank_balance_paisa, 80000);
    assert.equal(overview.deposits.length, 1);
    assert.equal(overview.deposits[0].transaction_id, 'TXN-1001');
    assert.equal(overview.funds.find((item) => item.id === fund.id).balance_paisa, 70000);
    assert.equal(database.cashbook(admin).funds.find((item) => item.id === fund.id).balance_paisa, 70000);
    assert.equal(database.report(admin, { type: 'funds' }).find((item) => item.name === 'General Fund').balance_paisa, 70000);
    assert.equal(database.dashboard(admin).totals.funds_paisa, 70000);
    const totals = database.cashbookTotals();
    assert.equal(totals.cash_in_paisa, 100000, 'deposit is not counted as Cash In');
    assert.equal(totals.cash_out_paisa, 0, 'deposit is not counted as Cash Out');
    assert.equal(database.db.prepare('SELECT COUNT(*) AS count FROM fund_transactions').get().count, 1, 'no fund transaction is written for a deposit');
    assert.ok(database.listAudit(admin).some((row) => row.action === 'create' && row.entity === 'bank_deposit'));
  }));

test('Bank deposits reject over-limit amounts, negative fund balances and duplicate transaction IDs', () =>
  withDatabase(({ database, admin, fund }) => {
    database.postTransaction(admin, { transaction_type: 'income', date: '2026-10-28', fund_id: fund.id, amount_paisa: 100000 });
    const bank = database.saveBank(admin, { name: 'Agrani Bank', account_number: '111222333', opening_balance_paisa: 0 });
    assert.throws(() => database.createDeposit(admin, {
      bank_id: bank.id, fund_id: fund.id, amount_paisa: 150000, transaction_id: 'OVER-1'
    }), /cannot exceed the fund's available balance/);
    assert.throws(() => database.createDeposit(admin, {
      bank_id: bank.id, fund_id: fund.id, amount_paisa: 0, transaction_id: 'ZERO-1'
    }), /greater than zero/);
    assert.throws(() => database.createDeposit(admin, {
      bank_id: bank.id, fund_id: fund.id, amount_paisa: 1000, transaction_id: ''
    }), /transaction ID/i);
    database.createDeposit(admin, { bank_id: bank.id, fund_id: fund.id, amount_paisa: 100000, transaction_id: 'FULL-1' });
    assert.throws(() => database.createDeposit(admin, {
      bank_id: bank.id, fund_id: fund.id, amount_paisa: 1, transaction_id: 'ONE-1'
    }), /cannot exceed the fund's available balance/, 'an exhausted fund cannot go negative');
    assert.throws(() => database.createDeposit(admin, {
      bank_id: bank.id, fund_id: fund.id, amount_paisa: 100, transaction_id: 'FULL-1'
    }), /already recorded for the selected bank/, 'duplicate slip numbers are blocked');
    database.postTransaction(admin, { transaction_type: 'income', date: '2026-10-29', fund_id: fund.id, amount_paisa: 5000 });
    const other = database.saveBank(admin, { name: 'Janata Bank', account_number: '999888777' });
    database.createDeposit(admin, { bank_id: other.id, fund_id: fund.id, amount_paisa: 100, transaction_id: 'FULL-1' });
    assert.throws(() => database.saveBank(admin, { name: 'Duplicate Account', account_number: '111222333' }), /already registered/);
  }));

test('Editing and deleting a bank deposit reverses the old fund and bank figures', () =>
  withDatabase(({ database, admin, fund }) => {
    database.postTransaction(admin, { transaction_type: 'income', date: '2026-10-28', fund_id: fund.id, amount_paisa: 100000 });
    const bank = database.saveBank(admin, { name: 'Rupali Bank', account_number: '555666777', opening_balance_paisa: 20000 });
    const { deposit } = database.createDeposit(admin, {
      date: '2026-10-29', bank_id: bank.id, fund_id: fund.id, amount_paisa: 40000, transaction_id: 'EDIT-1'
    });
    const edited = database.updateDeposit(admin, {
      id: deposit.id, date: '2026-10-30', bank_id: bank.id, fund_id: fund.id,
      amount_paisa: 70000, transaction_id: 'EDIT-2', note: 'Corrected'
    });
    assert.equal(edited.deposit.amount_paisa, 70000);
    assert.equal(edited.deposit.transaction_id, 'EDIT-2');
    assert.equal(edited.fund_balance_paisa, 30000, 'the old 40000 is reversed before the new 70000 is applied');
    assert.equal(edited.bank_balance_paisa, 90000);
    assert.throws(() => database.updateDeposit(admin, {
      id: deposit.id, bank_id: bank.id, fund_id: fund.id, amount_paisa: 120000, transaction_id: 'EDIT-3'
    }), /cannot exceed the fund's available balance/);
    assert.equal(database.bankOverview(admin).deposits[0].amount_paisa, 70000, 'a failed edit leaves the old row intact');
    const removed = database.deleteDeposit(admin, deposit.id);
    assert.equal(removed.fund_balance_paisa, 100000);
    assert.equal(removed.bank_balance_paisa, 20000);
    assert.equal(database.bankOverview(admin).deposits.length, 0);
    assert.ok(database.listAudit(admin).some((row) => row.action === 'correct' && row.entity === 'bank_deposit'));
  }));

test('A bank with deposits cannot be deleted until its deposits are removed', () =>
  withDatabase(({ database, admin, fund }) => {
    database.postTransaction(admin, { transaction_type: 'income', date: '2026-10-28', fund_id: fund.id, amount_paisa: 50000 });
    const bank = database.saveBank(admin, { name: 'IFIC Bank', account_number: '101010101' });
    const { deposit } = database.createDeposit(admin, { bank_id: bank.id, fund_id: fund.id, amount_paisa: 10000, transaction_id: 'DEL-1' });
    assert.throws(() => database.deleteBank(admin, bank.id), /has deposits recorded/);
    database.deleteDeposit(admin, deposit.id);
    assert.equal(database.deleteBank(admin, bank.id), true);
    assert.equal(database.bankOverview(admin).banks.length, 0);
  }));

test('Staff need the banks permission and only administrators can edit or delete deposits', () =>
  withDatabase(({ database, admin, fund }) => {
    database.postTransaction(admin, { transaction_type: 'income', date: '2026-10-28', fund_id: fund.id, amount_paisa: 50000 });
    const bank = database.saveBank(admin, { name: 'City Bank', account_number: '202020202' });
    const staff = database.createUser({ username: 'bank-staff', full_name: 'Bank Staff', password: 'secure-password', role: 'staff' }, admin);
    assert.throws(() => database.bankOverview(staff), /permission/);
    database.saveUser(admin, { id: staff.id, full_name: staff.full_name, role: 'staff', is_active: true, permissions: { manage_banks: true } });
    const { deposit } = database.createDeposit(staff, { bank_id: bank.id, fund_id: fund.id, amount_paisa: 5000, transaction_id: 'STAFF-1' });
    assert.equal(database.bankOverview(staff).deposits.length, 1);
    assert.throws(() => database.updateDeposit(staff, { id: deposit.id, bank_id: bank.id, fund_id: fund.id, amount_paisa: 6000, transaction_id: 'STAFF-2' }), /administrator/);
    assert.throws(() => database.deleteDeposit(staff, deposit.id), /administrator/);
    assert.throws(() => database.deleteBank(staff, bank.id), /permission/);
  }));

test('Deposit history filters by date range and bank', () =>
  withDatabase(({ database, admin, fund }) => {
    database.postTransaction(admin, { transaction_type: 'income', date: '2026-10-01', fund_id: fund.id, amount_paisa: 500000 });
    const first = database.saveBank(admin, { name: 'Bank One', account_number: '303030303' });
    const second = database.saveBank(admin, { name: 'Bank Two', account_number: '404040404' });
    database.createDeposit(admin, { date: '2026-10-05', bank_id: first.id, fund_id: fund.id, amount_paisa: 10000, transaction_id: 'F-1' });
    database.createDeposit(admin, { date: '2026-10-20', bank_id: second.id, fund_id: fund.id, amount_paisa: 20000, transaction_id: 'F-2' });
    database.createDeposit(admin, { date: '2026-10-25', bank_id: first.id, fund_id: fund.id, amount_paisa: 30000, transaction_id: 'F-3' });
    const range = database.bankOverview(admin, { from: '2026-10-10', to: '2026-10-31' });
    assert.equal(range.deposits.length, 2);
    assert.equal(range.totals.filtered_deposit_paisa, 50000);
    assert.equal(range.totals.total_deposit_paisa, 60000, 'dashboard total stays all-time');
    const byBank = database.bankOverview(admin, { bank_id: first.id });
    assert.equal(byBank.deposits.length, 2);
    assert.deepEqual(byBank.deposits.map((row) => row.transaction_id).sort(), ['F-1', 'F-3']);
    const report = database.bankOverview(admin).report;
    assert.equal(report.banks.find((row) => row.name === 'Bank One').total_deposit_paisa, 40000);
    assert.equal(report.banks.find((row) => row.name === 'Bank One').total_withdrawal_paisa, 0);
    assert.equal(report.fundWise.length, 2, 'fund-wise report groups deposits by bank');
  }));

test('Bank Report PDF is A4 and includes both report sections', () =>
  withDatabase(async ({ database, admin, fund }) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'somiti-bank-pdf-'));
    try {
      database.postTransaction(admin, { transaction_type: 'income', date: '2026-10-01', fund_id: fund.id, amount_paisa: 200000 });
      const bank = database.saveBank(admin, {
        name: 'Sonali Bank', branch_name: 'Daulatpur', account_number: '0123456789012',
        opening_balance_paisa: 25000
      });
      database.createDeposit(admin, {
        date: '2026-10-02', bank_id: bank.id, fund_id: fund.id, amount_paisa: 50000, transaction_id: 'PDF-1'
      });
      const output = path.join(directory, 'bank-report.pdf');
      await database.exportBankReportPdf(output);
      const buffer = fs.readFileSync(output);
      assert.equal(buffer.subarray(0, 4).toString(), '%PDF');
      assert.ok(buffer.length > 4000, 'the PDF carries both report tables');
      const text = buffer.toString('latin1');
      assert.ok(/\/MediaBox\s*\[\s*0\s+0\s+595\.28\s+841\.89\s*\]/.test(text), 'A4 portrait page size');
      assert.ok((text.match(/\/Type\s*\/Page\b/g) || []).length >= 1);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  }));

test('a database written by an older build is copied before the schema changes', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'somiti-migration-'));
  const filePath = path.join(directory, 'association.sqlite');
  try {
    const first = new AssociationDatabase(filePath);
    const admin = first.createUser({ username: 'admin', full_name: 'Admin User', password: 'secure-password', role: 'admin' }, null);
    first.saveRecord(admin, 'owners', { name: 'রহিম উদ্দিন', mobile: '01711111111', join_date: '2026-01-05', status: 'Active' });
    assert.equal(first.db.pragma('user_version', { simple: true }), SCHEMA_VERSION, 'a new database records its schema version');
    first.db.pragma('user_version = 0');
    first.close();

    const migrated = new AssociationDatabase(filePath);
    const folder = path.join(directory, 'pre-migration-backups');
    const copies = fs.readdirSync(folder).filter((name) => name.startsWith('association-before-'));
    assert.equal(copies.length, 1, `one pre-migration copy is written, found ${copies.join(', ')}`);
    assert.match(copies[0], /^association-before-legacy-to-\d+-\d{4}-\d{2}-\d{2}T.*\.sqlite$/);
    const copy = new Database(path.join(folder, copies[0]), { readonly: true });
    try {
      assert.equal(copy.pragma('integrity_check', { simple: true }), 'ok');
      assert.equal(copy.prepare('SELECT name FROM owners').get().name, 'রহিম উদ্দিন', 'the copy holds the real ledger');
    } finally {
      copy.close();
      for (const suffix of ['-wal', '-shm']) fs.rmSync(`${path.join(folder, copies[0])}${suffix}`, { force: true });
    }
    assert.deepEqual(fs.readdirSync(folder).filter((name) => !name.endsWith('.sqlite')), [], 'the copy folder holds only database files');
    assert.equal(migrated.db.pragma('user_version', { simple: true }), SCHEMA_VERSION);
    assert.equal(migrated.db.prepare('SELECT name FROM owners').get().name, 'রহিম উদ্দিন', 'the data survives the migration');
    migrated.close();

    const quiet = new AssociationDatabase(filePath);
    assert.equal(fs.readdirSync(folder).filter((name) => name.startsWith('association-before-')).length, 1, 'an already migrated database needs no new copy');
    quiet.close();
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('a brand new database is created without a migration copy', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'somiti-fresh-db-'));
  try {
    const database = new AssociationDatabase(path.join(directory, 'association.sqlite'));
    assert.equal(fs.existsSync(path.join(directory, 'pre-migration-backups')), false);
    database.close();
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('migration refuses to start when no backup can be written', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'somiti-migration-blocked-'));
  const filePath = path.join(directory, 'association.sqlite');
  try {
    const first = new AssociationDatabase(filePath);
    const admin = first.createUser({ username: 'admin', full_name: 'Admin User', password: 'secure-password', role: 'admin' }, null);
    first.saveRecord(admin, 'owners', { name: 'Owner One' });
    first.db.pragma('user_version = 0');
    first.close();
    // A file sitting where the backup folder belongs cannot hold a copy.
    fs.writeFileSync(path.join(directory, 'pre-migration-backups'), 'not a folder');
    assert.throws(() => new AssociationDatabase(filePath), /could not be backed up before the update/i);
    const check = new Database(filePath, { readonly: true });
    try {
      assert.equal(check.prepare('SELECT name FROM owners').get().name, 'Owner One', 'the ledger is left untouched');
    } finally {
      check.close();
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('only the newest migration copies are kept', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'somiti-migration-prune-'));
  const filePath = path.join(directory, 'association.sqlite');
  const folder = path.join(directory, 'pre-migration-backups');
  try {
    const first = new AssociationDatabase(filePath);
    first.db.pragma('user_version = 0');
    first.close();
    fs.mkdirSync(folder, { recursive: true });
    for (let index = 1; index <= 6; index += 1) {
      fs.writeFileSync(path.join(folder, `association-before-legacy-to-${SCHEMA_VERSION}-2026-01-0${index}T00-00-00-000Z.sqlite`), 'old');
    }
    const migrated = new AssociationDatabase(filePath);
    const kept = fs.readdirSync(folder).filter((name) => name.startsWith('association-before-')).sort();
    assert.equal(kept.length, 5, `kept ${kept.length} copies`);
    assert.ok(!kept.some((name) => name.includes('2026-01-01') || name.includes('2026-01-02')), 'the two oldest copies are pruned');
    assert.ok(kept.some((name) => !name.includes('2026-01-')), 'the copy taken by this migration is kept');
    migrated.close();
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
