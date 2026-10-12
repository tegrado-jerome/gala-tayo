-- Weekly opening hours per place, so a page can say "Open now · until 5 PM" before people go.
-- Shape: {"mon":[["08:00","17:00"]], ..., "sun":[], "note":"...", "source":"<url>", "checked":"2026-10"}
-- A missing day key means unknown, an empty list means closed that day, and a close time at or
-- before the open time runs past midnight. Open-access spots (beaches, viewpoints) use {"always":true}.
-- Null means nobody has checked yet; the app shows nothing then. Additive only: no other change.
alter table public.places add column if not exists opening_hours jsonb;

comment on column public.places.opening_hours is
  'Weekly hours in Manila time: {"mon":[["08:00","17:00"]],...,"note","source","checked"} or {"always":true}. Null = unknown.';
