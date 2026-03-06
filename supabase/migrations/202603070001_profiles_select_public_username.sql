-- Allow authenticated users to read id and username of any profile (for public profile pages /u/[username]).
create policy profiles_select_public_username on public.profiles
  for select to authenticated
  using (true);
