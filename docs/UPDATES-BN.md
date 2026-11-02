# স্বয়ংক্রিয় সফটওয়্যার আপডেট সিস্টেম — Bus Malik Group

এই সিস্টেমে আপডেট সোর্স = **GitHub Release** (`https://github.com/bonnamst289-cyber/busmalikgroup`), আপডেট ইঞ্জিন = **electron-updater**, ইনস্টলার = **electron-builder NSIS (per-user, x64)**। এর সঙ্গে আছে **কেন্দ্রীয় ভার্সন নীতি** (`version.json`) — যা ঠিক করে কোন পুরোনো ভার্সন আর লগইন করতে পারবে না।

এই নথির প্রতিটি তথ্য কোড ও বিল্ড আউটপুট থেকে নেওয়া। কোনো কিছু "হওয়া উচিত" বলে লেখা হয়নি — নম্বর ও ফাইলের নাম সবই বিল্ড/পরীক্ষা থেকে নেওয়া।

---

## ০. আগের সিস্টেমের সাথে কী বদলাল

আগে প্রায় ১,১০০ লাইনের কাস্টম আপডেটার ছিল (Supabase Storage-এ স্বাক্ষরিত `manifest.json`, নিজস্ব zip ডাউনলোড, ফোল্ডার-স্ব্যাপ, runner প্রসেস, Ed25519 signing key, রোলব্যাক জার্নাল)। সেই সিস্টেম কখনো চলেনি — `updater.config.json`-এর URL ছিল placeholder (`REPLACE-ME`), তাই আপডেট চিরকাল "নিষ্ক্রিয়" অবস্থায় থাকত।

এখন সেটি **electron-updater** দিয়ে পুরোপুরি প্রতিস্থাপিত হয়েছে। যেসব জিনিস বাদ গেছে: আলাদা updater প্রসেস, manifest স্বাক্ষর, signing key, নিজস্ব zip-swap, রোলব্যাক জার্নাল, `npm run updates:keys` / `updates:publish` স্ক্রিপ্ট, Supabase সেটআপ।

কেন প্রতিস্থাপন নিরাপদ: electron-updater-এর NSIS প্রবাহে ডাউনলোড হওয়া `Setup.exe`-ই ইনস্টল ফোল্ডার বদলায় (অ্যাপ বন্ধ করে ইনস্টলার চালু হয়), আর ডাটাবেজ ইনস্টল ফোল্ডারের **বাইরে** `userData`-তে থাকে — তাই কাস্টম ডেটা স্পর্শই লাগে না। রোলব্যাকের দরকার পড়ে না: ইনস্টলার ব্যর্থ হলে পুরোনো ইনস্টল অক্ষুণ্ণ থাকে।

**অ্যাপের UI-এর state contract বাড়ানো হয়েছে** — আগের `status`, `download.percent`, `release_notes`, IPC চ্যানেল `updates:state|check|download|install|later|skip` অপরিবর্তিত, সঙ্গে যোগ হয়েছে `auto_update`, `checksum`, `history`, `latest_version` এবং `updates:auto`। Settings-এ স্বয়ংক্রিয় চেক বন্ধ/চালু ও শেষ আপডেটগুলোর ইতিহাস দেখা যায়। "এখনই আপডেট করুন" / "পরে মনে করিয়ে দিন" / "এই ভার্সন বাদ দিন" তিনটিই আগের মতো আছে।

> ২০২৬-১১-০১ হালনাগাদ: প্রতিটি রিলিজে `version.json` ও ইনস্টলারের `.sha256` যায়। `version.json` এখন **কেন্দ্রীয় নীতি**: এতে `minimum_required_version` থাকলে তার চেয়ে পুরোনো সব ইনস্টল লগইনের **আগেই** ব্লক হয়, ড্রাইভ/ফোল্ডার যাই হোক। বিস্তারিত পরের অধ্যায়ে। ইংরেজি নির্দেশনা: `docs/AUTO-UPDATE.md`।

---

## ১. কোন ফাইলে কী

| ফাইল | কাজ |
|---|---|
| `package.json` → `build.publish` | GitHub release provider (owner `bonnamst289-cyber`, repo `busmalikgroup`, `releaseType: release`, `vPrefixedTagName: true`) |
| `package.json` → `build.nsis` | per-user, `oneClick: false`, ইনস্টল ফোল্ডার বদলানো যায়, `deleteAppDataOnUninstall: false`, artifact নাম `BusMalikGroup-Setup-${version}-${arch}.exe` |
| `src/updater/controller.cjs` | electron-updater-এর ইভেন্ট → অ্যাপের snapshot state; চেক টাইমার, snooze/skip, `version.json` পড়া, SHA256 যাচাই, ডাউনলোড progress, ইনস্টল, auto-update পছন্দ, history ও গেট প্রয়োগ |
| `src/updater/gate.cjs` | কেন্দ্রীয় নীতি নামানো ও যাচাই, `minimum_required_version` সিদ্ধান্ত, অফলাইন grace, ঘড়ি-পাল্টানো ধরার নিয়ম |
| `src/main.cjs` | বুট ক্রম (উইন্ডোর আগে চেক) ও IPC অনুমোদন-তালিকা — গেট বন্ধ থাকলে লগইন/সেটআপ/ডেটার সব চ্যানেল `UPDATE_REQUIRED` দিয়ে বন্ধ; `backupBeforeUpdate` |
| `src/updater/policy.cjs` | snooze/skip সিদ্ধান্ত (শুধু ঐচ্ছিক রিলিজে) |
| `src/updater/version.cjs` | semver তুলনা |
| `dev-app-update.yml` | `npm start` + `SOMITI_UPDATES_FORCE=1` হলে এই ফিড পড়ে (প্রকাশকের স্বয়ংক্রিয় পরীক্ষার জন্য) |
| `scripts/prepare-release.cjs` | tag ↔ `package.json` version ↔ CHANGELOG section মিলিয়ে রিলিজ নোট তৈরি — না মিললে বা নোটে corrupted character থাকলে `RELEASE BLOCKED` |
| `scripts/update-manifest.cjs` | `dist/version.json` (কেন্দ্রীয় নীতি), `dist/release-notes.md` ও ইনস্টলারের `.sha256` তৈরি করে |
| `.github/workflows/windows-release.yml` | ট্যাগ push → build → test → NSIS → manifest/checksum → GitHub Release প্রকাশ |
| `src/database.cjs` | `PRAGMA user_version` স্কিমা-স্ট্যাম্প + migration-এর আগে backup copy |
| `tests/update.test.cjs` | updater state machine, manifest validation, SHA256, downgrade ও auto-update টেস্ট (নকল updater দিয়ে) |
| `tests/update-gate.test.cjs` | কেন্দ্রীয় নীতি, minimum-version ব্লক, অফলাইন অবস্থা, grace, ঘড়ি, IPC ব্লক, apply/verify/backup ও রিস্টার্ট মার্কার |

