-- =============================================================================
-- 0017_seats_acting.sql — Sæti (greitt per starfsmann) + super admin vinnur sem félag
-- =============================================================================

-- (a) Hámarksfjöldi starfsmanna (sæti) á félag — greiðslugrunnur kerfisins
alter table companies add column if not exists max_employees integer not null default 10
  check (max_employees > 0);
update companies set max_employees = 50 where max_employees = 10;  -- núverandi félög

-- (b) Super admin getur "unnið sem" annað félag
alter table users add column if not exists acting_tenant_id uuid references companies(id) on delete set null;

-- current_tenant_id: super admin með virkt acting_tenant vinnur sem það félag
create or replace function app.current_tenant_id()
returns uuid language sql stable security definer set search_path = public as $$
  select case
    when u.acting_tenant_id is not null and exists (
      select 1 from user_roles ur join roles r on r.id = ur.role_id
      where ur.user_id = u.id and r.name = 'super_admin'
    ) then u.acting_tenant_id
    else u.tenant_id
  end
  from public.users u
  where u.auth_user_id = auth.uid()
  limit 1
$$;

-- Velja/hætta að vinna sem félag (null = eigið félag)
create or replace function app.su_set_acting_tenant(p_tenant uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not app.has_role('super_admin') then raise exception 'FORBIDDEN'; end if;
  if p_tenant is not null and not exists (select 1 from companies where id = p_tenant) then
    raise exception 'NOT_FOUND: Félag fannst ekki';
  end if;
  update users set acting_tenant_id = p_tenant
   where auth_user_id = auth.uid();
end $$;

-- Hvaða félag er ég að vinna sem? (null = eigið)
create or replace function app.su_acting_tenant()
returns table(id uuid, name text) language sql stable security definer set search_path = public as $$
  select c.id, c.name
  from users u join companies c on c.id = u.acting_tenant_id
  where u.auth_user_id = auth.uid()
    and exists (select 1 from user_roles ur join roles r on r.id = ur.role_id
                where ur.user_id = u.id and r.name = 'super_admin')
$$;

-- (c) Sætavörn: ekki fleiri virkir starfsmenn en félagið greiðir fyrir
create or replace function app.check_seat_limit(p_tenant uuid)
returns void language plpgsql stable security definer set search_path = public as $$
declare v_max int; v_count int;
begin
  select max_employees into v_max from companies where id = p_tenant;
  select count(*) into v_count from employees
   where tenant_id = p_tenant and status = 'active';
  if v_count >= v_max then
    raise exception 'SEAT_LIMIT: Hámarksfjölda starfsmanna (%) er náð — hafðu samband til að fjölga sætum', v_max;
  end if;
end $$;

-- create_employee með sætavörn
create or replace function app.create_employee(
  p_full_name text, p_employee_no text, p_phone text, p_email text, p_national_id text
) returns employees
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_user   uuid := app.current_user_id();
  v_key    text := current_setting('app.kennitala_key', true);
  v_emp    employees;
begin
  if not (app.has_role('admin') or app.has_role('project_manager') or app.has_role('super_admin')) then
    raise exception 'FORBIDDEN';
  end if;
  perform app.check_seat_limit(v_tenant);
  perform app.check_email_domain(v_tenant, p_email);

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

-- create_employee_with_login með sætavörn (og super_admin heimild)
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
  values (v_tenant, v_user_id, p_full_name, p_employee_no, p_phone, v_email,
          case when p_national_id is not null and coalesce(v_key,'') <> ''
               then pgp_sym_encrypt(p_national_id, v_key) end,
          'active')
  returning * into v_emp;

  perform app.write_audit(v_tenant, v_actor, 'create', 'employee', v_emp.id,
    jsonb_build_object('with_login', true));
  return v_emp;
end $$;

-- create_company með sætafjölda
create or replace function app.create_company(
  p_name text, p_domain text, p_admin_email text, p_admin_password text,
  p_max_employees int default 10
) returns companies
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_comp    companies;
  v_auth_id uuid := gen_random_uuid();
  v_user_id uuid;
  v_email   text := lower(trim(p_admin_email));
begin
  if not app.has_role('super_admin') then
    raise exception 'FORBIDDEN: Aðeins yfirstjórnandi stofnar félög';
  end if;
  if p_admin_password is null or length(p_admin_password) < 6 then
    raise exception 'WEAK_PASSWORD';
  end if;
  if p_max_employees is null or p_max_employees < 1 then
    raise exception 'BAD_SEATS: Fjöldi starfsmanna verður að vera a.m.k. 1';
  end if;
  if exists (select 1 from auth.users where email = v_email) then
    raise exception 'EMAIL_EXISTS: Netfang admin er þegar í notkun';
  end if;

  insert into companies (name, domain, status, max_employees)
  values (p_name, lower(nullif(trim(p_domain), '')), 'active', p_max_employees)
  returning * into v_comp;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change, email_change_token_new
  ) values (
    '00000000-0000-0000-0000-000000000000', v_auth_id, 'authenticated', 'authenticated',
    v_email, crypt(p_admin_password, gen_salt('bf')), now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, '', '', '', ''
  );
  insert into auth.identities (
    id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), v_auth_id, v_auth_id::text,
    jsonb_build_object('sub', v_auth_id::text, 'email', v_email), 'email', now(), now(), now()
  );

  insert into users (tenant_id, auth_user_id, email, status)
  values (v_comp.id, v_auth_id, v_email, 'active')
  returning id into v_user_id;
  insert into user_roles (user_id, role_id)
  select v_user_id, id from roles where name = 'admin';

  perform app.write_audit(v_comp.id, app.current_user_id(), 'create', 'company',
    v_comp.id, jsonb_build_object('domain', p_domain, 'admin', v_email,
                                  'max_employees', p_max_employees));
  return v_comp;
