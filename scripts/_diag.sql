select 'USERS' as t, u.id::text, u.email::text, c.name as company, u.status,
       (select string_agg(r.name,',') from user_roles ur join roles r on r.id=ur.role_id where ur.user_id=u.id) as roles
from users u left join companies c on c.id = u.tenant_id
where u.email::text in ('rannveig@reir.is','test@reir.is')
order by u.email, u.created_at;

select 'GROUP2' as t, g.email::text, g.active::text, u.email::text as linked_user, c.name as company, '' as x
from group2_recipients g left join users u on u.id=g.user_id left join companies c on c.id=g.tenant_id
where g.email::text in ('rannveig@reir.is','test@reir.is');

select 'OUTBOUND' as t, o.from_email::text, o.to_email::text, o.subject, o.status,
       coalesce(o.delivered_inbound_id::text,'NULL') as delivered
from outbound_emails o
where o.from_email::text in ('rannveig@reir.is','test@reir.is') or o.to_email::text in ('rannveig@reir.is','test@reir.is')
order by o.created_at desc limit 12;

select 'INBOUND' as t, i.sender_email::text, i.recipient_email::text,
       coalesce(u.email::text,'!! ENGINN recipient_user !!') as delivered_to_user, i.subject, i.received_at::text
from inbound_emails i left join users u on u.id = i.recipient_user_id
where i.sender_email::text in ('rannveig@reir.is','test@reir.is') or i.recipient_email::text in ('rannveig@reir.is','test@reir.is')
order by i.received_at desc limit 12;
