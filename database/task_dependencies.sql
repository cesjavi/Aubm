-- Apply this migration after database/schema.sql

CREATE TABLE IF NOT EXISTS public.task_dependencies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects ON DELETE CASCADE,
    task_id UUID NOT NULL REFERENCES public.tasks ON DELETE CASCADE,
    depends_on_task_id UUID NOT NULL REFERENCES public.tasks ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT task_dependencies_unique UNIQUE (project_id, task_id, depends_on_task_id),
    CONSTRAINT task_dependencies_not_self CHECK (task_id <> depends_on_task_id)
);

CREATE INDEX IF NOT EXISTS idx_task_dependencies_project_id ON public.task_dependencies(project_id);
CREATE INDEX IF NOT EXISTS idx_task_dependencies_task_id ON public.task_dependencies(task_id);
CREATE INDEX IF NOT EXISTS idx_task_dependencies_depends_on_task_id ON public.task_dependencies(depends_on_task_id);

ALTER TABLE public.task_dependencies ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'task_dependencies'
          AND policyname = 'Task dependencies visibility'
    ) THEN
        CREATE POLICY "Task dependencies visibility" ON public.task_dependencies
            FOR SELECT
            USING (
                EXISTS (
                    SELECT 1
                    FROM public.projects
                    WHERE projects.id = task_dependencies.project_id
                      AND (projects.owner_id = auth.uid() OR projects.is_public = true)
                )
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'task_dependencies'
          AND policyname = 'Project owners can create task dependencies'
    ) THEN
        CREATE POLICY "Project owners can create task dependencies" ON public.task_dependencies
            FOR INSERT TO authenticated
            WITH CHECK (
                EXISTS (
                    SELECT 1
                    FROM public.projects
                    WHERE projects.id = task_dependencies.project_id
                      AND projects.owner_id = auth.uid()
                )
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'task_dependencies'
          AND policyname = 'Project owners can update task dependencies'
    ) THEN
        CREATE POLICY "Project owners can update task dependencies" ON public.task_dependencies
            FOR UPDATE TO authenticated
            USING (
                EXISTS (
                    SELECT 1
                    FROM public.projects
                    WHERE projects.id = task_dependencies.project_id
                      AND projects.owner_id = auth.uid()
                )
            )
            WITH CHECK (
                EXISTS (
                    SELECT 1
                    FROM public.projects
                    WHERE projects.id = task_dependencies.project_id
                      AND projects.owner_id = auth.uid()
                )
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'task_dependencies'
          AND policyname = 'Project owners can delete task dependencies'
    ) THEN
        CREATE POLICY "Project owners can delete task dependencies" ON public.task_dependencies
            FOR DELETE TO authenticated
            USING (
                EXISTS (
                    SELECT 1
                    FROM public.projects
                    WHERE projects.id = task_dependencies.project_id
                      AND projects.owner_id = auth.uid()
                )
            );
    END IF;
END $$;
