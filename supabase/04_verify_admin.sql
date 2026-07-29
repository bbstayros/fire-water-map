select
  p.id,
  u.email,
  p.role,
  p.is_active
from public.profiles p
join auth.users u on u.id = p.id;
