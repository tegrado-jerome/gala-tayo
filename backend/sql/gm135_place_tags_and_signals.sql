create table if not exists public.tags (
  id text primary key,
  name text not null,
  description text,
  tag_group text not null default 'general',
  search_terms text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tags_id_format_check check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint tags_tag_group_check check (
    tag_group in (
      'environment',
      'vibe',
      'amenity',
      'companion',
      'budget',
      'activity',
      'accessibility',
      'general'
    )
  )
);

create table if not exists public.place_tags (
  place_id uuid not null references public.places (id) on delete cascade,
  tag_id text not null references public.tags (id) on delete cascade,
  strength smallint not null default 3,
  source text not null default 'manual',
  notes text,
  created_at timestamptz not null default now(),
  primary key (place_id, tag_id),
  constraint place_tags_strength_check check (strength between 1 and 5),
  constraint place_tags_source_check check (source in ('manual', 'seed', 'import', 'system'))
);

create index if not exists tags_tag_group_idx
  on public.tags (tag_group);

create index if not exists tags_search_terms_gin_idx
  on public.tags using gin (search_terms);

create index if not exists place_tags_tag_id_idx
  on public.place_tags (tag_id);

create index if not exists place_tags_place_id_idx
  on public.place_tags (place_id);

create index if not exists place_tags_strength_desc_idx
  on public.place_tags (strength desc);

alter table public.tags enable row level security;
alter table public.place_tags enable row level security;

drop policy if exists "Public can read tags" on public.tags;
create policy "Public can read tags"
  on public.tags
  for select
  using (true);

drop policy if exists "Public can read place tags" on public.place_tags;
create policy "Public can read place tags"
  on public.place_tags
  for select
  using (true);

