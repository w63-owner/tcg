-- Store TCGdex-style payload fields explicitly on cards_ref and normalized staging.

alter table public.cards_ref
  add column if not exists category text,
  add column if not exists "set" jsonb not null default '{}'::jsonb,
  add column if not exists variants jsonb not null default '{}'::jsonb;

alter table public.catalog_source_cards_normalized
  add column if not exists category text,
  add column if not exists "set" jsonb not null default '{}'::jsonb,
  add column if not exists variants jsonb not null default '{}'::jsonb;

create index if not exists idx_cards_ref_category on public.cards_ref(category);
create index if not exists idx_cards_ref_set_id_expr on public.cards_ref((("set" ->> 'id')));
create index if not exists idx_cards_ref_set_gin on public.cards_ref using gin("set");
create index if not exists idx_cards_ref_variants_gin on public.cards_ref using gin(variants);
