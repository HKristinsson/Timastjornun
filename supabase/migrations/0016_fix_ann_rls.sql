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
