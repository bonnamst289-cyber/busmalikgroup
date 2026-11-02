# Subscription Setup Guide

This installation uses a **single Yearly Business Package**:

| Item | Value |
| --- | --- |
| Package code | `YEARLY_8000` |
| Price | 8,000 BDT |
| Duration | 365 days |
| bKash | 01331707900 · Personal · Send Money |
| Nagad | 01783026754 · Personal · Send Money |
| Approval | Manual, from the Supabase Dashboard |

The desktop app keeps all accounting data in its local SQLite database. Supabase is used **only** for package status, payment requests and approval. Existing login, users and permissions continue to work unchanged.

## Security model

- The installed application stores only the **public anon key** and one **business client key**.
- **Never paste the `service_role` key into the application.** It can bypass all subscription rules.
- Payment requests can only be created through the `submit_payment_request()` function, and the status is always forced to `pending`.
- Only a Supabase administrator (`postgres`, `supabase_admin` or `service_role`) can approve or reject a request.
- One active subscription is allowed per business, and a payment request can be activated only once.

## This build's project

This build is already pointed at the owner's Supabase project:

| Item | Value |
| --- | --- |
| Project URL | `https://hgavhgssxmbtqiqvrsyd.supabase.co` |
| Key | public anon key (built in; never the `service_role` key) |

The URL and anon key are applied automatically when no other values have been saved, so the administrator only has to paste the **Business ID** and **Business client key**.

## 1. Apply the database migration

1. Open the Supabase Dashboard → **SQL Editor** → **New query**.
2. Paste the whole of `supabase/SETUP-SQL-EDITOR.sql` and press **Run**.

That one file is safe to run more than once. It applies the Personal Send Money
settings, keeps the package at BDT 8,000 / 365 days, registers the
**Bus Malik Group** business when it is missing, and prints the credentials.

On a brand-new project, first run `supabase/migrations/20261101000000_subscription_system.sql`
to create the tables, functions and RLS policies, then run `supabase/SETUP-SQL-EDITOR.sql`.

Optional: enable the `pg_cron` extension and uncomment the scheduled expiry block at the end of the migration so expired subscriptions are closed automatically. Without it, expiry is still calculated whenever the desktop app syncs.

## 2. Register the business

`supabase/SETUP-SQL-EDITOR.sql` registers **Bus Malik Group** automatically and
returns its `id` (UUID) and `client_key` in the result grid. Copy both values.
The `client_key` identifies this installation; treat it as a password.

If you need a different name or contact number:

```sql
insert into public.businesses (name, contact_number)
values ('Your Association Name', '01XXXXXXXXX')
returning id, name, client_key;
```

If the association already has a company/business table, adapt the `businesses` table and the references to it as described in the migration comments.

## 3. Configure the desktop app

1. Sign in as an **administrator**.
2. Open **Subscription**. In the **Supabase configuration** panel, the status card shows whether the connection is verified, which values are missing, and where the keys are stored.
3. Click **Edit configuration**. The project URL and anon key are already filled
   in; enter:
   - Business ID (UUID)
   - Business client key
   - Business name and contact number
   - Offline grace days (0–30)
   - Enable **Require an active package** when you are ready to enforce subscriptions
4. Click **Test connection**. The app calls the trusted `get_business_subscription` RPC and confirms that the Business ID and client key belong to the same business. Nothing is saved or cached by the test.
5. Click **Save configuration**, then **Sync now** if the status card still says "not verified".

The connect values are validated before saving. Enforcement cannot be switched on until all four values are present and valid, so the app cannot lock itself out with an incomplete connection. The anon key and client key are encrypted on this computer with Windows secure storage (Electron `safeStorage`), with an AES-256-GCM key file fallback. Plain-text values written by an older build are still read and are re-encrypted the next time the configuration is saved.

Before enforcement is enabled, every existing local feature stays available. After it is enabled, users without an active package see the subscription gate until a payment is approved. The gate, the **Subscription** page, sign-in/sign-out and the configuration panel remain reachable while a package is expired so the customer can renew.

## 5. Payment and approval workflow

This is a manual **Personal account Send Money** flow. There is no gateway, merchant payment or checkout integration.

1. The user opens **Buy / Renew Package** and selects bKash or Nagad.
2. The official logo, the Personal number and the method instructions are shown. **Copy Number** copies the selected number.
3. The user sends exactly **8,000 BDT** from their own bKash/Nagad app using **Send Money**. Merchant Payment and Checkout must not be used.
4. The user enters the business name, contact number and the Transaction ID, then submits.
5. The request appears as **Pending Approval**. It does not unlock the app.
6. The administrator checks the transaction in the bKash/Nagad statement and reviews the request.
7. Approve it in Supabase:

```sql
select public.approve_payment_request('<payment-request-uuid>');
```

