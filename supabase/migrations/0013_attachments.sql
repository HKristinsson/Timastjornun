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
