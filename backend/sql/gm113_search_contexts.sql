create table if not exists public.search_contexts (
  id uuid primary key default gen_random_uuid(),
  search_id text unique not null,
  query text not null default '',
  category text,
  area text,
  budget text,
  language text not null default 'taglish',
  user_type text not null,
  user_id uuid null references auth.users(id) on delete set null,
  cache_key text,
  created_at timestamptz not null default now()
);

create index if not exists search_contexts_search_id_idx
  on public.search_contexts (search_id);

create index if not exists search_contexts_created_at_idx
  on public.search_contexts (created_at desc);
