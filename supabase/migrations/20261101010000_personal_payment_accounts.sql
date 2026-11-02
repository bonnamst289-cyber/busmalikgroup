-- Personal Send Money accounts for the Yearly Business Package.
--
-- Run this after 20261101000000_subscription_system.sql, or on any project that
-- already has the subscription system installed. It is safe to run more than
-- once and does not touch payment requests or subscriptions.

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

-- The package price and duration are fixed. Approval records expiry as
-- start_date + duration_days (365), and a renewal continues after the paid
-- expiry so remaining days are never lost.
update public.packages
set package_name = 'Yearly Business Package',
    price = 8000.00,
    currency = 'BDT',
    duration_days = 365,
    is_active = true
where package_code = 'YEARLY_8000';
