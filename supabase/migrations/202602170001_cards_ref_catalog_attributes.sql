-- Extend cards_ref with expert catalog attributes used by OCR/matching.

alter table public.cards_ref
  add column if not exists card_number text,
  add column if not exists hp integer check (hp is null or hp > 0),
  add column if not exists rarity text,
  add column if not exists finish text,
  add column if not exists is_secret boolean,
  add column if not exists is_promo boolean,
  add column if not exists vintage_hint text check (
    vintage_hint is null or vintage_hint in ('1ST_EDITION', 'SHADOWLESS', 'UNLIMITED')
  ),
  add column if not exists regulation_mark text,
  add column if not exists illustrator text,
  add column if not exists estimated_condition public.card_condition,
  add column if not exists language char(2) check (language is null or language in ('fr', 'en', 'jp')),
  add column if not exists release_year integer check (
    release_year is null or (release_year >= 1995 and release_year <= 2100)
  ),
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_cards_ref_release_year on public.cards_ref(release_year);
create index if not exists idx_cards_ref_rarity on public.cards_ref(rarity);
create index if not exists idx_cards_ref_finish on public.cards_ref(finish);
create index if not exists idx_cards_ref_promo on public.cards_ref(is_promo);
create index if not exists idx_cards_ref_metadata_gin on public.cards_ref using gin(metadata);

drop trigger if exists trg_cards_ref_updated_at on public.cards_ref;
create trigger trg_cards_ref_updated_at
before update on public.cards_ref
for each row execute function public.set_updated_at();

