-- setup_all.sql - Oll uppsetning i einni skra (Supabase SQL editor)


-- >>> migrations\0001_init.sql >>>

-- =============================================================================
-- 0001_init.sql — Extensions, skema og töflur
-- Tímastjórnun: multi-tenant GPS tímaskráningarkerfi
-- =============================================================================

-- --- Extensions ------------------------------------------------------------
create extension if not exists postgis;      -- landfræðilegir útreikningar (geofence)
create extension if not exists citext;       -- case-insensitive netföng
create extension if not exists pgcrypto;     -- dulkóðun (kennitala) + gen_random_uuid

-- Sér-skema fyrir innri föll/helpers (aðgreint frá public)
create schema if not exists app;

-- =============================================================================
-- LOOKUP / KERFISTÖFLUR
-- =============================================================================

-- Hlutverk eru föst í kerfinu (ekki tenant-háð)
create table roles (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,          -- admin | project_manager | employee | payroll
  description text,
  permissions jsonb not null default '[]'::jsonb
);

-- Fyrirtæki = tenant. Rót multi-tenant líkansins.
create table companies (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  national_id   text,                          -- kennitala fyrirtækis
  status        text not null default 'active' check (status in ('active','suspended')),
  settings_json jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- =============================================================================
-- NOTENDUR OG AÐGANGUR
-- =============================================================================

create table users (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references companies(id) on delete cascade,
  auth_user_id      uuid unique,               -- tenging við auth.users (Supabase Auth)
  email             citext,
  phone             text,                      -- E.164
  password_hash     text,                      -- stjórnendur (Argon2id) — ef ekki Supabase Auth
  pin_hash          text,                      -- daglegt PIN starfsmanns (Argon2id)
  phone_verified_at timestamptz,
  status            text not null default 'active' check (status in ('active','inactive')),
  last_login_at     timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- a.m.k. annað hvort email eða phone verður að vera sett
  constraint users_contact_chk check (email is not null or phone is not null),
  -- einstök innan fyrirtækis (ekki á heimsvísu) — multi-tenant
  constraint users_email_uq unique (tenant_id, email),
  constraint users_phone_uq unique (tenant_id, phone)
);

create table user_roles (
  user_id uuid not null references users(id) on delete cascade,
  role_id uuid not null references roles(id) on delete cascade,
  primary key (user_id, role_id)
);

-- =============================================================================
-- STARFSMENN
-- =============================================================================

create table employees (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references companies(id) on delete cascade,
  user_id         uuid references users(id) on delete set null,
  full_name       text not null,
  national_id_enc bytea,                        -- kennitala DULKÓÐUÐ í hvíld (pgcrypto)
  employee_no     text not null,
  phone           text,
  email           citext,
  status          text not null default 'active' check (status in ('active','inactive')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint employees_no_uq unique (tenant_id, employee_no)
);

-- =============================================================================
-- VERKEFNI OG STAÐSETNINGAR (GEOFENCE)
-- =============================================================================

create table projects (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references companies(id) on delete cascade,
  project_no       text not null,
  name             text not null,
  description      text,
  address          text,
  manager_user_id  uuid references users(id) on delete set null,
  start_date       date,
  planned_end_date date,
  status           text not null default 'active' check (status in ('active','inactive')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint projects_no_uq unique (tenant_id, project_no)
);

-- Geofence aðskilið frá projects svo hægt sé að bæta við fleiri svæðum síðar.
-- MVP: eitt svæði per verkefni (is_primary = true, hringlaga).
create table project_locations (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references companies(id) on delete cascade,
  project_id  uuid not null references projects(id) on delete cascade,
  center      geography(Point,4326) not null,   -- GPS-hnit miðju
  radius_m    integer not null check (radius_m between 50 and 300),
  polygon     geography(Polygon,4326),          -- valfrjálst marghyrnt svæði (v2)
  is_primary  boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Hvaða verkefni starfsmaður MÁ skrá sig á (M:N)
create table employee_projects (
  tenant_id   uuid not null references companies(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  project_id  uuid not null references projects(id) on delete cascade,
  assigned_by uuid references users(id) on delete set null,
  created_at  timestamptz not null default now(),
  primary key (employee_id, project_id)
);

-- =============================================================================
-- TÍMASKRÁNING (KJARNI)
-- =============================================================================

create table time_entries (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references companies(id) on delete cascade,
  employee_id          uuid not null references employees(id) on delete cascade,
  project_id           uuid not null references projects(id) on delete cascade,
  check_in_at          timestamptz not null default now(),
  check_out_at         timestamptz,             -- null = enn virk skráning
  check_in_location    geography(Point,4326) not null,
  check_out_location   geography(Point,4326),
  check_in_accuracy_m  numeric,
  check_out_accuracy_m numeric,
  check_out_type       text check (check_out_type in
                          ('manual','auto_geofence','auto_gps_lost','admin')),
  worked_minutes       integer,                 -- reiknað við lokun
  note                 text,
  status               text not null default 'active'
                          check (status in ('active','pending','approved','rejected')),
  source               text not null default 'mobile'
                          check (source in ('mobile','manual_entry')),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- AÐEINS ein virk skráning per starfsmaður í einu (partial unique index)
create unique index time_entries_one_active_uq
  on time_entries (employee_id)
  where check_out_at is null;

-- Reglubundnar GPS-mælingar meðan innskráður (viðkvæmustu gögnin)
create table location_logs (
  id              bigserial primary key,
  tenant_id       uuid not null references companies(id) on delete cascade,
  time_entry_id   uuid not null references time_entries(id) on delete cascade,
  recorded_at     timestamptz not null default now(),
  location        geography(Point,4326) not null,
  accuracy_m      numeric,
  inside_geofence boolean,                       -- reiknað við móttöku
  event_type      text check (event_type in
                    ('left_area','returned','warning','gps_lost'))  -- null = venjuleg mæling
);

-- =============================================================================
-- SAMÞYKKT, STILLINGAR, AUDIT
-- =============================================================================

create table approvals (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references companies(id) on delete cascade,
  time_entry_id   uuid not null references time_entries(id) on delete cascade,
  reviewed_by     uuid references users(id) on delete set null,
  decision        text not null check (decision in ('approved','rejected','modified')),
  reason          text,                          -- skylda við reject/modified (þvingað í falli)
  previous_values jsonb,                          -- gömlu gildi við leiðréttingu
  reviewed_at     timestamptz not null default now()
);

-- Stillingar: global (tenant_id null) eða per fyrirtæki/verkefni
create table settings (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid references companies(id) on delete cascade,  -- null = global default
  scope      text not null default 'global' check (scope in ('global','company','project')),
  project_id uuid references projects(id) on delete cascade,
  key        text not null,
  value      jsonb not null,
  updated_by uuid references users(id) on delete set null,
  updated_at timestamptz not null default now()
);
create unique index settings_scope_key_uq
  on settings (coalesce(tenant_id,'00000000-0000-0000-0000-000000000000'::uuid),
               coalesce(project_id,'00000000-0000-0000-0000-000000000000'::uuid),
               key);

create table audit_log (
  id            bigserial primary key,
  tenant_id     uuid references companies(id) on delete set null,
  actor_user_id uuid references users(id) on delete set null,  -- null = kerfið
  action        text not null,                  -- create|update|delete|approve|reject|login|export|auto_checkout
  entity_type   text not null,                  -- project|employee|time_entry|...
  entity_id     uuid,
  changes       jsonb,                          -- diff (fyrir/eftir)
  ip_address    inet,
  user_agent    text,
  created_at    timestamptz not null default now()
);

-- =============================================================================
-- VÍSITÖLUR
-- =============================================================================

create index users_tenant_idx            on users (tenant_id);
create index employees_tenant_idx        on employees (tenant_id);
create index projects_tenant_idx         on projects (tenant_id);
create index projects_manager_idx        on projects (manager_user_id);
create index time_entries_emp_in_idx     on time_entries (employee_id, check_in_at desc);
create index time_entries_proj_status_idx on time_entries (project_id, status);
create index time_entries_tenant_idx     on time_entries (tenant_id, check_in_at desc);
create index location_logs_entry_idx     on location_logs (time_entry_id, recorded_at);
create index approvals_entry_idx         on approvals (time_entry_id);
create index audit_log_tenant_idx        on audit_log (tenant_id, created_at desc);

-- GiST vísitölur fyrir landfræðilega útreikninga
create index project_locations_center_gix on project_locations using gist (center);

-- =============================================================================
-- FÖST HLUTVERK
-- =============================================================================
insert into roles (name, description) values
  ('admin',           'Kerfisstjóri — heildarumsjón'),
  ('project_manager', 'Verkefnastjóri — rekur verkefni, samþykkir tíma'),
  ('employee',        'Starfsmaður — skráir eigin tíma'),
  ('payroll',         'Laun/bókhald — vinnur úr samþykktum tímum');


-- >>> migrations\0002_functions.sql >>>

-- =============================================================================
-- 0002_functions.sql — Helper-föll, geofence check-in/out, audit
-- =============================================================================

-- --- Helpers: tenant + notandi úr JWT -------------------------------------

-- tenant_id núverandi notanda (úr JWT app_metadata, eða GUC fyrir server-keyrslur)
create or replace function app.current_tenant_id()
returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true)::jsonb
             -> 'app_metadata' ->> 'tenant_id', ''),
    nullif(current_setting('app.tenant_id', true), '')
  )::uuid
$$;

-- innra users.id núverandi notanda (út frá Supabase auth.uid())
create or replace function app.current_user_id()
returns uuid language sql stable as $$
  select id from public.users
  where auth_user_id = auth.uid()
  limit 1
$$;

-- hefur notandi tiltekið hlutverk?
create or replace function app.has_role(p_role text)
returns boolean language sql stable as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.users u on u.id = ur.user_id
    join public.roles r on r.id = ur.role_id
    where u.auth_user_id = auth.uid()
      and r.name = p_role
  )
$$;

-- sækja talnastillingu (settings) með global → company → project forgangi
create or replace function app.get_setting_int(
  p_tenant uuid, p_project uuid, p_key text, p_default int)
returns int language sql stable as $$
  select coalesce(
    (select (value #>> '{}')::int from public.settings
       where key = p_key and scope = 'project' and project_id = p_project),
    (select (value #>> '{}')::int from public.settings
       where key = p_key and scope = 'company' and tenant_id = p_tenant),
    (select (value #>> '{}')::int from public.settings
       where key = p_key and scope = 'global'),
    p_default
  )
$$;

-- --- Audit hjálp ----------------------------------------------------------
create or replace function app.write_audit(
  p_tenant uuid, p_actor uuid, p_action text,
  p_entity_type text, p_entity_id uuid, p_changes jsonb default null)
returns void language sql security definer set search_path = public as $$
  insert into audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, changes)
  values (p_tenant, p_actor, p_action, p_entity_type, p_entity_id, p_changes)
$$;

-- updated_at sjálfvirkt
create or replace function app.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger trg_companies_touch   before update on companies
  for each row execute function app.touch_updated_at();
create trigger trg_users_touch       before update on users
  for each row execute function app.touch_updated_at();
create trigger trg_employees_touch   before update on employees
  for each row execute function app.touch_updated_at();
create trigger trg_projects_touch    before update on projects
  for each row execute function app.touch_updated_at();
create trigger trg_time_entries_touch before update on time_entries
  for each row execute function app.touch_updated_at();

-- =============================================================================
-- GEOFENCE: CHECK-IN  (server-side — ekki hægt að svindla frá appi)
-- =============================================================================
-- Skilar nýrri time_entries röð ef innan svæðis; annars villa með fjarlægð.
create or replace function app.check_in(
  p_project_id uuid,
  p_lat        double precision,
  p_lng        double precision,
  p_accuracy   numeric default null,
  p_note       text    default null
) returns time_entries
language plpgsql security definer set search_path = public as $$
declare
  v_tenant    uuid := app.current_tenant_id();
  v_user      uuid := app.current_user_id();
  v_employee  uuid;
  v_point     geography := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography;
  v_loc       project_locations;
  v_min_acc   int;
  v_distance  numeric;
  v_entry     time_entries;
begin
  -- 1) Finna starfsmann tengdan núverandi notanda
  select id into v_employee from employees
   where user_id = v_user and tenant_id = v_tenant and status = 'active';
  if v_employee is null then
    raise exception 'EMP_NOT_FOUND: Enginn virkur starfsmaður tengdur notanda';
  end if;

  -- 2) Staðfesta að starfsmaður MÁ skrá sig á verkefnið
  if not exists (
    select 1 from employee_projects
     where employee_id = v_employee and project_id = p_project_id
  ) then
    raise exception 'NOT_ASSIGNED: Starfsmaður hefur ekki aðgang að þessu verkefni';
  end if;

  -- 3) Aðeins ein virk skráning í einu
  if exists (select 1 from time_entries
              where employee_id = v_employee and check_out_at is null) then
    raise exception 'ALREADY_ACTIVE: Þegar virk tímaskráning í gangi';
  end if;

  -- 4) Sækja geofence verkefnis (primary svæði)
  select * into v_loc from project_locations
   where project_id = p_project_id and is_primary
   order by created_at limit 1;
  if v_loc is null then
    raise exception 'NO_GEOFENCE: Verkefni hefur ekkert skilgreint svæði';
  end if;

  -- 5) Krefjast lágmarksnákvæmni (annars hægt að "fljóta" inn)
  v_min_acc := app.get_setting_int(v_tenant, p_project_id, 'min_accuracy_m', 50);
  if p_accuracy is not null and p_accuracy > v_min_acc then
    raise exception 'LOW_ACCURACY: GPS-nákvæmni ófullnægjandi (% m > % m)',
      p_accuracy, v_min_acc;
  end if;

  -- 6) Geofence-athugun: er punktur innan radíus? (PostGIS, metrar)
  v_distance := ST_Distance(v_point, v_loc.center);
  if v_distance > v_loc.radius_m then
    raise exception 'OUTSIDE_AREA: Utan svæðis (% m, leyfilegt % m)',
      round(v_distance), v_loc.radius_m;
  end if;

  -- 7) Stofna tímaskráningu
  insert into time_entries (
    tenant_id, employee_id, project_id, check_in_at,
    check_in_location, check_in_accuracy_m, note, status, source)
  values (
    v_tenant, v_employee, p_project_id, now(),
    v_point, p_accuracy, p_note, 'active', 'mobile')
  returning * into v_entry;

  perform app.write_audit(v_tenant, v_user, 'create', 'time_entry', v_entry.id,
    jsonb_build_object('event','check_in','distance_m',round(v_distance)));

  return v_entry;
end $$;

-- =============================================================================
-- GEOFENCE: CHECK-OUT (handvirk útskráning)
-- =============================================================================
create or replace function app.check_out(
  p_time_entry_id uuid,
  p_lat           double precision default null,
  p_lng           double precision default null,
  p_accuracy      numeric default null,
  p_note          text    default null
) returns time_entries
language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_user   uuid := app.current_user_id();
  v_point  geography := case when p_lat is not null
              then ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography end;
  v_entry  time_entries;
begin
  select * into v_entry from time_entries
   where id = p_time_entry_id and check_out_at is null;
  if v_entry is null then
    raise exception 'NO_ACTIVE_ENTRY: Engin virk skráning fannst';
  end if;

  update time_entries set
    check_out_at         = now(),
    check_out_location   = coalesce(v_point, check_out_location),
    check_out_accuracy_m = p_accuracy,
    check_out_type       = 'manual',
    worked_minutes       = ceil(extract(epoch from (now() - check_in_at)) / 60)::int,
    note                 = coalesce(p_note, note),
    status               = 'pending'   -- bíður samþykktar
  where id = p_time_entry_id
  returning * into v_entry;

  perform app.write_audit(v_tenant, v_user, 'update', 'time_entry', v_entry.id,
    jsonb_build_object('event','check_out','type','manual',
                       'worked_minutes', v_entry.worked_minutes));
  return v_entry;
end $$;

-- =============================================================================
-- SJÁLFVIRK ÚTSKRÁNING (kallað af bakgrunnsvinnslu / cron / edge function)
-- =============================================================================
create or replace function app.auto_check_out(
  p_time_entry_id uuid,
  p_reason        text,                        -- 'auto_geofence' | 'auto_gps_lost'
  p_effective_at  timestamptz default now()
) returns time_entries
language plpgsql security definer set search_path = public as $$
declare
  v_entry time_entries;
begin
  select * into v_entry from time_entries
   where id = p_time_entry_id and check_out_at is null;
  if v_entry is null then
    raise exception 'NO_ACTIVE_ENTRY';
  end if;

  update time_entries set
    check_out_at   = p_effective_at,
    check_out_type = p_reason,
    worked_minutes = ceil(extract(epoch from (p_effective_at - check_in_at)) / 60)::int,
    status         = 'pending'
  where id = p_time_entry_id
  returning * into v_entry;

  -- kerfið er actor (null) — sjálfvirk aðgerð
  perform app.write_audit(v_entry.tenant_id, null, 'auto_checkout',
    'time_entry', v_entry.id, jsonb_build_object('reason', p_reason));
  return v_entry;
end $$;

