-- =============================================================================
-- 0019_super_dashboard.sql — Breyta félögum + ítarlegri tölfræði á yfirlit
-- =============================================================================

-- (a) Breyta félagi (nafn, lén, staða, sæti)
create or replace function app.su_update_company(
  p_id uuid, p_name text, p_domain text, p_status text, p_max_employees int
) returns companies
language plpgsql security definer set search_path = public as $$
declare v_comp companies;
begin
  if not app.has_role('super_admin') then raise exception 'FORBIDDEN'; end if;
  if p_status not in ('active','suspended') then raise exception 'BAD_STATUS'; end if;
  if p_max_employees is null or p_max_employees < 1 then raise exception 'BAD_SEATS'; end if;

  update companies set
    name = p_name,
    domain = lower(nullif(trim(p_domain), '')),
    status = p_status,
    max_employees = p_max_employees
  where id = p_id
  returning * into v_comp;
  if v_comp is null then raise exception 'NOT_FOUND'; end if;

  perform app.write_audit(p_id, app.current_user_id(), 'update', 'company', p_id,
    jsonb_build_object('name', p_name, 'domain', p_domain,
                       'status', p_status, 'max_employees', p_max_employees));
  return v_comp;
end $$;

create or replace function public.su_update_company(
  p_id uuid, p_name text, p_domain text, p_status text, p_max_employees int
) returns public.companies language sql security definer set search_path = public as $$
  select app.su_update_company(p_id, p_name, p_domain, p_status, p_max_employees)
$$;

-- (b) Yfirlit með virkum OG óvirkum notendum/verkefnum
drop function if exists public.su_companies_overview();
drop function if exists app.su_companies_overview();
create or replace function app.su_companies_overview()
returns table(
  id uuid, name text, domain text, status text, created_at timestamptz,
  max_employees int,
  active_employees bigint, inactive_employees bigint,
  active_projects bigint, inactive_projects bigint,
  admin_email text
) language plpgsql stable security definer set search_path = public as $$
begin
  if not app.has_role('super_admin') then raise exception 'FORBIDDEN'; end if;
  return query
    select c.id, c.name, c.domain, c.status, c.created_at, c.max_employees,
      (select count(*) from employees e where e.tenant_id = c.id and e.status = 'active'),
      (select count(*) from employees e where e.tenant_id = c.id and e.status = 'inactive'),
      (select count(*) from projects p where p.tenant_id = c.id and p.status = 'active'),
      (select count(*) from projects p where p.tenant_id = c.id and p.status = 'inactive'),
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
  max_employees int,
  active_employees bigint, inactive_employees bigint,
  active_projects bigint, inactive_projects bigint,
  admin_email text
) language sql stable security definer set search_path = public as $$
  select * from app.su_companies_overview()
$$;

grant execute on all functions in schema public to anon, authenticated, service_role;
grant execute on all functions in schema app to anon, authenticated, service_role;

notify pgrst, 'reload schema';
