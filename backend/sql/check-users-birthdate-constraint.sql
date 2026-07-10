-- Inspect the exact database rule that is rejecting onboarding birthdates.
-- Run this in the Supabase SQL editor.

select
  c.conname as constraint_name,
  c.conrelid::regclass as table_name,
  pg_get_constraintdef(c.oid, true) as definition
from pg_constraint c
where c.conname = 'users_birthdate_reasonable_check';

-- If the constraint name changes in another environment, list every CHECK constraint
-- on the users table and compare the definitions.
select
  c.conname as constraint_name,
  c.conrelid::regclass as table_name,
  pg_get_constraintdef(c.oid, true) as definition
from pg_constraint c
join pg_class t on t.oid = c.conrelid
join pg_namespace n on n.oid = t.relnamespace
where n.nspname = 'public'
  and t.relname = 'users'
  and c.contype = 'c'
order by c.conname;
