-- =============================================================================
-- 0038_absence_review_employees.sql
-- 1) Fjarvera (veikindi/frí) fær samþykktarferli: ný skráning bíður samþykktar
--    stjórnanda (eldri skráningar teljast samþykktar).
-- 2) employee_list_admin: starfsmannalisti með admin-stöðu fyrir appið.
-- =============================================================================

-- --- 1) Samþykkt fjarveru -----------------------------------------------------

alter table absences add column if not exists status text not null default 'approved'
  check (status in ('pending', 'approved', 'rejected'));
alter table absences alter column status set default 'pending';

create or replace function app.absence_review(p_id uuid, p_decision text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not app.has_role('admin') and not app.has_role('project_manager') then
    raise exception 'FORBIDDEN';
  end if;
  if p_decision not in ('approved', 'rejected') then
    raise exception 'BAD_DECISION';
  end if;
  update absences set status = p_decision
   where id = p_id and tenant_id = app.current_tenant_id();
  perform app.write_audit(app.current_tenant_id(), app.current_user_id(),
    p_decision, 'absence', p_id, null);
end $$;

create or replace function public.absence_review(p_id uuid, p_decision text)
returns void language sql security definer set search_path = public as $$
  select app.absence_review(p_id, p_decision)
$$;

create or replace view v_my_absences with (security_invoker = on) as
select a.id, a.type, a.date_from, a.date_to, a.note, a.created_at, a.status
from absences a
join employees e on e.id = a.employee_id
where e.user_id = app.current_user_id()
order by a.date_from desc;

create or replace view v_tenant_absences with (security_invoker = on) as
select a.id, a.type, a.date_from, a.date_to, a.note, a.created_at,
       e.full_name as employee_name, e.employee_no, a.status
from absences a
join employees e on e.id = a.employee_id
order by a.date_from desc;

-- admin_overview: bætir við 'pending_absences' (öll óafgreidd, óháð dagsetningu)
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
        'date_from', a.date_from, 'date_to', a.date_to, 'note', a.note,
        'status', a.status
      ) order by e.full_name)
      from absences a join employees e on e.id = a.employee_id
      where a.tenant_id = v_tenant and a.type = 'sick' and a.status <> 'rejected'
        and current_date between a.date_from and a.date_to
    ), '[]'::jsonb),
    'vacation', coalesce((
      select jsonb_agg(jsonb_build_object(
        'employee_id', e.id, 'full_name', e.full_name, 'photo_path', e.photo_path,
        'date_from', a.date_from, 'date_to', a.date_to, 'note', a.note,
        'status', a.status
      ) order by e.full_name)
      from absences a join employees e on e.id = a.employee_id
      where a.tenant_id = v_tenant and a.type = 'vacation' and a.status <> 'rejected'
        and current_date between a.date_from and a.date_to
    ), '[]'::jsonb),
    'pending_absences', coalesce((
      select jsonb_agg(jsonb_build_object(
        'absence_id', a.id, 'kind', a.type,
        'employee_id', e.id, 'full_name', e.full_name, 'photo_path', e.photo_path,
        'date_from', a.date_from, 'date_to', a.date_to, 'note', a.note
      ) order by a.created_at)
      from absences a join employees e on e.id = a.employee_id
      where a.tenant_id = v_tenant and a.status = 'pending'
    ), '[]'::jsonb)
  ) into v_out;

  return v_out;
end $$;

-- --- 2) Starfsmannalisti með admin-stöðu (fyrir appið) ------------------------

create or replace function app.employee_list_admin()
returns table(
  employee_id uuid, full_name text, email text, photo_path text,
  status text, has_login boolean, is_admin boolean
)
language plpgsql security definer set search_path = public as $$
declare v_tenant uuid := app.current_tenant_id();
begin
  if not app.has_role('admin') and not app.has_role('project_manager') then
    raise exception 'FORBIDDEN';
  end if;
  return query
    select e.id, e.full_name, e.email::text, e.photo_path, e.status,
           e.user_id is not null,
           exists (
             select 1 from user_roles ur join roles r on r.id = ur.role_id
             where ur.user_id = e.user_id and r.name = 'admin'
           )
    from employees e
    where e.tenant_id = v_tenant
    order by e.full_name;
end $$;

create or replace function public.employee_list_admin()
returns table(
  employee_id uuid, full_name text, email text, photo_path text,
  status text, has_login boolean, is_admin boolean
) language sql security definer set search_path = public as $$
  select * from app.employee_list_admin()
$$;

grant execute on all functions in schema app to anon, authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;
notify pgrst, 'reload schema';
