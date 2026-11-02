# Automatic updates: central policy, mandatory gate, release and rollback

This document is the operating guide for the Windows updater. The application uses **electron-updater** with a public **GitHub Releases** feed for the installer, and a separate **central version policy** (`version.json` on the latest release) for the mandatory minimum version. All ledger data stays in `%APPDATA%\bus-malik-somiti\`, outside the install folder, so replacing program files never touches the database.

Repository: `https://github.com/bonnamst289-cyber/busmalikgroup`

## Why installed users did not receive changes

The updater was not broken. Release `v1.0.1` was the newest GitHub release, and `package.json` was still `1.0.1`. No newer version existed, so every installed copy correctly reported "up to date". The release workflow publishes only for a `v*.*.*` tag (or a manual publish run); pushing to `main` builds and tests but does not publish. The latest `main` run also failed on the date-dependent dashboard test, which has now been fixed.

Two further faults were found and fixed:

1. No published release ever carried `version.json` or the installer `.sha256`, so SHA256 verification, release notes and the mandatory flag could never activate. The workflow now builds and uploads both, and refuses to publish if either is missing.
2. A check used to start the 100 MB download by itself, so "Check for Updates" stayed busy for the whole download and offices paid for bandwidth they did not ask for. A check now only announces the release; the download starts on **Update now**. An explicit check also clears an earlier reminder or skip so it can never answer "up to date" while a release exists.

A release must be created after the code changes, with a version higher than every installed copy.

## Files and artifacts

| File | Purpose |
|---|---|
| `src/updater/controller.cjs` | Update state machine, release manifest, SHA256 verification, download, install, history, automatic-check preference, gate enforcement inside the controller |
| `src/updater/gate.cjs` | Central version policy: fetch, validation, minimum-version decision, offline grace, clock-tamper detection |
| `src/updater/policy.cjs` | Snooze and skipped-version rules (optional releases only) |
| `src/updater/version.cjs` | Semantic version comparison |
| `src/main.cjs` | Boot order and the IPC allowlist that blocks login and data channels while the gate is closed; `backupBeforeUpdate` |
| `scripts/prepare-release.cjs` | Blocks a release unless tag, `package.json` version and a valid UTF-8 `CHANGELOG.md` section agree |
| `scripts/update-manifest.cjs` | Generates `version.json` (central policy), `release-notes.md` and the installer `.sha256` |
| `.github/workflows/windows-release.yml` | Builds, tests, validates the policy and publishes the Windows release |
| `tests/update.test.cjs` | Updater, release-manifest and optional-update tests |
| `tests/update-gate.test.cjs` | Central policy, minimum-version gate, offline grace, clock rollback, mandatory install/restart tests |
| `docs/UPDATES-BN.md` | Bengali updater guide |

Each release publishes:

- `BusMalikGroup-Setup-<version>-x64.exe`
- `BusMalikGroup-Setup-<version>-x64.exe.blockmap`
- `latest.yml` (electron-updater download feed with SHA512)
- `version.json` (version, download URL, SHA256, notes, release date, mandatory flag, size)
- `BusMalikGroup-Setup-<version>-x64.exe.sha256`
- `release-notes.md` content as the GitHub release body

`version.json` is fetched by the app from the latest-release alias, not from the install folder. If it is missing, the app still uses `latest.yml` and electron-updater's SHA512 check, but the mandatory minimum cannot be confirmed. If it is present, the downloaded installer must match its SHA256 before the install button is enabled.

## Central version policy (mandatory minimum)

The mandatory gate is driven only by the **central** manifest, never by a local `version.json`, cached download or `state.json`:

```
https://github.com/bonnamst289-cyber/busmalikgroup/releases/latest/download/version.json
```

`version.json` fields:

| Field | Meaning |
|---|---|
| `latest_version` | Newest published version (`x.y.z`) |
| `minimum_required_version` | Oldest version still allowed to sign in |
| `download_url` | HTTPS URL of the installer on GitHub Releases |
| `sha256` | 64-hex SHA256 of that installer |
| `release_notes` | Text shown on the mandatory page (localised content preferred) |
| `mandatory` | `true` means no Skip / Remind me later for this release |
| `release_date` | ISO date of publication |

