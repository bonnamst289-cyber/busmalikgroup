const Database = require('better-sqlite3');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');

const TABLES = {
  owners: {
    table: 'owners',
    fields: ['name', 'nominee_name', 'father_name', 'mobile', 'address', 'photo_path'],
    search: ['name', 'mobile']
  },
  routes: {
    table: 'routes',
    fields: ['name', 'route_number', 'starting_point', 'destination', 'charge_paisa', 'description'],
    search: ['name', 'route_number', 'starting_point', 'destination']
  },
  buses: {
    table: 'buses',
    fields: ['registration_number', 'owner_id', 'route_id', 'driver_name', 'helper_name', 'status'],
    search: ['registration_number', 'driver_name', 'helper_name']
  },
  members: {
    table: 'members',
    fields: ['name', 'mobile', 'address', 'membership_date', 'member_type', 'status', 'monthly_fee_paisa'],
    search: ['name', 'mobile', 'member_type']
  },
  funds: {
    table: 'funds',
    fields: ['name', 'opening_balance_paisa', 'is_active'],
    search: ['name']
  },
  expense_categories: {
    table: 'expense_categories',
    fields: ['name', 'is_active'],
    search: ['name']
  },
  income_categories: {
    table: 'income_categories',
    fields: ['name', 'is_active'],
    search: ['name']
  }
};

const ALLOWED_ROLES = new Set(['admin', 'staff']);

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

function safeUser(row) {
  if (!row) return null;
  return { id: row.id, username: row.username, full_name: row.full_name, role: row.role };
}

function toInteger(value, name) {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new Error(`${name} must be a whole number.`);
  return number;
}

class AssociationDatabase {
  constructor(filePath) {
    this.filePath = filePath;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    this.db = new Database(filePath);
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('busy_timeout = 5000');
    this.initialize();
  }