insert into public.tags (id, name, description, tag_group, search_terms)
values
  ('indoor', 'Indoor', 'Mostly indoors or enclosed.', 'environment', array['indoor', 'inside', 'covered', 'enclosed']),
  ('outdoor', 'Outdoor', 'Mostly outdoors or open-air.', 'environment', array['outdoor', 'outside', 'open air', 'fresh air', 'al fresco']),
  ('airconditioned', 'Airconditioned', 'Has airconditioned indoor areas.', 'environment', array['aircon', 'air conditioned', 'airconditioned', 'malamig']),
  ('rain-friendly', 'Rain-friendly', 'Good option during rainy weather.', 'environment', array['rain', 'rainy', 'ulan', 'tag ulan', 'covered']),
  ('walkable', 'Walkable', 'Good for walking, strolling, or exploring on foot.', 'environment', array['walk', 'walking', 'walkable', 'stroll', 'lakad', 'pasyal']),

  ('quiet', 'Quiet', 'Generally quieter or suitable for low-noise visits.', 'vibe', array['quiet', 'silent', 'peaceful', 'tahimik', 'calm']),
  ('relaxing', 'Relaxing', 'Good for unwinding or a slower-paced visit.', 'vibe', array['relax', 'relaxing', 'unwind', 'chill', 'tambay', 'pahinga']),
  ('lively', 'Lively', 'Energetic or active atmosphere.', 'vibe', array['lively', 'alive', 'busy', 'energetic', 'masaya']),
  ('crowded', 'Crowded', 'Can be busy or crowded.', 'vibe', array['crowded', 'busy', 'maraming tao', 'matao']),
  ('photo-friendly', 'Photo-friendly', 'Good for photos, sightseeing, or scenic stops.', 'vibe', array['photo', 'picture', 'instagram', 'aesthetic', 'picturan', 'photoshoot']),
  ('night-friendly', 'Night-friendly', 'Useful for evening or night plans.', 'vibe', array['night', 'gabi', 'evening', 'late night', 'pang gabi']),

  ('wifi', 'Wi-Fi', 'Likely to offer Wi-Fi or be useful for connected work or study.', 'amenity', array['wifi', 'wi-fi', 'internet', 'online']),
  ('food-options', 'Food options', 'Has nearby or onsite food choices.', 'amenity', array['food', 'kain', 'restaurant', 'dining', 'food court']),
  ('shopping-area', 'Shopping area', 'Good for shopping or retail browsing.', 'amenity', array['shopping', 'shop', 'mall', 'retail', 'bili']),
  ('parking-friendly', 'Parking-friendly', 'Likely to have parking or nearby parking options.', 'amenity', array['parking', 'park', 'car park', 'may parking']),
  ('restroom-access', 'Restroom access', 'Likely to have accessible restroom options.', 'amenity', array['restroom', 'toilet', 'cr', 'bathroom']),

  ('date-friendly', 'Date-friendly', 'Good for dates or couple-friendly plans.', 'companion', array['date', 'jowa', 'couple', 'romantic', 'gf', 'bf', 'anniversary', 'monthsary']),
  ('family-friendly', 'Family-friendly', 'Good for families or mixed-age groups.', 'companion', array['family', 'parents', 'kids', 'children', 'lolo', 'lola', 'pang pamilya']),
  ('barkada-friendly', 'Barkada-friendly', 'Good for friend groups and barkada plans.', 'companion', array['barkada', 'tropa', 'friends', 'group', 'bonding', 'squad']),
  ('solo-friendly', 'Solo-friendly', 'Comfortable for solo visits.', 'companion', array['solo', 'alone', 'me time', 'isa lang']),
  ('kid-friendly', 'Kid-friendly', 'Suitable for kids.', 'companion', array['kid', 'kids', 'children', 'child', 'baby', 'safe for kids']),
  ('pet-friendly', 'Pet-friendly', 'Allows or suits pets and fur parents.', 'companion', array['pet', 'pets', 'dog', 'cat', 'fur baby', 'furbaby', 'pet friendly']),

  ('budget-friendly', 'Budget-friendly', 'Likely to support lower-cost visits.', 'budget', array['budget', 'mura', 'affordable', 'tipid', 'cheap']),
  ('premium', 'Premium', 'More upscale or premium-feeling place.', 'budget', array['premium', 'upscale', 'fancy', 'luxury', 'mahal']),
  ('free-entry', 'Free entry', 'Can be visited without an entrance fee.', 'budget', array['free', 'free entry', 'walang entrance', 'libre']),

  ('study-friendly', 'Study-friendly', 'Good for studying, reading, or focused work.', 'activity', array['study', 'aral', 'review', 'thesis', 'laptop', 'focus']),
  ('tourist-friendly', 'Tourist-friendly', 'Good for visitors, sightseeing, or first-time trips.', 'activity', array['tourist', 'pasyal', 'gala', 'landmark', 'sightseeing']),
  ('historical', 'Historical', 'Has historic, heritage, or cultural significance.', 'activity', array['history', 'historical', 'heritage', 'old manila', 'spanish era']),
  ('educational', 'Educational', 'Good for learning, exhibits, or educational visits.', 'activity', array['educational', 'learn', 'learning', 'museum', 'field trip']),

  ('commuter-friendly', 'Commuter-friendly', 'Reasonably reachable by public transport.', 'accessibility', array['commute', 'commuter', 'mrt', 'lrt', 'bus', 'jeep', 'sakayan']),
  ('commute-friendly', 'Commute-friendly', 'Easy or practical to reach by public transport.', 'accessibility', array['commute friendly', 'commute', 'mrt', 'lrt', 'bus', 'jeep', 'sakayan']),
  ('terminal-nearby', 'Terminal nearby', 'Near a terminal, station, or common commute point.', 'accessibility', array['terminal nearby', 'terminal', 'station', 'bus station', 'transport hub']),
  ('senior-friendly', 'Senior-friendly', 'Potentially suitable for seniors or slower-paced visits.', 'accessibility', array['senior', 'seniors', 'lolo', 'lola', 'elderly']),

  ('dessert', 'Dessert', 'Desserts, pastries, ice cream, cakes, and sweet treats.', 'activity', array['dessert', 'cake', 'ice cream', 'pastry', 'sweet', 'matamis']),
  ('bakery', 'Bakery', 'Bakeries, pastry shops, breads, and baked goods.', 'activity', array['bakery', 'bread', 'pastry', 'bakeshop', 'panaderya']),
  ('sweets', 'Sweets', 'Sweet cravings and treat-focused stops.', 'activity', array['sweets', 'sweet', 'candy', 'chocolate', 'cravings']),
  ('market', 'Market', 'Markets, bazaars, tiangge, and local shopping areas.', 'activity', array['market', 'palengke', 'tiangge', 'bazaar', 'local market']),
  ('local-food', 'Local food', 'Local food options, street food, or Filipino casual eats.', 'activity', array['local food', 'street food', 'filipino food', 'lutong bahay', 'local eats']),
  ('religious', 'Religious', 'Religious, prayer, or spiritual places.', 'activity', array['religious', 'church', 'chapel', 'cathedral', 'mosque', 'temple', 'pray']),
  ('peaceful', 'Peaceful', 'Peaceful or reflective atmosphere.', 'vibe', array['peaceful', 'quiet', 'calm', 'reflective', 'tahimik']),
  ('hotel-nearby', 'Hotel nearby', 'Near hotels or useful for visitors staying nearby.', 'amenity', array['hotel nearby', 'hotel', 'accommodation', 'lodging']),
  ('staycation', 'Staycation', 'Useful for staycation-style plans or overnight nearby trips.', 'activity', array['staycation', 'overnight', 'hotel stay', 'weekend stay']),
  ('sports-friendly', 'Sports-friendly', 'Supports sports, fitness, or active plans.', 'activity', array['sports', 'fitness', 'court', 'workout', 'active']),
  ('gym', 'Gym', 'Gym or workout-oriented place.', 'activity', array['gym', 'fitness center', 'workout', 'training']),
  ('active', 'Active', 'Good for active, movement-heavy plans.', 'activity', array['active', 'activity', 'workout', 'sports', 'papawis']),
  ('clinic-nearby', 'Clinic nearby', 'Clinic or healthcare option nearby for future essentials use.', 'general', array['clinic', 'doctor', 'healthcare', 'checkup']),
  ('dental-care', 'Dental care', 'Dental care option for future essentials use.', 'general', array['dental', 'dentist', 'oral care', 'teeth']),
  ('pharmacy-nearby', 'Pharmacy nearby', 'Pharmacy or medicine store nearby for future essentials use.', 'general', array['pharmacy', 'drugstore', 'medicine', 'gamot', 'botika']),
  ('hospital-nearby', 'Hospital nearby', 'Hospital or major medical facility nearby for future essentials use.', 'general', array['hospital', 'medical center', 'emergency', 'er']),
  ('services-nearby', 'Services nearby', 'Practical services nearby for future essentials use.', 'general', array['services', 'repair', 'laundry', 'printing', 'errands'])
