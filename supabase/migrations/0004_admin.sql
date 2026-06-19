-- =============================================================================
-- 0004_admin.sql — Views og RPC-föll fyrir stjórnborðið
-- Views nota security_invoker=on svo RLS gildi áfram fyrir notandann.
-- =============================================================================

-- --- VIEW: verkefni með (lat,lng,radíus) úr primary geofence --------------
create or replace view v_projects
  with (security_invoker = on) as
select
  p.id, p.tenant_id, p.project_no, p.name, p.description, p.address,
  p.manager_user_id, p.start_date, p.planned_end_date, p.status,
  pl.radius_m,
  ST_Y(pl.center::geometry) as lat,
  ST_X(pl.center::geometry) as lng
from projects p
left join project_locations pl
  on pl.project_id = p.id and pl.is_primary;

-- --- VIEW: tímaskráningar með nöfnum + unnar klst -------------------------
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
  te.note, te.status, te.source
from time_entries te
join employees e on e.id = te.employee_id
join projects  p on p.id = te.project_id;

-- --- VIEW: virkar skráningar (lifandi yfirlit) ----------------------------
create or replace view v_active_entries
  with (security_invoker = on) as
select
  te.id, te.tenant_id, te.employee_id, te.project_id,
  e.full_name as employee_name,
  p.name      as project_name, p.project_no,
  te.check_in_at,
  -- síðasta þekkta staðsetning innan/utan svæðis
  (select ll.inside_geofence from location_logs ll
     where ll.time_entry_id = te.id
     order by ll.recorded_at desc limit 1) as inside_geofence
from time_entries te
join employees e on e.id = te.employee_id
join projects  p on p.id = te.project_id
where te.check_out_at is null;

-- =============================================================================
-- RPC: stofna verkefni (+ geofence) — geometry búið til server-side
-- =============================================================================
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
  p_radius_m   integer
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
                        manager_user_id, start_date, planned_end_date, status)
  values (v_tenant, p_project_no, p_name, p_description, p_address,
          p_manager_user_id, p_start_date, p_end_date, 'active')
  returning * into v_proj;

  if p_lat is not null and p_lng is not null then
    insert into project_locations (tenant_id, project_id, center, radius_m, is_primary)
    values (v_tenant, v_proj.id,
            ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
            coalesce(p_radius_m, 100), true);
  end if;

  perform app.write_audit(v_tenant, v_user, 'create', 'project', v_proj.id, null);
  return v_proj;
end $$;

-- =============================================================================
-- RPC: uppfæra verkefni (+ geofence)
-- =============================================================================
create or replace function app.update_project(
  p_id         uuid,
  p_name       text,
  p_description text,
  p_address    text,
  p_manager_user_id uuid,
  p_start_date date,
  p_end_date   date,
  p_status     text,
  p_lat        double precision,
  p_lng        double precision,
  p_radius_m   integer
) returns projects
language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_user   uuid := app.current_user_id();
  v_proj   projects;
begin
  if not (app.has_role('admin') or app.has_role('project_manager')) then
    raise exception 'FORBIDDEN';
  end if;

  update projects set
    name = p_name, description = p_description, address = p_address,
    manager_user_id = p_manager_user_id, start_date = p_start_date,
    planned_end_date = p_end_date, status = coalesce(p_status, status)
  where id = p_id and tenant_id = v_tenant
  returning * into v_proj;
  if v_proj is null then raise exception 'NOT_FOUND'; end if;

  if p_lat is not null and p_lng is not null then
    -- upsert primary geofence
    if exists (select 1 from project_locations where project_id = p_id and is_primary) then
      update project_locations set
        center = ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
        radius_m = coalesce(p_radius_m, radius_m)
      where project_id = p_id and is_primary;
    else
      insert into project_locations (tenant_id, project_id, center, radius_m, is_primary)
      values (v_tenant, p_id,
              ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
              coalesce(p_radius_m, 100), true);
    end if;
  end if;

  perform app.write_audit(v_tenant, v_user, 'update', 'project', v_proj.id, null);
  return v_proj;
