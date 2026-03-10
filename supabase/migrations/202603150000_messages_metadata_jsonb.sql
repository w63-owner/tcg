-- Add metadata JSONB column to messages for structured system event data
-- System events (offer_accepted, payment_completed, order_shipped, sale_completed)
-- will store structured data in metadata instead of JSON strings in content

alter table public.messages
  add column if not exists metadata jsonb;

comment on column public.messages.metadata is 'Structured data for system messages (e.g. { type, offer_amount, total_amount, seller_credit })';