-- =============================================================================
-- SAMÞYKKT / HÖFNUN tímaskráningar (verkefnastjóri/admin)
-- =============================================================================
create or replace function app.review_time_entry(
  p_time_entry_id uuid,
  p_decision      text,                        -- 'approved' | 'rejected'
  p_reason        text default null
) returns time_entries
language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_user   uuid := app.current_user_id();
  v_entry  time_entries;
begin
  if p_decision not in ('approved','rejected') then
    raise exception 'BAD_DECISION';
  end if;
  if p_decision = 'rejected' and (p_reason is null or length(trim(p_reason)) = 0) then
    raise exception 'REASON_REQUIRED: Ástæða er skylda við höfnun';
  end if;

  update time_entries
     set status = p_decision
   where id = p_time_entry_id and status = 'pending'
   returning * into v_entry;
  if v_entry is null then
    raise exception 'NOT_PENDING: Skráning er ekki í bið';
  end if;

  insert into approvals (tenant_id, time_entry_id, reviewed_by, decision, reason)
  values (v_tenant, p_time_entry_id, v_user, p_decision, p_reason);

  perform app.write_audit(v_tenant, v_user, p_decision, 'time_entry', v_entry.id,
    jsonb_build_object('reason', p_reason));
  return v_entry;
end $$;


-- >>> migrations\0003_rls.sql >>>

-- =============================================================================
-- 0003_rls.sql — Row-Level Security (multi-tenant einangrun + hlutverk)
-- Grunnregla: notandi sér AÐEINS gögn síns fyrirtækis (tenant_id úr JWT).
-- Innan fyrirtækis ræðst sýnileiki af hlutverki.
-- =============================================================================

alter table companies         enable row level security;
alter table users             enable row level security;
alter table user_roles        enable row level security;
alter table employees         enable row level security;
alter table projects          enable row level security;
alter table project_locations enable row level security;
alter table employee_projects enable row level security;
alter table time_entries      enable row level security;
alter table location_logs     enable row level security;
alter table approvals         enable row level security;
alter table settings          enable row level security;
alter table audit_log         enable row level security;

-- --- companies: sér aðeins sitt eigið fyrirtæki ---------------------------
create policy company_select on companies for select
  using (id = app.current_tenant_id());
create policy company_admin_update on companies for update
  using (id = app.current_tenant_id() and app.has_role('admin'));

-- --- users -----------------------------------------------------------------
create policy users_tenant_select on users for select
  using (tenant_id = app.current_tenant_id());
create policy users_admin_write on users for all
  using (tenant_id = app.current_tenant_id() and app.has_role('admin'))
  with check (tenant_id = app.current_tenant_id() and app.has_role('admin'));

create policy user_roles_select on user_roles for select
  using (exists (select 1 from users u
                  where u.id = user_roles.user_id
                    and u.tenant_id = app.current_tenant_id()));

-- --- employees: admin/PM skrifa; allir í tenant lesa ----------------------
create policy employees_tenant_select on employees for select
  using (tenant_id = app.current_tenant_id());
create policy employees_manage on employees for all
  using (tenant_id = app.current_tenant_id()
         and (app.has_role('admin') or app.has_role('project_manager')))
  with check (tenant_id = app.current_tenant_id()
         and (app.has_role('admin') or app.has_role('project_manager')));

-- --- projects: admin allt; PM aðeins sín verkefni -------------------------
create policy projects_tenant_select on projects for select
  using (tenant_id = app.current_tenant_id());
create policy projects_admin_all on projects for all
  using (tenant_id = app.current_tenant_id() and app.has_role('admin'))
  with check (tenant_id = app.current_tenant_id() and app.has_role('admin'));
create policy projects_pm_manage on projects for update
  using (tenant_id = app.current_tenant_id()
         and app.has_role('project_manager')
         and manager_user_id = app.current_user_id());

-- --- project_locations: fylgir verkefni -----------------------------------
create policy proj_loc_select on project_locations for select
  using (tenant_id = app.current_tenant_id());
create policy proj_loc_manage on project_locations for all
  using (tenant_id = app.current_tenant_id()
         and (app.has_role('admin') or app.has_role('project_manager')))
  with check (tenant_id = app.current_tenant_id()
         and (app.has_role('admin') or app.has_role('project_manager')));

-- --- employee_projects (úthlutun) -----------------------------------------
create policy emp_proj_select on employee_projects for select
  using (tenant_id = app.current_tenant_id());
create policy emp_proj_manage on employee_projects for all
  using (tenant_id = app.current_tenant_id()
         and (app.has_role('admin') or app.has_role('project_manager')))
  with check (tenant_id = app.current_tenant_id()
         and (app.has_role('admin') or app.has_role('project_manager')));

-- --- time_entries ----------------------------------------------------------
-- Starfsmaður sér eigin; PM/admin/payroll sjá allt í tenant.
-- (Innskráning/útskráning fer gegnum SECURITY DEFINER föll, ekki beint INSERT.)
create policy time_entries_select on time_entries for select
  using (
    tenant_id = app.current_tenant_id() and (
      app.has_role('admin') or app.has_role('project_manager') or app.has_role('payroll')
      or employee_id in (select id from employees where user_id = app.current_user_id())
    )
  );
-- Handvirkar leiðréttingar: aðeins admin/PM
create policy time_entries_manage on time_entries for update
  using (tenant_id = app.current_tenant_id()
         and (app.has_role('admin') or app.has_role('project_manager')));

-- --- location_logs: starfsmaður má bæta við eigin; stjórnendur lesa -------
create policy loc_logs_insert on location_logs for insert
  with check (tenant_id = app.current_tenant_id());
create policy loc_logs_select on location_logs for select
  using (tenant_id = app.current_tenant_id()
         and (app.has_role('admin') or app.has_role('project_manager')
              or time_entry_id in (
                   select te.id from time_entries te
                   join employees e on e.id = te.employee_id
                   where e.user_id = app.current_user_id())));
-- ATH: payroll fær EKKI aðgang að location_logs (GDPR — aðeins niðurstaða).

-- --- approvals -------------------------------------------------------------
create policy approvals_select on approvals for select
  using (tenant_id = app.current_tenant_id());
create policy approvals_manage on approvals for all
  using (tenant_id = app.current_tenant_id()
         and (app.has_role('admin') or app.has_role('project_manager')))
  with check (tenant_id = app.current_tenant_id()
         and (app.has_role('admin') or app.has_role('project_manager')));

-- --- settings: lesa í tenant; admin skrifar -------------------------------
create policy settings_select on settings for select
  using (tenant_id is null or tenant_id = app.current_tenant_id());
create policy settings_admin on settings for all
  using (tenant_id = app.current_tenant_id() and app.has_role('admin'))
  with check (tenant_id = app.current_tenant_id() and app.has_role('admin'));

-- --- audit_log: aðeins admin les; enginn breytir -------------------------
create policy audit_admin_select on audit_log for select
  using (tenant_id = app.current_tenant_id() and app.has_role('admin'));

-- =============================================================================
-- Sjálfgefnar global stillingar (GPS-reglur) — tenant_id null
-- =============================================================================
insert into settings (tenant_id, scope, key, value) values
  (null, 'global', 'gps_poll_interval_sec',    '60'::jsonb),
  (null, 'global', 'min_accuracy_m',           '50'::jsonb),
  (null, 'global', 'grace_period_min',         '10'::jsonb),
  (null, 'global', 'gps_lost_timeout_min',     '15'::jsonb),
  (null, 'global', 'default_radius_m',         '100'::jsonb),
  (null, 'global', 'location_log_retention_days', '90'::jsonb);


-- >>> migrations\0004_admin.sql >>>

-- =============================================================================
-- 0004_admin.sql — Views og RPC-föll fyrir stjórnborðið
-- Views nota security_invoker=on svo RLS gildi áfram fyrir notandann.
-- =============================================================================

-- --- VIEW: verkefni með (lat,lng,radíus) úr primary geofence --------------
create or replace view v_projects
  with (security_invoker = on) as
select
  p.id, p.tenant_id, p.project_no, p.name, p.description, p.address,
  p.manager_user_id, p.start_date, p.planned_end_date, p.status,
  pl.radius_m,
  ST_Y(pl.center::geometry) as lat,
  ST_X(pl.center::geometry) as lng
from projects p
left join project_locations pl
  on pl.project_id = p.id and pl.is_primary;

-- --- VIEW: tímaskráningar með nöfnum + unnar klst -------------------------
create or replace view v_time_entries
  with (security_invoker = on) as
select
  te.id, te.tenant_id, te.employee_id, te.project_id,
  e.full_name      as employee_name,
  e.employee_no,
  p.name           as project_name,
  p.project_no,
  te.check_in_at, te.check_out_at,
  te.check_out_type, te.worked_minutes,
  round(coalesce(te.worked_minutes,0) / 60.0, 2) as worked_hours,
  te.note, te.status, te.source
from time_entries te
join employees e on e.id = te.employee_id
join projects  p on p.id = te.project_id;

-- --- VIEW: virkar skráningar (lifandi yfirlit) ----------------------------
create or replace view v_active_entries
  with (security_invoker = on) as
select
  te.id, te.tenant_id, te.employee_id, te.project_id,
  e.full_name as employee_name,
  p.name      as project_name, p.project_no,
  te.check_in_at,
  -- síðasta þekkta staðsetning innan/utan svæðis
  (select ll.inside_geofence from location_logs ll
     where ll.time_entry_id = te.id
     order by ll.recorded_at desc limit 1) as inside_geofence
from time_entries te
join employees e on e.id = te.employee_id
join projects  p on p.id = te.project_id
where te.check_out_at is null;

-- =============================================================================
-- RPC: stofna verkefni (+ geofence) — geometry búið til server-side
-- =============================================================================
create or replace function app.create_project(
  p_project_no text,
  p_name       text,
  p_description text,
  p_address    text,
  p_manager_user_id uuid,
  p_start_date date,
  p_end_date   date,
  p_lat        double precision,
  p_lng        double precision,
  p_radius_m   integer
) returns projects
language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_user   uuid := app.current_user_id();
  v_proj   projects;
begin
  if not (app.has_role('admin') or app.has_role('project_manager')) then
    raise exception 'FORBIDDEN: Aðeins admin/verkefnastjóri má stofna verkefni';
  end if;

  insert into projects (tenant_id, project_no, name, description, address,
                        manager_user_id, start_date, planned_end_date, status)
  values (v_tenant, p_project_no, p_name, p_description, p_address,
          p_manager_user_id, p_start_date, p_end_date, 'active')
  returning * into v_proj;

  if p_lat is not null and p_lng is not null then
    insert into project_locations (tenant_id, project_id, center, radius_m, is_primary)
    values (v_tenant, v_proj.id,
            ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
            coalesce(p_radius_m, 100), true);
  end if;

  perform app.write_audit(v_tenant, v_user, 'create', 'project', v_proj.id, null);
  return v_proj;
end $$;

-- =============================================================================
-- RPC: uppfæra verkefni (+ geofence)
-- =============================================================================
create or replace function app.update_project(
  p_id         uuid,
  p_name       text,
  p_description text,
  p_address    text,
  p_manager_user_id uuid,
  p_start_date date,
  p_end_date   date,
  p_status     text,
  p_lat        double precision,
  p_lng        double precision,
  p_radius_m   integer
) returns projects
language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_user   uuid := app.current_user_id();
  v_proj   projects;
begin
  if not (app.has_role('admin') or app.has_role('project_manager')) then
    raise exception 'FORBIDDEN';
  end if;

  update projects set
    name = p_name, description = p_description, address = p_address,
    manager_user_id = p_manager_user_id, start_date = p_start_date,
    planned_end_date = p_end_date, status = coalesce(p_status, status)
  where id = p_id and tenant_id = v_tenant
  returning * into v_proj;
  if v_proj is null then raise exception 'NOT_FOUND'; end if;

  if p_lat is not null and p_lng is not null then
    -- upsert primary geofence
    if exists (select 1 from project_locations where project_id = p_id and is_primary) then
      update project_locations set
        center = ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
        radius_m = coalesce(p_radius_m, radius_m)
      where project_id = p_id and is_primary;
    else
      insert into project_locations (tenant_id, project_id, center, radius_m, is_primary)
      values (v_tenant, p_id,
              ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
              coalesce(p_radius_m, 100), true);
    end if;
  end if;

  perform app.write_audit(v_tenant, v_user, 'update', 'project', v_proj.id, null);
  return v_proj;
end $$;

