-- Άλλαξε ΜΟΝΟ το email και τρέξε το μία φορά στο SQL Editor.
insert into public.profiles (id, full_name, role, is_active)
select id, coalesce(raw_user_meta_data ->> 'full_name', email), 'admin', true
from auth.users
where email = 'ΒΑΛΕ_ΕΔΩ_ΤΟ_EMAIL_ΣΟΥ'
on conflict (id) do update
set role = 'admin', is_active = true, updated_at = now();
