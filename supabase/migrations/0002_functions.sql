-- =============================================================================
-- 0002_functions.sql — Helper-föll, geofence check-in/out, audit
-- =============================================================================

-- --- Helpers: tenant + notandi úr JWT -------------------------------------

-- tenant_id núverandi notanda (úr JWT app_metadata, eða GUC fyrir server-keyrslur)
create or replace function app.current_tenant_id()
returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true)::jsonb
             -> 'app_metadata' ->> 'tenant_id', ''),
    nullif(current_setting('app.tenant_id', true), '')
  )::uuid
$$;

-- innra users.id núverandi notanda (út frá Supabase auth.uid())
create or replace function app.current_user_id()
returns uuid language sql stable as $$
  select id from public.users
  where auth_user_id = auth.uid()
  limit 1
$$;

-- hefur notandi tiltekið hlutverk?
create or replace function app.has_role(p_role text)
returns boolean language sql stable as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.users u on u.id = ur.user_id
    join public.roles r on r.id = ur.role_id
    where u.auth_user_id = auth.uid()
      and r.name = p_role
  )
$$;

-- sækja talnastillingu (settings) með global → company → project forgangi
create or replace function app.get_setting_int(
  p_tenant uuid, p_project uuid, p_key text, p_default int)
returns int language sql stable as $$
  select coalesce(
    (select (value #>> '{}')::int from public.settings
       where key = p_key and scope = 'project' and project_id = p_project),
    (select (value #>> '{}')::int from public.settings
       where key = p_key and scope = 'company' and tenant_id = p_tenant),
    (select (value #>> '{}')::int from public.settings
       where key = p_key and scope = 'global'),
    p_default
  )
$$;

-- --- Audit hjálp ----------------------------------------------------------
create or replace function app.write_audit(
  p_tenant uuid, p_actor uuid, p_action text,
  p_entity_type text, p_entity_id uuid, p_changes jsonb default null)
returns void language sql security definer set search_path = public as $$
  insert into audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, changes)
  values (p_tenant, p_actor, p_action, p_entity_type, p_entity_id, p_changes)
$$;

-- updated_at sjálfvirkt
create or replace function app.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger trg_companies_touch   before update on companies
  for each row execute function app.touch_updated_at();
create trigger trg_users_touch       before update on users
  for each row execute function app.touch_updated_at();
create trigger trg_employees_touch   before update on employees
  for each row execute function app.touch_updated_at();
create trigger trg_projects_touch    before update on projects
  for each row execute function app.touch_updated_at();
create trigger trg_time_entries_touch before update on time_entries
  for each row execute function app.touch_updated_at();

-- =============================================================================
-- GEOFENCE: CHECK-IN  (server-side — ekki hægt að svindla frá appi)
-- =============================================================================
-- Skilar nýrri time_entries röð ef innan svæðis; annars villa með fjarlægð.
create or replace function app.check_in(
  p_project_id uuid,
  p_lat        double precision,
  p_lng        double precision,
  p_accuracy   numeric default null,
  p_note       text    default null
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
  -- 1) Finna starfsmann tengdan núverandi notanda
  select id into v_employee from employees
   where user_id = v_user and tenant_id = v_tenant and status = 'active';
  if v_employee is null then
    raise exception 'EMP_NOT_FOUND: Enginn virkur starfsmaður tengdur notanda';
  end if;

  -- 2) Staðfesta að starfsmaður MÁ skrá sig á verkefnið
  if not exists (
    select 1 from employee_projects
     where employee_id = v_employee and project_id = p_project_id
  ) then
    raise exception 'NOT_ASSIGNED: Starfsmaður hefur ekki aðgang að þessu verkefni';
  end if;

  -- 3) Aðeins ein virk skráning í einu
  if exists (select 1 from time_entries
              where employee_id = v_employee and check_out_at is null) then
    raise exception 'ALREADY_ACTIVE: Þegar virk tímaskráning í gangi';
  end if;

  -- 4) Sækja geofence verkefnis (primary svæði)
  select * into v_loc from project_locations
   where project_id = p_project_id and is_primary
   order by created_at limit 1;
  if v_loc is null then
    raise exception 'NO_GEOFENCE: Verkefni hefur ekkert skilgreint svæði';
  end if;

  -- 5) Krefjast lágmarksnákvæmni (annars hægt að "fljóta" inn)
  v_min_acc := app.get_setting_int(v_tenant, p_project_id, 'min_accuracy_m', 50);
  if p_accuracy is not null and p_accuracy > v_min_acc then
    raise exception 'LOW_ACCURACY: GPS-nákvæmni ófullnægjandi (% m > % m)',
      p_accuracy, v_min_acc;
  end if;

  -- 6) Geofence-athugun: er punktur innan radíus? (PostGIS, metrar)
  v_distance := ST_Distance(v_point, v_loc.center);
  if v_distance > v_loc.radius_m then
    raise exception 'OUTSIDE_AREA: Utan svæðis (% m, leyfilegt % m)',
      round(v_distance), v_loc.radius_m;
  end if;

  -- 7) Stofna tímaskráningu
  insert into time_entries (
    tenant_id, employee_id, project_id, check_in_at,
    check_in_location, check_in_accuracy_m, note, status, source)
  values (
    v_tenant, v_employee, p_project_id, now(),
    v_point, p_accuracy, p_note, 'active', 'mobile')
  returning * into v_entry;

  perform app.write_audit(v_tenant, v_user, 'create', 'time_entry', v_entry.id,
    jsonb_build_object('event','check_in','distance_m',round(v_distance)));

  return v_entry;
