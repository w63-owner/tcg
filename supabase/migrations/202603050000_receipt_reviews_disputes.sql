-- Phase 6: Receipt confirmation, reviews, disputes
-- 1) Add COMPLETED and DISPUTED to transaction_status
do $$
begin
  if not exists (
    select 1 from pg_enum e
    join pg_type t on e.enumtypid = t.oid
    where t.typname = 'transaction_status' and e.enumlabel = 'COMPLETED'
  ) then
    alter type public.transaction_status add value 'COMPLETED';
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_enum e
    join pg_type t on e.enumtypid = t.oid
    where t.typname = 'transaction_status' and e.enumlabel = 'DISPUTED'
  ) then
    alter type public.transaction_status add value 'DISPUTED';
  end if;
end
$$;

-- 2) Table reviews (buyer evaluates seller after confirming receipt)
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete restrict,
  reviewer_id uuid not null references public.profiles(id) on delete restrict,
  reviewee_id uuid not null references public.profiles(id) on delete restrict,
  rating smallint not null check (rating >= 1 and rating <= 5),
  comment text,
  created_at timestamptz not null default now(),
  unique(transaction_id)
);

comment on table public.reviews is 'Buyer review of seller after order completion (one per transaction)';
comment on column public.reviews.reviewer_id is 'Buyer who left the review';
comment on column public.reviews.reviewee_id is 'Seller who received the review';

create index if not exists idx_reviews_reviewee on public.reviews(reviewee_id, created_at desc);
create index if not exists idx_reviews_transaction on public.reviews(transaction_id);

alter table public.reviews enable row level security;

-- RLS: participants of the transaction can read the review; only service role writes
drop policy if exists reviews_select_public on public.reviews;
create policy reviews_select_public on public.reviews for select to authenticated
  using (
    exists (
      select 1 from public.transactions t
      where t.id = reviews.transaction_id
        and (t.buyer_id = auth.uid() or t.seller_id = auth.uid())
    )
  );

-- Insert/update via service role only (server actions use admin client)
grant select on public.reviews to authenticated;
grant insert, update on public.reviews to service_role;

-- 3) Table disputes (buyer opens dispute when receipt is not OK)
do $$
begin
  if not exists (select 1 from pg_type where typname = 'dispute_reason') then
    create type public.dispute_reason as enum (
      'DAMAGED_CARD',
      'WRONG_CARD',
      'EMPTY_PACKAGE',
      'OTHER'
    );
  end if;
end
$$;

create table if not exists public.disputes (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete restrict,
  opened_by uuid not null references public.profiles(id) on delete restrict,
  reason public.dispute_reason not null,
  description text not null check (char_length(description) >= 10),
  status text not null default 'OPEN' check (status in ('OPEN', 'IN_REVIEW', 'RESOLVED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(transaction_id)
);

comment on table public.disputes is 'Dispute opened by buyer when received item does not match';
comment on column public.disputes.opened_by is 'Buyer who opened the dispute';

create index if not exists idx_disputes_transaction on public.disputes(transaction_id);
create index if not exists idx_disputes_status on public.disputes(status) where status = 'OPEN';

alter table public.disputes enable row level security;

drop policy if exists disputes_select_participant on public.disputes;
create policy disputes_select_participant on public.disputes for select to authenticated
  using (
    exists (
      select 1 from public.transactions t
      where t.id = disputes.transaction_id
        and (t.buyer_id = auth.uid() or t.seller_id = auth.uid())
    )
  );

grant select on public.disputes to authenticated;
grant insert, update on public.disputes to service_role;

-- Trigger updated_at for disputes
create or replace function public.set_disputes_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_disputes_updated_at on public.disputes;
create trigger trg_disputes_updated_at
  before update on public.disputes
  for each row execute function public.set_disputes_updated_at();
