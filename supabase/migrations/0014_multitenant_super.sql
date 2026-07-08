-- =============================================================================
-- 0014_multitenant_super.sql — Lén á félög, super admin, skilaboðaskjóða, tungumál
-- =============================================================================

-- (a) Lén félags: starfsmenn mega aðeins fá netföng á léni síns félags
alter table companies add column if not exists domain text;
create unique index if not exists companies_domain_uq on companies (lower(domain));
update companies set domain = 'verktak.is'
 where id = '11111111-1111-1111-1111-111111111111' and domain is null;

-- (b) Ný hlutverk
insert into roles (name, description) values
  ('super_admin', 'Yfirstjórnandi kerfisins — stofnar ný félög')
on conflict (name) do nothing;

-- (c) Tungumál notanda (is/en/pl/lt/lv)
alter table users add column if not exists locale text not null default 'is'
  check (locale in ('is','en','pl','lt','lv'));

create or replace function app.set_my_locale(p_locale text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_locale not in ('is','en','pl','lt','lv') then
    raise exception 'BAD_LOCALE';
  end if;
  update users set locale = p_locale where id = app.current_user_id();
end $$;

-- (d) Léns-staðfesting fyrir netföng starfsmanna
create or replace function app.check_email_domain(p_tenant uuid, p_email text)
returns void language plpgsql stable security definer set search_path = public as $$
declare v_dom text;
begin
  if p_email is null or p_email = '' then return; end if;
  select lower(domain) into v_dom from companies where id = p_tenant;
  if v_dom is not null and lower(p_email) not like '%@' || v_dom then
    raise exception 'DOMAIN_MISMATCH: Netfang verður að enda á @%', v_dom;
  end if;
end $$;

-- create_employee: bæta léns-staðfestingu við
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
  if not (app.has_role('admin') or app.has_role('project_manager')) then
    raise exception 'FORBIDDEN';
  end if;
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

-- create_employee_with_login: léns-staðfesting
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
  if not (app.has_role('admin') or app.has_role('project_manager')) then
    raise exception 'FORBIDDEN';
  end if;
  if v_email is null or v_email = '' then
    raise exception 'EMAIL_REQUIRED: Netfang er nauðsynlegt fyrir innskráningu';
  end if;
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

-- mail_upsert_recipient: léns-staðfesting líka
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
  perform app.check_email_domain(v_tenant, p_email);

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

-- (e) SUPER ADMIN: stofna nýtt félag með admin-innskráningu
create or replace function app.create_company(
  p_name text, p_domain text, p_admin_email text, p_admin_password text
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
  if exists (select 1 from auth.users where email = v_email) then
    raise exception 'EMAIL_EXISTS: Netfang admin er þegar í notkun';
  end if;

  insert into companies (name, domain, status)
  values (p_name, lower(nullif(trim(p_domain), '')), 'active')
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
    v_comp.id, jsonb_build_object('domain', p_domain, 'admin', v_email));
  return v_comp;
end $$;

-- Super admin: yfirlit yfir öll félög
create or replace function app.su_list_companies()
returns setof companies language plpgsql stable security definer set search_path = public as $$
begin
  if not app.has_role('super_admin') then raise exception 'FORBIDDEN'; end if;
  return query select * from companies order by created_at;
end $$;

-- (f) SKILABOÐASKJÓÐA: tilkynningar með les-staðfestingu
create table if not exists announcements (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references companies(id) on delete cascade,
  sender_user_id uuid references users(id) on delete set null,
  title          text not null,
  body           text not null,
  created_at     timestamptz not null default now()
);
create table if not exists announcement_reads (
  announcement_id uuid not null references announcements(id) on delete cascade,
  user_id         uuid not null references users(id) on delete cascade,
  read_at         timestamptz,
  primary key (announcement_id, user_id)
);
create index if not exists ann_reads_user_idx on announcement_reads (user_id);

alter table announcements enable row level security;
alter table announcement_reads enable row level security;

create policy ann_select on announcements for select
  using (
    tenant_id = app.current_tenant_id()
    and (
      sender_user_id = app.current_user_id()
      or app.has_role('admin') or app.has_role('project_manager')
      or exists (select 1 from announcement_reads r
                  where r.announcement_id = announcements.id
                    and r.user_id = app.current_user_id())
    )
  );
create policy ann_reads_select on announcement_reads for select
  using (
    user_id = app.current_user_id()
    or exists (select 1 from announcements a
                where a.id = announcement_reads.announcement_id
                  and a.tenant_id = app.current_tenant_id()
                  and (a.sender_user_id = app.current_user_id()
                       or app.has_role('admin') or app.has_role('project_manager')))
  );

-- Senda tilkynningu á ALLA virka starfsmenn félagsins
create or replace function app.ann_send(p_title text, p_body text)
returns announcements language plpgsql security definer set search_path = public as $$
declare v_ann announcements;
begin
  if not (app.has_role('admin') or app.has_role('project_manager')) then
    raise exception 'FORBIDDEN';
  end if;
  insert into announcements (tenant_id, sender_user_id, title, body)
  values (app.current_tenant_id(), app.current_user_id(), p_title, p_body)
  returning * into v_ann;

  insert into announcement_reads (announcement_id, user_id)
  select v_ann.id, e.user_id
  from employees e
  where e.tenant_id = v_ann.tenant_id and e.status = 'active' and e.user_id is not null
  on conflict do nothing;

  return v_ann;
end $$;

-- Kvitta fyrir lestur
create or replace function app.ann_mark_read(p_id uuid)
returns void language sql security definer set search_path = public as $$
  update announcement_reads set read_at = coalesce(read_at, now())
   where announcement_id = p_id and user_id = app.current_user_id()
$$;

-- Hverjir hafa lesið (sendandi/stjórnandi)
create or replace function app.ann_readers(p_id uuid)
returns table(full_name text, email citext, read_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (
    select 1 from announcements a
    where a.id = p_id and a.tenant_id = app.current_tenant_id()
      and (a.sender_user_id = app.current_user_id()
           or app.has_role('admin') or app.has_role('project_manager'))
  ) then
    raise exception 'FORBIDDEN';
  end if;
  return query
    select coalesce(e.full_name, u.email::text), u.email, r.read_at
    from announcement_reads r
    join users u on u.id = r.user_id
    left join employees e on e.user_id = u.id
    where r.announcement_id = p_id
    order by r.read_at nulls last, coalesce(e.full_name, u.email::text);
end $$;

-- Mín skilaboð (starfsmaður)
create or replace view v_my_announcements with (security_invoker = on) as
select a.id, a.title, a.body, a.created_at, r.read_at,
       coalesce(e.full_name, su.email::text) as sender_name
from announcement_reads r
join announcements a on a.id = r.announcement_id
left join users su on su.id = a.sender_user_id
left join employees e on e.user_id = su.id
where r.user_id = app.current_user_id()
order by a.created_at desc;

-- Sendar tilkynningar með lestrar-tölfræði (stjórnandi)
create or replace view v_sent_announcements with (security_invoker = on) as
select a.id, a.title, a.body, a.created_at,
       count(r.user_id)::int as total,
       count(r.read_at)::int as read_count
from announcements a
left join announcement_reads r on r.announcement_id = a.id
where a.tenant_id = app.current_tenant_id()
  and (a.sender_user_id = app.current_user_id()
       or app.has_role('admin') or app.has_role('project_manager'))
group by a.id
order by a.created_at desc;

-- (g) Public-vörpur
create or replace function public.set_my_locale(p_locale text)
returns void language sql security definer set search_path = public as $$
  select app.set_my_locale(p_locale)
$$;
create or replace function public.my_locale()
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select locale from users where id = app.current_user_id()), 'is')
$$;
create or replace function public.create_company(
  p_name text, p_domain text, p_admin_email text, p_admin_password text
) returns public.companies language sql security definer set search_path = public as $$
  select app.create_company(p_name, p_domain, p_admin_email, p_admin_password)
$$;
create or replace function public.su_list_companies()
returns setof public.companies language sql stable security definer set search_path = public as $$
  select * from app.su_list_companies()
$$;
create or replace function public.ann_send(p_title text, p_body text)
returns public.announcements language sql security definer set search_path = public as $$
  select app.ann_send(p_title, p_body)
$$;
create or replace function public.ann_mark_read(p_id uuid)
returns void language sql security definer set search_path = public as $$
  select app.ann_mark_read(p_id)
$$;
create or replace function public.ann_readers(p_id uuid)
returns table(full_name text, email citext, read_at timestamptz)
language sql stable security definer set search_path = public as $$
  select * from app.ann_readers(p_id)
$$;
create or replace function public.my_company_domain()
returns text language sql stable security definer set search_path = public as $$
  select domain from companies where id = app.current_tenant_id()
$$;

grant select, insert, update, delete on announcements, announcement_reads
  to anon, authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;
grant execute on all functions in schema app to anon, authenticated, service_role;

notify pgrst, 'reload schema';
