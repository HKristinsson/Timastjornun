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
