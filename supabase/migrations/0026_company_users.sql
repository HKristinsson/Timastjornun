-- =============================================================================
-- 0026_company_users.sql — Viðtakendalisti: allir virkir notendur míns félags
-- Notað í "Nýtt skeyti" (vefur + app) svo hægt sé að velja samstarfsmenn af
-- lista í stað þess að muna netföng. Frjáls innsláttur er áfram í boði.
-- =============================================================================

create or replace function app.mail_company_users()
returns table(email text, full_name text)
language sql stable security definer set search_path = public as $$
  select u.email::text,
         coalesce(e.full_name, u.email::text) as full_name
  from users u
  left join employees e on e.user_id = u.id
  where u.tenant_id = app.current_tenant_id()
    and u.status = 'active'
    and u.email is not null
    and u.id <> app.current_user_id()
  order by 2, 1
$$;

create or replace function public.mail_company_users()
returns table(email text, full_name text)
language sql stable security definer set search_path = public as $$
  select * from app.mail_company_users()
$$;

grant execute on all functions in schema app to anon, authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;
notify pgrst, 'reload schema';
