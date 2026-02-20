-- Normalize TCGdex set/series references and link them from cards_ref.

create table if not exists public.series_ref (
  id uuid primary key default gen_random_uuid(),
  tcgdex_id text unique,
  name text not null,
  language char(2) check (language is null or language in ('fr', 'en', 'jp')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name, language)
);

create table if not exists public.sets_ref (
  id uuid primary key default gen_random_uuid(),
  tcgdex_id text unique not null,
  name text not null,
  language char(2) check (language is null or language in ('fr', 'en', 'jp')),
  logo text,
  symbol text,
  official_count integer,
  total_count integer,
  series_ref_id uuid references public.series_ref(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.cards_ref
  add column if not exists set_ref_id uuid references public.sets_ref(id) on delete set null,
  add column if not exists series_ref_id uuid references public.series_ref(id) on delete set null;

create index if not exists idx_series_ref_language on public.series_ref(language);
create index if not exists idx_sets_ref_language on public.sets_ref(language);
create index if not exists idx_sets_ref_series_ref on public.sets_ref(series_ref_id);
create index if not exists idx_cards_ref_set_ref on public.cards_ref(set_ref_id);
create index if not exists idx_cards_ref_series_ref on public.cards_ref(series_ref_id);

drop trigger if exists trg_series_ref_updated_at on public.series_ref;
create trigger trg_series_ref_updated_at
before update on public.series_ref
for each row execute function public.set_updated_at();

drop trigger if exists trg_sets_ref_updated_at on public.sets_ref;
create trigger trg_sets_ref_updated_at
before update on public.sets_ref
for each row execute function public.set_updated_at();