end $$;

-- =============================================================================
-- GEOFENCE: CHECK-OUT (handvirk útskráning)
-- =============================================================================
create or replace function app.check_out(
  p_time_entry_id uuid,
  p_lat           double precision default null,
  p_lng           double precision default null,
  p_accuracy      numeric default null,
  p_note          text    default null
) returns time_entries
language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_user   uuid := app.current_user_id();
  v_point  geography := case when p_lat is not null
              then ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography end;
  v_entry  time_entries;
begin
  select * into v_entry from time_entries
   where id = p_time_entry_id and check_out_at is null;
  if v_entry is null then
    raise exception 'NO_ACTIVE_ENTRY: Engin virk skráning fannst';
  end if;

  update time_entries set
    check_out_at         = now(),
    check_out_location   = coalesce(v_point, check_out_location),
    check_out_accuracy_m = p_accuracy,
    check_out_type       = 'manual',
    worked_minutes       = ceil(extract(epoch from (now() - check_in_at)) / 60)::int,
    note                 = coalesce(p_note, note),
    status               = 'pending'   -- bíður samþykktar
  where id = p_time_entry_id
  returning * into v_entry;

  perform app.write_audit(v_tenant, v_user, 'update', 'time_entry', v_entry.id,
    jsonb_build_object('event','check_out','type','manual',
                       'worked_minutes', v_entry.worked_minutes));
  return v_entry;
end $$;

-- =============================================================================
-- SJÁLFVIRK ÚTSKRÁNING (kallað af bakgrunnsvinnslu / cron / edge function)
-- =============================================================================
create or replace function app.auto_check_out(
  p_time_entry_id uuid,
  p_reason        text,                        -- 'auto_geofence' | 'auto_gps_lost'
  p_effective_at  timestamptz default now()
) returns time_entries
language plpgsql security definer set search_path = public as $$
declare
  v_entry time_entries;
begin
  select * into v_entry from time_entries
   where id = p_time_entry_id and check_out_at is null;
  if v_entry is null then
    raise exception 'NO_ACTIVE_ENTRY';
  end if;

  update time_entries set
    check_out_at   = p_effective_at,
    check_out_type = p_reason,
    worked_minutes = ceil(extract(epoch from (p_effective_at - check_in_at)) / 60)::int,
    status         = 'pending'
  where id = p_time_entry_id
  returning * into v_entry;

  -- kerfið er actor (null) — sjálfvirk aðgerð
  perform app.write_audit(v_entry.tenant_id, null, 'auto_checkout',
    'time_entry', v_entry.id, jsonb_build_object('reason', p_reason));
  return v_entry;
end $$;

-- =============================================================================
-- SAMÞYKKT / HÖFNUN tímaskráningar (verkefnastjóri/admin)
-- =============================================================================
create or replace function app.review_time_entry(
  p_time_entry_id uuid,
  p_decision      text,                        -- 'approved' | 'rejected'
  p_reason        text default null
) returns time_entries
language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_user   uuid := app.current_user_id();
  v_entry  time_entries;
begin
  if p_decision not in ('approved','rejected') then
    raise exception 'BAD_DECISION';
  end if;
  if p_decision = 'rejected' and (p_reason is null or length(trim(p_reason)) = 0) then
    raise exception 'REASON_REQUIRED: Ástæða er skylda við höfnun';
  end if;

  update time_entries
     set status = p_decision
   where id = p_time_entry_id and status = 'pending'
   returning * into v_entry;
  if v_entry is null then
    raise exception 'NOT_PENDING: Skráning er ekki í bið';
  end if;

  insert into approvals (tenant_id, time_entry_id, reviewed_by, decision, reason)
  values (v_tenant, p_time_entry_id, v_user, p_decision, p_reason);

  perform app.write_audit(v_tenant, v_user, p_decision, 'time_entry', v_entry.id,
    jsonb_build_object('reason', p_reason));
  return v_entry;
end $$;