  initialize() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        full_name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        password_salt TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('admin','staff')),
        permissions_json TEXT NOT NULL DEFAULT '{}',
        is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS owners (
        id INTEGER PRIMARY KEY,
        owner_code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        nominee_name TEXT NOT NULL DEFAULT '',
        father_name TEXT NOT NULL DEFAULT '',
        mobile TEXT NOT NULL DEFAULT '',
        address TEXT NOT NULL DEFAULT '',
        photo_path TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS routes (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        route_number TEXT NOT NULL UNIQUE,
        starting_point TEXT NOT NULL,
        destination TEXT NOT NULL,
        charge_paisa INTEGER NOT NULL CHECK(charge_paisa >= 0),
        description TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS buses (
        id INTEGER PRIMARY KEY,
        registration_number TEXT NOT NULL UNIQUE,
        owner_id INTEGER NOT NULL REFERENCES owners(id) ON UPDATE CASCADE ON DELETE RESTRICT,
        route_id INTEGER REFERENCES routes(id) ON UPDATE CASCADE ON DELETE SET NULL,
        driver_name TEXT NOT NULL DEFAULT '',
        helper_name TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'Active' CHECK(status IN ('Active','Inactive','Repair')),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS members (
        id INTEGER PRIMARY KEY,
        member_code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        mobile TEXT NOT NULL DEFAULT '',
        address TEXT NOT NULL DEFAULT '',
        membership_date TEXT NOT NULL,
        member_type TEXT NOT NULL DEFAULT 'Regular',
        status TEXT NOT NULL DEFAULT 'Active' CHECK(status IN ('Active','Inactive')),
        monthly_fee_paisa INTEGER NOT NULL DEFAULT 0 CHECK(monthly_fee_paisa >= 0),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS funds (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        opening_balance_paisa INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS income_categories (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1))
      );
      CREATE TABLE IF NOT EXISTS expense_categories (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1))
      );
      CREATE TABLE IF NOT EXISTS fund_transactions (
        id INTEGER PRIMARY KEY,
        fund_id INTEGER NOT NULL REFERENCES funds(id) ON UPDATE CASCADE ON DELETE RESTRICT,
        date TEXT NOT NULL,
        transaction_type TEXT NOT NULL CHECK(transaction_type IN ('income','expense')),
        category TEXT NOT NULL,
        amount_paisa INTEGER NOT NULL CHECK(amount_paisa > 0),
        source TEXT NOT NULL,
        source_ref TEXT,
        owner_id INTEGER REFERENCES owners(id) ON DELETE SET NULL,
        member_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
        bus_id INTEGER REFERENCES buses(id) ON DELETE SET NULL,
        description TEXT NOT NULL DEFAULT '',
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(source, source_ref)
      );
      CREATE TABLE IF NOT EXISTS fund_transfers (
        id INTEGER PRIMARY KEY,
        from_fund_id INTEGER NOT NULL REFERENCES funds(id),
        to_fund_id INTEGER NOT NULL REFERENCES funds(id),
        date TEXT NOT NULL,
        amount_paisa INTEGER NOT NULL CHECK(amount_paisa > 0),
        description TEXT NOT NULL DEFAULT '',
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CHECK(from_fund_id <> to_fund_id)
      );
      CREATE TABLE IF NOT EXISTS trips (
        id INTEGER PRIMARY KEY,
        trip_code TEXT NOT NULL UNIQUE,
        date TEXT NOT NULL,
        bus_id INTEGER NOT NULL REFERENCES buses(id) ON DELETE RESTRICT,
        owner_id INTEGER NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
        route_id INTEGER NOT NULL REFERENCES routes(id) ON DELETE RESTRICT,
        trip_count INTEGER NOT NULL CHECK(trip_count > 0),
        charge_paisa INTEGER NOT NULL CHECK(charge_paisa >= 0),
        total_paisa INTEGER NOT NULL CHECK(total_paisa >= 0),
        fund_id INTEGER NOT NULL REFERENCES funds(id) ON DELETE RESTRICT,
        payment_status TEXT NOT NULL DEFAULT 'Paid' CHECK(payment_status IN ('Paid','Unpaid')),
        note TEXT NOT NULL DEFAULT '',
        transaction_id INTEGER UNIQUE REFERENCES fund_transactions(id) ON DELETE RESTRICT,
        request_key TEXT,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS monthly_dues (
        id INTEGER PRIMARY KEY,
        member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
        month TEXT NOT NULL,
        amount_paisa INTEGER NOT NULL CHECK(amount_paisa >= 0),
        paid_paisa INTEGER NOT NULL DEFAULT 0 CHECK(paid_paisa >= 0 AND paid_paisa <= amount_paisa),
        status TEXT NOT NULL DEFAULT 'Unpaid' CHECK(status IN ('Paid','Partial','Unpaid')),
        UNIQUE(member_id, month)
      );
      CREATE TABLE IF NOT EXISTS receipts (
        id INTEGER PRIMARY KEY,
        receipt_number TEXT NOT NULL UNIQUE,
        date TEXT NOT NULL,
        category TEXT NOT NULL,
        amount_paisa INTEGER NOT NULL CHECK(amount_paisa > 0),
        owner_id INTEGER REFERENCES owners(id) ON DELETE SET NULL,
        member_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
        bus_id INTEGER REFERENCES buses(id) ON DELETE SET NULL,
        route_id INTEGER REFERENCES routes(id) ON DELETE SET NULL,
        fund_transaction_id INTEGER REFERENCES fund_transactions(id) ON DELETE SET NULL,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        action TEXT NOT NULL,
        entity TEXT NOT NULL,
        entity_id TEXT,
        before_json TEXT,
        after_json TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS login_history (
        id INTEGER PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        username TEXT NOT NULL,
        success INTEGER NOT NULL CHECK(success IN (0,1)),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_buses_owner ON buses(owner_id);
      CREATE INDEX IF NOT EXISTS idx_buses_route ON buses(route_id);
      CREATE INDEX IF NOT EXISTS idx_trips_date ON trips(date);
      CREATE INDEX IF NOT EXISTS idx_trips_bus ON trips(bus_id);
      CREATE INDEX IF NOT EXISTS idx_transactions_date ON fund_transactions(date);
      CREATE INDEX IF NOT EXISTS idx_transactions_fund ON fund_transactions(fund_id);
      CREATE INDEX IF NOT EXISTS idx_dues_month ON monthly_dues(month);
      CREATE INDEX IF NOT EXISTS idx_receipts_date ON receipts(date);
    `);
    const tripColumns = this.db.pragma('table_info(trips)').map((column) => column.name);
    if (!tripColumns.includes('request_key')) this.db.exec('ALTER TABLE trips ADD COLUMN request_key TEXT');
    this.db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_trips_request_key ON trips(request_key)');
    const initialData = this.db.transaction(() => {
      const fundCount = this.db.prepare('SELECT COUNT(*) AS count FROM funds').get().count;
      if (!fundCount) {
        const insert = this.db.prepare('INSERT INTO funds(name, opening_balance_paisa) VALUES (?, 0)');
        ['General Fund', 'Welfare Fund', 'Emergency Fund', 'Development Fund'].forEach((name) => insert.run(name));
      }
      const income = ['Trip Collection', 'Monthly Member Fees', 'Owner Deposits', 'Fines', 'Donations', 'Other Income'];
      const expense = ['Office Rent', 'Employee Salary', 'Electricity Bill', 'Office Expenses', 'Welfare Expenses', 'Emergency Expenses', 'Maintenance', 'Other Expenses'];
      const addIncome = this.db.prepare('INSERT OR IGNORE INTO income_categories(name) VALUES (?)');
      const addExpense = this.db.prepare('INSERT OR IGNORE INTO expense_categories(name) VALUES (?)');
      income.forEach((name) => addIncome.run(name));
      expense.forEach((name) => addExpense.run(name));
    });
    initialData();
  }

  hasUsers() {
    return this.db.prepare('SELECT 1 FROM users LIMIT 1').get() !== undefined;
  }

  createUser(data, actor) {
    const username = String(data.username || '').trim();
    const fullName = String(data.full_name || '').trim();
    const password = String(data.password || '');
    const role = data.role || 'staff';
    if (!username || !fullName || password.length < 8) throw new Error('Name, username, and a password of at least 8 characters are required.');
    if (!ALLOWED_ROLES.has(role)) throw new Error('Invalid user role.');
    const { salt, hash } = hashPassword(password);
    const result = this.db.prepare('INSERT INTO users(username,full_name,password_hash,password_salt,role,permissions_json) VALUES (?,?,?,?,?,?)')
      .run(username, fullName, hash, salt, role, JSON.stringify(data.permissions || {}));
    this.audit(actor?.id, 'create', 'user', result.lastInsertRowid, null, { username, full_name: fullName, role });
    return safeUser(this.db.prepare('SELECT * FROM users WHERE id=?').get(result.lastInsertRowid));
  }

  authenticate(username, password) {
    const name = String(username || '').trim();
    const user = this.db.prepare('SELECT * FROM users WHERE username=? AND is_active=1').get(name);
    const attempted = user ? crypto.scryptSync(String(password || ''), user.password_salt, 64).toString('hex') : '';
    const success = Boolean(user && crypto.timingSafeEqual(Buffer.from(attempted, 'hex'), Buffer.from(user.password_hash, 'hex')));
    this.db.prepare('INSERT INTO login_history(user_id,username,success) VALUES (?,?,?)').run(user?.id || null, name, success ? 1 : 0);
    if (!success) throw new Error('Incorrect username or password.');
    return safeUser(user);
  }

  changePassword(user, oldPassword, newPassword) {
    const row = this.db.prepare('SELECT * FROM users WHERE id=?').get(user.id);
    const attempted = crypto.scryptSync(String(oldPassword || ''), row.password_salt, 64).toString('hex');
    if (!crypto.timingSafeEqual(Buffer.from(attempted, 'hex'), Buffer.from(row.password_hash, 'hex'))) throw new Error('Current password is incorrect.');
    if (String(newPassword || '').length < 8) throw new Error('New password must contain at least 8 characters.');
    const { salt, hash } = hashPassword(newPassword);
    this.db.prepare('UPDATE users SET password_hash=?,password_salt=? WHERE id=?').run(hash, salt, user.id);
    this.audit(user.id, 'change-password', 'user', user.id, null, null);
    return true;
  }

  listUsers() {
    return this.db.prepare('SELECT id,username,full_name,role,is_active,permissions_json,created_at FROM users ORDER BY id').all();
  }

  saveUser(actor, data) {
    const id = Number(data.id || 0);
    if (!id) return this.createUser(data, actor);
    const old = this.db.prepare('SELECT * FROM users WHERE id=?').get(id);
    if (!old) throw new Error('User not found.');
    const role = data.role || old.role;
    if (!ALLOWED_ROLES.has(role)) throw new Error('Invalid user role.');
    const active = data.is_active ? 1 : 0;
    if ((!active || role !== 'admin') && old.role === 'admin' && old.is_active) {
      const anotherAdmin = this.db.prepare(`SELECT 1 FROM users WHERE id<>? AND role='admin' AND is_active=1 LIMIT 1`).get(id);
      if (!anotherAdmin) throw new Error('At least one active administrator must remain.');
    }
    this.db.prepare('UPDATE users SET full_name=?,role=?,is_active=?,permissions_json=? WHERE id=?')
      .run(String(data.full_name || old.full_name).trim(), role, active, JSON.stringify(data.permissions || {}), id);
    this.audit(actor.id, 'update', 'user', id, old, data);
    return this.listUsers().find((item) => item.id === id);
  }

  allowed(user, action) {
    if (user.role === 'admin') return true;
    const row = this.db.prepare('SELECT permissions_json FROM users WHERE id=?').get(user.id);
    let permissions = {};
    try { permissions = JSON.parse(row.permissions_json); } catch { permissions = {}; }
    return permissions[action] === true;
  }

  requirePermission(user, action) {
    if (!this.allowed(user, action)) throw new Error(`Your account does not have permission to ${action}.`);
  }

  audit(userId, action, entity, entityId, before, after) {
    this.db.prepare('INSERT INTO audit_logs(user_id,action,entity,entity_id,before_json,after_json) VALUES (?,?,?,?,?,?)')
      .run(userId || null, action, entity, String(entityId ?? ''), before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null);
  }

  listRecords(user, entity, search) {
    const config = TABLES[entity];
    if (!config) throw new Error('Unknown record type.');
    let sql = `SELECT * FROM ${config.table}`;
    const values = [];
    if (search && config.search.length) {
      sql += ` WHERE ${config.search.map((field) => `${field} LIKE ?`).join(' OR ')}`;
      config.search.forEach(() => values.push(`%${String(search).slice(0, 100)}%`));
    }
    sql += ' ORDER BY id DESC';
    return this.db.prepare(sql).all(...values);
  }

  saveRecord(user, entity, data) {
    const config = TABLES[entity];
    if (!config) throw new Error('Unknown record type.');
    this.requirePermission(user, `manage_${entity}`);
    const values = config.fields.map((field) => data[field] === undefined ? '' : data[field]);
    for (const field of ['charge_paisa', 'opening_balance_paisa', 'monthly_fee_paisa']) {
      const index = config.fields.indexOf(field);
      if (index >= 0) values[index] = toInteger(values[index] || 0, field);
    }
    for (const field of ['is_active']) {
      const index = config.fields.indexOf(field);
      if (index >= 0) values[index] = values[index] ? 1 : 0;
    }
    if (entity === 'buses') {
      for (const field of ['owner_id', 'route_id']) {
        const index = config.fields.indexOf(field);
        values[index] = values[index] === '' || values[index] === null ? null : toInteger(values[index], field);
      }
    }
    if (entity === 'owners') {
      const id = Number(data.id || 0);
      const ownerCode = id ? this.db.prepare('SELECT owner_code FROM owners WHERE id=?').get(id)?.owner_code : this.nextCode('OWN');
      if (id) {
        const old = this.db.prepare('SELECT * FROM owners WHERE id=?').get(id);
        if (!old) throw new Error('Owner not found.');
        this.db.prepare(`UPDATE owners SET ${config.fields.map((field) => `${field}=?`).join(',')} WHERE id=?`).run(...values, id);
        this.audit(user.id, 'update', entity, id, old, data);
        return { ...this.db.prepare('SELECT * FROM owners WHERE id=?').get(id), owner_code: ownerCode };
      }
      const result = this.db.prepare(`INSERT INTO owners(owner_code,${config.fields.join(',')}) VALUES (?,${config.fields.map(() => '?').join(',')})`).run(ownerCode, ...values);
      this.audit(user.id, 'create', entity, result.lastInsertRowid, null, data);
      return this.db.prepare('SELECT * FROM owners WHERE id=?').get(result.lastInsertRowid);
    }
    const codeField = entity === 'members' ? 'member_code' : null;
    const id = Number(data.id || 0);
    if (id) {
      const old = this.db.prepare(`SELECT * FROM ${config.table} WHERE id=?`).get(id);
      if (!old) throw new Error('Record not found.');
      this.db.prepare(`UPDATE ${config.table} SET ${config.fields.map((field) => `${field}=?`).join(',')} WHERE id=?`).run(...values, id);
      this.audit(user.id, 'update', entity, id, old, data);
      return this.db.prepare(`SELECT * FROM ${config.table} WHERE id=?`).get(id);
    }
    const extraFields = codeField ? [codeField] : [];
    const code = codeField ? this.nextCode(entity === 'members' ? 'MEM' : 'REC') : null;
    const result = this.db.prepare(`INSERT INTO ${config.table}(${[...extraFields, ...config.fields].join(',')}) VALUES (${[...extraFields, ...config.fields].map(() => '?').join(',')})`)
      .run(...(codeField ? [code, ...values] : values));
    this.audit(user.id, 'create', entity, result.lastInsertRowid, null, data);
    return this.db.prepare(`SELECT * FROM ${config.table} WHERE id=?`).get(result.lastInsertRowid);
  }

  deleteRecord(user, entity, id) {
    const config = TABLES[entity];
    if (!config) throw new Error('Unknown record type.');
    this.requirePermission(user, `delete_${entity}`);
    const old = this.db.prepare(`SELECT * FROM ${config.table} WHERE id=?`).get(id);
    if (!old) throw new Error('Record not found.');
    this.db.prepare(`DELETE FROM ${config.table} WHERE id=?`).run(id);
    this.audit(user.id, 'delete', entity, id, old, null);
    return true;
  }

  ownerAccount(user, ownerId) {
    const owner = this.db.prepare('SELECT * FROM owners WHERE id=?').get(ownerId);
    if (!owner) throw new Error('Owner not found.');
    const buses = this.db.prepare(`SELECT b.*,r.name AS route_name FROM buses b LEFT JOIN routes r ON r.id=b.route_id WHERE b.owner_id=? ORDER BY b.registration_number`).all(ownerId);
    const trips = this.db.prepare(`SELECT t.*,b.registration_number,r.name AS route_name FROM trips t
      JOIN buses b ON b.id=t.bus_id JOIN routes r ON r.id=t.route_id WHERE t.owner_id=? ORDER BY t.date DESC,t.id DESC`).all(ownerId);
    const payments = this.db.prepare(`SELECT * FROM fund_transactions WHERE owner_id=? ORDER BY date DESC,id DESC`).all(ownerId);
    const totals = this.db.prepare(`SELECT COUNT(*) AS trips,COALESCE(SUM(total_paisa),0) AS trip_total,
      COALESCE(SUM(CASE WHEN payment_status='Unpaid' THEN total_paisa ELSE 0 END),0) AS outstanding
      FROM trips WHERE owner_id=?`).get(ownerId);
    return { owner, buses, trips, payments, totals };
  }

  busAccount(user, busId) {
    const bus = this.db.prepare(`SELECT b.*,o.name AS owner_name,o.owner_code,r.name AS route_name,r.charge_paisa
      FROM buses b JOIN owners o ON o.id=b.owner_id LEFT JOIN routes r ON r.id=b.route_id WHERE b.id=?`).get(busId);
    if (!bus) throw new Error('Bus not found.');
    const trips = this.db.prepare('SELECT * FROM trips WHERE bus_id=? ORDER BY date DESC,id DESC').all(busId);
    const payments = this.db.prepare('SELECT * FROM fund_transactions WHERE bus_id=? ORDER BY date DESC,id DESC').all(busId);
    return { bus, trips, payments };
  }

  routeAccount(user, routeId) {
    const route = this.db.prepare('SELECT * FROM routes WHERE id=?').get(routeId);
    if (!route) throw new Error('Route not found.');
    const buses = this.db.prepare(`SELECT b.*,o.name AS owner_name FROM buses b
      JOIN owners o ON o.id=b.owner_id WHERE b.route_id=? ORDER BY b.registration_number`).all(routeId);
    const trips = this.db.prepare(`SELECT t.*,b.registration_number,o.name AS owner_name FROM trips t
      JOIN buses b ON b.id=t.bus_id JOIN owners o ON o.id=t.owner_id WHERE t.route_id=? ORDER BY t.date DESC,t.id DESC`).all(routeId);
    return {
      route, buses, trips,
      collection_paisa: trips.filter((trip) => trip.payment_status === 'Paid').reduce((total, trip) => total + trip.total_paisa, 0)
    };
  }

  nextCode(prefix) {
    return `${prefix}-${Date.now()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
  }

  insertReceipt(user, transactionId, data) {
    const receiptNumber = this.nextCode('RCP');
    const result = this.db.prepare(`INSERT INTO receipts(receipt_number,date,category,amount_paisa,owner_id,member_id,bus_id,route_id,fund_transaction_id,created_by)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(receiptNumber, data.date, data.category, data.amount_paisa,
      data.owner_id || null, data.member_id || null, data.bus_id || null, data.route_id || null, transactionId, user.id);
    return this.db.prepare('SELECT * FROM receipts WHERE id=?').get(result.lastInsertRowid);
  }

  saveTrip(user, data) {
    this.requirePermission(user, 'manage_trips');
    const id = Number(data.id || 0);
    if (id && user.role !== 'admin') throw new Error('Only an administrator can correct a saved trip.');
    const tripCount = toInteger(data.trip_count, 'Trip count');
    if (tripCount <= 0) throw new Error('Trip count must be greater than zero.');
    const bus = this.db.prepare(`SELECT b.*,r.id AS actual_route_id,r.charge_paisa,o.id AS actual_owner_id
      FROM buses b JOIN routes r ON r.id=b.route_id JOIN owners o ON o.id=b.owner_id WHERE b.id=?`).get(data.bus_id);
    if (!bus) throw new Error('Select a bus assigned to a route.');
    const amount = tripCount * bus.charge_paisa;
    if (!Number.isSafeInteger(amount)) throw new Error('Trip amount is too large.');
    const date = String(data.date || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Enter a valid trip date.');
    const fundId = toInteger(data.fund_id, 'Fund');
    const paymentStatus = data.payment_status === 'Unpaid' ? 'Unpaid' : 'Paid';
    const requestKey = String(data.request_key || this.nextCode('REQ'));
    return this.db.transaction(() => {
      if (!id) {
        const duplicate = this.db.prepare('SELECT * FROM trips WHERE request_key=?').get(requestKey);
        if (duplicate) {
          const receipt = duplicate.transaction_id
            ? this.db.prepare('SELECT * FROM receipts WHERE fund_transaction_id=? ORDER BY id LIMIT 1').get(duplicate.transaction_id)
            : null;
          return { trip: duplicate, receipt };
        }
        const tripCode = this.nextCode('TRP');
        let transactionId = null;
        if (paymentStatus === 'Paid' && amount > 0) {
          const tx = this.db.prepare(`INSERT INTO fund_transactions(fund_id,date,transaction_type,category,amount_paisa,source,source_ref,owner_id,bus_id,description,created_by)
            VALUES (?,?,'income','Trip Collection',?,'trip',?, ?, ?, ?, ?)`)
            .run(fundId, date, amount, tripCode, bus.actual_owner_id, bus.id, String(data.note || ''), user.id);
          transactionId = tx.lastInsertRowid;
        }
        const created = this.db.prepare(`INSERT INTO trips(trip_code,date,bus_id,owner_id,route_id,trip_count,charge_paisa,total_paisa,fund_id,payment_status,note,transaction_id,request_key,created_by)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(tripCode, date, bus.id, bus.actual_owner_id, bus.actual_route_id, tripCount,
          bus.charge_paisa, amount, fundId, paymentStatus, String(data.note || ''), transactionId, requestKey, user.id);
        const receipt = paymentStatus === 'Paid' && amount > 0
          ? this.insertReceipt(user, transactionId, { date, category: 'Trip Collection', amount_paisa: amount, owner_id: bus.actual_owner_id, bus_id: bus.id, route_id: bus.actual_route_id })
          : null;
        this.audit(user.id, 'create', 'trip', created.lastInsertRowid, null, data);
        return { trip: this.db.prepare('SELECT * FROM trips WHERE id=?').get(created.lastInsertRowid), receipt };
      }
      const old = this.db.prepare('SELECT * FROM trips WHERE id=?').get(id);
      if (!old) throw new Error('Trip not found.');
      const newStatus = paymentStatus;
      if (newStatus === 'Unpaid' && old.transaction_id) {
        throw new Error('Paid trips cannot be changed to unpaid; use an authorized correcting transaction.');
      }
      if (old.transaction_id) {
        this.db.prepare(`UPDATE fund_transactions SET fund_id=?,date=?,amount_paisa=?,owner_id=?,bus_id=?,description=? WHERE id=?`)
          .run(fundId, date, newStatus === 'Paid' ? amount : old.total_paisa, bus.actual_owner_id, bus.id, String(data.note || ''), old.transaction_id);
        this.db.prepare(`UPDATE receipts SET date=?,amount_paisa=?,owner_id=?,bus_id=?,route_id=?
          WHERE fund_transaction_id=?`).run(date, amount, bus.actual_owner_id, bus.id, bus.actual_route_id, old.transaction_id);
      } else if (newStatus === 'Paid' && amount > 0) {
        const tx = this.db.prepare(`INSERT INTO fund_transactions(fund_id,date,transaction_type,category,amount_paisa,source,source_ref,owner_id,bus_id,description,created_by)
          VALUES (?,?,'income','Trip Collection',?,'trip',?,?,?,?,?)`)
          .run(fundId, date, amount, old.trip_code, bus.actual_owner_id, bus.id, String(data.note || ''), user.id);
        old.transaction_id = tx.lastInsertRowid;
        this.db.prepare('INSERT INTO receipts(receipt_number,date,category,amount_paisa,owner_id,bus_id,route_id,fund_transaction_id,created_by) VALUES (?,?,?,?,?,?,?,?,?)')
          .run(this.nextCode('RCP'), date, 'Trip Collection', amount, bus.actual_owner_id, bus.id, bus.actual_route_id, old.transaction_id, user.id);
      }
      this.db.prepare(`UPDATE trips SET date=?,bus_id=?,owner_id=?,route_id=?,trip_count=?,charge_paisa=?,total_paisa=?,fund_id=?,payment_status=?,note=?,transaction_id=? WHERE id=?`)
        .run(date, bus.id, bus.actual_owner_id, bus.actual_route_id, tripCount, bus.charge_paisa, amount, fundId, newStatus, String(data.note || ''), old.transaction_id, id);
      this.audit(user.id, 'correct', 'trip', id, old, data);
      return { trip: this.db.prepare('SELECT * FROM trips WHERE id=?').get(id), receipt: null };
    })();
  }

  deleteTrip(user, id) {
    this.requirePermission(user, 'delete_trips');
    const old = this.db.prepare('SELECT * FROM trips WHERE id=?').get(id);
    if (!old) throw new Error('Trip not found.');
    this.db.transaction(() => {
      if (old.transaction_id) {
        const tx = this.db.prepare('SELECT * FROM fund_transactions WHERE id=?').get(old.transaction_id);
        if (tx) {
          this.db.prepare(`INSERT INTO fund_transactions(fund_id,date,transaction_type,category,amount_paisa,source,source_ref,owner_id,bus_id,description,created_by)
            VALUES (?,?,'expense','Trip Correction',?,'trip-reversal',?,?,?,?,?)`)
            .run(tx.fund_id, new Date().toISOString().slice(0, 10), tx.amount_paisa, old.trip_code, tx.owner_id, tx.bus_id, `Reversal for deleted trip ${old.trip_code}`, user.id);
        }
      }
      this.db.prepare('DELETE FROM trips WHERE id=?').run(id);
      this.audit(user.id, 'delete-with-reversal', 'trip', id, old, null);
    })();
    return true;
  }

  postTransaction(user, data) {
    this.requirePermission(user, 'manage_finance');
    const amount = toInteger(data.amount_paisa, 'Amount');
    if (amount <= 0) throw new Error('Amount must be greater than zero.');
    const type = data.transaction_type === 'expense' ? 'expense' : 'income';
    const date = String(data.date || new Date().toISOString().slice(0, 10));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Enter a valid transaction date.');
    const result = this.db.transaction(() => {
      const sourceRef = this.nextCode(type === 'income' ? 'INC' : 'EXP');
      const inserted = this.db.prepare(`INSERT INTO fund_transactions(fund_id,date,transaction_type,category,amount_paisa,source,source_ref,owner_id,member_id,bus_id,description,created_by)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(toInteger(data.fund_id, 'Fund'), date, type, String(data.category || (type === 'income' ? 'Other Income' : 'Other Expenses')),
        amount, type, sourceRef, data.owner_id || null, data.member_id || null, data.bus_id || null, String(data.description || ''), user.id);
      const receipt = type === 'income' ? this.insertReceipt(user, inserted.lastInsertRowid, {
        date, category: String(data.category || 'Other Income'), amount_paisa: amount,
        owner_id: data.owner_id, member_id: data.member_id, bus_id: data.bus_id, route_id: null
      }) : null;
      this.audit(user.id, 'create', 'fund_transaction', inserted.lastInsertRowid, null, data);
      return { transaction: this.db.prepare('SELECT * FROM fund_transactions WHERE id=?').get(inserted.lastInsertRowid), receipt };
    })();
    return result;
  }

  listTransactions(user, filters = {}) {
    const from = String(filters.from || '0001-01-01');
    const to = String(filters.to || '9999-12-31');
    return this.db.prepare(`SELECT t.*,f.name AS fund_name,COALESCE(o.name,m.name,'') AS party,b.registration_number
      FROM fund_transactions t JOIN funds f ON f.id=t.fund_id LEFT JOIN owners o ON o.id=t.owner_id
      LEFT JOIN members m ON m.id=t.member_id LEFT JOIN buses b ON b.id=t.bus_id
      WHERE t.date BETWEEN ? AND ? ORDER BY t.date DESC,t.id DESC`).all(from, to);
  }

  listReceipts(user) {
    return this.db.prepare(`SELECT r.*,COALESCE(o.name,m.name,'') AS party,b.registration_number
      FROM receipts r LEFT JOIN owners o ON o.id=r.owner_id LEFT JOIN members m ON m.id=r.member_id
      LEFT JOIN buses b ON b.id=r.bus_id ORDER BY r.date DESC,r.id DESC`).all();
  }

  listAudit(user) {
    return this.db.prepare(`SELECT a.*,u.username,u.full_name FROM audit_logs a
      LEFT JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT 200`).all();
  }

  listLoginHistory(user) {
    return this.db.prepare(`SELECT l.*,u.full_name FROM login_history l
      LEFT JOIN users u ON u.id=l.user_id ORDER BY l.id DESC LIMIT 200`).all();
  }

  listDues(user, month = '') {
    const validMonth = /^\d{4}-\d{2}$/.test(String(month)) ? String(month) : '';
    return this.db.prepare(`SELECT d.*,m.member_code,m.name AS member_name,m.mobile
      FROM monthly_dues d JOIN members m ON m.id=d.member_id
      ${validMonth ? 'WHERE d.month=?' : ''}
      ORDER BY d.month DESC,m.name`).all(...(validMonth ? [validMonth] : []));
  }

  transfer(user, data) {
    this.requirePermission(user, 'manage_finance');
    const amount = toInteger(data.amount_paisa, 'Amount');
    if (amount <= 0) throw new Error('Amount must be greater than zero.');
    const from = toInteger(data.from_fund_id, 'Source fund');
    const to = toInteger(data.to_fund_id, 'Destination fund');
    if (from === to) throw new Error('Choose two different funds.');
    const id = this.db.prepare('INSERT INTO fund_transfers(from_fund_id,to_fund_id,date,amount_paisa,description,created_by) VALUES (?,?,?,?,?,?)')
      .run(from, to, String(data.date || new Date().toISOString().slice(0, 10)), amount, String(data.description || ''), user.id).lastInsertRowid;
    this.audit(user.id, 'transfer', 'fund_transfer', id, null, data);
    return id;
  }

  generateDues(user, month) {
    this.requirePermission(user, 'manage_dues');
    if (!/^\d{4}-\d{2}$/.test(String(month))) throw new Error('Select a month in YYYY-MM format.');
    return this.db.transaction(() => {
      const members = this.db.prepare(`SELECT id,monthly_fee_paisa FROM members WHERE status='Active'`).all();
      const insert = this.db.prepare(`INSERT OR IGNORE INTO monthly_dues(member_id,month,amount_paisa) VALUES (?,?,?)`);
      let generated = 0;
      for (const member of members) generated += insert.run(member.id, month, member.monthly_fee_paisa).changes;
      this.audit(user.id, 'generate', 'monthly_dues', month, null, { generated });
      return { generated, total_active: members.length };
    })();
  }

  payDue(user, data) {
    this.requirePermission(user, 'manage_dues');
    const amount = toInteger(data.amount_paisa, 'Amount');
    if (amount <= 0) throw new Error('Amount must be greater than zero.');
    return this.db.transaction(() => {
      const due = this.db.prepare('SELECT * FROM monthly_dues WHERE id=?').get(data.due_id);
      if (!due) throw new Error('Monthly due not found.');
      if (due.paid_paisa + amount > due.amount_paisa) throw new Error('Payment cannot exceed the remaining due.');
      const member = this.db.prepare('SELECT * FROM members WHERE id=?').get(due.member_id);
      const fundId = toInteger(data.fund_id, 'Fund');
      const date = String(data.date || new Date().toISOString().slice(0, 10));
      const sourceRef = this.nextCode('DUES');
      const tx = this.db.prepare(`INSERT INTO fund_transactions(fund_id,date,transaction_type,category,amount_paisa,source,source_ref,member_id,description,created_by)
        VALUES (?,?,'income','Monthly Member Fees',?,'monthly-due',?,?,?,?)`)
        .run(fundId, date, amount, sourceRef, member.id, `Monthly fee ${due.month}`, user.id);
      const paid = due.paid_paisa + amount;
      this.db.prepare('UPDATE monthly_dues SET paid_paisa=?,status=? WHERE id=?')
        .run(paid, paid === due.amount_paisa ? 'Paid' : 'Partial', due.id);
      const receipt = this.insertReceipt(user, tx.lastInsertRowid, {
        date, category: `Monthly Member Fees (${due.month})`, amount_paisa: amount, member_id: member.id
      });
      this.audit(user.id, 'payment', 'monthly_due', due.id, due, { paid_paisa: paid });
      return { receipt, remaining_paisa: due.amount_paisa - paid };
    })();
  }

  dashboard(user) {
    const count = (table) => this.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
    const sum = (sql, ...args) => this.db.prepare(sql).get(...args).value || 0;
    const today = new Date().toISOString().slice(0, 10);
    const month = today.slice(0, 7);
    const balances = this.db.prepare(`SELECT f.id,f.name,f.opening_balance_paisa +
      COALESCE(SUM(CASE WHEN t.transaction_type='income' THEN t.amount_paisa ELSE -t.amount_paisa END),0)
      + COALESCE((SELECT SUM(ft.amount_paisa) FROM fund_transfers ft WHERE ft.to_fund_id=f.id),0)
      - COALESCE((SELECT SUM(ft.amount_paisa) FROM fund_transfers ft WHERE ft.from_fund_id=f.id),0) AS balance_paisa
      FROM funds f LEFT JOIN fund_transactions t ON t.fund_id=f.id WHERE f.is_active=1 GROUP BY f.id`).all();
    return {
      totals: {
        buses: count('buses'), owners: count('owners'), routes: count('routes'), trips: count('trips'),
        today_collection_paisa: sum(`SELECT SUM(amount_paisa) AS value FROM fund_transactions WHERE transaction_type='income' AND date=?`, today),
        month_collection_paisa: sum(`SELECT SUM(amount_paisa) AS value FROM fund_transactions WHERE transaction_type='income' AND substr(date,1,7)=?`, month),
        expenses_paisa: sum(`SELECT SUM(amount_paisa) AS value FROM fund_transactions WHERE transaction_type='expense'`),
        dues_paisa: sum('SELECT SUM(amount_paisa-paid_paisa) AS value FROM monthly_dues')
          + sum(`SELECT SUM(total_paisa) AS value FROM trips WHERE payment_status='Unpaid'`),
        funds_paisa: balances.reduce((total, fund) => total + fund.balance_paisa, 0)
      },
      funds: balances,
      recent: this.db.prepare(`SELECT t.id,t.date,t.transaction_type,t.category,t.amount_paisa,t.description,
        COALESCE(o.name,m.name,'') AS party FROM fund_transactions t
        LEFT JOIN owners o ON o.id=t.owner_id LEFT JOIN members m ON m.id=t.member_id
        ORDER BY t.id DESC LIMIT 8`).all()
    };
  }

  report(user, filters = {}) {
    const from = String(filters.from || '0001-01-01');
    const to = String(filters.to || '9999-12-31');
    const type = String(filters.type || 'transactions');
    if (type === 'trips') return this.db.prepare(`SELECT t.id,t.trip_code,t.date,t.bus_id,t.owner_id,t.route_id,t.fund_id,t.note,
      b.registration_number,o.name AS owner,r.name AS route,t.trip_count,t.charge_paisa,t.total_paisa,t.payment_status,
      (SELECT id FROM receipts WHERE fund_transaction_id=t.transaction_id ORDER BY id LIMIT 1) AS receipt_id
      FROM trips t JOIN buses b ON b.id=t.bus_id JOIN owners o ON o.id=t.owner_id JOIN routes r ON r.id=t.route_id
      WHERE t.date BETWEEN ? AND ? ORDER BY t.date DESC,t.id DESC`).all(from, to);
    if (type === 'dues') return this.db.prepare(`SELECT m.member_code,m.name,m.mobile,d.month,d.amount_paisa,d.paid_paisa,d.amount_paisa-d.paid_paisa AS due_paisa,d.status
      FROM monthly_dues d JOIN members m ON m.id=d.member_id WHERE d.month BETWEEN ? AND ? ORDER BY d.month DESC,m.name`).all(from.slice(0, 7), to.slice(0, 7));
    if (type === 'owners') return this.db.prepare(`SELECT o.owner_code,o.name,o.mobile,
      (SELECT COUNT(*) FROM buses b WHERE b.owner_id=o.id) AS buses,
      (SELECT COUNT(*) FROM trips t WHERE t.owner_id=o.id AND t.date BETWEEN ? AND ?) AS trips,
      COALESCE((SELECT SUM(t.total_paisa) FROM trips t WHERE t.owner_id=o.id AND t.date BETWEEN ? AND ?),0) AS trip_total_paisa,
      COALESCE((SELECT SUM(ft.amount_paisa) FROM fund_transactions ft WHERE ft.owner_id=o.id AND ft.transaction_type='income' AND ft.date BETWEEN ? AND ?),0) AS payments_paisa
      FROM owners o ORDER BY o.name`).all(from, to, from, to, from, to);
    if (type === 'buses') return this.db.prepare(`SELECT b.registration_number,o.name AS owner,r.name AS route,b.status,
      COUNT(t.id) AS trips,COALESCE(SUM(t.total_paisa),0) AS trip_total_paisa
      FROM buses b JOIN owners o ON o.id=b.owner_id LEFT JOIN routes r ON r.id=b.route_id
      LEFT JOIN trips t ON t.bus_id=b.id AND t.date BETWEEN ? AND ? GROUP BY b.id ORDER BY b.registration_number`).all(from, to);
    if (type === 'routes') return this.db.prepare(`SELECT r.route_number,r.name,r.starting_point,r.destination,
      (SELECT COUNT(*) FROM buses b WHERE b.route_id=r.id) AS buses,
      COUNT(t.id) AS trips,COALESCE(SUM(CASE WHEN t.payment_status='Paid' THEN t.total_paisa ELSE 0 END),0) AS collection_paisa
      FROM routes r LEFT JOIN trips t ON t.route_id=r.id AND t.date BETWEEN ? AND ?
      GROUP BY r.id ORDER BY r.route_number`).all(from, to);
    if (type === 'funds') return this.db.prepare(`SELECT f.name,
      COALESCE(SUM(CASE WHEN t.transaction_type='income' THEN t.amount_paisa ELSE 0 END),0) AS income_paisa,
      COALESCE(SUM(CASE WHEN t.transaction_type='expense' THEN t.amount_paisa ELSE 0 END),0) AS expense_paisa,
      f.opening_balance_paisa + COALESCE(SUM(CASE WHEN t.transaction_type='income' THEN t.amount_paisa WHEN t.transaction_type='expense' THEN -t.amount_paisa ELSE 0 END),0)
      + COALESCE((SELECT SUM(ft.amount_paisa) FROM fund_transfers ft WHERE ft.to_fund_id=f.id AND ft.date BETWEEN ? AND ?),0)
      - COALESCE((SELECT SUM(ft.amount_paisa) FROM fund_transfers ft WHERE ft.from_fund_id=f.id AND ft.date BETWEEN ? AND ?),0) AS balance_paisa
      FROM funds f LEFT JOIN fund_transactions t ON t.fund_id=f.id AND t.date BETWEEN ? AND ?
      GROUP BY f.id ORDER BY f.name`).all(from, to, from, to, from, to);
    if (['daily', 'monthly', 'yearly'].includes(type)) {
      const period = type === 'daily' ? 'date' : type === 'monthly' ? "substr(date,1,7)" : 'substr(date,1,4)';
      return this.db.prepare(`SELECT ${period} AS period,
        SUM(CASE WHEN transaction_type='income' THEN amount_paisa ELSE 0 END) AS income_paisa,
        SUM(CASE WHEN transaction_type='expense' THEN amount_paisa ELSE 0 END) AS expense_paisa
        FROM fund_transactions WHERE date BETWEEN ? AND ? GROUP BY period ORDER BY period DESC`).all(from, to);
    }
    if (type === 'income' || type === 'expense') return this.db.prepare(`SELECT t.date,t.category,f.name AS fund,t.amount_paisa,
      COALESCE(o.name,m.name,'') AS party,b.registration_number,t.description FROM fund_transactions t
      JOIN funds f ON f.id=t.fund_id LEFT JOIN owners o ON o.id=t.owner_id LEFT JOIN members m ON m.id=t.member_id
      LEFT JOIN buses b ON b.id=t.bus_id WHERE t.transaction_type=? AND t.date BETWEEN ? AND ? ORDER BY t.date DESC`).all(type, from, to);
    return this.db.prepare(`SELECT t.date,t.transaction_type,t.category,f.name AS fund,t.amount_paisa,
      COALESCE(o.name,m.name,'') AS party,b.registration_number,t.description
      FROM fund_transactions t JOIN funds f ON f.id=t.fund_id LEFT JOIN owners o ON o.id=t.owner_id
      LEFT JOIN members m ON m.id=t.member_id LEFT JOIN buses b ON b.id=t.bus_id
      WHERE t.date BETWEEN ? AND ? ORDER BY t.date DESC,t.id DESC`).all(from, to);
  }

  backup(destination) {
    this.db.backup(destination);
    const photos = path.join(path.dirname(this.filePath), 'owner-photos');
    if (fs.existsSync(photos)) fs.cpSync(photos, path.join(path.dirname(destination), 'owner-photos'), { recursive: true, force: true, errorOnExist: false });
  }

  restore(source) {
    if (path.resolve(source) === path.resolve(this.filePath)) throw new Error('Choose a different database file.');
    const check = new Database(source, { readonly: true, fileMustExist: true });
    try {
      const integrity = check.pragma('integrity_check', { simple: true });
      if (integrity !== 'ok') throw new Error(`Backup integrity check failed: ${integrity}`);
      for (const table of ['users', 'owners', 'buses', 'routes', 'trips', 'funds', 'fund_transactions', 'members', 'monthly_dues']) {
        check.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name=?`).get(table) || (() => { throw new Error(`Backup is missing required table: ${table}`); })();
      }
    } finally {
      check.close();
    }
    this.db.close();
    for (const suffix of ['-wal', '-shm']) {
      const sidecar = `${this.filePath}${suffix}`;
      if (fs.existsSync(sidecar)) fs.unlinkSync(sidecar);
    }
    fs.copyFileSync(source, this.filePath);
    const sourcePhotos = path.join(path.dirname(source), 'owner-photos');
    if (fs.existsSync(sourcePhotos)) fs.cpSync(sourcePhotos, path.join(path.dirname(this.filePath), 'owner-photos'), { recursive: true, force: true });
    this.db = new Database(this.filePath);
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('busy_timeout = 5000');
  }

  async exportPdf(filePath, title, headers, rows) {
    await new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 40, layout: 'landscape' });
      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);
      doc.fontSize(18).text(String(title || 'Association Report'), { align: 'center' });
      doc.moveDown().fontSize(9).text(new Date().toLocaleString());
      doc.moveDown();
      const columns = (headers || []).map((header) => String(header));
      const values = (rows || []).map((row) => Array.isArray(row) ? row : Object.values(row));
      doc.fontSize(8);
      doc.text(columns.join('   |   '));
      doc.moveDown(0.5).text('-'.repeat(140));
      for (const row of values) {
        if (doc.y > 520) doc.addPage();
        doc.text(row.map((cell) => String(cell ?? '')).join('   |   '), { width: 740 });
      }
      doc.end();
      stream.on('finish', resolve);
      stream.on('error', reject);
    });
  }

  async exportExcel(filePath, title, headers, rows) {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(String(title || 'Report').slice(0, 31));
    sheet.addRow(headers || []);
    for (const row of rows || []) sheet.addRow(Array.isArray(row) ? row : Object.values(row));
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E4F91' } };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.columns.forEach((column) => { column.width = 20; });
    await workbook.xlsx.writeFile(filePath);
  }

  async receiptPath(receiptId) {
    const receipt = this.db.prepare(`SELECT r.*,o.name AS owner_name,m.name AS member_name,b.registration_number,rte.name AS route_name
      FROM receipts r LEFT JOIN owners o ON o.id=r.owner_id LEFT JOIN members m ON m.id=r.member_id
      LEFT JOIN buses b ON b.id=r.bus_id LEFT JOIN routes rte ON rte.id=r.route_id WHERE r.id=?`).get(receiptId);
    if (!receipt) throw new Error('Receipt not found.');
    const outDir = path.join(path.dirname(this.filePath), 'receipts');
    fs.mkdirSync(outDir, { recursive: true });
    const output = path.join(outDir, `${receipt.receipt_number}.pdf`);
    await new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A5', margin: 36 });
      const stream = fs.createWriteStream(output);
      doc.pipe(stream);
      doc.fontSize(18).text('Bus Malik Somiti', { align: 'center' });
      doc.fontSize(10).text('Payment Receipt', { align: 'center' });
      doc.moveDown();
      doc.fontSize(10).text(`Receipt No: ${receipt.receipt_number}`);
      doc.text(`Date: ${receipt.date}`);
      doc.moveDown();
      doc.text(`Received from: ${receipt.owner_name || receipt.member_name || 'Association income'}`);
      doc.text(`Bus: ${receipt.registration_number || '-'}`);
      doc.text(`Route: ${receipt.route_name || '-'}`);
      doc.text(`Category: ${receipt.category}`);
      doc.moveDown();
      doc.fontSize(14).text(`Amount: BDT ${(receipt.amount_paisa / 100).toFixed(2)}`);
      doc.moveDown(2);
      doc.text('Received by: ____________________');
      doc.moveDown(2);
      doc.text('Authorized signature: ____________________');
      doc.end();
      stream.on('finish', resolve);
      stream.on('error', reject);
    });
    return output;
  }

  close() {
    if (this.db.open) this.db.close();
  }
}

module.exports = { AssociationDatabase };
