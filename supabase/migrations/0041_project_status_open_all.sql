-- =============================================================================
-- 0041_project_status_open_all.sql
-- 1) project_set_status: stjórnandi lokar verkefni (inactive) eða endurvekur.
-- 2) EITT SKIPTI: öll virk verkefni opnuð öllum starfsmönnum — eldri verkefni
--    (stofnuð fyrir opið/lokað eiginleikann) voru læst á úthlutun og ollu
--    NOT_ASSIGNED villu við innskráningu þótt starfsmaður væri innan svæðis.
-- =============================================================================

create or replace function app.project_set_status(p_id uuid, p_status text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (app.has_role('admin') or app.has_role('project_manager')) then
    raise exception 'FORBIDDEN';
  end if;
  if p_status not in ('active', 'inactive') then
    raise exception 'BAD_STATUS';
  end if;
  update projects set status = p_status
   where id = p_id and tenant_id = app.current_tenant_id();
  perform app.write_audit(app.current_tenant_id(), app.current_user_id(),
    'update', 'project', p_id, jsonb_build_object('status', p_status));
end $$;

create or replace function public.project_set_status(p_id uuid, p_status text)
returns void language sql security definer set search_path = public as $$
  select app.project_set_status(p_id, p_status)
$$;

-- Eitt skipti: virk verkefni verða opin öllum
update projects set open_access = true where status = 'active';

grant execute on all functions in schema app to anon, authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;
notify pgrst, 'reload schema';
