-- ===========================================================================
-- Bus Malik Group — one-time Supabase setup
-- Project: hgavhgssxmbtqiqvrsyd
--
-- How to run
--   1. Open the Supabase Dashboard for this project.
--   2. Open SQL Editor → New query.
--   3. Paste this whole file and press Run.
--
-- Safe to run more than once. It does not drop tables and does not delete
-- subscriptions, payment requests or businesses. It only:
--   * switches the two payment numbers to Personal Send Money and keeps the
--     fixed Yearly Business Package at BDT 8,000 / 365 days;
--   * registers the Bus Malik Group business row if it does not exist yet;
--   * prints the Business ID and client key to paste into the desktop app.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Personal Send Money accounts and the fixed package
--    (contents of supabase/migrations/20261101010000_personal_payment_accounts.sql)
-- ---------------------------------------------------------------------------
alter table public.payment_settings
  alter column account_type set default 'Personal';

insert into public.payment_settings (payment_method, account_number, account_type, instructions, is_enabled)
values
  ('bkash', '01331707900', 'Personal',
   'Send exactly BDT 8,000 to this bKash Personal number with Send Money. Do not use Merchant Payment or Checkout. Then submit the Transaction ID below.', true),
  ('nagad', '01783026754', 'Personal',
   'Send exactly BDT 8,000 to this Nagad Personal number with Send Money. Do not use Merchant Payment or Checkout. Then submit the Transaction ID below.', true)
on conflict (payment_method) do update
set account_number = excluded.account_number,
    account_type = excluded.account_type,
    instructions = excluded.instructions,
    updated_at = now();

update public.packages
set package_name = 'Yearly Business Package',
    price = 8000.00,
    currency = 'BDT',
    duration_days = 365,
    is_active = true
where package_code = 'YEARLY_8000';

-- ---------------------------------------------------------------------------
-- 2. Register this installation
--    Creates the row only when no business with this name exists already.
-- ---------------------------------------------------------------------------
insert into public.businesses (name, contact_number)
select 'Bus Malik Group', ''
where not exists (
  select 1 from public.businesses where name = 'Bus Malik Group'
);

-- ---------------------------------------------------------------------------
-- 3. Copy these two values into the desktop app
--    Subscription → Edit configuration → Business ID / Business client key.
--    The project URL and public anon key are already built into this build.
--    The client key is case-sensitive and must be treated like a password.
-- ---------------------------------------------------------------------------
select id as business_id, name, client_key
from public.businesses
where name = 'Bus Malik Group'
order by created_at asc
limit 1;
