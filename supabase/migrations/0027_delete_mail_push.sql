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
