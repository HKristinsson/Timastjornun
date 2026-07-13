-- =============================================================================
-- 0023_absences_company_lifecycle.sql — Veikindaskráning + eyða/óvirkja félög
-- =============================================================================

-- (a) VEIKINDI: starfsmaður skráir sig veikan í appinu
create table if not exists absences (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references companies(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  type        text not null default 'sick' check (type in ('sick')),
  date_from   date not null,
  date_to     date not null,
  note        text,
  created_at  timestamptz not null default now(),
  constraint absences_range_chk check (date_to >= date_from)
);
create index if not exists absences_tenant_idx on absences (tenant_id, date_from desc);
create index if not exists absences_emp_idx on absences (employee_id, date_from desc);

alter table absences enable row level security;
create policy absences_select on absences for select
  using (
    tenant_id = app.current_tenant_id()
    and (
      app.has_role('admin') or app.has_role('project_manager') or app.has_role('payroll')
      or employee_id in (select id from employees where user_id = app.current_user_id())
    )
  );

-- Starfsmaður skráir veikindi (sín eigin)
create or replace function app.absence_register(
  p_from date default null, p_to date default null, p_note text default null
) returns absences
language plpgsql security definer set search_path = public as $$
declare
  v_emp employees;
  v_from date := coalesce(p_from, current_date);
  v_to   date := coalesce(p_to, coalesce(p_from, current_date));
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
  values (v_emp.tenant_id, v_emp.id, 'sick', v_from, v_to, p_note)
  returning * into v_row;

  perform app.write_audit(v_emp.tenant_id, app.current_user_id(), 'create',
    'absence', v_row.id, jsonb_build_object('from', v_from, 'to', v_to));
  return v_row;
end $$;

create or replace function public.absence_register(
  p_from date default null, p_to date default null, p_note text default null
) returns public.absences language sql security definer set search_path = public as $$
  select app.absence_register(p_from, p_to, p_note)
$$;

-- Mín veikindi (starfsmaður)
create or replace view v_my_absences with (security_invoker = on) as
select a.id, a.type, a.date_from, a.date_to, a.note, a.created_at
from absences a
join employees e on e.id = a.employee_id
where e.user_id = app.current_user_id()
order by a.date_from desc;

-- Veikindi félags með nöfnum (stjórnendur sjá allt gegnum RLS)
create or replace view v_tenant_absences with (security_invoker = on) as
select a.id, a.type, a.date_from, a.date_to, a.note, a.created_at,
       e.full_name as employee_name, e.employee_no
from absences a
join employees e on e.id = a.employee_id
order by a.date_from desc;

-- (b) ÓVIRKT FÉLAG = notendur þess komast ekki inn (RLS sér tómt).
--     Super admin má áfram vinna sem félagið (til skoðunar/lagfæringa).
create or replace function app.current_tenant_id()
returns uuid language sql stable security definer set search_path = public as $$
  select case
    when u.acting_tenant_id is not null and exists (
      select 1 from user_roles ur join roles r on r.id = ur.role_id
      where ur.user_id = u.id and r.name = 'super_admin'
    ) then u.acting_tenant_id
    else (select c.id from companies c
           where c.id = u.tenant_id and c.status = 'active')
  end
  from public.users u
  where u.auth_user_id = auth.uid()
  limit 1
$$;

-- (c) EYÐA FÉLAGI (super admin) — fjarlægir líka innskráningar notenda þess
create or replace function app.su_delete_company(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if not app.has_role('super_admin') then raise exception 'FORBIDDEN'; end if;
  if exists (select 1 from users
              where auth_user_id = auth.uid() and tenant_id = p_id) then
    raise exception 'OWN_COMPANY: Ekki hægt að eyða eigin félagi';
  end if;
  if not exists (select 1 from companies where id = p_id) then
    raise exception 'NOT_FOUND';
  end if;

  -- hreinsa acting-bendingar á félagið
  update users set acting_tenant_id = null where acting_tenant_id = p_id;

  -- eyða auth-innskráningum notenda félagsins
  for r in select auth_user_id from users
            where tenant_id = p_id and auth_user_id is not null
  loop
    delete from auth.identities where user_id = r.auth_user_id;
    delete from auth.users where id = r.auth_user_id;
  end loop;

  -- félagið sjálft — FK cascade eyðir users/employees/projects/time_entries/pósti o.fl.
  delete from companies where id = p_id;
end $$;

create or replace function public.su_delete_company(p_id uuid)
returns void language sql security definer set search_path = public as $$
  select app.su_delete_company(p_id)
$$;

grant select, insert, update, delete on absences to anon, authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;
grant execute on all functions in schema app to anon, authenticated, service_role;

notify pgrst, 'reload schema';
