# Bus Malik Group 1.1.0 — Build & Test Report

Date: 2026-11-01
Build host: Windows 10.0.26300 (x64)
Application version: **1.1.0**
Product name: **Bus Malik Group**

## 1. Build artifacts

| Item | Path |
| --- | --- |
| Installer | `dist-busmalikgroup-1.1.0/BusMalikGroup-Setup-1.1.0-x64.exe` |
| Installer block map | `dist-busmalikgroup-1.1.0/BusMalikGroup-Setup-1.1.0-x64.exe.blockmap` |
| Unpacked application | `dist-busmalikgroup-1.1.0/win-unpacked/Bus Malik Group.exe` |
| Update manifest | `dist-busmalikgroup-1.1.0/version.json` |
| Checksum file | `dist-busmalikgroup-1.1.0/BusMalikGroup-Setup-1.1.0-x64.exe.sha256` |
| electron-updater feed | `dist-busmalikgroup-1.1.0/latest.yml` |
| Release notes | `dist-busmalikgroup-1.1.0/release-notes.md` |
| Previous 1.0.1 installer (kept) | `dist-busmalikgroup/BusMalikGroup-Setup-1.0.1-x64.exe` |

Installer size: 104,258,013 bytes
SHA256: `f546f354edcac0e3ff4ed958c0753d3ad18dd709526f37a897da10e38faabf61` (recomputed and matched against the `.sha256` file)

Build command used:

```bash
npx electron-builder --win nsis --x64 \
  --config.directories.output=dist-busmalikgroup-1.1.0 \
  --config.electronDist=temp/electron-dist-build

node scripts/update-manifest.cjs \
  --out-dir dist-busmalikgroup-1.1.0 \
  --version 1.1.0 --optional --notes-file temp/notes-1.1.0.md
```

Code signing: no certificate configured, so the installer and executable are unsigned (expected; Windows SmartScreen will warn).

## 2. Automated tests

`npm test` — **124 passed, 0 failed** (12.0 s). The suite covers database operations, bus-owner import, update checks, update gate policy (22 cases) and subscription configuration.

## 3. Executed runtime checks

| Check | Result |
| --- | --- |
| Packaged executable starts | Passed (`win-unpacked/Bus Malik Group.exe`, isolated test profile) |
| Window title / branding | `Bus Malik Group`; login heading and sidebar brand `Bus Malik Group / Management System` |
| Login tagline | “Works fully offline on this computer” (previous false “syncs when connected” claim removed) |
| First-run setup (admin account) | Passed in isolated profile |
| Admin sign-in | Passed; Dashboard and all modules rendered |
| Staff sign-in | Passed; `users:list` refused with “Administrator permission is required.” |
| About / install metadata | Installed Version `1.1.0`, software name `Bus Malik Group` |
| Update gate on startup | `local_policy`, status `current`, not blocked (offline-safe first run) |
| Update check (network) | Returned `up_to_date`; older GitHub release 1.0.1 is not offered as an update |
| Subscription panel | Package `YEARLY_8000`, ৳8,000 / 365 days, missing only `business_id` + `client_key`; URL/anon key preconfigured |
| Installer, fresh install | Exit 0; registered as “Bus Malik Group 1.1.0” under `%LOCALAPPDATA%\Programs\Bus Malik Group` |
| Installed app startup | Passed; title correct, gate opened, login screen shown against the real data folder |
| Upgrade path 1.1.0 → 1.0.1 → 1.1.0 | Both installers exit 0; final registered version 1.1.0 |
| Local ledger preservation | `%APPDATA%\bus-malik-somiti\association.sqlite` byte-identical before/after installs (299,008 bytes, SHA256 `03d5ab94…5339b`) |

Not run in this pass: physical printing to a printer, and the packaged mandatory-upgrade matrix (task #10) remains pending.

## 4. Supabase status (live project `hgavhgssxmbtqiqvrsyd`)

Verified with the public anon key only:

| Table / RPC | Status |
| --- | --- |
| `packages` | 200 — `YEARLY_8000`, 8,000 BDT, 365 days, active |
| `payment_settings` | 200 — still `account_type = Merchant` for bKash/Nagad |
| `businesses` | 401 by design (RLS — anon cannot read business rows) |
| `get_business_subscription` / payment RPCs | Require valid Business ID + client key |

**Owner action still required:** run `supabase/SETUP-SQL-EDITOR.sql` once in the Supabase SQL Editor. It switches both accounts to Personal Send Money instructions and prints (or creates) the Business ID and client key. Paste those two values into Settings → Subscription in the app, then use Test Connection.

No service_role or secret key exists anywhere in the application; only the anon key is embedded, and reads/writes stay protected by RLS and server-side RPCs.

## 5. Known limitations / pending work

- **No business-data sync engine exists.** Local SQLite is the system of record and the app is fully offline. Only subscription status and payment requests communicate with Supabase. Bidirectional owner/bus/cashbook sync was not implemented; building it safely (stable IDs, conflict resolution, duplicate prevention) is a separate project. The UI no longer claims otherwise.
- **Supabase setup** (migration 2 + business registration) is blocked on the owner's SQL Editor run — no service credentials are available locally.
- **Publishing is on hold** as instructed: nothing has been committed, pushed, tagged or published. The GitHub release is still 1.0.1; after approval, upload `BusMalikGroup-Setup-1.1.0-x64.exe`, `latest.yml`, `version.json`, `release-notes.md` and the `.sha256` file to the `v1.1.0` release.
- **Dependency audit** (`npm audit --omit=dev`): 10 advisories (9 moderate, 1 high). The high advisory is `xlsx` with no fixed release; `uuid` moderate comes via `exceljs`. Outdated but working: better-sqlite3 11.10.0 → 13.0.3, Electron 35.7.5 → 45.x, pdfkit 0.16.0 → 0.20.x. These were not upgraded to avoid destabilising a working build without approval.
- **Update downloads** cannot be end-to-end tested until the 1.1.0 release assets are published to GitHub (the updater only downloads from published releases).

## 6. Completed vs pending

Completed: audit and defect fixes, rename to Bus Malik Group across UI/EXE/installer, packaged update-feed fix, offline-safe gate baseline, update integrity/backup checks, Supabase URL/anon preset, one-paste SQL setup file, documentation, 124-test suite, 1.1.0 production build, installer/upgrade/data-preservation verification.

Pending: owner runs the Supabase SQL and pastes Business ID/client key; publishing approval; optional dependency upgrades; no business-data sync.