electron-builder বিল্ডের সময় `resources/app-update.yml` তৈরি করে, যা EXE-এর ভেতরে (`app.asar`-এর পাশে) বসে যায়:

```yaml
owner: bonnamst289-cyber
repo: busmalikgroup
provider: github
releaseType: release
vPrefixedTagName: true
updaterCacheDirName: bus-malik-somiti-updater
```

এটিই ইনস্টল করা সফটওয়্যারের **আপডেট URL** — কোনো token, কোনো secret নেই। রিপো public, তাই anonymously `latest.yml` পড়া ও asset নামানো যায়।

---

## ২. আপডেট প্রবাহ

```
অ্যাপ চালু (ইনস্টল করা ভার্সন, portable/ডেভ নয়)
  └─ অ্যাপ চালুর সঙ্গে সঙ্গে কেন্দ্রীয় version.json চেক (লগইনের আগে; প্রতি ৩০ মিনিটে আবার)
       ├─ ইনস্টল >= minimum_required_version → গেট খোলা → লগইন দেখায়
       └─ ইনস্টল < minimum  → update_required → পূর্ণ-স্ক্রিন আপডেট পেজ (কোনো লগইন/স্কিপ/পরে নয়)
  └─ auto-update চালু থাকলে ৮ সেকেন্ড পরে প্রথম চেক (+ দৈব ০–১০ মিনিট), তারপর প্রতি ৬ ঘণ্টায়
       └─ electron-updater → releases/latest → latest.yml
            └─ নতুন ভার্সন → একই tag থেকে version.json (SHA256, notes)
                 ├─ নতুন নেই        → status: up_to_date
                 ├─ নেটওয়ার্ক বন্ধ   → status: offline  (গেটের সিদ্ধান্ত আলাদা: নিচে ২.ক)
                 ├─ ভুল/ব্লক        → status: error    (「আবার চেষ্টা করুন」 বোতাম)
                 └─ নতুন ভার্সন     → status: optional (অথবা mandatory)
                      └─ autoDownload = false → ব্যবহারকারীর অনুমতি ছাড়া নামে না
                           └─ ব্যবহারকারী চাপেন
                                ├─ 「এখনই আপডেট করুন」 → ডাউনলোড (প্রগ্রেস %) → SHA256 মিললে ready → 「ইনস্টল করুন」
                                │      └─ প্রি-আপডেট DB backup → pending marker → quitAndInstall → NSIS → নতুন ভার্সন চালু → পুনরায় কেন্দ্রীয় চেক → লগইন
                                ├─ 「পরে মনে করিয়ে দিন」 → ২৪ ঘণ্টা নীরব (শুধু ঐচ্ছিক রিলিজ)
                                └─ 「এই ভার্সন বাদ দিন」 → ওই ভার্সন সংক্রান্ত notice বন্ধ (শুধু ঐচ্ছিক রিলিজ)
```

ঠিক করা নিয়মগুলো:

