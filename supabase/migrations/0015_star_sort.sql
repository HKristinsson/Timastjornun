-- =============================================================================
-- 0015_star_sort.sql — Eftirlæti (stjarna) á póst + uppfært innhólfs-view
-- =============================================================================

alter table inbound_emails add column if not exists is_starred boolean not null default false;
create index if not exists inbound_emails_star_idx
  on inbound_emails (recipient_user_id, is_starred) where is_starred;

-- Merkja/afmerkja eftirlæti (aðeins eigin póst)
create or replace function app.mail_set_star(p_id uuid, p_star boolean)
returns void language sql security definer set search_path = public as $$
  update inbound_emails set is_starred = p_star
   where id = p_id and recipient_user_id = app.current_user_id()
$$;

create or replace function public.mail_set_star(p_id uuid, p_star boolean)
returns void language sql security definer set search_path = public as $$
  select app.mail_set_star(p_id, p_star)
$$;

-- v_my_inbox með stjörnu
create or replace view v_my_inbox with (security_invoker = on) as
select id, recipient_email, sender_email, sender_name, subject,
       body_text, body_html, received_at, read_at, status, is_test, is_starred
from inbound_emails
where recipient_user_id = app.current_user_id()
order by received_at desc;

grant execute on all functions in schema public to anon, authenticated, service_role;
grant execute on all functions in schema app to anon, authenticated, service_role;

notify pgrst, 'reload schema';
