const Database = require('better-sqlite3');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const { isPrivilegedKey } = require('./subscription/config.cjs');

const FONT_DIR = path.join(__dirname, '..', 'assets', 'fonts');
const BUNDLED_LOGO = path.join(__dirname, '..', 'assets', 'logo.png');

// Raised whenever a release changes the table layout; the value is stored in the
// database itself so an old ledger is recognised and copied before migration.
const SCHEMA_VERSION = 1;
const PRE_MIGRATION_FOLDER = 'pre-migration-backups';
const PRE_MIGRATION_COPIES = 5;

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
    search: ['registration_number', 'driver_name', 'driver_mobile', 'helper_name']
  },
  members: {
    table: 'members',
    fields: ['name', 'father_name', 'mobile', 'address', 'membership_date', 'member_type', 'status', 'monthly_fee_paisa'],
    search: ['name', 'mobile', 'member_type']
  },
  funds: {
    table: 'funds',
    fields: ['name', 'route_id', 'amount_paisa', 'is_active'],
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

function localDateString(date = new Date()) {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function validDateString(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))
    && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
}

const BUS_IMPORT_LIMITS = {
  owner_name: 200, bus_number: 100, father_name: 200, mobile: 30, address: 500
};
const FUND_IMPORT_LIMITS = { fund_name: 200, route_name: 200 };
const EXCEL_FONT = 'Nirmala UI';

function importText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function importDigits(value) {
  return String(value ?? '').replace(/[\u09e6-\u09ef]/g, (digit) =>
    String(digit.charCodeAt(0) - 0x09e6));
}

function importKey(value) {
  return importDigits(importText(value)).normalize('NFC').toLowerCase();
}

// Accepts 01712345678, ০১৭১২৩৪৫৬৭৮, 01712-345678, +880 1712 345678 and
// 8801712345678, and always returns the canonical 11-digit 01[3-9] form.
// Anything that is not a Bangladeshi mobile number returns ''.
function importMobile(value) {
  const text = String(value ?? '').normalize('NFKC').replace(/[\u200b-\u200d\ufeff]/g, '');
  if (/[a-z\u0980-\u09e5\u09f0-\u09ff]/i.test(text)) return '';
  let number = importDigits(text).replace(/\D/g, '');
  if (number.startsWith('880')) number = number.slice(3);
  else if (number.startsWith('88') && number.length > 12) number = number.slice(2);
  if (/^1[3-9]\d{8}$/.test(number)) number = `0${number}`;
  return /^01[3-9]\d{8}$/.test(number) ? number : '';
}

function importStatus(value) {
  const text = importText(value).normalize('NFC').replace(/[\u200b-\u200d\ufeff]/g, '').toLowerCase();
  if (!text) return { value: 'Active' };
  if (['active', 'সক্রিয়', 'সক্রিয়'].includes(text)) return { value: 'Active' };
  if (['inactive', 'নিষ্ক্রিয়', 'নিষ্ক্রিয়'].includes(text)) return { value: 'Inactive' };
  return { error: `Status must be Active or Inactive (found "${importText(value)}").` };
}

function importCell(cells, mapping, key) {
  const selected = mapping?.[key];
  if (selected === '' || selected === null || selected === undefined) return '';
  const index = Number(selected);
  if (!Number.isInteger(index) || index < 0 || index >= cells.length) return '';
  return cells[index];
}

