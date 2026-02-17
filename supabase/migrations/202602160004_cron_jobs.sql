-- ============================================================
-- Scheduled jobs (pg_cron) for marketplace housekeeping
-- ============================================================

create extension if not exists pg_cron with schema extensions;

-- Keep a single job with this exact name
do $$
declare
  v_job_id bigint;
begin
  select jobid
    into v_job_id
  from cron.job
  where jobname = 'marketplace_hourly_housekeeping'
  limit 1;

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;
end;
$$;

-- Runs every hour:
-- - release locked transactions that exceeded payment window
-- - expire stale pending offers
select cron.schedule(
  'marketplace_hourly_housekeeping',
  '0 * * * *',
  $$
    select public.release_expired_locked_transactions();
    select public.expire_pending_offers();
  $$
);
