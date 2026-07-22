-- =============================================================================
-- 0039_auto_employee_no.sql — Sjálfvirkt starfsmannanúmer
-- Ef starfsmannanúmer vantar við stofnun (t.d. úr appinu) fær starfsmaðurinn
-- sjálfkrafa næsta lausa númer félagsins.
-- =============================================================================

create or replace function app.next_employee_no(p_tenant uuid)
returns text language sql stable security definer set search_path = public as $$
  select lpad((
    coalesce(max(nullif(regexp_replace(employee_no, '\D', '', 'g'), '')::int), 0) + 1
  )::text, 3, '0')
  from employees where tenant_id = p_tenant
$$;

create or replace function app.create_employee_with_login(
  p_full_name text, p_employee_no text, p_phone text, p_email text,
  p_national_id text, p_password text
) returns employees
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_tenant  uuid := app.current_tenant_id();
  v_actor   uuid := app.current_user_id();
  v_key     text := current_setting('app.kennitala_key', true);
  v_auth_id uuid := gen_random_uuid();
  v_user_id uuid;
  v_emp     employees;
  v_email   text := lower(trim(p_email));
  v_no      text := coalesce(nullif(trim(coalesce(p_employee_no, '')), ''),
                             app.next_employee_no(app.current_tenant_id()));
begin
  if not (app.has_role('admin') or app.has_role('project_manager') or app.has_role('super_admin')) then
    raise exception 'FORBIDDEN';
  end if;
  if v_email is null or v_email = '' then
    raise exception 'EMAIL_REQUIRED: Netfang er nauðsynlegt fyrir innskráningu';
  end if;
  perform app.check_seat_limit(v_tenant);
  perform app.check_email_domain(v_tenant, v_email);
  if p_password is null or length(p_password) < 6 then
    raise exception 'WEAK_PASSWORD: Lykilorð verður að vera a.m.k. 6 stafir';
  end if;
  if exists (select 1 from auth.users where email = v_email) then
    raise exception 'EMAIL_EXISTS: Netfang er þegar í notkun';
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change, email_change_token_new
  ) values (
    '00000000-0000-0000-0000-000000000000', v_auth_id, 'authenticated', 'authenticated',
    v_email, crypt(p_password, gen_salt('bf')), now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, '', '', '', ''
  );
  insert into auth.identities (
    id, user_id, provider_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), v_auth_id, v_auth_id::text,
    jsonb_build_object('sub', v_auth_id::text, 'email', v_email), 'email',
    now(), now(), now()
  );

  insert into users (tenant_id, auth_user_id, email, phone, status)
  values (v_tenant, v_auth_id, v_email, p_phone, 'active')
  returning id into v_user_id;
  insert into user_roles (user_id, role_id)
  select v_user_id, id from roles where name = 'employee';

  insert into employees (tenant_id, user_id, full_name, employee_no, phone, email,
                         national_id_enc, status)
  values (v_tenant, v_user_id, p_full_name, v_no, p_phone, v_email,
          case when p_national_id is not null and coalesce(v_key,'') <> ''
               then pgp_sym_encrypt(p_national_id, v_key) end,
          'active')
  returning * into v_emp;

  perform app.write_audit(v_tenant, v_actor, 'create', 'employee', v_emp.id,
    jsonb_build_object('with_login', true, 'auto_no', p_employee_no is null));
  return v_emp;
end $$;

grant execute on all functions in schema app to anon, authenticated, service_role;
notify pgrst, 'reload schema';
