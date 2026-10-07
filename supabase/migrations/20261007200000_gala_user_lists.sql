-- Gala lists sync for signed-in users: one row per account holding the app's lists document
-- (frontend utils/galaListsCore.ts GalaListsState), so a list made on the phone opens on the laptop.
-- Additive only. The API (service role) reads and writes it; a signed-in user may read only their own
-- row, and the public roles can't write (same as every table since 20261006120000).
-- Rows go with the account: the foreign key cascades when the auth user is deleted.

create table if not exists public.gala_user_lists (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{"version": 1, "lists": [], "following": []}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint gala_user_lists_state_size check (pg_column_size(state) <= 524288)
);

alter table public.gala_user_lists enable row level security;

drop policy if exists "gala_user_lists_select_own" on public.gala_user_lists;
create policy "gala_user_lists_select_own" on public.gala_user_lists
  for select to authenticated
  using ((select auth.uid()) = user_id);

revoke insert, update, delete, truncate, references, trigger on public.gala_user_lists from anon, authenticated;
revoke select on public.gala_user_lists from anon;
