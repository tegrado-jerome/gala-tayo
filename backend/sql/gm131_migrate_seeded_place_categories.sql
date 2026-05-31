insert into public.place_categories (place_id, category_id)
select p.id, category_links.category_id
from (
  values
    ('bonifacio-high-street', 'mall'),
    ('bonifacio-high-street', 'shopping'),
    ('bonifacio-high-street', 'date-spot'),
    ('bonifacio-high-street', 'barkada'),
    ('bonifacio-high-street', 'family'),
    ('bonifacio-high-street', 'chill'),

    ('uptown-mall', 'mall'),
    ('uptown-mall', 'shopping'),
    ('uptown-mall', 'date-spot'),
    ('uptown-mall', 'barkada'),
    ('uptown-mall', 'family'),

    ('market-market', 'mall'),
    ('market-market', 'shopping'),
    ('market-market', 'family'),
    ('market-market', 'barkada'),
    ('market-market', 'kainan'),

    ('the-mind-museum', 'museum'),
    ('the-mind-museum', 'family'),
    ('the-mind-museum', 'tourist-spot'),
    ('the-mind-museum', 'study-spot'),

    ('intramuros', 'heritage'),
    ('intramuros', 'tourist-spot'),
    ('intramuros', 'family'),
    ('intramuros', 'chill')
) as category_links(slug, category_id)
join public.places p
  on p.slug = category_links.slug
join public.categories c
  on c.id = category_links.category_id
on conflict (place_id, category_id) do nothing;

-- Verify migrated links:
-- select
--   p.slug,
--   p.name,
--   pc.category_id
-- from public.place_categories pc
-- join public.places p on p.id = pc.place_id
-- order by p.slug, pc.category_id;

-- Verify count per place:
-- select
--   p.slug,
--   p.name,
--   count(pc.category_id) as category_count
-- from public.places p
-- left join public.place_categories pc on pc.place_id = p.id
-- group by p.slug, p.name
-- order by p.slug;
