-- Allows the backend service role to perform project regeneration safely.
-- Apply this in Supabase if regenerate is blocked by RLS policies.

ALTER TABLE IF EXISTS public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.task_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.agent_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.task_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can manage tasks" ON public.tasks;
CREATE POLICY "Service role can manage tasks" ON public.tasks
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can manage task runs" ON public.task_runs;
CREATE POLICY "Service role can manage task runs" ON public.task_runs
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can manage agent logs" ON public.agent_logs;
CREATE POLICY "Service role can manage agent logs" ON public.agent_logs
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

DO $$
BEGIN
    IF to_regclass('public.task_dependencies') IS NOT NULL THEN
        ALTER TABLE public.task_dependencies ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "Service role can manage task dependencies" ON public.task_dependencies;
        CREATE POLICY "Service role can manage task dependencies" ON public.task_dependencies
            FOR ALL TO service_role
            USING (true)
            WITH CHECK (true);
    END IF;

    IF to_regclass('public.project_memory') IS NOT NULL THEN
        ALTER TABLE public.project_memory ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "Service role can manage memory" ON public.project_memory;
        CREATE POLICY "Service role can manage memory" ON public.project_memory
            FOR ALL TO service_role
            USING (true)
            WITH CHECK (true);
    END IF;
END $$;
