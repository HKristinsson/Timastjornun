-- =============================================================================
-- 0028_bulk_delete.sql — Eyða mörgum skeytum í einu (aðeins eigin póstur)
-- =============================================================================

create or replace function app.mail_delete_inbound_many(p_ids uuid[])
returns integer language sql security definer set search_path = public as $$
  with del as (
    delete from inbound_emails
     where id = any(p_ids) and recipient_user_id = app.current_user_id()
     returning 1
  ) select count(*)::integer from del
$$;

create or replace function app.mail_delete_outbound_many(p_ids uuid[])
returns integer language sql security definer set search_path = public as $$
  with del as (
    delete from outbound_emails
     where id = any(p_ids) and sender_user_id = app.current_user_id()
     returning 1
  ) select count(*)::integer from del
$$;

create or replace function public.mail_delete_inbound_many(p_ids uuid[])
returns integer language sql security definer set search_path = public as $$
  select app.mail_delete_inbound_many(p_ids)
$$;

create or replace function public.mail_delete_outbound_many(p_ids uuid[])
returns integer language sql security definer set search_path = public as $$
  select app.mail_delete_outbound_many(p_ids)
$$;

grant execute on all functions in schema app to anon, authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;
notify pgrst, 'reload schema';