-- =============================================================================
-- RPC: úthluta starfsmanni á verkefni (eða fjarlægja)
-- =============================================================================
create or replace function app.set_employee_projects(
  p_employee_id uuid,
  p_project_ids uuid[]
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_user   uuid := app.current_user_id();
  v_pid    uuid;
begin
  if not (app.has_role('admin') or app.has_role('project_manager')) then
    raise exception 'FORBIDDEN';
  end if;

  delete from employee_projects where employee_id = p_employee_id;
  foreach v_pid in array coalesce(p_project_ids, '{}') loop
    insert into employee_projects (tenant_id, employee_id, project_id, assigned_by)
    values (v_tenant, p_employee_id, v_pid, v_user)
    on conflict do nothing;
  end loop;

  perform app.write_audit(v_tenant, v_user, 'update', 'employee', p_employee_id,
    jsonb_build_object('projects', p_project_ids));
end $$;

-- =============================================================================
-- RPC: stofna starfsmann (kennitala DULKÓÐUÐ ef lykill er stilltur)
-- Lykill kemur úr DB-stillingu `app.kennitala_key` (sett í Supabase Vault/secret).
-- =============================================================================
create or replace function app.create_employee(
  p_full_name   text,
  p_employee_no text,
  p_phone       text,
  p_email       text,
  p_national_id text
) returns employees
-- extensions í search_path svo pgcrypto (pgp_sym_encrypt) finnist á Supabase
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

-- =============================================================================
-- RPC: uppfæra starfsmann
-- =============================================================================
create or replace function app.update_employee(
  p_id          uuid,
  p_full_name   text,
  p_phone       text,
  p_email       text,
  p_status      text
) returns employees
language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_user   uuid := app.current_user_id();
  v_emp    employees;
begin
  if not (app.has_role('admin') or app.has_role('project_manager')) then
    raise exception 'FORBIDDEN';
  end if;

  update employees set
    full_name = p_full_name, phone = p_phone, email = p_email,
    status = coalesce(p_status, status)
  where id = p_id and tenant_id = v_tenant
  returning * into v_emp;
  if v_emp is null then raise exception 'NOT_FOUND'; end if;

  perform app.write_audit(v_tenant, v_user, 'update', 'employee', v_emp.id, null);
  return v_emp;
end $$;

-- =============================================================================
-- RPC: vista fyrirtækis-stillingu (admin) — upsert á company-scope
-- =============================================================================
create or replace function app.set_company_setting(
  p_key   text,
  p_value jsonb
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_user   uuid := app.current_user_id();
begin
  if not app.has_role('admin') then
    raise exception 'FORBIDDEN';
  end if;

  if exists (select 1 from settings
              where scope = 'company' and tenant_id = v_tenant and key = p_key) then
    update settings set value = p_value, updated_by = v_user, updated_at = now()
     where scope = 'company' and tenant_id = v_tenant and key = p_key;
  else
    insert into settings (tenant_id, scope, key, value, updated_by)
    values (v_tenant, 'company', p_key, p_value, v_user);
  end if;
end $$;

-- VIEW: virkar stillingar fyrir fyrirtæki (company override → global default)
create or replace view v_effective_settings
  with (security_invoker = on) as
select s.key, s.value, s.scope
from settings s
where s.scope = 'global'
   or (s.scope = 'company' and s.tenant_id = app.current_tenant_id());


-- >>> migrations\0005_mobile.sql >>>

-- =============================================================================
-- 0005_mobile.sql — Views/föll sem mobile-app starfsmanns notar
-- =============================================================================

-- --- VIEW: verkefni sem NÚVERANDI starfsmaður má skrá sig á ----------------
create or replace view v_my_projects
  with (security_invoker = on) as
select
  p.id, p.project_no, p.name, p.address, p.status,
  pl.radius_m,
  ST_Y(pl.center::geometry) as lat,
  ST_X(pl.center::geometry) as lng
from employee_projects ep
join employees e on e.id = ep.employee_id and e.user_id = app.current_user_id()
join projects  p on p.id = ep.project_id and p.status = 'active'
left join project_locations pl on pl.project_id = p.id and pl.is_primary;

-- --- RPC: skrá staðsetningu meðan innskráður; skilar hvort innan svæðis ----
-- Kallað reglulega af appinu. Reiknar inside/outside server-side.
create or replace function app.log_location(
  p_time_entry_id uuid,
  p_lat           double precision,
  p_lng           double precision,
  p_accuracy      numeric default null
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_tenant   uuid := app.current_tenant_id();
  v_point    geography := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography;
  v_entry    time_entries;
  v_loc      project_locations;
  v_inside   boolean;
  v_prev     boolean;
  v_event    text := null;
begin
  select * into v_entry from time_entries
   where id = p_time_entry_id and check_out_at is null;
  if v_entry is null then
    raise exception 'NO_ACTIVE_ENTRY';
  end if;

  select * into v_loc from project_locations
   where project_id = v_entry.project_id and is_primary
   order by created_at limit 1;

  v_inside := ST_DWithin(v_point, v_loc.center, v_loc.radius_m);

  -- greina atburð (fór út / sneri aftur) m.v. síðustu mælingu
  select inside_geofence into v_prev from location_logs
   where time_entry_id = p_time_entry_id
   order by recorded_at desc limit 1;
  if v_prev is not null then
    if v_prev and not v_inside then v_event := 'left_area';
    elsif not v_prev and v_inside then v_event := 'returned';
    end if;
  end if;

  insert into location_logs (tenant_id, time_entry_id, recorded_at, location,
                             accuracy_m, inside_geofence, event_type)
  values (v_tenant, p_time_entry_id, now(), v_point, p_accuracy, v_inside, v_event);

  return v_inside;
end $$;

-- --- VIEW: virk skráning núverandi starfsmanns (fyrir home/active skjá) ----
create or replace view v_my_active_entry
  with (security_invoker = on) as
select
  te.id, te.project_id, te.check_in_at,
  p.name as project_name, p.project_no,
  pl.radius_m,
  ST_Y(pl.center::geometry) as lat,
  ST_X(pl.center::geometry) as lng
from time_entries te
join employees e on e.id = te.employee_id and e.user_id = app.current_user_id()
join projects  p on p.id = te.project_id
left join project_locations pl on pl.project_id = p.id and pl.is_primary
where te.check_out_at is null;


-- >>> migrations\0006_auth.sql >>>

-- =============================================================================
-- 0006_auth.sql — Tenging við Supabase Auth + tenant-upplausn án JWT-hooks
-- Lykilbreyting: current_tenant_id/current_user_id/has_role fletta upp í
-- users-töflunni út frá auth.uid() (SECURITY DEFINER => sleppa við RLS-endurkvæmni).
-- Þannig þarf EKKI að setja tenant_id handvirkt í app_metadata.
-- =============================================================================

-- tenant_id núverandi notanda — uppfletting í users (bypassar RLS)
create or replace function app.current_tenant_id()
returns uuid language sql stable security definer set search_path = public as $$
  select tenant_id from public.users where auth_user_id = auth.uid() limit 1
$$;

-- innra users.id núverandi notanda
create or replace function app.current_user_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.users where auth_user_id = auth.uid() limit 1
$$;

-- hefur notandi tiltekið hlutverk?
create or replace function app.has_role(p_role text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.users u on u.id = ur.user_id
    join public.roles r on r.id = ur.role_id
    where u.auth_user_id = auth.uid()
      and r.name = p_role
  )
$$;

-- =============================================================================
-- Sjálfvirk tenging: þegar Supabase Auth notandi verður til, tengjum hann
-- við users-röð með sama netfangi/síma (ef til er og ótengd).
-- Þetta gerir prófun einfalda: búðu til Auth-notanda 'admin@verktak.is' →
-- tengist sjálfkrafa seed-notandanum → tenant + hlutverk leysast.
-- =============================================================================
create or replace function app.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.users
     set auth_user_id = new.id,
         phone_verified_at = coalesce(phone_verified_at, now())
   where auth_user_id is null
     and (
       (new.email is not null and email = new.email) or
       (new.phone is not null and phone = new.phone)
     );
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_auth_user();


-- >>> migrations\0007_public_api.sql >>>

-- =============================================================================
-- 0007_public_api.sql — Afhjúpa RPC fyrir PostgREST + réttindi
-- PostgREST afhjúpar aðeins `public`-skema. RPC-föllin eru í `app`, svo við
-- búum til þunnar public-vörpur. Einnig: réttindi svo `authenticated`/`anon`
-- geti keyrt RLS-hjálparföllin í `app`.
-- =============================================================================

-- Réttindi: authenticated/anon þurfa að ná í app-skema (RLS-policy köll)
grant usage on schema app to anon, authenticated, service_role;
grant execute on all functions in schema app to anon, authenticated, service_role;

-- Réttindi á public (RLS gætir áfram raunaðgangs)
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public
  to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;

-- =============================================================================
-- Public-vörpur fyrir RPC sem appið kallar á
-- =============================================================================
create or replace function public.check_in(
  p_project_id uuid, p_lat double precision, p_lng double precision,
  p_accuracy numeric default null, p_note text default null
) returns public.time_entries language sql security definer set search_path = public as $$
  select app.check_in(p_project_id, p_lat, p_lng, p_accuracy, p_note)
$$;

create or replace function public.check_out(
  p_time_entry_id uuid, p_lat double precision default null,
  p_lng double precision default null, p_accuracy numeric default null,
  p_note text default null
) returns public.time_entries language sql security definer set search_path = public as $$
  select app.check_out(p_time_entry_id, p_lat, p_lng, p_accuracy, p_note)
$$;

create or replace function public.auto_check_out(
  p_time_entry_id uuid, p_reason text, p_effective_at timestamptz default now()
) returns public.time_entries language sql security definer set search_path = public as $$
  select app.auto_check_out(p_time_entry_id, p_reason, p_effective_at)
$$;

create or replace function public.review_time_entry(
  p_time_entry_id uuid, p_decision text, p_reason text default null
) returns public.time_entries language sql security definer set search_path = public as $$
  select app.review_time_entry(p_time_entry_id, p_decision, p_reason)
$$;

create or replace function public.log_location(
  p_time_entry_id uuid, p_lat double precision, p_lng double precision,
  p_accuracy numeric default null
) returns boolean language sql security definer set search_path = public as $$
  select app.log_location(p_time_entry_id, p_lat, p_lng, p_accuracy)
$$;

create or replace function public.create_project(
  p_project_no text, p_name text, p_description text, p_address text,
  p_manager_user_id uuid, p_start_date date, p_end_date date,
  p_lat double precision, p_lng double precision, p_radius_m integer
) returns public.projects language sql security definer set search_path = public as $$
  select app.create_project(p_project_no, p_name, p_description, p_address,
    p_manager_user_id, p_start_date, p_end_date, p_lat, p_lng, p_radius_m)
$$;

create or replace function public.update_project(
  p_id uuid, p_name text, p_description text, p_address text,
  p_manager_user_id uuid, p_start_date date, p_end_date date, p_status text,
  p_lat double precision, p_lng double precision, p_radius_m integer
) returns public.projects language sql security definer set search_path = public as $$
  select app.update_project(p_id, p_name, p_description, p_address,
    p_manager_user_id, p_start_date, p_end_date, p_status, p_lat, p_lng, p_radius_m)
$$;

create or replace function public.create_employee(
  p_full_name text, p_employee_no text, p_phone text, p_email text, p_national_id text
) returns public.employees language sql security definer set search_path = public as $$
  select app.create_employee(p_full_name, p_employee_no, p_phone, p_email, p_national_id)
$$;

create or replace function public.update_employee(
  p_id uuid, p_full_name text, p_phone text, p_email text, p_status text
) returns public.employees language sql security definer set search_path = public as $$
  select app.update_employee(p_id, p_full_name, p_phone, p_email, p_status)
$$;

create or replace function public.set_employee_projects(
  p_employee_id uuid, p_project_ids uuid[]
) returns void language sql security definer set search_path = public as $$
  select app.set_employee_projects(p_employee_id, p_project_ids)
$$;

create or replace function public.set_company_setting(
  p_key text, p_value jsonb
) returns void language sql security definer set search_path = public as $$
  select app.set_company_setting(p_key, p_value)
$$;

-- Hlutverk núverandi notanda (fyrir innskráningar-beiningu)
create or replace function public.my_roles()
returns text[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(r.name), '{}')
  from user_roles ur
  join users u on u.id = ur.user_id
  join roles r on r.id = ur.role_id
  where u.auth_user_id = auth.uid()
$$;

grant execute on all functions in schema public to anon, authenticated, service_role;

-- Endurhlaða PostgREST schema cache
notify pgrst, 'reload schema';


-- >>> migrations\0008_fix_pgcrypto.sql >>>

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


-- >>> migrations\0009_employee_login.sql >>>

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


-- >>> migrations\0010_set_password.sql >>>

-- =============================================================================
-- 0010_set_password.sql — Setja/breyta lykilorði á EXISTING starfsmanni
-- Tvö tilvik:
--   (a) starfsmaður hefur þegar innskráningu  -> breyta lykilorði
--   (b) starfsmaður hefur enga innskráningu    -> stofna hana (auth + identity + tenging)
-- =============================================================================
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

  -- Er starfsmaður þegar tengdur auth-notanda?
  select u.auth_user_id into v_auth from users u where u.id = v_emp.user_id;

  if v_auth is not null then
    -- (a) Breyta lykilorði
    update auth.users
       set encrypted_password = crypt(p_password, gen_salt('bf')), updated_at = now()
     where id = v_auth;
    perform app.write_audit(v_tenant, v_actor, 'update', 'employee', v_emp.id,
      jsonb_build_object('password_changed', true));
    return;
  end if;

  -- (b) Stofna innskráningu — krefst netfangs
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
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    '', '', '', ''
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
    -- enginn kerfis-notandi til: búa til og tengja
    insert into users (tenant_id, auth_user_id, email, phone, status)
    values (v_tenant, v_auth, v_email, v_emp.phone, 'active')
    returning id into v_user_id;
    insert into user_roles (user_id, role_id)
    select v_user_id, id from roles where name = 'employee';
    update employees set user_id = v_user_id where id = v_emp.id;
  else
    -- kerfis-notandi til en ótengdur auth: tengja
    update users set auth_user_id = v_auth, email = coalesce(email, v_email)
     where id = v_emp.user_id;
    insert into user_roles (user_id, role_id)
    select v_emp.user_id, id from roles where name = 'employee'
    on conflict do nothing;
  end if;

  perform app.write_audit(v_tenant, v_actor, 'update', 'employee', v_emp.id,
    jsonb_build_object('login_created', true));
end $$;

create or replace function public.set_employee_password(
  p_employee_id uuid, p_password text
) returns void language sql security definer set search_path = public as $$
  select app.set_employee_password(p_employee_id, p_password)
$$;

grant execute on function public.set_employee_password(uuid, text)
  to anon, authenticated, service_role;

notify pgrst, 'reload schema';


-- >>> migrations\0011_mail.sql >>>

-- =============================================================================
-- 0011_mail.sql — Póstgátt (mail gateway) fyrir hóp 2 (vettvangsstarfsmenn)
-- Hópur 1 = venjulegir Microsoft 365 notendur (EKKI í þessu kerfi).
-- Hópur 2 = starfsmenn sem nota appið sem innhólf í stað M365-leyfis.
-- Multi-tenant eins og annað: tenant_id + RLS.
-- =============================================================================

-- --- Hverjir taka við pósti í appinu -----------------------------------------
create table group2_recipients (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references companies(id) on delete cascade,
  email      citext not null,
  user_id    uuid references users(id) on delete set null,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  constraint group2_email_uq unique (email)   -- netfang er hnattrænt einkvæmt í póstkerfi
);
create index group2_recipients_tenant_idx on group2_recipients (tenant_id);

-- --- Móttekinn póstur ---------------------------------------------------------
create table inbound_emails (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references companies(id) on delete cascade,
  recipient_email   citext not null,
  recipient_user_id uuid references users(id) on delete set null,
  sender_email      text not null,
  sender_name       text,
  subject           text,
  body_text         text,
  body_html         text,                          -- ALLTAF hreinsað (sanitize) við móttöku
  received_at       timestamptz not null default now(),
  read_at           timestamptz,
  status            text not null default 'received'
                      check (status in ('received','archived')),
  is_test           boolean not null default false, -- prófunargögn merkt skýrt
  raw_payload_json  jsonb,
  created_at        timestamptz not null default now()
);
create index inbound_emails_recipient_idx on inbound_emails (recipient_user_id, received_at desc);
create index inbound_emails_tenant_idx on inbound_emails (tenant_id, received_at desc);

-- --- Sendur póstur ------------------------------------------------------------
create table outbound_emails (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references companies(id) on delete cascade,
  sender_user_id      uuid references users(id) on delete set null,
  from_email          citext not null,
  to_email            text not null,
  subject             text,
  body_text           text,
  in_reply_to         uuid references inbound_emails(id) on delete set null,
  provider_message_id text,
  status              text not null default 'queued'
                        check (status in ('queued','sent','mock_sent','failed')),
  sent_at             timestamptz,
  created_at          timestamptz not null default now()
);
create index outbound_emails_sender_idx on outbound_emails (sender_user_id, created_at desc);

-- --- Viðhengi (geymd í Supabase Storage síðar) --------------------------------
create table email_attachments (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references companies(id) on delete cascade,
  inbound_email_id uuid not null references inbound_emails(id) on delete cascade,
  filename         text not null,
  content_type     text,
  storage_path     text,
  size_bytes       integer,
  created_at       timestamptz not null default now()
);
create index email_attachments_email_idx on email_attachments (inbound_email_id);

-- =============================================================================
-- RLS
-- =============================================================================
alter table group2_recipients enable row level security;
alter table inbound_emails    enable row level security;
alter table outbound_emails   enable row level security;
alter table email_attachments enable row level security;

-- Móttakendur: allir í tenant lesa; aðeins admin breytir
create policy g2_select on group2_recipients for select
  using (tenant_id = app.current_tenant_id());
create policy g2_admin on group2_recipients for all
  using (tenant_id = app.current_tenant_id() and app.has_role('admin'))
  with check (tenant_id = app.current_tenant_id() and app.has_role('admin'));

-- Innhólf: starfsmaður sér AÐEINS sinn póst; admin sér allt í tenant.
-- Ekkert insert-policy: aðeins service role (webhook) setur inn póst.
create policy inbound_select on inbound_emails for select
  using (
    tenant_id = app.current_tenant_id()
    and (recipient_user_id = app.current_user_id() or app.has_role('admin'))
  );

-- Sent: sendandi sér sitt; admin allt
create policy outbound_select on outbound_emails for select
  using (
    tenant_id = app.current_tenant_id()
    and (sender_user_id = app.current_user_id() or app.has_role('admin'))
  );

-- Viðhengi fylgja aðgangi að póstinum
create policy attach_select on email_attachments for select
  using (exists (
    select 1 from inbound_emails ie
    where ie.id = email_attachments.inbound_email_id
      and ie.tenant_id = app.current_tenant_id()
      and (ie.recipient_user_id = app.current_user_id() or app.has_role('admin'))
  ));

-- =============================================================================
-- ÞJÓNUSTUFÖLL (service layer í gagnagrunni)
-- =============================================================================

-- Er netfang virkur hóps-2 móttakandi? (notað af webhook + admin)
create or replace function app.mail_is_group2(p_email text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from group2_recipients
    where email = p_email and active = true
  )
$$;

-- Vista mótttekinn póst (kallað af webhook með service role; einnig nothæft í seed)
create or replace function app.mail_save_inbound(
  p_recipient text, p_sender_email text, p_sender_name text,
  p_subject text, p_body_text text, p_body_html text,
  p_raw jsonb default null, p_is_test boolean default false
) returns inbound_emails
language plpgsql security definer set search_path = public as $$
declare
  v_rec group2_recipients;
  v_row inbound_emails;
begin
  select * into v_rec from group2_recipients
   where email = p_recipient and active = true;
  if v_rec is null then
    raise exception 'NOT_GROUP2: % er ekki virkur hóps-2 móttakandi', p_recipient;
  end if;

  insert into inbound_emails (
    tenant_id, recipient_email, recipient_user_id, sender_email, sender_name,
    subject, body_text, body_html, raw_payload_json, is_test)
  values (
    v_rec.tenant_id, p_recipient, v_rec.user_id, p_sender_email, p_sender_name,
    p_subject, p_body_text, p_body_html, p_raw, p_is_test)
  returning * into v_row;
  return v_row;
end $$;

-- Merkja póst lesinn (aðeins eigin póst)
create or replace function app.mail_mark_read(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update inbound_emails
     set read_at = coalesce(read_at, now())
   where id = p_id and recipient_user_id = app.current_user_id();
end $$;

-- Senda póst (MVP: 'mock_sent' — engin póstveita tengd enn; webhook/veita síðar)
create or replace function app.mail_send(
  p_to text, p_subject text, p_body text, p_reply_to uuid default null
) returns outbound_emails
language plpgsql security definer set search_path = public as $$
declare
  v_user  uuid := app.current_user_id();
  v_from  citext;
  v_row   outbound_emails;
begin
  if v_user is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select email into v_from from users where id = v_user;
  if v_from is null then raise exception 'NO_SENDER_EMAIL'; end if;

  insert into outbound_emails (
    tenant_id, sender_user_id, from_email, to_email, subject, body_text,
    in_reply_to, status, sent_at)
  values (
    app.current_tenant_id(), v_user, v_from, p_to, p_subject, p_body,
    p_reply_to, 'mock_sent', now())
  returning * into v_row;
  return v_row;
end $$;

-- Admin: stofna/tengja hóps-2 móttakanda. Býr til users-röð ef netfang finnst ekki.
create or replace function app.mail_upsert_recipient(
  p_email text, p_full_name text default null
) returns group2_recipients
language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_user   uuid;
  v_row    group2_recipients;
begin
  if not app.has_role('admin') then raise exception 'FORBIDDEN'; end if;

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

-- Admin: virkja/afvirkja móttakanda
create or replace function app.mail_set_recipient_active(p_id uuid, p_active boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not app.has_role('admin') then raise exception 'FORBIDDEN'; end if;
  update group2_recipients set active = p_active
   where id = p_id and tenant_id = app.current_tenant_id();
end $$;

-- --- VIEW: innhólf og sent fyrir núverandi notanda ---------------------------
create or replace view v_my_inbox with (security_invoker = on) as
select id, recipient_email, sender_email, sender_name, subject,
       body_text, body_html, received_at, read_at, status, is_test
from inbound_emails
where recipient_user_id = app.current_user_id()
order by received_at desc;

create or replace view v_my_sent with (security_invoker = on) as
select id, from_email, to_email, subject, body_text, in_reply_to,
       status, sent_at, created_at
from outbound_emails
where sender_user_id = app.current_user_id()
order by created_at desc;

-- =============================================================================
-- Public-vörpur fyrir PostgREST
-- =============================================================================
create or replace function public.mail_is_group2(p_email text)
returns boolean language sql security definer set search_path = public as $$
  select app.mail_is_group2(p_email)
$$;

create or replace function public.mail_save_inbound(
  p_recipient text, p_sender_email text, p_sender_name text,
  p_subject text, p_body_text text, p_body_html text,
  p_raw jsonb default null, p_is_test boolean default false
) returns public.inbound_emails language sql security definer set search_path = public as $$
  select app.mail_save_inbound(p_recipient, p_sender_email, p_sender_name,
    p_subject, p_body_text, p_body_html, p_raw, p_is_test)
$$;

create or replace function public.mail_mark_read(p_id uuid)
returns void language sql security definer set search_path = public as $$
  select app.mail_mark_read(p_id)
$$;

create or replace function public.mail_send(
  p_to text, p_subject text, p_body text, p_reply_to uuid default null
) returns public.outbound_emails language sql security definer set search_path = public as $$
  select app.mail_send(p_to, p_subject, p_body, p_reply_to)
$$;

create or replace function public.mail_upsert_recipient(p_email text, p_full_name text default null)
returns public.group2_recipients language sql security definer set search_path = public as $$
  select app.mail_upsert_recipient(p_email, p_full_name)
$$;

create or replace function public.mail_set_recipient_active(p_id uuid, p_active boolean)
returns void language sql security definer set search_path = public as $$
  select app.mail_set_recipient_active(p_id, p_active)
$$;

grant select, insert, update, delete on group2_recipients, inbound_emails,
  outbound_emails, email_attachments to anon, authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;
grant execute on all functions in schema app to anon, authenticated, service_role;

notify pgrst, 'reload schema';


-- >>> migrations\0012_mail_employees.sql >>>

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


-- >>> migrations\0013_attachments.sql >>>

-- =============================================================================
-- 0013_attachments.sql — Viðhengi í pósti (myndir/skrár, inn og út)
-- Skrár geymdar í Supabase Storage (fata: mail-attachments, einkarekin).
-- Slóðaregla: útsend = <auth_uid>/<skra>, móttekin = inbound/<email_id>/<skra>.
-- =============================================================================

-- (a) Viðhengi geta nú tengst útsendum pósti líka
alter table email_attachments
  alter column inbound_email_id drop not null;
alter table email_attachments
  add column if not exists outbound_email_id uuid references outbound_emails(id) on delete cascade;
alter table email_attachments
  add constraint email_attachments_parent_chk
  check (inbound_email_id is not null or outbound_email_id is not null);
create index if not exists email_attachments_outbound_idx
  on email_attachments (outbound_email_id);

-- (b) RLS: sendandi sér viðhengi eigin sendra skeyta (móttakandi óbreytt frá 0011)
drop policy if exists attach_select on email_attachments;
create policy attach_select on email_attachments for select
  using (
    exists (
      select 1 from inbound_emails ie
      where ie.id = email_attachments.inbound_email_id
        and ie.tenant_id = app.current_tenant_id()
        and (ie.recipient_user_id = app.current_user_id() or app.has_role('admin'))
    )
    or exists (
      select 1 from outbound_emails oe
      where oe.id = email_attachments.outbound_email_id
        and oe.tenant_id = app.current_tenant_id()
        and (oe.sender_user_id = app.current_user_id() or app.has_role('admin'))
    )
  );

-- (c) RPC: tengja upphlaðið viðhengi við útsent skeyti (aðeins eigið skeyti)
create or replace function app.mail_add_outbound_attachment(
  p_outbound_id uuid, p_filename text, p_content_type text,
  p_storage_path text, p_size_bytes integer
) returns email_attachments
language plpgsql security definer set search_path = public as $$
declare
  v_out outbound_emails;
  v_row email_attachments;
begin
  select * into v_out from outbound_emails
   where id = p_outbound_id and sender_user_id = app.current_user_id();
  if v_out is null then
    raise exception 'NOT_FOUND: Skeyti fannst ekki eða er ekki þitt';
  end if;

  insert into email_attachments (
    tenant_id, outbound_email_id, filename, content_type, storage_path, size_bytes)
  values (v_out.tenant_id, p_outbound_id, p_filename, p_content_type,
          p_storage_path, p_size_bytes)
  returning * into v_row;
  return v_row;
end $$;

create or replace function public.mail_add_outbound_attachment(
  p_outbound_id uuid, p_filename text, p_content_type text,
  p_storage_path text, p_size_bytes integer
) returns public.email_attachments language sql security definer set search_path = public as $$
  select app.mail_add_outbound_attachment(p_outbound_id, p_filename,
    p_content_type, p_storage_path, p_size_bytes)
$$;

grant execute on all functions in schema public to anon, authenticated, service_role;
grant execute on all functions in schema app to anon, authenticated, service_role;

-- (d) Storage-fata (einkarekin, 10 MB hámark)
insert into storage.buckets (id, name, public, file_size_limit)
values ('mail-attachments', 'mail-attachments', false, 10485760)
on conflict (id) do nothing;

-- (e) Storage-aðgangsreglur
-- Upphal: innskráður notandi má aðeins skrifa undir eigin auth-uid möppu
drop policy if exists mail_att_insert on storage.objects;
create policy mail_att_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'mail-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Lestur: eigin upphöl, EÐA viðhengi pósts sem notandinn má sjá (inn/út)
drop policy if exists mail_att_select on storage.objects;
create policy mail_att_select on storage.objects for select to authenticated
  using (
    bucket_id = 'mail-attachments'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1 from public.email_attachments ea
        join public.inbound_emails ie on ie.id = ea.inbound_email_id
        where ea.storage_path = name
          and ie.recipient_user_id = app.current_user_id()
      )
      or exists (
        select 1 from public.email_attachments ea
        join public.outbound_emails oe on oe.id = ea.outbound_email_id
        where ea.storage_path = name
          and oe.sender_user_id = app.current_user_id()
      )
    )
  );

-- Eyðing: notandi má eyða eigin upphölum (t.d. hætta við viðhengi)
drop policy if exists mail_att_delete on storage.objects;
create policy mail_att_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'mail-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

notify pgrst, 'reload schema';


-- >>> migrations\0014_multitenant_super.sql >>>

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


-- >>> migrations\0015_star_sort.sql >>>

-- =============================================================================
-- 0015_star_sort.sql — Eftirlæti (stjarna) á póst + uppfært innhólfs-view
-- =============================================================================

alter table inbound_emails add column if not exists is_starred boolean not null default false;
create index if not exists inbound_emails_star_idx
  on inbound_emails (recipient_user_id, is_starred) where is_starred;

-- Merkja/afmerkja eftirlæti (aðeins eigin póst)
create or replace function app.mail_set_star(p_id uuid, p_star boolean)
returns void language sql security definer set search_path = public as $$
  update inbound_emails set is_starred = p_star
   where id = p_id and recipient_user_id = app.current_user_id()
$$;

create or replace function public.mail_set_star(p_id uuid, p_star boolean)
returns void language sql security definer set search_path = public as $$
  select app.mail_set_star(p_id, p_star)
$$;

-- v_my_inbox með stjörnu
create or replace view v_my_inbox with (security_invoker = on) as
select id, recipient_email, sender_email, sender_name, subject,
       body_text, body_html, received_at, read_at, status, is_test, is_starred
from inbound_emails
where recipient_user_id = app.current_user_id()
order by received_at desc;

grant execute on all functions in schema public to anon, authenticated, service_role;
grant execute on all functions in schema app to anon, authenticated, service_role;

notify pgrst, 'reload schema';


-- >>> migrations\0016_fix_ann_rls.sql >>>

-- =============================================================================
-- 0016_fix_ann_rls.sql — Laga RLS-endurkvæmni í tilkynningum (42P17)
-- Reglurnar á announcements og announcement_reads vísuðu hvor í aðra.
-- Lausn: SECURITY DEFINER hjálparföll (fara framhjá RLS) rjúfa hringinn.
-- =============================================================================

-- Er núverandi notandi viðtakandi tilkynningar? (framhjá RLS)
create or replace function app.ann_is_recipient(p_ann uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from announcement_reads
    where announcement_id = p_ann and user_id = app.current_user_id()
  )
$$;

-- Er núverandi notandi sendandi/stjórnandi tilkynningar? (framhjá RLS)
create or replace function app.ann_is_sender_or_manager(p_ann uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from announcements a
    where a.id = p_ann
      and a.tenant_id = app.current_tenant_id()
      and (a.sender_user_id = app.current_user_id()
           or app.has_role('admin') or app.has_role('project_manager'))
  )
$$;

drop policy if exists ann_select on announcements;
create policy ann_select on announcements for select
  using (
    tenant_id = app.current_tenant_id()
    and (
      sender_user_id = app.current_user_id()
      or app.has_role('admin') or app.has_role('project_manager')
      or app.ann_is_recipient(id)
    )
  );

drop policy if exists ann_reads_select on announcement_reads;
create policy ann_reads_select on announcement_reads for select
  using (
    user_id = app.current_user_id()
    or app.ann_is_sender_or_manager(announcement_id)
  );

grant execute on all functions in schema app to anon, authenticated, service_role;

notify pgrst, 'reload schema';


-- >>> migrations\0017_seats_acting.sql >>>

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


-- >>> migrations\0018_super_powers.sql >>>

-- =============================================================================
-- 0018_super_powers.sql — Super admin fær full réttindi í öllum félögum + yfirlit
-- =============================================================================

-- (a) LYKILBREYTING: super_admin uppfyllir sjálfkrafa 'admin' og 'project_manager'
--     kröfur alls staðar (create_project, starfsmenn, póstur, tilkynningar, stillingar...).
--     Ein breyting hér nær yfir öll föll sem kalla app.has_role.
create or replace function app.has_role(p_role text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.users u on u.id = ur.user_id
    join public.roles r on r.id = ur.role_id
    where u.auth_user_id = auth.uid()
      and (
        r.name = p_role
        or (p_role in ('admin','project_manager') and r.name = 'super_admin')
      )
  )
$$;

-- (b) Starfsmannayfirlit félags fyrir super admin (skjáborð)
create or replace function app.su_company_employees(p_company uuid)
returns table(
  id uuid, full_name text, employee_no text, email text, phone text,
  status text, has_login boolean, mail_inbox boolean
) language plpgsql stable security definer set search_path = public as $$
begin
  if not app.has_role('super_admin') then raise exception 'FORBIDDEN'; end if;
  return query
    select e.id, e.full_name, e.employee_no, e.email::text, e.phone, e.status,
      exists (select 1 from users u
               where u.id = e.user_id and u.auth_user_id is not null),
      exists (select 1 from group2_recipients g
               where g.email = e.email and g.active)
    from employees e
    where e.tenant_id = p_company
    order by e.full_name;
end $$;

-- (c) Félagayfirlit með verkefnafjölda líka (skipt út eldri útgáfu)
drop function if exists public.su_companies_overview();
drop function if exists app.su_companies_overview();
create or replace function app.su_companies_overview()
returns table(
  id uuid, name text, domain text, status text, created_at timestamptz,
  max_employees int, active_employees bigint, active_projects bigint, admin_email text
) language plpgsql stable security definer set search_path = public as $$
begin
  if not app.has_role('super_admin') then raise exception 'FORBIDDEN'; end if;
  return query
    select c.id, c.name, c.domain, c.status, c.created_at, c.max_employees,
      (select count(*) from employees e
        where e.tenant_id = c.id and e.status = 'active'),
      (select count(*) from projects p
        where p.tenant_id = c.id and p.status = 'active'),
      (select u.email::text from users u
        join user_roles ur on ur.user_id = u.id
        join roles r on r.id = ur.role_id
        where u.tenant_id = c.id and r.name = 'admin'
        order by u.created_at limit 1)
    from companies c
    order by c.created_at;
end $$;

create or replace function public.su_companies_overview()
returns table(
  id uuid, name text, domain text, status text, created_at timestamptz,
  max_employees int, active_employees bigint, active_projects bigint, admin_email text
) language sql stable security definer set search_path = public as $$
  select * from app.su_companies_overview()
$$;

create or replace function public.su_company_employees(p_company uuid)
returns table(
  id uuid, full_name text, employee_no text, email text, phone text,
  status text, has_login boolean, mail_inbox boolean
) language sql stable security definer set search_path = public as $$
  select * from app.su_company_employees(p_company)
$$;

grant execute on all functions in schema public to anon, authenticated, service_role;
grant execute on all functions in schema app to anon, authenticated, service_role;

notify pgrst, 'reload schema';


-- >>> migrations\0019_super_dashboard.sql >>>

-- =============================================================================
-- 0019_super_dashboard.sql — Breyta félögum + ítarlegri tölfræði á yfirlit
-- =============================================================================

-- (a) Breyta félagi (nafn, lén, staða, sæti)
create or replace function app.su_update_company(
  p_id uuid, p_name text, p_domain text, p_status text, p_max_employees int
) returns companies
language plpgsql security definer set search_path = public as $$
declare v_comp companies;
begin
  if not app.has_role('super_admin') then raise exception 'FORBIDDEN'; end if;
  if p_status not in ('active','suspended') then raise exception 'BAD_STATUS'; end if;
  if p_max_employees is null or p_max_employees < 1 then raise exception 'BAD_SEATS'; end if;

  update companies set
    name = p_name,
    domain = lower(nullif(trim(p_domain), '')),
    status = p_status,
    max_employees = p_max_employees
  where id = p_id
  returning * into v_comp;
  if v_comp is null then raise exception 'NOT_FOUND'; end if;

  perform app.write_audit(p_id, app.current_user_id(), 'update', 'company', p_id,
    jsonb_build_object('name', p_name, 'domain', p_domain,
                       'status', p_status, 'max_employees', p_max_employees));
  return v_comp;
end $$;

create or replace function public.su_update_company(
  p_id uuid, p_name text, p_domain text, p_status text, p_max_employees int
) returns public.companies language sql security definer set search_path = public as $$
  select app.su_update_company(p_id, p_name, p_domain, p_status, p_max_employees)
$$;

-- (b) Yfirlit með virkum OG óvirkum notendum/verkefnum
drop function if exists public.su_companies_overview();
drop function if exists app.su_companies_overview();
create or replace function app.su_companies_overview()
returns table(
  id uuid, name text, domain text, status text, created_at timestamptz,
  max_employees int,
  active_employees bigint, inactive_employees bigint,
  active_projects bigint, inactive_projects bigint,
  admin_email text
) language plpgsql stable security definer set search_path = public as $$
begin
  if not app.has_role('super_admin') then raise exception 'FORBIDDEN'; end if;
  return query
    select c.id, c.name, c.domain, c.status, c.created_at, c.max_employees,
      (select count(*) from employees e where e.tenant_id = c.id and e.status = 'active'),
      (select count(*) from employees e where e.tenant_id = c.id and e.status = 'inactive'),
      (select count(*) from projects p where p.tenant_id = c.id and p.status = 'active'),
      (select count(*) from projects p where p.tenant_id = c.id and p.status = 'inactive'),
      (select u.email::text from users u
        join user_roles ur on ur.user_id = u.id
        join roles r on r.id = ur.role_id
        where u.tenant_id = c.id and r.name = 'admin'
        order by u.created_at limit 1)
    from companies c
    order by c.created_at;
end $$;

create or replace function public.su_companies_overview()
returns table(
  id uuid, name text, domain text, status text, created_at timestamptz,
  max_employees int,
  active_employees bigint, inactive_employees bigint,
  active_projects bigint, inactive_projects bigint,
  admin_email text
) language sql stable security definer set search_path = public as $$
  select * from app.su_companies_overview()
$$;

grant execute on all functions in schema public to anon, authenticated, service_role;
grant execute on all functions in schema app to anon, authenticated, service_role;

notify pgrst, 'reload schema';


-- >>> migrations\0020_no_create_while_acting.sql >>>

-- =============================================================================
-- 0020_no_create_while_acting.sql — Ekki stofna félag meðan unnið er sem félag
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
begin
  if not app.has_role('super_admin') then
    raise exception 'FORBIDDEN: Aðeins yfirstjórnandi stofnar félög';
  end if;
  -- Ný regla: félag er aðeins stofnað í super-ham (ekkert félag valið)
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

grant execute on all functions in schema app to anon, authenticated, service_role;
notify pgrst, 'reload schema';


-- >>> migrations\0021_domain_emails.sql >>>

-- =============================================================================
-- 0021_domain_emails.sql — Lén félags stýrir netföngum starfsmanna
-- Þegar lén félags er skráð/breytt flytjast netföng starfsmanna (og innskráningar)
-- yfir á nýja lénið: almar@gamla.is -> almar@nyja.is (notandanafn helst).
-- =============================================================================

create or replace function app.su_update_company(
  p_id uuid, p_name text, p_domain text, p_status text, p_max_employees int
) returns companies
language plpgsql security definer set search_path = public as $$
declare
  v_old_domain text;
  v_new_domain text := lower(nullif(trim(p_domain), ''));
  v_comp companies;
  r record;
  v_new_email text;
begin
  if not app.has_role('super_admin') then raise exception 'FORBIDDEN'; end if;
  if p_status not in ('active','suspended') then raise exception 'BAD_STATUS'; end if;
  if p_max_employees is null or p_max_employees < 1 then raise exception 'BAD_SEATS'; end if;

  select lower(domain) into v_old_domain from companies where id = p_id;

  update companies set
    name = p_name,
    domain = v_new_domain,
    status = p_status,
    max_employees = p_max_employees
  where id = p_id
  returning * into v_comp;
  if v_comp is null then raise exception 'NOT_FOUND'; end if;

  -- Lénsbreyting: flytja netföng starfsmanna (og innskráningar) á nýja lénið
  if v_new_domain is not null and v_old_domain is not null
     and v_new_domain <> v_old_domain then
    for r in
      select u.id as user_id, u.auth_user_id, u.email as old_email,
             split_part(u.email::text, '@', 1) as username
      from users u
      where u.tenant_id = p_id and u.email like ('%@' || v_old_domain)
    loop
      v_new_email := r.username || '@' || v_new_domain;
      -- sleppa ef nýja netfangið er þegar til (árekstur)
      if exists (select 1 from auth.users where email = v_new_email)
         or exists (select 1 from users where email = v_new_email::citext) then
        continue;
      end if;

      update users set email = v_new_email::citext where id = r.user_id;
      update employees set email = v_new_email::citext
       where tenant_id = p_id and email = r.old_email;
      update group2_recipients set email = v_new_email::citext
       where email = r.old_email;

      if r.auth_user_id is not null then
        update auth.users set email = v_new_email, updated_at = now()
         where id = r.auth_user_id;
        update auth.identities
           set identity_data = jsonb_set(identity_data, '{email}', to_jsonb(v_new_email))
         where user_id = r.auth_user_id and provider = 'email';
      end if;
    end loop;

    -- starfsmenn án notanda-tengingar en með netfang á gamla léninu
    update employees set email = (split_part(email::text,'@',1) || '@' || v_new_domain)::citext
     where tenant_id = p_id and email like ('%@' || v_old_domain);
  end if;

  perform app.write_audit(p_id, app.current_user_id(), 'update', 'company', p_id,
    jsonb_build_object('name', p_name, 'domain', p_domain,
                       'status', p_status, 'max_employees', p_max_employees,
                       'old_domain', v_old_domain));
  return v_comp;
end $$;

grant execute on all functions in schema app to anon, authenticated, service_role;
notify pgrst, 'reload schema';


-- >>> migrations\0022_admin_domain.sql >>>

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


-- >>> migrations\0023_absences_company_lifecycle.sql >>>

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


-- >>> migrations\0024_internal_messages.sql >>>

-- =============================================================================
-- 0024_internal_messages.sql — Skilaboðakerfi innan kerfis
-- Skeyti á netfang notanda í SAMA félagi afhendist beint í innhólf hans (status
-- 'sent'). Ytri netföng bíða póstveitu ('mock_sent' þar til tölvupóstur virkjast).
-- =============================================================================

alter table outbound_emails
  add column if not exists delivered_inbound_id uuid references inbound_emails(id) on delete set null;

create or replace function app.mail_send(
  p_to text, p_subject text, p_body text, p_reply_to uuid default null
) returns outbound_emails
language plpgsql security definer set search_path = public as $$
declare
  v_user   uuid := app.current_user_id();
  v_tenant uuid := app.current_tenant_id();
  v_from   citext;
  v_to     citext := lower(trim(p_to));
  v_rcpt   users;
  v_sender_name text;
  v_inb    inbound_emails;
  v_row    outbound_emails;
begin
  if v_user is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select email into v_from from users where id = v_user;
  if v_from is null then raise exception 'NO_SENDER_EMAIL'; end if;

  -- Innri viðtakandi? (virkur notandi í sama félagi)
  select * into v_rcpt from users
   where tenant_id = v_tenant and email = v_to and status = 'active';

  insert into outbound_emails (
    tenant_id, sender_user_id, from_email, to_email, subject, body_text,
    in_reply_to, status, sent_at)
  values (
    v_tenant, v_user, v_from, p_to, p_subject, p_body,
    p_reply_to, case when v_rcpt.id is not null then 'sent' else 'mock_sent' end, now())
  returning * into v_row;

  -- Innri afhending: beint í innhólf viðtakanda
  if v_rcpt.id is not null then
    select full_name into v_sender_name
      from employees where user_id = v_user limit 1;

    insert into inbound_emails (
      tenant_id, recipient_email, recipient_user_id, sender_email, sender_name,
      subject, body_text, is_test)
    values (
      v_tenant, v_rcpt.email, v_rcpt.id, v_from,
      coalesce(v_sender_name, v_from::text), p_subject, p_body, false)
    returning * into v_inb;

    update outbound_emails set delivered_inbound_id = v_inb.id
     where id = v_row.id;
    v_row.delivered_inbound_id := v_inb.id;
  end if;

  return v_row;
end $$;

-- Viðhengi fylgja innri afhendingu: tengja líka við innhólfs-afritið
create or replace function app.mail_add_outbound_attachment(
  p_outbound_id uuid, p_filename text, p_content_type text,
  p_storage_path text, p_size_bytes integer
) returns email_attachments
language plpgsql security definer set search_path = public as $$
declare
  v_out outbound_emails;
  v_row email_attachments;
begin
  select * into v_out from outbound_emails
   where id = p_outbound_id and sender_user_id = app.current_user_id();
  if v_out is null then
    raise exception 'NOT_FOUND: Skeyti fannst ekki eða er ekki þitt';
  end if;

  insert into email_attachments (
    tenant_id, outbound_email_id, filename, content_type, storage_path, size_bytes)
  values (v_out.tenant_id, p_outbound_id, p_filename, p_content_type,
          p_storage_path, p_size_bytes)
  returning * into v_row;

  if v_out.delivered_inbound_id is not null then
    insert into email_attachments (
      tenant_id, inbound_email_id, filename, content_type, storage_path, size_bytes)
    values (v_out.tenant_id, v_out.delivered_inbound_id, p_filename, p_content_type,
            p_storage_path, p_size_bytes);
  end if;

  return v_row;
end $$;

grant execute on all functions in schema app to anon, authenticated, service_role;
notify pgrst, 'reload schema';


-- >>> migrations\0025_fix_reply_delivery.sql >>>

-- =============================================================================
-- 0025_fix_reply_delivery.sql — Innri afhending þvert á félög
-- Vandi: mail_send fann viðtakanda aðeins í félagi SENDANDA. Svar frá starfsmanni
-- til stjórnanda í öðru félagi (t.d. super admin) skilaði sér því ekki.
-- Lausn: leita að viðtakanda í ÖLLUM félögum; innhólfsfærslan fær tenant
-- viðtakandans (RLS hans). Einnig: endurafhenda föst innri skeyti (one-time).
-- =============================================================================

create or replace function app.mail_send(
  p_to text, p_subject text, p_body text, p_reply_to uuid default null
) returns outbound_emails
language plpgsql security definer set search_path = public as $$
declare
  v_user   uuid := app.current_user_id();
  v_tenant uuid := app.current_tenant_id();
  v_from   citext;
  v_to     citext := lower(trim(p_to));
  v_rcpt   users;
  v_sender_name text;
  v_inb    inbound_emails;
  v_row    outbound_emails;
begin
  if v_user is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select email into v_from from users where id = v_user;
  if v_from is null then raise exception 'NO_SENDER_EMAIL'; end if;

  -- Innri viðtakandi í HVAÐA félagi sem er (sama félag í forgangi ef tvítekið)
  select * into v_rcpt from users
   where email = v_to and status = 'active'
   order by (tenant_id = v_tenant) desc, created_at
   limit 1;

  insert into outbound_emails (
    tenant_id, sender_user_id, from_email, to_email, subject, body_text,
    in_reply_to, status, sent_at)
  values (
    v_tenant, v_user, v_from, p_to, p_subject, p_body,
    p_reply_to, case when v_rcpt.id is not null then 'sent' else 'mock_sent' end, now())
  returning * into v_row;

  if v_rcpt.id is not null then
    select full_name into v_sender_name
      from employees where user_id = v_user limit 1;

    -- Innhólfsfærslan tilheyrir FÉLAGI VIÐTAKANDANS
    insert into inbound_emails (
      tenant_id, recipient_email, recipient_user_id, sender_email, sender_name,
      subject, body_text, is_test)
    values (
      v_rcpt.tenant_id, v_rcpt.email, v_rcpt.id, v_from,
      coalesce(v_sender_name, v_from::text), p_subject, p_body, false)
    returning * into v_inb;

    update outbound_emails set delivered_inbound_id = v_inb.id
     where id = v_row.id;
    v_row.delivered_inbound_id := v_inb.id;
  end if;

  return v_row;
end $$;

-- Viðhengi á innhólfs-afrit: nota tenant innhólfsfærslunnar (ekki sendanda)
create or replace function app.mail_add_outbound_attachment(
  p_outbound_id uuid, p_filename text, p_content_type text,
  p_storage_path text, p_size_bytes integer
) returns email_attachments
language plpgsql security definer set search_path = public as $$
declare
  v_out outbound_emails;
  v_inb_tenant uuid;
  v_row email_attachments;
begin
  select * into v_out from outbound_emails
   where id = p_outbound_id and sender_user_id = app.current_user_id();
  if v_out is null then
    raise exception 'NOT_FOUND: Skeyti fannst ekki eða er ekki þitt';
  end if;

  insert into email_attachments (
    tenant_id, outbound_email_id, filename, content_type, storage_path, size_bytes)
  values (v_out.tenant_id, p_outbound_id, p_filename, p_content_type,
          p_storage_path, p_size_bytes)
  returning * into v_row;

  if v_out.delivered_inbound_id is not null then
    select tenant_id into v_inb_tenant from inbound_emails
     where id = v_out.delivered_inbound_id;
    insert into email_attachments (
      tenant_id, inbound_email_id, filename, content_type, storage_path, size_bytes)
    values (coalesce(v_inb_tenant, v_out.tenant_id), v_out.delivered_inbound_id,
            p_filename, p_content_type, p_storage_path, p_size_bytes);
  end if;

  return v_row;
end $$;

-- ONE-TIME: endurafhenda innri skeyti sem festust sem 'mock_sent'
do $$
declare r record; v_inb_id uuid; v_sender_name text;
begin
  for r in
    select o.*, u.id as rcpt_id, u.tenant_id as rcpt_tenant, u.email as rcpt_email
    from outbound_emails o
    join users u on u.email = lower(trim(o.to_email))::citext and u.status = 'active'
    where o.status = 'mock_sent' and o.delivered_inbound_id is null
  loop
    select full_name into v_sender_name
      from employees where user_id = r.sender_user_id limit 1;

    insert into inbound_emails (
      tenant_id, recipient_email, recipient_user_id, sender_email, sender_name,
      subject, body_text, received_at, is_test)
    values (
      r.rcpt_tenant, r.rcpt_email, r.rcpt_id, r.from_email,
      coalesce(v_sender_name, r.from_email::text), r.subject, r.body_text,
      coalesce(r.sent_at, r.created_at), false)
    returning id into v_inb_id;

    update outbound_emails
       set status = 'sent', delivered_inbound_id = v_inb_id
     where id = r.id;
  end loop;
end $$;

grant execute on all functions in schema app to anon, authenticated, service_role;
notify pgrst, 'reload schema';


-- >>> migrations\0026_company_users.sql >>>

-- =============================================================================
-- 0026_company_users.sql — Viðtakendalisti: allir virkir notendur míns félags
-- Notað í "Nýtt skeyti" (vefur + app) svo hægt sé að velja samstarfsmenn af
-- lista í stað þess að muna netföng. Frjáls innsláttur er áfram í boði.
-- =============================================================================

create or replace function app.mail_company_users()
returns table(email text, full_name text)
language sql stable security definer set search_path = public as $$
  select u.email::text,
         coalesce(e.full_name, u.email::text) as full_name
  from users u
  left join employees e on e.user_id = u.id
  where u.tenant_id = app.current_tenant_id()
    and u.status = 'active'
    and u.email is not null
    and u.id <> app.current_user_id()
  order by 2, 1
$$;

create or replace function public.mail_company_users()
returns table(email text, full_name text)
language sql stable security definer set search_path = public as $$
  select * from app.mail_company_users()
$$;

grant execute on all functions in schema app to anon, authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;
notify pgrst, 'reload schema';


-- >>> migrations\0027_delete_mail_push.sql >>>

-- =============================================================================
-- 0027_delete_mail_push.sql — Eyðing skilaboða + push-tilkynningar
-- 1) Starfsmaður getur eytt eigin pósti (innhólf og úthólf).
-- 2) push_tokens + push_register: appið skráir Expo-push-token tækisins.
-- 3) Triggerar senda push í gegnum Expo þegar nýtt skeyti eða tilkynning
--    berst — virkar þótt appið sé lokað (pg_net sendir úr gagnagrunninum).
-- =============================================================================