- `autoDownload = false` — হিসাবের সফটওয়্যার চুপচাপ বন্ধ হয়ে ইনস্টল হওয়া মেনে নেওয়া যায় না; ইনস্টল সবসময় ব্যবহারকারীর ক্লিক।
- বিজ্ঞপ্তিতে **এখনই আপডেট করুন**, **পরে মনে করিয়ে দিন**, **এই ভার্সন বাদ দিন** ও **রিলিজ নোট** — চারটি বোতাম থাকে; নোট `version.json` থেকে আসে, না পেলে GitHub Release-এর body। বাধ্যতামূলক (minimum-version) পেজে শুধু **Update now**, **Retry Download**, **Verify Update** — পরে/স্কিপ নেই।
- Settings-এর **আপডেট পরীক্ষা করুন** একটি স্পষ্ট অনুরোধ: আগের snooze/skip মুছে যায় এবং রিলিজ থাকলে সবসময় দেখায়। তবুও ১০০ MB ইনস্টলার **এখনই আপডেট করুন** না চাপা পর্যন্ত নামে না।
- Settings-এ সফটওয়্যারের নাম, ইনস্টল ও সর্বশেষ ভার্সন, প্রকাশের তারিখ, সর্বশেষ পরীক্ষা, SHA256 অবস্থা এবং শেষ ৫০টি কার্যকলাপ দেখা যায়।
- `autoInstallOnAppQuit = true` — 「পরে」 চাপলেও ডাউনলোড শেষ থাকলে অ্যাপ নিজে থেকে বন্ধ করার সময় ইনস্টল হয়ে যায়।
- `allowDowngrade = false` — কম ভার্সনে ফেরা যায় না; rollback করতে হলে আগের কোড থেকে **নতুন, বড়** ভার্সন প্রকাশ করতে হয়।
- `version.json` পাওয়া গেলে ডাউনলোড করা ইনস্টলারের SHA256 মিলিয়ে তবেই `ready` হয়; না মিললে ইনস্টল বোতাম আসে না। `version.json` না থাকলে electron-updater-এর `latest.yml` SHA512 যাচাই বহাল থাকে।
- Settings-এ **স্বয়ংক্রিয় আপডেট চেক** বন্ধ করলে শুধু ঐচ্ছিক রিলিজের সময়ভিত্তিক চেক বন্ধ হয়; কেন্দ্রীয় minimum-version গেট কখনো বন্ধ হয় না, আর হাতে 「আপডেট চেক করুন」 এখনও কাজ করে। পছন্দ ও শেষ ৫০টি কার্যকলাপ `state.json`-এ থাকে।
- `version.json`-এর `minimum_required_version` সিদ্ধান্ত নেয় অ্যাপ খুলবে কি না। এই নীতি সাময়িক নয় — প্রতিবার চালু হলে, লগইনের আগে এবং মডিউল খোলার আগে মূল প্রসেসে যাচাই হয়; রেন্ডারার বদলালেও লগইন ও ডেটা চ্যানেল বন্ধ থাকে।
- ডাউনলোডে একাধিক ক্লিক জোড়া লাগে না — চলমান ডাউনলোড থাকলে নতুন `startDownload()` সেই promise-এর অপেক্ষা করে।
- GitHub API-র anonymous rate limit (~৬০ ঘণ্টায় ৬০ অনুরোধ) যেন সতর্কতা না তোলে: চেকের সময় দৈবভাবে ছড়ানো, আর `403`/`rate limit`/`Forbidden` **offline** হিসেবে গণ্য (লাল error নয়)।
- চেকের ফলাফল, auto-update পছন্দ ও snooze/skip `%APPDATA%\bus-malik-somiti\updates\state.json`-এ থাকে — অ্যাপ বন্ধ-চালু করলেও মনে থাকে।
- ইনস্টলার ফাইল নামে `%LOCALAPPDATA%\bus-malik-somiti-updater\installer\`-এ আসে; ইনস্টলের পর electron-updater সেটি পরিষ্কার করে।

---

## ২.ক বাধ্যতামূলক আপডেট গেট (কেন্দ্রীয় নীতি)

নীতির একমাত্র ঠিকানা — রিলিজের ভেতরের ফাইল নয়, বরং সর্বশেষ রিলিজের স্থায়ী ঠিকানা:

```
https://github.com/bonnamst289-cyber/busmalikgroup/releases/latest/download/version.json
```

`version.json`-এর সাতটি ঘর:

| ঘর | অর্থ |
|---|---|
| `latest_version` | সর্বশেষ প্রকাশিত ভার্সন |
| `minimum_required_version` | এর চেয়ে পুরোনো ইনস্টল লগইন করতে পারবে না |
| `download_url` | GitHub Release-এর HTTPS ইনস্টলার ঠিকানা |
| `sha256` | ইনস্টলারের ৬৪-অক্ষরের SHA256 |
| `release_notes` | বাধ্যতামূলক পেজে দেখানো নোট |
| `mandatory` | `true` = কোনো স্কিপ/পরে নয় |
| `release_date` | প্রকাশের তারিখ |

যাচাই: semver না হলে, minimum > latest হলে, ঠিকানা HTTPS/GitHub না হলে বা SHA256 ভুল ফরম্যাট হলে নীতিটি **বাতিল** হয়। অ্যাপ অনুরোধে `Cache-Control: no-cache` পাঠায়, যাতে পুরোনো নীতি ধরা না পড়ে।

> **ডিপ্লয়মেন্ট:** রিলিজের সঙ্গে `version.json` যত দ্রুত সম্ভব আপলোড করুন। তবে নতুন ইনস্টল যদি কখনো কোনো নীতি না পায়, অ্যাপটি অফলাইনেও খুলবে — তখন ইনস্টল করা বিল্ডটিই নিজের বেসলাইন (`local_policy`) হয় এবং তা ক্যাশে জমা হয় না। প্রথম সফল fetch-এর পরেই প্রকাশিত `minimum_required_version` কার্যকর হয় এবং নিচের অফলাইন নিয়মগুলো চালু হয়। ফলে পলিসি আপলোডের আগে নতুন ইনস্টল লক হয়ে যাওয়ার ঝুঁকি নেই, আর কোনো বিল্ড নিজেকে নতুন ভার্সনও দাবি করতে পারে না।
>
> ইনস্টল করা অ্যাপ ফিডের ঠিকানা পড়ে `resources/app-update.yml` থেকে, কারণ electron-builder প্যাকেজড `package.json` থেকে `build` ব্লক সরিয়ে দেয়। `dev-app-update.yml` শুধু জোরপূর্বক ডেভেলপমেন্ট চেকে ব্যবহৃত হয়।

| অবস্থা | ফলাফল |
|---|---|
| ইনস্টল >= minimum | গেট খোলা; নতুন `latest_version` থাকলে ঐচ্ছিক আপডেট দেখায় |
| ইনস্টল < minimum | `update_required`; পূর্ণ-স্ক্রিন পেজ; লগইন ও সব মডিউল বন্ধ |
| নীতি পাওয়া যায়নি (অনলাইন) | `connection_error`; Retry Connection; লগইন বন্ধ |
| অফলাইন, কখনো কোনো নীতি প্রকাশ হয়নি | `local_policy`; ঠিক এই বিল্ডটি খোলে, বেসলাইন ক্যাশে জমা হয় না, প্রথম পাওয়া নীতিই জেতে |
| অফলাইন, কোনো নীতি বা লোকাল বেসলাইন নেই | `connection_error` / `never_verified`; বন্ধ |
| অফলাইন, কিন্তু ভার্সন জানা-পুরোনো | `update_required` / `known_obsolete`; অফলাইনে কখনো খোলে না |
| অফলাইন, নীতি অন্য বিল্ডের জন্য যাচাই করা | `build_unverified`; একবার অনলাইন যাচাই লাগবে |
| অফলাইন, ঘড়ি পিছিয়ে দেওয়া | `clock_suspect`; grace বাড়ে না, বন্ধ |
| অফলাইন, যাচাই করা চলতি বিল্ড grace-এর ভেতরে | খোলা থাকে `grace_expires_at` পর্যন্ত |
| অফলাইন, grace শেষ | `grace_expired`; বন্ধ |

নিরাপত্তার নিয়ম:

- **লগইনের আগেই ব্লক।** অ্যাপ চালু হওয়ার সঙ্গে সঙ্গে চেক শুরু হয়; প্রথম অবস্থাতেই `checking` = বন্ধ, তাই লগইন কখনো আগে দেখায় না। গেট বন্ধ থাকলে মূল প্রসেস `updates:*` ছাড়া সব IPC চ্যানেল `UPDATE_REQUIRED` দিয়ে প্রত্যাখ্যান করে। তাই Admin/Cashier/Staff — কেউই ঢুকতে পারে না, রেন্ডারার বদলালেও না।
- **নকল ক্লায়েন্ট।** Subscription অনুরোধে `x-app-version` হেডার যায়; সার্ভার চাইলে পুরোনো ক্লায়েন্ট প্রত্যাখ্যান করতে পারে। অ্যাপে কখনো Supabase service-role key থাকে না।
- **অফলাইন নীতি।** জানা-পুরোনো বা কখনো-যাচাই-না-হওয়া বিল্ড অফলাইনে খোলে না। যাচাই করা চলতি বিল্ড **১২ ঘণ্টা** অফলাইনে চলে (`SOMITI_OFFLINE_GRACE_HOURS`, সর্বোচ্চ ১৬৮ ঘণ্টা)। grace শেষে ইন্টারনেট চায়; ডেটা মুছে না।
- **ঘড়ি।** GitHub-এর HTTP `Date` ও সর্বোচ্চ দেখা সার্ভার-সময় সংরক্ষণ করা হয়। সিস্টেম ঘড়ি ১০ মিনিটের বেশি পিছালে grace বাড়ে না এবং গেট বন্ধ হয়।
- **সীমাবদ্ধতা (স্বীকৃত)।** অফলাইন ডেস্কটপ অ্যাপ সম্পূর্ণ tamper-proof নয় — যে ব্যবহারকারী লোকাল ডেটাবেজ/ফাইল হাতে বদলায় সে তত্ত্বগতভাবে গেট ফাঁকি দিতে পারে। অনলাইন লেনদেনে সার্ভার-সাইড `x-app-version` যাচাই সেই ফাঁক বন্ধ করে।

ইনস্টল প্রবাহ: **Update now** → ডাউনলোড ও progress → কেন্দ্রীয় SHA256 মিলিয়ে ফাইল যাচাই (না মিললে ফাইল মুছে গেট বন্ধ) → প্রি-আপডেট SQLite backup → `pending_update_version` লেখা → অ্যাপ বন্ধ → NSIS ইনস্টল → নতুন ভার্সন চালু → ইনস্টল ভার্সন যাচাই → কেন্দ্রীয় নীতি আবার চেক → তবেই লগইন। চলমান EXE কখনো জায়গায় জায়গায় বদলানো হয় না। ইনস্টল ড্রাইভ/ফোল্ডার (C:, D:, E:, কাস্টম) যাই হোক, state সবসময় `%APPDATA%\bus-malik-somiti\`-এ থাকে।

---

## ৩. ভার্সন ব্যবস্থাপনা (১.০.০ থেকে)

একটি release = একটি tag = একটি CHANGELOG section। `scripts/prepare-release.cjs` এই তিনটি মিলিয়ে দেখে, না মিললে রিলিজ আটকায়।

| ধাপ | কমান্ড |
|---|---|
| সংস্করণ বাড়ান | `npm.cmd version patch --no-git-tag-version` (package.json + lock) |
| নোট লেখা | `CHANGELOG.md`-এ `## [1.0.2] — তারিখ` section (UTF-8, খালি বা corrupted হলে চলবে না) |
| যাচাই | `node scripts/prepare-release.cjs v1.0.2` |
| পরীক্ষা | `npm.cmd test` |
| লোকাল manifest | `node scripts/update-manifest.cjs --version 1.0.2` (ঐচ্ছিক; Actions-ও করে)। ডিফল্টে `minimum_required_version` = এই ভার্সন ও `mandatory: true`; ঐচ্ছিক রিলিজে `--optional`, আর পুরোনো minimum রাখতে `--minimum-version 1.0.1` |
| প্রকাশ | `git push origin main` → `git tag v1.0.2 && git push origin v1.0.2` |

