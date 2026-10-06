-- Security round 1: the public anon key must not be able to change data.
--
-- The web app only talks to Supabase Auth. Every table read and write goes through the Azure Functions API,
-- which uses the service role (it bypasses these grants and RLS). Before this migration, PostgREST let:
--   * anyone holding the anon key INSERT and UPDATE rows in public.places;
--   * anyone call consume/refund_ask_ai_usage for any user id (unlimited AI, or burning another user's quota);
--   * signed-in users UPDATE their own ask_ai_usage counter, un-hide moderated comments, self-heart plans,
--     set their own followers_count / hearts_count and insert follows with status 'accepted'.
-- Removing write privileges from the public roles closes all of these at once, whatever the RLS policies say.
-- SELECT grants are unchanged, so existing read policies keep working.

revoke insert, update, delete, truncate, references, trigger on all tables in schema public from anon, authenticated;

-- Tables created later by the dashboard or migrations must not get write grants for the public roles either.
alter default privileges for role postgres in schema public
  revoke insert, update, delete, truncate, references, trigger on tables from anon, authenticated;

-- Ask AI quota functions are SECURITY DEFINER and take the user/guest id as a parameter: API only.
do $$
declare
  fn regprocedure;
begin
  for fn in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'consume_ask_ai_usage',
        'refund_ask_ai_usage',
        'consume_ask_ai_guest_usage',
        'refund_ask_ai_guest_usage',
        'check_ask_ai_guest_usage'
      )
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;