-- --- 1) Eyðing eigin skilaboða ----------------------------------------------

-- Innhólf: viðhengi fylgja með (cascade); delivered_inbound_id hjá sendanda
-- verður null (FK on delete set null) — úthólfsafrit sendanda helst óbreytt.
create or replace function app.mail_delete_inbound(p_id uuid)
returns void language sql security definer set search_path = public as $$
  delete from inbound_emails
   where id = p_id and recipient_user_id = app.current_user_id()
$$;

-- Úthólf: eyðir aðeins afriti sendanda — innhólfsafrit viðtakanda helst.
create or replace function app.mail_delete_outbound(p_id uuid)
returns void language sql security definer set search_path = public as $$
  delete from outbound_emails
   where id = p_id and sender_user_id = app.current_user_id()
$$;

create or replace function public.mail_delete_inbound(p_id uuid)
returns void language sql security definer set search_path = public as $$
  select app.mail_delete_inbound(p_id)
$$;

create or replace function public.mail_delete_outbound(p_id uuid)
returns void language sql security definer set search_path = public as $$
  select app.mail_delete_outbound(p_id)
$$;

-- --- 2) Push-token skráning ---------------------------------------------------

create table if not exists push_tokens (
  token      text primary key,             -- ExponentPushToken[...]
  user_id    uuid not null references users(id) on delete cascade,
  platform   text,
  updated_at timestamptz not null default now()
);
create index if not exists push_tokens_user_idx on push_tokens (user_id);
alter table push_tokens enable row level security;  -- engar policies: aðeins definer-föll

