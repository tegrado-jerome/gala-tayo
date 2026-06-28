create table if not exists public.place_submissions (
  id uuid primary key default gen_random_uuid(),
  submitted_by uuid not null references public.users (id) on delete cascade,
  approved_place_id uuid references public.places (id) on delete set null,
  name text not null,
  category text not null,
  address text not null,
  city text not null,
  area text,
  latitude numeric(10, 7) not null,
  longitude numeric(10, 7) not null,
  description text not null,
  best_time_to_visit text,
  visit_duration text,
  budget_min integer,
  good_for jsonb not null default '[]'::jsonb,
  not_ideal_for jsonb not null default '[]'::jsonb,
  crowd_level text,
  indoor_outdoor text,
  weather_fit text,
  parking_info text,
  commute_access text,
  nearby_context text,
  website_url text,
  google_maps_url text,
  status text not null default 'pending',
  rejection_reason text,
  admin_note text,
  reviewed_by uuid references public.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint place_submissions_status_check check (status in ('pending', 'approved', 'rejected')),
  constraint place_submissions_budget_min_check check (budget_min is null or budget_min >= 0),
  constraint place_submissions_latitude_check check (latitude >= -90 and latitude <= 90),
  constraint place_submissions_longitude_check check (longitude >= -180 and longitude <= 180)
);

create table if not exists public.place_submission_images (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.place_submissions (id) on delete cascade,
  submitted_by uuid not null references public.users (id) on delete cascade,
  image_url text,
  storage_key text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint place_submission_images_sort_order_check check (sort_order >= 0 and sort_order <= 2)
);

create index if not exists place_submissions_submitted_by_idx on public.place_submissions (submitted_by);
create index if not exists place_submissions_status_idx on public.place_submissions (status, created_at desc);
create index if not exists place_submissions_approved_place_id_idx on public.place_submissions (approved_place_id);
create index if not exists place_submission_images_submission_id_idx on public.place_submission_images (submission_id, sort_order);

alter table public.place_submissions enable row level security;
alter table public.place_submission_images enable row level security;

drop policy if exists "place_submissions_insert_own" on public.place_submissions;
create policy "place_submissions_insert_own"
on public.place_submissions
for insert
to authenticated
with check (submitted_by = auth.uid());

drop policy if exists "place_submissions_select_own" on public.place_submissions;
create policy "place_submissions_select_own"
on public.place_submissions
for select
to authenticated
using (submitted_by = auth.uid());

drop policy if exists "place_submissions_admin_select_all" on public.place_submissions;
create policy "place_submissions_admin_select_all"
on public.place_submissions
for select
to authenticated
using (public.is_admin(auth.uid()));

drop policy if exists "place_submissions_admin_update" on public.place_submissions;
create policy "place_submissions_admin_update"
on public.place_submissions
for update
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "place_submission_images_insert_own" on public.place_submission_images;
create policy "place_submission_images_insert_own"
on public.place_submission_images
for insert
to authenticated
with check (submitted_by = auth.uid());

drop policy if exists "place_submission_images_select_own" on public.place_submission_images;
create policy "place_submission_images_select_own"
on public.place_submission_images
for select
to authenticated
using (
  submitted_by = auth.uid()
  or exists (
    select 1
    from public.place_submissions
    where place_submissions.id = place_submission_images.submission_id
      and place_submissions.submitted_by = auth.uid()
  )
);

drop policy if exists "place_submission_images_admin_select_all" on public.place_submission_images;
create policy "place_submission_images_admin_select_all"
on public.place_submission_images
for select
to authenticated
using (public.is_admin(auth.uid()));
