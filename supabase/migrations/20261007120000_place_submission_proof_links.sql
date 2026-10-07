-- Proof links on place submissions: 1-3 public posts or articles showing people go to the place on purpose.
--
-- Run by the owner. The API works before and after this migration: until the column exists it keeps the links
-- as "Proof link: <url>" lines in admin_note (API-only column, stripped from what users see). The backfill
-- below copies those lines into the new column; the API ignores leftover lines once the column has links.
-- No grant or RLS changes: anon and authenticated stay read-only (20261006120000_security_lock_public_writes).

alter table public.place_submissions
  add column if not exists proof_links jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'place_submissions_proof_links_shape'
  ) then
    alter table public.place_submissions
      add constraint place_submissions_proof_links_shape
      check (jsonb_typeof(proof_links) = 'array' and jsonb_array_length(proof_links) <= 3);
  end if;
end $$;

update public.place_submissions as s
set proof_links = backfill.links
from (
  select id, jsonb_agg(substr(line, length('Proof link: ') + 1) order by ord) as links
  from public.place_submissions,
    regexp_split_to_table(admin_note, E'\n') with ordinality as l(line, ord)
  where admin_note like '%Proof link: https://%'
    and line like 'Proof link: https://%'
  group by id
) as backfill
where s.id = backfill.id
  and s.proof_links = '[]'::jsonb
  and jsonb_array_length(backfill.links) <= 3;
