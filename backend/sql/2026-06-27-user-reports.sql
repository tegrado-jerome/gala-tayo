alter table public.user_reports
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists reported_user_id uuid,
  add column if not exists reporter_user_id uuid,
  add column if not exists reason text,
  add column if not exists details text,
  add column if not exists status text default 'pending',
  add column if not exists resolved_by uuid,
  add column if not exists resolved_at timestamptz,
  add column if not exists moderator_note text,
  add column if not exists created_at timestamptz default now();

update public.user_reports
set status = 'pending'
where status is null;

update public.user_reports
set reason = 'other'
where reason is null;

update public.user_reports
set created_at = now()
where created_at is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_reports_no_self_report'
  ) then
    alter table public.user_reports
      add constraint user_reports_no_self_report
      check (reported_user_id <> reporter_user_id) not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_reports_reason_check'
  ) then
    alter table public.user_reports
      add constraint user_reports_reason_check
      check (reason in ('fake_account', 'harassment', 'inappropriate_profile', 'spam', 'impersonation', 'other')) not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_reports_status_check'
  ) then
    alter table public.user_reports
      add constraint user_reports_status_check
      check (status in ('pending', 'dismissed', 'action_taken')) not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_reports_pkey'
  ) then
    alter table public.user_reports
      add constraint user_reports_pkey primary key (id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_reports_reported_user_id_fkey'
  ) then
    alter table public.user_reports
      add constraint user_reports_reported_user_id_fkey
      foreign key (reported_user_id) references public.users (id) on delete cascade not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_reports_reporter_user_id_fkey'
  ) then
    alter table public.user_reports
      add constraint user_reports_reporter_user_id_fkey
      foreign key (reporter_user_id) references public.users (id) on delete cascade not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_reports_resolved_by_fkey'
  ) then
    alter table public.user_reports
      add constraint user_reports_resolved_by_fkey
      foreign key (resolved_by) references public.users (id) on delete set null not valid;
  end if;
end $$;

do $$
declare
  has_null_id boolean;
  has_null_reported_user_id boolean;
  has_null_reporter_user_id boolean;
  has_null_reason boolean;
  has_null_status boolean;
  has_null_created_at boolean;
begin
  select exists (select 1 from public.user_reports where id is null) into has_null_id;
  select exists (select 1 from public.user_reports where reported_user_id is null) into has_null_reported_user_id;
  select exists (select 1 from public.user_reports where reporter_user_id is null) into has_null_reporter_user_id;
  select exists (select 1 from public.user_reports where reason is null) into has_null_reason;
  select exists (select 1 from public.user_reports where status is null) into has_null_status;
  select exists (select 1 from public.user_reports where created_at is null) into has_null_created_at;

  if not has_null_id then
    alter table public.user_reports alter column id set not null;
  end if;

  if not has_null_reported_user_id then
    alter table public.user_reports alter column reported_user_id set not null;
  end if;

  if not has_null_reporter_user_id then
    alter table public.user_reports alter column reporter_user_id set not null;
  end if;

  if not has_null_reason then
    alter table public.user_reports alter column reason set not null;
  end if;

  if not has_null_status then
    alter table public.user_reports alter column status set not null;
  end if;

  if not has_null_created_at then
    alter table public.user_reports alter column created_at set not null;
  end if;
end $$;

create index if not exists user_reports_reported_user_id_idx on public.user_reports (reported_user_id);
create index if not exists user_reports_reporter_user_id_idx on public.user_reports (reporter_user_id);
create index if not exists user_reports_status_idx on public.user_reports (status);
create index if not exists user_reports_created_at_idx on public.user_reports (created_at desc);
create unique index if not exists user_reports_unique_pending
on public.user_reports (reported_user_id, reporter_user_id)
where status = 'pending';

alter table public.user_reports enable row level security;

drop policy if exists "Users can submit user reports" on public.user_reports;
create policy "Users can submit user reports"
on public.user_reports
for insert
to authenticated
with check (
  reporter_user_id = auth.uid()
  and reported_user_id <> auth.uid()
  and status = 'pending'
  and resolved_by is null
  and resolved_at is null
  and moderator_note is null
);

drop policy if exists "Users can view their own submitted user reports" on public.user_reports;
create policy "Users can view their own submitted user reports"
on public.user_reports
for select
to authenticated
using (reporter_user_id = auth.uid());

drop policy if exists "Admins can view all user reports" on public.user_reports;
create policy "Admins can view all user reports"
on public.user_reports
for select
to authenticated
using (public.is_admin(auth.uid()));

drop policy if exists "Admins can update user reports" on public.user_reports;
create policy "Admins can update user reports"
on public.user_reports
for update
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));
