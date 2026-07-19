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
