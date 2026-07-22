-- =============================================================================
-- 0037_open_projects.sql — Opin verkefni + valkvæður verkefnastjóri
-- Opið verkefni: ALLIR starfsmenn félagsins sjá það og geta skráð sig inn
-- (engin úthlutun nauðsynleg). Lokað verkefni: aðeins úthlutaðir (eins og áður).
-- Hægt að opna/loka hvenær sem er. Verkefnastjóri er valkvæður.
-- =============================================================================

alter table projects add column if not exists open_access boolean not null default false;

-- --- create_project með p_open (gamla útgáfan felld fyrst) --------------------

drop function if exists public.create_project(text, text, text, text, uuid, date, date, double precision, double precision, integer);
drop function if exists app.create_project(text, text, text, text, uuid, date, date, double precision, double precision, integer);

create or replace function app.create_project(
  p_project_no text,
  p_name       text,
  p_description text,
  p_address    text,
  p_manager_user_id uuid,
  p_start_date date,
  p_end_date   date,
  p_lat        double precision,
  p_lng        double precision,
  p_radius_m   integer,
  p_open       boolean default false
) returns projects
language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_user   uuid := app.current_user_id();
  v_proj   projects;
begin
  if not (app.has_role('admin') or app.has_role('project_manager')) then
    raise exception 'FORBIDDEN: Aðeins admin/verkefnastjóri má stofna verkefni';
  end if;

  insert into projects (tenant_id, project_no, name, description, address,
                        manager_user_id, start_date, planned_end_date, status, open_access)
  values (v_tenant, p_project_no, p_name, p_description, p_address,
          p_manager_user_id, p_start_date, p_end_date, 'active', coalesce(p_open, false))
  returning * into v_proj;

  if p_lat is not null and p_lng is not null then
    insert into project_locations (tenant_id, project_id, center, radius_m, is_primary)
    values (v_tenant, v_proj.id,
            ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
            coalesce(p_radius_m, 100), true);
  end if;

  perform app.write_audit(v_tenant, v_user, 'create', 'project', v_proj.id,
    jsonb_build_object('open', coalesce(p_open, false)));
  return v_proj;
end $$;

create or replace function public.create_project(
  p_project_no text, p_name text, p_description text, p_address text,
  p_manager_user_id uuid, p_start_date date, p_end_date date,
  p_lat double precision, p_lng double precision, p_radius_m integer,
  p_open boolean default false
) returns public.projects language sql security definer set search_path = public as $$
  select app.create_project(p_project_no, p_name, p_description, p_address,
    p_manager_user_id, p_start_date, p_end_date, p_lat, p_lng, p_radius_m, p_open)
$$;

-- --- Opna/loka verkefni -------------------------------------------------------