create or replace function app.push_register(p_token text, p_platform text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_user uuid := app.current_user_id();
begin
  if v_user is null or p_token is null or length(trim(p_token)) = 0 then return; end if;
  insert into push_tokens (token, user_id, platform, updated_at)
  values (trim(p_token), v_user, p_platform, now())
  on conflict (token) do update
    set user_id = excluded.user_id, platform = excluded.platform, updated_at = now();
end $$;

create or replace function public.push_register(p_token text, p_platform text default null)
returns void language sql security definer set search_path = public as $$
  select app.push_register(p_token, p_platform)
$$;

-- --- 3) Push-sending úr gagnagrunni (pg_net -> Expo push API) -----------------

create extension if not exists pg_net;

-- Senda push á öll tæki tiltekins notanda. Bregst aldrei (skeytið sjálft
-- má aldrei stranda á push-sendingu).
create or replace function app.push_notify_user(p_user uuid, p_title text, p_body text)
returns void language plpgsql security definer set search_path = public as $$
declare t record;
begin
  for t in select token from push_tokens where user_id = p_user loop
    begin
      perform net.http_post(
        url  := 'https://exp.host/--/api/v2/push/send',
        body := jsonb_build_object(
          'to', t.token,
          'title', p_title,
          'body', coalesce(nullif(trim(p_body), ''), ' '),
          'sound', 'default'
        )
      );
    exception when others then null;
    end;
  end loop;
exception when others then null;
end $$;

-- Nýtt skeyti í innhólf -> push á viðtakanda
create or replace function app.trg_push_inbound()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.recipient_user_id is not null then
    perform app.push_notify_user(
      new.recipient_user_id,
      coalesce(new.sender_name, new.sender_email::text),
      coalesce(new.subject, 'Nýtt skeyti')
    );
  end if;
  return new;