`prepare-release.cjs` যা যা আটকায়:

- tag-এর ফরম্যাট `vMAJOR.MINOR.PATCH` না হলে;
- tag ও `package.json`-এর version ভিন্ন হলে (নাহলে আপডেট লুপ);
- ঐ ভার্সনের `## [x.y.z]` section না থাকলে বা খালি থাকলে — কারণ এই নোটই GitHub Release-এর body হয়, আর github provider-এ অ্যাপের ভেতরের "রিলিজ নোট" সেই body থেকেই আসে;
- নোটে `\uFFFD` বা একাধিক `???` থাকলে (ভুল encoding) — রিলিজ নোট যাতে অখণ্ডযোগ্য না হয়।

আউটপুট: `dist/release-notes.md` + GitHub Actions output (`tag`, `version`, `notes_file`)। এরপর `update-manifest.cjs` একই নোট দিয়ে `dist/version.json`, ইনস্টলারের `.sha256` ও `dist/release-notes.md` তৈরি করে।

### ৩.ক প্রকাশ — এটিই এখন চালানো হয়েছে (v1.0.0 ও v1.0.1)

এই মেশিনে GitHub CLI (`gh` 2.103.3) ইনস্টল করা হয়েছে এবং `gh auth login` (web-browser device flow, অ্যাকাউন্ট `bonnamst289-cyber`, scopes `repo`) দিয়ে push অধিকার নেওয়া হয়েছে। token Windows-এর নিজের credential store-এ (`keyring`) থাকে — repo, installer বা EXE-তে যায় না। দুটি release-ই এই ধাপে প্রকাশিত:

```bash
git remote add origin https://github.com/bonnamst289-cyber/busmalikgroup.git
git add -A && git commit -m "…"          # version + CHANGELOG একসাথে
git push -u origin main                  # আগে build-only run, যাতে ভুল ধরা পড়ে
git tag v1.0.1 && git push origin v1.0.1 # এটিই GitHub Release প্রকাশ করে
```

Tag push-এর পর Actions → `Windows build and release` সবুজ হলে Release-এ `latest.yml`, `BusMalikGroup-Setup-<version>-x64.exe`, blockmap, `version.json` ও `.sha256` চলে আসে। পরের release-ও হুবহু এই লাইনগুলো: version বাড়ান → `CHANGELOG.md`-এ নতুন section → `node scripts/prepare-release.cjs v1.0.2` → commit → tag push।

**সতর্কতা:** tag push **সবসময় বাধ্যতামূলক** নীতি প্রকাশ করে (`minimum_required_version` = নতুন ভার্সন), ফলে সব পুরোনো ইনস্টল লগইনের আগে ব্লক হবে। শুধু ঐচ্ছিক রিলিজ চাইলে Actions → `workflow_dispatch` চালিয়ে `publish: true`, `mandatory: false`, `minimum_version` খালি রাখুন।

> **প্রকাশ স্থগিত।** এই লেখার সময় কোনো commit/tag/release করা হয়নি। মালিক স্পষ্ট অনুমতি দিলে তবেই নিচের কমান্ড চালানো হবে; এজেন্ট নিজে থেকে push/publish করে না।

repo-তে commit না থাকলে প্রথম push-এর পরেই workflow ফাইলটি Actions-এ দেখা যায়; browser-এর Releases/Actions পাতা দিয়েও যাচাই করা যায়।

---

## ৪. টোকেন নীতি

- ইনস্টল করা EXE/অ্যাপ/`app-update.yml`-এ **কোনো token নেই**। workflow-এ একটি pwsh ধাপ বিল্ড-পরবর্তী `resources/app-update.yml` পড়ে — সেখানে `token` শব্দ থাকলে বিল্ড **ব্যর্থ** হয়, আর ফাইলটি `busmalikgroup` রিপোকে ইঙ্গিত না করলেও ব্যর্থ হয়।
- Release publish করার অধিকার শুধু GitHub Actions-এর built-in `secrets.GITHUB_TOKEN` (workflow-এর `permissions: contents: write`)। আলাদা কোনো PAT তৈরি/সেভ করার দরকার নেই; ভুলেও repository-তে secret হিসেবে PAT রাখা হয়নি।
- অ্যাপ শুধু **পড়া** অধিকার ব্যবহার করে, আর সেটি public release হলেই চলে।
- পাবলিক রিপো মানে ইনস্টলার সবার জন্য ডাউনলোডযোগ্য — এটা এই নকশার স্বীকৃত শর্ত। ইনস্টলারের ভেতরে কোনো গোপন তথ্য থাকার কথা নয় (ডাটাবেজ ও ছবি অ্যাপের ভেতরে নয়, ব্যবহারকারীর মেশিনে)।
- `updater-keys/` (আগের signing key) ও `scripts/update-keys.cjs`, `scripts/publish-update.cjs`, `src/updater/manifest.cjs`, `download.cjs`, `apply.cjs`, `runner.cjs`, `config.cjs`, `keys.json`, `updater.config.json` — সব মুছে ফেলা হয়েছে। `updater-keys/private-key.pem` থাকলে সেটি এখন অপ্রয়োজনীয়; নিজেই মুছে ফেলুন বা আলাদা করে রাখুন।

---

## ৫. GitHub Actions — বিল্ড ও প্রকাশ

ফাইল: `.github/workflows/windows-release.yml` (runner: `windows-latest`)।