Camel-case aliases (`version`, `downloadUrl`, `releaseNotes`, `releaseDate`) are accepted for older manifests. Validation rejects a non-semver version, a minimum newer than the latest, a non-HTTPS or non-GitHub download URL, and a malformed SHA256. The fetcher sends `Cache-Control: no-cache`, a short timeout and follows GitHub redirects.

> **Deployment:** publish `version.json` with the release as early as possible. A fresh install that has never seen a policy can still start offline: the installed build becomes its own baseline (`local_policy`) until the first successful fetch, and that baseline is never cached. As soon as a policy is fetched, its `minimum_required_version` is enforced and the offline rules below apply. This avoids bricking a clean install before the policy asset is uploaded, without letting any build claim a newer version.
>
> The packaged application reads the feed location from `resources/app-update.yml`, because electron-builder removes the `build` block from the packaged `package.json`. `dev-app-update.yml` is used only for the forced development check.

### Gate decisions

| Condition | Result |
|---|---|
| Installed version >= `minimum_required_version` | Gate open; a newer `latest_version` is offered as an optional update |
| Installed version < minimum | `update_required`; full-screen page; sign-in and every module blocked |
| Policy online but unreachable | `connection_error`; Retry Connection; sign-in stays locked |
| Offline, installed version already known obsolete | `update_required` / `known_obsolete`; never unlocked offline |
| Offline, no policy has ever been published (`local_policy`) | Gate open for this exact build; the baseline is not cached and the first fetched policy wins |
| Offline, no policy and no local baseline (`never_verified`) | `connection_error`; locked |
| Offline, cached policy was verified for a different build (`build_unverified`) | `connection_error`; locked until one online check |
| Offline, clock rolled back (`clock_suspect`) | `connection_error`; locked |
| Offline, verified current build inside grace window | Gate open until `grace_expires_at` |
| Offline, verified current build after grace (`grace_expired`) | `connection_error`; locked |

The gate is checked as soon as the app starts and before the renderer may show sign-in, then every 30 minutes and on manual retry. Enforcement is in the main process: while the gate is closed, `register()` rejects every channel except the update channels (`updates:state|check|download|install|later|skip|auto|gate-check|apply|retry|verify`) with `UPDATE_REQUIRED`. A manipulated renderer therefore cannot reach login, setup or ledger data.

### Offline policy and clock changes

- A build that has never verified itself stays locked; there is no offline bypass for an unknown version.
- A build already known to be below the minimum stays locked offline.
- A current, verified build keeps working offline for **12 hours** (`SOMITI_OFFLINE_GRACE_HOURS`, capped at 168 hours). After the window it asks for a connection; local data is never deleted.
- The gate records the HTTP `Date` from GitHub and the highest server time seen. If the system clock moves back by more than 10 minutes, the grace window is not extended and the gate closes (`clock_suspect`). This is a deterrent, not a guarantee: a user who edits the local database or forges the network response can still tamper with an offline desktop app. The server-side check below closes that gap for online operations.

### Server-side rejection

Subscription RPC requests carry `x-app-version: <installed version>`. A server that enforces the same minimum can reject obsolete clients even if the local gate were bypassed. The app never embeds a Supabase service-role key; only the publishable/anonymous key is shipped.

### Install sequence

1. **Update now** makes sure electron-updater has release info, downloads the installer and reports progress.
2. The controller hashes the file, compares it with the central SHA256, deletes it on mismatch and stays blocked.
3. `installAndRestart()` calls `prepareInstall({ from, to })`, which writes a pre-update SQLite backup, then stores `pending_update_version` and `pending_from_version`.
4. The app closes and the NSIS installer replaces program files; the running executable is never overwritten in place.
5. On the next launch the controller compares the installed version with the pending marker, then rechecks the central policy.
6. Only after both checks pass does the window show sign-in. The marker is cleared and a `verified` history entry is written.

