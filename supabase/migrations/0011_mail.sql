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
