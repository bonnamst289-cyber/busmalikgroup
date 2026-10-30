const Database = require('better-sqlite3');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');

const FONT_DIR = path.join(__dirname, '..', 'assets', 'fonts');
const BUNDLED_LOGO = path.join(__dirname, '..', 'assets', 'logo.png');

function fontFile(name) {
  const file = path.join(FONT_DIR, name);
  return fs.existsSync(file) ? file : null;
}

// pdfkit's built-in Helvetica has no Bengali glyphs, so every generated document
// has to carry the bundled Hind Siliguri face or Bangla names print as boxes.
function createDoc(options) {
  const doc = new PDFDocument(options);
  const regular = fontFile('HindSiliguri-Regular.ttf');
  if (regular) {
    doc.registerFont('bn-body', regular);
    doc.registerFont('bn-head', fontFile('HindSiliguri-SemiBold.ttf') || regular);
    doc.registerFont('bn-strong', fontFile('HindSiliguri-Bold.ttf') || regular);
    doc.family = { body: 'bn-body', head: 'bn-head', strong: 'bn-strong' };
    doc.font('bn-body');
  } else {
    doc.family = { body: 'Helvetica', head: 'Helvetica', strong: 'Helvetica' };
  }
  return doc;
}

function formatBdt(paisa) {
  return `BDT ${(Number(paisa) / 100).toFixed(2)}`;
}

