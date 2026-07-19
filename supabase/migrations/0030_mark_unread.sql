-- =============================================================================
-- 0030_mark_unread.sql — Merkja skeyti sem ólesið (aðeins eigin póstur)
-- =============================================================================

create or replace function app.mail_mark_unread(p_id uuid)
returns void language sql security definer set search_path = public as $$
  update inbound_emails set read_at = null
   where id = p_id and recipient_user_id = app.current_user_id()
$$;

create or replace function public.mail_mark_unread(p_id uuid)
returns void language sql security definer set search_path = public as $$
  select app.mail_mark_unread(p_id)
$$;

grant execute on all functions in schema app to anon, authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;
notify pgrst, 'reload schema';
