-- Task ownership policies for project owners
-- Apply this migration to existing Supabase projects after schema.sql.

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'tasks'
          AND policyname = 'Project owners can create tasks'
    ) THEN
        CREATE POLICY "Project owners can create tasks" ON public.tasks
            FOR INSERT TO authenticated WITH CHECK (
                EXISTS (
                    SELECT 1 FROM public.projects
                    WHERE projects.id = tasks.project_id
                      AND projects.owner_id = auth.uid()
                )
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'tasks'
          AND policyname = 'Project owners can update tasks'
    ) THEN
        CREATE POLICY "Project owners can update tasks" ON public.tasks
            FOR UPDATE TO authenticated USING (
                EXISTS (
                    SELECT 1 FROM public.projects
                    WHERE projects.id = tasks.project_id
                      AND projects.owner_id = auth.uid()
                )
            ) WITH CHECK (
                EXISTS (
                    SELECT 1 FROM public.projects
                    WHERE projects.id = tasks.project_id
                      AND projects.owner_id = auth.uid()
                )
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'tasks'
          AND policyname = 'Project owners can delete tasks'
    ) THEN
        CREATE POLICY "Project owners can delete tasks" ON public.tasks
            FOR DELETE TO authenticated USING (
                EXISTS (
                    SELECT 1 FROM public.projects
                    WHERE projects.id = tasks.project_id
                      AND projects.owner_id = auth.uid()
                )
            );
    END IF;
END $$;

NOTIFY pgrst, 'reload schema';
