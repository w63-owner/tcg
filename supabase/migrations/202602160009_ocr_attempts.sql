-- OCR attempts: store extraction output, suggestions, and user selection

create table if not exists public.ocr_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  listing_id uuid references public.listings(id) on delete set null,
  selected_card_ref_id uuid references public.cards_ref(id) on delete set null,
  raw_text text not null default '',
  parsed jsonb not null default '{}'::jsonb,
  candidates jsonb not null default '[]'::jsonb,
  confidence numeric(5,4) not null default 0 check (confidence >= 0 and confidence <= 1),
  provider text not null default 'openai',
  model text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ocr_attempts_user_created
  on public.ocr_attempts(user_id, created_at desc);
create index if not exists idx_ocr_attempts_listing
  on public.ocr_attempts(listing_id);
create index if not exists idx_ocr_attempts_selected_card_ref
  on public.ocr_attempts(selected_card_ref_id);

drop trigger if exists trg_ocr_attempts_updated_at on public.ocr_attempts;
create trigger trg_ocr_attempts_updated_at
before update on public.ocr_attempts
for each row execute function public.set_updated_at();

alter table public.ocr_attempts enable row level security;

drop policy if exists ocr_attempts_select_own on public.ocr_attempts;
create policy ocr_attempts_select_own
on public.ocr_attempts for select
to authenticated
using (user_id = auth.uid());

drop policy if exists ocr_attempts_insert_own on public.ocr_attempts;
create policy ocr_attempts_insert_own
on public.ocr_attempts for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists ocr_attempts_update_own on public.ocr_attempts;
create policy ocr_attempts_update_own
on public.ocr_attempts for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

revoke all on public.ocr_attempts from anon;
grant select, insert, update on public.ocr_attempts to authenticated;

