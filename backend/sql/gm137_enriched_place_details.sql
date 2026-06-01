alter table public.places
  add column if not exists detail_summary text,
  add column if not exists best_for text[] default '{}',
  add column if not exists what_to_expect text[] default '{}',
  add column if not exists tips text[] default '{}',
  add column if not exists hours_text text,
  add column if not exists entrance_fee_text text,
  add column if not exists best_time_text text,
  add column if not exists website_url text;
