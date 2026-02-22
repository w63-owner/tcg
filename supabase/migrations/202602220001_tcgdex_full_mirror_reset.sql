-- Full destructive reset to a strict TCGdex mirror model.

-- Break existing foreign keys before dropping old card tables.
alter table if exists public.listings
  drop constraint if exists listings_card_ref_id_fkey;

alter table if exists public.ocr_attempts
  drop constraint if exists ocr_attempts_selected_card_ref_id_fkey;

-- card_ref_id / selected_card_ref_id become text keys (language:id).
alter table if exists public.listings
  alter column card_ref_id type text using card_ref_id::text;

alter table if exists public.ocr_attempts
  alter column selected_card_ref_id type text using selected_card_ref_id::text;

-- Clear legacy references (UUID-based) before switching FK target to tcgdex_cards(card_key).
update public.listings
set card_ref_id = null
where card_ref_id is not null
  and card_ref_id !~ '^(fr|en|jp):[a-zA-Z0-9][a-zA-Z0-9._-]*$';

update public.ocr_attempts
set selected_card_ref_id = null
where selected_card_ref_id is not null
  and selected_card_ref_id !~ '^(fr|en|jp):[a-zA-Z0-9][a-zA-Z0-9._-]*$';

-- Drop legacy card reference model.
drop table if exists public.cards_ref cascade;
drop table if exists public.sets_ref cascade;
drop table if exists public.series_ref cascade;

-- Canonical TCGdex series table.
create table if not exists public.tcgdex_series (
  language char(2) not null check (language in ('fr', 'en', 'jp')),
  id text not null,
  name text not null,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  ingested_at timestamptz not null default now(),
  primary key (language, id)
);

-- Canonical TCGdex sets table.
create table if not exists public.tcgdex_sets (
  language char(2) not null check (language in ('fr', 'en', 'jp')),
  id text not null,
  name text not null,
  logo text,
  symbol text,
  release_date date,
  tcg_online text,
  card_count jsonb not null default '{}'::jsonb,
  legal jsonb not null default '{}'::jsonb,
  abbreviation jsonb not null default '{}'::jsonb,
  serie_id text,
  serie_name text,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  ingested_at timestamptz not null default now(),
  primary key (language, id),
  constraint tcgdex_sets_serie_fk
    foreign key (language, serie_id)
    references public.tcgdex_series(language, id)
    on delete set null
);

-- Canonical TCGdex cards table.
create table if not exists public.tcgdex_cards (
  language char(2) not null check (language in ('fr', 'en', 'jp')),
  id text not null,
  card_key text generated always as ((language || ':' || id)) stored,
  category text,
  name text not null,
  local_id text,
  suffix text,
  illustrator text,
  image text,
  rarity text,
  hp integer,
  regulation_mark text,
  set_id text not null,
  set_name text,
  set_logo text,
  set_symbol text,
  set_card_count_official integer,
  set_card_count_total integer,
  set_serie_id text,
  set_serie_name text,
  variants jsonb not null default '{}'::jsonb,
  variants_detailed jsonb not null default '[]'::jsonb,
  dex_id jsonb not null default '[]'::jsonb,
  types jsonb not null default '[]'::jsonb,
  evolve_from text,
  stage text,
  description text,
  abilities jsonb not null default '[]'::jsonb,
  attacks jsonb not null default '[]'::jsonb,
  weaknesses jsonb not null default '[]'::jsonb,
  resistances jsonb not null default '[]'::jsonb,
  retreat integer,
  legal jsonb not null default '{}'::jsonb,
  pricing jsonb not null default '{}'::jsonb,
  updated_at_source timestamptz,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  ingested_at timestamptz not null default now(),
  primary key (language, id),
  unique (card_key),
  constraint tcgdex_cards_set_fk
    foreign key (language, set_id)
    references public.tcgdex_sets(language, id)
    on delete set null
);

-- Reattach app references to mirror card keys.
alter table public.listings
  add constraint listings_card_ref_id_fkey
    foreign key (card_ref_id)
    references public.tcgdex_cards(card_key)
    on delete set null;

alter table public.ocr_attempts
  add constraint ocr_attempts_selected_card_ref_id_fkey
    foreign key (selected_card_ref_id)
    references public.tcgdex_cards(card_key)
    on delete set null;

-- Mirror indexes.
create index if not exists idx_tcgdex_series_name on public.tcgdex_series(language, name);
create index if not exists idx_tcgdex_sets_name on public.tcgdex_sets(language, name);
create index if not exists idx_tcgdex_sets_serie on public.tcgdex_sets(language, serie_id);
create index if not exists idx_tcgdex_cards_name on public.tcgdex_cards(language, name);
create index if not exists idx_tcgdex_cards_local_id on public.tcgdex_cards(language, local_id);
create index if not exists idx_tcgdex_cards_set_id on public.tcgdex_cards(language, set_id);
create index if not exists idx_tcgdex_cards_rarity on public.tcgdex_cards(language, rarity);
create index if not exists idx_tcgdex_cards_card_key on public.tcgdex_cards(card_key);
create index if not exists idx_tcgdex_cards_raw_gin on public.tcgdex_cards using gin(raw);

-- Keep existing app query helper indexes after text conversion.
create index if not exists idx_listings_card_ref_active
  on public.listings(card_ref_id, status);
create index if not exists idx_ocr_attempts_selected_card_ref
  on public.ocr_attempts(selected_card_ref_id);

-- RLS + read policies for mirror tables.
alter table public.tcgdex_series enable row level security;
alter table public.tcgdex_sets enable row level security;
alter table public.tcgdex_cards enable row level security;

drop policy if exists tcgdex_series_read_all on public.tcgdex_series;
create policy tcgdex_series_read_all
on public.tcgdex_series for select
to anon, authenticated
using (true);

drop policy if exists tcgdex_sets_read_all on public.tcgdex_sets;
create policy tcgdex_sets_read_all
on public.tcgdex_sets for select
to anon, authenticated
using (true);

drop policy if exists tcgdex_cards_read_all on public.tcgdex_cards;
create policy tcgdex_cards_read_all
on public.tcgdex_cards for select
to anon, authenticated
using (true);

grant select on public.tcgdex_series to anon, authenticated;
grant select on public.tcgdex_sets to anon, authenticated;
grant select on public.tcgdex_cards to anon, authenticated;
