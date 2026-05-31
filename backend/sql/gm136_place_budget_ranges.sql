alter table public.places
  add column if not exists budget_min integer,
  add column if not exists budget_max integer,
  add column if not exists budget_currency text not null default 'PHP',
  add column if not exists budget_label text,
  add column if not exists is_free boolean not null default false;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'places_budget_min_nonnegative_check'
      and conrelid = 'public.places'::regclass
  ) then
    alter table public.places
      add constraint places_budget_min_nonnegative_check
      check (budget_min is null or budget_min >= 0);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'places_budget_max_nonnegative_check'
      and conrelid = 'public.places'::regclass
  ) then
    alter table public.places
      add constraint places_budget_max_nonnegative_check
      check (budget_max is null or budget_max >= 0);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'places_budget_range_order_check'
      and conrelid = 'public.places'::regclass
  ) then
    alter table public.places
      add constraint places_budget_range_order_check
      check (
        budget_min is null
        or budget_max is null
        or budget_max >= budget_min
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'places_budget_currency_not_empty_check'
      and conrelid = 'public.places'::regclass
  ) then
    alter table public.places
      add constraint places_budget_currency_not_empty_check
      check (trim(budget_currency) <> '');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'places_budget_label_check'
      and conrelid = 'public.places'::regclass
  ) then
    alter table public.places
      add constraint places_budget_label_check
      check (
        budget_label is null
        or budget_label in ('Free', 'Budget', 'Mid-range', 'Premium')
      );
  end if;
end $$;

update public.places
set
  budget_min = 300,
  budget_max = 1500,
  budget_currency = 'PHP',
  budget_label = 'Mid-range',
  is_free = false
where slug = 'bonifacio-high-street';

update public.places
set
  budget_min = 500,
  budget_max = 2000,
  budget_currency = 'PHP',
  budget_label = 'Mid-range',
  is_free = false
where slug = 'uptown-mall';

update public.places
set
  budget_min = 200,
  budget_max = 1000,
  budget_currency = 'PHP',
  budget_label = 'Budget',
  is_free = false
where slug = 'market-market';

update public.places
set
  budget_min = 750,
  budget_max = 1000,
  budget_currency = 'PHP',
  budget_label = 'Mid-range',
  is_free = false
where slug = 'the-mind-museum';

update public.places
set
  budget_min = 0,
  budget_max = 500,
  budget_currency = 'PHP',
  budget_label = 'Budget',
  is_free = true
where slug = 'intramuros';

-- Show budget values for seeded places:
-- select
--   slug,
--   name,
--   budget_min,
--   budget_max,
--   budget_currency,
--   budget_label,
--   is_free
-- from public.places
-- where slug in (
--   'bonifacio-high-street',
--   'uptown-mall',
--   'market-market',
--   'the-mind-museum',
--   'intramuros'
-- )
-- order by slug;

-- Check invalid budget ranges:
-- select slug, name, budget_min, budget_max
-- from public.places
-- where budget_min is not null
--   and budget_max is not null
--   and budget_max < budget_min;

-- Check empty currency:
-- select slug, name, budget_currency
-- from public.places
-- where budget_currency is null
--    or trim(budget_currency) = '';