The flow is independent of the installation drive or folder: NSIS installs per-user to `%LOCALAPPDATA%\Programs\...` by default and `allowToChangeInstallationDirectory` is enabled, while all state lives under `%APPDATA%\bus-malik-somiti\`.

## Update behaviour

- The app checks the central policy at startup and every 30 minutes, and re-evaluates it between checks for expired grace or clock changes. Optional release lookups still run about 8 seconds after launch, then every 6 hours with up to 10 minutes of jitter.
- Automatic checking can be turned off in **Settings → Software Update** for optional releases. The choice is saved in `%APPDATA%\bus-malik-somiti\updates\state.json`; the central minimum-version gate is never disabled by this preference and manual checks still work.
- A failed GitHub lookup does not silently unlock an obsolete build. A version below the central minimum, a never-verified build, a build verified for a different version, or a clock rollback keeps the gate closed; a current, verified build gets the offline grace described above.
- Snooze hides an optional release for 24 hours. Skip hides only that version. These controls do not exist on the mandatory page, which offers **Update now**, **Retry Download** and **Verify Update** only. A release whose version is at or below `minimum_required_version` cannot be snoozed or skipped.
- The update downloads only after the user chooses **Update now** on an optional release; the mandatory page downloads only after **Update now** as well. A completed optional download installs on the next normal app close if the user chose **Remind me later**.
- The notification offers **Update now**, **Remind me later**, **Skip this version** and **Release Notes**. The notes come from `version.json`, with the GitHub release body as the fallback.
- **Check for Updates** in Settings is an explicit request: it clears an earlier reminder or skip and always shows a release that exists. The 100 MB installer is still downloaded only after **Update now**.
- Settings shows the software name, installed version, minimum supported version, latest version, release date, last check, SHA256 state, offline grace and the last 50 update actions.
- Downgrades are refused. A rollback uses a new, higher version.
- The last 50 update actions are recorded locally and the newest eight are shown in Settings. No ledger data is sent anywhere.

## Local verification

```powershell
npm.cmd test
node --test tests/update.test.cjs
node --test tests/update-gate.test.cjs
node --check src/updater/controller.cjs
node --check src/updater/gate.cjs
node --check src/main.cjs
node --check src/preload.cjs
node --check src/renderer/app.js
```

`npm test` runs both updater suites inside Electron's Node runtime. The gate suite covers policy validation, minimum-version blocking, offline states, grace expiry, clock rollback, IPC blocking, apply/download/verify/backup and the restart marker, but it uses injected fakes.

### Mandatory test matrix

| # | Required case | Covered by |
|---|---|---|
| 1 | Install on C: and D: and update | NSIS per-user install is location-independent; verify the real installer on both drives |
| 2 | Install in a custom folder and update | `allowToChangeInstallationDirectory`; verify with the real installer |
| 3 | Mandatory release blocks older install | `update-gate.test.cjs` below-minimum, IPC block, real gate screenshots |
| 4 | Old EXE launched directly | Same binary path, central check on every launch; verify with a copied old EXE |
| 5 | Login bypass attempt | `register()` rejects non-update channels; renderer hides auth/app |
| 6 | Offline startup | offline `never_verified`/`grace_expired`/`clock_suspect` tests |
| 7 | Disconnect during download | `retryDownload()` test with a failed pending work |
| 8 | Invalid SHA256 | corrupt-download test deletes the file and stays blocked |
| 9 | Failed install | `prepareInstall` rejection test aborts install and keeps the app on the page |
| 10 | Successful update | apply test: download, SHA256, backup, pending marker, install call |
| 11 | Restart verification | restart test verifies the marker and clears it |
| 12 | Database preserved | `backupBeforeUpdate` test writes `pre-update-backups/*.sqlite`, keeps newest 3 |
| 13 | Admin sign-in after update | real installed upgrade test (section 8 of `docs/UPDATES-BN.md`) |
| 14 | Cashier/Staff sign-in after update | same installed test with each role |
| 15 | Mixed versions | minimum-version policy blocks every version below the minimum |

Cases 1, 2, 4, 13, 14 and the full packaged upgrade still need a real installed run on each target machine; do not claim a packaged mandatory upgrade until that run is recorded.

To exercise the real app updater against a local feed, follow section 8 of `docs/UPDATES-BN.md`. A full end-to-end test needs two installed versions of a separate test product; do not claim an update works until an older installed build has actually upgraded to a newer release.

## Release procedure

Run these commands in a real clone that has `.git`; the current Windows workspace may not contain repository metadata.

**Publishing is on hold.** Nothing is committed, tagged or published until the owner explicitly approves a release. The commands below are paste-safe and are not run automatically.

1. Confirm the clone is clean and current:

```powershell
git status
git switch main
git pull origin main
```

2. Bump the version. For example, from `1.0.1` to `1.0.2`:

```powershell
npm.cmd version patch --no-git-tag-version
```

Use `minor` or `major` when appropriate. This updates `package.json` and `package-lock.json` but does not create a tag.

3. Add a UTF-8 section to `CHANGELOG.md` using exactly the new version:

```markdown
## [1.0.2] — 2026-11-01

- Fixed the dashboard date test.
- Added verified update manifests and update history.
```

The section must not be empty and must not contain replacement characters or a line of `???`. `prepare-release.cjs` blocks corrupted notes so release notes cannot become unreadable again.

4. Run the same release gate used by CI:

```powershell
node scripts/prepare-release.cjs v1.0.2
```

This writes `dist/release-notes.md` and fails if the tag, package version and changelog disagree.

5. Run the tests and, if desired, a local build:

```powershell
npm.cmd test
npm.cmd run dist:win
node scripts/update-manifest.cjs --version 1.0.2
```

The local build must produce `dist/latest.yml`, the Setup `.exe`, `version.json` and the `.sha256` file. The workflow performs the same manifest step, so a local build is optional for publishing.

By default `update-manifest.cjs` writes `minimum_required_version` equal to `--version` and `mandatory: true`, which blocks every lower install. To publish an optional release that only offers an update, pass `--optional` (minimum `0.0.0`, `mandatory: false`). To keep an older minimum while publishing a newer build, pass `--minimum-version 1.0.1`. The CI manifest check rejects a minimum newer than the latest and a malformed SHA256.

6. Commit the version and notes, push `main`, then push the tag:

```powershell
git add package.json package-lock.json CHANGELOG.md
git commit -m "Release v1.0.2"
git push origin main
git push origin v1.0.2
```

The `main` push runs build and tests only. The tag push runs the release workflow and publishes the assets.

A tag push always publishes a **mandatory** policy: `minimum_required_version` becomes the tagged version, so every older install is blocked until it upgrades. Use a manual `workflow_dispatch` run with `mandatory: false` and a blank `minimum_version` only when you deliberately want an optional release.

7. Watch **Actions → Windows build and release** and verify the release:

```powershell
gh run list --workflow windows-release.yml --limit 3
gh release view v1.0.2
```

All of these must be present before announcing the release:

- Setup `.exe`
- `.blockmap`
- `latest.yml`
- `version.json` containing all seven policy fields
- `.sha256`

8. Install the previous version on a test machine or separate test product, then let it update to the new tag. Confirm that sign-in is blocked before the update, that the update downloads and verifies, that the app restarts on the new version, and that sign-in unlocks only after the central policy recheck. Check the installed version after restart and run `PRAGMA integrity_check` on a copy of the database. Only then report that automatic updating is verified.

## GitHub Actions notes

- `permissions: contents: write` and the built-in `GITHUB_TOKEN` are sufficient. No PAT is stored in the repository, installer, app, or `app-update.yml`.
- A post-build step reads `dist/win-unpacked/resources/app-update.yml` and fails if a token is present or the repository is wrong.
- The release step checks for every asset and fails rather than publishing an incomplete release.
- The publish step compares the new version with every published `vX.Y.Z` tag and refuses to publish an older version. Re-running the same tag is allowed and replaces its assets.
- Branch and pull-request builds upload a workflow artifact and never publish a release.
- Manual publish: run the workflow with `publish: true`. `mandatory` defaults to `true`; set it to `false` for an optional release. `minimum_version` (blank = this release) sets the oldest version still allowed. The current `package.json` version and matching changelog section still apply.
- The policy step fails if `version.json` is missing any of the seven fields, if `latest_version` differs from the built version, if the minimum is newer than the latest, or if the SHA256 is not 64 lowercase hex characters.

## Feed verification (no install)

A throwaway Electron app whose `package.json` reports an older version can confirm what installed copies see, without installing anything:

```powershell
# .tmp-update-live/package.json -> {"version":"1.0.1","main":"main.js"}
# .tmp-update-live/dev-app-update.yml -> provider: github / owner / repo
# main.js: require('electron-updater').autoUpdater.forceDevUpdateConfig = true
#          then checkForUpdates() and print update-available / update-not-available
npx electron .tmp-update-live
```

On 2026-11-01 a probe reporting `1.0.0` found `1.0.1` from the live GitHub release, and a probe reporting `1.0.1` correctly found nothing newer. This proves the feed, tag naming and installer asset are reachable; it does not replace the installed-version test in step 8 above.

## Code signing

The current installer is **unsigned**, so Windows SmartScreen may show "unknown publisher". Unsigned builds can still update; the SHA512 from `latest.yml` and the optional SHA256 from `version.json` verify file integrity, not the publisher's identity.

For a trusted publisher signature, buy an Authenticode code-signing certificate and keep it out of the repository. Electron Builder accepts a PFX through environment variables:

```powershell
$env:CSC_LINK = "C:\secure\bus-malik-somiti.pfx"
$env:CSC_KEY_PASSWORD = "<certificate-password>"
npm.cmd run dist:win
```

For GitHub Actions, store the PFX as a base64 secret named `WIN_CSC_LINK` and its password as `WIN_CSC_KEY_PASSWORD`, then expose them to the build step:

```yaml
env:
  CSC_LINK: ${{ secrets.WIN_CSC_LINK }}
  CSC_KEY_PASSWORD: ${{ secrets.WIN_CSC_KEY_PASSWORD }}
```

Electron Builder signs both the application and the NSIS installer. Verify locally:

```powershell
Get-AuthenticodeSignature "dist\BusMalikGroup-Setup-1.0.2-x64.exe" | Format-List
```

Use SHA256 with RFC 3161 timestamping. A hardware-token or cloud-signing certificate needs a custom signing command; do not export a token certificate to a file. Signing does not replace the update hash checks and does not change the database or install path.

## Rollback

The app refuses to install an older version. Do not reuse or move a tag, and do not lower `package.json` to roll back. A lower release will not reach installed copies.

### Roll back a bad release

1. Pick the last known-good commit or tag, for example `v1.0.1`.
2. Create a new branch from it, but publish a **higher** version, for example `1.0.3`, containing the fix or the reverted code.
3. Add a changelog section for `1.0.3`, run `prepare-release.cjs`, commit, tag `v1.0.3`, and publish normally.
4. Verify that installed `1.0.2` copies update to `1.0.3`.

Deleting the bad GitHub release does not downgrade machines that already installed it. Published tags and versions are permanent for update purposes.

### Roll back one machine immediately

1. Back up the ledger from **Settings → Backup**, or copy `%APPDATA%\bus-malik-somiti\association.sqlite` while the app is closed.
2. Uninstall the bad build. The NSIS uninstaller does not delete `%APPDATA%` data because `deleteAppDataOnUninstall` is false.
3. Install the older Setup `.exe` manually.
4. If the bad build performed a schema migration, the older app may not understand the newer database. In that case stop and restore the relevant `pre-migration-backups\` copy with support; do not experiment on the live ledger.

The next update check will offer the higher fixed version again.

## Troubleshooting

| Symptom | Check |
|---|---|
| Always "up to date" | `gh release view` must show a version higher than the installed `package.json`; the tag workflow must be green |
| Sign-in is locked before the login page | Installed version is below `minimum_required_version` in the central `version.json`, or the policy could not be verified yet. The page shows Current, Required and Latest; use **Update now** |
| Update page shows "connect to the internet" | The policy has not been verified for this build, the grace window expired, or the system clock moved back. Use **Retry Connection**; data is untouched |
| `version.json` 404 | The tag exists but the asset is missing. Re-run the workflow or publish a new higher version |
| `version.json` rejected | Check the seven fields, semver, minimum <= latest, HTTPS GitHub download URL and 64-hex SHA256 |
| SHA256 failed | The downloaded file does not match the manifest. It is deleted automatically; do not install; retry, then publish a corrected higher release |
| Retry Download does nothing | A download is already running; wait for it to finish or fail, then retry |
| Offline notice on a current build | Expected within the grace window; local work continues. After the window a connection is required for one check |
| Offline notice on an old build | Intended: a version below the minimum cannot be unlocked offline. Connect and update |
| Portable build | Portable installs cannot update themselves; use the Setup installer |
| SmartScreen warning | Unsigned installer; sign it as described above |
| Installer did not start | Antivirus/SmartScreen may block `quitAndInstall`; retry or install the Setup file manually. The database remains untouched |
| Stuck on the update page after installing | The installed version still reads low, or the central policy still lists a higher minimum. Reopen the app; check `resources/app.asar` `package.json` and the release `version.json` |
| Notes show `???` | The changelog was saved with the wrong encoding; rewrite the section as UTF-8. The release gate now blocks this |