on conflict (id) do update
set
  name = excluded.name,
  description = excluded.description,
  tag_group = excluded.tag_group,
  search_terms = excluded.search_terms,
  updated_at = now();

insert into public.place_tags (place_id, tag_id, strength, source)
select p.id, tag_links.tag_id, tag_links.strength, 'seed'
from (
  values
    ('bonifacio-high-street', 'outdoor', 5),
    ('bonifacio-high-street', 'walkable', 5),
    ('bonifacio-high-street', 'date-friendly', 5),
    ('bonifacio-high-street', 'barkada-friendly', 4),
    ('bonifacio-high-street', 'family-friendly', 4),
    ('bonifacio-high-street', 'photo-friendly', 4),
    ('bonifacio-high-street', 'food-options', 4),
    ('bonifacio-high-street', 'shopping-area', 5),
    ('bonifacio-high-street', 'relaxing', 3),

    ('uptown-mall', 'indoor', 5),
    ('uptown-mall', 'airconditioned', 5),
    ('uptown-mall', 'rain-friendly', 5),
    ('uptown-mall', 'date-friendly', 4),
    ('uptown-mall', 'barkada-friendly', 4),
    ('uptown-mall', 'family-friendly', 4),
    ('uptown-mall', 'food-options', 4),
    ('uptown-mall', 'shopping-area', 5),
    ('uptown-mall', 'photo-friendly', 3),

    ('market-market', 'indoor', 5),
    ('market-market', 'airconditioned', 5),
    ('market-market', 'rain-friendly', 5),
    ('market-market', 'budget-friendly', 4),
    ('market-market', 'family-friendly', 5),
    ('market-market', 'barkada-friendly', 4),
    ('market-market', 'food-options', 5),
    ('market-market', 'shopping-area', 5),
    ('market-market', 'commuter-friendly', 4),

    ('the-mind-museum', 'indoor', 5),
    ('the-mind-museum', 'airconditioned', 5),
    ('the-mind-museum', 'rain-friendly', 5),
    ('the-mind-museum', 'educational', 5),
    ('the-mind-museum', 'family-friendly', 5),
    ('the-mind-museum', 'kid-friendly', 5),
    ('the-mind-museum', 'tourist-friendly', 4),
    ('the-mind-museum', 'quiet', 3),

    ('intramuros', 'outdoor', 5),
    ('intramuros', 'walkable', 5),
    ('intramuros', 'historical', 5),
    ('intramuros', 'tourist-friendly', 5),
    ('intramuros', 'photo-friendly', 5),
    ('intramuros', 'family-friendly', 4),
    ('intramuros', 'budget-friendly', 4),
    ('intramuros', 'educational', 4)
) as tag_links(slug, tag_id, strength)
join public.places p
  on p.slug = tag_links.slug
join public.tags t
  on t.id = tag_links.tag_id
on conflict (place_id, tag_id) do update
set
  strength = excluded.strength,
  source = excluded.source;

-- Show all seeded tags:
-- select id, name, tag_group, search_terms
-- from public.tags
-- order by tag_group, id;

-- Show place tag links:
-- select
--   p.slug,
--   p.name,
--   t.id as tag_id,
--   t.name as tag_name,
--   t.tag_group,
--   pt.strength,
--   pt.source
-- from public.place_tags pt
-- join public.places p on p.id = pt.place_id
-- join public.tags t on t.id = pt.tag_id
-- order by p.slug, t.tag_group, t.id;

-- Show tag count per seeded place:
-- select
--   p.slug,
--   p.name,
--   count(pt.tag_id) as tag_count
-- from public.places p
-- left join public.place_tags pt on pt.place_id = p.id
-- where p.slug in (
--   'bonifacio-high-street',
--   'uptown-mall',
--   'market-market',
--   'the-mind-museum',
--   'intramuros'
-- )
-- group by p.slug, p.name
-- order by p.slug;

-- Check duplicate safety:
-- select place_id, tag_id, count(*)
-- from public.place_tags
-- group by place_id, tag_id
-- having count(*) > 1;
