# ডাটাবেজ স্কিমা ডকুমেন্টেশন — Bus Malik Somiti

সমস্ত ডাটা একটিমাত্র স্থানীয় SQLite ফাইলে থাকে:

```
%APPDATA%\bus-malik-somiti\association.sqlite
```

ফাইলটি খোলার সাথে সাথে অ্যাপ `journal_mode = WAL`, `foreign_keys = ON`, `busy_timeout = 5000` প্রয়োগ করে। তাই হঠাৎ ক্র্যাশ বা লাইন চলে গেলেও ডাটা নষ্ট হয় না (WAL লগ থেকে রিকভারি হয়)। কোনো MySQL, PHP API বা অনলাইন ডাটাবেজ ব্যবহার করা হয় না।

## টাকার সংরক্ষণ

সব অর্থ **পয়সায় (integer)** সংরক্ষিত হয় — ভগ্নাংশের রাউন্ডিং ত্রুটি এড়াতে। স্ক্রিনে ব্যবহারকারী টাকা (BDT) লেখেন; `*_bdt` ইনপুট `*_paisa` কলামে ×১০০ করে জমা হয়। তারিখ `TEXT` ফরম্যাট `YYYY-MM-DD`.

## টেবিল তালিকা (১৯টি)

| টেবিল | কাজ |
|---|---|
| `users` | লগইন অ্যাকাউন্ট, ভূমিকা (admin/staff), অনুমতি |
| `owners` | বাস মালিক |
| `buses` | বাস |
| `routes` | রুট ও প্রতি ট্রিপ চার্জ |
| `members` | সমিতির সদস্য |
| `funds` | রুটভিত্তিক তহবিল (নাম, রুট, প্রতি ট্রিপের পরিমাণ) |
| `income_categories` / `expense_categories` | আয়/ব্যয়ের খাত |
| `fund_transactions` | আয় ও ব্যয়ের লেজার |
| `fund_transfers` | দুই তহবিলের মধ্যে স্থানান্তর |
| `fund_distributions` | পুরোনো বণ্টন রেকর্ড (শুধু সংরক্ষণের জন্য) |
| `route_cash_ins` | রুটভিত্তিক Cash In (প্রতি ট্রিপ × ট্রিপ সংখ্যা) |
| `cash_outs` | রুট ও তহবিলভিত্তিক Cash Out (প্রতি ট্রিপ × ট্রিপ সংখ্যা) |
| `banks` | ব্যাংক হিসাব (নাম, শাখা, হিসাব নম্বর, ধরন, Opening Balance) |
| `bank_deposits` | তহবিল থেকে ব্যাংকে জমা (ট্রান্সফার, আয় নয়) |
| `receipts` | আয়ের রসিদ |
| `settings` | সমিতির নাম/ঠিকানা/লোগো, ব্যাকআপ সেটিংস |
| `audit_logs` | কে কী পরিবর্তন করেছে |
| `login_history` | সফল/ব্যর্থ লগইন |

### users

| কলাম | ধরন | মন্তব্য |
|---|---|---|
| `id` | INTEGER PK | |
| `username` | TEXT NOT NULL UNIQUE | |
| `full_name` | TEXT NOT NULL | |
| `password_hash`, `password_salt` | TEXT NOT NULL | scrypt (৬৪ বাইট হ্যাস) + প্রতি ইউজারে আলাদা সল্ট; প্লেইন পাসওয়ার্ড কোথাও থাকে না |
| `role` | TEXT CHECK IN ('admin','staff') | |
| `permissions_json` | TEXT | `{"manage_buses":true,"delete_buses":false,…}` — staff ডিফল্টে শুধু দেখতে পারে |
| `is_active` | INTEGER 0/1 | অন্তত একজন সক্রিয় admin থাকা বাধ্যতামূলক |

### owners

`owner_code` (`OWN-<timestamp>-<hex>`, UNIQUE — অ্যাপ স্বয়ংক্রিয়ভাবে দেয়), `name`, `nominee_name`, `father_name`, `mobile`, `address`, `photo_path` (ছবির স্থানীয় পাথ), `join_date`, `status` (`Active`/`Inactive`)।

### routes

