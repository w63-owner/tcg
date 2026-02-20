-- Hard-cut rename of cards_ref and staging columns to TCGdex-style camelCase keys.

alter table public.cards_ref
  rename column tcg_id to "tcgId";

alter table public.cards_ref
  rename column set_id to "setId";

alter table public.cards_ref
  rename column card_number to "localId";

alter table public.cards_ref
  rename column image_url to image;

alter table public.cards_ref
  rename column regulation_mark to "regulationMark";

alter table public.cards_ref
  rename column release_year to "releaseYear";

drop index if exists idx_cards_ref_set;
create index if not exists idx_cards_ref_set on public.cards_ref("setId");

drop index if exists idx_cards_ref_release_year;
create index if not exists idx_cards_ref_release_year on public.cards_ref("releaseYear");

drop index if exists idx_catalog_normalized_tcg_id;

alter table public.catalog_source_cards_normalized
  rename column tcg_id to "tcgId";

alter table public.catalog_source_cards_normalized
  rename column set_id to "setId";

alter table public.catalog_source_cards_normalized
  rename column card_number to "localId";

alter table public.catalog_source_cards_normalized
  rename column regulation_mark to "regulationMark";

alter table public.catalog_source_cards_normalized
  rename column release_year to "releaseYear";

alter table public.catalog_source_cards_normalized
  rename column image_url to image;

create index if not exists idx_catalog_normalized_tcgId
  on public.catalog_source_cards_normalized("tcgId");
