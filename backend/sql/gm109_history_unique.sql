alter table public.history
add constraint history_user_type_place_unique
unique (user_id, type, place_id);
