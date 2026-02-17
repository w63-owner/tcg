-- Observability: alerts table + cron wrapper for failure visibility

create table if not exists public.ops_alerts (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  severity text not null default 'error',
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz
);

create index if not exists idx_ops_alerts_created_at on public.ops_alerts(created_at desc);
create index if not exists idx_ops_alerts_source on public.ops_alerts(source, created_at desc);

alter table public.ops_alerts enable row level security;

drop policy if exists ops_alerts_auth_read on public.ops_alerts;
create policy ops_alerts_auth_read
on public.ops_alerts for select
to authenticated
using (true);

revoke all on public.ops_alerts from anon;
grant select on public.ops_alerts to authenticated;

create or replace function public.log_ops_alert(
  p_source text,
  p_message text,
  p_metadata jsonb default '{}'::jsonb,
  p_severity text default 'error'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.ops_alerts (source, severity, message, metadata)
  values (coalesce(p_source, 'unknown'), coalesce(p_severity, 'error'), coalesce(p_message, ''), coalesce(p_metadata, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.log_ops_alert(text, text, jsonb, text) from public;
grant execute on function public.log_ops_alert(text, text, jsonb, text) to authenticated;

create or replace function public.run_hourly_housekeeping()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_released integer := 0;
  v_expired integer := 0;
begin
  begin
    v_released := public.release_expired_locked_transactions();
    v_expired := public.expire_pending_offers();
    return jsonb_build_object(
      'ok', true,
      'released_transactions', v_released,
      'expired_offers', v_expired
    );
  exception
    when others then
      perform public.log_ops_alert(
        'cron_housekeeping',
        sqlerrm,
        jsonb_build_object('released_transactions', v_released, 'expired_offers', v_expired, 'sqlstate', SQLSTATE),
        'error'
      );
      return jsonb_build_object('ok', false, 'error', sqlerrm);
  end;
end;
$$;

revoke all on function public.run_hourly_housekeeping() from public;
grant execute on function public.run_hourly_housekeeping() to authenticated;

create extension if not exists pg_cron with schema extensions;

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

select cron.schedule(
  'marketplace_hourly_housekeeping',
  '0 * * * *',
  $$select public.run_hourly_housekeeping();$$
);