end $$;

drop trigger if exists push_on_inbound on inbound_emails;
create trigger push_on_inbound
  after insert on inbound_emails
  for each row execute function app.trg_push_inbound();

-- Ný tilkynning -> push á alla virka notendur félagsins (nema sendanda)
create or replace function app.trg_push_announcement()
returns trigger language plpgsql security definer set search_path = public as $$
declare u record;
begin
  for u in
    select id from users
    where tenant_id = new.tenant_id and status = 'active'
      and id is distinct from new.sender_user_id
  loop
    perform app.push_notify_user(u.id, 'Tilkynning: ' || new.title, new.body);
  end loop;
  return new;
end $$;

drop trigger if exists push_on_announcement on announcements;
create trigger push_on_announcement
  after insert on announcements
  for each row execute function app.trg_push_announcement();

grant execute on all functions in schema app to anon, authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;
notify pgrst, 'reload schema';


-- >>> migrations\0028_bulk_delete.sql >>>

-- =============================================================================
-- 0028_bulk_delete.sql — Eyða mörgum skeytum í einu (aðeins eigin póstur)
-- =============================================================================

create or replace function app.mail_delete_inbound_many(p_ids uuid[])
returns integer language sql security definer set search_path = public as $$
  with del as (
    delete from inbound_emails
     where id = any(p_ids) and recipient_user_id = app.current_user_id()
     returning 1
  ) select count(*)::integer from del
$$;

create or replace function app.mail_delete_outbound_many(p_ids uuid[])
returns integer language sql security definer set search_path = public as $$
  with del as (
    delete from outbound_emails
     where id = any(p_ids) and sender_user_id = app.current_user_id()
     returning 1
  ) select count(*)::integer from del
$$;

create or replace function public.mail_delete_inbound_many(p_ids uuid[])
returns integer language sql security definer set search_path = public as $$
  select app.mail_delete_inbound_many(p_ids)
$$;

create or replace function public.mail_delete_outbound_many(p_ids uuid[])
returns integer language sql security definer set search_path = public as $$
  select app.mail_delete_outbound_many(p_ids)
$$;

grant execute on all functions in schema app to anon, authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;
notify pgrst, 'reload schema';


-- >>> migrations\0029_push_sound.sql >>>

-- =============================================================================
-- 0029_push_sound.sql — Push með hljóði og háum forgangi
-- channelId 'default' (Android-rásin sem appið stofnar með hljóði) og
-- priority 'high' svo tilkynningin veki tækið þegar appið er lokað.
-- =============================================================================

create or replace function app.push_notify_user(p_user uuid, p_title text, p_body text)
returns void language plpgsql security definer set search_path = public as $$
declare t record;
begin
  for t in select token from push_tokens where user_id = p_user loop
    begin
      perform net.http_post(
        url  := 'https://exp.host/--/api/v2/push/send',
        body := jsonb_build_object(
          'to', t.token,
          'title', p_title,
          'body', coalesce(nullif(trim(p_body), ''), ' '),
          'sound', 'default',
          'priority', 'high',
          'channelId', 'default'
        )
      );
    exception when others then null;
    end;
  end loop;
exception when others then null;
end $$;

grant execute on all functions in schema app to anon, authenticated, service_role;
notify pgrst, 'reload schema';


-- >>> migrations\0030_mark_unread.sql >>>

-- =============================================================================
-- 0030_mark_unread.sql — Merkja skeyti sem ólesið (aðeins eigin póstur)
-- =============================================================================

create or replace function app.mail_mark_unread(p_id uuid)
returns void language sql security definer set search_path = public as $$
  update inbound_emails set read_at = null
   where id = p_id and recipient_user_id = app.current_user_id()
$$;

create or replace function public.mail_mark_unread(p_id uuid)
returns void language sql security definer set search_path = public as $$
  select app.mail_mark_unread(p_id)
$$;

grant execute on all functions in schema app to anon, authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;
notify pgrst, 'reload schema';


-- >>> migrations\0031_project_tasks.sql >>>

-- =============================================================================
-- 0031_project_tasks.sql — Undirnúmer á verkstað
-- Verkefni getur haft undirnúmer (t.d. 100-01 Múrverk, 100-02 Málun) og
-- starfsmaður velur undirnúmer við innskráningu. Tímaskráningin geymir
-- undirnúmerið og það sést í yfirlitum stjórnenda og starfsmanns.
-- =============================================================================

create table if not exists project_tasks (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references companies(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  task_no    text not null,
  name       text not null,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  unique (project_id, task_no)
);
create index if not exists project_tasks_project_idx on project_tasks (project_id) where active;

alter table project_tasks enable row level security;

-- Allir í félaginu mega SJÁ undirnúmer (starfsmenn þurfa listann við innskráningu)
drop policy if exists project_tasks_select on project_tasks;
create policy project_tasks_select on project_tasks for select
  using (tenant_id = app.current_tenant_id());

grant select on project_tasks to authenticated;

-- Tímaskráning geymir valið undirnúmer
alter table time_entries
  add column if not exists task_id uuid references project_tasks(id) on delete set null;

-- --- Stjórnendur: stofna/breyta/eyða undirnúmerum -----------------------------

create or replace function app.project_task_create(
  p_project_id uuid, p_task_no text, p_name text
) returns project_tasks
language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_row project_tasks;
begin
  if not app.has_role('admin') and not app.has_role('project_manager') then
    raise exception 'FORBIDDEN';
  end if;
  if not exists (select 1 from projects where id = p_project_id and tenant_id = v_tenant) then
    raise exception 'NOT_FOUND: Verkefni fannst ekki';
  end if;
  insert into project_tasks (tenant_id, project_id, task_no, name)
  values (v_tenant, p_project_id, trim(p_task_no), trim(p_name))
  returning * into v_row;
  return v_row;
end $$;

create or replace function app.project_task_update(
  p_id uuid, p_task_no text, p_name text, p_active boolean
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not app.has_role('admin') and not app.has_role('project_manager') then
    raise exception 'FORBIDDEN';
  end if;
  update project_tasks
     set task_no = coalesce(trim(p_task_no), task_no),
         name    = coalesce(trim(p_name), name),
         active  = coalesce(p_active, active)
   where id = p_id and tenant_id = app.current_tenant_id();
end $$;

create or replace function app.project_task_delete(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not app.has_role('admin') and not app.has_role('project_manager') then
    raise exception 'FORBIDDEN';
  end if;
  delete from project_tasks
   where id = p_id and tenant_id = app.current_tenant_id();
end $$;

create or replace function public.project_task_create(
  p_project_id uuid, p_task_no text, p_name text
) returns public.project_tasks language sql security definer set search_path = public as $$
  select app.project_task_create(p_project_id, p_task_no, p_name)
$$;

create or replace function public.project_task_update(
  p_id uuid, p_task_no text, p_name text, p_active boolean
) returns void language sql security definer set search_path = public as $$
  select app.project_task_update(p_id, p_task_no, p_name, p_active)
$$;

create or replace function public.project_task_delete(p_id uuid)
returns void language sql security definer set search_path = public as $$
  select app.project_task_delete(p_id)
$$;

-- --- check_in með undirnúmeri -------------------------------------------------
-- Gamla útgáfan felld niður (annars tvær samnefndar og PostgREST ruglast)

drop function if exists public.check_in(uuid, double precision, double precision, numeric, text);
drop function if exists app.check_in(uuid, double precision, double precision, numeric, text);

create or replace function app.check_in(
  p_project_id uuid,
  p_lat        double precision,
  p_lng        double precision,
  p_accuracy   numeric default null,
  p_note       text    default null,
  p_task_id    uuid    default null
) returns time_entries
language plpgsql security definer set search_path = public as $$
declare
  v_tenant    uuid := app.current_tenant_id();
  v_user      uuid := app.current_user_id();
  v_employee  uuid;
  v_point     geography := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography;
  v_loc       project_locations;
  v_min_acc   int;
  v_distance  numeric;
  v_entry     time_entries;
begin
  select id into v_employee from employees
   where user_id = v_user and tenant_id = v_tenant and status = 'active';
  if v_employee is null then
    raise exception 'EMP_NOT_FOUND: Enginn virkur starfsmaður tengdur notanda';
  end if;

  if not exists (
    select 1 from employee_projects
     where employee_id = v_employee and project_id = p_project_id
  ) then
    raise exception 'NOT_ASSIGNED: Starfsmaður hefur ekki aðgang að þessu verkefni';
  end if;

  if exists (select 1 from time_entries
              where employee_id = v_employee and check_out_at is null) then
    raise exception 'ALREADY_ACTIVE: Þegar virk tímaskráning í gangi';
  end if;

  -- Undirnúmer verður að tilheyra verkefninu og vera virkt
  if p_task_id is not null and not exists (
    select 1 from project_tasks
     where id = p_task_id and project_id = p_project_id and active
  ) then
    raise exception 'BAD_TASK: Undirnúmer fannst ekki á þessu verkefni';
  end if;

  select * into v_loc from project_locations
   where project_id = p_project_id and is_primary
   order by created_at limit 1;
  if v_loc is null then
    raise exception 'NO_GEOFENCE: Verkefni hefur ekkert skilgreint svæði';
  end if;

  v_min_acc := app.get_setting_int(v_tenant, p_project_id, 'min_accuracy_m', 50);
  if p_accuracy is not null and p_accuracy > v_min_acc then
    raise exception 'LOW_ACCURACY: GPS-nákvæmni ófullnægjandi (% m > % m)',
      p_accuracy, v_min_acc;
  end if;

  v_distance := ST_Distance(v_point, v_loc.center);
  if v_distance > v_loc.radius_m then
    raise exception 'OUTSIDE_AREA: Utan svæðis (% m, leyfilegt % m)',
      round(v_distance), v_loc.radius_m;
  end if;

  insert into time_entries (
    tenant_id, employee_id, project_id, task_id, check_in_at,
    check_in_location, check_in_accuracy_m, note, status, source)
  values (
    v_tenant, v_employee, p_project_id, p_task_id, now(),
    v_point, p_accuracy, p_note, 'active', 'mobile')
  returning * into v_entry;

  perform app.write_audit(v_tenant, v_user, 'create', 'time_entry', v_entry.id,
    jsonb_build_object('event','check_in','distance_m',round(v_distance),
                       'task_id',p_task_id));

  return v_entry;
end $$;

create or replace function public.check_in(
  p_project_id uuid, p_lat double precision, p_lng double precision,
  p_accuracy numeric default null, p_note text default null,
  p_task_id uuid default null
) returns public.time_entries language sql security definer set search_path = public as $$
  select app.check_in(p_project_id, p_lat, p_lng, p_accuracy, p_note, p_task_id)
$$;

-- --- Views með undirnúmeri ----------------------------------------------------

create or replace view v_time_entries
  with (security_invoker = on) as
select
  te.id, te.tenant_id, te.employee_id, te.project_id,
  e.full_name      as employee_name,
  e.employee_no,
  p.name           as project_name,
  p.project_no,
  te.check_in_at, te.check_out_at,
  te.check_out_type, te.worked_minutes,
  round(coalesce(te.worked_minutes,0) / 60.0, 2) as worked_hours,
  te.note, te.status, te.source,
  pt.task_no, pt.name as task_name
from time_entries te
join employees e on e.id = te.employee_id
join projects  p on p.id = te.project_id
left join project_tasks pt on pt.id = te.task_id;

create or replace view v_my_active_entry
  with (security_invoker = on) as
select
  te.id, te.project_id, te.check_in_at,
  p.name as project_name, p.project_no,
  pl.radius_m,
  ST_Y(pl.center::geometry) as lat,
  ST_X(pl.center::geometry) as lng,
  pt.task_no, pt.name as task_name
from time_entries te
join employees e on e.id = te.employee_id and e.user_id = app.current_user_id()
join projects  p on p.id = te.project_id
left join project_locations pl on pl.project_id = p.id and pl.is_primary
left join project_tasks pt on pt.id = te.task_id
where te.check_out_at is null;

grant execute on all functions in schema app to anon, authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;
notify pgrst, 'reload schema';


-- >>> migrations\0032_super_users.sql >>>

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


-- >>> migrations\0033_tracking_places.sql >>>

-- =============================================================================
-- 0033_tracking_places.sql — Staðsetning starfsmanna á korti + staðir
-- 1) Tímagluggi per félag: staðsetning starfsmanna aðeins sýnileg innan
--    stillts tíma (t.d. 08:00–16:00 virka daga; helgar valkvæðar).
-- 2) employee_locations: síðasta staðsetning virkra starfsmanna (stjórnendur).
-- 3) places: staðir félagsins (t.d. verslun) + place_visits: hve oft og lengi
--    starfsmaður hefur verið á staðnum (reiknað úr location_logs).
-- =============================================================================

-- --- Staðir -------------------------------------------------------------------

create table if not exists places (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references companies(id) on delete cascade,
  name       text not null,
  address    text,
  center     geography(point, 4326) not null,
  radius_m   integer not null default 100,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists places_tenant_idx on places (tenant_id) where active;
create index if not exists places_center_gix on places using gist (center);

alter table places enable row level security;
drop policy if exists places_select on places;
create policy places_select on places for select
  using (tenant_id = app.current_tenant_id());
grant select on places to authenticated;

create or replace view v_places with (security_invoker = on) as
select id, name, address, radius_m, active, created_at,
       ST_Y(center::geometry) as lat, ST_X(center::geometry) as lng
from places;

create or replace function app.place_create(
  p_name text, p_address text, p_lat double precision, p_lng double precision,
  p_radius_m integer default 100
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not app.has_role('admin') and not app.has_role('project_manager') then
    raise exception 'FORBIDDEN';
  end if;
  insert into places (tenant_id, name, address, center, radius_m)
  values (app.current_tenant_id(), trim(p_name), nullif(trim(coalesce(p_address,'')),''),
          ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
          coalesce(p_radius_m, 100))
  returning id into v_id;
  return v_id;
end $$;

create or replace function app.place_update(
  p_id uuid, p_name text default null, p_address text default null,
  p_lat double precision default null, p_lng double precision default null,
  p_radius_m integer default null, p_active boolean default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not app.has_role('admin') and not app.has_role('project_manager') then
    raise exception 'FORBIDDEN';
  end if;
  update places set
    name     = coalesce(nullif(trim(coalesce(p_name,'')),''), name),
    address  = coalesce(p_address, address),
    center   = case when p_lat is not null and p_lng is not null
                 then ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
                 else center end,
    radius_m = coalesce(p_radius_m, radius_m),
    active   = coalesce(p_active, active)
  where id = p_id and tenant_id = app.current_tenant_id();
end $$;

create or replace function app.place_delete(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not app.has_role('admin') and not app.has_role('project_manager') then
    raise exception 'FORBIDDEN';
  end if;
  delete from places where id = p_id and tenant_id = app.current_tenant_id();
end $$;

-- --- Tímagluggi vöktunar ------------------------------------------------------
-- Stillingar (company-scope): tracking_start_min (sjálfg. 480 = 08:00),
-- tracking_end_min (960 = 16:00), tracking_weekends (0/1).

create or replace function app.tracking_allowed()
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  v_tenant   uuid := app.current_tenant_id();
  v_now      timestamp := (now() at time zone 'Atlantic/Reykjavik');
  v_minutes  int := extract(hour from v_now)::int * 60 + extract(minute from v_now)::int;
  v_dow      int := extract(isodow from v_now)::int;  -- 1=mán … 7=sun
  v_start    int := app.get_setting_int(v_tenant, null, 'tracking_start_min', 480);
  v_end      int := app.get_setting_int(v_tenant, null, 'tracking_end_min', 960);
  v_weekends boolean := app.get_setting_int(v_tenant, null, 'tracking_weekends', 0) = 1;
begin
  if v_dow in (6, 7) and not v_weekends then
    return false;
  end if;
  return v_minutes >= v_start and v_minutes < v_end;
end $$;

-- --- Staðsetning virkra starfsmanna (stjórnendur, aðeins innan tímaglugga) ----

create or replace function app.employee_locations()
returns table(
  employee_id uuid, full_name text,
  project_no text, project_name text,
  lat double precision, lng double precision,
  recorded_at timestamptz, inside_geofence boolean, minutes_ago int
)
language plpgsql security definer set search_path = public as $$
declare v_tenant uuid := app.current_tenant_id();
begin
  if not app.has_role('admin') and not app.has_role('project_manager') then
    raise exception 'FORBIDDEN';
  end if;
  if not app.tracking_allowed() then
    raise exception 'TRACKING_CLOSED: Staðsetning starfsmanna er aðeins sýnileg innan stillts tímaglugga félagsins';
  end if;
  return query
    select e.id, e.full_name, p.project_no, p.name,
           ST_Y(ll.location::geometry), ST_X(ll.location::geometry),
           ll.recorded_at, ll.inside_geofence,
           (extract(epoch from (now() - ll.recorded_at)) / 60)::int
    from time_entries te
    join employees e on e.id = te.employee_id
    join projects  p on p.id = te.project_id
    join lateral (
      select l.location, l.recorded_at, l.inside_geofence
      from location_logs l
      where l.time_entry_id = te.id
      order by l.recorded_at desc limit 1
    ) ll on true
    where te.tenant_id = v_tenant and te.check_out_at is null
    order by ll.recorded_at desc;
end $$;

-- --- Heimsóknir á stað --------------------------------------------------------
-- Samfelldar mælingar innan staðar teljast ein heimsókn; >20 mín gat = ný.

create or replace function app.place_visits(
  p_place_id uuid, p_from timestamptz, p_to timestamptz
) returns table(
  employee_id uuid, full_name text,
  visits int, total_minutes int, last_visit timestamptz
)
language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_place  places;
begin
  if not app.has_role('admin') and not app.has_role('project_manager') then
    raise exception 'FORBIDDEN';
  end if;
  select * into v_place from places
   where id = p_place_id and tenant_id = v_tenant;
  if v_place is null then
    raise exception 'NOT_FOUND: Staður fannst ekki';
  end if;

  return query
  with pts as (
    select te.employee_id as emp, ll.recorded_at
    from location_logs ll
    join time_entries te on te.id = ll.time_entry_id
    where ll.tenant_id = v_tenant
      and ll.recorded_at >= p_from and ll.recorded_at < p_to
      and ST_DWithin(ll.location, v_place.center, v_place.radius_m)
  ),
  marked as (
    select emp, recorded_at,
      case when lag(recorded_at) over w is null
             or recorded_at - lag(recorded_at) over w > interval '20 minutes'
        then 1 else 0 end as new_visit
    from pts
    window w as (partition by emp order by recorded_at)
  ),
  grouped as (
    select emp, recorded_at,
      sum(new_visit) over (partition by emp order by recorded_at) as visit_no
    from marked
  ),
  per_visit as (
    select emp, visit_no,
           min(recorded_at) as v_start, max(recorded_at) as v_end
    from grouped group by emp, visit_no
  )
  select pv.emp, e.full_name,
         count(*)::int,
         sum(greatest(1, ceil(extract(epoch from (pv.v_end - pv.v_start)) / 60)))::int,
         max(pv.v_end)
  from per_visit pv
  join employees e on e.id = pv.emp
  group by pv.emp, e.full_name
  order by 3 desc, 4 desc;
end $$;

-- --- Public-vörpur ------------------------------------------------------------

create or replace function public.place_create(
  p_name text, p_address text, p_lat double precision, p_lng double precision,
  p_radius_m integer default 100
) returns uuid language sql security definer set search_path = public as $$
  select app.place_create(p_name, p_address, p_lat, p_lng, p_radius_m)
$$;

create or replace function public.place_update(
  p_id uuid, p_name text default null, p_address text default null,
  p_lat double precision default null, p_lng double precision default null,
  p_radius_m integer default null, p_active boolean default null
) returns void language sql security definer set search_path = public as $$
  select app.place_update(p_id, p_name, p_address, p_lat, p_lng, p_radius_m, p_active)
$$;

create or replace function public.place_delete(p_id uuid)
returns void language sql security definer set search_path = public as $$
  select app.place_delete(p_id)
$$;

create or replace function public.employee_locations()
returns table(
  employee_id uuid, full_name text,
  project_no text, project_name text,
  lat double precision, lng double precision,
  recorded_at timestamptz, inside_geofence boolean, minutes_ago int
) language sql security definer set search_path = public as $$
  select * from app.employee_locations()
$$;

create or replace function public.place_visits(
  p_place_id uuid, p_from timestamptz, p_to timestamptz
) returns table(
  employee_id uuid, full_name text,
  visits int, total_minutes int, last_visit timestamptz
) language sql security definer set search_path = public as $$
  select * from app.place_visits(p_place_id, p_from, p_to)
$$;

grant execute on all functions in schema app to anon, authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;
notify pgrst, 'reload schema';


-- >>> migrations\0034_admin_app_photos.sql >>>

-- =============================================================================
-- 0034_admin_app_photos.sql — Stjórnendayfirlit í appi + starfsmannamyndir
-- 1) Fjarvera fær tegund: veikindi EÐA sumarfrí (absence_register m/p_kind).
-- 2) employees.photo_path + Storage-fata employee-photos (félagsbundinn aðgangur).
-- 3) admin_overview(): innskráðir + veikir + í fríi í dag, með myndaslóðum.
-- 4) employee_locations() skilar nú einnig photo_path (fyrir kortaskjái).
-- =============================================================================

