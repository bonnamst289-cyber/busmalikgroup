# Bus Malik Somiti Management Software

Offline-first Windows desktop software for a Bangladeshi bus owners association (Electron + plain HTML/CSS/JS + local SQLite). Bangla and English interfaces. No PHP, no cPanel, no MySQL, no online database — every record stays in the SQLite file under the current Windows user's Electron application-data directory, not in the install directory.

## Modules

Dashboard (today/monthly collection, fund balances, expenses, 12-month income vs expense chart, recent entries), Bus Owners, Buses, Routes, Members, Income & Expense with printable receipts and admin-only corrections, Cashbook (fund distribution ledger), Reports (12 report types with PDF/Excel export), Users & Permissions (per-module manage/delete rights for staff, audit log, login history), Settings & Backup (association identity, logo, automatic daily backup, restore, receipt reprint).

There is no trip-completion or monthly-dues workflow in this version: Cash In totals income transactions recorded through Income & Expense, and route charges do not create income automatically. Fund distributions are stored in a separate, idempotent ledger and cannot exceed available Cash In. Transfers and distributions are kept separate from association-wide income/expense totals.

## Development

1. Install Node.js 22 LTS (64-bit). Microsoft C++ Build Tools are *not* required — native SQLite dependencies are downloaded as Electron ABI prebuilds.
2. From this folder, run `npm.cmd install`.
3. Run `npm.cmd start`.
4. On first launch, create an administrator account. There is no seeded association or sample business data.

`npm.cmd test` runs the database and finance suite. It launches the tests inside the bundled Electron Node runtime (`scripts/test.cjs`) because `better-sqlite3` is compiled for Electron's ABI, not the system Node version.

## Windows release

Run `npm.cmd run dist:win`. Electron Builder regenerates `assets\app.ico` (multi-size, 256×256 included), fetches the Electron-ABI SQLite binary, and writes two x64 artifacts to `dist\`:

- `Bus Malik Somiti Setup 1.0.0.exe` — NSIS installer, chooses install folder, creates Start Menu and desktop shortcuts.
- `Bus Malik Somiti 1.0.0.exe` — portable executable.

The database, owner photographs, and generated receipts live beneath `%APPDATA%\bus-malik-somiti\` (Electron's `userData` directory). Back up the database from Settings before uninstalling or moving computers. Reinstalling or updating the app does not intentionally delete this folder.

## Documentation

- [বাংলা ব্যবহার নির্দেশিকা](docs/USER-MANUAL-BN.md) — day-to-day use of every module.
- [ইনস্টলেশন গাইড](docs/INSTALL-BN.md) — installer, portable exe, first-run setup, troubleshooting.
- [ব্যাকআপ ও পুনরুদ্ধার গাইড](docs/BACKUP-RESTORE-BN.md) — automatic daily backup, manual backup, verified restore.
- [ডাটাবেজ স্কিমা](docs/DATABASE-SCHEMA-BN.md) — tables, columns, integrity rules, migrations.

## Financial storage

Amounts are entered in BDT and stored as integer poisha (`*_paisa` columns). Money is only ever rounded at the input boundary.

## Security

- scrypt password hashing with a per-user salt; the password is never stored or logged.
- All SQL goes through better-sqlite3 prepared statements with bound parameters.
- Role-based access: staff can read by default; manage/delete rights are granted per module by an administrator, and only an administrator may correct or delete a posted transaction, change association settings, manage users, or restore a backup. At least one active administrator is always kept.
- Electron renderer runs with `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, a Content-Security-Policy, and a `contextBridge` preload that exposes only the named APIs the interface uses.
- Writes happen against a WAL-mode database with foreign keys enforced, so a crash leaves the file recoverable; restore validates `integrity_check` and required tables before replacing anything and keeps a timestamped copy of the database it replaced.
