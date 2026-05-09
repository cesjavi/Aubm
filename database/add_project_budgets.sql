-- Project-level execution budgets and estimated usage accounting.
-- Budgets are optional: when no budget row exists, execution is not blocked.

CREATE TABLE IF NOT EXISTS public.project_budgets (
    project_id UUID PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    token_budget INTEGER,
    cost_budget NUMERIC(12, 4),
    currency TEXT NOT NULL DEFAULT 'USD',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.project_usage_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
    run_id UUID REFERENCES public.task_runs(id) ON DELETE SET NULL,
    agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL,
    provider TEXT,
    model TEXT,
    prompt_tokens INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    estimated_cost NUMERIC(12, 6) NOT NULL DEFAULT 0,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS project_usage_events_project_idx
ON public.project_usage_events(project_id);

CREATE INDEX IF NOT EXISTS project_usage_events_task_idx
ON public.project_usage_events(task_id);

ALTER TABLE public.project_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_usage_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can manage project budgets" ON public.project_budgets;
DROP POLICY IF EXISTS "Project budgets visible through projects" ON public.project_budgets;
DROP POLICY IF EXISTS "Service role can manage project usage" ON public.project_usage_events;
DROP POLICY IF EXISTS "Project usage visible through projects" ON public.project_usage_events;

CREATE POLICY "Service role can manage project budgets" ON public.project_budgets
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Project budgets visible through projects" ON public.project_budgets
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.projects
            WHERE projects.id = project_budgets.project_id
              AND (projects.owner_id = auth.uid() OR projects.is_public = true)
        )
    );

CREATE POLICY "Service role can manage project usage" ON public.project_usage_events
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Project usage visible through projects" ON public.project_usage_events
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.projects
            WHERE projects.id = project_usage_events.project_id
              AND (projects.owner_id = auth.uid() OR projects.is_public = true)
        )
    );

NOTIFY pgrst, 'reload schema';