-- --- 1) Fjarverutegundir ------------------------------------------------------

alter table absences drop constraint if exists absences_type_check;
alter table absences add constraint absences_type_check
  check (type in ('sick', 'vacation'));

drop function if exists public.absence_register(date, date, text);
drop function if exists app.absence_register(date, date, text);

create or replace function app.absence_register(
  p_from date default null, p_to date default null, p_note text default null,
  p_kind text default 'sick'
) returns absences
language plpgsql security definer set search_path = public as $$
declare
  v_emp employees;
  v_from date := coalesce(p_from, current_date);
  v_to   date := coalesce(p_to, coalesce(p_from, current_date));
  v_kind text := case when p_kind = 'vacation' then 'vacation' else 'sick' end;
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
  values (v_emp.tenant_id, v_emp.id, v_kind, v_from, v_to, p_note)
  returning * into v_row;

  perform app.write_audit(v_emp.tenant_id, app.current_user_id(), 'create',
    'absence', v_row.id, jsonb_build_object('from', v_from, 'to', v_to, 'kind', v_kind));
  return v_row;
end $$;

create or replace function public.absence_register(
  p_from date default null, p_to date default null, p_note text default null,
  p_kind text default 'sick'
) returns public.absences language sql security definer set search_path = public as $$
  select app.absence_register(p_from, p_to, p_note, p_kind)
$$;

-- --- 2) Starfsmannamyndir -----------------------------------------------------

alter table employees add column if not exists photo_path text;

insert into storage.buckets (id, name, public, file_size_limit)
values ('employee-photos', 'employee-photos', false, 5242880)
on conflict (id) do nothing;

-- Allir í félaginu mega SKOÐA myndir félagsins (slóð: <tenant_id>/<employee_id>.jpg)
drop policy if exists emp_photos_select on storage.objects;
create policy emp_photos_select on storage.objects for select to authenticated
  using (
    bucket_id = 'employee-photos'
    and (storage.foldername(name))[1] = app.current_tenant_id()::text
  );

-- Aðeins stjórnendur mega hlaða upp / breyta / eyða
drop policy if exists emp_photos_insert on storage.objects;
create policy emp_photos_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'employee-photos'
    and (storage.foldername(name))[1] = app.current_tenant_id()::text
    and (app.has_role('admin') or app.has_role('project_manager'))
  );

drop policy if exists emp_photos_update on storage.objects;
create policy emp_photos_update on storage.objects for update to authenticated
  using (
    bucket_id = 'employee-photos'
    and (storage.foldername(name))[1] = app.current_tenant_id()::text
    and (app.has_role('admin') or app.has_role('project_manager'))
  );

drop policy if exists emp_photos_delete on storage.objects;
create policy emp_photos_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'employee-photos'
    and (storage.foldername(name))[1] = app.current_tenant_id()::text
    and (app.has_role('admin') or app.has_role('project_manager'))
  );

create or replace function app.employee_set_photo(p_employee_id uuid, p_path text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not app.has_role('admin') and not app.has_role('project_manager') then
    raise exception 'FORBIDDEN';
  end if;
  update employees set photo_path = nullif(trim(coalesce(p_path,'')),'')
   where id = p_employee_id and tenant_id = app.current_tenant_id();
end $$;

create or replace function public.employee_set_photo(p_employee_id uuid, p_path text)
returns void language sql security definer set search_path = public as $$
  select app.employee_set_photo(p_employee_id, p_path)
$$;

-- Tenant-id núverandi notanda (fyrir slóðasmíði við upphlaðningu mynda)
create or replace function public.my_tenant_id()
returns uuid language sql stable security definer set search_path = public as $$
  select app.current_tenant_id()
$$;

-- --- 3) Stjórnendayfirlit fyrir appið -----------------------------------------

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
        'date_from', a.date_from, 'date_to', a.date_to, 'note', a.note
      ) order by e.full_name)
      from absences a join employees e on e.id = a.employee_id
      where a.tenant_id = v_tenant and a.type = 'sick'
        and current_date between a.date_from and a.date_to
    ), '[]'::jsonb),
    'vacation', coalesce((
      select jsonb_agg(jsonb_build_object(
        'employee_id', e.id, 'full_name', e.full_name, 'photo_path', e.photo_path,
        'date_from', a.date_from, 'date_to', a.date_to, 'note', a.note
      ) order by e.full_name)
      from absences a join employees e on e.id = a.employee_id
      where a.tenant_id = v_tenant and a.type = 'vacation'
        and current_date between a.date_from and a.date_to
    ), '[]'::jsonb)
  ) into v_out;

  return v_out;
end $$;

create or replace function public.admin_overview()
returns jsonb language sql security definer set search_path = public as $$
  select app.admin_overview()
$$;

-- --- 4) employee_locations með mynd -------------------------------------------

drop function if exists public.employee_locations();
drop function if exists app.employee_locations();

create or replace function app.employee_locations()
returns table(
  employee_id uuid, full_name text, photo_path text,
  project_no text, project_name text,
  lat double precision, lng double precision,
  recorded_at timestamptz, inside_geofence boolean, minutes_ago int
)
language plpgsql security definer set search_path = public as $$
declare v_tenant uuid := app.current_tenant_id();
begin
  if not app.has_role('admin') and not app.has_role('project_manager') then
    raise exception 'FORBIDDEN';
  end if;
  if not app.tracking_allowed() then
    raise exception 'TRACKING_CLOSED: Staðsetning starfsmanna er aðeins sýnileg innan stillts tímaglugga félagsins';
  end if;
  return query
    select e.id, e.full_name, e.photo_path, p.project_no, p.name,
           ST_Y(ll.location::geometry), ST_X(ll.location::geometry),
           ll.recorded_at, ll.inside_geofence,
           (extract(epoch from (now() - ll.recorded_at)) / 60)::int
    from time_entries te
    join employees e on e.id = te.employee_id
    join projects  p on p.id = te.project_id
    join lateral (
      select l.location, l.recorded_at, l.inside_geofence
      from location_logs l
      where l.time_entry_id = te.id
      order by l.recorded_at desc limit 1
    ) ll on true
    where te.tenant_id = v_tenant and te.check_out_at is null
    order by ll.recorded_at desc;
end $$;

create or replace function public.employee_locations()
returns table(
  employee_id uuid, full_name text, photo_path text,
  project_no text, project_name text,
  lat double precision, lng double precision,
  recorded_at timestamptz, inside_geofence boolean, minutes_ago int
) language sql security definer set search_path = public as $$
  select * from app.employee_locations()
$$;

grant execute on all functions in schema app to anon, authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;
notify pgrst, 'reload schema';


-- >>> migrations\0035_presence.sql >>>

-- =============================================================================
-- 0035_presence.sql — Staðsetning starfsmanna ÓHÁÐ verk-innskráningu
-- Appið sendir viðveru-staðsetningu á vinnutíma. Bakendinn geymir AÐEINS
-- innan tímaglugga félagsins (sami gluggi og kortið) og aðeins SÍÐUSTU
-- staðsetningu hvers starfsmanns — engin ferilsaga utan tímaskráningar (GDPR).
-- =============================================================================

create table if not exists employee_presence (
  employee_id uuid primary key references employees(id) on delete cascade,
  tenant_id   uuid not null references companies(id) on delete cascade,
  location    geography(point, 4326) not null,
  accuracy_m  numeric,
  recorded_at timestamptz not null default now()
);
create index if not exists employee_presence_tenant_idx on employee_presence (tenant_id);
alter table employee_presence enable row level security;  -- aðeins definer-föll

-- Appið sendir púls: geymt aðeins innan tímaglugga félagsins
create or replace function app.presence_ping(
  p_lat double precision, p_lng double precision, p_accuracy numeric default null
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_emp employees;
begin
  select * into v_emp from employees
   where user_id = app.current_user_id()
     and tenant_id = app.current_tenant_id()
     and status = 'active';
  if v_emp is null then return false; end if;

  if not app.tracking_allowed() then
    -- Utan glugga: geymum ekkert og hreinsum síðustu stöðu
    delete from employee_presence where employee_id = v_emp.id;
    return false;
  end if;

  insert into employee_presence (employee_id, tenant_id, location, accuracy_m, recorded_at)
  values (v_emp.id, v_emp.tenant_id,
          ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography, p_accuracy, now())
  on conflict (employee_id) do update
    set location = excluded.location, accuracy_m = excluded.accuracy_m,
        recorded_at = excluded.recorded_at;
  return true;
end $$;

create or replace function public.presence_ping(
  p_lat double precision, p_lng double precision, p_accuracy numeric default null
) returns boolean language sql security definer set search_path = public as $$
  select app.presence_ping(p_lat, p_lng, p_accuracy)
$$;

-- --- employee_locations: innskráðir Á VERK + aðrir í vinnu (viðvera) ----------

drop function if exists public.employee_locations();
drop function if exists app.employee_locations();

create or replace function app.employee_locations()
returns table(
  employee_id uuid, full_name text, photo_path text,
  project_no text, project_name text,
  lat double precision, lng double precision,
  recorded_at timestamptz, inside_geofence boolean, minutes_ago int,
  source text  -- 'checked_in' | 'presence'
)
language plpgsql security definer set search_path = public as $$
declare v_tenant uuid := app.current_tenant_id();
begin
  if not app.has_role('admin') and not app.has_role('project_manager') then
    raise exception 'FORBIDDEN';
  end if;
  if not app.tracking_allowed() then
    raise exception 'TRACKING_CLOSED: Staðsetning starfsmanna er aðeins sýnileg innan stillts tímaglugga félagsins';
  end if;
  return query
    -- Innskráðir á verk: síðasti punktur virku skráningarinnar
    select e.id, e.full_name, e.photo_path, p.project_no, p.name,
           ST_Y(ll.location::geometry), ST_X(ll.location::geometry),
           ll.recorded_at, ll.inside_geofence,
           (extract(epoch from (now() - ll.recorded_at)) / 60)::int,
           'checked_in'::text
    from time_entries te
    join employees e on e.id = te.employee_id
    join projects  p on p.id = te.project_id
    join lateral (
      select l.location, l.recorded_at, l.inside_geofence
      from location_logs l
      where l.time_entry_id = te.id
      order by l.recorded_at desc limit 1
    ) ll on true
    where te.tenant_id = v_tenant and te.check_out_at is null
    union all
    -- Aðrir í vinnu (viðveru-púls, ekki innskráðir á verk) — nýlegir punktar
    select e.id, e.full_name, e.photo_path, null::text, null::text,
           ST_Y(pr.location::geometry), ST_X(pr.location::geometry),
           pr.recorded_at, null::boolean,
           (extract(epoch from (now() - pr.recorded_at)) / 60)::int,
           'presence'::text
    from employee_presence pr
    join employees e on e.id = pr.employee_id and e.status = 'active'
    where pr.tenant_id = v_tenant
      and pr.recorded_at > now() - interval '3 hours'
      and not exists (
        select 1 from time_entries te2
        where te2.employee_id = pr.employee_id and te2.check_out_at is null
      )
    order by 8 desc;
end $$;

create or replace function public.employee_locations()
returns table(
  employee_id uuid, full_name text, photo_path text,
  project_no text, project_name text,
  lat double precision, lng double precision,
  recorded_at timestamptz, inside_geofence boolean, minutes_ago int,
  source text
) language sql security definer set search_path = public as $$
  select * from app.employee_locations()
$$;

grant execute on all functions in schema app to anon, authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;
notify pgrst, 'reload schema';


-- >>> migrations\0036_employee_admin_absence_filter.sql >>>

-- =============================================================================
-- 0036_employee_admin_absence_filter.sql
-- 1) Gera starfsmann að admin (eða afturkalla) — fær þá strax Stjórnun í appinu.
-- 2) Fjarvera dagsins (veikur/í fríi) útilokar staðsetningarvöktun:
--    engir púlsar geymdir og starfsmaðurinn birtist ekki á korti.
-- =============================================================================

-- Fjarverandi í dag? (veikur eða í fríi)
create or replace function app.employee_absent_today(p_employee_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from absences
    where employee_id = p_employee_id
      and current_date between date_from and date_to
  )
$$;

-- --- 1) Admin-hlutverk starfsmanns --------------------------------------------

