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
    status TEXT CHECK (status IN ('todo', 'in_progress', 'awaiting_approval', 'done', 'failed', 'cancelled')) DEFAULT 'todo',
    priority INTEGER DEFAULT 0,
    is_critical BOOLEAN DEFAULT FALSE,
    output_data JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Task Runs (Execution History)
CREATE TABLE IF NOT EXISTS public.task_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID REFERENCES public.tasks ON DELETE CASCADE,
    agent_id UUID REFERENCES public.agents ON DELETE SET NULL,
    status TEXT CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')) DEFAULT 'queued',
    error_message TEXT,
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

-- 7. App Config (Global Settings)
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
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

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
