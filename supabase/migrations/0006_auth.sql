-- =============================================================================
-- 0006_auth.sql — Tenging við Supabase Auth + tenant-upplausn án JWT-hooks
-- Lykilbreyting: current_tenant_id/current_user_id/has_role fletta upp í
-- users-töflunni út frá auth.uid() (SECURITY DEFINER => sleppa við RLS-endurkvæmni).
-- Þannig þarf EKKI að setja tenant_id handvirkt í app_metadata.
-- =============================================================================

-- tenant_id núverandi notanda — uppfletting í users (bypassar RLS)
create or replace function app.current_tenant_id()
returns uuid language sql stable security definer set search_path = public as $$
  select tenant_id from public.users where auth_user_id = auth.uid() limit 1
$$;

-- innra users.id núverandi notanda
create or replace function app.current_user_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.users where auth_user_id = auth.uid() limit 1
$$;

-- hefur notandi tiltekið hlutverk?
create or replace function app.has_role(p_role text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.users u on u.id = ur.user_id
    join public.roles r on r.id = ur.role_id
    where u.auth_user_id = auth.uid()
      and r.name = p_role
  )
$$;

-- =============================================================================
-- Sjálfvirk tenging: þegar Supabase Auth notandi verður til, tengjum hann
-- við users-röð með sama netfangi/síma (ef til er og ótengd).
-- Þetta gerir prófun einfalda: búðu til Auth-notanda 'admin@verktak.is' →
-- tengist sjálfkrafa seed-notandanum → tenant + hlutverk leysast.
-- =============================================================================
create or replace function app.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.users
     set auth_user_id = new.id,
         phone_verified_at = coalesce(phone_verified_at, now())
   where auth_user_id is null
     and (
       (new.email is not null and email = new.email) or
       (new.phone is not null and phone = new.phone)
     );
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_auth_user();