create or replace function app.project_set_open(p_id uuid, p_open boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (app.has_role('admin') or app.has_role('project_manager')) then
    raise exception 'FORBIDDEN';
  end if;
  update projects set open_access = p_open
   where id = p_id and tenant_id = app.current_tenant_id();
  perform app.write_audit(app.current_tenant_id(), app.current_user_id(),
    'update', 'project', p_id, jsonb_build_object('open', p_open));
end $$;

create or replace function public.project_set_open(p_id uuid, p_open boolean)
returns void language sql security definer set search_path = public as $$
  select app.project_set_open(p_id, p_open)
$$;

-- --- check_in: opið verkefni EÐA úthlutun -------------------------------------

create or replace function app.check_in(
  p_project_id uuid,
  p_lat        double precision,
  p_lng        double precision,
  p_accuracy   numeric default null,
  p_note       text    default null,
  p_task_id    uuid    default null
) returns time_entries
language plpgsql security definer set search_path = public as $$
declare
  v_tenant    uuid := app.current_tenant_id();
  v_user      uuid := app.current_user_id();
  v_employee  uuid;
  v_point     geography := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography;
  v_open      boolean;
  v_loc       project_locations;
  v_min_acc   int;
  v_distance  numeric;
  v_entry     time_entries;
begin
  select id into v_employee from employees
   where user_id = v_user and tenant_id = v_tenant and status = 'active';
  if v_employee is null then
    raise exception 'EMP_NOT_FOUND: Enginn virkur starfsmaður tengdur notanda';
  end if;

  select open_access into v_open from projects
   where id = p_project_id and tenant_id = v_tenant and status = 'active';
  if v_open is null then
    raise exception 'NOT_FOUND: Verkefni fannst ekki eða er óvirkt';
  end if;

  -- Opið verkefni: allir starfsmenn; lokað: aðeins úthlutaðir
  if not v_open and not exists (
    select 1 from employee_projects
     where employee_id = v_employee and project_id = p_project_id
  ) then
    raise exception 'NOT_ASSIGNED: Starfsmaður hefur ekki aðgang að þessu verkefni';
  end if;

  if exists (select 1 from time_entries
              where employee_id = v_employee and check_out_at is null) then
    raise exception 'ALREADY_ACTIVE: Þegar virk tímaskráning í gangi';
  end if;

  if p_task_id is not null and not exists (
    select 1 from project_tasks
     where id = p_task_id and project_id = p_project_id and active
  ) then
    raise exception 'BAD_TASK: Undirnúmer fannst ekki á þessu verkefni';
  end if;

  select * into v_loc from project_locations
   where project_id = p_project_id and is_primary
   order by created_at limit 1;
  if v_loc is null then
    raise exception 'NO_GEOFENCE: Verkefni hefur ekkert skilgreint svæði';
  end if;

  v_min_acc := app.get_setting_int(v_tenant, p_project_id, 'min_accuracy_m', 50);
  if p_accuracy is not null and p_accuracy > v_min_acc then
    raise exception 'LOW_ACCURACY: GPS-nákvæmni ófullnægjandi (% m > % m)',
      p_accuracy, v_min_acc;
  end if;

  v_distance := ST_Distance(v_point, v_loc.center);
  if v_distance > v_loc.radius_m then
    raise exception 'OUTSIDE_AREA: Utan svæðis (% m, leyfilegt % m)',
      round(v_distance), v_loc.radius_m;
  end if;

  insert into time_entries (
    tenant_id, employee_id, project_id, task_id, check_in_at,
    check_in_location, check_in_accuracy_m, note, status, source)
  values (
    v_tenant, v_employee, p_project_id, p_task_id, now(),
    v_point, p_accuracy, p_note, 'active', 'mobile')
  returning * into v_entry;

  perform app.write_audit(v_tenant, v_user, 'create', 'time_entry', v_entry.id,
    jsonb_build_object('event','check_in','distance_m',round(v_distance),
                       'task_id',p_task_id));

  return v_entry;
end $$;

-- --- v_my_projects: opin verkefni sjást hjá öllum -----------------------------

create or replace view v_my_projects
  with (security_invoker = on) as
select
  p.id, p.project_no, p.name, p.address, p.status,
  pl.radius_m,
  ST_Y(pl.center::geometry) as lat,
  ST_X(pl.center::geometry) as lng
from projects p
left join project_locations pl on pl.project_id = p.id and pl.is_primary
where p.status = 'active'
  and (
    p.open_access
    or exists (
      select 1 from employee_projects ep
      join employees e on e.id = ep.employee_id
      where ep.project_id = p.id and e.user_id = app.current_user_id()
    )
  );

-- v_projects (stjórnborð): sýna opið/lokað
create or replace view v_projects
  with (security_invoker = on) as
select
  p.id, p.tenant_id, p.project_no, p.name, p.description, p.address,
  p.manager_user_id, p.start_date, p.planned_end_date, p.status,
  pl.radius_m,
  ST_Y(pl.center::geometry) as lat,
  ST_X(pl.center::geometry) as lng,
  p.open_access
from projects p
left join project_locations pl
  on pl.project_id = p.id and pl.is_primary;

grant execute on all functions in schema app to anon, authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;
notify pgrst, 'reload schema';
