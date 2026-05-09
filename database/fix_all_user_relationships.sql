-- Global Fix for Schema Cache relationship discovery (Phase 8 Governance)
-- Ensures all user-related joins work correctly in PostgREST by pointing to public.profiles.

-- 1. Projects
ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_owner_id_fkey;
ALTER TABLE public.projects ADD CONSTRAINT projects_owner_id_fkey 
FOREIGN KEY (owner_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 2. Agents
ALTER TABLE public.agents DROP CONSTRAINT IF EXISTS agents_user_id_fkey;
ALTER TABLE public.agents ADD CONSTRAINT agents_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- 3. Audit Logs
ALTER TABLE public.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_actor_id_fkey;
ALTER TABLE public.audit_logs ADD CONSTRAINT audit_logs_actor_id_fkey 
FOREIGN KEY (actor_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 4. Agent Templates
ALTER TABLE public.agent_templates DROP CONSTRAINT IF EXISTS agent_templates_author_id_fkey;
ALTER TABLE public.agent_templates ADD CONSTRAINT agent_templates_author_id_fkey 
FOREIGN KEY (author_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 5. Notify PostgREST
NOTIFY pgrst, 'reload schema';
