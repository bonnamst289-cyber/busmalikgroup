# Bus Malik Somiti Management Software

Offline-first Windows desktop software for a Bangladeshi bus owners association (Electron + plain HTML/CSS/JS + local SQLite). Bangla and English interfaces. No PHP, no cPanel, no MySQL, no online database — every record stays in the SQLite file under the current Windows user's Electron application-data directory, not in the install directory.

## Modules

Dashboard (association totals, Cash In/Cash Out totals, available cash, total fund balance, recent Cashbook activity, fund balances), Bus Owners, Buses, Routes, Members, Cashbook (route-based Cash In, route and fund-based Cash Out, fund-wise balances and transaction history, admin Delete All for each list), Bank Management (bank accounts, Fund → Bank deposits, deposit history, bank report), Reports (Cash In, Cash Out, bus, owner, route, member, receipt and fund reports with A4 print/PDF/Excel export), Cash In Report (dedicated black-and-white A4 statement filtered by date range, route and bus status, with bus status summary, bus list, Regular/Holiday Cash In details, print and PDF download), Users & Permissions (per-module manage/delete rights for staff, audit log, login history), Settings & Backup (association identity, phone number, logo, automatic daily backup, restore, receipt reprint).

Bus owners can be bulk-imported from `.xlsx`, `.xls`, or `.docx` files using the six fields Bus Owner Name, Bus Number, Father's Name, Mobile Number, Address, and Status. Columns are matched by heading (Bangla or English, any order, including the old 13-column template), owner name, bus number, father's name and mobile are required, and mobiles are normalized to `01XXXXXXXXX`. Imported buses do not require a route; existing Bus Numbers are reported as duplicates and are never overwritten.

There is no standalone Trip Management, Monthly Chanda, Fund Distribution, or Income & Expense entry module. Cash In is recorded in Cashbook by selecting a route and entering completed trips; the route's saved per-trip amount is applied automatically. Cash Out is recorded by selecting a route and the trip count; every fund assigned to that route is loaded and selected automatically, each fund's saved per-trip amount is applied, and the Grand Total is saved as one multi-fund Cash Out batch. Historical income and distribution entries remain preserved and are included in Cash In and Cash Out totals. Cash Out cannot exceed available Cash In.

The Cash In Report is a read-only statement built entirely from live database rows. Date range, route (or All Routes) and bus status (All/Active/Inactive) drive the bus status summary, the route's bus list, and every Cash In transaction in the period — Regular and Holiday rows together, each with Total Amount = Per Trip Amount × Total Trip. The bus list shows Serial, Bus Number and Father's Name only. Printing shows only the statement (no navigation or filter controls) on A4 portrait with repeating table headers and Prepared By / Authorized Signature lines; Download PDF produces the same black-and-white A4 document.

Bank Management records multiple bank accounts (name, branch, account holder, account number, type, optional routing number, opening balance) and moves money from a fund into a bank. A deposit is a transfer, not income: it is never added to Cash In or the Cashbook, it reduces the selected fund's balance, and it increases the selected bank's balance by the same amount. The fund balance can never go negative and a deposit cannot exceed the fund's available balance; every deposit is written with its fund debit and bank credit inside one database transaction, and admin edits or deletions re-derive both balances from the stored rows. A bank that already has deposits cannot be deleted, duplicate Transaction IDs are rejected per bank, and every change is written to the audit log. The page shows total bank balance, total deposit, number of banks, bank-wise balances, deposit history filtered by date range and bank, and a bank-wise plus fund-wise report with A4 print and PDF download.

## Development

1. Install Node.js 22 LTS (64-bit). Microsoft C++ Build Tools are *not* required — native SQLite dependencies are downloaded as Electron ABI prebuilds.
2. From this folder, run `npm.cmd install`.
3. Run `npm.cmd start`.
4. On first launch, create an administrator account. There is no seeded association or sample business data.

