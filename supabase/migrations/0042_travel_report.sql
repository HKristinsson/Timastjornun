-- =============================================================================
-- 0042_travel_report.sql — Staðamerking stoppa + ferðaskýrsla
-- 1) employee_stops: klasagreining ferils í stopp (endurnýtanleg, með
--    hámarksgati svo nótt/helgi brjóti upp klasa).
-- 2) employee_day_track: stopp fá nú heiti skráðs staðar eða verkefnis.
-- 3) track_report: samantekt per starfsmann yfir tímabil — hve oft og lengi
--    á skráðum stöðum, á verkstöðum, og á óskráðum stöðum.
-- =============================================================================

-- --- 1) Stopp-klasagreining ---------------------------------------------------

create or replace function app.employee_stops(
  p_employee_id uuid, p_from timestamptz, p_to timestamptz,
  p_max_gap interval default '2 hours'
) returns table(center geometry, started_at timestamptz, ended_at timestamptz, minutes int)
language plpgsql security definer set search_path = public as $$
declare
  r        record;
  v_anchor geography := null;
  v_start  timestamptz;
  v_end    timestamptz;
begin
  for r in
    select t.recorded_at, t.location from (
      select et.recorded_at, et.location
      from employee_track et
      where et.employee_id = p_employee_id
        and et.recorded_at >= p_from and et.recorded_at < p_to
      union all
      select ll.recorded_at, ll.location
      from location_logs ll
      join time_entries te on te.id = ll.time_entry_id
      where te.employee_id = p_employee_id
        and ll.recorded_at >= p_from and ll.recorded_at < p_to
    ) t
    order by t.recorded_at
  loop
    if v_anchor is null then
      v_anchor := r.location; v_start := r.recorded_at; v_end := r.recorded_at;
    elsif ST_Distance(r.location, v_anchor) <= 120
          and r.recorded_at - v_end <= p_max_gap then
      v_end := r.recorded_at;
    else
      if v_end - v_start >= interval '4 minutes' then
        center := v_anchor::geometry; started_at := v_start; ended_at := v_end;
        minutes := ceil(extract(epoch from (v_end - v_start)) / 60)::int;
        return next;
      end if;
      v_anchor := r.location; v_start := r.recorded_at; v_end := r.recorded_at;
    end if;
  end loop;

  if v_anchor is not null and v_end - v_start >= interval '4 minutes' then
    center := v_anchor::geometry; started_at := v_start; ended_at := v_end;
    minutes := ceil(extract(epoch from (v_end - v_start)) / 60)::int;
    return next;
  end if;
end $$;

-- Heiti staðar/verkefnis fyrir punkt (skráður staður hefur forgang)
create or replace function app.locate_point(p_tenant uuid, p_point geography)
returns table(kind text, name text)
language sql stable security definer set search_path = public as $$
  select * from (
    select 'place'::text as kind, pl.name
    from places pl
    where pl.tenant_id = p_tenant and pl.active
      and ST_DWithin(p_point, pl.center, pl.radius_m)
    order by ST_Distance(p_point, pl.center)
    limit 1
  ) a
  union all
  select * from (
    select 'project'::text, p.name
    from project_locations loc
    join projects p on p.id = loc.project_id and p.status = 'active'
    where loc.tenant_id = p_tenant
      and ST_DWithin(p_point, loc.center, loc.radius_m)
    order by ST_Distance(p_point, loc.center)
    limit 1
  ) b
  limit 1
$$;

-- --- 2) employee_day_track með staðaheitum ------------------------------------

create or replace function app.employee_day_track(p_employee_id uuid, p_date date)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_from   timestamptz := (p_date::timestamp at time zone 'Atlantic/Reykjavik');
  v_to     timestamptz := ((p_date + 1)::timestamp at time zone 'Atlantic/Reykjavik');
  r        record;
  v_loc    record;
  v_points jsonb := '[]'::jsonb;
  v_stops  jsonb := '[]'::jsonb;
