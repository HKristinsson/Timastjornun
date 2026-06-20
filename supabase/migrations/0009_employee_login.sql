-- =============================================================================
-- 0009_employee_login.sql — Stofna starfsmann MEÐ innskráningu (netfang+lykilorð)
-- Býr til auth.users + identity + public.users + employee-hlutverk + employee-færslu
-- í einni færslu. SECURITY DEFINER (keyrir sem eigandi → aðgangur að auth-skema).
-- Kallað af stjórnborðinu þegar admin/verkefnastjóri setur lykilorð á starfsmann.
-- =============================================================================
create or replace function app.create_employee_with_login(
  p_full_name   text,
  p_employee_no text,
  p_phone       text,
  p_email       text,
  p_national_id text,
  p_password    text
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
begin
  if not (app.has_role('admin') or app.has_role('project_manager')) then
    raise exception 'FORBIDDEN';
  end if;
  if v_email is null or v_email = '' then
    raise exception 'EMAIL_REQUIRED: Netfang er nauðsynlegt fyrir innskráningu';
  end if;
  if p_password is null or length(p_password) < 6 then
    raise exception 'WEAK_PASSWORD: Lykilorð verður að vera a.m.k. 6 stafir';
  end if;
  if exists (select 1 from auth.users where email = v_email) then
    raise exception 'EMAIL_EXISTS: Netfang er þegar í notkun';
  end if;

  -- 1) Auth notandi (staðfestur, token-dálkar tómir svo GoTrue sætti sig við hann)
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change, email_change_token_new
  ) values (
    '00000000-0000-0000-0000-000000000000', v_auth_id, 'authenticated', 'authenticated',
    v_email, crypt(p_password, gen_salt('bf')), now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    '', '', '', ''
  );

  -- 2) Identity (þarf fyrir email/password innskráningu)
  insert into auth.identities (
    id, user_id, provider_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), v_auth_id, v_auth_id::text,
    jsonb_build_object('sub', v_auth_id::text, 'email', v_email), 'email',
    now(), now(), now()
  );

  -- 3) Kerfis-notandi (public.users) tengdur við auth + tenant
  insert into users (tenant_id, auth_user_id, email, phone, status)
  values (v_tenant, v_auth_id, v_email, p_phone, 'active')
  returning id into v_user_id;

  -- 4) Hlutverk = starfsmaður
  insert into user_roles (user_id, role_id)
  select v_user_id, id from roles where name = 'employee';

  -- 5) Starfsmannafærsla
  insert into employees (tenant_id, user_id, full_name, employee_no, phone, email,
                         national_id_enc, status)
  values (v_tenant, v_user_id, p_full_name, p_employee_no, p_phone, v_email,
          case when p_national_id is not null and coalesce(v_key,'') <> ''
               then pgp_sym_encrypt(p_national_id, v_key) end,
          'active')
  returning * into v_emp;

  perform app.write_audit(v_tenant, v_actor, 'create', 'employee', v_emp.id,
    jsonb_build_object('with_login', true));
  return v_emp;
end $$;

-- Public-varpa fyrir PostgREST
create or replace function public.create_employee_with_login(
  p_full_name text, p_employee_no text, p_phone text, p_email text,
  p_national_id text, p_password text
) returns public.employees language sql security definer set search_path = public as $$
  select app.create_employee_with_login(p_full_name, p_employee_no, p_phone,
    p_email, p_national_id, p_password)
$$;

grant execute on function public.create_employee_with_login(text,text,text,text,text,text)
  to anon, authenticated, service_role;

notify pgrst, 'reload schema';
