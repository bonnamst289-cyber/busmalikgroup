# ডাটাবেজ স্কিমা ডকুমেন্টেশন — Bus Malik Somiti

সমস্ত ডাটা একটিমাত্র স্থানীয় SQLite ফাইলে থাকে:

```
%APPDATA%\bus-malik-somiti\association.sqlite
```

ফাইলটি খোলার সাথে সাথে অ্যাপ `journal_mode = WAL`, `foreign_keys = ON`, `busy_timeout = 5000` প্রয়োগ করে। তাই হঠাৎ ক্র্যাশ বা লাইন চলে গেলেও ডাটা নষ্ট হয় না (WAL লগ থেকে রিকভারি হয়)। কোনো MySQL, PHP API বা অনলাইন ডাটাবেজ ব্যবহার করা হয় না।

## টাকার সংরক্ষণ

সব অর্থ **পয়সায় (integer)** সংরক্ষিত হয় — ভগ্নাংশের রাউন্ডিং ত্রুটি এড়াতে। স্ক্রিনে ব্যবহারকারী টাকা (BDT) লেখেন; `*_bdt` ইনপুট `*_paisa` কলামে ×১০০ করে জমা হয়। তারিখ `TEXT` ফরম্যাট `YYYY-MM-DD`.

## টেবিল তালিকা (১৫টি)

| টেবিল | কাজ |
|---|---|
| `users` | লগইন অ্যাকাউন্ট, ভূমিকা (admin/staff), অনুমতি |
| `owners` | বাস মালিক |
| `buses` | বাস |
| `routes` | রুট ও প্রতি ট্রিপ চার্জ |
| `members` | সমিতির সদস্য |
| `funds` | তহবিল (General, Welfare, …) |
| `income_categories` / `expense_categories` | আয়/ব্যয়ের খাত |
| `fund_transactions` | আয় ও ব্যয়ের লেজার |
| `fund_transfers` | দুই তহবিলের মধ্যে স্থানান্তর |
| `fund_distributions` | ক্যাশবুক থেকে তহবিলে বণ্টন |
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

`name` (UNIQUE), `opening_balance_paisa`, `is_active`। নিষ্ক্রিয় তহবিল আয়/ব্যয় ফর্মে ও ক্যাশবুকে দেখায় না, তবে পুরোনো লেনদেন ঠিক থাকে।

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

### fund_distributions

`fund_id`, `fund_name` (কপি হিসেবে রাখা), `date`, `amount_paisa`, `request_key` (UNIQUE)। একই `request_key` দিয়ে বারবার পাঠালে নতুন এন্ট্রি হয় না (idempotent)। মোট বণ্টন ক্যাশ-ইনের বেশি হতে পারে না, তাই আয় কমিয়ে দিলে অ্যাপ বাধা দেয়।

### settings

`key`/`value` জোড়া। চাবিগুলো: `association_name`, `association_address`, `association_logo`, `backup_folder`, `auto_backup`, `keep_copies` (১–৩৬৫)।

### audit_logs ও login_history

`audit_logs`: `user_id`, `action` (create/update/delete/post/transfer/distribution/auto-backup…), `entity`, `entity_id`, `before_json`, `after_json`, `created_at`।
`login_history`: `user_id`, `username`, `success` (0/1), `created_at`।

## ইনডেক্স (৯টি)

`idx_buses_owner`, `idx_buses_route`, `idx_transactions_date`, `idx_transactions_fund`, `idx_transactions_party`, `idx_transactions_source`, `idx_receipts_date`, `idx_receipts_transaction`, `idx_fund_distributions_fund`।

## ট্রিপ ও মাসিক চাঁদা মডিউল সরানো হয়েছে

`trips` ও `monthly_dues` টেবিল, সেগুলোর ইনডেক্স, IPC, ফর্ম ও রিপোর্ট — সবই অ্যাপ থেকে সরানো হয়েছে। নতুন ডাটাবেজে এই টেবিল তৈরি হয় না। পুরোনো ফাইলে এই টেবিল থাকলে অ্যাপ সেগুলো **অপরিবর্তিত রেখে** চলে (কোনো ডাটা মুছে ফেলা হয় না)। আয়ের একমাত্র উৎস এখন Income & Expense ফর্মের এন্ট্রি। `Trip Collection` / `Monthly Member Fees` খাত দুটি নতুন এন্ট্রির জন্য তালিকা থেকে সরানো হয়।

## নতুন সংস্করণ পুরোনো ফাইলের সাথে খোলা

অ্যাপ খোলার সময় `migrations` তালিকা অনুযায়ী যেকোনো অনুপস্থিত কলাম `ALTER TABLE … ADD COLUMN` দিয়ে যোগ হয় (সব কিছুর ডিফল্ট মান আছে)। তাই পুরোনো `%APPDATA%\bus-malik-somiti\association.sqlite` ফাইল সরাসরি নতুন সংস্করণে চলে।

## ব্যাকআপ ও পুনরুদ্ধার ডাটা

`backup(destination)` SQLite-এর অনলাইন `.backup()` ব্যবহার করে এবং একই ফোল্ডারে `owner-photos/` কপি করে। পুনরুদ্ধারের আগে ফাইলটি `integrity_check` ও প্রয়োজনীয় টেবিলের তালিকা দিয়ে যাচাই করা হয় (যাচাই ব্যর্থ হলে বর্তমান ডাটার কোনো পরিবর্তন হয় না) এবং পুরোনো ডাটাবেজ স্বয়ংক্রিয়ভাবে `association.before-restore-<timestamp>.sqlite` নামে রেখে দেওয়া হয়।