begin
  if not app.has_role('admin') and not app.has_role('project_manager') then
    raise exception 'FORBIDDEN';
  end if;
  if not exists (select 1 from employees where id = p_employee_id and tenant_id = v_tenant) then
    raise exception 'NOT_FOUND: Starfsmaður fannst ekki';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'lat', ST_Y(t.location::geometry), 'lng', ST_X(t.location::geometry),
    't', t.recorded_at) order by t.recorded_at), '[]'::jsonb)
  into v_points
  from (
    select et.recorded_at, et.location from employee_track et
    where et.employee_id = p_employee_id
      and et.recorded_at >= v_from and et.recorded_at < v_to
    union all
    select ll.recorded_at, ll.location from location_logs ll
    join time_entries te on te.id = ll.time_entry_id
    where te.employee_id = p_employee_id
      and ll.recorded_at >= v_from and ll.recorded_at < v_to
  ) t;

  for r in
    select * from app.employee_stops(p_employee_id, v_from, v_to, interval '3 hours')
  loop
    select * into v_loc from app.locate_point(v_tenant, r.center::geography);
    v_stops := v_stops || jsonb_build_object(
      'lat', ST_Y(r.center), 'lng', ST_X(r.center),
      'from', r.started_at, 'to', r.ended_at, 'minutes', r.minutes,
      'place_kind', v_loc.kind, 'place_name', v_loc.name);
  end loop;

  return jsonb_build_object('points', v_points, 'stops', v_stops);
end $$;

-- --- 3) Ferðaskýrsla ----------------------------------------------------------

create or replace function app.track_report(p_from date, p_to date)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_from   timestamptz := (p_from::timestamp at time zone 'Atlantic/Reykjavik');
  v_to     timestamptz := ((p_to + 1)::timestamp at time zone 'Atlantic/Reykjavik');
  v_emp    record;
  v_stop   record;
  v_loc    record;
  v_out    jsonb := '[]'::jsonb;
  v_places jsonb;
  v_proj_min int; v_proj_n int;
  v_unk_min int; v_unk_n int;
  v_tot_min int; v_tot_n int;
begin
  if not app.has_role('admin') and not app.has_role('project_manager') then
    raise exception 'FORBIDDEN';
  end if;

  for v_emp in
    select e.id, e.full_name, e.photo_path from employees e
    where e.tenant_id = v_tenant and e.status = 'active'
    order by e.full_name
  loop
    v_places := '{}'::jsonb;
    v_proj_min := 0; v_proj_n := 0; v_unk_min := 0; v_unk_n := 0;
    v_tot_min := 0; v_tot_n := 0;

    for v_stop in
      select * from app.employee_stops(v_emp.id, v_from, v_to)
    loop
      v_tot_min := v_tot_min + v_stop.minutes;
      v_tot_n := v_tot_n + 1;
      select * into v_loc from app.locate_point(v_tenant, v_stop.center::geography);
      if v_loc.kind = 'place' then
        v_places := jsonb_set(v_places, array[v_loc.name], jsonb_build_object(
          'visits', coalesce((v_places -> v_loc.name ->> 'visits')::int, 0) + 1,
          'minutes', coalesce((v_places -> v_loc.name ->> 'minutes')::int, 0) + v_stop.minutes
        ));
      elsif v_loc.kind = 'project' then
        v_proj_min := v_proj_min + v_stop.minutes;
        v_proj_n := v_proj_n + 1;
      else
        v_unk_min := v_unk_min + v_stop.minutes;
        v_unk_n := v_unk_n + 1;
      end if;
    end loop;

    if v_tot_n > 0 then
      v_out := v_out || jsonb_build_object(
        'employee_id', v_emp.id, 'full_name', v_emp.full_name,
        'photo_path', v_emp.photo_path,
        'stops_total', v_tot_n, 'minutes_total', v_tot_min,
        'project_stops', v_proj_n, 'project_minutes', v_proj_min,
        'unknown_stops', v_unk_n, 'unknown_minutes', v_unk_min,
        'places', v_places);
    end if;
  end loop;

  return v_out;
end $$;

create or replace function public.track_report(p_from date, p_to date)
returns jsonb language sql security definer set search_path = public as $$
  select app.track_report(p_from, p_to)
$$;

grant execute on all functions in schema app to anon, authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;
notify pgrst, 'reload schema';