| কখন | কী হয় |
|---|---|
| `push` tag `v*.*.*` | build + test + NSIS + **GitHub Release publish** |
| `push` branch `main`, `pull_request` | build + test, artifact হিসেবে সংরক্ষণ (release নয়) |
| `workflow_dispatch` + `publish: true` | হাতে প্রকাশ; `mandatory` (ডিফল্ট true) ও `minimum_version` (খালি = এই ভার্সন) ইনপুট দিয়ে ঐচ্ছিক/সীমা ঠিক করা যায় |

ধাপ: checkout → setup-node (`.nvmrc` = 22, npm cache) → `npm ci` → icon/native build → `npm test` → (রিলিজে) `prepare-release.cjs` → `electron-builder --publish never` → `update-manifest.cjs` (version.json + .sha256) → `app-update.yml` টোকেন-পরীক্ষা → `gh release create` + `gh release upload --clobber latest.yml, version.json, Setup.exe, blockmap, .sha256`।

আসেট আছে কিনা চেক: `dist/latest.yml`, `dist/version.json`, `dist/BusMalikGroup-Setup-<version>-x64.exe`, `...exe.blockmap`, `...exe.sha256` — যেকোনোটি না থাকলে release প্রকাশ পায় না। `version.json`-এ সাতটি ঘরের কোনোটি না থাকলে, `latest_version` বিল্ডের ভার্সনের সঙ্গে না মিললে, minimum > latest হলে বা SHA256 ৬৪-অক্ষরের hex না হলে ধাপটি ব্যর্থ হয়।

কোড সাইনিং (ঐচ্ছিক কিন্তু সুপারিশকৃত): ইনস্টলার এখন unsigned, তাই SmartScreen "unknown publisher" দেখাতে পারে। সনদ কেনার পর `CSC_LINK` + `CSC_KEY_PASSWORD` (লোকাল) বা `WIN_CSC_LINK` + `WIN_CSC_KEY_PASSWORD` (GitHub Actions secret) দিয়ে electron-builder স্বাক্ষর করে। সনদ repo-তে কমিট করবেন না। বিস্তারিত: `docs/AUTO-UPDATE.md`।

Actions চালু করতে repo-র **Settings → Actions → General → Workflow permissions** এ "Read and write permissions" (অথবা এই workflow-এর `permissions:` ব্লকই যথেষ্ট)। `GITHUB_TOKEN` স্বয়ংক্রিয়, কিছু সেট করতে হয় না।

---

## ৬. ডেটা নিরাপত্তা — কেন আপডেটে হিসাব বাঁচে

১. **SQLite ইনস্টল ফোল্ডারের বাইরে।** `src/main.cjs:455` → `app.getPath('userData')/association.sqlite` = `%APPDATA%\bus-malik-somiti\association.sqlite`। NSIS ইনস্টল হয় `%LOCALAPPDATA%\Programs\Bus Malik Group\`-এ (per-user, UAC লাগে না)। মালিকের ছবি `owner-photos\`, লোগো, রিসিট ও ব্যাকআপ-ও `userData` বা ব্যবহারকারীর পছন্দমতো ফোল্ডারে থাকে — ইনস্টল ফোল্ডারের বাইরেই।

২. **আনইনস্টলেও ডেটা মুছে না。** `nsis.deleteAppDataOnUninstall: false` — আনইনস্টলার শুধু প্রোগ্রাম ফোল্ডার সরায়; `userData`-এর ডাটাবেজ, মালিকের ছবি, রিসিট ও pre-migration copy থেকে যায় (প্রকৃত পরীক্ষায় আনইনস্টলের পরও test product-এর userData-র তিনটিই অটুট ছিল)।

৩. **Migration-এর আগে backup.** `src/database.cjs`:
   - `SCHEMA_VERSION = 1` প্রতিবার খোলার সময় `PRAGMA user_version`-এ লেখা থাকে।
   - পুরোনো DB (`user_version` < SCHEMA_VERSION বা column নেই) ধরা পড়লে `initialize()`-এর **আগে** `prepareForSchemaChanges()` চলে:
     `PRAGMA wal_checkpoint(TRUNCATE)` → `copyFileSync` → `%APPDATA%\bus-malik-somiti\pre-migration-backups\association-before-<পুরোনো>-to-<নতুন>-<সময়>.sqlite` → readonly খুলে `integrity_check` = `ok` মিলিয়ে দেখা → sidecar (`-wal`, `-shm`) মুছে যাওয়া → সর্বোচ্চ ৫টি copy রাখা।
   - backup না নিতে পারলে DB-তে হাত দিতেই দেয় না: অ্যাপ খোলে না, কারণ দেখায় («ফ্রি স্পেস বের করুন»), আর লেজার আগের মতোই থাকে।

৪. **আপডেটের সময় ইনস্টলার `userData`-তে লেখে না** — NSIS only program files rewrite করে। পরীক্ষায় দেখানো: আপগ্রেডের আগে-পরে একই `owner_code`-র সারি, একই poisha-র fund entry, একই ছবির ফাইল, `integrity_check = ok` (সংখ্যা এই নথির ৯ নম্বর বিভাগে)।

---

## ৭. অফলাইন আচরণ

- **একবার যাচাই করা চলতি বিল্ড** ইন্টারনেট ছাড়াই **১২ ঘণ্টা** চলে; Settings-এ নীল নোটে grace-এর শেষ সময় দেখায়। এই সময়ে সব মডিউল কাজ করে।
- **জানা-পুরোনো বা কখনো-যাচাই-না-হওয়া বিল্ড** অফলাইনে খোলে না — পূর্ণ-স্ক্রিন পেজ দেখায় 「Retry Connection」। এটি ইচ্ছাকৃত: অফলাইনে পুরোনো ভার্সন দিয়ে লেনদেন চালু রাখার সুযোগ নেই।
- grace শেষ হলে বা সিস্টেম ঘড়ি ১০ মিনিটের বেশি পিছালে গেট আবার বন্ধ হয় (`grace_expired`, `clock_suspect`); ডেটা মুছেও না, নষ্টও হয় না।
- অর্ধেক-ডাউনলোড হলে electron-updater-এর Range-resume আবার সেই জায়গা থেকে নামে (লোকাল ফিড পরীক্ষায় `206` রিকোয়েস্ট log-এ দেখা গেছে)। SHA256 ভুল হলে ফাইলটি মুছে ফেলা হয় এবং গেট বন্ধ থাকে।
- ৩০ মিনিট পর গেট আবার চেক হয়; যেকোনো সময় **Retry Connection** বা Settings → Software Update → 「আপডেট চেক করুন」 হাতে চালানো যায়।

---

## ৮. স্থানীয় ফিড দিয়ে পরীক্ষা (প্রকাশকের মেশিনে)

`Setup.exe`-এর একটি আলাদা product (`Bus Malik Group Update Test`, `bd.busmaliksomiti.updatetest`) বানিয়ে localhost ফিডের বিরুদ্ধে পুরো প্রবাহ চালানো হয় — আসল অ্যাপের ইনস্টল বা ডেটা স্পর্শ না করে। আলাদা `extraMetadata.name` হলে userData-ও আলাদা (`%APPDATA%\bus-malik-somiti-updatetest`)।

```bash
# ১) দুটি সংস্করণের ইনস্টলার (1.0.0 ও 1.0.1)
npx electron-builder --win nsis --x64 --config .tmp-update-test/build-1.0.0.json --publish never
npx electron-builder --win nsis --x64 --config .tmp-update-test/build-1.0.1.json --publish never

