-- =============================================================================
-- 0040_employee_track.sql — Ferðasaga starfsmanna
-- Viðveru-púlsar (á vinnutíma, ekki veikir/í fríi) safnast nú líka í feril
-- (employee_track) svo stjórnendur geti séð ferðir dagsins og hve lengi
-- starfsmaður var á hverjum stað. Punktar meðan innskráður á verk koma úr
-- location_logs — hvort tveggja sameinað í employee_day_track().
-- =============================================================================

create table if not exists employee_track (
  id          bigserial primary key,
  tenant_id   uuid not null references companies(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  recorded_at timestamptz not null default now(),
  location    geography(point, 4326) not null,
  accuracy_m  numeric
);
create index if not exists employee_track_emp_idx on employee_track (employee_id, recorded_at desc);
alter table employee_track enable row level security;  -- aðeins definer-föll

-- presence_ping: geyma síðustu stöðu OG bæta í ferilinn
create or replace function app.presence_ping(
  p_lat double precision, p_lng double precision, p_accuracy numeric default null
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_emp employees;
  v_point geography := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography;
begin
  select * into v_emp from employees
   where user_id = app.current_user_id()
     and tenant_id = app.current_tenant_id()
     and status = 'active';
  if v_emp is null then return false; end if;

  if not app.tracking_allowed() or app.employee_absent_today(v_emp.id) then
    delete from employee_presence where employee_id = v_emp.id;
    return false;
  end if;

  insert into employee_presence (employee_id, tenant_id, location, accuracy_m, recorded_at)
  values (v_emp.id, v_emp.tenant_id, v_point, p_accuracy, now())
  on conflict (employee_id) do update
    set location = excluded.location, accuracy_m = excluded.accuracy_m,
        recorded_at = excluded.recorded_at;

  insert into employee_track (tenant_id, employee_id, location, accuracy_m)
  values (v_emp.tenant_id, v_emp.id, v_point, p_accuracy);
  return true;
end $$;

-- Ferðir dagsins: allir punktar + "stopp" (samfelld viðvera innan ~120 m,
-- a.m.k. 4 mín) með tímalengd á hverjum stað.
create or replace function app.employee_day_track(p_employee_id uuid, p_date date)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_from   timestamptz := (p_date::timestamp at time zone 'Atlantic/Reykjavik');
  v_to     timestamptz := ((p_date + 1)::timestamp at time zone 'Atlantic/Reykjavik');
  r        record;
  v_points jsonb := '[]'::jsonb;
  v_stops  jsonb := '[]'::jsonb;
  v_anchor geography := null;
  v_start  timestamptz;
  v_end    timestamptz;
  v_n      int := 0;
begin
  if not app.has_role('admin') and not app.has_role('project_manager') then
    raise exception 'FORBIDDEN';
  end if;
  if not exists (select 1 from employees where id = p_employee_id and tenant_id = v_tenant) then
    raise exception 'NOT_FOUND: Starfsmaður fannst ekki';
  end if;

  for r in
    select t.recorded_at, t.location from (
      select et.recorded_at, et.location
      from employee_track et
      where et.employee_id = p_employee_id
        and et.recorded_at >= v_from and et.recorded_at < v_to
      union all
      select ll.recorded_at, ll.location
      from location_logs ll
      join time_entries te on te.id = ll.time_entry_id
      where te.employee_id = p_employee_id
        and ll.recorded_at >= v_from and ll.recorded_at < v_to
    ) t
    order by t.recorded_at
  loop
    v_points := v_points || jsonb_build_object(
      'lat', ST_Y(r.location::geometry), 'lng', ST_X(r.location::geometry),
      't', r.recorded_at);

    if v_anchor is null then
      v_anchor := r.location; v_start := r.recorded_at; v_end := r.recorded_at; v_n := 1;
    elsif ST_Distance(r.location, v_anchor) <= 120 then
      v_end := r.recorded_at; v_n := v_n + 1;
    else
      if v_end - v_start >= interval '4 minutes' then
        v_stops := v_stops || jsonb_build_object(
          'lat', ST_Y(v_anchor::geometry), 'lng', ST_X(v_anchor::geometry),
          'from', v_start, 'to', v_end,
          'minutes', ceil(extract(epoch from (v_end - v_start)) / 60));
      end if;
      v_anchor := r.location; v_start := r.recorded_at; v_end := r.recorded_at; v_n := 1;
    end if;
  end loop;

  if v_anchor is not null and v_end - v_start >= interval '4 minutes' then
    v_stops := v_stops || jsonb_build_object(
      'lat', ST_Y(v_anchor::geometry), 'lng', ST_X(v_anchor::geometry),
      'from', v_start, 'to', v_end,
      'minutes', ceil(extract(epoch from (v_end - v_start)) / 60));
  end if;

  return jsonb_build_object('points', v_points, 'stops', v_stops);
end $$;

create or replace function public.employee_day_track(p_employee_id uuid, p_date date)
returns jsonb language sql security definer set search_path = public as $$
  select app.employee_day_track(p_employee_id, p_date)
$$;

grant execute on all functions in schema app to anon, authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;
notify pgrst, 'reload schema';
