-- ============================================================
-- Checkout timeout: 1h default expiration + release expired locks
-- Relies on idx_transactions_status_exp (status, expiration_date)
-- ============================================================

-- 1) Réduire le délai d'expiration par défaut de 24h à 1h
alter table public.transactions
  alter column expiration_date set default (now() + interval '1 hour');

-- 2) Fonction de déblocage des transactions expirées (utilise idx_transactions_status_exp)
create or replace function public.release_expired_locked_transactions()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  with expired_tx as (
    update public.transactions t
       set status = 'EXPIRED',
           updated_at = now()
     where t.status = 'PENDING_PAYMENT'
       and t.expiration_date < now()
    returning t.listing_id
  ),
  unlocked as (
    update public.listings l
       set status = 'ACTIVE',
           updated_at = now()
     where l.status = 'LOCKED'
       and l.id in (select listing_id from expired_tx)
    returning l.id
  )
  select count(*) into v_count from unlocked;

  return v_count;
end;
$$;

comment on function public.release_expired_locked_transactions() is
  'Marks expired PENDING_PAYMENT transactions as EXPIRED and unlocks their listings (LOCKED→ACTIVE). Uses idx_transactions_status_exp. Returns number of listings unlocked.';

revoke all on function public.release_expired_locked_transactions() from public;
grant execute on function public.release_expired_locked_transactions() to authenticated;
