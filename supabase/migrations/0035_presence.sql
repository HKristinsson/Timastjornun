-- =============================================================================
-- 0035_presence.sql — Staðsetning starfsmanna ÓHÁÐ verk-innskráningu
-- Appið sendir viðveru-staðsetningu á vinnutíma. Bakendinn geymir AÐEINS
-- innan tímaglugga félagsins (sami gluggi og kortið) og aðeins SÍÐUSTU
-- staðsetningu hvers starfsmanns — engin ferilsaga utan tímaskráningar (GDPR).
-- =============================================================================

create table if not exists employee_presence (
  employee_id uuid primary key references employees(id) on delete cascade,
  tenant_id   uuid not null references companies(id) on delete cascade,
  location    geography(point, 4326) not null,
  accuracy_m  numeric,
  recorded_at timestamptz not null default now()
);
create index if not exists employee_presence_tenant_idx on employee_presence (tenant_id);
alter table employee_presence enable row level security;  -- aðeins definer-föll

-- Appið sendir púls: geymt aðeins innan tímaglugga félagsins
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

  if not app.tracking_allowed() then
    -- Utan glugga: geymum ekkert og hreinsum síðustu stöðu
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

create or replace function public.presence_ping(
  p_lat double precision, p_lng double precision, p_accuracy numeric default null
) returns boolean language sql security definer set search_path = public as $$
  select app.presence_ping(p_lat, p_lng, p_accuracy)
$$;

-- --- employee_locations: innskráðir Á VERK + aðrir í vinnu (viðvera) ----------

drop function if exists public.employee_locations();
drop function if exists app.employee_locations();

create or replace function app.employee_locations()
returns table(
  employee_id uuid, full_name text, photo_path text,
  project_no text, project_name text,
  lat double precision, lng double precision,
  recorded_at timestamptz, inside_geofence boolean, minutes_ago int,
  source text  -- 'checked_in' | 'presence'
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
    -- Innskráðir á verk: síðasti punktur virku skráningarinnar
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
    union all
    -- Aðrir í vinnu (viðveru-púls, ekki innskráðir á verk) — nýlegir punktar
    select e.id, e.full_name, e.photo_path, null::text, null::text,
           ST_Y(pr.location::geometry), ST_X(pr.location::geometry),
           pr.recorded_at, null::boolean,
           (extract(epoch from (now() - pr.recorded_at)) / 60)::int,
           'presence'::text
    from employee_presence pr
    join employees e on e.id = pr.employee_id and e.status = 'active'
    where pr.tenant_id = v_tenant
      and pr.recorded_at > now() - interval '3 hours'
      and not exists (
        select 1 from time_entries te2
        where te2.employee_id = pr.employee_id and te2.check_out_at is null
      )
    order by 8 desc;
end $$;

create or replace function public.employee_locations()
returns table(
  employee_id uuid, full_name text, photo_path text,
  project_no text, project_name text,
  lat double precision, lng double precision,
  recorded_at timestamptz, inside_geofence boolean, minutes_ago int,
  source text
) language sql security definer set search_path = public as $$
  select * from app.employee_locations()
$$;

grant execute on all functions in schema app to anon, authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;
notify pgrst, 'reload schema';
