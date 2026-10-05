-- Saves unfinished onboarding answers so people can resume on any device.
create table if not exists public.onboarding_drafts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  draft_data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.onboarding_drafts enable row level security;
-- Only the backend (service role) reads and writes drafts; no client policies.
