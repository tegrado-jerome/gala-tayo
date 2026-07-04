create table if not exists public.ask_ai_map_geoapify_cache (
  normalized_key text primary key,
  place_name text,
  query text,
  lat double precision not null,
  lng double precision not null,
  formatted_address text,
  geoapify_place_id text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists ask_ai_map_geoapify_cache_place_name_idx
  on public.ask_ai_map_geoapify_cache (place_name);