end $$;

-- Breyta sætafjölda félags
create or replace function app.su_set_max_employees(p_company uuid, p_max int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not app.has_role('super_admin') then raise exception 'FORBIDDEN'; end if;
  if p_max is null or p_max < 1 then raise exception 'BAD_SEATS'; end if;
  update companies set max_employees = p_max where id = p_company;
end $$;

-- Yfirlit félaga með sætanýtingu og admin-netfangi (fyrir Félög-síðuna)
create or replace function app.su_companies_overview()
returns table(
  id uuid, name text, domain text, status text, created_at timestamptz,
  max_employees int, active_employees bigint, admin_email text
) language plpgsql stable security definer set search_path = public as $$
begin
  if not app.has_role('super_admin') then raise exception 'FORBIDDEN'; end if;
  return query
    select c.id, c.name, c.domain, c.status, c.created_at, c.max_employees,
      (select count(*) from employees e
        where e.tenant_id = c.id and e.status = 'active'),
      (select u.email::text from users u
        join user_roles ur on ur.user_id = u.id
        join roles r on r.id = ur.role_id
        where u.tenant_id = c.id and r.name = 'admin'
        order by u.created_at limit 1)
    from companies c
    order by c.created_at;
end $$;

-- Public-vörpur
drop function if exists public.create_company(text, text, text, text);
create or replace function public.create_company(
  p_name text, p_domain text, p_admin_email text, p_admin_password text,
  p_max_employees int default 10
) returns public.companies language sql security definer set search_path = public as $$
  select app.create_company(p_name, p_domain, p_admin_email, p_admin_password, p_max_employees)
$$;
create or replace function public.su_set_acting_tenant(p_tenant uuid)
returns void language sql security definer set search_path = public as $$
  select app.su_set_acting_tenant(p_tenant)
$$;
create or replace function public.su_acting_tenant()
returns table(id uuid, name text) language sql stable security definer set search_path = public as $$
  select * from app.su_acting_tenant()
$$;
create or replace function public.su_set_max_employees(p_company uuid, p_max int)
returns void language sql security definer set search_path = public as $$
  select app.su_set_max_employees(p_company, p_max)
$$;
create or replace function public.su_companies_overview()
returns table(
  id uuid, name text, domain text, status text, created_at timestamptz,
  max_employees int, active_employees bigint, admin_email text
) language sql stable security definer set search_path = public as $$
  select * from app.su_companies_overview()
$$;

grant execute on all functions in schema public to anon, authenticated, service_role;
grant execute on all functions in schema app to anon, authenticated, service_role;

notify pgrst, 'reload schema';
