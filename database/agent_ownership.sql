-- Agent ownership and marketplace deploy policies
-- Apply this migration to existing Supabase projects after schema.sql.

ALTER TABLE public.agents
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users ON DELETE CASCADE;

ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'agents'
          AND policyname = 'Users can create own agents'
    ) THEN
        CREATE POLICY "Users can create own agents" ON public.agents
            FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'agents'
          AND policyname = 'Users can update own agents'
    ) THEN
        CREATE POLICY "Users can update own agents" ON public.agents
            FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'agents'
          AND policyname = 'Users can delete own agents'
    ) THEN
        CREATE POLICY "Users can delete own agents" ON public.agents
            FOR DELETE TO authenticated USING (auth.uid() = user_id);
    END IF;
END $$;

NOTIFY pgrst, 'reload schema';
