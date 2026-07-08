-- =============================================================================
-- 0018_super_powers.sql — Super admin fær full réttindi í öllum félögum + yfirlit
-- =============================================================================

-- (a) LYKILBREYTING: super_admin uppfyllir sjálfkrafa 'admin' og 'project_manager'
--     kröfur alls staðar (create_project, starfsmenn, póstur, tilkynningar, stillingar...).
--     Ein breyting hér nær yfir öll föll sem kalla app.has_role.
create or replace function app.has_role(p_role text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.users u on u.id = ur.user_id
    join public.roles r on r.id = ur.role_id
    where u.auth_user_id = auth.uid()
      and (
        r.name = p_role
        or (p_role in ('admin','project_manager') and r.name = 'super_admin')
      )
  )
$$;

-- (b) Starfsmannayfirlit félags fyrir super admin (skjáborð)
create or replace function app.su_company_employees(p_company uuid)
returns table(
  id uuid, full_name text, employee_no text, email text, phone text,
  status text, has_login boolean, mail_inbox boolean
) language plpgsql stable security definer set search_path = public as $$
begin
  if not app.has_role('super_admin') then raise exception 'FORBIDDEN'; end if;
  return query
    select e.id, e.full_name, e.employee_no, e.email::text, e.phone, e.status,
      exists (select 1 from users u
               where u.id = e.user_id and u.auth_user_id is not null),
      exists (select 1 from group2_recipients g
               where g.email = e.email and g.active)
    from employees e
    where e.tenant_id = p_company
    order by e.full_name;
end $$;

-- (c) Félagayfirlit með verkefnafjölda líka (skipt út eldri útgáfu)
drop function if exists public.su_companies_overview();
drop function if exists app.su_companies_overview();
create or replace function app.su_companies_overview()
returns table(
  id uuid, name text, domain text, status text, created_at timestamptz,
  max_employees int, active_employees bigint, active_projects bigint, admin_email text
) language plpgsql stable security definer set search_path = public as $$
begin
  if not app.has_role('super_admin') then raise exception 'FORBIDDEN'; end if;
  return query
    select c.id, c.name, c.domain, c.status, c.created_at, c.max_employees,
      (select count(*) from employees e
        where e.tenant_id = c.id and e.status = 'active'),
      (select count(*) from projects p
        where p.tenant_id = c.id and p.status = 'active'),
      (select u.email::text from users u
        join user_roles ur on ur.user_id = u.id
        join roles r on r.id = ur.role_id
        where u.tenant_id = c.id and r.name = 'admin'
        order by u.created_at limit 1)
    from companies c
    order by c.created_at;
end $$;

create or replace function public.su_companies_overview()
returns table(
  id uuid, name text, domain text, status text, created_at timestamptz,
  max_employees int, active_employees bigint, active_projects bigint, admin_email text
) language sql stable security definer set search_path = public as $$
  select * from app.su_companies_overview()
$$;

create or replace function public.su_company_employees(p_company uuid)
returns table(
  id uuid, full_name text, employee_no text, email text, phone text,
  status text, has_login boolean, mail_inbox boolean
) language sql stable security definer set search_path = public as $$
  select * from app.su_company_employees(p_company)
$$;

grant execute on all functions in schema public to anon, authenticated, service_role;
grant execute on all functions in schema app to anon, authenticated, service_role;

notify pgrst, 'reload schema';
