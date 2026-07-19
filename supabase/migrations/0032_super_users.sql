-- =============================================================================
-- 0032_super_users.sql — Umsjón ofurnotenda (super admin) alls kerfisins
-- Ofurnotandi getur: séð alla ofurnotendur, stofnað nýjan (netfang+lykilorð),
-- breytt lykilorði og eytt — með vörnum (ekki sjálfan sig, aldrei síðasta).
-- =============================================================================

-- Listi allra ofurnotenda kerfisins
create or replace function app.su_supers()
returns table(
  user_id uuid, email text, company text,
  created_at timestamptz, last_sign_in_at timestamptz
)
language plpgsql security definer set search_path = public as $$
begin
  if not app.has_role('super_admin') then raise exception 'FORBIDDEN'; end if;
  return query
    select u.id, u.email::text, c.name, u.created_at, au.last_sign_in_at
    from users u
    join user_roles ur on ur.user_id = u.id
    join roles r on r.id = ur.role_id and r.name = 'super_admin'
    left join companies c on c.id = u.tenant_id
    left join auth.users au on au.id = u.auth_user_id
    order by u.created_at;
end $$;

-- Stofna nýjan ofurnotanda (lendir í heimafélagi þess sem stofnar)
create or replace function app.su_create_super(p_email text, p_password text)
returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_actor  uuid := app.current_user_id();
  v_tenant uuid;
  v_email  citext := lower(trim(p_email));
  v_auth   uuid;
  v_user   uuid;
begin
  if not app.has_role('super_admin') then raise exception 'FORBIDDEN'; end if;
  if v_email is null or v_email = '' or position('@' in v_email::text) = 0 then
    raise exception 'BAD_EMAIL: Ógilt netfang';
  end if;
  if p_password is null or length(p_password) < 8 then
    raise exception 'WEAK_PASSWORD: Lykilorð þarf a.m.k. 8 stafi';
  end if;
  if exists (select 1 from auth.users where email = v_email::text)
     or exists (select 1 from users where email = v_email) then
    raise exception 'EMAIL_EXISTS: Netfang er þegar í notkun';
  end if;

  -- Heimafélag stofnanda (ekki acting-félag)
  select tenant_id into v_tenant from users where id = v_actor;

  v_auth := gen_random_uuid();
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change, email_change_token_new
  ) values (
    '00000000-0000-0000-0000-000000000000', v_auth, 'authenticated', 'authenticated',
    v_email::text, crypt(p_password, gen_salt('bf')), now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, '', '', '', ''
  );
  insert into auth.identities (
    id, user_id, provider_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), v_auth, v_auth::text,
    jsonb_build_object('sub', v_auth::text, 'email', v_email::text), 'email',
    now(), now(), now()
  );

  insert into users (tenant_id, auth_user_id, email, status)
  values (v_tenant, v_auth, v_email, 'active')
  returning id into v_user;

  insert into user_roles (user_id, role_id)
  select v_user, id from roles where name in ('super_admin', 'admin')
  on conflict do nothing;

  perform app.write_audit(v_tenant, v_actor, 'create', 'super_user', v_user,
    jsonb_build_object('email', v_email::text));
  return v_user;
end $$;

-- Breyta lykilorði ofurnotanda
create or replace function app.su_set_super_password(p_user_id uuid, p_password text)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_auth uuid;
begin
  if not app.has_role('super_admin') then raise exception 'FORBIDDEN'; end if;
  if p_password is null or length(p_password) < 8 then
    raise exception 'WEAK_PASSWORD: Lykilorð þarf a.m.k. 8 stafi';
  end if;
  select u.auth_user_id into v_auth from users u
   join user_roles ur on ur.user_id = u.id
   join roles r on r.id = ur.role_id and r.name = 'super_admin'
   where u.id = p_user_id;
  if v_auth is null then
    raise exception 'NOT_FOUND: Ofurnotandi fannst ekki';
  end if;
  update auth.users
     set encrypted_password = crypt(p_password, gen_salt('bf')), updated_at = now()
   where id = v_auth;
  perform app.write_audit(null, app.current_user_id(), 'update', 'super_user',
    p_user_id, jsonb_build_object('password_changed', true));
end $$;

-- Eyða ofurnotanda (aldrei sjálfum sér, aldrei þeim síðasta)
create or replace function app.su_delete_super(p_user_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := app.current_user_id();
  v_auth  uuid;
  v_count int;
begin
  if not app.has_role('super_admin') then raise exception 'FORBIDDEN'; end if;
  if p_user_id = v_actor then
    raise exception 'SELF_DELETE: Þú getur ekki eytt sjálfum þér';
  end if;
  select count(*) into v_count from user_roles ur
   join roles r on r.id = ur.role_id and r.name = 'super_admin';
  if v_count <= 1 then
    raise exception 'LAST_SUPER: Kerfið verður að hafa a.m.k. einn ofurnotanda';
  end if;
  select auth_user_id into v_auth from users u
   where u.id = p_user_id
     and exists (select 1 from user_roles ur join roles r on r.id = ur.role_id
                  where ur.user_id = u.id and r.name = 'super_admin');
  if v_auth is null and not exists (select 1 from users where id = p_user_id) then
    raise exception 'NOT_FOUND: Ofurnotandi fannst ekki';
  end if;

  delete from employees where user_id = p_user_id;
  delete from inbound_emails where recipient_user_id = p_user_id;
  delete from outbound_emails where sender_user_id = p_user_id;
  delete from users where id = p_user_id;
  if v_auth is not null then
    delete from auth.users where id = v_auth;
  end if;
  perform app.write_audit(null, v_actor, 'delete', 'super_user', p_user_id, '{}'::jsonb);
end $$;

-- Public-vörpur
create or replace function public.su_supers()
returns table(
  user_id uuid, email text, company text,
  created_at timestamptz, last_sign_in_at timestamptz
) language sql security definer set search_path = public as $$
  select * from app.su_supers()
$$;

create or replace function public.su_create_super(p_email text, p_password text)
returns uuid language sql security definer set search_path = public as $$
  select app.su_create_super(p_email, p_password)
$$;

create or replace function public.su_set_super_password(p_user_id uuid, p_password text)
returns void language sql security definer set search_path = public as $$
  select app.su_set_super_password(p_user_id, p_password)
$$;

create or replace function public.su_delete_super(p_user_id uuid)
returns void language sql security definer set search_path = public as $$
  select app.su_delete_super(p_user_id)
$$;

grant execute on all functions in schema app to anon, authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;
notify pgrst, 'reload schema';
