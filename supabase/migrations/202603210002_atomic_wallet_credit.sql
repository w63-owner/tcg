-- Atomic wallet credit: INSERT ... ON CONFLICT to avoid read-modify-write race condition
CREATE OR REPLACE FUNCTION public.credit_seller_wallet(p_user_id uuid, p_amount numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO wallets (user_id, pending_balance, available_balance, currency)
  VALUES (p_user_id, p_amount, 0, 'EUR')
  ON CONFLICT (user_id) DO UPDATE
    SET pending_balance = wallets.pending_balance + EXCLUDED.pending_balance;
END;
$$;

REVOKE ALL ON FUNCTION public.credit_seller_wallet(uuid, numeric) FROM public;
REVOKE ALL ON FUNCTION public.credit_seller_wallet(uuid, numeric) FROM anon;
REVOKE ALL ON FUNCTION public.credit_seller_wallet(uuid, numeric) FROM authenticated;
