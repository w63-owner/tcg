-- Favorites, saved searches, conversations/messages, and search indexes

create table if not exists public.favorite_listings (
  user_id uuid not null references public.profiles(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);

create table if not exists public.favorite_sellers (
  user_id uuid not null references public.profiles(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, seller_id),
  check (user_id <> seller_id)
);

create table if not exists public.saved_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  search_params jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (listing_id, buyer_id, seller_id),
  check (buyer_id <> seller_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 2000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

-- Generic update timestamps
drop trigger if exists trg_saved_searches_updated_at on public.saved_searches;
create trigger trg_saved_searches_updated_at
before update on public.saved_searches
for each row execute function public.set_updated_at();

drop trigger if exists trg_conversations_updated_at on public.conversations;
create trigger trg_conversations_updated_at
before update on public.conversations
for each row execute function public.set_updated_at();

-- Search and feature indexes
create extension if not exists pg_trgm;
create index if not exists idx_favorite_listings_user on public.favorite_listings(user_id, created_at desc);
create index if not exists idx_favorite_sellers_user on public.favorite_sellers(user_id, created_at desc);
create index if not exists idx_saved_searches_user on public.saved_searches(user_id, created_at desc);
create index if not exists idx_conversations_buyer on public.conversations(buyer_id, updated_at desc);
create index if not exists idx_conversations_seller on public.conversations(seller_id, updated_at desc);
create index if not exists idx_conversations_listing on public.conversations(listing_id);
create index if not exists idx_messages_conversation_created on public.messages(conversation_id, created_at asc);
create index if not exists idx_messages_unread on public.messages(conversation_id) where read_at is null;

create index if not exists idx_listings_display_price_active
  on public.listings(display_price) where status = 'ACTIVE';
create index if not exists idx_listings_condition_active
  on public.listings(condition) where status = 'ACTIVE';
create index if not exists idx_listings_graded_note_active
  on public.listings(is_graded, grade_note) where status = 'ACTIVE';
create index if not exists idx_listings_card_ref_active
  on public.listings(card_ref_id) where status = 'ACTIVE' and card_ref_id is not null;
create index if not exists idx_listings_title_trgm
  on public.listings using gin (title gin_trgm_ops);

create index if not exists idx_cards_ref_set on public.cards_ref(set_id);

-- RLS enable
alter table public.favorite_listings enable row level security;
alter table public.favorite_sellers enable row level security;
alter table public.saved_searches enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

-- favorite_listings
drop policy if exists favorite_listings_select_own on public.favorite_listings;
create policy favorite_listings_select_own
on public.favorite_listings for select
to authenticated
using (user_id = auth.uid());

drop policy if exists favorite_listings_insert_own on public.favorite_listings;
create policy favorite_listings_insert_own
on public.favorite_listings for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists favorite_listings_delete_own on public.favorite_listings;
create policy favorite_listings_delete_own
on public.favorite_listings for delete
to authenticated
using (user_id = auth.uid());

-- favorite_sellers
drop policy if exists favorite_sellers_select_own on public.favorite_sellers;
create policy favorite_sellers_select_own
on public.favorite_sellers for select
to authenticated
using (user_id = auth.uid());

drop policy if exists favorite_sellers_insert_own on public.favorite_sellers;
create policy favorite_sellers_insert_own
on public.favorite_sellers for insert
to authenticated
with check (user_id = auth.uid() and user_id <> seller_id);

drop policy if exists favorite_sellers_delete_own on public.favorite_sellers;
create policy favorite_sellers_delete_own
on public.favorite_sellers for delete
to authenticated
using (user_id = auth.uid());

-- saved_searches
drop policy if exists saved_searches_select_own on public.saved_searches;
create policy saved_searches_select_own
on public.saved_searches for select
to authenticated
using (user_id = auth.uid());

drop policy if exists saved_searches_insert_own on public.saved_searches;
create policy saved_searches_insert_own
on public.saved_searches for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists saved_searches_update_own on public.saved_searches;
create policy saved_searches_update_own
on public.saved_searches for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists saved_searches_delete_own on public.saved_searches;
create policy saved_searches_delete_own
on public.saved_searches for delete
to authenticated
using (user_id = auth.uid());

-- conversations
drop policy if exists conversations_select_participant on public.conversations;
create policy conversations_select_participant
on public.conversations for select
to authenticated
using (buyer_id = auth.uid() or seller_id = auth.uid());

drop policy if exists conversations_insert_participant on public.conversations;
create policy conversations_insert_participant
on public.conversations for insert
to authenticated
with check (
  (buyer_id = auth.uid() or seller_id = auth.uid())
  and buyer_id <> seller_id
);

drop policy if exists conversations_update_participant on public.conversations;
create policy conversations_update_participant
on public.conversations for update
to authenticated
using (buyer_id = auth.uid() or seller_id = auth.uid())
with check (buyer_id = auth.uid() or seller_id = auth.uid());

-- messages
drop policy if exists messages_select_participant on public.messages;
create policy messages_select_participant
on public.messages for select
to authenticated
using (
  exists (
    select 1
    from public.conversations c
    where c.id = messages.conversation_id
      and (c.buyer_id = auth.uid() or c.seller_id = auth.uid())
  )
);

drop policy if exists messages_insert_sender_participant on public.messages;
create policy messages_insert_sender_participant
on public.messages for insert
to authenticated
with check (
  sender_id = auth.uid()
  and exists (
    select 1
    from public.conversations c
    where c.id = messages.conversation_id
      and (c.buyer_id = auth.uid() or c.seller_id = auth.uid())
  )
);

drop policy if exists messages_update_participant on public.messages;
create policy messages_update_participant
on public.messages for update
to authenticated
using (
  exists (
    select 1
    from public.conversations c
    where c.id = messages.conversation_id
      and (c.buyer_id = auth.uid() or c.seller_id = auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.conversations c
    where c.id = messages.conversation_id
      and (c.buyer_id = auth.uid() or c.seller_id = auth.uid())
  )
);

-- Grants
grant select, insert, delete on public.favorite_listings to authenticated;
grant select, insert, delete on public.favorite_sellers to authenticated;
grant select, insert, update, delete on public.saved_searches to authenticated;
grant select, insert, update on public.conversations to authenticated;
grant select, insert, update on public.messages to authenticated;

-- RPC: ensure conversation exists for accepted offer
create or replace function public.ensure_conversation_for_offer(p_offer_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_offer record;
  v_conversation_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select
    o.id as offer_id,
    o.status as offer_status,
    o.buyer_id as buyer_id,
    l.id as listing_id,
    l.seller_id as seller_id
  into v_offer
  from public.offers o
  join public.listings l on l.id = o.listing_id
  where o.id = p_offer_id;

  if v_offer.offer_id is null then
    raise exception 'Offer not found';
  end if;
  if v_offer.offer_status <> 'ACCEPTED' then
    raise exception 'Offer must be ACCEPTED';
  end if;
  if v_offer.seller_id <> v_user_id then
    raise exception 'Only seller can ensure conversation from accepted offer';
  end if;

  insert into public.conversations (listing_id, buyer_id, seller_id)
  values (v_offer.listing_id, v_offer.buyer_id, v_offer.seller_id)
  on conflict (listing_id, buyer_id, seller_id)
  do update set updated_at = now()
  returning id into v_conversation_id;

  return v_conversation_id;
end;
$$;

revoke all on function public.ensure_conversation_for_offer(uuid) from public;
grant execute on function public.ensure_conversation_for_offer(uuid) to authenticated;
