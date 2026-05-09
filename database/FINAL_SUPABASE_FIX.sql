-- FINAL ROBUST FIX: DATABASE VIEWS WITH AUTH JOIN (Phase 8)
-- RUN THIS IN SUPABASE SQL EDITOR TO RESOLVE ALL GOVERNANCE ISSUES

-- 1. TEAM MEMBERS VIEW (Joining auth.users for guaranteed email)
CREATE OR REPLACE VIEW public.team_members_with_profiles AS
SELECT 
    tm.id,
    tm.team_id,
    tm.user_id,
    tm.role,
    tm.created_at,
    p.full_name,
    u.email
FROM public.team_members tm
LEFT JOIN public.profiles p ON tm.user_id = p.id
LEFT JOIN auth.users u ON tm.user_id = u.id;

GRANT SELECT ON public.team_members_with_profiles TO authenticated;

-- 2. AUDIT LOGS VIEW
CREATE OR REPLACE VIEW public.audit_logs_with_details AS
SELECT 
    al.id,
    al.user_id,
    al.action,
    al.agent_id,
    al.task_id,
    al.metadata,
    al.created_at,
    p.full_name AS actor_name,
    u.email AS actor_email,
    ag.name AS agent_name,
    t.title AS task_title
FROM public.audit_logs al
LEFT JOIN public.profiles p ON al.user_id = p.id
LEFT JOIN auth.users u ON al.user_id = u.id
LEFT JOIN public.agents ag ON al.agent_id = ag.id
LEFT JOIN public.tasks t ON al.task_id = t.id;

GRANT SELECT ON public.audit_logs_with_details TO authenticated;

-- 3. RE-SYNC SCHEMA
NOTIFY pgrst, 'reload schema';