To reject with a reason:

```sql
select public.reject_payment_request('<payment-request-uuid>', 'Transaction ID not found');
```

Approval creates or extends the subscription by 365 days. Approval from the Table Editor also works; the status trigger performs the same checks.

Every Transaction ID is unique across the whole system (case-insensitive, whitespace-insensitive), so the same payment cannot be submitted twice. The desktop app cannot approve its own request because it never holds a `service_role` key.

### Administrator review

List every request, newest first:

```sql
select id, business_name, contact_number, payment_method, transaction_id,
       amount, status, submitted_at, approved_at, rejection_reason
from public.payment_requests
order by submitted_at desc;
```

Filter to the queue that needs action:

```sql
select id, business_name, contact_number, payment_method, transaction_id,
       amount, submitted_at
from public.payment_requests
where status = 'pending'
order by submitted_at asc;
```

Approve or reject using the request `id` with the two functions above. The desktop application picks up the new status on **Sync now** or its next five-minute check.

## 6. Changing payment numbers

The numbers are stored in `payment_settings` as **Personal** accounts. The agreed values are restored by the second migration:

| Method | Number | Type | Instruction |
| --- | --- | --- | --- |
| bKash | `01331707900` | Personal | Send Money |
| Nagad | `01783026754` | Personal | Send Money |

An administrator can still edit a row in Supabase, for example:

```sql
update public.payment_settings
set account_number = '01XXXXXXXXX', account_type = 'Personal',
    instructions = 'Send exactly BDT 8,000 to this bKash Personal number with Send Money. Do not use Merchant Payment or Checkout. Then submit the Transaction ID below.',
    updated_at = now()
where payment_method = 'bkash';
```

The built-in fallback numbers are used only before any settings are saved.

The package price and duration are fixed at 8,000 BDT and 365 days. Do not change the package row or code without also updating the application.

## 7. Offline behaviour

- A verified active package is cached securely and works offline.
- When enforcement is on and no verified cache exists, the app requires one online verification.
- An expired package may use a bounded offline grace period (`offline_grace_days`, 0–30). Set it to `0` to block immediately.
- When the app is online and the server reports expiry, access is blocked regardless of the grace period.

## 8. Build the Windows installer

```powershell
npm install
npm.cmd test
npm.cmd run dist:win
```

The NSIS installer is written to `dist\`. Ship only this installer; do not ship the `service_role` key or the SQL editor access.

## 9. Verification checklist

- `npm.cmd test` passes (124 tests).
- The login screen shows the package status card.
- **Test connection** in the admin panel reports the business name and package without saving.
- Saved keys show **Encrypted with Windows secure storage** (or the AES key-file fallback).
- Buy page shows the official bKash and Nagad logos, both **Personal** numbers, the **Copy Number** button and the Send Money instructions.
- Submitting a request shows **Pending Approval** with the Transaction ID, and the app remains locked until approval.
- Approval in Supabase unlocks the app after **Sync now** or the next 5-minute poll.
- Rejection shows the reason on the subscription page.
- An expired subscription shows the gate, and **Buy / Renew Package** plus **Setup Supabase** still open.
- Local data screens return `SUBSCRIPTION_BLOCKED` while the package is expired.
- With enforcement off, the application remains usable without a package.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Online payment is not configured: missing …` | The message names the missing values. Sign in as an administrator, open **Subscription → Edit configuration**, fill them in (usually only Business ID and client key), then **Test connection** and **Save**. |
| `Never use the Supabase service_role or secret key` | Paste the public anon/publishable key instead. `service_role` and `sb_secret_…` values are refused by the app and the database layer. |
| `Supabase URL must be an https:// address` | Use the full project URL, for example `https://your-project.supabase.co` (only `http://localhost` is accepted for development). |
| `Business ID must be a valid UUID` | Copy the `id` returned when the business was registered. |
| `Could not reach Supabase` | Check the project URL and the internet connection, then test again. |
| `Invalid business credentials` | Check the business UUID and client key; the key is case-sensitive. |
| `The Supabase project returned a different business` | The Business ID and client key belong to different installations. Copy both from the same `businesses` row. |
| Requests stay pending | Approve them in Supabase; the desktop app cannot approve its own payment. See the administrator review queries in section 5. |
| Buy page still says Merchant or shows old wording | Run `supabase/migrations/20261101010000_personal_payment_accounts.sql` in the SQL Editor, then press **Refresh status**. |
| `A request for this transaction ID already exists` | The same transaction ID cannot be submitted twice. |
| Package shows expired after renewal | Run **Sync now**, or wait for the background sync. |
| `verification_required` offline | Connect once to the internet so the subscription can be verified and cached. |
| `The stored Supabase key could not be decrypted` | Windows secure storage changed (new user profile or restored backup). Enter the anon key and client key again and save. |
