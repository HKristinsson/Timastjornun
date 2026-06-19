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
