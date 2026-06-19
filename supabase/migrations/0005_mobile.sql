-- =============================================================================
-- 0005_mobile.sql — Views/föll sem mobile-app starfsmanns notar
-- =============================================================================

-- --- VIEW: verkefni sem NÚVERANDI starfsmaður má skrá sig á ----------------
create or replace view v_my_projects
  with (security_invoker = on) as
select
  p.id, p.project_no, p.name, p.address, p.status,
  pl.radius_m,
  ST_Y(pl.center::geometry) as lat,
  ST_X(pl.center::geometry) as lng
from employee_projects ep
join employees e on e.id = ep.employee_id and e.user_id = app.current_user_id()
join projects  p on p.id = ep.project_id and p.status = 'active'
left join project_locations pl on pl.project_id = p.id and pl.is_primary;

-- --- RPC: skrá staðsetningu meðan innskráður; skilar hvort innan svæðis ----
-- Kallað reglulega af appinu. Reiknar inside/outside server-side.
create or replace function app.log_location(
  p_time_entry_id uuid,
  p_lat           double precision,
  p_lng           double precision,
  p_accuracy      numeric default null
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_tenant   uuid := app.current_tenant_id();
  v_point    geography := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography;
  v_entry    time_entries;
  v_loc      project_locations;
  v_inside   boolean;
  v_prev     boolean;
  v_event    text := null;
begin
  select * into v_entry from time_entries
   where id = p_time_entry_id and check_out_at is null;
  if v_entry is null then
    raise exception 'NO_ACTIVE_ENTRY';
  end if;

  select * into v_loc from project_locations
   where project_id = v_entry.project_id and is_primary
   order by created_at limit 1;

  v_inside := ST_DWithin(v_point, v_loc.center, v_loc.radius_m);

  -- greina atburð (fór út / sneri aftur) m.v. síðustu mælingu
  select inside_geofence into v_prev from location_logs
   where time_entry_id = p_time_entry_id
   order by recorded_at desc limit 1;
  if v_prev is not null then
    if v_prev and not v_inside then v_event := 'left_area';
    elsif not v_prev and v_inside then v_event := 'returned';
    end if;
  end if;

  insert into location_logs (tenant_id, time_entry_id, recorded_at, location,
                             accuracy_m, inside_geofence, event_type)
  values (v_tenant, p_time_entry_id, now(), v_point, p_accuracy, v_inside, v_event);

  return v_inside;
end $$;

-- --- VIEW: virk skráning núverandi starfsmanns (fyrir home/active skjá) ----
create or replace view v_my_active_entry
  with (security_invoker = on) as
select
  te.id, te.project_id, te.check_in_at,
  p.name as project_name, p.project_no,
  pl.radius_m,
  ST_Y(pl.center::geometry) as lat,
  ST_X(pl.center::geometry) as lng
from time_entries te
join employees e on e.id = te.employee_id and e.user_id = app.current_user_id()
join projects  p on p.id = te.project_id
left join project_locations pl on pl.project_id = p.id and pl.is_primary
where te.check_out_at is null;