`npm.cmd test` runs the database, finance, file-reader, and bus-owner import persistence tests. It launches the tests inside the bundled Electron Node runtime (`scripts/test.cjs`) because `better-sqlite3` is compiled for Electron's ABI, not the system Node version.

## Windows release and automatic updates

Run `npm.cmd run dist:win`. Electron Builder regenerates `assets\app.ico` (multi-size, 256×256 included), fetches the Electron-ABI SQLite binary, and writes x64 artifacts to `dist\`:

- `BusMalikSomiti-Setup-<version>-x64.exe` — NSIS installer; asks for an install folder (defaults per-user, no admin rights), creates Start Menu and desktop shortcuts, and never deletes the user's data on uninstall.
- `BusMalikSomiti-Setup-<version>-x64.exe.blockmap` and `latest.yml` — what the installed app reads to find and verify the next release.

`build.publish` points the app at GitHub Releases (`provider: github`, `owner: bonnamst289-cyber`, `repo: busmalikgroup`). No token ships inside the EXE or the installer: `resources\app-update.yml` only carries owner/repo/provider, and the only credential used is GitHub's built-in `secrets.GITHUB_TOKEN`, which lives in GitHub Actions and never in this repository.

To publish a release, push a version tag:

```
npm.cmd run dist:win          # optional local check
git tag v1.0.1 && git push origin v1.0.1
```

The `Windows release` workflow builds on `windows-latest`, refuses to publish unless the tag, `package.json` version and a new CHANGELOG entry agree, and then uploads `latest.yml`, the Setup `.exe` and its blockmap to that GitHub Release. Installed copies check for updates about eight seconds after launch and every six hours after that, ask before downloading, and — once the download finishes — show the install-now and remind-me-later buttons in the current interface language (in Bangla: 「ইনস্টল করে রিস্টার্ট করুন」 and 「পরে মনে করিয়ে দিন」).

## Data location

The database, owner photographs, generated receipts, logos, backups and pre-migration database copies live beneath `%APPDATA%\bus-malik-somiti\` (Electron's `userData` directory), never in the install folder, so installing, updating or uninstalling cannot remove the ledger. Before any schema migration the app copies the database to `pre-migration-backups\`, verifies the copy, and refuses to migrate if the backup cannot be written. Back up from Settings before moving computers.

## Documentation

- [বাংলা ব্যবহার নির্দেশিকা](docs/USER-MANUAL-BN.md) — day-to-day use of every module.
- [ইনস্টলেশন গাইড](docs/INSTALL-BN.md) — installer, first-run setup, auto-update behaviour, troubleshooting.
- [ব্যাকআপ ও পুনরুদ্ধার গাইড](docs/BACKUP-RESTORE-BN.md) — automatic daily backup, manual backup, verified restore.
- [ডাটাবেজ স্কিমা](docs/DATABASE-SCHEMA-BN.md) — tables, columns, integrity rules, migrations.
- [স্বয়ংক্রিয় আপডেট গাইড](docs/UPDATES-BN.md) — electron-updater + GitHub Release provider, version management, the Actions release flow, data-safety guarantees and the measured real-Windows update test.

## Financial storage

Amounts are entered in BDT and stored as integer poisha (`*_paisa` columns). Money is only ever rounded at the input boundary.

## Security

- scrypt password hashing with a per-user salt; the password is never stored or logged.
- All SQL goes through better-sqlite3 prepared statements with bound parameters.
- Role-based access: staff can read by default; manage/delete rights are granted per module by an administrator, and only an administrator may correct or delete a posted transaction, change association settings, manage users, or restore a backup. At least one active administrator is always kept.
- Electron renderer runs with `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, a Content-Security-Policy, and a `contextBridge` preload that exposes only the named APIs the interface uses.
- Writes happen against a WAL-mode database with foreign keys enforced, so a crash leaves the file recoverable; restore validates `integrity_check` and required tables before replacing anything and keeps a timestamped copy of the database it replaced.
