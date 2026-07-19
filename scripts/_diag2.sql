select 'PUBLIC_USERS' as t, u.email::text, u.id::text as user_id, coalesce(u.auth_user_id::text,'!! NULL !!') as auth_user_id, u.status
from users u where u.email::text in ('rannveig@reir.is','test@reir.is','hilmar@reir.is');

select 'AUTH_USERS' as t, au.email, au.id::text as auth_id, '' as c, '' as d
from auth.users au where au.email in ('rannveig@reir.is','test@reir.is','hilmar@reir.is');

select 'DUP_AUTH' as t, u1.email::text, u2.email::text as also_maps, u1.auth_user_id::text, ''
from users u1 join users u2 on u1.auth_user_id = u2.auth_user_id and u1.id < u2.id
where u1.auth_user_id is not null;
