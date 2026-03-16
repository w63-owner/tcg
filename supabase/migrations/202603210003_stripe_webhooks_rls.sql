-- Enable RLS on stripe_webhooks_processed to prevent PostgREST access by anon/authenticated
ALTER TABLE public.stripe_webhooks_processed ENABLE ROW LEVEL SECURITY;
