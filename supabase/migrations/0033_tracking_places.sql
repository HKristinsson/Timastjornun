-- =============================================================================
-- 0033_tracking_places.sql — Staðsetning starfsmanna á korti + staðir
-- 1) Tímagluggi per félag: staðsetning starfsmanna aðeins sýnileg innan
--    stillts tíma (t.d. 08:00–16:00 virka daga; helgar valkvæðar).
-- 2) employee_locations: síðasta staðsetning virkra starfsmanna (stjórnendur).
-- 3) places: staðir félagsins (t.d. verslun) + place_visits: hve oft og lengi
--    starfsmaður hefur verið á staðnum (reiknað úr location_logs).
-- =============================================================================

-- --- Staðir -------------------------------------------------------------------

create table if not exists places (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references companies(id) on delete cascade,
  name       text not null,
  address    text,
  center     geography(point, 4326) not null,
  radius_m   integer not null default 100,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists places_tenant_idx on places (tenant_id) where active;
create index if not exists places_center_gix on places using gist (center);

alter table places enable row level security;
drop policy if exists places_select on places;
create policy places_select on places for select
  using (tenant_id = app.current_tenant_id());
grant select on places to authenticated;

create or replace view v_places with (security_invoker = on) as
select id, name, address, radius_m, active, created_at,
       ST_Y(center::geometry) as lat, ST_X(center::geometry) as lng
from places;

create or replace function app.place_create(
  p_name text, p_address text, p_lat double precision, p_lng double precision,
  p_radius_m integer default 100
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not app.has_role('admin') and not app.has_role('project_manager') then
    raise exception 'FORBIDDEN';
  end if;
  insert into places (tenant_id, name, address, center, radius_m)
  values (app.current_tenant_id(), trim(p_name), nullif(trim(coalesce(p_address,'')),''),
          ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
          coalesce(p_radius_m, 100))
  returning id into v_id;
  return v_id;
end $$;

create or replace function app.place_update(
  p_id uuid, p_name text default null, p_address text default null,
  p_lat double precision default null, p_lng double precision default null,
  p_radius_m integer default null, p_active boolean default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not app.has_role('admin') and not app.has_role('project_manager') then
    raise exception 'FORBIDDEN';
  end if;
  update places set
    name     = coalesce(nullif(trim(coalesce(p_name,'')),''), name),
    address  = coalesce(p_address, address),
    center   = case when p_lat is not null and p_lng is not null
                 then ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
                 else center end,
    radius_m = coalesce(p_radius_m, radius_m),
    active   = coalesce(p_active, active)
  where id = p_id and tenant_id = app.current_tenant_id();
end $$;

create or replace function app.place_delete(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not app.has_role('admin') and not app.has_role('project_manager') then
    raise exception 'FORBIDDEN';
  end if;
  delete from places where id = p_id and tenant_id = app.current_tenant_id();
end $$;

-- --- Tímagluggi vöktunar ------------------------------------------------------
-- Stillingar (company-scope): tracking_start_min (sjálfg. 480 = 08:00),
-- tracking_end_min (960 = 16:00), tracking_weekends (0/1).

create or replace function app.tracking_allowed()
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  v_tenant   uuid := app.current_tenant_id();
  v_now      timestamp := (now() at time zone 'Atlantic/Reykjavik');
  v_minutes  int := extract(hour from v_now)::int * 60 + extract(minute from v_now)::int;
  v_dow      int := extract(isodow from v_now)::int;  -- 1=mán … 7=sun
  v_start    int := app.get_setting_int(v_tenant, null, 'tracking_start_min', 480);
  v_end      int := app.get_setting_int(v_tenant, null, 'tracking_end_min', 960);
  v_weekends boolean := app.get_setting_int(v_tenant, null, 'tracking_weekends', 0) = 1;
begin
  if v_dow in (6, 7) and not v_weekends then
    return false;
  end if;
  return v_minutes >= v_start and v_minutes < v_end;
end $$;

-- --- Staðsetning virkra starfsmanna (stjórnendur, aðeins innan tímaglugga) ----

create or replace function app.employee_locations()
returns table(
  employee_id uuid, full_name text,
  project_no text, project_name text,
  lat double precision, lng double precision,
  recorded_at timestamptz, inside_geofence boolean, minutes_ago int
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
    select e.id, e.full_name, p.project_no, p.name,
           ST_Y(ll.location::geometry), ST_X(ll.location::geometry),
           ll.recorded_at, ll.inside_geofence,
           (extract(epoch from (now() - ll.recorded_at)) / 60)::int
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
    order by ll.recorded_at desc;
end $$;

-- --- Heimsóknir á stað --------------------------------------------------------
-- Samfelldar mælingar innan staðar teljast ein heimsókn; >20 mín gat = ný.

create or replace function app.place_visits(
  p_place_id uuid, p_from timestamptz, p_to timestamptz
) returns table(
  employee_id uuid, full_name text,
  visits int, total_minutes int, last_visit timestamptz
)
language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_place  places;
begin
  if not app.has_role('admin') and not app.has_role('project_manager') then
    raise exception 'FORBIDDEN';
  end if;
  select * into v_place from places
   where id = p_place_id and tenant_id = v_tenant;
  if v_place is null then
    raise exception 'NOT_FOUND: Staður fannst ekki';
  end if;

  return query
  with pts as (
    select te.employee_id as emp, ll.recorded_at
    from location_logs ll
    join time_entries te on te.id = ll.time_entry_id
    where ll.tenant_id = v_tenant
      and ll.recorded_at >= p_from and ll.recorded_at < p_to
      and ST_DWithin(ll.location, v_place.center, v_place.radius_m)
  ),
  marked as (
    select emp, recorded_at,
      case when lag(recorded_at) over w is null
             or recorded_at - lag(recorded_at) over w > interval '20 minutes'
        then 1 else 0 end as new_visit
    from pts
    window w as (partition by emp order by recorded_at)
  ),
  grouped as (
    select emp, recorded_at,
      sum(new_visit) over (partition by emp order by recorded_at) as visit_no
    from marked
  ),
  per_visit as (
    select emp, visit_no,
           min(recorded_at) as v_start, max(recorded_at) as v_end
    from grouped group by emp, visit_no
  )
  select pv.emp, e.full_name,
         count(*)::int,
         sum(greatest(1, ceil(extract(epoch from (pv.v_end - pv.v_start)) / 60)))::int,
         max(pv.v_end)
  from per_visit pv
  join employees e on e.id = pv.emp
  group by pv.emp, e.full_name
  order by 3 desc, 4 desc;
end $$;

-- --- Public-vörpur ------------------------------------------------------------

create or replace function public.place_create(
  p_name text, p_address text, p_lat double precision, p_lng double precision,
  p_radius_m integer default 100
) returns uuid language sql security definer set search_path = public as $$
  select app.place_create(p_name, p_address, p_lat, p_lng, p_radius_m)
$$;

create or replace function public.place_update(
  p_id uuid, p_name text default null, p_address text default null,
  p_lat double precision default null, p_lng double precision default null,
  p_radius_m integer default null, p_active boolean default null
) returns void language sql security definer set search_path = public as $$
  select app.place_update(p_id, p_name, p_address, p_lat, p_lng, p_radius_m, p_active)
$$;

create or replace function public.place_delete(p_id uuid)
returns void language sql security definer set search_path = public as $$
  select app.place_delete(p_id)
$$;

create or replace function public.employee_locations()
returns table(
  employee_id uuid, full_name text,
  project_no text, project_name text,
  lat double precision, lng double precision,
  recorded_at timestamptz, inside_geofence boolean, minutes_ago int
) language sql security definer set search_path = public as $$
  select * from app.employee_locations()
$$;

create or replace function public.place_visits(
  p_place_id uuid, p_from timestamptz, p_to timestamptz
) returns table(
  employee_id uuid, full_name text,
  visits int, total_minutes int, last_visit timestamptz
) language sql security definer set search_path = public as $$
  select * from app.place_visits(p_place_id, p_from, p_to)
$$;

grant execute on all functions in schema app to anon, authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;
notify pgrst, 'reload schema';
