-- =============================================================================
-- 0031_project_tasks.sql — Undirnúmer á verkstað
-- Verkefni getur haft undirnúmer (t.d. 100-01 Múrverk, 100-02 Málun) og
-- starfsmaður velur undirnúmer við innskráningu. Tímaskráningin geymir
-- undirnúmerið og það sést í yfirlitum stjórnenda og starfsmanns.
-- =============================================================================

create table if not exists project_tasks (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references companies(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  task_no    text not null,
  name       text not null,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  unique (project_id, task_no)
);
create index if not exists project_tasks_project_idx on project_tasks (project_id) where active;

alter table project_tasks enable row level security;

-- Allir í félaginu mega SJÁ undirnúmer (starfsmenn þurfa listann við innskráningu)
drop policy if exists project_tasks_select on project_tasks;
create policy project_tasks_select on project_tasks for select
  using (tenant_id = app.current_tenant_id());

grant select on project_tasks to authenticated;

-- Tímaskráning geymir valið undirnúmer
alter table time_entries
  add column if not exists task_id uuid references project_tasks(id) on delete set null;

-- --- Stjórnendur: stofna/breyta/eyða undirnúmerum -----------------------------

create or replace function app.project_task_create(
  p_project_id uuid, p_task_no text, p_name text
) returns project_tasks
language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_row project_tasks;
begin
  if not app.has_role('admin') and not app.has_role('project_manager') then
    raise exception 'FORBIDDEN';
  end if;
  if not exists (select 1 from projects where id = p_project_id and tenant_id = v_tenant) then
    raise exception 'NOT_FOUND: Verkefni fannst ekki';
  end if;
  insert into project_tasks (tenant_id, project_id, task_no, name)
  values (v_tenant, p_project_id, trim(p_task_no), trim(p_name))
  returning * into v_row;
  return v_row;
end $$;

create or replace function app.project_task_update(
  p_id uuid, p_task_no text, p_name text, p_active boolean
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not app.has_role('admin') and not app.has_role('project_manager') then
    raise exception 'FORBIDDEN';
  end if;
  update project_tasks
     set task_no = coalesce(trim(p_task_no), task_no),
         name    = coalesce(trim(p_name), name),
         active  = coalesce(p_active, active)
   where id = p_id and tenant_id = app.current_tenant_id();
end $$;

create or replace function app.project_task_delete(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not app.has_role('admin') and not app.has_role('project_manager') then
    raise exception 'FORBIDDEN';
  end if;
  delete from project_tasks
   where id = p_id and tenant_id = app.current_tenant_id();
end $$;

create or replace function public.project_task_create(
  p_project_id uuid, p_task_no text, p_name text
) returns public.project_tasks language sql security definer set search_path = public as $$
  select app.project_task_create(p_project_id, p_task_no, p_name)
$$;

create or replace function public.project_task_update(
  p_id uuid, p_task_no text, p_name text, p_active boolean
) returns void language sql security definer set search_path = public as $$
  select app.project_task_update(p_id, p_task_no, p_name, p_active)
$$;

create or replace function public.project_task_delete(p_id uuid)
returns void language sql security definer set search_path = public as $$
  select app.project_task_delete(p_id)
$$;

-- --- check_in með undirnúmeri -------------------------------------------------
-- Gamla útgáfan felld niður (annars tvær samnefndar og PostgREST ruglast)

drop function if exists public.check_in(uuid, double precision, double precision, numeric, text);
drop function if exists app.check_in(uuid, double precision, double precision, numeric, text);

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

  if not exists (
    select 1 from employee_projects
     where employee_id = v_employee and project_id = p_project_id
  ) then
    raise exception 'NOT_ASSIGNED: Starfsmaður hefur ekki aðgang að þessu verkefni';
  end if;

  if exists (select 1 from time_entries
              where employee_id = v_employee and check_out_at is null) then
    raise exception 'ALREADY_ACTIVE: Þegar virk tímaskráning í gangi';
  end if;

  -- Undirnúmer verður að tilheyra verkefninu og vera virkt
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

create or replace function public.check_in(
  p_project_id uuid, p_lat double precision, p_lng double precision,
  p_accuracy numeric default null, p_note text default null,
  p_task_id uuid default null
) returns public.time_entries language sql security definer set search_path = public as $$
  select app.check_in(p_project_id, p_lat, p_lng, p_accuracy, p_note, p_task_id)
$$;

-- --- Views með undirnúmeri ----------------------------------------------------

create or replace view v_time_entries
  with (security_invoker = on) as
select
  te.id, te.tenant_id, te.employee_id, te.project_id,
  e.full_name      as employee_name,
  e.employee_no,
  p.name           as project_name,
  p.project_no,
  te.check_in_at, te.check_out_at,
  te.check_out_type, te.worked_minutes,
  round(coalesce(te.worked_minutes,0) / 60.0, 2) as worked_hours,
  te.note, te.status, te.source,
  pt.task_no, pt.name as task_name
from time_entries te
join employees e on e.id = te.employee_id
join projects  p on p.id = te.project_id
left join project_tasks pt on pt.id = te.task_id;

create or replace view v_my_active_entry
  with (security_invoker = on) as
select
  te.id, te.project_id, te.check_in_at,
  p.name as project_name, p.project_no,
  pl.radius_m,
  ST_Y(pl.center::geometry) as lat,
  ST_X(pl.center::geometry) as lng,
  pt.task_no, pt.name as task_name
from time_entries te
join employees e on e.id = te.employee_id and e.user_id = app.current_user_id()
join projects  p on p.id = te.project_id
left join project_locations pl on pl.project_id = p.id and pl.is_primary
left join project_tasks pt on pt.id = te.task_id
where te.check_out_at is null;

grant execute on all functions in schema app to anon, authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;
notify pgrst, 'reload schema';
