const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { AssociationDatabase } = require('../src/database.cjs');

function setupDatabase() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'somiti-test-'));
  const database = new AssociationDatabase(path.join(directory, 'association.sqlite'));
  const admin = database.createUser({ username: 'admin', full_name: 'Admin User', password: 'secure-password', role: 'admin' }, null);
  const owner = database.saveRecord(admin, 'owners', { name: 'Owner One', mobile: '01700000000' });
  const route = database.saveRecord(admin, 'routes', {
    name: 'Dhaka-Khulna', route_number: 'D-K', starting_point: 'Dhaka', destination: 'Khulna',
    charge_paisa: 50000, description: ''
  });
  const bus = database.saveRecord(admin, 'buses', {
    registration_number: 'DHAKA-METRO-11-1234', owner_id: owner.id, route_id: route.id, status: 'Active'
  });
  const fund = database.db.prepare(`SELECT id FROM funds WHERE name='General Fund'`).get();
  return { database, directory, admin, owner, route, bus, fund };
}

test('confirmed trips post once and trip correction updates the linked collection', () => {
  const { database, directory, admin, bus, fund } = setupDatabase();
  try {
    const saved = database.saveTrip(admin, {
      date: '2026-10-30', bus_id: bus.id, fund_id: fund.id, trip_count: 10, payment_status: 'Paid', request_key: 'trip-form-unique-token'
    });
    assert.equal(saved.trip.total_paisa, 500000);
    assert.equal(database.db.prepare(`SELECT COUNT(*) AS count FROM fund_transactions WHERE source='trip'`).get().count, 1);
    const retried = database.saveTrip(admin, {
      date: '2026-10-30', bus_id: bus.id, fund_id: fund.id, trip_count: 10, payment_status: 'Paid', request_key: 'trip-form-unique-token'
    });
    assert.equal(retried.trip.id, saved.trip.id);
    assert.equal(database.db.prepare('SELECT COUNT(*) AS count FROM trips').get().count, 1);
    database.saveTrip(admin, {
      id: saved.trip.id, date: '2026-10-30', bus_id: bus.id, fund_id: fund.id, trip_count: 12, payment_status: 'Paid'
    });
    assert.equal(database.db.prepare(`SELECT COUNT(*) AS count FROM fund_transactions WHERE source='trip'`).get().count, 1);
    assert.equal(database.db.prepare(`SELECT amount_paisa FROM fund_transactions WHERE source='trip'`).get().amount_paisa, 600000);
  } finally {
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('fund transfers are balance movements, not income or expense', () => {
  const { database, directory, admin, fund } = setupDatabase();
  try {
    const otherFund = database.db.prepare(`INSERT INTO funds(name,opening_balance_paisa) VALUES ('Welfare',0)`).run().lastInsertRowid;
    database.transfer(admin, { from_fund_id: fund.id, to_fund_id: otherFund, date: '2026-10-30', amount_paisa: 1200 });
    const incomeExpense = database.db.prepare(`SELECT COUNT(*) AS count FROM fund_transactions`).get().count;
    assert.equal(incomeExpense, 0);
    assert.equal(database.db.prepare(`SELECT COUNT(*) AS count FROM fund_transfers`).get().count, 1);
  } finally {
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('monthly dues cannot be overpaid and payment creates one fund receipt', () => {
  const { database, directory, admin, fund } = setupDatabase();
  try {
    const member = database.saveRecord(admin, 'members', {
      name: 'Member One', mobile: '01800000000', membership_date: '2026-10-01', member_type: 'Regular',
      status: 'Active', monthly_fee_paisa: 25000
    });
    assert.equal(database.generateDues(admin, '2026-10').generated, 1);
    const due = database.listDues(admin, '2026-10')[0];
    const paid = database.payDue(admin, { due_id: due.id, fund_id: fund.id, date: '2026-10-30', amount_paisa: 25000 });
    assert.equal(paid.remaining_paisa, 0);
    assert.equal(database.db.prepare(`SELECT COUNT(*) AS count FROM receipts WHERE member_id=?`).get(member.id).count, 1);
    assert.throws(() => database.payDue(admin, { due_id: due.id, fund_id: fund.id, amount_paisa: 1 }), /exceed/);
  } finally {
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('staff has no write permission unless admin explicitly grants it', () => {
  const { database, directory, admin } = setupDatabase();
  try {
    const staff = database.createUser({ username: 'staff', full_name: 'Staff User', password: 'secure-password', role: 'staff' }, admin);
    assert.throws(() => database.saveRecord(staff, 'owners', { name: 'Not Allowed' }), /permission/);
    database.saveUser(admin, { id: staff.id, full_name: staff.full_name, role: 'staff', is_active: true, permissions: { manage_owners: true } });
    assert.equal(database.saveRecord(staff, 'owners', { name: 'Allowed Owner' }).name, 'Allowed Owner');
  } finally {
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('association report queries return route, owner, fund, and period summaries', () => {
  const { database, directory, admin, owner, bus, fund } = setupDatabase();
  try {
    database.saveTrip(admin, {
      date: '2026-10-30', bus_id: bus.id, fund_id: fund.id, trip_count: 2, payment_status: 'Paid', request_key: 'report-trip'
    });
    for (const type of ['owners', 'buses', 'routes', 'funds', 'daily', 'monthly', 'yearly', 'income', 'expense', 'dues', 'transactions', 'trips']) {
      const report = database.report(admin, { type, from: '2026-01-01', to: '2026-12-31' });
      assert.ok(Array.isArray(report), `${type} report returns rows`);
    }
    const ownerReport = database.report(admin, { type: 'owners', from: '2026-01-01', to: '2026-12-31' });
    assert.equal(ownerReport.find((row) => row.owner_code === owner.owner_code).trip_total_paisa, 100000);
    assert.equal(database.ownerAccount(admin, owner.id).totals.trips, 1);
    assert.equal(database.busAccount(admin, bus.id).trips.length, 1);
  } finally {
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
