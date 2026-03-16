-- ============================================================
-- Cron: annuler les transactions PENDING_PAYMENT expirées (> 30 min)
-- et débloquer les annonces (LOCKED → ACTIVE).
-- Aligné avec le timeout Stripe Checkout (30 min).
-- ============================================================

do $$
declare
  v_job_id bigint;
begin
  select jobid
    into v_job_id
  from cron.job
  where jobname = 'release_expired_transactions'
  limit 1;

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;
end;
$$;

-- Toutes les 10 minutes : marquer EXPIRED et débloquer les listings
select cron.schedule(
  'release_expired_transactions',
  '*/10 * * * *',
  $$select public.release_expired_locked_transactions();$$
);
