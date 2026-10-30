# Bus Malik Somiti Management Software

Offline-first Windows desktop software for a Bangladeshi bus owners association. Data is kept in SQLite under the current Windows user's Electron application-data directory; it is not stored in the install directory.

## Development

1. Install Node.js 22 LTS (64-bit) and the Microsoft C++ Build Tools if native SQLite dependencies need local compilation.
2. From this folder, run `npm.cmd install`.
3. Run `npm.cmd start`.
4. On first launch, create an administrator account. There is no seeded association or sample business data.

Run database and finance tests with `npm.cmd test`.

## Windows release

Run `npm.cmd run dist:win`. Electron Builder creates an x64 NSIS installer and a portable executable in `release\`. The installer creates Start Menu and desktop shortcuts. `assets\app.ico` is generated from source by `npm.cmd run build:icon`.

The database, owner photographs, and generated receipts live beneath `%APPDATA%\bus-malik-somiti\` (Electron's `userData` directory). Back up the database from Settings before uninstalling or moving computers. Reinstalling or updating the app does not intentionally delete this folder.

## Financial storage

Amounts are entered in BDT and stored as integer poisha. A paid trip posts one linked fund transaction; authorized trip corrections update that linked transaction and are recorded in the audit log. Transfers are recorded separately and are excluded from association-wide income/expense totals.

See [the Bangla user manual](docs/USER-MANUAL-BN.md) for daily use and backup steps.
