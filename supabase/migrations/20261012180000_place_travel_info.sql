-- "Know before you go" facts for visitors, mostly travellers from abroad: how to get there, cash or card,
-- local vs foreigner fees, best and rough-weather months, safety notes and dress code.
-- Shape: {"getting_there":{"hub","route","time","notes","sources":[url]}, "money":{"text","sources"},
--         "fees":{"local","foreigner","other","sources"}, "seasons":{"best","avoid","sources"},
--         "safety":{"text","sources"}, "dress":{"text","sources"}, "checked":"2026-10"}
-- Every section is optional and every text needs a source; the app hides anything missing.
-- Null means nobody has checked yet. Additive only: no other change.
alter table public.places add column if not exists travel_info jsonb;

comment on column public.places.travel_info is
  'Sourced visitor essentials: getting_there, money, fees, seasons, safety, dress (each with sources) and checked. Null = unknown.';
