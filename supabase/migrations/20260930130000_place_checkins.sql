-- Pasyal Passport: one check-in per user, place and Manila calendar day.
-- Additive only; reached through the backend's service-role client (RLS on, no policies).

create table if not exists public.gala_place_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  place_id uuid not null references public.places(id) on delete cascade,
  checkin_date date not null default ((now() at time zone 'Asia/Manila')::date),
  created_at timestamptz not null default now(),
  unique (user_id, place_id, checkin_date)
);

create index if not exists gala_place_checkins_user_idx on public.gala_place_checkins (user_id, created_at desc);

alter table public.gala_place_checkins enable row level security;