// Reads a taka amount from a sheet cell: 70, 70.50, "৳ 70.00", "1,000" and
// Bangla digits all return paisa. Empty cells return 0.
function importAmountPaisa(value) {
  const raw = importText(value);
  if (!raw) return { value: 0 };
  const digits = importDigits(raw).replace(/[^0-9.]/g, '');
  const amount = Number.parseFloat(digits);
  if (!digits || !Number.isFinite(amount)) return { error: `Amount must be a number (found "${raw}").` };
  const paisa = Math.round(amount * 100);
  if (!Number.isSafeInteger(paisa) || paisa > 1e12) return { error: `Amount is too large (found "${raw}").` };
  return { value: paisa };
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
    this.prepareForSchemaChanges();
    this.initialize();
  }

  // Any build that changes the schema has to copy the association's ledger
  // first, so a failed migration is always recoverable. A brand new empty file
  // needs no copy, and a database written by an older build (user_version 0)
  // counts as one that is about to be migrated.
  prepareForSchemaChanges() {
    const stored = Number(this.db.pragma('user_version', { simple: true }) || 0);
    const tables = this.db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table'").get().count;
    if (stored >= SCHEMA_VERSION || !tables) return null;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const folder = path.join(path.dirname(this.filePath), PRE_MIGRATION_FOLDER);
    const destination = path.join(folder, `association-before-${stored || 'legacy'}-to-${SCHEMA_VERSION}-${stamp}.sqlite`);
    try {
      fs.mkdirSync(folder, { recursive: true });
      this.db.pragma('wal_checkpoint(TRUNCATE)');
      fs.copyFileSync(this.filePath, destination);
      const check = new Database(destination, { readonly: true, fileMustExist: true });
      try {
        const integrity = check.pragma('integrity_check', { simple: true });
        if (integrity !== 'ok') throw new Error(`integrity check reported ${integrity}`);
      } finally {
        check.close();
        // A read-only look at a WAL database leaves sidecar files behind, and
        // the copy folder must stay a plain list of database files.
        for (const suffix of ['-wal', '-shm']) fs.rmSync(`${destination}${suffix}`, { force: true });
      }
    } catch (error) {
      fs.rmSync(destination, { force: true });
      this.db.close();
      throw new Error(`The database could not be backed up before the update (${error.message}). Free up space in ${folder} or copy ${this.filePath} somewhere safe, then open the software again.`);
    }
    this.prunePreMigrationBackups(folder);
    return destination;
  }

  prunePreMigrationBackups(folder) {
    const copies = fs.readdirSync(folder).filter((name) => /^association-before-.*\.sqlite$/.test(name)).sort();
    for (const name of copies.slice(0, Math.max(0, copies.length - PRE_MIGRATION_COPIES))) {
      fs.rmSync(path.join(folder, name), { force: true });
    }
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
        route_id INTEGER REFERENCES routes(id) ON UPDATE CASCADE ON DELETE SET NULL,
        amount_paisa INTEGER NOT NULL DEFAULT 0 CHECK(amount_paisa >= 0),
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
      CREATE TABLE IF NOT EXISTS route_cash_ins (
        id INTEGER PRIMARY KEY,
        route_id INTEGER REFERENCES routes(id) ON UPDATE CASCADE ON DELETE SET NULL,
        route_name TEXT NOT NULL,
        cash_in_type TEXT NOT NULL DEFAULT 'Regular' CHECK(cash_in_type IN ('Regular','Holiday')),
        per_trip_paisa INTEGER NOT NULL CHECK(per_trip_paisa > 0),
        total_trips INTEGER NOT NULL CHECK(total_trips > 0),
        total_amount_paisa INTEGER NOT NULL CHECK(total_amount_paisa > 0),
        date TEXT NOT NULL,
        request_key TEXT NOT NULL UNIQUE,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS cash_outs (
        id INTEGER PRIMARY KEY,
        route_id INTEGER REFERENCES routes(id) ON UPDATE CASCADE ON DELETE SET NULL,
        route_name TEXT NOT NULL DEFAULT '',
        fund_id INTEGER NOT NULL REFERENCES funds(id) ON UPDATE CASCADE ON DELETE RESTRICT,
        fund_name TEXT NOT NULL,
        per_trip_paisa INTEGER CHECK(per_trip_paisa IS NULL OR per_trip_paisa > 0),
        total_trips INTEGER CHECK(total_trips IS NULL OR total_trips > 0),
        amount_paisa INTEGER NOT NULL CHECK(amount_paisa > 0),
        date TEXT NOT NULL,
        request_key TEXT NOT NULL UNIQUE,
        batch_key TEXT,
        legacy_distribution_id INTEGER UNIQUE,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS banks (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        branch_name TEXT NOT NULL DEFAULT '',
        account_holder TEXT NOT NULL DEFAULT '',
        account_number TEXT NOT NULL UNIQUE,
        account_type TEXT NOT NULL DEFAULT 'Current',
        routing_number TEXT NOT NULL DEFAULT '',
        opening_balance_paisa INTEGER NOT NULL DEFAULT 0 CHECK(opening_balance_paisa >= 0),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS bank_deposits (
        id INTEGER PRIMARY KEY,
        date TEXT NOT NULL,
        bank_id INTEGER NOT NULL REFERENCES banks(id) ON UPDATE CASCADE ON DELETE RESTRICT,
        fund_id INTEGER NOT NULL REFERENCES funds(id) ON UPDATE CASCADE ON DELETE RESTRICT,
        amount_paisa INTEGER NOT NULL CHECK(amount_paisa > 0),
        transaction_id TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
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
      CREATE INDEX IF NOT EXISTS idx_buses_status ON buses(status);
      CREATE INDEX IF NOT EXISTS idx_transactions_date ON fund_transactions(date);
      CREATE INDEX IF NOT EXISTS idx_transactions_fund ON fund_transactions(fund_id);
      CREATE INDEX IF NOT EXISTS idx_transactions_party ON fund_transactions(owner_id);
      CREATE INDEX IF NOT EXISTS idx_transactions_source ON fund_transactions(source, source_ref);
      CREATE INDEX IF NOT EXISTS idx_receipts_date ON receipts(date);
      CREATE INDEX IF NOT EXISTS idx_receipts_transaction ON receipts(fund_transaction_id);
      CREATE INDEX IF NOT EXISTS idx_fund_distributions_fund ON fund_distributions(fund_id,date);
      CREATE INDEX IF NOT EXISTS idx_route_cash_ins_date ON route_cash_ins(date);
      CREATE INDEX IF NOT EXISTS idx_cash_outs_fund ON cash_outs(fund_id,date);
      CREATE INDEX IF NOT EXISTS idx_cash_outs_route ON cash_outs(route_id,date);
      CREATE INDEX IF NOT EXISTS idx_bank_deposits_date ON bank_deposits(date);
      CREATE INDEX IF NOT EXISTS idx_bank_deposits_bank ON bank_deposits(bank_id,date);
      CREATE INDEX IF NOT EXISTS idx_bank_deposits_fund ON bank_deposits(fund_id,date);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_deposits_txn
        ON bank_deposits(bank_id, transaction_id) WHERE transaction_id <> '';
    `);

    const migrations = {
      owners: [['nominee_name', "TEXT NOT NULL DEFAULT ''"], ['father_name', "TEXT NOT NULL DEFAULT ''"], ['mobile', "TEXT NOT NULL DEFAULT ''"], ['address', "TEXT NOT NULL DEFAULT ''"], ['photo_path', "TEXT NOT NULL DEFAULT ''"], ['join_date', "TEXT NOT NULL DEFAULT ''"], ['status', "TEXT NOT NULL DEFAULT 'Active'"]],
      routes: [['starting_point', "TEXT NOT NULL DEFAULT ''"], ['destination', "TEXT NOT NULL DEFAULT ''"], ['description', "TEXT NOT NULL DEFAULT ''"], ['status', "TEXT NOT NULL DEFAULT 'Active'"]],
      buses: [['driver_name', "TEXT NOT NULL DEFAULT ''"], ['driver_mobile', "TEXT NOT NULL DEFAULT ''"], ['helper_name', "TEXT NOT NULL DEFAULT ''"], ['bus_type', "TEXT NOT NULL DEFAULT ''"], ['status', "TEXT NOT NULL DEFAULT 'Active'"]],
      members: [['father_name', "TEXT NOT NULL DEFAULT ''"], ['mobile', "TEXT NOT NULL DEFAULT ''"], ['address', "TEXT NOT NULL DEFAULT ''"], ['member_type', "TEXT NOT NULL DEFAULT 'Regular'"], ['status', "TEXT NOT NULL DEFAULT 'Active'"], ['monthly_fee_paisa', 'INTEGER NOT NULL DEFAULT 0']],
      funds: [['is_active', 'INTEGER NOT NULL DEFAULT 1'], ['route_id', 'INTEGER REFERENCES routes(id) ON UPDATE CASCADE ON DELETE SET NULL'], ['amount_paisa', 'INTEGER NOT NULL DEFAULT 0']],
      income_categories: [['is_active', 'INTEGER NOT NULL DEFAULT 1']],
      expense_categories: [['is_active', 'INTEGER NOT NULL DEFAULT 1']],
      fund_transactions: [['receiver_name', "TEXT NOT NULL DEFAULT ''"], ['reference_number', "TEXT NOT NULL DEFAULT ''"]],
      route_cash_ins: [['cash_in_type', "TEXT NOT NULL DEFAULT 'Regular'"]],
      cash_outs: [['batch_key', 'TEXT']]
    };
    for (const [table, columns] of Object.entries(migrations)) {
      const existing = this.db.pragma(`table_info(${table})`).map((column) => column.name);
      for (const [name, definition] of columns) {
        if (!existing.includes(name)) this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
      }
    }
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_cash_outs_batch ON cash_outs(batch_key)');
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
      this.db.prepare(`INSERT OR IGNORE INTO cash_outs(route_id,route_name,fund_id,fund_name,per_trip_paisa,total_trips,amount_paisa,date,request_key,legacy_distribution_id,created_by,created_at)
        SELECT NULL,'',d.fund_id,d.fund_name,NULL,NULL,d.amount_paisa,d.date,'legacy-distribution-'||d.id,d.id,d.created_by,d.created_at
        FROM fund_distributions d`).run();
    });
    initialData();
    const recorded = Number(this.db.pragma('user_version', { simple: true }) || 0);
    if (recorded < SCHEMA_VERSION) this.db.pragma(`user_version = ${SCHEMA_VERSION}`);
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
    if (action === 'manage_cashbook') return permissions.manage_cashbook === true || permissions.manage_finance === true;
    return permissions[action] === true;
  }

  requirePermission(user, action) {
    if (!this.allowed(user, action)) throw new Error(`Your account does not have permission to ${action}.`);
  }

  audit(userId, action, entity, entityId, before, after) {
    this.db.prepare('INSERT INTO audit_logs(user_id,action,entity,entity_id,before_json,after_json) VALUES (?,?,?,?,?,?)')
      .run(userId || null, action, entity, String(entityId ?? ''), before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null);
  }

  listRecords(user, entity, search, filters = {}) {
    const config = TABLES[entity];
    if (!config) throw new Error('Unknown record type.');
    filters = filters || {};
    if (entity === 'buses') {
      const where = [];
      const values = [];
      const term = String(search || '').trim().slice(0, 100);
      if (term) {
        const like = `%${term}%`;
        where.push(`(b.registration_number LIKE ? OR o.name LIKE ? OR o.mobile LIKE ?
          OR r.name LIKE ? OR r.route_number LIKE ? OR b.driver_name LIKE ?
          OR b.driver_mobile LIKE ? OR b.helper_name LIKE ?)`);
        values.push(like, like, like, like, like, like, like, like);
      }
      if (filters.route_id !== undefined && filters.route_id !== null && filters.route_id !== '') {
        where.push('b.route_id=?');
        values.push(toInteger(filters.route_id, 'Route'));
      }
      const status = String(filters.status || '');
      if (status === 'Active') where.push(`b.status='Active'`);
      else if (status === 'Inactive') where.push(`b.status<>'Active'`);
      const sql = `SELECT b.*,o.name AS owner_name,o.mobile AS owner_mobile,
        r.name AS route_name,r.route_number AS bus_route_number
        FROM buses b JOIN owners o ON o.id=b.owner_id LEFT JOIN routes r ON r.id=b.route_id
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY CASE WHEN b.status='Active' THEN 0 ELSE 1 END,b.registration_number COLLATE NOCASE`;
      return this.db.prepare(sql).all(...values);
    }
    if (entity === 'funds') {
      const term = String(search || '').trim().slice(0, 100);
      return this.db.prepare(`SELECT f.*, r.name AS route_name,
        f.opening_balance_paisa
          + COALESCE((SELECT SUM(d.amount_paisa) FROM cash_outs d WHERE d.fund_id=f.id),0)
          + COALESCE((SELECT SUM(CASE WHEN t.transaction_type='income' THEN t.amount_paisa ELSE -t.amount_paisa END)
            FROM fund_transactions t WHERE t.fund_id=f.id),0)
          + COALESCE((SELECT SUM(ft.amount_paisa) FROM fund_transfers ft WHERE ft.to_fund_id=f.id),0)
          - COALESCE((SELECT SUM(ft.amount_paisa) FROM fund_transfers ft WHERE ft.from_fund_id=f.id),0)
          - COALESCE((SELECT SUM(bd.amount_paisa) FROM bank_deposits bd WHERE bd.fund_id=f.id),0) AS balance_paisa
        FROM funds f LEFT JOIN routes r ON r.id=f.route_id
        ${term ? 'WHERE f.name LIKE ?' : ''} ORDER BY f.id DESC`).all(...(term ? [`%${term}%`] : []));
    }
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
    for (const field of ['charge_paisa', 'opening_balance_paisa', 'monthly_fee_paisa', 'amount_paisa']) {
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
      const amount = Number(fieldValues.amount_paisa || 0);
      if (!name) throw new Error('Fund name is required.');
      if (!fieldValues.route_id) throw new Error('Choose a route for this fund.');
      const routeId = toInteger(fieldValues.route_id, 'Route');
      const route = this.db.prepare('SELECT id FROM routes WHERE id=?').get(routeId);
      if (!route) throw new Error('Route not found.');
      if (amount <= 0) throw new Error('Amount must be greater than zero.');
      const id = Number(data.id || 0);
      const isActive = data.is_active === undefined
        ? (id ? this.db.prepare('SELECT is_active FROM funds WHERE id=?').get(id)?.is_active ?? 1 : 1)
        : (fieldValues.is_active ? 1 : 0);
      const patch = { ...fieldValues, name, route_id: routeId, amount_paisa: amount, is_active: isActive };
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
    const payments = this.db.prepare(`SELECT t.*,f.name AS fund_name FROM fund_transactions t
      JOIN funds f ON f.id=t.fund_id
      WHERE t.bus_id=? ORDER BY t.date DESC,t.id DESC`).all(busId);
    return { bus, payments };
  }

  setBusStatus(user, busId, status) {
    this.requirePermission(user, 'manage_buses');
    const id = toInteger(busId, 'Bus');
    const nextStatus = String(status || '').trim();
    if (!['Active', 'Inactive'].includes(nextStatus)) throw new Error('Bus status must be Active or Inactive.');
    return this.db.transaction(() => {
      const old = this.db.prepare('SELECT * FROM buses WHERE id=?').get(id);
      if (!old) throw new Error('Bus not found.');
      this.db.prepare('UPDATE buses SET status=? WHERE id=?').run(nextStatus, id);
      const bus = this.db.prepare(`SELECT b.*,o.name AS owner_name,r.name AS route_name
        FROM buses b JOIN owners o ON o.id=b.owner_id LEFT JOIN routes r ON r.id=b.route_id WHERE b.id=?`).get(id);
      this.audit(user.id, 'update', 'buses', id, old, bus);
      return bus;
    }).immediate();
  }

  busImportContext() {
    const busesByKey = new Map();
    for (const bus of this.db.prepare('SELECT id,registration_number,owner_id FROM buses').all()) {
      const key = importKey(bus.registration_number);
      if (key && !busesByKey.has(key)) busesByKey.set(key, bus);
    }
    const existingBusNumbers = new Set(busesByKey.keys());
    const ownerById = new Map(this.db.prepare('SELECT id,name,mobile FROM owners').all().map((owner) => [owner.id, owner]));
    const ownerByMobile = new Map();
    for (const owner of ownerById.values()) {
      const mobile = importMobile(owner.mobile);
      if (mobile && !ownerByMobile.has(mobile)) ownerByMobile.set(mobile, owner);
    }
    return { existingBusNumbers, busesByKey, ownerById, ownerByMobile, seenBusNumbers: new Set(), seenMobiles: new Set() };
  }

  validateBusImportRow(cells, mapping, rowNumber, context, options = {}) {
    const raw = (key) => {
      const selected = mapping?.[key];
      if (selected === '' || selected === null || selected === undefined) return '';
      const index = Number(selected);
      if (!Number.isInteger(index) || index < 0 || index >= cells.length) return '';
      return cells[index];
    };
    const reasons = [];
    const missing = [];
    const ownerName = importText(raw('owner_name'));
    const busNumber = importText(raw('bus_number'));
    const fatherName = importText(raw('father_name'));
    const mobileText = importText(raw('mobile'));
    const mobile = importMobile(raw('mobile'));
    const address = importText(raw('address'));
    const statusInfo = importStatus(raw('status'));

    const required = [
      ['owner_name', ownerName, 'Bus owner name is required.'],
      ['bus_number', busNumber, 'Bus number is required.'],
      ['father_name', fatherName, "Father's name is required."],
      ['mobile', mobileText, 'Mobile number is required.']
    ];
    for (const [key, value, message] of required) {
      if (!value) {
        missing.push(key);
        reasons.push(message);
      }
    }
    if (mobileText && !mobile) reasons.push('Mobile number is invalid.');
    const values = {
      owner_name: ownerName, bus_number: busNumber, father_name: fatherName, mobile, address
    };
    for (const [key, value] of Object.entries(values)) {
      const limit = BUS_IMPORT_LIMITS[key];
      if (limit && value.length > limit) reasons.push(`${key.replaceAll('_', ' ')} is too long (maximum ${limit} characters).`);
    }
    if (statusInfo.error) reasons.push(statusInfo.error);

    const busKey = importKey(busNumber);
    let duplicate = false;
    let existsInDb = false;
    if (busKey) {
      if (context.existingBusNumbers.has(busKey)) {
        existsInDb = true;
        if (!options.updateExisting) {
          duplicate = true;
          reasons.push('Bus number already exists.');
        }
      } else if (context.seenBusNumbers.has(busKey)) {
        duplicate = true;
        reasons.push('Duplicate bus number in this file.');
      }
    }
    if (mobile && context.seenMobiles.has(mobile)) {
      duplicate = true;
      reasons.push('Duplicate mobile number in this file.');
    }

    const existingOwner = mobile ? context.ownerByMobile.get(mobile) : null;
    const result = duplicate ? 'duplicate' : reasons.length ? 'invalid' : existsInDb ? 'update' : 'valid';
    if (result === 'valid' || result === 'update') {
      if (busKey) context.seenBusNumbers.add(busKey);
      if (mobile) context.seenMobiles.add(mobile);
    }
    return {
      row: rowNumber,
      owner_name: ownerName,
      bus_number: busNumber,
      father_name: fatherName,
      mobile: mobile || mobileText,
      route_name: '',
      route_id: null,
      address,
      status: statusInfo.value || 'Active',
      existing_owner_name: existingOwner?.name || '',
      result,
      reasons,
      missing
    };
  }

  prepareBusOwnerImport(user, rows, mapping) {
    this.requirePermission(user, 'manage_owners');
    this.requirePermission(user, 'manage_buses');
    if (!Array.isArray(rows)) throw new Error('Import rows are missing.');
    if (rows.length > 25000) throw new Error('Only up to 25,000 rows can be imported at once.');
    const context = this.busImportContext();
    return rows.map((row) => this.validateBusImportRow(row?.cells || row, mapping, row?.rowNumber || 0, context));
  }

  previewBusOwnerImport(user, rows, mapping) {
    const preview = this.prepareBusOwnerImport(user, rows, mapping);
    return {
      totals: {
        total: preview.length,
        valid: preview.filter((row) => row.result === 'valid').length,
        duplicate: preview.filter((row) => row.result === 'duplicate').length,
        invalid: preview.filter((row) => row.result === 'invalid').length
      },
      rows: preview
    };
  }

  importBusOwners(user, rows, mapping) {
    const validated = this.prepareBusOwnerImport(user, rows, mapping);
    const issues = [];
    let imported = 0;
    let duplicates = 0;
    let failed = 0;
    if (!validated.some((row) => row.result === 'valid')) {
      for (const row of validated) {
        if (row.result === 'valid') continue;
        if (row.result === 'duplicate') duplicates += 1;
        else failed += 1;
        issues.push({
          row: row.row, owner_name: row.owner_name, bus_number: row.bus_number,
          father_name: row.father_name, mobile: row.mobile, address: row.address, status: row.status,
          result: row.result === 'duplicate' ? 'Duplicate' : 'Invalid',
          reason: row.reasons.join('; ')
        });
      }
      return { totals: { total: validated.length, imported, duplicates, failed }, issues };
    }
    const insertOwner = this.db.prepare(`INSERT INTO owners(owner_code,name,nominee_name,father_name,mobile,address,photo_path,join_date,status)
      VALUES (?,?,?,?,?,?,?,?,?)`);
    const insertBus = this.db.prepare(`INSERT INTO buses(registration_number,owner_id,route_id,driver_name,driver_mobile,helper_name,bus_type,status)
      VALUES (?,?,?,?,?,?,?,?)`);
    this.db.transaction(() => {
      const context = this.busImportContext();
      validated.forEach((row, index) => {
        if (row.result === 'duplicate') {
          duplicates += 1;
          issues.push({
            row: row.row, owner_name: row.owner_name, bus_number: row.bus_number,
            father_name: row.father_name, mobile: row.mobile, address: row.address, status: row.status,
            result: 'Duplicate', reason: row.reasons.join('; ')
          });
          return;
        }
        if (row.result === 'invalid') {
          failed += 1;
          issues.push({
            row: row.row, owner_name: row.owner_name, bus_number: row.bus_number,
            father_name: row.father_name, mobile: row.mobile, address: row.address, status: row.status,
            result: 'Invalid', reason: row.reasons.join('; ')
          });
          return;
        }
        const savepoint = `bus_import_${index}`;
        this.db.exec(`SAVEPOINT ${savepoint}`);
        let createdOwner = null;
        try {
          if (context.existingBusNumbers.has(importKey(row.bus_number))) {
            this.db.exec(`ROLLBACK TO ${savepoint}`);
            this.db.exec(`RELEASE ${savepoint}`);
            context.seenBusNumbers.add(importKey(row.bus_number));
            duplicates += 1;
            issues.push({
              row: row.row, owner_name: row.owner_name, bus_number: row.bus_number,
              father_name: row.father_name, mobile: row.mobile, address: row.address, status: row.status,
              result: 'Duplicate', reason: 'Bus number already exists.'
            });
            return;
          }
          let owner = context.ownerByMobile.get(row.mobile);
          if (!owner) {
            const ownerResult = insertOwner.run(
              this.nextCode('OWN'), row.owner_name, '', row.father_name,
              row.mobile, row.address, '', '', row.status
            );
            owner = { id: Number(ownerResult.lastInsertRowid), name: row.owner_name, mobile: row.mobile };
            createdOwner = owner;
          }
          const busResult = insertBus.run(
            row.bus_number, owner.id, null, '', '', '', '', row.status
          );
          if (createdOwner) {
            this.audit(user.id, 'create', 'owners', createdOwner.id, null, {
              name: row.owner_name, mobile: row.mobile
            });
          }
          this.audit(user.id, 'create', 'buses', busResult.lastInsertRowid, null, {
            registration_number: row.bus_number, owner_id: owner.id, route_id: row.route_id, status: row.status
          });
          this.db.exec(`RELEASE ${savepoint}`);
          if (createdOwner) context.ownerByMobile.set(createdOwner.mobile, createdOwner);
          context.existingBusNumbers.add(importKey(row.bus_number));
          imported += 1;
        } catch (error) {
          this.db.exec(`ROLLBACK TO ${savepoint}`);
          this.db.exec(`RELEASE ${savepoint}`);
          failed += 1;
          issues.push({
            row: row.row, owner_name: row.owner_name, bus_number: row.bus_number,
            father_name: row.father_name, mobile: row.mobile, address: row.address, status: row.status,
            result: 'Failed', reason: error.message || 'Could not save this row.'
          });
        }
      });
      this.audit(user.id, 'import', 'buses', null, null, {
        total: validated.length, imported, duplicates, failed
      });
    }).immediate();
    return {
      totals: { total: validated.length, imported, duplicates, failed },
      issues
    };
  }

  fundImportContext() {
    const existingFundNames = new Set(this.db.prepare('SELECT name FROM funds')
      .all().map((row) => importKey(row.name)).filter(Boolean));
    const routeByName = new Map();
    for (const route of this.db.prepare('SELECT id,name,route_number FROM routes').all()) {
      for (const key of [importKey(route.name), importKey(route.route_number)]) {
        if (key && !routeByName.has(key)) routeByName.set(key, route);
      }
    }
    return { existingFundNames, routeByName, seenNames: new Set() };
  }

  validateFundImportRow(cells, mapping, rowNumber, context) {
    const raw = (key) => importCell(cells, mapping, key);
    const reasons = [];
    const missing = [];
    const fundName = importText(raw('fund_name'));
    const routeText = importText(raw('route_name'));
    const tripText = importText(raw('per_trip_amount'));
    const openingText = importText(raw('opening_balance'));
    const tripAmount = importAmountPaisa(tripText);
    const openingBalance = importAmountPaisa(openingText);
    const statusInfo = importStatus(raw('status'));

    if (!fundName) { missing.push('fund_name'); reasons.push('Fund name is required.'); }
    if (!routeText) { missing.push('route_name'); reasons.push('Choose a route for this fund.'); }
    if (!tripText) { missing.push('per_trip_amount'); reasons.push('Per trip fund amount is required.'); }
    else if (tripAmount.error) reasons.push(tripAmount.error);
    else if (tripAmount.value <= 0) reasons.push('Amount must be greater than zero.');
    if (openingBalance.error) reasons.push(openingBalance.error);
    for (const [key, value] of Object.entries({ fund_name: fundName, route_name: routeText })) {
      const limit = FUND_IMPORT_LIMITS[key];
      if (limit && value.length > limit) reasons.push(`${key.replaceAll('_', ' ')} is too long (maximum ${limit} characters).`);
    }
    if (statusInfo.error) reasons.push(statusInfo.error);

    const route = routeText ? context.routeByName.get(importKey(routeText)) : null;
    if (routeText && !route) reasons.push(`Route not found: ${routeText}. Save the route first.`);

    const nameKey = importKey(fundName);
    let duplicate = false;
    if (nameKey) {
      if (context.existingFundNames.has(nameKey)) {
        duplicate = true;
        reasons.push('Fund name already exists.');
      } else if (context.seenNames.has(nameKey)) {
        duplicate = true;
        reasons.push('Duplicate fund name in this file.');
      }
    }

    const result = duplicate ? 'duplicate' : reasons.length ? 'invalid' : 'valid';
    if (result === 'valid' && nameKey) context.seenNames.add(nameKey);
    return {
      row: rowNumber,
      fund_name: fundName,
      route_name: route?.name || routeText,
      route_id: route?.id || null,
      per_trip_paisa: tripAmount.value || 0,
      opening_balance_paisa: openingBalance.value || 0,
      status: statusInfo.value || 'Active',
      result,
      reasons,
      missing
    };
  }

  prepareFundImport(user, rows, mapping) {
    this.requirePermission(user, 'manage_funds');
    if (!Array.isArray(rows)) throw new Error('Import rows are missing.');
    if (rows.length > 25000) throw new Error('Only up to 25,000 rows can be imported at once.');
    const context = this.fundImportContext();
    return rows.map((row) => this.validateFundImportRow(row?.cells || row, mapping, row?.rowNumber || 0, context));
  }

  previewFundImport(user, rows, mapping) {
    const preview = this.prepareFundImport(user, rows, mapping);
    return {
      totals: {
        total: preview.length,
        valid: preview.filter((row) => row.result === 'valid').length,
        duplicate: preview.filter((row) => row.result === 'duplicate').length,
        invalid: preview.filter((row) => row.result === 'invalid').length
      },
      rows: preview
    };
  }

  importFunds(user, rows, mapping) {
    const validated = this.prepareFundImport(user, rows, mapping);
    const issues = [];
    let imported = 0;
    let duplicates = 0;
    let failed = 0;
    const issueRow = (row, result, reason) => ({
      row: row.row, fund_name: row.fund_name, route_name: row.route_name,
      per_trip_paisa: row.per_trip_paisa, opening_balance_paisa: row.opening_balance_paisa,
      status: row.status, result, reason
    });
    const insertFund = this.db.prepare(`INSERT INTO funds(name,route_id,amount_paisa,is_active,opening_balance_paisa)
      VALUES (?,?,?,?,?)`);
    this.db.transaction(() => {
      const context = this.fundImportContext();
      validated.forEach((row, index) => {
        if (row.result === 'duplicate') {
          duplicates += 1;
          issues.push(issueRow(row, 'Duplicate', row.reasons.join('; ')));
          return;
        }
        if (row.result === 'invalid') {
          failed += 1;
          issues.push(issueRow(row, 'Invalid', row.reasons.join('; ')));
          return;
        }
        const savepoint = `fund_import_${index}`;
        this.db.exec(`SAVEPOINT ${savepoint}`);
        try {
          if (context.existingFundNames.has(importKey(row.fund_name))) {
            this.db.exec(`ROLLBACK TO ${savepoint}`);
            this.db.exec(`RELEASE ${savepoint}`);
            duplicates += 1;
            issues.push(issueRow(row, 'Duplicate', 'Fund name already exists.'));
            return;
          }
          const isActive = row.status === 'Active' ? 1 : 0;
          const inserted = insertFund.run(row.fund_name, row.route_id, row.per_trip_paisa, isActive, row.opening_balance_paisa);
          this.audit(user.id, 'create', 'funds', inserted.lastInsertRowid, null, {
            name: row.fund_name, route_id: row.route_id, amount_paisa: row.per_trip_paisa,
            opening_balance_paisa: row.opening_balance_paisa, is_active: isActive
          });
          this.db.exec(`RELEASE ${savepoint}`);
          context.existingFundNames.add(importKey(row.fund_name));
          imported += 1;
        } catch (error) {
          this.db.exec(`ROLLBACK TO ${savepoint}`);
          this.db.exec(`RELEASE ${savepoint}`);
          failed += 1;
          issues.push(issueRow(row, 'Failed', error.message || 'Could not save this row.'));
        }
      });
      this.audit(user.id, 'import', 'funds', null, null, {
        total: validated.length, imported, duplicates, failed
      });
    }).immediate();
    return {
      totals: { total: validated.length, imported, duplicates, failed },
      issues
    };
  }

  routeAccount(user, routeId) {
    const route = this.db.prepare('SELECT * FROM routes WHERE id=?').get(routeId);
    if (!route) throw new Error('Route not found.');
    const buses = this.db.prepare(`SELECT b.*,o.name AS owner_name FROM buses b
      JOIN owners o ON o.id=b.owner_id WHERE b.route_id=? ORDER BY b.registration_number`).all(routeId);
    const funds = this.db.prepare(`SELECT id,name,amount_paisa,is_active FROM funds
      WHERE route_id=? ORDER BY name`).all(routeId);
    return { route, buses, funds };
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
        this.assertCashInCoversCashOut(total - old.amount_paisa + amount);
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
        this.assertCashInCoversCashOut(total - old.amount_paisa);
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
    const legacyCashIn = this.db.prepare("SELECT COALESCE(SUM(amount_paisa),0) AS total FROM fund_transactions WHERE transaction_type='income'").get().total;
    const routeCashIn = this.db.prepare(`SELECT
      COALESCE(SUM(CASE WHEN cash_in_type='Regular' THEN total_amount_paisa ELSE 0 END),0) AS regular,
      COALESCE(SUM(CASE WHEN cash_in_type='Holiday' THEN total_amount_paisa ELSE 0 END),0) AS holiday
      FROM route_cash_ins`).get();
    const regularCashIn = legacyCashIn + routeCashIn.regular;
    const holidayCashIn = routeCashIn.holiday;
    const cashOut = this.db.prepare('SELECT COALESCE(SUM(amount_paisa),0) AS total FROM cash_outs').get().total;
    const cashIn = regularCashIn + holidayCashIn;
    return {
      regular_cash_in_paisa: regularCashIn,
      holiday_cash_in_paisa: holidayCashIn,
      cash_in_paisa: cashIn,
      cash_out_paisa: cashOut,
      available_paisa: cashIn - cashOut
    };
  }

  assertCashInCoversCashOut(cashIn) {
    const cashOut = this.db.prepare('SELECT COALESCE(SUM(amount_paisa),0) AS total FROM cash_outs').get().total;
    if (cashIn < cashOut) throw new Error('This change would make available Cash In lower than the amount already paid out.');
  }

  cashbook(user) {
    const totals = this.cashbookTotals();
    const cashIns = this.db.prepare(`SELECT c.id,c.route_id,c.route_name,c.cash_in_type,c.per_trip_paisa,c.total_trips,
      c.total_amount_paisa,c.date,c.created_at,'route' AS source
      FROM route_cash_ins c ORDER BY c.date DESC,c.id DESC`).all();
    const legacyIncome = this.db.prepare(`SELECT t.id,t.date,t.category,t.amount_paisa,
      COALESCE(r.name, 'Legacy income') AS route_name
      FROM fund_transactions t LEFT JOIN receipts receipt ON receipt.fund_transaction_id=t.id
      LEFT JOIN routes r ON r.id=receipt.route_id
      WHERE t.transaction_type='income' ORDER BY t.date DESC,t.id DESC`).all()
      .map((item) => ({
        id: `legacy-${item.id}`, route_id: null, route_name: item.route_name === 'Legacy income'
          ? `${item.route_name} · ${item.category}` : item.route_name,
        cash_in_type: 'Regular',
        per_trip_paisa: null, total_trips: null, total_amount_paisa: item.amount_paisa,
        date: item.date, source: 'legacy', editable: false
      }));
    const income = [...cashIns, ...legacyIncome].sort((a, b) => {
      const byDate = b.date.localeCompare(a.date);
      if (byDate) return byDate;
      const idA = Number(String(a.id).replace(/^legacy-/, ''));
      const idB = Number(String(b.id).replace(/^legacy-/, ''));
      return idB - idA;
    });
    const cashOuts = this.db.prepare(`SELECT id,route_id,route_name,fund_id,fund_name,per_trip_paisa,
      total_trips,amount_paisa,date,legacy_distribution_id,request_key,batch_key,created_at
      FROM cash_outs ORDER BY date DESC,id DESC`).all()
      .map((item) => ({ ...item, source: item.legacy_distribution_id ? 'legacy' : 'route' }));
    const funds = this.db.prepare(`SELECT f.id,f.name,f.route_id,r.name AS route_name,f.amount_paisa,
      f.opening_balance_paisa
        + COALESCE((SELECT SUM(d.amount_paisa) FROM cash_outs d WHERE d.fund_id=f.id),0)
        + COALESCE((SELECT SUM(CASE WHEN t.transaction_type='income' THEN t.amount_paisa ELSE -t.amount_paisa END)
          FROM fund_transactions t WHERE t.fund_id=f.id),0)
        + COALESCE((SELECT SUM(ft.amount_paisa) FROM fund_transfers ft WHERE ft.to_fund_id=f.id),0)
        - COALESCE((SELECT SUM(ft.amount_paisa) FROM fund_transfers ft WHERE ft.from_fund_id=f.id),0)
        - COALESCE((SELECT SUM(bd.amount_paisa) FROM bank_deposits bd WHERE bd.fund_id=f.id),0) AS balance_paisa,
      COALESCE((SELECT SUM(d.amount_paisa) FROM cash_outs d WHERE d.fund_id=f.id),0) AS cash_out_paisa
      FROM funds f LEFT JOIN routes r ON r.id=f.route_id WHERE f.is_active=1 ORDER BY f.name`).all();
    const routes = this.db.prepare(`SELECT id,name,charge_paisa FROM routes
      WHERE status='Active' AND charge_paisa > 0 ORDER BY name`).all();
    return { totals, income, cashOuts, funds, routes };
  }

  cashInValues(data) {
    this.requirePermission(data.user, 'manage_cashbook');
    const routeId = toInteger(data.route_id, 'route_id');
    const trips = toInteger(data.total_trips, 'totalTrips');
    if (trips <= 0) throw new Error('Total trips must be greater than zero.');
    const cashInType = String(data.cash_in_type || 'Regular');
    if (!['Regular', 'Holiday'].includes(cashInType)) throw new Error('Cash In type must be Regular or Holiday.');
    const date = String(data.date || localDateString());
    if (!validDateString(date)) throw new Error('Enter a valid transaction date.');
    const route = this.db.prepare(`SELECT id,name,charge_paisa FROM routes WHERE id=? AND status='Active'`).get(routeId);
    if (!route || route.charge_paisa <= 0) throw new Error('Choose an active route with a valid per-trip amount.');
    const total = route.charge_paisa * trips;
    if (!Number.isSafeInteger(total) || total <= 0) throw new Error('Calculated total amount is outside the supported range.');
    return {
      route_id: route.id, route_name: route.name, cash_in_type: cashInType, date,
      per_trip_paisa: route.charge_paisa, total_trips: trips, total_amount_paisa: total
    };
  }

  createCashIn(user, data) {
    this.requirePermission(user, 'manage_cashbook');
    const routeId = toInteger(data.route_id, 'route_id');
    const trips = toInteger(data.total_trips, 'totalTrips');
    const requestKey = String(data.request_key || '').trim();
    if (!requestKey || requestKey.length > 100) throw new Error('A valid Cash In request key is required.');
    return this.db.transaction(() => {
      const existing = this.db.prepare('SELECT * FROM route_cash_ins WHERE request_key=?').get(requestKey);
      if (existing) {
        const values = this.cashInValues({ ...data, user });
        const sameRequest = existing.route_id === routeId && existing.total_trips === trips
          && existing.cash_in_type === values.cash_in_type && existing.date === values.date;
        if (!sameRequest) throw new Error('This Cash In request key was already used for a different entry.');
        return { cashIn: existing, duplicate: true, totals: this.cashbookTotals() };
      }
      const values = this.cashInValues({ ...data, user });
      const result = this.db.prepare(`INSERT INTO route_cash_ins(route_id,route_name,cash_in_type,per_trip_paisa,total_trips,total_amount_paisa,date,request_key,created_by)
        VALUES (?,?,?,?,?,?,?,?,?)`).run(values.route_id, values.route_name, values.cash_in_type, values.per_trip_paisa,
        values.total_trips, values.total_amount_paisa, values.date, requestKey, user.id);
      const cashIn = this.db.prepare('SELECT * FROM route_cash_ins WHERE id=?').get(result.lastInsertRowid);
      this.audit(user.id, 'create', 'cash_in', cashIn.id, null, cashIn);
      return { cashIn, duplicate: false, totals: this.cashbookTotals() };
    }).immediate();
  }

  updateCashIn(user, data) {
    if (user.role !== 'admin') throw new Error('Only an administrator can edit a Cash In entry.');
    const id = toInteger(data.id, 'Cash In entry');
    return this.db.transaction(() => {
      const old = this.db.prepare('SELECT * FROM route_cash_ins WHERE id=?').get(id);
      if (!old) throw new Error('Cash In entry not found.');
      const values = this.cashInValues({
        ...data,
        cash_in_type: data.cash_in_type ?? old.cash_in_type,
        date: data.date ?? old.date,
        user
      });
      const nextCashIn = this.db.prepare('SELECT COALESCE(SUM(total_amount_paisa),0) AS total FROM route_cash_ins WHERE id<>?').get(id).total
        + values.total_amount_paisa;
      const legacyCashIn = this.db.prepare("SELECT COALESCE(SUM(amount_paisa),0) AS total FROM fund_transactions WHERE transaction_type='income'").get().total;
      this.assertCashInCoversCashOut(nextCashIn + legacyCashIn);
      this.db.prepare(`UPDATE route_cash_ins SET route_id=?,route_name=?,cash_in_type=?,per_trip_paisa=?,total_trips=?,total_amount_paisa=?,date=? WHERE id=?`)
        .run(values.route_id, values.route_name, values.cash_in_type, values.per_trip_paisa, values.total_trips,
          values.total_amount_paisa, values.date, id);
      const cashIn = this.db.prepare('SELECT * FROM route_cash_ins WHERE id=?').get(id);
      this.audit(user.id, 'correct', 'cash_in', id, old, cashIn);
      return { cashIn, totals: this.cashbookTotals() };
    }).immediate();
  }

  deleteCashIn(user, id) {
    if (user.role !== 'admin') throw new Error('Only an administrator can delete a Cash In entry.');
    const entryId = toInteger(id, 'Cash In entry');
    return this.db.transaction(() => {
      const old = this.db.prepare('SELECT * FROM route_cash_ins WHERE id=?').get(entryId);
      if (!old) throw new Error('Cash In entry not found.');
      const remaining = this.db.prepare('SELECT COALESCE(SUM(total_amount_paisa),0) AS total FROM route_cash_ins WHERE id<>?').get(entryId).total;
      const legacyCashIn = this.db.prepare("SELECT COALESCE(SUM(amount_paisa),0) AS total FROM fund_transactions WHERE transaction_type='income'").get().total;
      this.assertCashInCoversCashOut(remaining + legacyCashIn);
      this.db.prepare('DELETE FROM route_cash_ins WHERE id=?').run(entryId);
      this.audit(user.id, 'delete', 'cash_in', entryId, old, null);
      return this.cashbookTotals();
    }).immediate();
  }

  cashOutValues(data) {
    this.requirePermission(data.user, 'manage_cashbook');
    const routeId = toInteger(data.route_id, 'route_id');
    const fundId = toInteger(data.fund_id, 'Fund');
    const trips = toInteger(data.total_trips, 'totalTrips');
    if (trips <= 0) throw new Error('Total trips must be greater than zero.');
    const date = String(data.date || localDateString());
    if (!validDateString(date)) throw new Error('Enter a valid transaction date.');
    const route = this.db.prepare(`SELECT id,name FROM routes WHERE id=? AND status='Active'`).get(routeId);
    if (!route) throw new Error('Choose an active route.');
    const fund = this.db.prepare('SELECT id,name,route_id,amount_paisa FROM funds WHERE id=? AND is_active=1').get(fundId);
    if (!fund) throw new Error('Choose an active fund.');
    if (fund.route_id !== routeId) throw new Error('The selected fund is not assigned to this route.');
    if (!fund.amount_paisa || fund.amount_paisa <= 0) throw new Error('The selected fund does not have a valid per-trip amount.');
    const total = fund.amount_paisa * trips;
    if (!Number.isSafeInteger(total) || total <= 0) throw new Error('Calculated total amount is outside the supported range.');
    return {
      route_id: route.id, route_name: route.name, fund_id: fund.id, fund_name: fund.name,
      per_trip_paisa: fund.amount_paisa, total_trips: trips, amount_paisa: total, date
    };
  }

  cashOutBatchValues(data) {
    this.requirePermission(data.user, 'manage_cashbook');
    const routeId = toInteger(data.route_id, 'route_id');
    const trips = toInteger(data.total_trips, 'totalTrips');
    if (trips <= 0) throw new Error('Total trips must be greater than zero.');
    const date = String(data.date || localDateString());
    if (!validDateString(date)) throw new Error('Enter a valid transaction date.');
    const route = this.db.prepare(`SELECT id,name FROM routes WHERE id=? AND status='Active'`).get(routeId);
    if (!route) throw new Error('Choose an active route.');
    const assigned = this.db.prepare(`SELECT id,name,amount_paisa FROM funds
      WHERE route_id=? AND is_active=1 AND amount_paisa > 0 ORDER BY name`).all(routeId);
    if (!assigned.length) throw new Error('This route has no assigned funds. Add funds in Fund Management first.');
    let funds = assigned;
    if (Array.isArray(data.fund_ids)) {
      const requested = [...new Set(data.fund_ids.map((id) => toInteger(id, 'Fund')))];
      if (!requested.length) throw new Error('Select at least one assigned fund.');
      funds = assigned.filter((fund) => requested.includes(fund.id));
      if (funds.length !== requested.length) throw new Error('Choose only funds assigned to this route.');
    }
    let grandTotal = 0;
    const entries = funds.map((fund) => {
      const amount = fund.amount_paisa * trips;
      if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('Calculated total amount is outside the supported range.');
      grandTotal += amount;
      if (!Number.isSafeInteger(grandTotal)) throw new Error('Calculated total amount is outside the supported range.');
      return {
        route_id: route.id, route_name: route.name, fund_id: fund.id, fund_name: fund.name,
        per_trip_paisa: fund.amount_paisa, total_trips: trips, amount_paisa: amount, date
      };
    });
    return { route_id: route.id, total_trips: trips, date, funds: entries, grand_total_paisa: grandTotal };
  }

  createCashOut(user, data) {
    this.requirePermission(user, 'manage_cashbook');
    const routeId = toInteger(data.route_id, 'route_id');
    const fundId = toInteger(data.fund_id, 'Fund');
    const trips = toInteger(data.total_trips, 'totalTrips');
    const requestKey = String(data.request_key || '').trim();
    if (!requestKey || requestKey.length > 100) throw new Error('A valid Cash Out request key is required.');
    return this.db.transaction(() => {
      const existing = this.db.prepare('SELECT * FROM cash_outs WHERE request_key=?').get(requestKey);
      if (existing) {
        const values = this.cashOutValues({ ...data, user });
        const sameRequest = existing.route_id === routeId && existing.fund_id === fundId
          && existing.total_trips === trips && existing.date === values.date;
        if (!sameRequest) throw new Error('This Cash Out request key was already used for a different entry.');
        return { cashOut: existing, duplicate: true, totals: this.cashbookTotals() };
      }
      const values = this.cashOutValues({ ...data, user });
      const totals = this.cashbookTotals();
      if (values.amount_paisa > totals.available_paisa) throw new Error('Cash Out cannot exceed the available cash balance.');
      const inserted = this.db.prepare(`INSERT INTO cash_outs(route_id,route_name,fund_id,fund_name,per_trip_paisa,total_trips,amount_paisa,date,request_key,created_by)
        VALUES (?,?,?,?,?,?,?,?,?,?)`).run(values.route_id, values.route_name, values.fund_id, values.fund_name,
        values.per_trip_paisa, values.total_trips, values.amount_paisa, values.date, requestKey, user.id);
      const cashOut = this.db.prepare('SELECT * FROM cash_outs WHERE id=?').get(inserted.lastInsertRowid);
      this.audit(user.id, 'create', 'cash_out', cashOut.id, null, cashOut);
      return { cashOut, duplicate: false, totals: this.cashbookTotals() };
    }).immediate();
  }

  createCashOutBatch(user, data) {
    this.requirePermission(user, 'manage_cashbook');
    const batchKey = String(data.request_key || '').trim();
    if (!batchKey || batchKey.length > 80) throw new Error('A valid Cash Out request key is required.');
    return this.db.transaction(() => {
      const values = this.cashOutBatchValues({ ...data, user });
      const existing = this.db.prepare('SELECT * FROM cash_outs WHERE batch_key=? ORDER BY id').all(batchKey);
      if (existing.length) {
        const sameTotal = existing.length === values.funds.length
          && existing.every((row) => row.route_id === values.route_id && row.total_trips === values.total_trips
            && row.date === values.date);
        const oldFunds = existing.map((row) => row.fund_id).sort((a, b) => a - b).join(',');
        const newFunds = values.funds.map((row) => row.fund_id).sort((a, b) => a - b).join(',');
        if (!sameTotal || oldFunds !== newFunds) throw new Error('This Cash Out request key was already used for a different entry.');
        return { cashOuts: existing, batchKey, duplicate: true, totals: this.cashbookTotals() };
      }
      const totals = this.cashbookTotals();
      if (values.grand_total_paisa > totals.available_paisa) throw new Error('Cash Out cannot exceed the available cash balance.');
      const insert = this.db.prepare(`INSERT INTO cash_outs(route_id,route_name,fund_id,fund_name,per_trip_paisa,total_trips,amount_paisa,date,request_key,batch_key,created_by)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
      const ids = values.funds.map((fund) => insert.run(fund.route_id, fund.route_name, fund.fund_id, fund.fund_name,
        fund.per_trip_paisa, fund.total_trips, fund.amount_paisa, values.date, `${batchKey}:${fund.fund_id}`, batchKey, user.id).lastInsertRowid);
      const cashOuts = ids.map((id) => this.db.prepare('SELECT * FROM cash_outs WHERE id=?').get(id));
      this.audit(user.id, 'create', 'cash_out_batch', batchKey, null, cashOuts);
      return { cashOuts, batchKey, duplicate: false, totals: this.cashbookTotals() };
    }).immediate();
  }

  updateCashOut(user, data) {
    if (user.role !== 'admin') throw new Error('Only an administrator can edit a Cash Out entry.');
    const id = toInteger(data.id, 'Cash Out entry');
    return this.db.transaction(() => {
      const old = this.db.prepare('SELECT * FROM cash_outs WHERE id=?').get(id);
      if (!old) throw new Error('Cash Out entry not found.');
      if (old.legacy_distribution_id) throw new Error('Legacy Cash Out entries cannot be edited.');
      if (old.batch_key) throw new Error('This Cash Out entry belongs to a multi-fund batch. Edit the batch instead.');
      const values = this.cashOutValues({ ...data, date: data.date ?? old.date, user });
      const nextCashOut = this.db.prepare('SELECT COALESCE(SUM(amount_paisa),0) AS total FROM cash_outs WHERE id<>?').get(id).total
        + values.amount_paisa;
      const cashIn = this.cashbookTotals().cash_in_paisa;
      if (nextCashOut > cashIn) throw new Error('This change would make available Cash In lower than the amount already paid out.');
      this.db.prepare(`UPDATE cash_outs SET route_id=?,route_name=?,fund_id=?,fund_name=?,per_trip_paisa=?,total_trips=?,amount_paisa=?,date=? WHERE id=?`)
        .run(values.route_id, values.route_name, values.fund_id, values.fund_name, values.per_trip_paisa,
        values.total_trips, values.amount_paisa, values.date, id);
      const cashOut = this.db.prepare('SELECT * FROM cash_outs WHERE id=?').get(id);
      this.audit(user.id, 'correct', 'cash_out', id, old, cashOut);
      return { cashOut, totals: this.cashbookTotals() };
    }).immediate();
  }

  updateCashOutBatch(user, data) {
    if (user.role !== 'admin') throw new Error('Only an administrator can edit a Cash Out entry.');
    const id = toInteger(data.id, 'Cash Out entry');
    return this.db.transaction(() => {
      const anchor = this.db.prepare('SELECT * FROM cash_outs WHERE id=?').get(id);
      if (!anchor) throw new Error('Cash Out entry not found.');
      if (anchor.legacy_distribution_id) throw new Error('Legacy Cash Out entries cannot be edited.');
      if (!anchor.batch_key) throw new Error('This Cash Out entry is not part of a multi-fund batch.');
      const batchKey = anchor.batch_key;
      const values = this.cashOutBatchValues({ ...data, date: data.date ?? anchor.date, user });
      const oldRows = this.db.prepare('SELECT * FROM cash_outs WHERE batch_key=? ORDER BY id').all(batchKey);
      const otherCashOut = this.db.prepare(`SELECT COALESCE(SUM(amount_paisa),0) AS total FROM cash_outs
        WHERE batch_key IS NULL OR batch_key<>?`).get(batchKey).total;
      const cashIn = this.cashbookTotals().cash_in_paisa;
      if (otherCashOut + values.grand_total_paisa > cashIn) {
        throw new Error('This change would make available Cash In lower than the amount already paid out.');
      }
      this.db.prepare('DELETE FROM cash_outs WHERE batch_key=?').run(batchKey);
      const insert = this.db.prepare(`INSERT INTO cash_outs(route_id,route_name,fund_id,fund_name,per_trip_paisa,total_trips,amount_paisa,date,request_key,batch_key,created_by)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
      const ids = values.funds.map((fund) => insert.run(fund.route_id, fund.route_name, fund.fund_id, fund.fund_name,
        fund.per_trip_paisa, fund.total_trips, fund.amount_paisa, values.date,
        `${batchKey}:${fund.fund_id}`, batchKey, anchor.created_by).lastInsertRowid);
      const cashOuts = ids.map((rowId) => this.db.prepare('SELECT * FROM cash_outs WHERE id=?').get(rowId));
      this.audit(user.id, 'correct', 'cash_out_batch', batchKey, oldRows, cashOuts);
      return { cashOuts, batchKey, totals: this.cashbookTotals() };
    }).immediate();
  }

  deleteCashOut(user, id) {
    if (user.role !== 'admin') throw new Error('Only an administrator can delete a Cash Out entry.');
    const entryId = toInteger(id, 'Cash Out entry');
    return this.db.transaction(() => {
      const old = this.db.prepare('SELECT * FROM cash_outs WHERE id=?').get(entryId);
      if (!old) throw new Error('Cash Out entry not found.');
      if (old.legacy_distribution_id) throw new Error('Legacy Cash Out entries cannot be deleted.');
      if (old.batch_key) {
        const rows = this.db.prepare('SELECT * FROM cash_outs WHERE batch_key=? ORDER BY id').all(old.batch_key);
        this.db.prepare('DELETE FROM cash_outs WHERE batch_key=?').run(old.batch_key);
        this.audit(user.id, 'delete', 'cash_out_batch', old.batch_key, rows, null);
        return this.cashbookTotals();
      }
      this.db.prepare('DELETE FROM cash_outs WHERE id=?').run(entryId);
      this.audit(user.id, 'delete', 'cash_out', entryId, old, null);
      return this.cashbookTotals();
    }).immediate();
  }

  clearCashIns(user) {
    if (user.role !== 'admin') throw new Error('Only an administrator can clear Cash In entries.');
    return this.db.transaction(() => {
      const cashOut = this.db.prepare('SELECT COALESCE(SUM(amount_paisa),0) AS total FROM cash_outs').get().total;
      if (cashOut > 0) throw new Error('Delete all Cash Out entries before clearing Cash In.');
      const routeCount = this.db.prepare('SELECT COUNT(*) AS count FROM route_cash_ins').get().count;
      const legacyCount = this.db.prepare("SELECT COUNT(*) AS count FROM fund_transactions WHERE transaction_type='income'").get().count;
      this.db.prepare(`DELETE FROM receipts WHERE fund_transaction_id IN
        (SELECT id FROM fund_transactions WHERE transaction_type='income')`).run();
      this.db.prepare("DELETE FROM fund_transactions WHERE transaction_type='income'").run();
      this.db.prepare('DELETE FROM route_cash_ins').run();
      this.audit(user.id, 'delete', 'cash_in', null, { route_cash_ins: routeCount, legacy_income: legacyCount }, null);
      return this.cashbookTotals();
    }).immediate();
  }

  clearCashOuts(user) {
    if (user.role !== 'admin') throw new Error('Only an administrator can clear Cash Out entries.');
    return this.db.transaction(() => {
      const count = this.db.prepare('SELECT COUNT(*) AS count FROM cash_outs').get().count;
      const legacyCount = this.db.prepare('SELECT COUNT(*) AS count FROM fund_distributions').get().count;
      this.db.prepare('DELETE FROM fund_distributions').run();
      this.db.prepare('DELETE FROM cash_outs').run();
      this.audit(user.id, 'delete', 'cash_out', null, { cash_outs: count, legacy_distributions: legacyCount }, null);
      return this.cashbookTotals();
    }).immediate();
  }

  fundAvailablePaisa(fundId, excludeDepositId = null) {
    const fund = this.db.prepare('SELECT id FROM funds WHERE id=? AND is_active=1').get(fundId);
    if (!fund) throw new Error('Choose an active fund.');
    return this.db.prepare(`SELECT f.opening_balance_paisa
      + COALESCE((SELECT SUM(c.amount_paisa) FROM cash_outs c WHERE c.fund_id=f.id),0)
      + COALESCE((SELECT SUM(CASE WHEN t.transaction_type='income' THEN t.amount_paisa ELSE -t.amount_paisa END)
        FROM fund_transactions t WHERE t.fund_id=f.id),0)
      + COALESCE((SELECT SUM(ft.amount_paisa) FROM fund_transfers ft WHERE ft.to_fund_id=f.id),0)
      - COALESCE((SELECT SUM(ft.amount_paisa) FROM fund_transfers ft WHERE ft.from_fund_id=f.id),0)
      - COALESCE((SELECT SUM(bd.amount_paisa) FROM bank_deposits bd
        WHERE bd.fund_id=f.id AND (? IS NULL OR bd.id<>?)),0) AS balance_paisa
      FROM funds f WHERE f.id=?`).get(excludeDepositId, excludeDepositId, fundId).balance_paisa;
  }

  bankBalance(bankId) {
    const bank = this.db.prepare(`SELECT b.opening_balance_paisa
      + COALESCE((SELECT SUM(d.amount_paisa) FROM bank_deposits d WHERE d.bank_id=b.id),0) AS balance_paisa
      FROM banks b WHERE b.id=?`).get(bankId);
    if (!bank) throw new Error('Bank not found.');
    return bank.balance_paisa;
  }

  bankOverview(user, filters = {}) {
    this.requirePermission(user, 'manage_banks');
    return this.bankReportData(filters);
  }

  bankReportData(filters = {}) {
    filters = filters || {};
    const from = validDateString(filters.from) ? filters.from : null;
    const to = validDateString(filters.to) ? filters.to : null;
    const bankId = filters.bank_id === undefined || filters.bank_id === null || filters.bank_id === ''
      ? null : toInteger(filters.bank_id, 'Bank');
    const banks = this.db.prepare(`SELECT b.*,
      COALESCE((SELECT SUM(d.amount_paisa) FROM bank_deposits d WHERE d.bank_id=b.id),0) AS deposit_paisa,
      b.opening_balance_paisa + COALESCE((SELECT SUM(d.amount_paisa) FROM bank_deposits d WHERE d.bank_id=b.id),0) AS balance_paisa,
      (SELECT COUNT(*) FROM bank_deposits d WHERE d.bank_id=b.id) AS deposit_count
      FROM banks b ORDER BY b.name COLLATE NOCASE,b.id`).all();
    const funds = this.db.prepare(`SELECT f.id,f.name,f.route_id,r.name AS route_name,
      f.opening_balance_paisa
        + COALESCE((SELECT SUM(c.amount_paisa) FROM cash_outs c WHERE c.fund_id=f.id),0)
        + COALESCE((SELECT SUM(CASE WHEN t.transaction_type='income' THEN t.amount_paisa ELSE -t.amount_paisa END)
          FROM fund_transactions t WHERE t.fund_id=f.id),0)
        + COALESCE((SELECT SUM(ft.amount_paisa) FROM fund_transfers ft WHERE ft.to_fund_id=f.id),0)
        - COALESCE((SELECT SUM(ft.amount_paisa) FROM fund_transfers ft WHERE ft.from_fund_id=f.id),0)
        - COALESCE((SELECT SUM(bd.amount_paisa) FROM bank_deposits bd WHERE bd.fund_id=f.id),0) AS balance_paisa
      FROM funds f LEFT JOIN routes r ON r.id=f.route_id WHERE f.is_active=1 ORDER BY balance_paisa DESC,f.name`).all();
    const where = [];
    const values = [];
    if (from) { where.push('d.date>=?'); values.push(from); }
    if (to) { where.push('d.date<=?'); values.push(to); }
    if (bankId) { where.push('d.bank_id=?'); values.push(bankId); }
    const deposits = this.db.prepare(`SELECT d.id,d.date,d.bank_id,d.fund_id,d.amount_paisa,d.transaction_id,d.note,
      d.created_at,d.updated_at,b.name AS bank_name,b.branch_name,b.account_number,f.name AS fund_name
      FROM bank_deposits d JOIN banks b ON b.id=d.bank_id JOIN funds f ON f.id=d.fund_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY d.date DESC,d.id DESC`).all(...values);
    const fundWise = this.db.prepare(`SELECT f.name AS fund_name,b.name AS bank_name,
      b.account_number,SUM(d.amount_paisa) AS total_paisa,COUNT(*) AS deposit_count
      FROM bank_deposits d JOIN funds f ON f.id=d.fund_id JOIN banks b ON b.id=d.bank_id
      GROUP BY d.fund_id,d.bank_id ORDER BY f.name COLLATE NOCASE,b.name COLLATE NOCASE`).all();
    return {
      banks,
      funds,
      deposits,
      totals: {
        bank_count: banks.length,
        total_bank_balance_paisa: banks.reduce((total, bank) => total + bank.balance_paisa, 0),
        total_deposit_paisa: banks.reduce((total, bank) => total + bank.deposit_paisa, 0),
        filtered_deposit_paisa: deposits.reduce((total, deposit) => total + deposit.amount_paisa, 0)
      },
      report: {
        banks: banks.map((bank) => ({
          id: bank.id, name: bank.name, branch_name: bank.branch_name,
          account_number: bank.account_number, account_type: bank.account_type,
          opening_balance_paisa: bank.opening_balance_paisa,
          total_deposit_paisa: bank.deposit_paisa, total_withdrawal_paisa: 0,
          balance_paisa: bank.balance_paisa, deposit_count: bank.deposit_count
        })),
        fundWise
      }
    };
  }

  saveBank(user, data) {
    this.requirePermission(user, 'manage_banks');
    data = data || {};
    const id = data.id === undefined || data.id === null || data.id === '' ? null : toInteger(data.id, 'Bank');
    const name = String(data.name || '').trim().slice(0, 120);
    const branch = String(data.branch_name || '').trim().slice(0, 120);
    const holder = String(data.account_holder || '').trim().slice(0, 120);
    const accountNumber = String(data.account_number || '').trim().slice(0, 60);
    const accountType = String(data.account_type || '').trim().slice(0, 40) || 'Current';
    const routing = String(data.routing_number || '').trim().slice(0, 40);
    const opening = data.opening_balance_paisa === undefined || data.opening_balance_paisa === ''
      ? 0 : Number(data.opening_balance_paisa);
    if (!name) throw new Error('Bank name is required.');
    if (!accountNumber) throw new Error('Account number is required.');
    if (!Number.isSafeInteger(opening) || opening < 0) throw new Error('Opening balance must be zero or greater.');
    return this.db.transaction(() => {
      const clash = this.db.prepare('SELECT id FROM banks WHERE account_number=? AND id<>?')
        .get(accountNumber, id || 0);
      if (clash) throw new Error('This account number is already registered.');
      if (id) {
        const old = this.db.prepare('SELECT * FROM banks WHERE id=?').get(id);
        if (!old) throw new Error('Bank not found.');
        this.db.prepare(`UPDATE banks SET name=?,branch_name=?,account_holder=?,account_number=?,account_type=?,
          routing_number=?,opening_balance_paisa=? WHERE id=?`)
          .run(name, branch, holder, accountNumber, accountType, routing, opening, id);
        const bank = this.db.prepare('SELECT * FROM banks WHERE id=?').get(id);
        this.audit(user.id, 'update', 'bank', id, old, bank);
        return bank;
      }
      const result = this.db.prepare(`INSERT INTO banks(name,branch_name,account_holder,account_number,account_type,routing_number,opening_balance_paisa)
        VALUES (?,?,?,?,?,?,?)`).run(name, branch, holder, accountNumber, accountType, routing, opening);
      const bank = this.db.prepare('SELECT * FROM banks WHERE id=?').get(result.lastInsertRowid);
      this.audit(user.id, 'create', 'bank', bank.id, null, bank);
      return bank;
    }).immediate();
  }

  deleteBank(user, id) {
    this.requirePermission(user, 'delete_banks');
    const bankId = toInteger(id, 'Bank');
    return this.db.transaction(() => {
      const bank = this.db.prepare('SELECT * FROM banks WHERE id=?').get(bankId);
      if (!bank) throw new Error('Bank not found.');
      const count = this.db.prepare('SELECT COUNT(*) AS count FROM bank_deposits WHERE bank_id=?').get(bankId).count;
      if (count) throw new Error('This bank has deposits recorded. Delete those deposits before deleting the bank.');
      this.db.prepare('DELETE FROM banks WHERE id=?').run(bankId);
      this.audit(user.id, 'delete', 'bank', bankId, bank, null);
      return true;
    }).immediate();
  }

  depositValues(user, data, excludeId = null) {
    this.requirePermission(user, 'manage_banks');
    data = data || {};
    const date = String(data.date || localDateString());
    if (!validDateString(date)) throw new Error('Enter a valid deposit date.');
    const bankId = toInteger(data.bank_id, 'Bank');
    const fundId = toInteger(data.fund_id, 'Fund');
    const bank = this.db.prepare('SELECT * FROM banks WHERE id=?').get(bankId);
    if (!bank) throw new Error('Choose a valid bank account.');
    const fund = this.db.prepare('SELECT id,name FROM funds WHERE id=? AND is_active=1').get(fundId);
    if (!fund) throw new Error('Choose an active fund.');
    const amount = Number(data.amount_paisa);
    if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('Deposit amount must be greater than zero.');
    const transactionId = String(data.transaction_id || '').trim().slice(0, 100);
    if (!transactionId) throw new Error('Bank transaction ID / slip number is required.');
    const note = String(data.note || '').trim().slice(0, 300);
    const duplicate = this.db.prepare(`SELECT id FROM bank_deposits
      WHERE bank_id=? AND transaction_id=? AND (? IS NULL OR id<>?)`)
      .get(bankId, transactionId, excludeId, excludeId);
    if (duplicate) throw new Error('This transaction ID is already recorded for the selected bank.');
    const available = this.fundAvailablePaisa(fundId, excludeId);
    if (amount > available) {
      throw new Error(`Deposit cannot exceed the fund's available balance (৳ ${(available / 100).toFixed(2)}).`);
    }
    return {
      date, bank_id: bankId, bank_name: bank.name, fund_id: fundId, fund_name: fund.name,
      amount_paisa: amount, transaction_id: transactionId, note
    };
  }

  createDeposit(user, data) {
    this.requirePermission(user, 'manage_banks');
    return this.db.transaction(() => {
      const values = this.depositValues(user, data);
      const result = this.db.prepare(`INSERT INTO bank_deposits(date,bank_id,fund_id,amount_paisa,transaction_id,note,created_by)
        VALUES (?,?,?,?,?,?,?)`).run(values.date, values.bank_id, values.fund_id, values.amount_paisa,
        values.transaction_id, values.note, user.id);
      const deposit = this.db.prepare(`SELECT d.*,b.name AS bank_name,b.branch_name,b.account_number,f.name AS fund_name
        FROM bank_deposits d JOIN banks b ON b.id=d.bank_id JOIN funds f ON f.id=d.fund_id WHERE d.id=?`)
        .get(result.lastInsertRowid);
      this.audit(user.id, 'create', 'bank_deposit', deposit.id, null, deposit);
      return {
        deposit,
        fund_balance_paisa: this.fundAvailablePaisa(values.fund_id),
        bank_balance_paisa: this.bankBalance(values.bank_id),
        totals: this.cashbookTotals()
      };
    }).immediate();
  }

  updateDeposit(user, data) {
    if (user.role !== 'admin') throw new Error('Only an administrator can edit a Bank Deposit.');
    const id = toInteger(data.id, 'Bank Deposit');
    return this.db.transaction(() => {
      const old = this.db.prepare('SELECT * FROM bank_deposits WHERE id=?').get(id);
      if (!old) throw new Error('Bank Deposit not found.');
      const values = this.depositValues(user, { ...data, date: data.date ?? old.date }, id);
      this.db.prepare(`UPDATE bank_deposits SET date=?,bank_id=?,fund_id=?,amount_paisa=?,transaction_id=?,note=?,
        updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(values.date, values.bank_id, values.fund_id,
        values.amount_paisa, values.transaction_id, values.note, id);
      const deposit = this.db.prepare(`SELECT d.*,b.name AS bank_name,b.branch_name,b.account_number,f.name AS fund_name
        FROM bank_deposits d JOIN banks b ON b.id=d.bank_id JOIN funds f ON f.id=d.fund_id WHERE d.id=?`).get(id);
      this.audit(user.id, 'correct', 'bank_deposit', id, old, deposit);
      return {
        deposit,
        fund_balance_paisa: this.fundAvailablePaisa(values.fund_id),
        bank_balance_paisa: this.bankBalance(values.bank_id),
        totals: this.cashbookTotals()
      };
    }).immediate();
  }

  deleteDeposit(user, id) {
    if (user.role !== 'admin') throw new Error('Only an administrator can delete a Bank Deposit.');
    const depositId = toInteger(id, 'Bank Deposit');
    return this.db.transaction(() => {
      const old = this.db.prepare('SELECT * FROM bank_deposits WHERE id=?').get(depositId);
      if (!old) throw new Error('Bank Deposit not found.');
      this.db.prepare('DELETE FROM bank_deposits WHERE id=?').run(depositId);
      this.audit(user.id, 'delete', 'bank_deposit', depositId, old, null);
      return {
        fund_balance_paisa: this.fundAvailablePaisa(old.fund_id),
        bank_balance_paisa: this.bankBalance(old.bank_id),
        totals: this.cashbookTotals()
      };
    }).immediate();
  }

  dashboard(user) {
    const count = (table) => this.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
    const sum = (sql, ...args) => this.db.prepare(sql).get(...args).value || 0;
    const today = localDateString();
    const month = today.slice(0, 7);
    const cashbook = this.cashbookTotals();
    const balances = this.db.prepare(`SELECT f.id,f.name,f.opening_balance_paisa +
      COALESCE(SUM(CASE WHEN t.transaction_type='income' THEN t.amount_paisa ELSE -t.amount_paisa END),0)
      + COALESCE((SELECT SUM(d.amount_paisa) FROM cash_outs d WHERE d.fund_id=f.id),0)
      + COALESCE((SELECT SUM(ft.amount_paisa) FROM fund_transfers ft WHERE ft.to_fund_id=f.id),0)
      - COALESCE((SELECT SUM(ft.amount_paisa) FROM fund_transfers ft WHERE ft.from_fund_id=f.id),0)
      - COALESCE((SELECT SUM(bd.amount_paisa) FROM bank_deposits bd WHERE bd.fund_id=f.id),0) AS balance_paisa
      FROM funds f LEFT JOIN fund_transactions t ON t.fund_id=f.id WHERE f.is_active=1 GROUP BY f.id`).all();
    return {
      totals: {
        buses: count('buses'), owners: count('owners'), routes: count('routes'), members: count('members'),
        active_buses: this.db.prepare(`SELECT COUNT(*) AS n FROM buses WHERE status='Active'`).get().n,
        inactive_buses: this.db.prepare(`SELECT COUNT(*) AS n FROM buses WHERE status<>'Active'`).get().n,
        today_collection_paisa: sum(`SELECT SUM(amount_paisa) AS value FROM fund_transactions WHERE transaction_type='income' AND date=?`, today),
        month_collection_paisa: sum(`SELECT SUM(amount_paisa) AS value FROM fund_transactions WHERE transaction_type='income' AND substr(date,1,7)=?`, month),
        month_expenses_paisa: sum(`SELECT SUM(amount_paisa) AS value FROM fund_transactions WHERE transaction_type='expense' AND substr(date,1,7)=?`, month),
        expenses_paisa: sum(`SELECT SUM(amount_paisa) AS value FROM fund_transactions WHERE transaction_type='expense'`),
        funds_paisa: balances.reduce((total, fund) => total + fund.balance_paisa, 0),
        regular_cash_in_paisa: cashbook.regular_cash_in_paisa,
        holiday_cash_in_paisa: cashbook.holiday_cash_in_paisa,
        cash_in_paisa: cashbook.cash_in_paisa,
        cash_out_paisa: cashbook.cash_out_paisa,
        available_cash_paisa: cashbook.available_paisa
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
    filters = filters || {};
    const from = String(filters.from || '0001-01-01');
    const to = String(filters.to || '9999-12-31');
    const type = String(filters.type || 'transactions');
    if (type === 'bus-status-list') {
      const where = [];
      const values = [];
      if (filters.route_id !== undefined && filters.route_id !== null && filters.route_id !== '') {
        where.push('b.route_id=?');
        values.push(toInteger(filters.route_id, 'Route'));
      }
      const status = String(filters.status || '');
      if (status === 'Active') where.push(`b.status='Active'`);
      else if (status === 'Inactive') where.push(`b.status<>'Active'`);
      const busSearch = String(filters.bus_search || filters.search || '').trim().slice(0, 100);
      if (busSearch) {
        where.push('b.registration_number LIKE ?');
        values.push(`%${busSearch}%`);
      }
      return this.db.prepare(`SELECT COALESCE(r.name,'Unassigned') AS route_name,
        b.registration_number AS registration_number,o.name AS owner_name,
        o.mobile AS owner_mobile,b.status AS status
        FROM buses b JOIN owners o ON o.id=b.owner_id LEFT JOIN routes r ON r.id=b.route_id
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY CASE WHEN r.name IS NULL THEN 1 ELSE 0 END,r.name COLLATE NOCASE,
          CASE WHEN b.status='Active' THEN 0 ELSE 1 END,b.registration_number COLLATE NOCASE`).all(...values);
    }
    if (type === 'bus-status') {
      const where = [];
      const values = [];
      if (filters.route_id !== undefined && filters.route_id !== null && filters.route_id !== '') {
        where.push('b.route_id=?');
        values.push(toInteger(filters.route_id, 'Route'));
      }
      const status = String(filters.status || '');
      if (status === 'Active') where.push(`b.status='Active'`);
      else if (status === 'Inactive') where.push(`b.status<>'Active'`);
      const busSearch = String(filters.bus_search || filters.search || '').trim().slice(0, 100);
      if (busSearch) {
        where.push('b.registration_number LIKE ?');
        values.push(`%${busSearch}%`);
      }
      return this.db.prepare(`SELECT COALESCE(r.name,'Unassigned') AS route_name,
        COUNT(*) AS total_buses,
        SUM(CASE WHEN b.status='Active' THEN 1 ELSE 0 END) AS active_buses,
        SUM(CASE WHEN b.status='Active' THEN 0 ELSE 1 END) AS inactive_buses
        FROM buses b LEFT JOIN routes r ON r.id=b.route_id
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        GROUP BY b.route_id,r.name
        ORDER BY CASE WHEN r.name IS NULL THEN 1 ELSE 0 END,r.name COLLATE NOCASE`).all(...values);
    }
    if (['cash-in', 'cash-in-regular', 'cash-in-holiday'].includes(type)) {
      const cashInType = type === 'cash-in-regular' ? 'Regular'
        : type === 'cash-in-holiday' ? 'Holiday' : null;
      return this.db.prepare(`WITH cash_ins AS (
      SELECT c.id AS cash_in_id,c.route_id,COALESCE(r.name,c.route_name) AS route_name,c.date,c.cash_in_type,
        c.per_trip_paisa,c.total_trips,c.total_amount_paisa
      FROM route_cash_ins c LEFT JOIN routes r ON r.id=c.route_id
      WHERE c.date BETWEEN ? AND ?
      UNION ALL
      SELECT 'legacy-'||t.id AS cash_in_id,receipt.route_id,
        COALESCE(r.name,'Legacy income · '||t.category) AS route_name,t.date,'Regular' AS cash_in_type,
        NULL AS per_trip_paisa,NULL AS total_trips,t.amount_paisa AS total_amount_paisa
      FROM fund_transactions t LEFT JOIN receipts receipt ON receipt.fund_transaction_id=t.id
      LEFT JOIN routes r ON r.id=receipt.route_id
      WHERE t.transaction_type='income' AND t.date BETWEEN ? AND ?
    )
    SELECT ci.cash_in_id,ci.date,ci.cash_in_type,ci.route_name,ci.per_trip_paisa,ci.total_trips,ci.total_amount_paisa,
      b.registration_number,o.name AS owner_name,o.mobile AS owner_mobile,o.address,b.status,
      (SELECT COUNT(*) FROM buses route_bus WHERE route_bus.route_id=ci.route_id) AS total_buses,
      (SELECT COUNT(*) FROM buses route_bus WHERE route_bus.route_id=ci.route_id AND route_bus.status='Active') AS active_buses,
      (SELECT COUNT(*) FROM buses route_bus WHERE route_bus.route_id=ci.route_id AND route_bus.status<>'Active') AS inactive_buses
    FROM cash_ins ci LEFT JOIN buses b ON b.route_id=ci.route_id
      LEFT JOIN owners o ON o.id=b.owner_id
    WHERE (? IS NULL OR ci.cash_in_type=?)
    ORDER BY ci.date DESC,ci.cash_in_id,
      CASE WHEN b.status='Active' THEN 0 ELSE 1 END,b.registration_number COLLATE NOCASE`)
        .all(from, to, from, to, cashInType, cashInType);
    }
    if (type === 'cash-out') return this.db.prepare(`SELECT date,COALESCE(NULLIF(route_name,''),'Legacy') AS route_name,
      fund_name,per_trip_paisa,total_trips,amount_paisa AS total_amount_paisa
      FROM cash_outs WHERE date BETWEEN ? AND ? ORDER BY date DESC,id DESC`).all(from, to);
    if (type === 'daily-cashbook') return this.db.prepare(`SELECT * FROM (
      SELECT c.date,'Cash In' AS transaction_type,c.cash_in_type,COALESCE(r.name,c.route_name) AS route_name,
        c.total_trips,c.per_trip_paisa,NULL AS fund_name,c.total_amount_paisa
      FROM route_cash_ins c LEFT JOIN routes r ON r.id=c.route_id
      WHERE c.date BETWEEN ? AND ?
      UNION ALL
      SELECT t.date,'Cash In' AS transaction_type,'Regular' AS cash_in_type,
        COALESCE(r.name,'Legacy income · '||t.category) AS route_name,NULL AS total_trips,NULL AS per_trip_paisa,
        f.name AS fund_name,t.amount_paisa AS total_amount_paisa
      FROM fund_transactions t JOIN funds f ON f.id=t.fund_id
      LEFT JOIN receipts receipt ON receipt.fund_transaction_id=t.id
      LEFT JOIN routes r ON r.id=receipt.route_id
      WHERE t.transaction_type='income' AND t.date BETWEEN ? AND ?
      UNION ALL
      SELECT c.date,'Cash Out' AS transaction_type,'—' AS cash_in_type,
        COALESCE(NULLIF(c.route_name,''),'Legacy') AS route_name,c.total_trips,c.per_trip_paisa,
        c.fund_name,c.amount_paisa AS total_amount_paisa
      FROM cash_outs c WHERE c.date BETWEEN ? AND ?
    ) ORDER BY date DESC,transaction_type,route_name,fund_name`).all(from, to, from, to, from, to);
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
    if (type === 'funds') return this.db.prepare(`SELECT f.name,r.name AS route_name,f.amount_paisa,
      COALESCE((SELECT SUM(CASE WHEN t.transaction_type='income' THEN t.amount_paisa ELSE 0 END)
        FROM fund_transactions t WHERE t.fund_id=f.id),0) AS income_paisa,
      COALESCE((SELECT SUM(CASE WHEN t.transaction_type='expense' THEN t.amount_paisa ELSE 0 END)
        FROM fund_transactions t WHERE t.fund_id=f.id),0) AS expense_paisa,
      COALESCE((SELECT SUM(d.amount_paisa) FROM cash_outs d WHERE d.fund_id=f.id),0) AS cash_out_paisa,
      f.opening_balance_paisa
        + COALESCE((SELECT SUM(CASE WHEN t.transaction_type='income' THEN t.amount_paisa ELSE -t.amount_paisa END)
          FROM fund_transactions t WHERE t.fund_id=f.id),0)
        + COALESCE((SELECT SUM(d.amount_paisa) FROM cash_outs d WHERE d.fund_id=f.id),0)
        + COALESCE((SELECT SUM(ft.amount_paisa) FROM fund_transfers ft WHERE ft.to_fund_id=f.id),0)
        - COALESCE((SELECT SUM(ft.amount_paisa) FROM fund_transfers ft WHERE ft.from_fund_id=f.id),0)
        - COALESCE((SELECT SUM(bd.amount_paisa) FROM bank_deposits bd WHERE bd.fund_id=f.id),0) AS balance_paisa
      FROM funds f LEFT JOIN routes r ON r.id=f.route_id ORDER BY f.name`).all();
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

  cashInReport(filters = {}) {
    filters = filters || {};
    const rawFrom = String(filters.from || '').trim();
    const rawTo = String(filters.to || '').trim();
    if ((rawFrom && !validDateString(rawFrom)) || (rawTo && !validDateString(rawTo))) {
      throw new Error('Enter a valid report date range.');
    }
    const from = rawFrom || '0001-01-01';
    const to = rawTo || '9999-12-31';
    if (from > to) throw new Error('Start date cannot be after end date.');
    let routeId = null;
    if (filters.route_id !== undefined && filters.route_id !== null && filters.route_id !== '') {
      routeId = toInteger(filters.route_id, 'Route');
    }
    const status = ['Active', 'Inactive'].includes(filters.status) ? filters.status : '';

    const busWhere = [];
    const busValues = [];
    if (routeId !== null) {
      busWhere.push('b.route_id=?');
      busValues.push(routeId);
    }
    const summary = this.db.prepare(`SELECT COUNT(*) AS total_buses,
      COALESCE(SUM(CASE WHEN b.status='Active' THEN 1 ELSE 0 END),0) AS active_buses,
      COALESCE(SUM(CASE WHEN b.status<>'Active' THEN 1 ELSE 0 END),0) AS inactive_buses
      FROM buses b ${busWhere.length ? `WHERE ${busWhere.join(' AND ')}` : ''}`).get(...busValues);

    const busListWhere = [...busWhere];
    const busListValues = [...busValues];
    if (status === 'Active') busListWhere.push(`b.status='Active'`);
    else if (status === 'Inactive') busListWhere.push(`b.status<>'Active'`);

    const cashIns = this.db.prepare(`WITH cash_ins AS (
      SELECT 'route-'||c.id AS row_id,c.route_id,COALESCE(r.name,c.route_name) AS route_name,
        c.date,c.cash_in_type,c.per_trip_paisa,c.total_trips,c.total_amount_paisa,'' AS remarks
      FROM route_cash_ins c LEFT JOIN routes r ON r.id=c.route_id
      WHERE c.date BETWEEN ? AND ?
      UNION ALL
      SELECT 'legacy-'||t.id AS row_id,receipt.route_id,
        COALESCE(r.name,'Legacy income') AS route_name,t.date,'Regular' AS cash_in_type,
        NULL AS per_trip_paisa,NULL AS total_trips,t.amount_paisa AS total_amount_paisa,
        'Legacy income · '||t.category AS remarks
      FROM fund_transactions t
      LEFT JOIN receipts receipt ON receipt.fund_transaction_id=t.id
      LEFT JOIN routes r ON r.id=receipt.route_id
      WHERE t.transaction_type='income' AND t.date BETWEEN ? AND ?
    ) SELECT row_id,route_id,date,cash_in_type,route_name,per_trip_paisa,total_trips,total_amount_paisa,remarks
      FROM cash_ins ${routeId === null ? '' : 'WHERE route_id=?'}
      ORDER BY date,row_id`).all(from, to, from, to, ...(routeId === null ? [] : [routeId]))
      .map((row, index) => ({ ...row, serial: index + 1 }));

    // Cash In is recorded per route, so a bus carries the Cash In total of its
    // own route for the selected period; nothing is split or duplicated.
    const routeCashIn = new Map();
    for (const row of cashIns) {
      if (row.route_id == null) continue;
      routeCashIn.set(row.route_id, (routeCashIn.get(row.route_id) || 0) + Number(row.total_amount_paisa || 0));
    }

    const buses = this.db.prepare(`SELECT b.id,b.registration_number,b.route_id,b.status,
      COALESCE(r.name,'') AS route_name,COALESCE(r.charge_paisa,0) AS per_trip_paisa
      FROM buses b LEFT JOIN routes r ON r.id=b.route_id
      ${busListWhere.length ? `WHERE ${busListWhere.join(' AND ')}` : ''}
      ORDER BY b.registration_number COLLATE NOCASE`).all(...busListValues)
      .map((bus, index) => ({
        ...bus,
        route_name: bus.route_name || '—',
        serial: index + 1,
        cash_in_paisa: bus.route_id == null ? 0 : (routeCashIn.get(bus.route_id) || 0)
      }));

    const sumBy = (type) => cashIns.filter((row) => row.cash_in_type === type)
      .reduce((total, row) => total + Number(row.total_amount_paisa || 0), 0);
    const regular = sumBy('Regular');
    const holiday = sumBy('Holiday');
    const settings = this.getSettings();
    return {
      filters: { from: rawFrom, to: rawTo, route_id: routeId, status },
      route_name: routeId === null ? null : (this.db.prepare('SELECT name FROM routes WHERE id=?').get(routeId)?.name || null),
      generated_at: new Date().toISOString(),
      settings: { name: settings.name, address: settings.address, phone: settings.phone, logo: this.logoFile() || '' },
      summary,
      buses,
      busTotals: {
        count: buses.length,
        per_trip_paisa: buses.reduce((total, bus) => total + Number(bus.per_trip_paisa || 0), 0),
        cash_in_paisa: regular + holiday
      },
      cashIns,
      totals: {
        regular_paisa: regular,
        holiday_paisa: holiday,
        total_paisa: regular + holiday,
        transactions: cashIns.length,
        trips: cashIns.reduce((total, row) => total + Number(row.total_trips || 0), 0)
      }
    };
  }

  cashOutReport(filters = {}) {
    filters = filters || {};
    const rawFrom = String(filters.from || '').trim();
    const rawTo = String(filters.to || '').trim();
    if ((rawFrom && !validDateString(rawFrom)) || (rawTo && !validDateString(rawTo))) {
      throw new Error('Enter a valid report date range.');
    }
    const from = rawFrom || '0001-01-01';
    const to = rawTo || '9999-12-31';
    if (from > to) throw new Error('Start date cannot be after end date.');

    // The stored fund_name is the historical snapshot; the current fund row wins
    // so a renamed fund prints under its correct name. A missing fund never
    // borrows another fund's name.
    const rows = this.db.prepare(`SELECT c.id,c.date,c.route_id,
      COALESCE(NULLIF(r.name,''), NULLIF(c.route_name,''), '') AS route_name,
      c.fund_id,
      COALESCE(NULLIF(f.name,''), NULLIF(c.fund_name,''), '') AS fund_name,
      c.per_trip_paisa,c.total_trips,c.amount_paisa,
      CASE WHEN c.legacy_distribution_id IS NULL THEN 0 ELSE 1 END AS legacy,
      COALESCE(u.full_name,'') AS created_by_name
      FROM cash_outs c
      LEFT JOIN routes r ON r.id=c.route_id
      LEFT JOIN funds f ON f.id=c.fund_id
      LEFT JOIN users u ON u.id=c.created_by
      WHERE c.date BETWEEN ? AND ?
      ORDER BY c.date,c.id`).all(from, to)
      .map((row, index) => ({
        ...row,
        serial: index + 1,
        voucher_number: `CO-${String(row.id).padStart(6, '0')}`
      }));

    const settings = this.getSettings();
    return {
      filters: { from: rawFrom, to: rawTo },
      generated_at: new Date().toISOString(),
      settings: { name: settings.name, address: settings.address, phone: settings.phone, logo: this.logoFile() || '' },
      rows,
      totals: {
        count: rows.length,
        amount_paisa: rows.reduce((total, row) => total + Number(row.amount_paisa || 0), 0),
        trips: rows.reduce((total, row) => total + Number(row.total_trips || 0), 0)
      }
    };
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
    this.prepareForSchemaChanges();
    this.initialize();
  }

  settingsValues() {
    return Object.fromEntries(this.db.prepare('SELECT key, value FROM settings').all().map((row) => [row.key, row.value]));
  }

  getSettings() {
    const values = this.settingsValues();
    return {
      name: values.association_name || 'Bus Malik Group',
      address: values.association_address || '',
      phone: values.association_phone || '',
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
      if (data.phone !== undefined) write.run('association_phone', String(data.phone || '').trim());
      if (data.logo !== undefined) write.run('association_logo', String(data.logo || '').trim());
      if (data.backup_folder !== undefined) write.run('backup_folder', String(data.backup_folder || '').trim());
      if (data.auto_backup !== undefined) write.run('auto_backup', data.auto_backup ? '1' : '0');
      if (data.keep_copies !== undefined) write.run('keep_copies', String(Math.min(365, Math.max(1, Number(data.keep_copies) || 30))));
    })();
    this.audit(user.id, 'update', 'settings', 'settings', null, { ...data, logo: undefined });
    return this.getSettings();
  }

  // Subscription settings live in the existing key/value settings table so no
  // schema migration is needed. The service_role key is never accepted or
  // stored: the desktop client only ever holds the public anon key plus the
  // per-business client key used by the submit/read RPCs.
  getSubscriptionSettings() {
    const values = this.settingsValues();
    return {
      supabase_url: values.subscription_supabase_url || '',
      anon_key: values.subscription_anon_key || '',
      business_id: values.subscription_business_id || '',
      client_key: values.subscription_client_key || '',
      business_name: values.subscription_business_name || '',
      contact_number: values.subscription_contact_number || '',
      enforced: values.subscription_enforced === '1',
      offline_grace_days: Number(values.subscription_offline_grace_days || 3)
    };
  }

  getPublicSubscriptionSettings() {
    const settings = this.getSubscriptionSettings();
    return {
      supabase_url: settings.supabase_url,
      business_id: settings.business_id,
      business_name: settings.business_name,
      contact_number: settings.contact_number,
      enforced: settings.enforced,
      offline_grace_days: settings.offline_grace_days,
      configured: Boolean(settings.supabase_url && settings.anon_key && settings.business_id && settings.client_key),
      has_anon_key: Boolean(settings.anon_key),
      has_client_key: Boolean(settings.client_key)
    };
  }

  saveSubscriptionSettings(user, data) {
    if (user.role !== 'admin') throw new Error('Only an administrator can change subscription settings.');
    const current = this.getSubscriptionSettings();
    const url = String(data.supabase_url ?? current.supabase_url ?? '').trim().replace(/\/+$/, '');
    const anonKey = String(data.anon_key || '').trim() || current.anon_key;
    const businessId = String(data.business_id ?? current.business_id ?? '').trim().toLowerCase();
    const clientKey = String(data.client_key || '').trim() || current.client_key;
    const businessName = String(data.business_name ?? current.business_name ?? '').trim();
    const contactNumber = String(data.contact_number ?? current.contact_number ?? '').trim();
    const grace = Math.min(30, Math.max(0, Number(data.offline_grace_days ?? current.offline_grace_days) || 0));

    if (url && !/^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*$/i.test(url) && !/^http:\/\/localhost(:\d+)?$/i.test(url)) {
      throw new Error('Supabase URL must be an https:// address.');
    }
    if (businessId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(businessId)) {
      throw new Error('Business ID must be a valid UUID.');
    }
    if (anonKey && anonKey.length < 20) throw new Error('The Supabase anon key is too short.');
    if (clientKey && clientKey.length < 16) throw new Error('The business client key is too short.');
    if (data.anon_key && isPrivilegedKey(anonKey)) {
      throw new Error('Never store the Supabase service_role or secret key. Use the public anon/publishable key.');
    }
    if (data.client_key && isPrivilegedKey(clientKey)) {
      throw new Error('Never store the Supabase service_role or secret key as the client key.');
    }
    if (businessName && businessName.length > 200) throw new Error('Business name is too long.');
    if (contactNumber && !/^[0-9+\- ]{6,30}$/.test(contactNumber)) throw new Error('Enter a valid contact number.');

    const write = this.db.prepare('INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
    this.db.transaction(() => {
      write.run('subscription_supabase_url', url);
      if (data.anon_key) write.run('subscription_anon_key', anonKey);
      write.run('subscription_business_id', businessId);
      if (data.client_key) write.run('subscription_client_key', clientKey);
      write.run('subscription_business_name', businessName);
      write.run('subscription_contact_number', contactNumber);
      write.run('subscription_enforced', data.enforced ? '1' : '0');
      write.run('subscription_offline_grace_days', String(grace));
    })();
    this.audit(user.id, 'update', 'subscription_settings', 'subscription', null, {
      supabase_url: url, business_id: businessId, enforced: Boolean(data.enforced), offline_grace_days: grace
    });
    return this.getPublicSubscriptionSettings();
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
      .text(String(settings.name || 'Bus Malik Group'), left, textTop, { width, align: 'center' });
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

  async exportPdf(filePath, title, headers, rows, options = {}) {
    const columns = (headers || []).map(String);
    const values = (rows || []).map((row) => (Array.isArray(row) ? row : Object.values(row)));
    await new Promise((resolve, reject) => {
      const doc = createDoc({ size: 'A4', margin: 36, layout: options.orientation === 'portrait' ? 'portrait' : 'landscape' });
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

  async exportCashInPdf(filePath, filters = {}, options = {}) {
    const report = this.cashInReport(filters);
    const settings = report.settings;
    const logo = options.logo || settings.logo;
    const money = (paisa) => (Number(paisa || 0) / 100).toFixed(2);
    const generated = new Date().toLocaleString();
    const routeName = report.route_name || 'All Routes';
    const period = `${report.filters.from || '—'} – ${report.filters.to || '—'}`;
    await new Promise((resolve, reject) => {
      const doc = createDoc({ size: 'A4', margin: 36, layout: 'portrait' });
      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);
      const left = doc.page.margins.left;
      const width = doc.page.width - left - doc.page.margins.right;
      const limit = () => doc.page.height - doc.page.margins.bottom - 18;

      // Only black ink on white paper: no corporate colours anywhere in this report.
      const header = (compact) => {
        let y = doc.y;
        if (!compact && logo) {
          try { doc.image(logo, left + (width - 46) / 2, y, { fit: [46, 46] }); y += 50; } catch { /* a bad logo must not stop the report */ }
        }
        if (compact) {
          doc.font(doc.family.head).fontSize(9).fillColor('#000')
            .text(settings.name || 'Bus Malik Group', left, y, { width, align: 'center' });
          doc.font(doc.family.head).fontSize(10).text('CASH IN REPORT', { width, align: 'center' });
          doc.font(doc.family.body).fontSize(7.5).text(`${period} · ${routeName}`, { width, align: 'center' });
        } else {
          doc.font(doc.family.body).fontSize(9).fillColor('#000')
            .text('BUS MANAGEMENT SYSTEM', left, y, { width, align: 'center' });
          doc.font(doc.family.head).fontSize(17).text('CASH IN REPORT', { width, align: 'center' });
          doc.font(doc.family.head).fontSize(12).text(settings.name || 'Bus Malik Group', { width, align: 'center' });
          if (settings.address) doc.font(doc.family.body).fontSize(8).text(settings.address, { width, align: 'center' });
          doc.font(doc.family.body).fontSize(8).text(`Phone: ${settings.phone || '—'}`, { width, align: 'center' });
          const metaY = doc.y + 4;
          doc.font(doc.family.body).fontSize(8).fillColor('#000');
          doc.text(`Report Period: ${period}`, left, metaY, { width: width / 2 });
          doc.text(`Selected Route: ${routeName}`, left + width / 2, metaY, { width: width / 2, align: 'right' });
          doc.text(`Generated: ${generated}`, left, metaY + 12, { width });
        }
        doc.moveTo(left, doc.y + 4).lineTo(left + width, doc.y + 4).lineWidth(1).strokeColor('#000').stroke();
        doc.y = doc.y + 10;
        return doc.y;
      };

      const sectionTitle = (text) => {
        // Keep a title with at least its table header and one row.
        if (doc.y + 60 > limit()) {
          doc.addPage();
          header(true);
        }
        doc.font(doc.family.head).fontSize(10).fillColor('#000').text(text, left, doc.y, { width });
        doc.moveDown(0.25);
      };

      const summaryBoxes = () => {
        const gap = 10;
        const boxWidth = (width - gap * 2) / 3;
        const boxHeight = 44;
        const top = doc.y + 2;
        [['Total Bus', report.summary.total_buses], ['Active Bus', report.summary.active_buses],
          ['Inactive Bus', report.summary.inactive_buses]].forEach(([text, value], index) => {
          const x = left + index * (boxWidth + gap);
          doc.rect(x, top, boxWidth, boxHeight).lineWidth(1).strokeColor('#000').stroke();
          doc.font(doc.family.body).fontSize(8).fillColor('#000').text(text, x, top + 7, { width: boxWidth, align: 'center' });
          doc.font(doc.family.strong).fontSize(16).text(String(value), x, top + 20, { width: boxWidth, align: 'center' });
        });
        doc.y = top + boxHeight + 12;
      };

      const table = (columns, rows, emptyText = 'No records found.', footer = null) => {
        const widths = columns.map((column) => width * column.ratio);
        const measureHead = () => {
          doc.font(doc.family.head).fontSize(7.5);
          return Math.max(18, ...columns.map((column, index) =>
            doc.heightOfString(column.label, { width: widths[index] - 6 }))) + 8;
        };
        const drawHead = (top) => {
          doc.font(doc.family.head).fontSize(7.5).fillColor('#000');
          const headHeight = measureHead();
          doc.rect(left, top, width, headHeight).lineWidth(1).fillAndStroke('#e6e6e6', '#000');
          let x = left;
          columns.forEach((column, index) => {
            doc.font(doc.family.head).fontSize(7.5).fillColor('#000')
              .text(column.label, x + 3, top + 4, { width: widths[index] - 6, align: column.align || 'left' });
            x += widths[index];
            if (index < columns.length - 1) doc.moveTo(x, top).lineTo(x, top + headHeight).lineWidth(1).strokeColor('#000').stroke();
          });
          return top + headHeight;
        };
        // A header must never start below the page limit: pdfkit would split it
        // across two pages and leave an almost blank page behind.
        let start = doc.y;
        if (start + measureHead() + 18 > limit()) {
          doc.addPage();
          start = header(true);
        }
        let y = drawHead(start);
        if (!rows.length) {
          doc.rect(left, y, width, 18).lineWidth(1).strokeColor('#000').stroke();
          doc.font(doc.family.body).fontSize(8).fillColor('#000').text(emptyText, left + 4, y + 5, { width: width - 8 });
          doc.y = y + 24;
          return;
        }
        for (const cells of rows) {
          doc.font(doc.family.body).fontSize(7.5).fillColor('#000');
          const heights = cells.map((cell, index) =>
            doc.heightOfString(String(cell ?? ''), { width: widths[index] - 6, align: columns[index].align || 'left' }));
          const rowHeight = Math.max(16, ...heights) + 6;
          if (y + rowHeight > limit()) {
            doc.addPage();
            y = drawHead(header(true));
          }
          doc.rect(left, y, width, rowHeight).lineWidth(1).strokeColor('#000').stroke();
          let x = left;
          columns.forEach((column, index) => {
            doc.font(doc.family.body).fontSize(7.5).fillColor('#000')
              .text(String(cells[index] ?? ''), x + 3, y + 3, { width: widths[index] - 6, align: column.align || 'left' });
            x += widths[index];
            if (index < columns.length - 1) doc.moveTo(x, y).lineTo(x, y + rowHeight).lineWidth(1).strokeColor('#000').stroke();
          });
          y += rowHeight;
        }
        if (footer) {
          doc.font(doc.family.strong).fontSize(7.5).fillColor('#000');
          const heights = footer.map((cell, index) =>
            doc.heightOfString(String(cell ?? ''), { width: widths[index] - 6, align: columns[index].align || 'left' }));
          const footerHeight = Math.max(16, ...heights) + 6;
          if (y + footerHeight > limit()) {
            doc.addPage();
            y = drawHead(header(true));
          }
          doc.rect(left, y, width, footerHeight).lineWidth(1).fillAndStroke('#ececec', '#000');
          let x = left;
          columns.forEach((column, index) => {
            doc.font(doc.family.strong).fontSize(7.5).fillColor('#000')
              .text(String(footer[index] ?? ''), x + 3, y + 3, { width: widths[index] - 6, align: column.align || 'left' });
            x += widths[index];
            if (index < columns.length - 1) doc.moveTo(x, y).lineTo(x, y + footerHeight).lineWidth(1).strokeColor('#000').stroke();
          });
          y += footerHeight;
        }
        doc.y = y + 10;
      };

      const totalsBlock = () => {
        const blockWidth = Math.min(width, 270);
        const rowHeight = 16;
        const rows = [
          ['Regular Cash In', money(report.totals.regular_paisa)],
          ['Holiday Cash In', money(report.totals.holiday_paisa)],
          ['Total Cash In', money(report.totals.total_paisa)]
        ];
        if (doc.y + rows.length * rowHeight + 6 > limit()) {
          doc.addPage();
          header(true);
        }
        const x = left + width - blockWidth;
        let y = doc.y + 2;
        rows.forEach(([label, value], index) => {
          const bold = index === rows.length - 1;
          if (bold) doc.rect(x, y, blockWidth, rowHeight).lineWidth(1).fillAndStroke('#e6e6e6', '#000');
          else doc.rect(x, y, blockWidth, rowHeight).lineWidth(1).strokeColor('#000').stroke();
          doc.font(bold ? doc.family.strong : doc.family.body).fontSize(8.5).fillColor('#000')
            .text(label, x + 6, y + 4, { width: blockWidth - 96 });
          doc.text(`BDT ${value}`, x + blockWidth - 94, y + 4, { width: 88, align: 'right' });
          y += rowHeight;
        });
        doc.y = y + 14;
      };

      const signatureBlock = () => {
        if (doc.y + 70 > limit()) {
          doc.addPage();
          header(true);
        }
        const y = doc.y + 24;
        doc.font(doc.family.body).fontSize(8.5).fillColor('#000');
        doc.text('Prepared By', left, y, { width: width / 2 });
        doc.text('Authorized Signature', left + width / 2, y, { width: width / 2 });
        doc.moveTo(left, y + 26).lineTo(left + width / 2 - 40, y + 26).lineWidth(1).strokeColor('#000').stroke();
        doc.moveTo(left + width / 2, y + 26).lineTo(left + width - 40, y + 26).stroke();
      };

      header(false);
      sectionTitle('BUS STATUS SUMMARY');
      summaryBoxes();
      sectionTitle('BUS LIST');
      table([
        { label: 'SL', ratio: 0.06, align: 'center' },
        { label: 'Bus Number', ratio: 0.18 },
        { label: 'Route Name', ratio: 0.24 },
        { label: 'Status', ratio: 0.10 },
        { label: 'Per Trip Amount', ratio: 0.19, align: 'right' },
        { label: 'Total Cash In', ratio: 0.23, align: 'right' }
      ], report.buses.map((bus) => [bus.serial, bus.registration_number, bus.route_name, bus.status,
        money(bus.per_trip_paisa), money(bus.cash_in_paisa)]), 'No buses found.',
      report.buses.length ? ['', 'TOTAL', '', `${report.busTotals.count} Buses`,
        money(report.busTotals.per_trip_paisa), money(report.busTotals.cash_in_paisa)] : null);
      sectionTitle('CASH IN DETAILS');
      table([
        { label: 'SL', ratio: 0.05, align: 'center' },
        { label: 'Date', ratio: 0.10 },
        { label: 'Cash In Type', ratio: 0.09 },
        { label: 'Route Name', ratio: 0.19 },
        { label: 'Total Trip', ratio: 0.07, align: 'right' },
        { label: 'Per Trip Amount', ratio: 0.12, align: 'right' },
        { label: 'Total Amount', ratio: 0.14, align: 'right' },
        { label: 'Remarks', ratio: 0.24 }
      ], report.cashIns.map((row) => [row.serial, row.date, row.cash_in_type, row.route_name,
        row.total_trips ?? '—', row.per_trip_paisa == null ? '—' : money(row.per_trip_paisa),
        money(row.total_amount_paisa), row.remarks || '—']));
      totalsBlock();
      signatureBlock();
      doc.end();
      stream.on('finish', resolve);
      stream.on('error', reject);
    });
    return filePath;
  }

  async exportCashOutPdf(filePath, filters = {}, options = {}) {
    const report = this.cashOutReport(filters);
    const settings = report.settings;
    const logo = options.logo || settings.logo;
    const money = (paisa) => (Number(paisa || 0) / 100).toFixed(2);
    const generated = new Date().toLocaleString();
    const period = `${report.filters.from || '—'} – ${report.filters.to || '—'}`;
    const description = (row) => {
      if (!row.route_name) return row.legacy ? 'Legacy distribution' : '—';
      return row.total_trips ? `${row.route_name} · ${row.total_trips} trips` : row.route_name;
    };
    await new Promise((resolve, reject) => {
      const doc = createDoc({ size: 'A4', margin: 36, layout: 'portrait' });
      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);
      const left = doc.page.margins.left;
      const width = doc.page.width - left - doc.page.margins.right;
      const limit = () => doc.page.height - doc.page.margins.bottom - 18;

      // Only black ink on white paper, the same statement design as Cash In.
      const header = (compact) => {
        let y = doc.y;
        if (!compact && logo) {
          try { doc.image(logo, left + (width - 46) / 2, y, { fit: [46, 46] }); y += 50; } catch { /* a bad logo must not stop the report */ }
        }
        if (compact) {
          doc.font(doc.family.head).fontSize(9).fillColor('#000')
            .text(settings.name || 'Bus Malik Group', left, y, { width, align: 'center' });
          doc.font(doc.family.head).fontSize(10).text('CASH OUT REPORT', { width, align: 'center' });
          doc.font(doc.family.body).fontSize(7.5).text(`${period}`, { width, align: 'center' });
        } else {
          doc.font(doc.family.body).fontSize(9).fillColor('#000')
            .text('BUS MANAGEMENT SYSTEM', left, y, { width, align: 'center' });
          doc.font(doc.family.head).fontSize(17).text('CASH OUT REPORT', { width, align: 'center' });
          doc.font(doc.family.head).fontSize(12).text(settings.name || 'Bus Malik Group', { width, align: 'center' });
          if (settings.address) doc.font(doc.family.body).fontSize(8).text(settings.address, { width, align: 'center' });
          doc.font(doc.family.body).fontSize(8).text(`Phone: ${settings.phone || '—'}`, { width, align: 'center' });
          const metaY = doc.y + 4;
          doc.font(doc.family.body).fontSize(8).fillColor('#000');
          doc.text(`Report Period: ${period}`, left, metaY, { width: width / 2 });
          doc.text(`Generated: ${generated}`, left + width / 2, metaY, { width: width / 2, align: 'right' });
        }
        doc.moveTo(left, doc.y + 4).lineTo(left + width, doc.y + 4).lineWidth(1).strokeColor('#000').stroke();
        doc.y = doc.y + 10;
        return doc.y;
      };

      const sectionTitle = (text) => {
        if (doc.y + 60 > limit()) {
          doc.addPage();
          header(true);
        }
        doc.font(doc.family.head).fontSize(10).fillColor('#000').text(text, left, doc.y, { width });
        doc.moveDown(0.25);
      };

      const summaryBoxes = () => {
        const gap = 10;
        const boxWidth = (width - gap * 2) / 3;
        const boxHeight = 44;
        const top = doc.y + 2;
        [['Total Vouchers', report.totals.count], ['Total Trips', report.totals.trips],
          [`Total Cash Out (BDT)`, money(report.totals.amount_paisa)]].forEach(([text, value], index) => {
          const x = left + index * (boxWidth + gap);
          doc.rect(x, top, boxWidth, boxHeight).lineWidth(1).strokeColor('#000').stroke();
          doc.font(doc.family.body).fontSize(8).fillColor('#000').text(text, x, top + 7, { width: boxWidth, align: 'center' });
          doc.font(doc.family.strong).fontSize(16).text(String(value), x, top + 20, { width: boxWidth, align: 'center' });
        });
        doc.y = top + boxHeight + 12;
      };

      const table = (columns, rows, emptyText = 'No records found.', footer = null) => {
        const widths = columns.map((column) => width * column.ratio);
        const measureHead = () => {
          doc.font(doc.family.head).fontSize(7.5);
          return Math.max(18, ...columns.map((column, index) =>
            doc.heightOfString(column.label, { width: widths[index] - 6 }))) + 8;
        };
        const drawHead = (top) => {
          doc.font(doc.family.head).fontSize(7.5).fillColor('#000');
          const headHeight = measureHead();
          doc.rect(left, top, width, headHeight).lineWidth(1).fillAndStroke('#e6e6e6', '#000');
          let x = left;
          columns.forEach((column, index) => {
            doc.font(doc.family.head).fontSize(7.5).fillColor('#000')
              .text(column.label, x + 3, top + 4, { width: widths[index] - 6, align: column.align || 'left' });
            x += widths[index];
            if (index < columns.length - 1) doc.moveTo(x, top).lineTo(x, top + headHeight).lineWidth(1).strokeColor('#000').stroke();
          });
          return top + headHeight;
        };
        let start = doc.y;
        if (start + measureHead() + 18 > limit()) {
          doc.addPage();
          start = header(true);
        }
        let y = drawHead(start);
        if (!rows.length) {
          doc.rect(left, y, width, 18).lineWidth(1).strokeColor('#000').stroke();
          doc.font(doc.family.body).fontSize(8).fillColor('#000').text(emptyText, left + 4, y + 5, { width: width - 8 });
          doc.y = y + 24;
          return;
        }
        for (const cells of rows) {
          doc.font(doc.family.body).fontSize(7.5).fillColor('#000');
          const heights = cells.map((cell, index) =>
            doc.heightOfString(String(cell ?? ''), { width: widths[index] - 6, align: columns[index].align || 'left' }));
          const rowHeight = Math.max(16, ...heights) + 6;
          if (y + rowHeight > limit()) {
            doc.addPage();
            y = drawHead(header(true));
          }
          doc.rect(left, y, width, rowHeight).lineWidth(1).strokeColor('#000').stroke();
          let x = left;
          columns.forEach((column, index) => {
            doc.font(doc.family.body).fontSize(7.5).fillColor('#000')
              .text(String(cells[index] ?? ''), x + 3, y + 3, { width: widths[index] - 6, align: column.align || 'left' });
            x += widths[index];
            if (index < columns.length - 1) doc.moveTo(x, y).lineTo(x, y + rowHeight).lineWidth(1).strokeColor('#000').stroke();
          });
          y += rowHeight;
        }
        if (footer) {
          doc.font(doc.family.strong).fontSize(7.5).fillColor('#000');
          const heights = footer.map((cell, index) =>
            doc.heightOfString(String(cell ?? ''), { width: widths[index] - 6, align: columns[index].align || 'left' }));
          const footerHeight = Math.max(16, ...heights) + 6;
          if (y + footerHeight > limit()) {
            doc.addPage();
            y = drawHead(header(true));
          }
          doc.rect(left, y, width, footerHeight).lineWidth(1).fillAndStroke('#ececec', '#000');
          let x = left;
          columns.forEach((column, index) => {
            doc.font(doc.family.strong).fontSize(7.5).fillColor('#000')
              .text(String(footer[index] ?? ''), x + 3, y + 3, { width: widths[index] - 6, align: column.align || 'left' });
            x += widths[index];
            if (index < columns.length - 1) doc.moveTo(x, y).lineTo(x, y + footerHeight).lineWidth(1).strokeColor('#000').stroke();
          });
          y += footerHeight;
        }
        doc.y = y + 10;
      };

      const totalsBlock = () => {
        const blockWidth = Math.min(width, 270);
        const rowHeight = 16;
        const rows = [
          ['Total Vouchers', String(report.totals.count)],
          ['Total Trips', String(report.totals.trips)],
          ['Total Cash Out', `BDT ${money(report.totals.amount_paisa)}`]
        ];
        if (doc.y + rows.length * rowHeight + 6 > limit()) {
          doc.addPage();
          header(true);
        }
        const x = left + width - blockWidth;
        let y = doc.y + 2;
        rows.forEach(([label, value], index) => {
          const bold = index === rows.length - 1;
          if (bold) doc.rect(x, y, blockWidth, rowHeight).lineWidth(1).fillAndStroke('#e6e6e6', '#000');
          else doc.rect(x, y, blockWidth, rowHeight).lineWidth(1).strokeColor('#000').stroke();
          doc.font(bold ? doc.family.strong : doc.family.body).fontSize(8.5).fillColor('#000')
            .text(label, x + 6, y + 4, { width: blockWidth - 96 });
          doc.text(value, x + blockWidth - 94, y + 4, { width: 88, align: 'right' });
          y += rowHeight;
        });
        doc.y = y + 14;
      };

      const signatureBlock = () => {
        if (doc.y + 70 > limit()) {
          doc.addPage();
          header(true);
        }
        const y = doc.y + 24;
        doc.font(doc.family.body).fontSize(8.5).fillColor('#000');
        doc.text('Prepared By', left, y, { width: width / 2 });
        doc.text('Authorized Signature', left + width / 2, y, { width: width / 2 });
        doc.moveTo(left, y + 26).lineTo(left + width / 2 - 40, y + 26).lineWidth(1).strokeColor('#000').stroke();
        doc.moveTo(left + width / 2, y + 26).lineTo(left + width - 40, y + 26).stroke();
      };

      header(false);
      sectionTitle('CASH OUT SUMMARY');
      summaryBoxes();
      sectionTitle('CASH OUT DETAILS');
      table([
        { label: 'SL', ratio: 0.06, align: 'center' },
        { label: 'Date', ratio: 0.16 },
        { label: 'Expense Description', ratio: 0.38 },
        { label: 'Fund Name', ratio: 0.28 },
        { label: 'Amount', ratio: 0.12, align: 'right' }
      ], report.rows.map((row) => [row.serial, row.date, description(row),
        row.fund_name || '—', money(row.amount_paisa)]), 'No Cash Out records found.', report.rows.length ? ['', '', 'TOTAL',
        '', money(report.totals.amount_paisa)] : null);
      totalsBlock();
      signatureBlock();
      doc.end();
      stream.on('finish', resolve);
      stream.on('error', reject);
    });
    return filePath;
  }

  async exportBankReportPdf(filePath, options = {}) {
    const data = this.bankReportData({});
    const settings = this.getSettings();
    const logo = options.logo || settings.logo;
    const money = (paisa) => (Number(paisa || 0) / 100).toFixed(2);
    const generated = new Date().toLocaleString();
    await new Promise((resolve, reject) => {
      const doc = createDoc({ size: 'A4', margin: 36, layout: 'portrait' });
      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);
      const left = doc.page.margins.left;
      const width = doc.page.width - left - doc.page.margins.right;
      const limit = () => doc.page.height - doc.page.margins.bottom - 18;

      const header = (compact) => {
        let y = doc.y;
        if (!compact && logo) {
          try { doc.image(logo, left + (width - 46) / 2, y, { fit: [46, 46] }); y += 50; } catch { /* a bad logo must not stop the report */ }
        }
        if (compact) {
          doc.font(doc.family.head).fontSize(9).fillColor('#000')
            .text(settings.name || 'Bus Malik Group', left, y, { width, align: 'center' });
          doc.font(doc.family.head).fontSize(10).text('BANK REPORT', { width, align: 'center' });
          doc.font(doc.family.body).fontSize(7.5).text(`Generated: ${generated}`, { width, align: 'center' });
        } else {
          doc.font(doc.family.body).fontSize(9).fillColor('#000')
            .text('BUS MANAGEMENT SYSTEM', left, y, { width, align: 'center' });
          doc.font(doc.family.head).fontSize(17).text('BANK REPORT', { width, align: 'center' });
          doc.font(doc.family.head).fontSize(12).text(settings.name || 'Bus Malik Group', { width, align: 'center' });
          if (settings.address) doc.font(doc.family.body).fontSize(8).text(settings.address, { width, align: 'center' });
          doc.font(doc.family.body).fontSize(8).text(`Phone: ${settings.phone || '—'}`, { width, align: 'center' });
          doc.font(doc.family.body).fontSize(8).text(`Generated: ${generated}`, { width, align: 'center' });
        }
        doc.moveTo(left, doc.y + 4).lineTo(left + width, doc.y + 4).lineWidth(1).strokeColor('#000').stroke();
        doc.y = doc.y + 10;
        return doc.y;
      };

      const sectionTitle = (text) => {
        if (doc.y + 44 > limit()) { doc.addPage(); header(true); }
        doc.font(doc.family.head).fontSize(10).fillColor('#000').text(text, left, doc.y, { width });
        doc.moveDown(0.25);
      };

      const summaryBoxes = () => {
        const gap = 10;
        const boxWidth = (width - gap * 2) / 3;
        const boxHeight = 44;
        const top = doc.y + 2;
        [['Total Banks', data.totals.bank_count], ['Total Deposit (BDT)', money(data.totals.total_deposit_paisa)],
          ['Total Bank Balance (BDT)', money(data.totals.total_bank_balance_paisa)]].forEach(([text, value], index) => {
          const x = left + index * (boxWidth + gap);
          doc.rect(x, top, boxWidth, boxHeight).lineWidth(1).strokeColor('#000').stroke();
          doc.font(doc.family.body).fontSize(8).fillColor('#000').text(text, x, top + 7, { width: boxWidth, align: 'center' });
          doc.font(doc.family.strong).fontSize(14).text(String(value), x, top + 20, { width: boxWidth, align: 'center' });
        });
        doc.y = top + boxHeight + 12;
      };

      const table = (columns, rows, emptyText = 'No records found.') => {
        const widths = columns.map((column) => width * column.ratio);
        const drawHead = (top) => {
          doc.font(doc.family.head).fontSize(7.5).fillColor('#000');
          const headHeight = Math.max(18, ...columns.map((column, index) =>
            doc.heightOfString(column.label, { width: widths[index] - 6 }))) + 8;
          doc.rect(left, top, width, headHeight).lineWidth(1).fillAndStroke('#e6e6e6', '#000');
          let x = left;
          columns.forEach((column, index) => {
            doc.font(doc.family.head).fontSize(7.5).fillColor('#000')
              .text(column.label, x + 3, top + 4, { width: widths[index] - 6, align: column.align || 'left' });
            x += widths[index];
            if (index < columns.length - 1) doc.moveTo(x, top).lineTo(x, top + headHeight).lineWidth(1).strokeColor('#000').stroke();
          });
          return top + headHeight;
        };
        let y = drawHead(doc.y);
        if (!rows.length) {
          doc.rect(left, y, width, 18).lineWidth(1).strokeColor('#000').stroke();
          doc.font(doc.family.body).fontSize(8).fillColor('#000').text(emptyText, left + 4, y + 5, { width: width - 8 });
          doc.y = y + 24;
          return;
        }
        for (const cells of rows) {
          doc.font(doc.family.body).fontSize(7.5).fillColor('#000');
          const heights = cells.map((cell, index) =>
            doc.heightOfString(String(cell ?? ''), { width: widths[index] - 6, align: columns[index].align || 'left' }));
          const rowHeight = Math.max(16, ...heights) + 6;
          if (y + rowHeight > limit()) {
            doc.addPage();
            y = drawHead(header(true));
          }
          doc.rect(left, y, width, rowHeight).lineWidth(1).strokeColor('#000').stroke();
          let x = left;
          columns.forEach((column, index) => {
            doc.font(doc.family.body).fontSize(7.5).fillColor('#000')
              .text(String(cells[index] ?? ''), x + 3, y + 3, { width: widths[index] - 6, align: column.align || 'left' });
            x += widths[index];
            if (index < columns.length - 1) doc.moveTo(x, y).lineTo(x, y + rowHeight).lineWidth(1).strokeColor('#000').stroke();
          });
          y += rowHeight;
        }
        doc.y = y + 10;
      };

      const signatureBlock = () => {
        if (doc.y + 70 > limit()) {
          doc.addPage();
          header(true);
        }
        const y = doc.y + 24;
        doc.font(doc.family.body).fontSize(8.5).fillColor('#000');
        doc.text('Prepared By', left, y, { width: width / 2 });
        doc.text('Authorized Signature', left + width / 2, y, { width: width / 2 });
        doc.moveTo(left, y + 26).lineTo(left + width / 2 - 40, y + 26).lineWidth(1).strokeColor('#000').stroke();
        doc.moveTo(left + width / 2, y + 26).lineTo(left + width - 40, y + 26).stroke();
      };

      header(false);
      summaryBoxes();
      sectionTitle('BANK-WISE REPORT');
      table([
        { label: 'Bank Name', ratio: 0.20 },
        { label: 'Branch', ratio: 0.14 },
        { label: 'Account Number', ratio: 0.16 },
        { label: 'Opening Balance', ratio: 0.13, align: 'right' },
        { label: 'Total Deposit', ratio: 0.13, align: 'right' },
        { label: 'Total Withdrawal', ratio: 0.11, align: 'right' },
        { label: 'Current Balance', ratio: 0.13, align: 'right' }
      ], data.report.banks.map((bank) => [bank.name, bank.branch_name || '—', bank.account_number,
        money(bank.opening_balance_paisa), money(bank.total_deposit_paisa), money(bank.total_withdrawal_paisa),
        money(bank.balance_paisa)]), 'No bank accounts found.');
      sectionTitle('FUND-WISE BANK DEPOSIT REPORT');
      table([
        { label: 'Fund Name', ratio: 0.32 },
        { label: 'Bank Name', ratio: 0.28 },
        { label: 'Account Number', ratio: 0.22 },
        { label: 'Deposits', ratio: 0.08, align: 'right' },
        { label: 'Total Deposit', ratio: 0.20, align: 'right' }
      ], data.report.fundWise.map((row) => [row.fund_name, row.bank_name, row.account_number,
        row.deposit_count, money(row.total_paisa)]), 'No deposits found.');
      signatureBlock();
      doc.end();
      stream.on('finish', resolve);
      stream.on('error', reject);
    });
    return filePath;
  }

  async exportExcel(filePath, title, headers, rows) {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(String(title || 'Report').slice(0, 31));
    sheet.addRow(headers || []);
    for (const row of rows || []) sheet.addRow(Array.isArray(row) ? row : Object.values(row));
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    // Calibri has no Bengali glyphs, so sheets with Bangla text would open with
    // missing boxes; Nirmala UI ships with Windows and covers both scripts.
    sheet.columns.forEach((column) => {
      column.width = 20;
      column.font = { name: EXCEL_FONT, size: 11 };
    });
    sheet.getRow(1).font = { name: EXCEL_FONT, bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E4F91' } };
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

module.exports = { AssociationDatabase, SCHEMA_VERSION };