end $$;

-- =============================================================================
-- RPC: úthluta starfsmanni á verkefni (eða fjarlægja)
-- =============================================================================
create or replace function app.set_employee_projects(
  p_employee_id uuid,
  p_project_ids uuid[]
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_user   uuid := app.current_user_id();
  v_pid    uuid;
begin
  if not (app.has_role('admin') or app.has_role('project_manager')) then
    raise exception 'FORBIDDEN';
  end if;

  delete from employee_projects where employee_id = p_employee_id;
  foreach v_pid in array coalesce(p_project_ids, '{}') loop
    insert into employee_projects (tenant_id, employee_id, project_id, assigned_by)
    values (v_tenant, p_employee_id, v_pid, v_user)
    on conflict do nothing;
  end loop;

  perform app.write_audit(v_tenant, v_user, 'update', 'employee', p_employee_id,
    jsonb_build_object('projects', p_project_ids));
end $$;

-- =============================================================================
-- RPC: stofna starfsmann (kennitala DULKÓÐUÐ ef lykill er stilltur)
-- Lykill kemur úr DB-stillingu `app.kennitala_key` (sett í Supabase Vault/secret).
-- =============================================================================
create or replace function app.create_employee(
  p_full_name   text,
  p_employee_no text,
  p_phone       text,
  p_email       text,
  p_national_id text
) returns employees
language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_user   uuid := app.current_user_id();
  v_key    text := current_setting('app.kennitala_key', true);
  v_emp    employees;
begin
  if not (app.has_role('admin') or app.has_role('project_manager')) then
    raise exception 'FORBIDDEN';
  end if;

  insert into employees (tenant_id, full_name, employee_no, phone, email,
                         national_id_enc, status)
  values (v_tenant, p_full_name, p_employee_no, p_phone, p_email,
          case when p_national_id is not null and coalesce(v_key,'') <> ''
               then pgp_sym_encrypt(p_national_id, v_key) end,
          'active')
  returning * into v_emp;

  perform app.write_audit(v_tenant, v_user, 'create', 'employee', v_emp.id, null);
  return v_emp;
end $$;

-- =============================================================================
-- RPC: uppfæra starfsmann
-- =============================================================================
create or replace function app.update_employee(
  p_id          uuid,
  p_full_name   text,
  p_phone       text,
  p_email       text,
  p_status      text
) returns employees
language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_user   uuid := app.current_user_id();
  v_emp    employees;
begin
  if not (app.has_role('admin') or app.has_role('project_manager')) then
    raise exception 'FORBIDDEN';
  end if;

  update employees set
    full_name = p_full_name, phone = p_phone, email = p_email,
    status = coalesce(p_status, status)
  where id = p_id and tenant_id = v_tenant
  returning * into v_emp;
  if v_emp is null then raise exception 'NOT_FOUND'; end if;

  perform app.write_audit(v_tenant, v_user, 'update', 'employee', v_emp.id, null);
  return v_emp;
end $$;

-- =============================================================================
-- RPC: vista fyrirtækis-stillingu (admin) — upsert á company-scope
-- =============================================================================
create or replace function app.set_company_setting(
  p_key   text,
  p_value jsonb
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_user   uuid := app.current_user_id();
begin
  if not app.has_role('admin') then
    raise exception 'FORBIDDEN';
  end if;

  if exists (select 1 from settings
              where scope = 'company' and tenant_id = v_tenant and key = p_key) then
    update settings set value = p_value, updated_by = v_user, updated_at = now()
     where scope = 'company' and tenant_id = v_tenant and key = p_key;
  else
    insert into settings (tenant_id, scope, key, value, updated_by)
    values (v_tenant, 'company', p_key, p_value, v_user);
  end if;
end $$;

-- VIEW: virkar stillingar fyrir fyrirtæki (company override → global default)
create or replace view v_effective_settings
  with (security_invoker = on) as
select s.key, s.value, s.scope
from settings s
where s.scope = 'global'
   or (s.scope = 'company' and s.tenant_id = app.current_tenant_id());