`name`, `route_number` (`RTE-<timestamp>-<hex>`, UNIQUE — খালি দিলে অ্যাপ স্বয়ংক্রিয় তৈরি করে), `starting_point`, `destination`, `charge_paisa` (≥০), `description`, `status`।

### buses

`registration_number` (UNIQUE), `owner_id` → `owners.id` (NOT NULL, DELETE RESTRICT), `route_id` → `routes.id` (DELETE SET NULL), `driver_name`, `driver_mobile`, `helper_name`, `bus_type`, `status` (`Active`/`Inactive`/`Repair`)।

### members

`member_code` (`MEM-<timestamp>-<hex>`, UNIQUE), `name`, `father_name`, `mobile`, `address`, `membership_date`, `member_type`, `status`, `monthly_fee_paisa` (≥০)।

### funds

`name` (UNIQUE), `route_id` → `routes.id` (তহবিল যে রুটের জন্য বরাদ্দ), `amount_paisa` (> ০, প্রতি ট্রিপে বরাদ্দ), `opening_balance_paisa` (পুরোনো রেকর্ডের জন্য সংরক্ষিত), `is_active`। একই রুটে একাধিক তহবিল থাকতে পারে। নতুন তহবিলের জন্য নাম, রুট ও প্রতি ট্রিপের পরিমাণ বাধ্যতামূলক। নিষ্ক্রিয় তহবিল ক্যাশআউট ফর্মে ও ক্যাশবুকে দেখায় না, তবে পুরোনো লেনদেন ঠিক থাকে।

### fund_transactions

| কলাম | মন্তব্য |
|---|---|
| `fund_id` | → `funds.id`, DELETE RESTRICT (তহবিল মুছতে হলে আগে লেনদেন থাকবে না) |
| `date` | YYYY-MM-DD |
| `transaction_type` | `income` / `expense` |
| `category` | খাতের নাম (TEXT — খাত মুছলেও পুরোনো এন্ট্রির লেবেল থাকে) |
| `amount_paisa` | > ০ |
| `source`, `source_ref` | `source` = income/expense, `source_ref` = `INC-…`/`EXP-…` কোড; `UNIQUE(source, source_ref)` ডুপ্লিকেট পোস্ট রোধ করে |
| `owner_id`, `member_id`, `bus_id` | প্রযোজ্য হলে; DELETE SET NULL |
| `receiver_name`, `reference_number`, `description` | রসিদ/অডিটের জন্য |
| `created_by` | → `users.id`, SET NULL |

### receipts

`receipt_number` (`RCP-<timestamp>-<hex>`, UNIQUE), `date`, `category`, `amount_paisa`, `owner_id`/`member_id`/`bus_id`/`route_id`, `fund_transaction_id` → `fund_transactions.id`। শুধু আয়ের সাথেই রসিদ জোড়া লাগে। লেনদেন সংশোধন করলে রসিদও হালনাগাদ হয়; লেনদেন মুছলে রসিদও মুছে যায়।

### fund_transfers

`from_fund_id`, `to_fund_id` (`CHECK(from <> to)`), `date`, `amount_paisa`, `description`। স্থানান্তর আয়/ব্যয়ের যোগফলে পড়ে না।

### fund_distributions (পুরোনো রেকর্ড)

`fund_id`, `fund_name` (কপি হিসেবে রাখা), `date`, `amount_paisa`, `request_key` (UNIQUE)। নতুন সংস্করণে এই টেবিলে আর কোনো এন্ট্রি যোগ হয় না। অ্যাপ খোলার সময় পুরোনো সারিগুলো `cash_outs`-এ অনুলিপি হয় (`legacy_distribution_id`, `request_key = 'legacy-distribution-<id>'`), কিন্তু মূল সারিগুলো মুছে ফেলা হয় না। একই ডাটাবেজ বারবার খুললেও অনুলিপি একবারই হয়।

### route_cash_ins

