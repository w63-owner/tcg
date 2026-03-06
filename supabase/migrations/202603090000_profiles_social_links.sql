-- Add optional social links to profiles (Instagram, Facebook, TikTok)
alter table public.profiles
  add column if not exists instagram_url text,
  add column if not exists facebook_url text,
  add column if not exists tiktok_url text;

comment on column public.profiles.instagram_url is 'Optional Instagram profile or post URL';
comment on column public.profiles.facebook_url is 'Optional Facebook profile or page URL';
comment on column public.profiles.tiktok_url is 'Optional TikTok profile URL';
