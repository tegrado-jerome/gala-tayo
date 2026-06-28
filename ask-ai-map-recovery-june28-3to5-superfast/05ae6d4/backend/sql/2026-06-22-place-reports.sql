alter table public.place_reports
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists place_id uuid,
  add column if not exists reported_by uuid,
  add column if not exists reported_image_id uuid,
  add column if not exists reason text,
  add column if not exists details text,
  add column if not exists status text default 'pending',
  add column if not exists moderator_note text,
  add column if not exists resolved_by uuid,
  add column if not exists resolved_at timestamptz,
  add column if not exists created_at timestamptz default now();

update public.place_reports
set status = 'pending'
where status is null;

update public.place_reports
set created_at = now()
where created_at is null;

update public.place_reports
set reason = 'other'
where reason is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'place_reports_reason_check'
  ) then
    alter table public.place_reports
      add constraint place_reports_reason_check
      check (reason in ('wrong_info', 'closed_or_moved', 'safety_issue', 'duplicate_place', 'photo_or_copyright', 'other')) not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'place_reports_status_check'
  ) then
    alter table public.place_reports
      add constraint place_reports_status_check
      check (status in ('pending', 'reviewing', 'resolved', 'dismissed')) not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'place_reports_pkey'
  ) then
    alter table public.place_reports
      add constraint place_reports_pkey primary key (id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'place_reports_place_id_fkey'
  ) then
    alter table public.place_reports
      add constraint place_reports_place_id_fkey
      foreign key (place_id) references public.places (id) on delete cascade not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'place_reports_reported_by_fkey'
  ) then
    alter table public.place_reports
      add constraint place_reports_reported_by_fkey
      foreign key (reported_by) references public.users (id) on delete cascade not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'place_reports_reported_image_id_fkey'
  ) then
    alter table public.place_reports
      add constraint place_reports_reported_image_id_fkey
      foreign key (reported_image_id) references public.place_images (id) on delete set null not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'place_reports_resolved_by_fkey'
  ) then
    alter table public.place_reports
      add constraint place_reports_resolved_by_fkey
      foreign key (resolved_by) references public.users (id) on delete set null not valid;
  end if;
end $$;

do $$
declare
  has_null_id boolean;
  has_null_place_id boolean;
  has_null_reported_by boolean;
  has_null_reason boolean;
  has_null_status boolean;
  has_null_created_at boolean;
begin
  select exists (select 1 from public.place_reports where id is null) into has_null_id;
  select exists (select 1 from public.place_reports where place_id is null) into has_null_place_id;
  select exists (select 1 from public.place_reports where reported_by is null) into has_null_reported_by;
  select exists (select 1 from public.place_reports where reason is null) into has_null_reason;
  select exists (select 1 from public.place_reports where status is null) into has_null_status;
  select exists (select 1 from public.place_reports where created_at is null) into has_null_created_at;

  if not has_null_id then
    alter table public.place_reports alter column id set not null;
  end if;

  if not has_null_place_id then
    alter table public.place_reports alter column place_id set not null;
  end if;

  if not has_null_reported_by then
    alter table public.place_reports alter column reported_by set not null;
  end if;

  if not has_null_reason then
    alter table public.place_reports alter column reason set not null;
  end if;

  if not has_null_status then
    alter table public.place_reports alter column status set not null;
  end if;

  if not has_null_created_at then
    alter table public.place_reports alter column created_at set not null;
  end if;
end $$;

create index if not exists place_reports_place_id_idx on public.place_reports (place_id);
create index if not exists place_reports_reported_by_idx on public.place_reports (reported_by);
create index if not exists place_reports_reported_image_id_idx on public.place_reports (reported_image_id);
create index if not exists place_reports_status_idx on public.place_reports (status);
create index if not exists place_reports_created_at_idx on public.place_reports (created_at desc);

alter table public.place_reports enable row level security;

drop policy if exists "place_reports_insert_own" on public.place_reports;
create policy "place_reports_insert_own"
on public.place_reports
for insert
to authenticated
with check (reported_by = auth.uid());

drop policy if exists "place_reports_select_own" on public.place_reports;
create policy "place_reports_select_own"
on public.place_reports
for select
to authenticated
using (reported_by = auth.uid());

drop policy if exists "place_reports_admin_select_all" on public.place_reports;
create policy "place_reports_admin_select_all"
on public.place_reports
for select
to authenticated
using (public.is_admin(auth.uid()));

drop policy if exists "place_reports_admin_update" on public.place_reports;
create policy "place_reports_admin_update"
on public.place_reports
for update
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "place_reports_admin_delete" on public.place_reports;
create policy "place_reports_admin_delete"
on public.place_reports
for delete
to authenticated
using (public.is_admin(auth.uid()));
