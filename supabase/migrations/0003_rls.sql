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
