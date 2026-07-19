-- =============================================================================
-- 0029_push_sound.sql — Push með hljóði og háum forgangi
-- channelId 'default' (Android-rásin sem appið stofnar með hljóði) og
-- priority 'high' svo tilkynningin veki tækið þegar appið er lokað.
-- =============================================================================

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
          'sound', 'default',
          'priority', 'high',
          'channelId', 'default'
        )
      );
    exception when others then null;
    end;
  end loop;
exception when others then null;
end $$;

grant execute on all functions in schema app to anon, authenticated, service_role;
notify pgrst, 'reload schema';
