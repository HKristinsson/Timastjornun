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
