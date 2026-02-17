-- Catalog ingestion staging and audit tables.

create table if not exists public.catalog_import_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  mode text not null check (mode in ('full', 'incremental')),
  status text not null default 'running' check (status in ('running', 'success', 'failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  fetched_count integer not null default 0,
  normalized_count integer not null default 0,
  deduped_count integer not null default 0,
  upserted_count integer not null default 0,
  error_message text,
  metrics jsonb not null default '{}'::jsonb
);

create table if not exists public.catalog_source_cards_raw (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.catalog_import_runs(id) on delete cascade,
  source text not null,
  external_id text not null,
  payload jsonb not null,
  payload_hash text not null,
  source_updated_at timestamptz,
  fetched_at timestamptz not null default now(),
  unique (source, external_id)
);

create table if not exists public.catalog_source_cards_normalized (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.catalog_import_runs(id) on delete cascade,
  source text not null,
  external_id text not null,
  canonical_key text not null,
  tcg_id text not null,
  name text not null,
  set_id text not null,
  card_number text,
  hp integer,
  rarity text,
  finish text,
  is_secret boolean,
  is_promo boolean,
  vintage_hint text,
  regulation_mark text,
  illustrator text,
  estimated_condition public.card_condition,
  language char(2),
  release_year integer,
  image_url text,
  mapping_confidence numeric(4,3) not null default 0.5,
  source_priority integer not null default 50,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_catalog_import_runs_status_started
  on public.catalog_import_runs(status, started_at desc);
create index if not exists idx_catalog_raw_source_external
  on public.catalog_source_cards_raw(source, external_id);
create index if not exists idx_catalog_raw_run_id
  on public.catalog_source_cards_raw(run_id);
create index if not exists idx_catalog_raw_updated_at
  on public.catalog_source_cards_raw(source_updated_at desc);
create index if not exists idx_catalog_normalized_run_id
  on public.catalog_source_cards_normalized(run_id);
create index if not exists idx_catalog_normalized_source_external
  on public.catalog_source_cards_normalized(source, external_id);
create index if not exists idx_catalog_normalized_canonical_key
  on public.catalog_source_cards_normalized(canonical_key);
create index if not exists idx_catalog_normalized_tcg_id
  on public.catalog_source_cards_normalized(tcg_id);

alter table public.catalog_import_runs enable row level security;
alter table public.catalog_source_cards_raw enable row level security;
alter table public.catalog_source_cards_normalized enable row level security;

drop policy if exists catalog_import_runs_auth_read on public.catalog_import_runs;
create policy catalog_import_runs_auth_read
on public.catalog_import_runs for select
to authenticated
using (true);

drop policy if exists catalog_source_cards_raw_auth_read on public.catalog_source_cards_raw;
create policy catalog_source_cards_raw_auth_read
on public.catalog_source_cards_raw for select
to authenticated
using (true);

drop policy if exists catalog_source_cards_normalized_auth_read on public.catalog_source_cards_normalized;
create policy catalog_source_cards_normalized_auth_read
on public.catalog_source_cards_normalized for select
to authenticated
using (true);

revoke all on public.catalog_import_runs from anon;
revoke all on public.catalog_source_cards_raw from anon;
revoke all on public.catalog_source_cards_normalized from anon;
grant select on public.catalog_import_runs to authenticated;
grant select on public.catalog_source_cards_raw to authenticated;
grant select on public.catalog_source_cards_normalized to authenticated;

