alter table public.places
  add column if not exists is_known_place boolean not null default false,
  add column if not exists popularity_score integer not null default 0,
  add column if not exists ranking_priority integer not null default 0,
  add column if not exists quality_score integer not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'places_popularity_score_range_check'
      and conrelid = 'public.places'::regclass
  ) then
    alter table public.places
      add constraint places_popularity_score_range_check
      check (popularity_score between 0 and 100);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'places_ranking_priority_range_check'
      and conrelid = 'public.places'::regclass
  ) then
    alter table public.places
      add constraint places_ranking_priority_range_check
      check (ranking_priority between 0 and 100);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'places_quality_score_range_check'
      and conrelid = 'public.places'::regclass
  ) then
    alter table public.places
      add constraint places_quality_score_range_check
      check (quality_score between 0 and 100);
  end if;
end $$;

update public.places
set
  is_known_place = true,
  popularity_score = 90,
  ranking_priority = 80,
  quality_score = 85
where slug = 'bonifacio-high-street';

update public.places
set
  is_known_place = true,
  popularity_score = 80,
  ranking_priority = 70,
  quality_score = 80
where slug = 'uptown-mall';

update public.places
set
  is_known_place = true,
  popularity_score = 75,
  ranking_priority = 65,
  quality_score = 75
where slug = 'market-market';

update public.places
set
  is_known_place = true,
  popularity_score = 75,
  ranking_priority = 75,
  quality_score = 85
where slug = 'the-mind-museum';

update public.places
set
  is_known_place = true,
  popularity_score = 95,
  ranking_priority = 90,
  quality_score = 90
where slug = 'intramuros';

-- Show ranking signals for seeded places:
-- select
--   slug,
--   name,
--   is_known_place,
--   popularity_score,
--   ranking_priority,
--   quality_score
-- from public.places
-- where slug in (
--   'bonifacio-high-street',
--   'uptown-mall',
--   'market-market',
--   'the-mind-museum',
--   'intramuros'
-- )
-- order by slug;

-- Check invalid score values:
-- select
--   slug,
--   name,
--   popularity_score,
--   ranking_priority,
--   quality_score
-- from public.places
-- where popularity_score < 0
--    or popularity_score > 100
--    or ranking_priority < 0
--    or ranking_priority > 100
--    or quality_score < 0
--    or quality_score > 100;

-- Check null ranking signal values:
-- select
--   slug,
--   name,
--   is_known_place,
--   popularity_score,
--   ranking_priority,
--   quality_score
-- from public.places
-- where is_known_place is null
--    or popularity_score is null
--    or ranking_priority is null
--    or quality_score is null;
