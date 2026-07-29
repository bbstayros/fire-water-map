insert into public.profiles (
  id,
  full_name,
  role,
  is_active
)
select
  id,
  email,
  'admin',
  true
from auth.users
where email = 'bbstayros@gmail.com'
on conflict (id)
do update
set
  role = 'admin',
  is_active = true;