`route_id` → `routes.id` (DELETE SET NULL), `route_name` (কপি হিসেবে রাখা), `per_trip_paisa` (> ০), `total_trips` (> ০), `total_amount_paisa` (> ০), `date`, `request_key` (UNIQUE), `created_by`। মোট টাকা সার্ভারে `per_trip_paisa × total_trips` হিসেবে হিসাব হয়; ক্লায়েন্ট থেকে পাঠানো মোট গ্রহণ করা হয় না। একই `request_key` দিয়ে ডুপ্লিকেট সাবমিট আটকানো হয়। মোট Cash In = `route_cash_ins`-এর যোগফল + পুরোনো `fund_transactions` আয়।

### cash_outs

`route_id` → `routes.id` (DELETE SET NULL), `route_name` (কপি), `fund_id` → `funds.id` (DELETE RESTRICT), `fund_name` (কপি), `per_trip_paisa` (> ০), `total_trips` (> ০), `amount_paisa` (> ০), `date`, `request_key` (UNIQUE), `batch_key` (একই Cash Out-এ নির্বাচিত সব তহবিলের গ্রুপ), `legacy_distribution_id` (UNIQUE, পুরোনো বণ্টন থেকে এলে), `created_by`। অ্যাপ যাচাই করে তহবিলটি ওই রুটেই বরাদ্দ কি না এবং প্রতিটি সারির পরিমাণ `per_trip_paisa × total_trips`; Grand Total সব সারির যোগফল। মোট Cash Out কখনো মোট Cash In-এর বেশি হতে পারে না। একই `request_key` ও `batch_key` দিয়ে ডুপ্লিকেট সাবমিট আটকানো হয়। উপলব্ধ ক্যাশ = মোট Cash In − মোট Cash Out। Cash Out-এর টাকা সংশ্লিষ্ট তহবিলের ব্যালেন্সে যোগ হয় (ক্যাশবুক থেকে তহবিলে বরাদ্দ)।

### banks

`name`, `branch_name`, `account_holder`, `account_number` (UNIQUE), `account_type` (`Current`/`Savings`/`FDR`/`Other`), `routing_number` (ঐচ্ছিক), `opening_balance_paisa` (≥ ০)। ব্যাংকের বর্তমান ব্যালেন্স কোথাও জমা রাখা হয় না — প্রতিবার `opening_balance_paisa + SUM(bank_deposits.amount_paisa)` হিসাব হয়। যে ব্যাংকে জমা আছে সেটি DELETE RESTRICT-এ মুছতে বাধা দেয়।

### bank_deposits

`date`, `bank_id` → `banks.id` (DELETE RESTRICT), `fund_id` → `funds.id` (DELETE RESTRICT), `amount_paisa` (> ০), `transaction_id` (বাধ্যতামূলক), `note`, `created_by`, `created_at`, `updated_at`। `(bank_id, transaction_id)`-এ আংশিক UNIQUE ইনডেক্স — একই ব্যাংকে একই স্লিপ নম্বর দুইবার সংরক্ষিত হয় না। জমা আয় নয়: এটি `fund_transactions`, `route_cash_ins` বা Cash In/Cash Out মোটে যোগ হয় না। তহবিলের ব্যালেন্স থেকে `amount_paisa` বাদ যায় এবং ব্যাংকের ব্যালেন্সে যোগ হয়; তহবিলের উপলব্ধ ব্যালেন্সের বেশি জমা দিলে সার্ভার বাধা দেয়। তহবিল ডেবিট ও ব্যাংক ক্রেডিট একটি `IMMEDIATE` ডাটাবেস ট্রানজেকশনে হয়; সারি সম্পাদনা/মুছে ফেললে দুই ব্যালেন্সই নতুন করে হিসাব হয়। জমা সম্পাদনা ও মুছে ফেলা প্রশাসক-সীমাবদ্ধ এবং `audit_logs`-এ `bank_deposit` নামে থাকে।

### settings

`key`/`value` জোড়া। চাবিগুলো: `association_name`, `association_address`, `association_logo`, `backup_folder`, `auto_backup`, `keep_copies` (১–৩৬৫)।

### audit_logs ও login_history

`audit_logs`: `user_id`, `action` (create/correct/delete/post/transfer/cash_out/auto-backup…), `entity`, `entity_id`, `before_json`, `after_json`, `created_at`।
`login_history`: `user_id`, `username`, `success` (0/1), `created_at`।

