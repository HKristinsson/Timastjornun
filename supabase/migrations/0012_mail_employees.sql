-- =============================================================================
-- 0012_mail_employees.sql — Sameina stofnun starfsmanna og póst-innhólfs
-- Starfsmaður er stofnaður á EINUM stað (tímaskráningin) með netfangi + lykilorði
-- + vali um innhólf í appinu (hópur 2). Skilaboða-stjórnun verður aðeins yfirlit.
-- =============================================================================

-- (a) set_employee_password: ef starfsmaður á enga users-röð en netfangið er til
--     (t.d. búið til af mail_upsert_recipient) → TENGJA þá röð í stað þess að
--     reyna að búa til nýja (sem bryti á unique constraint).
create or replace function app.set_employee_password(
  p_employee_id uuid,
  p_password    text
) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_tenant  uuid := app.current_tenant_id();
  v_actor   uuid := app.current_user_id();
  v_emp     employees;
  v_auth    uuid;
  v_email   text;
  v_user_id uuid;
begin
  if not (app.has_role('admin') or app.has_role('project_manager')) then
    raise exception 'FORBIDDEN';
  end if;
  if p_password is null or length(p_password) < 6 then
    raise exception 'WEAK_PASSWORD: Lykilorð verður að vera a.m.k. 6 stafir';
  end if;

  select * into v_emp from employees
   where id = p_employee_id and tenant_id = v_tenant;
  if not found then
    raise exception 'NOT_FOUND: Starfsmaður fannst ekki';
  end if;

  v_email := lower(trim(v_emp.email));

  -- Ef starfsmaður er ótengdur en users-röð með sama netfangi er til → tengja hana
  if v_emp.user_id is null and v_email is not null and v_email <> '' then
    select id into v_user_id from users
     where tenant_id = v_tenant and email = v_email;
    if v_user_id is not null then
      update employees set user_id = v_user_id where id = v_emp.id;
      v_emp.user_id := v_user_id;
    end if;
  end if;

  select u.auth_user_id into v_auth from users u where u.id = v_emp.user_id;

  if v_auth is not null then
    update auth.users
       set encrypted_password = crypt(p_password, gen_salt('bf')), updated_at = now()
     where id = v_auth;
    perform app.write_audit(v_tenant, v_actor, 'update', 'employee', v_emp.id,
      jsonb_build_object('password_changed', true));
    return;
  end if;

  if v_email is null or v_email = '' then
    raise exception 'EMAIL_REQUIRED: Netfang vantar á starfsmann (þarf fyrir innskráningu)';
  end if;
  if exists (select 1 from auth.users where email = v_email) then
    raise exception 'EMAIL_EXISTS: Netfang er þegar í notkun';
  end if;

  v_auth := gen_random_uuid();
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change, email_change_token_new
  ) values (
    '00000000-0000-0000-0000-000000000000', v_auth, 'authenticated', 'authenticated',
    v_email, crypt(p_password, gen_salt('bf')), now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, '', '', '', ''
  );
  insert into auth.identities (
    id, user_id, provider_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), v_auth, v_auth::text,
    jsonb_build_object('sub', v_auth::text, 'email', v_email), 'email',
    now(), now(), now()
  );

  if v_emp.user_id is null then
    insert into users (tenant_id, auth_user_id, email, phone, status)
    values (v_tenant, v_auth, v_email, v_emp.phone, 'active')
    returning id into v_user_id;
    insert into user_roles (user_id, role_id)
    select v_user_id, id from roles where name = 'employee';
    update employees set user_id = v_user_id where id = v_emp.id;
  else
    update users set auth_user_id = v_auth, email = coalesce(email, v_email)
     where id = v_emp.user_id;
    insert into user_roles (user_id, role_id)
    select v_emp.user_id, id from roles where name = 'employee'
    on conflict do nothing;
  end if;

  perform app.write_audit(v_tenant, v_actor, 'update', 'employee', v_emp.id,
    jsonb_build_object('login_created', true));
end $$;

-- (b) mail_upsert_recipient: verkefnastjórar mega líka (stofna starfsmenn)
create or replace function app.mail_upsert_recipient(
  p_email text, p_full_name text default null
) returns group2_recipients
language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_user   uuid;
  v_row    group2_recipients;
begin
  if not (app.has_role('admin') or app.has_role('project_manager')) then
    raise exception 'FORBIDDEN';
  end if;

  select id into v_user from users where tenant_id = v_tenant and email = p_email;
  if v_user is null then
    insert into users (tenant_id, email, status) values (v_tenant, p_email, 'active')
    returning id into v_user;
    insert into user_roles (user_id, role_id)
    select v_user, id from roles where name = 'employee'
    on conflict do nothing;
  end if;

  insert into group2_recipients (tenant_id, email, user_id, active)
  values (v_tenant, p_email, v_user, true)
  on conflict (email) do update set active = true, user_id = excluded.user_id
  returning * into v_row;

  perform app.write_audit(v_tenant, app.current_user_id(), 'create',
    'group2_recipient', v_row.id, jsonb_build_object('email', p_email));
  return v_row;
end $$;

-- (c) Afvirkja/virkja móttakanda út frá netfangi (fyrir starfsmannaformið)
create or replace function app.mail_set_recipient_active_by_email(
  p_email text, p_active boolean
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not (app.has_role('admin') or app.has_role('project_manager')) then
    raise exception 'FORBIDDEN';
  end if;
  update group2_recipients set active = p_active
   where email = p_email and tenant_id = app.current_tenant_id();
end $$;

create or replace function public.mail_set_recipient_active_by_email(
  p_email text, p_active boolean
) returns void language sql security definer set search_path = public as $$
  select app.mail_set_recipient_active_by_email(p_email, p_active)
$$;

grant execute on all functions in schema public to anon, authenticated, service_role;
grant execute on all functions in schema app to anon, authenticated, service_role;

notify pgrst, 'reload schema';
