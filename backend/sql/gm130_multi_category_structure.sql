create table if not exists public.categories (
  id text primary key,
  name text not null,
  description text not null default '',
  search_terms text[] not null default '{}',
  created_at timestamp without time zone not null default now(),
  updated_at timestamp without time zone not null default now(),
  constraint categories_id_format_check check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

create table if not exists public.place_categories (
  place_id uuid not null,
  category_id text not null,
  created_at timestamp without time zone not null default now(),
  primary key (place_id, category_id),
  constraint place_categories_place_id_fkey
    foreign key (place_id)
    references public.places (id)
    on delete cascade,
  constraint place_categories_category_id_fkey
    foreign key (category_id)
    references public.categories (id)
    on update cascade
    on delete restrict
);

create index if not exists place_categories_category_id_idx
  on public.place_categories (category_id);

insert into public.categories (id, name, description, search_terms)
values
  (
    'kainan',
    'Kainan',
    'Restaurants, carinderia, fast food, casual dining, and food trip spots.',
    array['restaurant', 'food', 'kainan', 'casual dining', 'filipino food']
  ),
  (
    'cafe',
    'Cafe',
    'Coffee shops, cafes, tea spots, and chill tambayan places.',
    array['cafe', 'coffee', 'tea', 'coffee shop', 'tambayan']
  ),
  (
    'mall',
    'Mall',
    'Shopping malls, lifestyle centers, and all-in-one hangout spots.',
    array['mall', 'shopping mall', 'lifestyle center', 'department store']
  ),
  (
    'parke',
    'Parke',
    'Parks, open spaces, gardens, and outdoor tambayan areas.',
    array['park', 'garden', 'outdoor', 'open space', 'playground']
  ),
  (
    'nightlife',
    'Nightlife',
    'Bars, clubs, live music spots, and late-night hangout places.',
    array['bar', 'club', 'nightlife', 'live music', 'late night']
  ),
  (
    'heritage',
    'Heritage',
    'Historic districts, heritage sites, and cultural landmarks.',
    array['heritage', 'historic', 'cultural site', 'old town', 'landmark']
  ),
  (
    'museum',
    'Museum',
    'Museums, galleries, exhibits, and educational cultural spaces.',
    array['museum', 'gallery', 'exhibit', 'art', 'history']
  ),
  (
    'tourist-spot',
    'Tourist',
    'Popular attractions, landmarks, and must-visit destination spots.',
    array['tourist spot', 'attraction', 'landmark', 'destination', 'sightseeing']
  ),
  (
    'date-spot',
    'Date',
    'Romantic, cozy, and couple-friendly places for dates.',
    array['date spot', 'romantic', 'couple', 'cozy', 'anniversary']
  ),
  (
    'barkada',
    'Barkada',
    'Group-friendly places for friends, hangouts, and shared activities.',
    array['barkada', 'friends', 'group hangout', 'group activity', 'tambay']
  ),
  (
    'family',
    'Family',
    'Family-friendly places suitable for kids, parents, and all ages.',
    array['family', 'kids', 'child friendly', 'all ages', 'family outing']
  ),
  (
    'study-spot',
    'Study',
    'Quiet cafes, libraries, and work-friendly places for studying.',
    array['study spot', 'library', 'quiet cafe', 'student friendly', 'wifi']
  ),
  (
    'coworking',
    'Coworking',
    'Coworking spaces and work hubs for productivity and meetings.',
    array['coworking', 'workspace', 'remote work', 'meeting room', 'office']
  ),
  (
    'arcade-games',
    'Arcade',
    'Arcades, gaming lounges, and fun activity spots.',
    array['arcade', 'games', 'gaming', 'bowling', 'billiards']
  ),
  (
    'cinema',
    'Cinema',
    'Movie theaters and film-watching venues.',
    array['cinema', 'movie theater', 'films', 'imax', 'screening']
  ),
  (
    'shopping',
    'Shopping',
    'Retail strips, boutiques, outlet areas, and shopping destinations.',
    array['shopping', 'boutique', 'retail', 'outlet', 'store']
  ),
  (
    'wellness',
    'Wellness',
    'Spas, massage places, self-care spots, and wellness centers.',
    array['wellness', 'spa', 'massage', 'self care', 'relaxation']
  ),
  (
    'chill',
    'Chill',
    'Relaxed tambayan spots for unwinding, views, and low-key hangouts.',
    array['chill', 'tambayan', 'relax', 'view', 'low key']
  )
on conflict (id) do update
set
  name = excluded.name,
  description = excluded.description,
  search_terms = excluded.search_terms,
  updated_at = now();
