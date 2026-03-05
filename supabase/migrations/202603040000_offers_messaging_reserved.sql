-- Contact vendeur + Négociation (offres) depuis la messagerie
-- 1) Statut RESERVED sur les annonces + reserved_for / reserved_price
-- 2) Messages de type offre (message_type, offer_id) pour afficher les offres dans le fil
-- 3) Lien offre <-> conversation (conversation_id sur offers)
-- 4) Règles d'offre : réduction max 40% (min 60% du prix)
-- 5) Checkout autorisé sur annonce RESERVED pour l'acheteur réservé

do $$
begin
  if not exists (
    select 1 from pg_enum e
    join pg_type t on e.enumtypid = t.oid
    where t.typname = 'listing_status' and e.enumlabel = 'RESERVED'
  ) then
    alter type public.listing_status add value 'RESERVED';
  end if;
end
$$;

alter table public.listings
  add column if not exists reserved_for uuid references public.profiles(id) on delete set null,
  add column if not exists reserved_price numeric(12,2) check (reserved_price is null or reserved_price > 0);

comment on column public.listings.reserved_for is 'When status = RESERVED, only this buyer can checkout at reserved_price';
comment on column public.listings.reserved_price is 'Agreed price when listing is RESERVED (display price incl. fees)';

-- RLS policy for RESERVED is in next migration (cannot use new enum value in same transaction)

-- Messages: type (text | offer | system) et lien optionnel vers une offre
alter table public.messages
  add column if not exists message_type text not null default 'text' check (message_type in ('text', 'offer', 'system')),
  add column if not exists offer_id uuid references public.offers(id) on delete set null;

create index if not exists idx_messages_offer_id on public.messages(offer_id) where offer_id is not null;

-- Offers: lien optionnel vers la conversation (quand l'offre est envoyée depuis le fil)
alter table public.offers
  add column if not exists conversation_id uuid references public.conversations(id) on delete set null;

create index if not exists idx_offers_conversation on public.offers(conversation_id) where conversation_id is not null;

-- Règle métier: réduction max 40% (min 60% du prix affiché)
create or replace function public.enforce_offer_rules()
returns trigger
language plpgsql
as $$
declare
  v_count_today integer;
  v_display_price numeric(12,2);
begin
  select count(*) into v_count_today
  from public.offers o
  where o.buyer_id = new.buyer_id
    and o.created_at::date = now()::date;
  if v_count_today >= 10 then
    raise exception 'Daily offer limit reached (10/day)';
  end if;

  select l.display_price into v_display_price
  from public.listings l
  where l.id = new.listing_id
    and l.status in ('ACTIVE', 'RESERVED');
  if v_display_price is null then
    raise exception 'Offers are allowed only on ACTIVE or RESERVED listings';
  end if;
  if new.offer_amount < round((v_display_price * 0.60)::numeric, 2) then
    raise exception 'Offer too low (max 40%% discount)';
  end if;
  if new.expires_at is null then
    new.expires_at := now() + interval '24 hours';
  end if;
  return new;
end;
$$;

-- Checkout: autoriser RESERVED si l'acheteur est reserved_for
create or replace function public.create_pending_transaction_and_lock_listing(
  p_listing_id uuid,
  p_shipping_cost numeric,
  p_fee_amount numeric,
  p_total_amount numeric
)
returns table (
  transaction_id uuid,
  listing_id uuid,
  seller_id uuid,
  listing_title text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_buyer_id uuid;
  v_listing public.listings%rowtype;
  v_transaction_id uuid;
begin
  v_buyer_id := auth.uid();

  if v_buyer_id is null then
    raise exception 'Authentication required';
  end if;

  select *
    into v_listing
  from public.listings
  where id = p_listing_id
  for update;

  if v_listing.id is null then
    raise exception 'Listing not found';
  end if;

  if v_listing.seller_id = v_buyer_id then
    raise exception 'Cannot buy own listing';
  end if;

  if v_listing.status = 'ACTIVE' then
    null;
  elsif v_listing.status = 'RESERVED' and v_listing.reserved_for = v_buyer_id then
    null;
  else
    raise exception 'Listing is not available for you';
  end if;

  update public.listings
     set status = 'LOCKED',
         updated_at = now()
   where id = v_listing.id;

  insert into public.transactions (
    listing_id,
    buyer_id,
    seller_id,
    total_amount,
    fee_amount,
    shipping_cost,
    status
  )
  values (
    v_listing.id,
    v_buyer_id,
    v_listing.seller_id,
    round(coalesce(p_total_amount, 0)::numeric, 2),
    round(coalesce(p_fee_amount, 0)::numeric, 2),
    round(coalesce(p_shipping_cost, 0)::numeric, 2),
    'PENDING_PAYMENT'
  )
  returning id into v_transaction_id;

  return query
  select
    v_transaction_id as transaction_id,
    v_listing.id as listing_id,
    v_listing.seller_id as seller_id,
    v_listing.title as listing_title;
end;
$$;
