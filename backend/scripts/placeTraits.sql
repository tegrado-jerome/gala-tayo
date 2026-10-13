-- Active places for scripts/generatePlaceTraits.ts (read-only).
select json_agg(json_build_object(
  'slug', slug,
  'commute_access', commute_access,
  'good_for', good_for,
  'safety', travel_info -> 'safety' ->> 'text'
) order by slug) as places
from places
where status = 'active';
