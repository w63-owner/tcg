-- Create profile and wallet when a new auth.users row is inserted.
-- Runs with definer rights so RLS does not block the insert.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base_username text;
begin
  base_username := coalesce(
    nullif(trim(new.raw_user_meta_data->>'username'), ''),
    split_part(new.email, '@', 1),
    'trainer'
  );
  base_username := regexp_replace(base_username, '[^a-zA-Z0-9_-]', '', 'g');
  if char_length(base_username) < 3 then
    base_username := 'trainer';
  end if;
  base_username := left(base_username, 30);

  insert into public.profiles (id, username, country_code)
  values (new.id, base_username, 'FR')
  on conflict (id) do update set
    username = coalesce(profiles.username, excluded.username),
    country_code = coalesce(profiles.country_code, excluded.country_code);

  insert into public.wallets (user_id, available_balance, pending_balance, currency)
  values (new.id, 0, 0, 'EUR')
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
