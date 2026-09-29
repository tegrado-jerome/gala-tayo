-- Barkada features for Gala Plans: RSVP/paid status per member and place polls.
-- Additive only. Tables are reached through the backend's service-role client,
-- so RLS is enabled with no policies to keep them closed to direct client access.

create table if not exists public.gala_plan_members (
  plan_id uuid not null references public.gala_plans(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rsvp text not null default 'going' check (rsvp in ('going', 'maybe', 'no')),
  paid boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (plan_id, user_id)
);

create table if not exists public.gala_plan_polls (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.gala_plans(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  question text not null check (char_length(question) between 1 and 120),
  created_at timestamptz not null default now()
);

create table if not exists public.gala_plan_poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.gala_plan_polls(id) on delete cascade,
  place_id uuid references public.places(id) on delete set null,
  label text not null check (char_length(label) between 1 and 80),
  sort_order integer not null default 0
);

create table if not exists public.gala_plan_poll_votes (
  poll_id uuid not null references public.gala_plan_polls(id) on delete cascade,
  option_id uuid not null references public.gala_plan_poll_options(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (poll_id, user_id)
);

create index if not exists gala_plan_members_user_idx on public.gala_plan_members (user_id);
create index if not exists gala_plan_polls_plan_idx on public.gala_plan_polls (plan_id);
create index if not exists gala_plan_poll_options_poll_idx on public.gala_plan_poll_options (poll_id);
create index if not exists gala_plan_poll_votes_option_idx on public.gala_plan_poll_votes (option_id);

alter table public.gala_plan_members enable row level security;
alter table public.gala_plan_polls enable row level security;
alter table public.gala_plan_poll_options enable row level security;
alter table public.gala_plan_poll_votes enable row level security;
