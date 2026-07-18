create table if not exists public.privacy_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_type text not null check (request_type in ('access', 'correction', 'deletion', 'blocking', 'objection', 'portability', 'withdraw_consent')),
  details text,
  status text not null default 'pending' check (status in ('pending', 'in_review', 'resolved', 'rejected', 'cancelled')),
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  moderator_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists privacy_requests_user_created_idx on public.privacy_requests(user_id, created_at desc);
create index if not exists privacy_requests_status_created_idx on public.privacy_requests(status, created_at asc);

alter table public.privacy_requests enable row level security;

create policy "Users can read their privacy requests"
  on public.privacy_requests
  for select
  using (auth.uid() = user_id);

create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reason text,
  status text not null default 'pending' check (status in ('pending', 'in_review', 'resolved', 'rejected', 'cancelled')),
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  moderator_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists account_deletion_requests_one_open_per_user_idx
  on public.account_deletion_requests(user_id)
  where status in ('pending', 'in_review');

create index if not exists account_deletion_requests_status_created_idx on public.account_deletion_requests(status, created_at asc);

alter table public.account_deletion_requests enable row level security;

create policy "Users can read their account deletion requests"
  on public.account_deletion_requests
  for select
  using (auth.uid() = user_id);

create table if not exists public.user_policy_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  terms_version text not null,
  privacy_version text not null,
  accepted_at timestamptz not null default now(),
  accepted_via text not null,
  ip_address text,
  user_agent text
);

create index if not exists user_policy_acceptances_user_accepted_idx on public.user_policy_acceptances(user_id, accepted_at desc);

alter table public.user_policy_acceptances enable row level security;
