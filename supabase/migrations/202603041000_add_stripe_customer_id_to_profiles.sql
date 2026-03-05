-- Add stripe_customer_id to profiles for Stripe Checkout (reuse saved payment methods)
alter table public.profiles
  add column if not exists stripe_customer_id text unique;

comment on column public.profiles.stripe_customer_id is
  'Stripe Customer ID (cus_xxx) for Checkout; used to reuse saved payment methods.';
