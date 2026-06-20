-- =============================================================================
-- 0008_fix_pgcrypto.sql — Lagar search_path fyrir pgcrypto (kennitala dulkóðun)
-- Á Supabase er pgcrypto í `extensions`-skema, ekki `public`. Því þarf
-- create_employee að hafa `extensions` í search_path til að finna pgp_sym_encrypt.
-- =============================================================================
create or replace function app.create_employee(
  p_full_name   text,
  p_employee_no text,
  p_phone       text,
  p_email       text,
  p_national_id text
) returns employees
language plpgsql security definer set search_path = public, extensions as $$
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
