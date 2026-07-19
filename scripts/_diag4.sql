select c.name as company, u.email::text, u.status,
       coalesce(e.full_name,'-') as employee_name
from users u
left join companies c on c.id = u.tenant_id
left join employees e on e.user_id = u.id
where u.status = 'active'
order by c.name, u.email;
