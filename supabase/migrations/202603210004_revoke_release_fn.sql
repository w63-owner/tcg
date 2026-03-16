-- Revoke public/authenticated access to SECURITY DEFINER function; only pg_cron/service_role should call it
REVOKE ALL ON FUNCTION public.release_expired_locked_transactions() FROM public;
REVOKE ALL ON FUNCTION public.release_expired_locked_transactions() FROM authenticated;
REVOKE ALL ON FUNCTION public.release_expired_locked_transactions() FROM anon;
