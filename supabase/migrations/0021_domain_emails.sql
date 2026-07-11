-- =============================================================================
-- 0021_domain_emails.sql — Lén félags stýrir netföngum starfsmanna
-- Þegar lén félags er skráð/breytt flytjast netföng starfsmanna (og innskráningar)
-- yfir á nýja lénið: almar@gamla.is -> almar@nyja.is (notandanafn helst).
-- =============================================================================

create or replace function app.su_update_company(
  p_id uuid, p_name text, p_domain text, p_status text, p_max_employees int
) returns companies
language plpgsql security definer set search_path = public as $$
declare
  v_old_domain text;
  v_new_domain text := lower(nullif(trim(p_domain), ''));
  v_comp companies;
  r record;
  v_new_email text;
begin
  if not app.has_role('super_admin') then raise exception 'FORBIDDEN'; end if;
  if p_status not in ('active','suspended') then raise exception 'BAD_STATUS'; end if;
  if p_max_employees is null or p_max_employees < 1 then raise exception 'BAD_SEATS'; end if;

  select lower(domain) into v_old_domain from companies where id = p_id;

  update companies set
    name = p_name,
    domain = v_new_domain,
    status = p_status,
    max_employees = p_max_employees
  where id = p_id
  returning * into v_comp;
  if v_comp is null then raise exception 'NOT_FOUND'; end if;

  -- Lénsbreyting: flytja netföng starfsmanna (og innskráningar) á nýja lénið
  if v_new_domain is not null and v_old_domain is not null
     and v_new_domain <> v_old_domain then
    for r in
      select u.id as user_id, u.auth_user_id, u.email as old_email,
             split_part(u.email::text, '@', 1) as username
      from users u
      where u.tenant_id = p_id and u.email like ('%@' || v_old_domain)
    loop
      v_new_email := r.username || '@' || v_new_domain;
      -- sleppa ef nýja netfangið er þegar til (árekstur)
      if exists (select 1 from auth.users where email = v_new_email)
         or exists (select 1 from users where email = v_new_email::citext) then
        continue;
      end if;

      update users set email = v_new_email::citext where id = r.user_id;
      update employees set email = v_new_email::citext
       where tenant_id = p_id and email = r.old_email;
      update group2_recipients set email = v_new_email::citext
       where email = r.old_email;

      if r.auth_user_id is not null then
        update auth.users set email = v_new_email, updated_at = now()
         where id = r.auth_user_id;
        update auth.identities
           set identity_data = jsonb_set(identity_data, '{email}', to_jsonb(v_new_email))
         where user_id = r.auth_user_id and provider = 'email';
      end if;
    end loop;

    -- starfsmenn án notanda-tengingar en með netfang á gamla léninu
    update employees set email = (split_part(email::text,'@',1) || '@' || v_new_domain)::citext
     where tenant_id = p_id and email like ('%@' || v_old_domain);
  end if;

  perform app.write_audit(p_id, app.current_user_id(), 'update', 'company', p_id,
    jsonb_build_object('name', p_name, 'domain', p_domain,
                       'status', p_status, 'max_employees', p_max_employees,
                       'old_domain', v_old_domain));
  return v_comp;
end $$;

grant execute on all functions in schema app to anon, authenticated, service_role;
notify pgrst, 'reload schema';
