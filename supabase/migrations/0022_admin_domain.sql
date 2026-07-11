-- =============================================================================
-- 0022_admin_domain.sql — Admin nýs félags verður að vera á léni félagsins
-- =============================================================================
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
  v_domain  text := lower(nullif(trim(p_domain), ''));
begin
  if not app.has_role('super_admin') then
    raise exception 'FORBIDDEN: Aðeins yfirstjórnandi stofnar félög';
  end if;
  if exists (select 1 from users
              where auth_user_id = auth.uid() and acting_tenant_id is not null) then
    raise exception 'ACTING: Hættu fyrst að vinna sem félag áður en nýtt félag er stofnað';
  end if;
  if p_admin_password is null or length(p_admin_password) < 6 then
    raise exception 'WEAK_PASSWORD';
  end if;
  if p_max_employees is null or p_max_employees < 1 then
    raise exception 'BAD_SEATS: Fjöldi starfsmanna verður að vera a.m.k. 1';
  end if;
  -- NÝ REGLA: admin félagsins er á léni þess
  if v_domain is not null and v_email not like ('%@' || v_domain) then
    raise exception 'DOMAIN_MISMATCH: Netfang admin verður að enda á @%', v_domain;
  end if;
  if exists (select 1 from auth.users where email = v_email) then
    raise exception 'EMAIL_EXISTS: Netfang admin er þegar í notkun';
  end if;

  insert into companies (name, domain, status, max_employees)
  values (p_name, v_domain, 'active', p_max_employees)
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

grant execute on all functions in schema app to anon, authenticated, service_role;
notify pgrst, 'reload schema';