create or replace function app.employee_set_admin(p_employee_id uuid, p_admin boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_emp employees;
begin
  if not app.has_role('admin') then raise exception 'FORBIDDEN'; end if;
  select * into v_emp from employees
   where id = p_employee_id and tenant_id = app.current_tenant_id();
  if v_emp is null then
    raise exception 'NOT_FOUND: Starfsmaður fannst ekki';
  end if;
  if v_emp.user_id is null then
    raise exception 'NO_LOGIN: Starfsmaðurinn þarf innskráningu (netfang + lykilorð) fyrst';
  end if;

  if p_admin then
    insert into user_roles (user_id, role_id)
    select v_emp.user_id, id from roles where name = 'admin'
    on conflict do nothing;
  else
    if v_emp.user_id = app.current_user_id() then
      raise exception 'SELF_DEMOTE: Þú getur ekki tekið admin-réttindi af sjálfum þér';
    end if;
    delete from user_roles ur using roles r
     where ur.role_id = r.id and r.name = 'admin' and ur.user_id = v_emp.user_id;
  end if;

  perform app.write_audit(v_emp.tenant_id, app.current_user_id(),
    case when p_admin then 'create' else 'delete' end,
    'admin_role', p_employee_id, jsonb_build_object('admin', p_admin));
end $$;

-- Er starfsmaðurinn admin? (fyrir togglann í viðmótinu)
create or replace function app.employee_is_admin(p_employee_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from employees e
    join user_roles ur on ur.user_id = e.user_id
    join roles r on r.id = ur.role_id and r.name = 'admin'
    where e.id = p_employee_id and e.tenant_id = app.current_tenant_id()
  )
$$;

create or replace function public.employee_set_admin(p_employee_id uuid, p_admin boolean)
returns void language sql security definer set search_path = public as $$
  select app.employee_set_admin(p_employee_id, p_admin)
$$;

create or replace function public.employee_is_admin(p_employee_id uuid)
returns boolean language sql security definer set search_path = public as $$
  select app.employee_is_admin(p_employee_id)
$$;

-- --- 2) Fjarvera stöðvar vöktun -----------------------------------------------

create or replace function app.presence_ping(
  p_lat double precision, p_lng double precision, p_accuracy numeric default null
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_emp employees;
begin
  select * into v_emp from employees
   where user_id = app.current_user_id()
     and tenant_id = app.current_tenant_id()
     and status = 'active';
  if v_emp is null then return false; end if;

  -- Utan glugga EÐA veikur/í fríi: ekkert geymt, síðasta staða hreinsuð
  if not app.tracking_allowed() or app.employee_absent_today(v_emp.id) then
    delete from employee_presence where employee_id = v_emp.id;
    return false;
  end if;

  insert into employee_presence (employee_id, tenant_id, location, accuracy_m, recorded_at)
  values (v_emp.id, v_emp.tenant_id,
          ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography, p_accuracy, now())
  on conflict (employee_id) do update
    set location = excluded.location, accuracy_m = excluded.accuracy_m,
        recorded_at = excluded.recorded_at;
  return true;
end $$;

create or replace function app.employee_locations()
returns table(
  employee_id uuid, full_name text, photo_path text,
  project_no text, project_name text,
  lat double precision, lng double precision,
  recorded_at timestamptz, inside_geofence boolean, minutes_ago int,
  source text
)
language plpgsql security definer set search_path = public as $$
declare v_tenant uuid := app.current_tenant_id();
begin
  if not app.has_role('admin') and not app.has_role('project_manager') then
    raise exception 'FORBIDDEN';
  end if;
  if not app.tracking_allowed() then
    raise exception 'TRACKING_CLOSED: Staðsetning starfsmanna er aðeins sýnileg innan stillts tímaglugga félagsins';
  end if;
  return query
    select e.id, e.full_name, e.photo_path, p.project_no, p.name,
           ST_Y(ll.location::geometry), ST_X(ll.location::geometry),
           ll.recorded_at, ll.inside_geofence,
           (extract(epoch from (now() - ll.recorded_at)) / 60)::int,
           'checked_in'::text
    from time_entries te
    join employees e on e.id = te.employee_id
    join projects  p on p.id = te.project_id
    join lateral (
      select l.location, l.recorded_at, l.inside_geofence
      from location_logs l
      where l.time_entry_id = te.id
      order by l.recorded_at desc limit 1
    ) ll on true
    where te.tenant_id = v_tenant and te.check_out_at is null
      and not app.employee_absent_today(e.id)
    union all
    select e.id, e.full_name, e.photo_path, null::text, null::text,
           ST_Y(pr.location::geometry), ST_X(pr.location::geometry),
           pr.recorded_at, null::boolean,
           (extract(epoch from (now() - pr.recorded_at)) / 60)::int,
           'presence'::text
    from employee_presence pr
    join employees e on e.id = pr.employee_id and e.status = 'active'
    where pr.tenant_id = v_tenant
      and pr.recorded_at > now() - interval '3 hours'
      and not app.employee_absent_today(e.id)
      and not exists (
        select 1 from time_entries te2
        where te2.employee_id = pr.employee_id and te2.check_out_at is null
      )
    order by 8 desc;
end $$;

grant execute on all functions in schema app to anon, authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;
notify pgrst, 'reload schema';


-- >>> migrations\0037_open_projects.sql >>>

-- =============================================================================
-- 0037_open_projects.sql — Opin verkefni + valkvæður verkefnastjóri
-- Opið verkefni: ALLIR starfsmenn félagsins sjá það og geta skráð sig inn
-- (engin úthlutun nauðsynleg). Lokað verkefni: aðeins úthlutaðir (eins og áður).
-- Hægt að opna/loka hvenær sem er. Verkefnastjóri er valkvæður.
-- =============================================================================

alter table projects add column if not exists open_access boolean not null default false;

-- --- create_project með p_open (gamla útgáfan felld fyrst) --------------------

drop function if exists public.create_project(text, text, text, text, uuid, date, date, double precision, double precision, integer);
drop function if exists app.create_project(text, text, text, text, uuid, date, date, double precision, double precision, integer);

create or replace function app.create_project(
  p_project_no text,
  p_name       text,
  p_description text,
  p_address    text,
  p_manager_user_id uuid,
  p_start_date date,
  p_end_date   date,
  p_lat        double precision,
  p_lng        double precision,
  p_radius_m   integer,
  p_open       boolean default false
) returns projects
language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_user   uuid := app.current_user_id();
  v_proj   projects;
begin
  if not (app.has_role('admin') or app.has_role('project_manager')) then
    raise exception 'FORBIDDEN: Aðeins admin/verkefnastjóri má stofna verkefni';
  end if;

  insert into projects (tenant_id, project_no, name, description, address,
                        manager_user_id, start_date, planned_end_date, status, open_access)
  values (v_tenant, p_project_no, p_name, p_description, p_address,
          p_manager_user_id, p_start_date, p_end_date, 'active', coalesce(p_open, false))
  returning * into v_proj;

  if p_lat is not null and p_lng is not null then
    insert into project_locations (tenant_id, project_id, center, radius_m, is_primary)
    values (v_tenant, v_proj.id,
            ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
            coalesce(p_radius_m, 100), true);
  end if;

  perform app.write_audit(v_tenant, v_user, 'create', 'project', v_proj.id,
    jsonb_build_object('open', coalesce(p_open, false)));
  return v_proj;
end $$;

create or replace function public.create_project(
  p_project_no text, p_name text, p_description text, p_address text,
  p_manager_user_id uuid, p_start_date date, p_end_date date,
  p_lat double precision, p_lng double precision, p_radius_m integer,
  p_open boolean default false
) returns public.projects language sql security definer set search_path = public as $$
  select app.create_project(p_project_no, p_name, p_description, p_address,
    p_manager_user_id, p_start_date, p_end_date, p_lat, p_lng, p_radius_m, p_open)
$$;

-- --- Opna/loka verkefni -------------------------------------------------------

create or replace function app.project_set_open(p_id uuid, p_open boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (app.has_role('admin') or app.has_role('project_manager')) then
    raise exception 'FORBIDDEN';
  end if;
  update projects set open_access = p_open
   where id = p_id and tenant_id = app.current_tenant_id();
  perform app.write_audit(app.current_tenant_id(), app.current_user_id(),
    'update', 'project', p_id, jsonb_build_object('open', p_open));
end $$;

create or replace function public.project_set_open(p_id uuid, p_open boolean)
returns void language sql security definer set search_path = public as $$
  select app.project_set_open(p_id, p_open)
$$;

-- --- check_in: opið verkefni EÐA úthlutun -------------------------------------

create or replace function app.check_in(
  p_project_id uuid,
  p_lat        double precision,
  p_lng        double precision,
  p_accuracy   numeric default null,
  p_note       text    default null,
  p_task_id    uuid    default null
) returns time_entries
language plpgsql security definer set search_path = public as $$
declare
  v_tenant    uuid := app.current_tenant_id();
  v_user      uuid := app.current_user_id();
  v_employee  uuid;
  v_point     geography := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography;
  v_open      boolean;
  v_loc       project_locations;
  v_min_acc   int;
  v_distance  numeric;
  v_entry     time_entries;
begin
  select id into v_employee from employees
   where user_id = v_user and tenant_id = v_tenant and status = 'active';
  if v_employee is null then
    raise exception 'EMP_NOT_FOUND: Enginn virkur starfsmaður tengdur notanda';
  end if;

  select open_access into v_open from projects
   where id = p_project_id and tenant_id = v_tenant and status = 'active';
  if v_open is null then
    raise exception 'NOT_FOUND: Verkefni fannst ekki eða er óvirkt';
  end if;

  -- Opið verkefni: allir starfsmenn; lokað: aðeins úthlutaðir
  if not v_open and not exists (
    select 1 from employee_projects
     where employee_id = v_employee and project_id = p_project_id
  ) then
    raise exception 'NOT_ASSIGNED: Starfsmaður hefur ekki aðgang að þessu verkefni';
  end if;

  if exists (select 1 from time_entries
              where employee_id = v_employee and check_out_at is null) then
    raise exception 'ALREADY_ACTIVE: Þegar virk tímaskráning í gangi';
  end if;

  if p_task_id is not null and not exists (
    select 1 from project_tasks
     where id = p_task_id and project_id = p_project_id and active
  ) then
    raise exception 'BAD_TASK: Undirnúmer fannst ekki á þessu verkefni';
  end if;

  select * into v_loc from project_locations
   where project_id = p_project_id and is_primary
   order by created_at limit 1;
  if v_loc is null then
    raise exception 'NO_GEOFENCE: Verkefni hefur ekkert skilgreint svæði';
  end if;

  v_min_acc := app.get_setting_int(v_tenant, p_project_id, 'min_accuracy_m', 50);
  if p_accuracy is not null and p_accuracy > v_min_acc then
    raise exception 'LOW_ACCURACY: GPS-nákvæmni ófullnægjandi (% m > % m)',
      p_accuracy, v_min_acc;
  end if;

  v_distance := ST_Distance(v_point, v_loc.center);
  if v_distance > v_loc.radius_m then
    raise exception 'OUTSIDE_AREA: Utan svæðis (% m, leyfilegt % m)',
      round(v_distance), v_loc.radius_m;
  end if;

  insert into time_entries (
    tenant_id, employee_id, project_id, task_id, check_in_at,
    check_in_location, check_in_accuracy_m, note, status, source)
  values (
    v_tenant, v_employee, p_project_id, p_task_id, now(),
    v_point, p_accuracy, p_note, 'active', 'mobile')
  returning * into v_entry;

  perform app.write_audit(v_tenant, v_user, 'create', 'time_entry', v_entry.id,
    jsonb_build_object('event','check_in','distance_m',round(v_distance),
                       'task_id',p_task_id));

  return v_entry;
end $$;

-- --- v_my_projects: opin verkefni sjást hjá öllum -----------------------------

create or replace view v_my_projects
  with (security_invoker = on) as
select
  p.id, p.project_no, p.name, p.address, p.status,
  pl.radius_m,
  ST_Y(pl.center::geometry) as lat,
  ST_X(pl.center::geometry) as lng
from projects p
left join project_locations pl on pl.project_id = p.id and pl.is_primary
where p.status = 'active'
  and (
    p.open_access
    or exists (
      select 1 from employee_projects ep
      join employees e on e.id = ep.employee_id
      where ep.project_id = p.id and e.user_id = app.current_user_id()
    )
  );

-- v_projects (stjórnborð): sýna opið/lokað
create or replace view v_projects
  with (security_invoker = on) as
select
  p.id, p.tenant_id, p.project_no, p.name, p.description, p.address,
  p.manager_user_id, p.start_date, p.planned_end_date, p.status,
  pl.radius_m,
  ST_Y(pl.center::geometry) as lat,
  ST_X(pl.center::geometry) as lng,
  p.open_access
from projects p
left join project_locations pl
  on pl.project_id = p.id and pl.is_primary;

grant execute on all functions in schema app to anon, authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;
notify pgrst, 'reload schema';


-- >>> seed.sql >>>

-- =============================================================================
-- seed.sql — Prufugögn (eitt fyrirtæki, starfsmenn, verkefni með geofence)
-- Keyrt af `supabase db reset`. Föst UUID svo auðvelt sé að vísa í gögnin.
-- =============================================================================

-- --- Fyrirtæki (tenant) ----------------------------------------------------
insert into companies (id, name, national_id) values
  ('11111111-1111-1111-1111-111111111111', 'Verktak ehf.', '5501234567');

-- --- Notendur (auth_user_id null í seed — tengist Supabase Auth síðar) -----
insert into users (id, tenant_id, email, phone, status) values
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
     'admin@verktak.is',   '+3548990001', 'active'),
  ('a0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
     'jon@verktak.is',     '+3548990002', 'active'),  -- verkefnastjóri
  ('a0000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111',
     'anna@verktak.is',    '+3548990003', 'active'),  -- starfsmaður
  ('a0000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111',
     'pall@verktak.is',    '+3548990004', 'active'),  -- starfsmaður
  ('a0000000-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111',
     'laun@verktak.is',    '+3548990005', 'active');  -- laun/bókhald

-- --- Hlutverk-úthlutun ------------------------------------------------------
insert into user_roles (user_id, role_id)
select u.id, r.id from users u, roles r
where (u.email='admin@verktak.is' and r.name='admin')
   or (u.email='jon@verktak.is'   and r.name='project_manager')
   or (u.email='anna@verktak.is'  and r.name='employee')
   or (u.email='pall@verktak.is'  and r.name='employee')
   or (u.email='laun@verktak.is'  and r.name='payroll');

-- --- Starfsmenn -------------------------------------------------------------
insert into employees (id, tenant_id, user_id, full_name, employee_no, phone, email) values
  ('e0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
     'a0000000-0000-0000-0000-000000000003', 'Anna Aradóttir', '1043', '+3548990003', 'anna@verktak.is'),
  ('e0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
     'a0000000-0000-0000-0000-000000000004', 'Páll Pálsson',  '1044', '+3548990004', 'pall@verktak.is');

-- --- Verkefni ---------------------------------------------------------------
insert into projects (id, tenant_id, project_no, name, address, manager_user_id, start_date, planned_end_date) values
  ('c0000000-0000-0000-0000-000000000102', '11111111-1111-1111-1111-111111111111',
     '102', 'Höfðabakki',  'Höfðabakki 9, Reykjavík',
     'a0000000-0000-0000-0000-000000000002', date '2026-06-01', date '2026-09-30'),
  ('c0000000-0000-0000-0000-000000000088', '11111111-1111-1111-1111-111111111111',
     '088', 'Suðurland',   'Suðurlandsbraut 4, Reykjavík',
     'a0000000-0000-0000-0000-000000000002', date '2026-05-15', date '2026-08-31');

-- --- Geofence (eitt hringlaga svæði per verkefni) --------------------------
-- ST_MakePoint(lng, lat) — athugið röðina (lengd á undan breidd)
insert into project_locations (tenant_id, project_id, center, radius_m, is_primary) values
  ('11111111-1111-1111-1111-111111111111', 'c0000000-0000-0000-0000-000000000102',
     ST_SetSRID(ST_MakePoint(-21.8174, 64.1297), 4326)::geography, 80, true),
  ('11111111-1111-1111-1111-111111111111', 'c0000000-0000-0000-0000-000000000088',
     ST_SetSRID(ST_MakePoint(-21.8800, 64.1419), 4326)::geography, 120, true);

-- --- Úthlutun starfsmanna á verkefni ---------------------------------------
insert into employee_projects (tenant_id, employee_id, project_id, assigned_by) values
  ('11111111-1111-1111-1111-111111111111', 'e0000000-0000-0000-0000-000000000001',
     'c0000000-0000-0000-0000-000000000102', 'a0000000-0000-0000-0000-000000000002'),
  ('11111111-1111-1111-1111-111111111111', 'e0000000-0000-0000-0000-000000000002',
     'c0000000-0000-0000-0000-000000000088', 'a0000000-0000-0000-0000-000000000002'),
  ('11111111-1111-1111-1111-111111111111', 'e0000000-0000-0000-0000-000000000002',
     'c0000000-0000-0000-0000-000000000102', 'a0000000-0000-0000-0000-000000000002');

-- =============================================================================
-- Sannprófun (handvirkt í psql): er punktur innan/utan svæðis?
--   -- innan (miðja Höfðabakka):
--   select ST_DWithin(
--     (select center from project_locations
--       where project_id='c0000000-0000-0000-0000-000000000102'),
--     ST_SetSRID(ST_MakePoint(-21.8174, 64.1297),4326)::geography, 80);  -- t
--   -- utan (1 km í burtu):
--   select ST_DWithin(
--     (select center from project_locations
--       where project_id='c0000000-0000-0000-0000-000000000102'),
--     ST_SetSRID(ST_MakePoint(-21.8300, 64.1380),4326)::geography, 80);  -- f
-- =============================================================================

