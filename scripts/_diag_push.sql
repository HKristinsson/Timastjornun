select 'TOKENS' as t, left(pt.token, 30) as token_start, u.email::text, pt.platform, pt.updated_at::text
from push_tokens pt join users u on u.id = pt.user_id;

select 'HTTP_SVAR' as t, id::text, status_code::text, left(content::text, 200) as body, created::text
from net._http_response order by created desc limit 8;
