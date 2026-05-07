-- Aubm Database Schema
-- Designed for Supabase (PostgreSQL)

-- 1. Profiles (User Extensions)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
    role TEXT CHECK (role IN ('user', 'manager', 'admin')) DEFAULT 'user',
    full_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Projects
CREATE TABLE IF NOT EXISTS public.projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    context TEXT,
    owner_id UUID REFERENCES auth.users ON DELETE CASCADE,
    status TEXT CHECK (status IN ('active', 'archived', 'completed')) DEFAULT 'active',
    is_public BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Agents (AI Identities)
CREATE TABLE IF NOT EXISTS public.agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users ON DELETE CASCADE,
    name TEXT NOT NULL,
    role TEXT,
    api_provider TEXT NOT NULL,
    model TEXT NOT NULL,
    system_prompt TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Tasks (Units of work)
CREATE TABLE IF NOT EXISTS public.tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES public.projects ON DELETE CASCADE,
    assigned_agent_id UUID REFERENCES public.agents ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT CHECK (status IN ('todo', 'queued', 'in_progress', 'awaiting_approval', 'done', 'failed', 'cancelled')) DEFAULT 'todo',
    priority INTEGER DEFAULT 0,
    is_critical BOOLEAN DEFAULT FALSE,
    output_data JSONB,
    queued_at TIMESTAMPTZ,
    leased_at TIMESTAMPTZ,
    lease_expires_at TIMESTAMPTZ,
    next_attempt_at TIMESTAMPTZ,
    queue_worker_id TEXT,
    queue_attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tasks_queue_claim_idx
ON public.tasks (status, priority DESC, next_attempt_at, queued_at, created_at)
WHERE status = 'queued';

CREATE OR REPLACE FUNCTION public.claim_next_queued_task(
  worker_id TEXT DEFAULT NULL,
  lease_seconds INTEGER DEFAULT 300,
  max_attempts INTEGER DEFAULT 3
)
RETURNS SETOF public.tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH candidate AS (
    SELECT id
    FROM public.tasks
    WHERE status = 'queued'
      AND COALESCE(queue_attempts, 0) < max_attempts
      AND (lease_expires_at IS NULL OR lease_expires_at < NOW())
      AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
    ORDER BY priority DESC, COALESCE(next_attempt_at, queued_at, created_at), COALESCE(queued_at, created_at), created_at
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  UPDATE public.tasks AS task
  SET
    status = 'in_progress',
    queue_attempts = COALESCE(task.queue_attempts, 0) + 1,
    leased_at = NOW(),
    lease_expires_at = NOW() + MAKE_INTERVAL(secs => lease_seconds),
    queue_worker_id = worker_id,
    updated_at = NOW()
  FROM candidate
  WHERE task.id = candidate.id
  RETURNING task.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_next_queued_task(TEXT, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_next_queued_task(TEXT, INTEGER, INTEGER) TO service_role;

-- 5. Task Runs (Execution History)
CREATE TABLE IF NOT EXISTS public.task_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID REFERENCES public.tasks ON DELETE CASCADE,
    agent_id UUID REFERENCES public.agents ON DELETE SET NULL,
    status TEXT CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')) DEFAULT 'queued',
    error_message TEXT,
    duration_seconds NUMERIC(10, 2),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    finished_at TIMESTAMPTZ
);

-- 6. Agent Logs (Execution Traces)
CREATE TABLE IF NOT EXISTS public.agent_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID REFERENCES public.tasks ON DELETE CASCADE,
    run_id UUID REFERENCES public.task_runs ON DELETE CASCADE,
    action TEXT,
    content TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Worker Heartbeats
CREATE TABLE IF NOT EXISTS public.worker_heartbeats (
    worker_id TEXT PRIMARY KEY,
    status TEXT CHECK (status IN ('starting', 'idle', 'processing', 'stopping', 'error')) DEFAULT 'starting',
    current_task_id UUID REFERENCES public.tasks ON DELETE SET NULL,
    processed_count INTEGER NOT NULL DEFAULT 0,
    failed_count INTEGER NOT NULL DEFAULT 0,
    metadata JSONB,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. App Config (Global Settings)
CREATE TABLE IF NOT EXISTS public.app_config (
    key TEXT PRIMARY KEY,
    value JSONB,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS (Row Level Security) - Initial setup
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worker_heartbeats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage worker heartbeats" ON public.worker_heartbeats
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

-- Basic Policies (To be refined)
-- Projects: Owners can do anything, others can read if public
CREATE POLICY "Projects visibility" ON public.projects 
    FOR SELECT USING (auth.uid() = owner_id OR is_public = true);

CREATE POLICY "Projects ownership" ON public.projects 
    FOR ALL USING (auth.uid() = owner_id);

-- Tasks: Protected by project ownership
CREATE POLICY "Tasks visibility" ON public.tasks 
    FOR SELECT USING (EXISTS (
        SELECT 1 FROM public.projects 
        WHERE projects.id = tasks.project_id AND (projects.owner_id = auth.uid() OR projects.is_public = true)
    ));

CREATE POLICY "Project owners can create tasks" ON public.tasks
    FOR INSERT TO authenticated WITH CHECK (EXISTS (
        SELECT 1 FROM public.projects
        WHERE projects.id = tasks.project_id AND projects.owner_id = auth.uid()
    ));

CREATE POLICY "Project owners can update tasks" ON public.tasks
    FOR UPDATE TO authenticated USING (EXISTS (
        SELECT 1 FROM public.projects
        WHERE projects.id = tasks.project_id AND projects.owner_id = auth.uid()
    )) WITH CHECK (EXISTS (
        SELECT 1 FROM public.projects
        WHERE projects.id = tasks.project_id AND projects.owner_id = auth.uid()
    ));

CREATE POLICY "Project owners can delete tasks" ON public.tasks
    FOR DELETE TO authenticated USING (EXISTS (
        SELECT 1 FROM public.projects
        WHERE projects.id = tasks.project_id AND projects.owner_id = auth.uid()
    ));

-- Agents: Marketplace templates are readable by all authenticated users.
-- Deployed agents are owned by the user who deployed them.
CREATE POLICY "Agents readable" ON public.agents 
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can create own agents" ON public.agents
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own agents" ON public.agents
    FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own agents" ON public.agents
    FOR DELETE TO authenticated USING (auth.uid() = user_id);