# ২) ফিড: .tmp-update-test/feed/ এ 1.0.1-এর latest.yml + Setup.exe (+ blockmap)
node .tmp-update-test/feed-server.cjs        # http://127.0.0.1:8477/

# ৩) 1.0.0 ইনস্টল করে চালু (CDP পোর্ট দিয়ে UI পড়া ও ক্লিক করার জন্য)
UpdateTest-Setup-1.0.0-x64.exe /S
# Start Menu-এর shortcut-এ যোগ করুন: --remote-debugging-port=9333

# ৪) লেজার সিঁচ
ELECTRON_RUN_AS_NODE=1 ./node_modules/electron/dist/electron.exe .tmp-update-test/ledger.cjs seed

# ৫) UI চালাতে CDP কমান্ড
node .tmp-update-test/cdp.cjs "<JS expression>"
node .tmp-update-test/ledger.cjs verify       # exit 0 মানে ডেটা অক্ষুণ্ণ
```

`.tmp-update-test/` `.gitignore`-কভার্ড — পরীক্ষার ফাইল repo-তে যায় না। পরীক্ষা শেষে এই product-টি uninstall করে `dist-updatetest*` মুছে ফেলা হয়।

---

## ৯. প্রকৃত উইন্ডোজ পরীক্ষার ফলাফল (২০২৬-১০-৩১, এই মেশিনে চালু)

আলাদা product `Bus Malik Group Update Test` (`bd.busmaliksomiti.updatetest`) — নিজের ইনস্টল ফোল্ডার, নিজের `%APPDATA%\bus-malik-somiti-updatetest`, নিজের updater cache। আসল `bus-malik-somiti` ডেটা স্পর্শ হয়নি (পরীক্ষা শেষেও `association.sqlite` 299,008 bytes, 15:11 টাইমস্ট্যাম্প অটুট)।

**ইনস্টল:** `UpdateTest-Setup-1.0.0-x64.exe` (103,130,906 bytes) → `%LOCALAPPDATA%\Programs\Bus Malik Group Update Test\`, `resources/app.asar` ভেতর থেকে `package.json` version = **1.0.0**, HKCU-তে "Bus Malik Group Update Test 1.0.0" আনইনস্টল এন্ট্রি তৈরি।

| পর্যায় | যা দেখা গেছে (আসল সংখ্যা) |
|---|---|
| অফলাইন চেক (ফিড বন্ধ) | `checking` → `offline` **2,184 ms**-এ; `error: null`, banner লুকানো। অ্যাপ পুরোপুরি চলে — সেই অবস্থাতেই অ্যাডমিন অ্যাকাউন্ট, মালিক, রুট, বাস ও Cash In (BDT 5,000/ট্রিপ × ৪) লেখা হয়েছে |
| চেক (ফিড চালু) | `checking` 9 ms → `optional 1.0.1` **199 ms** → `downloading` → **61%** (60.1 / 98.4 MB) **1,345 ms** → **100%** 1,879 ms → `ready` **1,899 ms** |
| ডাউনলোড | `GET /latest.yml → 200 556`, `GET /UpdateTest-Setup-1.0.1-x64.exe.blockmap → 200 108,477`, `GET /UpdateTest-Setup-1.0.1-x64.exe → 200 103,130,821` |
| রিলিজ নোট | latest.yml-এর `releaseNotes`-এর বাংলা লাইন banner-এ দেখা গেছে |
| Install Now / Later | banner-এর বাস্তব বোতাম: `ইনস্টল করে রিস্টার্ট করুন` + `পরে মনে করিয়ে দিন` |
| 「পরে মনে করিয়ে দিন」 | `status: idle`, banner লুকানো, `updates/state.json`-এ `snooze_until: 2026-11-01T13:10:23Z` (+২৪ ঘণ্টা) |
| Snooze-এর পর হাতে চেক | `optional` 44 ms → `ready` **61 ms** (ডাউনলোড হওয়া ইনস্টলার cache থেকে reused; নতুন করে 103 MB নামেনি) |
| মাইগ্রেশন প্রস্তুতি | Install Now-এর ঠিক আগে DB হেডার `PRAGMA user_version = 0` (1.0.0-এর আগের বিল্ডের মতো), size **237,568 bytes**, sha256 `931b7c7f9f90f060dc9403d96f08823c1bf6a57ebe16a7b29793d171900ba45e` |
| Install Now ক্লিক | 19:11:50 — অ্যাপ বন্ধ, NSIS নীরবে ইনস্টল, 1.0.1 নিজে থেকেই `--updated` নিয়ে চালু (~19:14) |
| আপগ্রেডের পর | asar `package.json` version = **1.0.1**; `pre-migration-backups\association-before-legacy-to-1-2026-10-31T13-14-22-735Z.sqlite` = **237,568 bytes**, `integrity_check = ok`, ভেতরে `user_version = 0` ও ২টি মালিকের সারি (মাইগ্রেশন-আগের হুবহু অনুলিপি) |
| ডেটা যাচাই | `integrity_check = ok`; টেবিল গণনা আগের মতোই (users 1, owners 2, buses 1, routes 1, funds 5, fund_transactions 1, settings 3, login_history 1); নমুনা সারি byte-identical (মালিক «টেস্ট মালিক উদ্দিন / 01711111111 / দৌলাতপুর, খুলনা», রুট charge 500,000 পয়সা, fund income 12,345,678 পয়সা); `owner-photos\TEST-…txt` টিকে আছে; **live DB-এর sha256 আপডেটের আগে-পরে হুবহু একই** (২৩৭,৫৬৮ bytes) |
| 1.0.1 UI | লগইন → Dashboard: General Fund = 12,345,678 পয়সা (BDT 1,23,456.78), মালিকের তালিকায় ২টি বাংলা সারি, Settings name «টেস্ট সমিতি», ইনস্টল করা ভার্সন 1.0.1 |
| আপডেট লুপ নেই | 1.0.1 থেকে চেক → `status: up_to_date`, `update_available: false`, কোনো ডাউনলোড হয়নি |
| আনইনস্টাল | `/S` আনইনস্টলার প্রোগ্রাম ফোল্ডার সরিয়েছে, আর `%APPDATA\bus-malik-somiti-updatetest`-এর ডাটাবেজ, ছবি ও pre-migration copy **অটুট** থেকেছে (`deleteAppDataOnUninstall: false`) |

পরীক্ষা শেষে টেস্ট product, তার userData, updater cache ও `dist-updatetest*` ফোল্ডার মুছে ফেলা হয়েছে; `.tmp-update-test/`-এর স্ক্রিপ্ট (`build-1.0.0.json`, `build-1.0.1.json`, `feed-server.cjs`, `cdp.cjs`, `steps/*.js`, `force-legacy.cjs`, `verify-after.cjs`) থেকে যায় — `.gitignore`-কভার্ড, ফলে যেকোনো সময় পুরো প্রবাহ আবার চালানো যায়।

**GitHub provider-এর আসল বিল্ড (এই মেশিনে)।** `npm run dist:win` → `dist/BusMalikGroup-Setup-1.0.0-x64.exe` = **103,130,618 bytes**, `…exe.blockmap` = 108,593 bytes, `dist/latest.yml`:

```
version: 1.0.0
path: BusMalikGroup-Setup-1.0.0-x64.exe
sha512: L40aDAYY3pEReRdBUOwBsIDdqMCC29uIL90Rwvd3Ej92qCjlUBWQRn4EbwEycxt3cZNgi1+BmS/6UeZLlxj9sA==
size: 103130618
releaseDate: '2026-10-31T11:28:44.709Z'
```

এবং `dist/win-unpacked/resources/app-update.yml`-এর পুরো বিষয়বস্তু —

```
owner: bonnamst289-cyber
repo: busmalikgroup
provider: github
releaseType: release
vPrefixedTagName: true
updaterCacheDirName: bus-malik-somiti-updater
```

এতে কোনো token/secret নেই (`token|ghp_|secret` গুণে ০টি)। তাই "Update URL এই repository থেকেই আসবে" কথাটি বিল্ড করা ফাইল পড়ে প্রমাণিত।

### ৯.ক আসল GitHub Release-এর বিরুদ্ধে end-to-end টেস্ট (২০২৬-১০-৩১, একই মেশিনে)

Release পক্ষ এখন চলছে — প্রকাশিত দুটি release-ই Actions দিয়ে তৈরি:

| Release | কী প্রকাশিত হয়েছে |
|---|---|
| `v1.0.0` | run [#41219539479](https://github.com/bonnamst289-cyber/busmalikgroup/actions/runs/41219539479) — Setup.exe **103,130,746** bytes, blockmap 108,497, `latest.yml` 365 bytes, body = CHANGELOG-এর বাংলা নোট |
| `v1.0.1` | run [#41220557443](https://github.com/bonnamst289-cyber/busmalikgroup/actions/runs/41220557443) সব ১২ ধাপ ✓ ২m18s — Setup.exe **103,130,773** bytes, blockmap 108,777, `latest.yml` 365 bytes |

প্রথম `main` push-এর run (#41218842223) **ব্যর্থ** হয়েছিল: `npm test` চলত better-sqlite3-এর Electron rebuild-এর আগে → ৭৩টির মধ্যে ৪৯টি `ERR_DLOPEN_FAILED` (`NODE_MODULE_VERSION 127 vs 133`)। step ক্রম সাজানোর পর (commit `05f21cd`) প্রতিটি run-এ ৭৩/৭৩ পাস।

**ইনস্টল করা অ্যাপ → আসল GitHub feed:** আলাদা product `Bus Malik Group GitHub Test` (`bd.busmaliksomiti.ghtest`, userData `bus-malik-somiti-ghtest`, cache `bus-malik-somiti-ghtest-updater`), ভেতরের `app-update.yml` = `provider: github, owner: bonnamst289-cyber, repo: busmalikgroup` — কোনো token নেই। Settings → Software Update → 「আপডেট চেক করুন」-এ ক্লিক:

| পর্যায় | মাপা সময় / ফলাফল |
|---|---|
| Feed lookup | 17:14:05.029 `Checking for update` → 17:14:05.033 `Found version 1.0.1` (আগেরবার 2,331 ms; token/secret লাগেনি, anonymous) |
| Download | 103,130,773 bytes (98.4 MiB) ৪৬ সেকেন্ডে (16:52:23 → 16:53:09), progress 0→100% |
| Integrity | অ্যাপ-নামানো ফাইলের sha256 `21f7f1ce53b85b61a1b76aac2543a7e088524fcc5ae826e0a045820ed00ad6e8` = GitHub asset-এর digest-এর হুবহু মিল; `update-info.json`-এর sha512 = ফাইলের computed sha512 |
| Cache reuse | দ্বিতীয়বার চেক → 17:14:05.372 `Update has already been downloaded` (নতুন করে ১০৩ MB নামেনি), snapshot `ready` ৪,০৭৭ ms-এর মধ্যে |
| Banner | `Update downloaded and ready to install` + রিলিজ নোট (GitHub Release-এর body থেকে বাংলা ৩ লাইন) + বোতাম `install: Install Update and Restart`, `later: Remind me later` |
| Install (১মবার) | 16:53:13 spawn → `spawn EPERM` 16:55:14; installer চলেনি, কিছুই ইনস্টল হয়নি (সেই মুহূর্তে production folder-ই ছিল না) — পরে আবার চাপলেই চলছে, দেখুন নিচে |
| Install (২য়বার) | 17:15:12 `installing update 1.0.0 -> 1.0.1` → 17:15:15 app quit → NSIS নীরবে ইনস্টল → production `Bus Malik Group` 1.0.1 চালু হলো |
| ইনস্টল পরবর্তী প্রমাণ | HKCU এন্ট্রি **Bus Malik Group 1.0.1**; `resources/app.asar`-এর `package.json` version = **1.0.1** |
| হিসাব অক্ষুণ্ণ | আপডেটের পরও `%APPDATA%\bus-malik-somiti\association.sqlite` = **299,008 bytes, mtime 16:09:35Z (আপডেটের আগে যেটুকু ছিল ঠিক তা-ই)**, `integrity_check = ok`, `user_version = 1`, গণনা: owners 12, buses 10, funds 5, routes 1, users 1, audit_logs 78, login_history 34 |
| আপডেট লুপ নেই | ইনস্টল করা 1.0.1 নিজে থেকেই চেক করেছে: 17:17:13 → `Update for version 1.0.1 is not available (latest version: 1.0.1, downgrade is disallowed)`, `state.json`-এ `last_error: null` |

Migration-আগের backup-এর ধাপ (requirement ১২) ৯ নম্বর বিভাগের লোকাল-ফিড টেস্টেই দেখানো — এই live টেস্টে DB-তে ইতিমধ্যে `user_version = 1` ছিল, তাই নতুন মাইগ্রেশন চলেনি ও নতুন copy লাগেনি।

টেস্ট product, তার userData, ১০৩ MB cache ও `dist-ghtest\` পরে মুছে ফেলা হয়েছে; আসল সমিতির ডাটাবেজ স্পর্শ করা হয়নি (যাচাইও temp-এর copy-তে, ইন-প্লেস নয়)।

### ৯.খ বাধ্যতামূলক গেট — পরীক্ষার অবস্থা (২০২৬-১১-০১)

`npm test` → **১২৪/১২৪ পাস**; এর মধ্যে `tests/update-gate.test.cjs`-এর ২২টি টেস্ট কেন্দ্রীয় নীতি, minimum-version ব্লক, অফলাইন `local_policy`/`never_verified`/`known_obsolete`/`build_unverified`/`grace_expired`/`clock_suspect`, প্যাকেজড `app-update.yml` ফিড, IPC ব্লক, apply/download/verify/backup, রিস্টার্ট মার্কার ও manifest লেখা যাচাই করে। বাস্তব Electron-এ CDP স্ক্রিনশট দিয়ে checking / mandatory / downloading (৪২%) / connection-error / Settings পেজ দেখা হয়েছে — লগইন লুকানো ছিল।

এখনো **প্যাকেজড ইনস্টল করা আপডেট** দিয়ে যাচাই বাকি: C:/D:/কাস্টম ফোল্ডারে পুরোনো ভার্সন ইনস্টল → কেন্দ্রীয় নীতিতে নতুন minimum → ব্লক → ডাউনলোড → SHA256 → ইনস্টল → রিস্টার্ট → পুনঃচেক → Admin/Cashier/Staff লগইন → ডেটা অক্ষত। এই ধাপটি শেষ না হওয়া পর্যন্ত "প্যাকেজড বাধ্যতামূলক আপডেট কাজ করছে" বলা চলবে না; নকল-অবজেক্ট টেস্টই একমাত্র প্রমাণ নয়।

---

## ১০. সমস্যা নিয়োগ

| লক্ষণ | কারণ / সমাধান |
|---|---|
| লগইনের আগেই স্ক্রিন আটকে আছে | ইনস্টল করা ভার্সন কেন্দ্রীয় `minimum_required_version`-এর চেয়ে কম, অথবা নীতি এখনো যাচাই হয়নি। পেজে Installed/Required/Latest দেখে **Update now** চাপুন। |
| 「Connect to the internet」 দেখাচ্ছে | এই বিল্ডের জন্য নীতি যাচাই হয়নি, grace শেষ, বা ঘড়ি পেছানো। **Retry Connection** চাপুন; ডেটা অক্ষত। |
| Retry Download-এ কিছু হয় না | ডাউনলোড আগে থেকেই চলছে; শেষ বা ব্যর্থ হওয়া পর্যন্ত অপেক্ষা করুন। |
| Settings-এ "Automatic updates are only active in the installed application" | `npm start` (dev) চলছে। ইনস্টল করা EXE খুলুন, অথবা পরীক্ষার জন্য `SOMITI_UPDATES_FORCE=1` + `dev-app-update.yml`। |
| "The portable version cannot update itself" | portable `.exe` প্রতিবার temp-এ খোলে; আপডেট ইচ্ছাকৃত বন্ধ। ইনস্টলার ব্যবহার করুন। |
| সবুজ নোট「সফটওয়্যারটি সবচেয়ে নতুন সংস্করণে আছে」 না দেখে 「আপডেট চেক করা যায়নি」 | GitHub-এ এখনো release/latest.yml নেই, কিংবা token/নেটওয়ার্ক সমস্যা। প্রথমে Release এ `latest.yml` আছে কিনা দেখুন। |
| Download % আটকে যায় | ইন্টারনেট বিঘ্ন — 「আপডেট চেক করুন」 আবার চাপুন; Range-resume বাকিটুকু নামাবে। |
| SmartScreen "unknown publisher" | ইনস্টলার Authenticode-স্বাক্ষরিত নয় (কেনা certificate নেই)। বিকল্প: code-signing certificate কিনে electron-builder-এর `win.certificateFile` যোগ করা। স্বাক্ষর না থাকলেও installer ভেতরের SHA-512 electron-updater যাচাই করে। |
| Update-এর পর পুরোনো ভার্সনই দেখায় | ইনস্টলার চালু হয়নি — `quitAndInstall`-এর আগে সব উইন্ডো বন্ধ করতে হবে; না হলে 「পরে」 চাপুন, অ্যাপ বন্ধের সময় ইনস্টল হবে। |
| ১.০.০-এর আগের (Supabase-আপডেটারযুক্ত) ইনস্টল | ওই বিল্ডে এই আপডেট কোড নেই — **একবার** নতুন ইনস্টলার দিয়ে হাতে আপগ্রেড করুন; userData মুছবে না। এরপর স্বয়ংক্রিয়। |
| 「ইনস্টল করে রিস্টার্ট করুন」-এ কিছু হয় না / log-এ `spawn EPERM` | installer spawn ব্লক হয়েছে (Antivirus/SmartScreen/প্রিভিলেজ)। অ্যাপ কিছুই হারায় না: ডাউনলোড cache-এ থেকে যায়, 「আপডেট চেক করুন」 → আবার 「ইনস্টল করে রিস্টার্ট করুন」 চাপুন; বারবার ব্যর্থ হলে Release থেকে Setup.exe নামিয়ে হাতে চালান (ডাটা অক্ষুণ্ণ থাকবে)। প্রকৃত টেস্টে প্রথম tap EPERM-এ থেমেছিল, দ্বিতীয় tap-এ 1.0.1 ইনস্টল হয়ে গেছে। |

---

## ১১. সীমাবদ্ধতা

- সম্পূর্ণ ইনস্টলার (~১০০ MB) নামে — delta আপডেট নেই।
- GitHub anonymous API rate limit আছে; দৈব চেক তা টেকে, কিন্তু অত্যধিক ইনস্টলেশন একই IP থেকে চেক করলে সংযোগ-ত্রুটি দেখাতে পারে (চলতি, যাচাই করা বিল্ডে grace চলবে)।
- Unsigned build → SmartScreen সতর্কতা (সেকেন্ড ধাপে certificate লাগালে সমাধান)।
- **Tamper-proof নয় (অফলাইন ক্লায়েন্ট)।** লোকাল ফাইল/ডাটাবেজ হাতে বদলে গেট ফাঁকি দেওয়া তত্ত্বগতভাবে সম্ভব; অনলাইন লেনদেনে `x-app-version` সার্ভার-যাচাই সেই ঝুঁকি কমায়।
- বাধ্যতামূলক আপডেটের পর লগইন না খুললে ইনস্টল করা `package.json` ভার্সন ও প্রকাশিত `version.json` মিলিয়ে দেখুন; ভুল minimum প্রকাশ হলে নতুন, বড় ভার্সন দিয়ে ঠিক করতে হবে।
- Installer spawn একবার আটকালে (EPERM/AV) electron-updater পুরো ডাউনলোড cache রেখে দেয় — দ্বিতীয়বার চাপলে দ্রুত আবার ইনস্টলে যায়; কখনোই আধা-ইনস্টল অবস্থা তৈরি হয় না (ইনস্টল NSIS-এর নিজের transaction)।
- Release শুধু GitHub-এ; repo private করলে অ্যাপের anonymous চেক ব্যর্থ হবে (তখন token লাগবে, যা এই নকশায় রাখা যাবে না)।
