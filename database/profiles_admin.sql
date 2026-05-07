-- Apply this migration after database/schema.sql

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'profiles'
          AND policyname = 'Users can read own profile'
    ) THEN
        CREATE POLICY "Users can read own profile" ON public.profiles
            FOR SELECT
            USING (auth.uid() = id);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'profiles'
          AND policyname = 'Users can insert own profile'
    ) THEN
        CREATE POLICY "Users can insert own profile" ON public.profiles
            FOR INSERT TO authenticated
            WITH CHECK (
                auth.uid() = id
                AND COALESCE(role, 'user') = 'user'
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'profiles'
          AND policyname = 'Users can update own profile'
    ) THEN
        CREATE POLICY "Users can update own profile" ON public.profiles
            FOR UPDATE TO authenticated
            USING (auth.uid() = id)
            WITH CHECK (
                auth.uid() = id
                AND role = (
                    SELECT p.role
                    FROM public.profiles p
                    WHERE p.id = auth.uid()
                )
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'profiles'
          AND policyname = 'Admins can read all profiles'
    ) THEN
        CREATE POLICY "Admins can read all profiles" ON public.profiles
            FOR SELECT
            USING (
                EXISTS (
                    SELECT 1
                    FROM public.profiles admin_profile
                    WHERE admin_profile.id = auth.uid()
                      AND admin_profile.role = 'admin'
                )
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'profiles'
          AND policyname = 'Admins can update all profiles'
    ) THEN
        CREATE POLICY "Admins can update all profiles" ON public.profiles
            FOR UPDATE TO authenticated
            USING (
                EXISTS (
                    SELECT 1
                    FROM public.profiles admin_profile
                    WHERE admin_profile.id = auth.uid()
                      AND admin_profile.role = 'admin'
                )
            )
            WITH CHECK (
                role IN ('user', 'manager', 'admin')
                AND EXISTS (
                    SELECT 1
                    FROM public.profiles admin_profile
                    WHERE admin_profile.id = auth.uid()
                      AND admin_profile.role = 'admin'
                )
            );
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO public.profiles (id, role, full_name, avatar_url)
    VALUES (
        NEW.id,
        'user',
        COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name'),
        NEW.raw_user_meta_data ->> 'avatar_url'
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;

CREATE TRIGGER on_auth_user_created_profile
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user_profile();

-- Promote your first administrator manually once:
-- UPDATE public.profiles SET role = 'admin' WHERE id = 'YOUR_USER_UUID';
