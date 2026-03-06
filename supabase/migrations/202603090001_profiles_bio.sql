-- Add optional bio to profiles
alter table public.profiles
  add column if not exists bio text;

comment on column public.profiles.bio is 'Optional short bio / description for the profile';
