-- Idempotence for Stripe webhooks: store processed event IDs to avoid double-processing
create table if not exists public.stripe_webhooks_processed (
  stripe_event_id text not null primary key,
  processed_at timestamptz not null default now(),
  event_type text
);

comment on table public.stripe_webhooks_processed is 'Stripe webhook event IDs already processed; used for idempotent handling of checkout.session.* events';