## ইনডেক্স (১৭টি)

`idx_buses_owner`, `idx_buses_route`, `idx_transactions_date`, `idx_transactions_fund`, `idx_transactions_party`, `idx_transactions_source`, `idx_receipts_date`, `idx_receipts_transaction`, `idx_fund_distributions_fund`, `idx_route_cash_ins_date`, `idx_cash_outs_fund`, `idx_cash_outs_route`, `idx_cash_outs_batch`, `idx_bank_deposits_date`, `idx_bank_deposits_bank`, `idx_bank_deposits_fund`, `idx_bank_deposits_txn` (একই ব্যাংকে Transaction ID অনন্য রাখে)।

## ট্রিপ ও মাসিক চাঁদা মডিউল সরানো হয়েছে

`trips` ও `monthly_dues` টেবিল, সেগুলোর ইনডেক্স, IPC, ফর্ম ও রিপোর্ট — সবই অ্যাপ থেকে সরানো হয়েছে। নতুন ডাটাবেজে এই টেবিল তৈরি হয় না। পুরোনো ফাইলে এই টেবিল থাকলে অ্যাপ সেগুলো **অপরিবর্তিত রেখে** চলে (কোনো ডাটা মুছে ফেলা হয় না)। আয়ের একমাত্র সক্রিয় উৎস এখন ক্যাশবুকের **Cash In** (রুট ও ট্রিপ সংখ্যা); আগের আয়ের রেকর্ড `fund_transactions`-এ অপরিবর্তিত থাকে এবং মোট Cash In-এ যোগ হয়। `Trip Collection` / `Monthly Member Fees` খাত দুটি নতুন এন্ট্রির জন্য তালিকা থেকে সরানো হয়।

ক্যাশবুকের ব্যয়ের একমাত্র সক্রিয় পথ এখন **Cash Out** (রুট + তহবিল × ট্রিপ সংখ্যা)। পুরোনো **Fund Distribution** মডিউল ও তার API সরানো হয়েছে; পুরোনো `fund_distributions` সারিগুলো উপরের নিয়মে `cash_outs`-এ সংরক্ষিত হয়।

## নতুন সংস্করণ পুরোনো ফাইলের সাথে খোলা

অ্যাপ খোলার সময় `migrations` তালিকা অনুযায়ী যেকোনো অনুপস্থিত কলাম `ALTER TABLE … ADD COLUMN` দিয়ে যোগ হয় (সব কিছুর ডিফল্ট মান আছে)। `funds.route_id` ও `funds.amount_paisa` নতুন কলাম হিসেবে পুরোনো তহবিলে যোগ হয় (ডিফল্ট `NULL` ও `0`)। `cash_outs` টেবিল না থাকলে তৈরি হয় এবং পুরোনো `fund_distributions` সারিগুলো একবারই সেখানে অনুলিপি হয়। `banks` ও `bank_deposits` টেবিল এবং তাদের ইনডেক্সও পুরোনো ফাইলে স্বয়ংক্রিয়ভাবে তৈরি হয়; পুরোনো কোনো ব্যালেন্স বা মোট বদলায় না (শুরুতে কোনো ব্যাংক বা জমা থাকে না)। তাই পুরোনো `%APPDATA%\bus-malik-somiti\association.sqlite` ফাইল সরাসরি নতুন সংস্করণে চলে; বিদ্যমান রুট, তহবিল, লেনদেন ও বণ্টনের রেকর্ড অক্ষত থাকে।

## ব্যাকআপ ও পুনরুদ্ধার ডাটা

`backup(destination)` SQLite-এর অনলাইন `.backup()` ব্যবহার করে এবং একই ফোল্ডারে `owner-photos/` কপি করে। পুনরুদ্ধারের আগে ফাইলটি `integrity_check` ও প্রয়োজনীয় টেবিলের তালিকা দিয়ে যাচাই করা হয় (যাচাই ব্যর্থ হলে বর্তমান ডাটার কোনো পরিবর্তন হয় না) এবং পুরোনো ডাটাবেজ স্বয়ংক্রিয়ভাবে `association.before-restore-<timestamp>.sqlite` নামে রেখে দেওয়া হয়।
