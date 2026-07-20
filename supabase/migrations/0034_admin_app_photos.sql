-- =============================================================================
-- 0034_admin_app_photos.sql — Stjórnendayfirlit í appi + starfsmannamyndir
-- 1) Fjarvera fær tegund: veikindi EÐA sumarfrí (absence_register m/p_kind).
-- 2) employees.photo_path + Storage-fata employee-photos (félagsbundinn aðgangur).
-- 3) admin_overview(): innskráðir + veikir + í fríi í dag, með myndaslóðum.
-- 4) employee_locations() skilar nú einnig photo_path (fyrir kortaskjái).
-- =============================================================================

-- --- 1) Fjarverutegundir ------------------------------------------------------

alter table absences drop constraint if exists absences_type_check;
alter table absences add constraint absences_type_check
  check (type in ('sick', 'vacation'));

drop function if exists public.absence_register(date, date, text);
drop function if exists app.absence_register(date, date, text);

create or replace function app.absence_register(
  p_from date default null, p_to date default null, p_note text default null,
  p_kind text default 'sick'
) returns absences
language plpgsql security definer set search_path = public as $$
declare
  v_emp employees;
  v_from date := coalesce(p_from, current_date);
  v_to   date := coalesce(p_to, coalesce(p_from, current_date));
  v_kind text := case when p_kind = 'vacation' then 'vacation' else 'sick' end;
  v_row  absences;
begin
  select * into v_emp from employees
   where user_id = app.current_user_id()
     and tenant_id = app.current_tenant_id()
     and status = 'active';
  if v_emp is null then
    raise exception 'EMP_NOT_FOUND: Enginn virkur starfsmaður tengdur notanda';
  end if;
  if v_to < v_from then
    raise exception 'BAD_RANGE: Lokadagur er á undan upphafsdegi';
  end if;

  insert into absences (tenant_id, employee_id, type, date_from, date_to, note)
  values (v_emp.tenant_id, v_emp.id, v_kind, v_from, v_to, p_note)
  returning * into v_row;

  perform app.write_audit(v_emp.tenant_id, app.current_user_id(), 'create',
    'absence', v_row.id, jsonb_build_object('from', v_from, 'to', v_to, 'kind', v_kind));
  return v_row;
end $$;

create or replace function public.absence_register(
  p_from date default null, p_to date default null, p_note text default null,
  p_kind text default 'sick'
) returns public.absences language sql security definer set search_path = public as $$
  select app.absence_register(p_from, p_to, p_note, p_kind)
$$;

-- --- 2) Starfsmannamyndir -----------------------------------------------------

alter table employees add column if not exists photo_path text;

insert into storage.buckets (id, name, public, file_size_limit)
values ('employee-photos', 'employee-photos', false, 5242880)
on conflict (id) do nothing;

-- Allir í félaginu mega SKOÐA myndir félagsins (slóð: <tenant_id>/<employee_id>.jpg)
drop policy if exists emp_photos_select on storage.objects;
create policy emp_photos_select on storage.objects for select to authenticated
  using (
    bucket_id = 'employee-photos'
    and (storage.foldername(name))[1] = app.current_tenant_id()::text
  );

-- Aðeins stjórnendur mega hlaða upp / breyta / eyða
drop policy if exists emp_photos_insert on storage.objects;
create policy emp_photos_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'employee-photos'
    and (storage.foldername(name))[1] = app.current_tenant_id()::text
    and (app.has_role('admin') or app.has_role('project_manager'))
  );

drop policy if exists emp_photos_update on storage.objects;
create policy emp_photos_update on storage.objects for update to authenticated
  using (
    bucket_id = 'employee-photos'
    and (storage.foldername(name))[1] = app.current_tenant_id()::text
    and (app.has_role('admin') or app.has_role('project_manager'))
  );

drop policy if exists emp_photos_delete on storage.objects;
create policy emp_photos_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'employee-photos'
    and (storage.foldername(name))[1] = app.current_tenant_id()::text
    and (app.has_role('admin') or app.has_role('project_manager'))
  );

create or replace function app.employee_set_photo(p_employee_id uuid, p_path text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not app.has_role('admin') and not app.has_role('project_manager') then
    raise exception 'FORBIDDEN';
  end if;
  update employees set photo_path = nullif(trim(coalesce(p_path,'')),'')
   where id = p_employee_id and tenant_id = app.current_tenant_id();
end $$;

create or replace function public.employee_set_photo(p_employee_id uuid, p_path text)
returns void language sql security definer set search_path = public as $$
  select app.employee_set_photo(p_employee_id, p_path)
$$;

-- Tenant-id núverandi notanda (fyrir slóðasmíði við upphlaðningu mynda)
create or replace function public.my_tenant_id()
returns uuid language sql stable security definer set search_path = public as $$
  select app.current_tenant_id()
$$;

-- --- 3) Stjórnendayfirlit fyrir appið -----------------------------------------

create or replace function app.admin_overview()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_out jsonb;
begin
  if not app.has_role('admin') and not app.has_role('project_manager') then
    raise exception 'FORBIDDEN';
  end if;

  select jsonb_build_object(
    'checked_in', coalesce((
      select jsonb_agg(jsonb_build_object(
        'employee_id', e.id, 'full_name', e.full_name, 'photo_path', e.photo_path,
        'project_no', p.project_no, 'project_name', p.name,
        'task_no', pt.task_no, 'task_name', pt.name,
        'check_in_at', te.check_in_at
      ) order by te.check_in_at)
      from time_entries te
      join employees e on e.id = te.employee_id
      join projects p on p.id = te.project_id
      left join project_tasks pt on pt.id = te.task_id
      where te.tenant_id = v_tenant and te.check_out_at is null
    ), '[]'::jsonb),
    'sick', coalesce((
      select jsonb_agg(jsonb_build_object(
        'employee_id', e.id, 'full_name', e.full_name, 'photo_path', e.photo_path,
        'date_from', a.date_from, 'date_to', a.date_to, 'note', a.note
      ) order by e.full_name)
      from absences a join employees e on e.id = a.employee_id
      where a.tenant_id = v_tenant and a.type = 'sick'
        and current_date between a.date_from and a.date_to
    ), '[]'::jsonb),
    'vacation', coalesce((
      select jsonb_agg(jsonb_build_object(
        'employee_id', e.id, 'full_name', e.full_name, 'photo_path', e.photo_path,
        'date_from', a.date_from, 'date_to', a.date_to, 'note', a.note
      ) order by e.full_name)
      from absences a join employees e on e.id = a.employee_id
      where a.tenant_id = v_tenant and a.type = 'vacation'
        and current_date between a.date_from and a.date_to
    ), '[]'::jsonb)
  ) into v_out;

  return v_out;
end $$;

create or replace function public.admin_overview()
returns jsonb language sql security definer set search_path = public as $$
  select app.admin_overview()
$$;

-- --- 4) employee_locations með mynd -------------------------------------------

drop function if exists public.employee_locations();
drop function if exists app.employee_locations();

create or replace function app.employee_locations()
returns table(
  employee_id uuid, full_name text, photo_path text,
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
    select e.id, e.full_name, e.photo_path, p.project_no, p.name,
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

create or replace function public.employee_locations()
returns table(
  employee_id uuid, full_name text, photo_path text,
  project_no text, project_name text,
  lat double precision, lng double precision,
  recorded_at timestamptz, inside_geofence boolean, minutes_ago int
) language sql security definer set search_path = public as $$
  select * from app.employee_locations()
$$;

grant execute on all functions in schema app to anon, authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;
notify pgrst, 'reload schema';
