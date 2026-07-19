select 'EMPLOYEES' as t, e.full_name, u.email::text as user_email, e.status, '' as x
from employees e left join users u on u.id = e.user_id
where u.email::text in ('rannveig@reir.is','test@reir.is','hilmar@reir.is')
   or e.full_name ilike '%rannveig%' or e.full_name ilike '%test%';

select 'INBOUND_NAMES' as t, i.sender_email::text, i.sender_name, i.recipient_email::text, i.subject
from inbound_emails i
where i.sender_email::text in ('rannveig@reir.is','test@reir.is')
order by i.received_at desc limit 6;
