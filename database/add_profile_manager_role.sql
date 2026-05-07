-- Allow the manager role in existing Supabase projects.
-- New installs already include this in database/schema.sql.

ALTER TABLE public.profiles
DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
ADD CONSTRAINT profiles_role_check
CHECK (role IN ('user', 'manager', 'admin'));

NOTIFY pgrst, 'reload schema';