const TABLES = {
  owners: {
    table: 'owners',
    fields: ['name', 'nominee_name', 'father_name', 'mobile', 'address', 'photo_path', 'join_date', 'status'],
    search: ['name', 'mobile']
  },
  routes: {
    table: 'routes',
    fields: ['route_number', 'name', 'starting_point', 'destination', 'charge_paisa', 'status', 'description'],
    search: ['name', 'route_number', 'starting_point', 'destination']
  },
  buses: {
    table: 'buses',
    fields: ['registration_number', 'owner_id', 'route_id', 'driver_name', 'driver_mobile', 'helper_name', 'bus_type', 'status'],
    search: ['registration_number', 'driver_name', 'helper_name']
  },
  members: {
    table: 'members',
    fields: ['name', 'father_name', 'mobile', 'address', 'membership_date', 'member_type', 'status', 'monthly_fee_paisa'],
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
const FIELD_DEFAULTS = { status: 'Active' };

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

function amountInWords(amountPaisa) {
  const units = ['', 'Thousand', 'Million', 'Billion', 'Trillion'];
  const small = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const underThousand = (value) => {
    const parts = [];
    if (value >= 100) {
      parts.push(`${small[Math.floor(value / 100)]} Hundred`);
      value %= 100;
    }
    if (value >= 20) {
      parts.push(tens[Math.floor(value / 10)]);
      value %= 10;
    }
    if (value > 0) parts.push(small[value]);
    return parts.join(' ');
  };
  let taka = Math.floor(amountPaisa / 100);
  const paisa = amountPaisa % 100;
  const groups = [];
  let index = 0;
  while (taka > 0 && index < units.length) {
    const group = taka % 1000;
    if (group) groups.unshift(`${underThousand(group)}${units[index] ? ` ${units[index]}` : ''}`);
    taka = Math.floor(taka / 1000);
    index += 1;
  }
  const takaWords = groups.join(' ') || 'Zero';
  return `${takaWords} Taka and ${underThousand(paisa) || 'Zero'} Paisa Only`;
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
        join_date TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'Active' CHECK(status IN ('Active','Inactive')),
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
        status TEXT NOT NULL DEFAULT 'Active' CHECK(status IN ('Active','Inactive')),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS buses (
        id INTEGER PRIMARY KEY,
        registration_number TEXT NOT NULL UNIQUE,
        owner_id INTEGER NOT NULL REFERENCES owners(id) ON UPDATE CASCADE ON DELETE RESTRICT,
        route_id INTEGER REFERENCES routes(id) ON UPDATE CASCADE ON DELETE SET NULL,
        driver_name TEXT NOT NULL DEFAULT '',
        driver_mobile TEXT NOT NULL DEFAULT '',
        helper_name TEXT NOT NULL DEFAULT '',
        bus_type TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'Active' CHECK(status IN ('Active','Inactive','Repair')),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS members (
        id INTEGER PRIMARY KEY,
        member_code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        father_name TEXT NOT NULL DEFAULT '',
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
        receiver_name TEXT NOT NULL DEFAULT '',
        reference_number TEXT NOT NULL DEFAULT '',
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
      CREATE TABLE IF NOT EXISTS fund_distributions (
        id INTEGER PRIMARY KEY,
        fund_id INTEGER NOT NULL REFERENCES funds(id) ON UPDATE CASCADE ON DELETE RESTRICT,
        fund_name TEXT NOT NULL,
        date TEXT NOT NULL,
        amount_paisa INTEGER NOT NULL CHECK(amount_paisa > 0),
        request_key TEXT NOT NULL UNIQUE,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
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
      CREATE INDEX IF NOT EXISTS idx_transactions_date ON fund_transactions(date);
      CREATE INDEX IF NOT EXISTS idx_transactions_fund ON fund_transactions(fund_id);
      CREATE INDEX IF NOT EXISTS idx_transactions_party ON fund_transactions(owner_id);
      CREATE INDEX IF NOT EXISTS idx_transactions_source ON fund_transactions(source, source_ref);
      CREATE INDEX IF NOT EXISTS idx_receipts_date ON receipts(date);
      CREATE INDEX IF NOT EXISTS idx_receipts_transaction ON receipts(fund_transaction_id);
      CREATE INDEX IF NOT EXISTS idx_fund_distributions_fund ON fund_distributions(fund_id,date);
    `);

    const migrations = {
      owners: [['nominee_name', "TEXT NOT NULL DEFAULT ''"], ['father_name', "TEXT NOT NULL DEFAULT ''"], ['mobile', "TEXT NOT NULL DEFAULT ''"], ['address', "TEXT NOT NULL DEFAULT ''"], ['photo_path', "TEXT NOT NULL DEFAULT ''"], ['join_date', "TEXT NOT NULL DEFAULT ''"], ['status', "TEXT NOT NULL DEFAULT 'Active'"]],
      routes: [['starting_point', "TEXT NOT NULL DEFAULT ''"], ['destination', "TEXT NOT NULL DEFAULT ''"], ['description', "TEXT NOT NULL DEFAULT ''"], ['status', "TEXT NOT NULL DEFAULT 'Active'"]],
      buses: [['driver_name', "TEXT NOT NULL DEFAULT ''"], ['driver_mobile', "TEXT NOT NULL DEFAULT ''"], ['helper_name', "TEXT NOT NULL DEFAULT ''"], ['bus_type', "TEXT NOT NULL DEFAULT ''"], ['status', "TEXT NOT NULL DEFAULT 'Active'"]],
      members: [['father_name', "TEXT NOT NULL DEFAULT ''"], ['mobile', "TEXT NOT NULL DEFAULT ''"], ['address', "TEXT NOT NULL DEFAULT ''"], ['member_type', "TEXT NOT NULL DEFAULT 'Regular'"], ['status', "TEXT NOT NULL DEFAULT 'Active'"], ['monthly_fee_paisa', 'INTEGER NOT NULL DEFAULT 0']],
      funds: [['is_active', 'INTEGER NOT NULL DEFAULT 1']],
      income_categories: [['is_active', 'INTEGER NOT NULL DEFAULT 1']],
      expense_categories: [['is_active', 'INTEGER NOT NULL DEFAULT 1']],
      fund_transactions: [['receiver_name', "TEXT NOT NULL DEFAULT ''"], ['reference_number', "TEXT NOT NULL DEFAULT ''"]]
    };
    for (const [table, columns] of Object.entries(migrations)) {
      const existing = this.db.pragma(`table_info(${table})`).map((column) => column.name);
      for (const [name, definition] of columns) {
        if (!existing.includes(name)) this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
      }
    }
    const initialData = this.db.transaction(() => {
      const fundCount = this.db.prepare('SELECT COUNT(*) AS count FROM funds').get().count;
      if (!fundCount) {
        const insert = this.db.prepare('INSERT INTO funds(name, opening_balance_paisa) VALUES (?, 0)');
        ['General Fund', 'Welfare Fund', 'Emergency Fund', 'Development Fund', 'Other Fund'].forEach((name) => insert.run(name));
      }
      const income = ['Owner Payment', 'Route Income', 'Member Fees', 'Fines', 'Donations', 'Other Income'];
      const expense = ['Office Rent', 'Employee Salary', 'Electricity Bill', 'Office Expenses', 'Welfare Expenses', 'Emergency Expenses', 'Maintenance', 'Other Expenses'];
      const addIncome = this.db.prepare('INSERT OR IGNORE INTO income_categories(name) VALUES (?)');
      const addExpense = this.db.prepare('INSERT OR IGNORE INTO expense_categories(name) VALUES (?)');
      income.forEach((name) => addIncome.run(name));
      expense.forEach((name) => addExpense.run(name));
      this.db.prepare("DELETE FROM income_categories WHERE name IN ('Trip Collection','Monthly Member Fees')").run();
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
    const values = config.fields.map((field) => {
      const value = data[field];
      if (value === undefined || value === null || value === '') return FIELD_DEFAULTS[field] ?? '';
      return value;
    });
    for (const field of ['charge_paisa', 'opening_balance_paisa', 'monthly_fee_paisa']) {
      const index = config.fields.indexOf(field);
      if (index >= 0) values[index] = toInteger(values[index] || 0, field);
    }
    for (const field of ['is_active']) {
      const index = config.fields.indexOf(field);
      if (index >= 0) values[index] = values[index] ? 1 : 0;
    }
    const fieldValues = Object.fromEntries(config.fields.map((field, index) => [field, values[index]]));
    if (entity === 'routes') {
      const name = String(fieldValues.name || '').trim();
      const amount = Number(fieldValues.charge_paisa || 0);
      if (!name) throw new Error('Route name is required.');
      if (amount <= 0) throw new Error('Amount must be greater than zero.');
      const id = Number(data.id || 0);
      const old = id ? this.db.prepare('SELECT * FROM routes WHERE id=?').get(id) : null;
      if (id && !old) throw new Error('Route not found.');
      const routeNumber = String(fieldValues.route_number || '').trim()
        || old?.route_number
        || this.nextCode('RTE');
      const patch = { ...fieldValues, name, charge_paisa: amount, route_number: routeNumber };
      const hasRouteMetadata = ['starting_point', 'destination', 'status', 'description'].some((field) => data[field] !== undefined);
      if (old && !hasRouteMetadata) {
        for (const field of ['starting_point', 'destination', 'status', 'description']) patch[field] = old[field];
      }
      const columns = config.fields.map((field) => `${field}=?`).join(',');
      return this.db.transaction(() => {
        if (id) {
          this.db.prepare(`UPDATE routes SET ${columns} WHERE id=?`).run(...config.fields.map((field) => patch[field]), id);
          this.audit(user.id, 'update', entity, id, old, patch);
          return this.db.prepare('SELECT * FROM routes WHERE id=?').get(id);
        }
        const inserted = this.db.prepare(`INSERT INTO routes(${config.fields.join(',')}) VALUES (${config.fields.map(() => '?').join(',')})`)
          .run(...config.fields.map((field) => patch[field]));
        this.audit(user.id, 'create', entity, inserted.lastInsertRowid, null, patch);
        return this.db.prepare('SELECT * FROM routes WHERE id=?').get(inserted.lastInsertRowid);
      })();
    }
    if (entity === 'funds') {
      const name = String(fieldValues.name || '').trim();
      const amount = Number(fieldValues.opening_balance_paisa || 0);
      if (!name) throw new Error('Fund name is required.');
      if (amount < 0) throw new Error('Amount cannot be negative.');
      const id = Number(data.id || 0);
      const isActive = data.is_active === undefined
        ? (id ? this.db.prepare('SELECT is_active FROM funds WHERE id=?').get(id)?.is_active ?? 1 : 1)
        : (fieldValues.is_active ? 1 : 0);
      const patch = { ...fieldValues, name, opening_balance_paisa: amount, is_active: isActive };
      const columns = config.fields.map((field) => `${field}=?`).join(',');
      return this.db.transaction(() => {
        if (id) {
          const old = this.db.prepare('SELECT * FROM funds WHERE id=?').get(id);
          if (!old) throw new Error('Fund not found.');
          this.db.prepare(`UPDATE funds SET ${columns} WHERE id=?`).run(...config.fields.map((field) => patch[field]), id);
          this.audit(user.id, 'update', entity, id, old, patch);
          return this.db.prepare('SELECT * FROM funds WHERE id=?').get(id);
        }
        const inserted = this.db.prepare(`INSERT INTO funds(${config.fields.join(',')}) VALUES (${config.fields.map(() => '?').join(',')})`)
          .run(...config.fields.map((field) => patch[field]));
        this.audit(user.id, 'create', entity, inserted.lastInsertRowid, null, patch);
        return this.db.prepare(`SELECT * FROM funds WHERE id=?`).get(inserted.lastInsertRowid);
      })();
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
    return this.db.transaction(() => {
      this.db.prepare(`DELETE FROM ${config.table} WHERE id=?`).run(id);
      this.audit(user.id, 'delete', entity, id, old, null);
      return true;
    })();
  }

  ownerAccount(user, ownerId) {
    const owner = this.db.prepare('SELECT * FROM owners WHERE id=?').get(ownerId);
    if (!owner) throw new Error('Owner not found.');
    const buses = this.db.prepare(`SELECT b.*,r.name AS route_name FROM buses b LEFT JOIN routes r ON r.id=b.route_id WHERE b.owner_id=? ORDER BY b.registration_number`).all(ownerId);
    const payments = this.db.prepare(`SELECT t.*,f.name AS fund_name FROM fund_transactions t JOIN funds f ON f.id=t.fund_id
      WHERE t.owner_id=? ORDER BY t.date DESC,t.id DESC`).all(ownerId);
    const totals = this.db.prepare(`SELECT COALESCE(SUM(CASE WHEN transaction_type='income' THEN amount_paisa ELSE 0 END),0) AS income,
      COALESCE(SUM(CASE WHEN transaction_type='expense' THEN amount_paisa ELSE 0 END),0) AS expense
      FROM fund_transactions WHERE owner_id=?`).get(ownerId);
    return { owner, buses, payments, totals };
  }

  busAccount(user, busId) {
    const bus = this.db.prepare(`SELECT b.*,o.name AS owner_name,o.owner_code,r.name AS route_name,r.charge_paisa
      FROM buses b JOIN owners o ON o.id=b.owner_id LEFT JOIN routes r ON r.id=b.route_id WHERE b.id=?`).get(busId);
    if (!bus) throw new Error('Bus not found.');
    const payments = this.db.prepare(`SELECT t.*,f.name AS fund_name FROM fund_transactions t JOIN funds f ON f.id=t.fund_id
      WHERE t.bus_id=? ORDER BY t.date DESC,t.id DESC`).all(busId);
    return { bus, payments };
  }

  routeAccount(user, routeId) {
    const route = this.db.prepare('SELECT * FROM routes WHERE id=?').get(routeId);
    if (!route) throw new Error('Route not found.');
    const buses = this.db.prepare(`SELECT b.*,o.name AS owner_name FROM buses b
      JOIN owners o ON o.id=b.owner_id WHERE b.route_id=? ORDER BY b.registration_number`).all(routeId);
    return { route, buses };
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

  postTransaction(user, data) {
    this.requirePermission(user, 'manage_finance');
    const amount = toInteger(data.amount_paisa, 'Amount');
    if (amount <= 0) throw new Error('Amount must be greater than zero.');
    const type = data.transaction_type === 'expense' ? 'expense' : 'income';
    const date = String(data.date || new Date().toISOString().slice(0, 10));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Enter a valid transaction date.');
    const result = this.db.transaction(() => {
      const sourceRef = this.nextCode(type === 'income' ? 'INC' : 'EXP');
      const category = String(data.category || (type === 'income' ? 'Other Income' : 'Other Expenses'));
      const routeId = this.routeOfBus(data.bus_id);
      const inserted = this.db.prepare(`INSERT INTO fund_transactions(fund_id,date,transaction_type,category,amount_paisa,source,source_ref,owner_id,member_id,bus_id,
        receiver_name,reference_number,description,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(toInteger(data.fund_id, 'Fund'), date, type, category, amount, type, sourceRef,
          data.owner_id || null, data.member_id || null, data.bus_id || null,
          String(data.receiver_name || ''), String(data.reference_number || ''), String(data.description || ''), user.id);
      const receipt = type === 'income' ? this.insertReceipt(user, inserted.lastInsertRowid, {
        date, category, amount_paisa: amount,
        owner_id: data.owner_id, member_id: data.member_id, bus_id: data.bus_id, route_id: routeId
      }) : null;
      this.audit(user.id, 'create', 'fund_transaction', inserted.lastInsertRowid, null, data);
      return { transaction: this.db.prepare('SELECT * FROM fund_transactions WHERE id=?').get(inserted.lastInsertRowid), receipt };
    })();
    return result;
  }

  routeOfBus(busId) {
    if (!busId) return null;
    return this.db.prepare('SELECT route_id FROM buses WHERE id=?').get(Number(busId))?.route_id || null;
  }

  updateTransaction(user, data) {
    if (user.role !== 'admin') throw new Error('Only an administrator can correct a saved transaction.');
    const id = toInteger(data.id, 'Transaction');
    const old = this.db.prepare('SELECT * FROM fund_transactions WHERE id=?').get(id);
    if (!old) throw new Error('Transaction not found.');
    const amount = toInteger(data.amount_paisa, 'Amount');
    if (amount <= 0) throw new Error('Amount must be greater than zero.');
    const date = String(data.date || old.date);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Enter a valid transaction date.');
    return this.db.transaction(() => {
      if (old.transaction_type === 'income') {
        const total = this.db.prepare("SELECT COALESCE(SUM(amount_paisa),0) AS total FROM fund_transactions WHERE transaction_type='income'").get().total;
        this.assertCashInCoversDistributions(total - old.amount_paisa + amount);
      }
      const category = String(data.category || old.category);
      const routeId = this.routeOfBus(data.bus_id);
      this.db.prepare(`UPDATE fund_transactions SET fund_id=?,date=?,category=?,amount_paisa=?,owner_id=?,member_id=?,bus_id=?,
        receiver_name=?,reference_number=?,description=? WHERE id=?`)
        .run(toInteger(data.fund_id, 'Fund'), date, category, amount, data.owner_id || null, data.member_id || null, data.bus_id || null,
          String(data.receiver_name ?? old.receiver_name), String(data.reference_number ?? old.reference_number), String(data.description ?? old.description), id);
      if (old.transaction_type === 'income') {
        this.db.prepare('UPDATE receipts SET date=?,category=?,amount_paisa=?,owner_id=?,member_id=?,bus_id=?,route_id=? WHERE fund_transaction_id=?')
          .run(date, category, amount, data.owner_id || null, data.member_id || null, data.bus_id || null, routeId, id);
      }
      this.audit(user.id, 'correct', 'fund_transaction', id, old, data);
      return this.db.prepare('SELECT * FROM fund_transactions WHERE id=?').get(id);
    })();
  }

  deleteTransaction(user, id) {
    if (user.role !== 'admin') throw new Error('Only an administrator can delete a transaction.');
    const old = this.db.prepare('SELECT * FROM fund_transactions WHERE id=?').get(Number(id));
    if (!old) throw new Error('Transaction not found.');
    this.db.transaction(() => {
      if (old.transaction_type === 'income') {
        const total = this.db.prepare("SELECT COALESCE(SUM(amount_paisa),0) AS total FROM fund_transactions WHERE transaction_type='income'").get().total;
        this.assertCashInCoversDistributions(total - old.amount_paisa);
      }
      this.db.prepare('DELETE FROM receipts WHERE fund_transaction_id=?').run(old.id);
      this.db.prepare('DELETE FROM fund_transactions WHERE id=?').run(old.id);
      this.audit(user.id, 'delete', 'fund_transaction', old.id, old, null);
    })();
    return true;
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

  cashbookTotals() {
    const cashIn = this.db.prepare("SELECT COALESCE(SUM(amount_paisa),0) AS total FROM fund_transactions WHERE transaction_type='income'").get().total;
    const distributed = this.db.prepare('SELECT COALESCE(SUM(amount_paisa),0) AS total FROM fund_distributions').get().total;
    return { cash_in_paisa: cashIn, distributed_paisa: distributed, available_paisa: cashIn - distributed };
  }

  assertCashInCoversDistributions(cashIn) {
    const distributed = this.db.prepare('SELECT COALESCE(SUM(amount_paisa),0) AS total FROM fund_distributions').get().total;
    if (cashIn < distributed) throw new Error('This change would make total income lower than the amount already distributed.');
  }

  cashbook(user) {
    const totals = this.cashbookTotals();
    const income = this.db.prepare(`SELECT t.id,t.date,t.category,t.amount_paisa,
      COALESCE(o.name,m.name,'') AS party,b.registration_number
      FROM fund_transactions t LEFT JOIN owners o ON o.id=t.owner_id
      LEFT JOIN members m ON m.id=t.member_id LEFT JOIN buses b ON b.id=t.bus_id
      WHERE t.transaction_type='income' ORDER BY t.date DESC,t.id DESC`).all();
    const distributions = this.db.prepare(`SELECT id,fund_id,fund_name,date,amount_paisa,request_key,created_at
      FROM fund_distributions ORDER BY date DESC,id DESC`).all();
    const funds = this.db.prepare(`SELECT f.id,f.name,
      f.opening_balance_paisa + COALESCE(SUM(d.amount_paisa),0) AS balance_paisa,
      COALESCE(SUM(d.amount_paisa),0) AS distributed_paisa
      FROM funds f LEFT JOIN fund_distributions d ON d.fund_id=f.id
      WHERE f.is_active=1 GROUP BY f.id ORDER BY f.name`).all();
    return { totals, income, distributions, funds };
  }

  distributeCash(user, data) {
    this.requirePermission(user, 'manage_finance');
    const amount = toInteger(data.amount_paisa, 'Distribution amount');
    if (amount <= 0) throw new Error('Distribution amount must be greater than zero.');
    const fundId = toInteger(data.fund_id, 'Fund');
    const requestKey = String(data.request_key || '').trim();
    if (!requestKey || requestKey.length > 100) throw new Error('A valid distribution request key is required.');
    return this.db.transaction(() => {
      const existing = this.db.prepare('SELECT * FROM fund_distributions WHERE request_key=?').get(requestKey);
      if (existing) {
        if (existing.fund_id !== fundId || existing.amount_paisa !== amount) {
          throw new Error('This distribution request key was already used for a different distribution.');
        }
        return { distribution: existing, duplicate: true, totals: this.cashbookTotals() };
      }
      const fund = this.db.prepare('SELECT id,name FROM funds WHERE id=? AND is_active=1').get(fundId);
      if (!fund) throw new Error('Choose an active fund.');
      const totals = this.cashbookTotals();
      if (amount > totals.available_paisa) throw new Error('Distribution cannot exceed the available cash balance.');
      const date = new Date().toISOString().slice(0, 10);
      const inserted = this.db.prepare(`INSERT INTO fund_distributions(fund_id,fund_name,date,amount_paisa,request_key,created_by)
        VALUES (?,?,?,?,?,?)`).run(fund.id, fund.name, date, amount, requestKey, user.id);
      const distribution = this.db.prepare('SELECT * FROM fund_distributions WHERE id=?').get(inserted.lastInsertRowid);
      this.audit(user.id, 'distribute', 'fund_distribution', distribution.id, null, distribution);
      return { distribution, duplicate: false, totals: this.cashbookTotals() };
    }).immediate();
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
        buses: count('buses'), owners: count('owners'), routes: count('routes'), members: count('members'),
        today_collection_paisa: sum(`SELECT SUM(amount_paisa) AS value FROM fund_transactions WHERE transaction_type='income' AND date=?`, today),
        month_collection_paisa: sum(`SELECT SUM(amount_paisa) AS value FROM fund_transactions WHERE transaction_type='income' AND substr(date,1,7)=?`, month),
        month_expenses_paisa: sum(`SELECT SUM(amount_paisa) AS value FROM fund_transactions WHERE transaction_type='expense' AND substr(date,1,7)=?`, month),
        expenses_paisa: sum(`SELECT SUM(amount_paisa) AS value FROM fund_transactions WHERE transaction_type='expense'`),
        funds_paisa: balances.reduce((total, fund) => total + fund.balance_paisa, 0)
      },
      funds: balances,
      monthly: this.db.prepare(`SELECT substr(date,1,7) AS period,
        SUM(CASE WHEN transaction_type='income' THEN amount_paisa ELSE 0 END) AS income_paisa,
        SUM(CASE WHEN transaction_type='expense' THEN amount_paisa ELSE 0 END) AS expense_paisa
        FROM fund_transactions WHERE date>=date(?,'-11 months','start of month')
        GROUP BY period ORDER BY period`).all(`${month}-01`),
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
    if (type === 'receipts') return this.db.prepare(`SELECT r.receipt_number,r.date,r.category,r.amount_paisa,
      COALESCE(o.name,m.name,'') AS party,b.registration_number AS bus
      FROM receipts r LEFT JOIN owners o ON o.id=r.owner_id LEFT JOIN members m ON m.id=r.member_id
      LEFT JOIN buses b ON b.id=r.bus_id WHERE r.date BETWEEN ? AND ? ORDER BY r.date DESC,r.id DESC`).all(from, to);
    if (type === 'owners') return this.db.prepare(`SELECT o.owner_code,o.name,o.mobile,o.join_date,o.status,
      (SELECT COUNT(*) FROM buses b WHERE b.owner_id=o.id) AS buses,
      COALESCE((SELECT SUM(ft.amount_paisa) FROM fund_transactions ft WHERE ft.owner_id=o.id AND ft.transaction_type='income' AND ft.date BETWEEN ? AND ?),0) AS income_paisa,
      COALESCE((SELECT SUM(ft.amount_paisa) FROM fund_transactions ft WHERE ft.owner_id=o.id AND ft.transaction_type='expense' AND ft.date BETWEEN ? AND ?),0) AS expense_paisa
      FROM owners o ORDER BY o.name`).all(from, to, from, to);
    if (type === 'buses') return this.db.prepare(`SELECT b.registration_number,o.name AS owner,r.name AS route,b.bus_type,b.status,
      COALESCE((SELECT SUM(t.amount_paisa) FROM fund_transactions t WHERE t.bus_id=b.id AND t.transaction_type='income' AND t.date BETWEEN ? AND ?),0) AS income_paisa,
      COALESCE((SELECT SUM(t.amount_paisa) FROM fund_transactions t WHERE t.bus_id=b.id AND t.transaction_type='expense' AND t.date BETWEEN ? AND ?),0) AS expense_paisa
      FROM buses b JOIN owners o ON o.id=b.owner_id LEFT JOIN routes r ON r.id=b.route_id
      ORDER BY b.registration_number`).all(from, to, from, to);
    if (type === 'routes') return this.db.prepare(`SELECT r.route_number,r.name,r.starting_point,r.destination,r.charge_paisa,r.status,
      (SELECT COUNT(*) FROM buses b WHERE b.route_id=r.id) AS buses
      FROM routes r ORDER BY r.route_number`).all();
    if (type === 'members') return this.db.prepare(`SELECT m.member_code,m.name,m.father_name,m.mobile,m.member_type,m.status,m.membership_date,
      m.monthly_fee_paisa,
      COALESCE((SELECT SUM(t.amount_paisa) FROM fund_transactions t WHERE t.member_id=m.id AND t.transaction_type='income' AND t.date BETWEEN ? AND ?),0) AS paid_paisa
      FROM members m ORDER BY m.name`).all(from, to);
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

  async backup(destination) {
    await this.db.backup(destination);
    const photos = path.join(path.dirname(this.filePath), 'owner-photos');
    if (fs.existsSync(photos)) fs.cpSync(photos, path.join(path.dirname(destination), 'owner-photos'), { recursive: true, force: true, errorOnExist: false });
  }

  pruneScheduledBackups(root, keepCopies) {
    const folders = fs.readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && /^daily-\d{4}-\d{2}-\d{2}$/.test(entry.name))
      .map((entry) => entry.name).sort();
    for (const folder of folders.slice(0, Math.max(0, folders.length - keepCopies))) {
      fs.rmSync(path.join(root, folder), { recursive: true, force: true });
    }
  }

  async runScheduledBackup() {
    const settings = this.getSettings();
    if (!settings.auto_backup || !settings.backup_folder) return null;
    const today = new Date().toISOString().slice(0, 10);
    const folder = path.join(settings.backup_folder, `daily-${today}`);
    if (fs.existsSync(folder)) return null;
    fs.mkdirSync(folder, { recursive: true });
    const destination = path.join(folder, 'association.sqlite');
    await this.backup(destination);
    this.pruneScheduledBackups(settings.backup_folder, settings.keep_copies);
    this.audit(null, 'auto-backup', 'settings', destination, null, null);
    return destination;
  }

  restore(source) {
    if (path.resolve(source) === path.resolve(this.filePath)) throw new Error('Choose a different database file.');
    const check = new Database(source, { readonly: true, fileMustExist: true });
    try {
      const integrity = check.pragma('integrity_check', { simple: true });
      if (integrity !== 'ok') throw new Error(`Backup integrity check failed: ${integrity}`);
      for (const table of ['users', 'owners', 'buses', 'routes', 'funds', 'fund_transactions', 'members', 'receipts']) {
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
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safetyCopy = `${this.filePath.replace(/\.sqlite$/, '')}.before-restore-${stamp}.sqlite`;
    fs.copyFileSync(this.filePath, safetyCopy);
    fs.copyFileSync(source, this.filePath);
    const sourcePhotos = path.join(path.dirname(source), 'owner-photos');
    if (fs.existsSync(sourcePhotos)) fs.cpSync(sourcePhotos, path.join(path.dirname(this.filePath), 'owner-photos'), { recursive: true, force: true });
    this.db = new Database(this.filePath);
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('busy_timeout = 5000');
    this.initialize();
  }

  settingsValues() {
    return Object.fromEntries(this.db.prepare('SELECT key, value FROM settings').all().map((row) => [row.key, row.value]));
  }

  getSettings() {
    const values = this.settingsValues();
    return {
      name: values.association_name || 'Bus Malik Somiti',
      address: values.association_address || '',
      logo: values.association_logo || '',
      backup_folder: values.backup_folder || '',
      auto_backup: values.auto_backup === '1',
      keep_copies: Number(values.keep_copies || 30)
    };
  }

  saveSettings(user, data) {
    if (user.role !== 'admin') throw new Error('Only an administrator can change association settings.');
    const write = this.db.prepare('INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
    this.db.transaction(() => {
      if (data.name !== undefined) write.run('association_name', String(data.name || '').trim());
      if (data.address !== undefined) write.run('association_address', String(data.address || '').trim());
      if (data.logo !== undefined) write.run('association_logo', String(data.logo || '').trim());
      if (data.backup_folder !== undefined) write.run('backup_folder', String(data.backup_folder || '').trim());
      if (data.auto_backup !== undefined) write.run('auto_backup', data.auto_backup ? '1' : '0');
      if (data.keep_copies !== undefined) write.run('keep_copies', String(Math.min(365, Math.max(1, Number(data.keep_copies) || 30))));
    })();
    this.audit(user.id, 'update', 'settings', 'settings', null, { ...data, logo: undefined });
    return this.getSettings();
  }

  logoFile() {
    const configured = this.getSettings().logo;
    if (configured && fs.existsSync(configured)) return configured;
    return fs.existsSync(BUNDLED_LOGO) ? BUNDLED_LOGO : null;
  }

  writePdfHeader(doc, subtitle, compact) {
    const settings = this.getSettings();
    const left = doc.page.margins.left;
    const width = doc.page.width - left - doc.page.margins.right;
    const top = doc.y;
    const logo = this.logoFile();
    const textTop = logo ? top + 48 : top;
    if (logo) {
      try { doc.image(logo, left + (width - 44) / 2, top, { fit: [44, 44] }); } catch { /* a corrupt logo file must not stop the report */ }
    }
    doc.y = textTop;
    doc.fontSize(compact ? 12 : 17).fillColor('#17263d').font(doc.family.head)
      .text(String(settings.name || 'Bus Malik Somiti'), left, textTop, { width, align: 'center' });
    if (settings.address) doc.fontSize(9).fillColor('#52637b').font(doc.family.body).text(String(settings.address), { width, align: 'center' });
    doc.fontSize(compact ? 9 : 11).fillColor('#2468c9').font(doc.family.head).text(String(subtitle || ''), { width, align: 'center' });
    doc.moveDown(compact ? 0.4 : 0.8);
    doc.moveTo(left, doc.y).lineTo(left + width, doc.y).strokeColor('#c9d7ea').stroke();
    doc.moveDown(0.6);
    return doc.y;
  }

  columnWidths(columns, rows, total) {
    if (!columns.length) return [];
    const weights = columns.map((header, index) => {
      const longest = Math.max(String(header).length, ...rows.map((row) => String(row[index] ?? '').length), 4);
      return Math.min(26, Math.max(6, longest));
    });
    const sum = weights.reduce((a, b) => a + b, 0);
    return weights.map((weight) => (weight / sum) * total);
  }

  async exportPdf(filePath, title, headers, rows) {
    const columns = (headers || []).map(String);
    const values = (rows || []).map((row) => (Array.isArray(row) ? row : Object.values(row)));
    await new Promise((resolve, reject) => {
      const doc = createDoc({ size: 'A4', margin: 36, layout: 'landscape' });
      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);
      const tableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const widths = this.columnWidths(columns, values, tableWidth);
      const rowHeight = 15;
      const bottom = doc.page.height - doc.page.margins.bottom - 20;
      const drawRow = (cells, top, style) => {
        let x = doc.page.margins.left;
        if (style === 'head') doc.rect(doc.page.margins.left, top, tableWidth, rowHeight).fill('#edf3fb');
        doc.font(style === 'head' ? doc.family.head : doc.family.body).fontSize(8).fillColor('#17263d');
        cells.forEach((cell, index) => {
          doc.text(String(cell ?? ''), x + 3, top + 4, { width: Math.max(20, widths[index] - 6), ellipsis: true, lineBreak: false });
          x += widths[index] || 0;
        });
      };
      let y = this.writePdfHeader(doc, String(title || 'Association Report')) + 6;
      drawRow(columns, y, 'head');
      y += rowHeight;
      values.forEach((row, index) => {
        if (y > bottom) { doc.addPage(); y = this.writePdfHeader(doc, String(title || 'Association Report'), true) + 6; drawRow(columns, y, 'head'); y += rowHeight; }
        if (index % 2 === 1) doc.rect(doc.page.margins.left, y, tableWidth, rowHeight).fill('#f7fafd');
        drawRow(row, y, 'body');
        y += rowHeight;
      });
      doc.font(doc.family.body).fontSize(8).fillColor('#7d8ba0');
      doc.text(`Generated ${new Date().toLocaleString()} · ${values.length} rows`, doc.page.margins.left, Math.min(y + 8, bottom), { width: tableWidth });
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
    const receipt = this.db.prepare(`SELECT r.*,o.name AS owner_name,m.name AS member_name,b.registration_number,rte.name AS route_name,
      u.full_name AS issued_by,t.receiver_name,t.reference_number,t.description,f.name AS fund_name
      FROM receipts r LEFT JOIN owners o ON o.id=r.owner_id LEFT JOIN members m ON m.id=r.member_id
      LEFT JOIN buses b ON b.id=r.bus_id LEFT JOIN routes rte ON rte.id=r.route_id
      LEFT JOIN users u ON u.id=r.created_by LEFT JOIN fund_transactions t ON t.id=r.fund_transaction_id
      LEFT JOIN funds f ON f.id=t.fund_id WHERE r.id=?`).get(receiptId);
    if (!receipt) throw new Error('Receipt not found.');
    const outDir = path.join(path.dirname(this.filePath), 'receipts');
    fs.mkdirSync(outDir, { recursive: true });
    const output = path.join(outDir, `${receipt.receipt_number}.pdf`);
    await new Promise((resolve, reject) => {
      const doc = createDoc({ size: 'A5', margin: 34 });
      const stream = fs.createWriteStream(output);
      doc.pipe(stream);
      const left = doc.page.margins.left;
      const contentWidth = doc.page.width - left - doc.page.margins.right;
      doc.y = this.writePdfHeader(doc, 'Payment Receipt · আদায়ের রসিদ');
      const meta = (label, value) => {
        const top = doc.y;
        doc.font(doc.family.head).fontSize(9).fillColor('#52637b').text(String(label), left, top, { width: 128 });
        doc.font(doc.family.body).fontSize(10).fillColor('#17263d').text(String(value ?? '—'), left + 132, top, { width: contentWidth - 132 });
        doc.moveDown(0.2);
      };
      meta('Receipt No · রসিদ নম্বর', receipt.receipt_number);
      meta('Date · তারিখ', receipt.date);
      meta('Received from · প্রদাতা', receipt.owner_name || receipt.member_name || 'Association income · সমিতির আয়');
      if (receipt.registration_number) meta('Bus · বাস', receipt.registration_number);
      if (receipt.route_name) meta('Route · রুট', receipt.route_name);
      meta('Category · খাত', receipt.category);
      if (receipt.fund_name) meta('Fund · তহবিল', receipt.fund_name);
      if (receipt.reference_number) meta('Reference · রেফারেন্স', receipt.reference_number);
      if (receipt.description) meta('Description · বিবরণ', receipt.description);
      doc.moveDown(0.5);
      const boxTop = doc.y;
      doc.roundedRect(left, boxTop, contentWidth, 46, 6).fillAndStroke('#f2f7fd', '#c9d7ea');
      doc.font(doc.family.head).fontSize(9).fillColor('#52637b').text('Amount · পরিমাণ', left + 12, boxTop + 8, { width: contentWidth - 24 });
      doc.font(doc.family.strong).fontSize(17).fillColor('#16355c').text(formatBdt(receipt.amount_paisa), left + 12, boxTop + 21, { width: contentWidth - 24 });
      doc.y = boxTop + 54;
      doc.font(doc.family.body).fontSize(9).fillColor('#52637b')
        .text(`In words · কথায়: ${amountInWords(receipt.amount_paisa)}`, left, doc.y, { width: contentWidth });
      doc.moveDown(2);
      const footerY = Math.min(doc.y, doc.page.height - doc.page.margins.bottom - 46);
      doc.font(doc.family.body).fontSize(9).fillColor('#52637b');
      doc.text(`Received by · গ্রহীতা: ${receipt.receiver_name || receipt.issued_by || '—'}`, left, footerY, { width: contentWidth / 2 });
      doc.text('Authorized signature · অনুমোদিত স্বাক্ষর', left + contentWidth / 2, footerY, { width: contentWidth / 2 });
      doc.moveTo(left + contentWidth / 2, footerY + 26).lineTo(left + contentWidth - 10, footerY + 26).strokeColor('#9fb0c6').stroke();
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
