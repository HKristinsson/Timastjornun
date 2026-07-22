-- =============================================================================
-- 0036_employee_admin_absence_filter.sql
-- 1) Gera starfsmann að admin (eða afturkalla) — fær þá strax Stjórnun í appinu.
-- 2) Fjarvera dagsins (veikur/í fríi) útilokar staðsetningarvöktun:
--    engir púlsar geymdir og starfsmaðurinn birtist ekki á korti.
-- =============================================================================

-- Fjarverandi í dag? (veikur eða í fríi)
create or replace function app.employee_absent_today(p_employee_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from absences
    where employee_id = p_employee_id
      and current_date between date_from and date_to
  )
$$;

-- --- 1) Admin-hlutverk starfsmanns --------------------------------------------

create or replace function app.employee_set_admin(p_employee_id uuid, p_admin boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_emp employees;
begin
  if not app.has_role('admin') then raise exception 'FORBIDDEN'; end if;
  select * into v_emp from employees
   where id = p_employee_id and tenant_id = app.current_tenant_id();
  if v_emp is null then
    raise exception 'NOT_FOUND: Starfsmaður fannst ekki';
  end if;
  if v_emp.user_id is null then
    raise exception 'NO_LOGIN: Starfsmaðurinn þarf innskráningu (netfang + lykilorð) fyrst';
  end if;

  if p_admin then
    insert into user_roles (user_id, role_id)
    select v_emp.user_id, id from roles where name = 'admin'
    on conflict do nothing;
  else
    if v_emp.user_id = app.current_user_id() then
      raise exception 'SELF_DEMOTE: Þú getur ekki tekið admin-réttindi af sjálfum þér';
    end if;
    delete from user_roles ur using roles r
     where ur.role_id = r.id and r.name = 'admin' and ur.user_id = v_emp.user_id;
  end if;

  perform app.write_audit(v_emp.tenant_id, app.current_user_id(),
    case when p_admin then 'create' else 'delete' end,
    'admin_role', p_employee_id, jsonb_build_object('admin', p_admin));
end $$;

-- Er starfsmaðurinn admin? (fyrir togglann í viðmótinu)
create or replace function app.employee_is_admin(p_employee_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from employees e
    join user_roles ur on ur.user_id = e.user_id
    join roles r on r.id = ur.role_id and r.name = 'admin'
    where e.id = p_employee_id and e.tenant_id = app.current_tenant_id()
  )
$$;

create or replace function public.employee_set_admin(p_employee_id uuid, p_admin boolean)
returns void language sql security definer set search_path = public as $$
  select app.employee_set_admin(p_employee_id, p_admin)
$$;

create or replace function public.employee_is_admin(p_employee_id uuid)
returns boolean language sql security definer set search_path = public as $$
  select app.employee_is_admin(p_employee_id)
$$;

-- --- 2) Fjarvera stöðvar vöktun -----------------------------------------------

create or replace function app.presence_ping(
  p_lat double precision, p_lng double precision, p_accuracy numeric default null
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_emp employees;
begin
  select * into v_emp from employees
   where user_id = app.current_user_id()
     and tenant_id = app.current_tenant_id()
     and status = 'active';
  if v_emp is null then return false; end if;

  -- Utan glugga EÐA veikur/í fríi: ekkert geymt, síðasta staða hreinsuð
  if not app.tracking_allowed() or app.employee_absent_today(v_emp.id) then
    delete from employee_presence where employee_id = v_emp.id;
    return false;
  end if;

  insert into employee_presence (employee_id, tenant_id, location, accuracy_m, recorded_at)
  values (v_emp.id, v_emp.tenant_id,
          ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography, p_accuracy, now())
  on conflict (employee_id) do update
    set location = excluded.location, accuracy_m = excluded.accuracy_m,
        recorded_at = excluded.recorded_at;
  return true;
end $$;

create or replace function app.employee_locations()
returns table(
  employee_id uuid, full_name text, photo_path text,
  project_no text, project_name text,
  lat double precision, lng double precision,
  recorded_at timestamptz, inside_geofence boolean, minutes_ago int,
  source text
)
language plpgsql security definer set search_path = public as $$
declare v_tenant uuid := app.current_tenant_id();
begin
  if not app.has_role('admin') and not app.has_role('project_manager') then
    raise exception 'FORBIDDEN';
  end if;
  if not app.tracking_allowed() then
    raise exception 'TRACKING_CLOSED: Staðsetning starfsmanna er aðeins sýnileg innan stillts tímaglugga félagsins';
  end if;
  return query
    select e.id, e.full_name, e.photo_path, p.project_no, p.name,
           ST_Y(ll.location::geometry), ST_X(ll.location::geometry),
           ll.recorded_at, ll.inside_geofence,
           (extract(epoch from (now() - ll.recorded_at)) / 60)::int,
           'checked_in'::text
    from time_entries te
    join employees e on e.id = te.employee_id
    join projects  p on p.id = te.project_id
    join lateral (
      select l.location, l.recorded_at, l.inside_geofence
      from location_logs l
      where l.time_entry_id = te.id
      order by l.recorded_at desc limit 1
    ) ll on true
    where te.tenant_id = v_tenant and te.check_out_at is null
      and not app.employee_absent_today(e.id)
    union all
    select e.id, e.full_name, e.photo_path, null::text, null::text,
           ST_Y(pr.location::geometry), ST_X(pr.location::geometry),
           pr.recorded_at, null::boolean,
           (extract(epoch from (now() - pr.recorded_at)) / 60)::int,
           'presence'::text
    from employee_presence pr
    join employees e on e.id = pr.employee_id and e.status = 'active'
    where pr.tenant_id = v_tenant
      and pr.recorded_at > now() - interval '3 hours'
      and not app.employee_absent_today(e.id)
      and not exists (
        select 1 from time_entries te2
        where te2.employee_id = pr.employee_id and te2.check_out_at is null
      )
    order by 8 desc;
end $$;

grant execute on all functions in schema app to anon, authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;
notify pgrst, 'reload schema';
