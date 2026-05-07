-- Add table-level audit triggers for mutations that may happen directly through Supabase.
-- This complements backend audit events and covers frontend writes to projects, tasks,
-- agents, and profiles.

CREATE OR REPLACE FUNCTION public.log_table_mutation_audit()
RETURNS TRIGGER AS $$
DECLARE
    actor_id UUID;
    old_data JSONB;
    new_data JSONB;
    row_data JSONB;
    changed_keys TEXT[];
    audit_task_id UUID;
    project_ref TEXT;
BEGIN
    actor_id := auth.uid();
    old_data := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END;
    new_data := CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END;
    row_data := COALESCE(new_data, old_data, '{}'::jsonb);
    audit_task_id := NULL;
    project_ref := NULL;

    IF TG_TABLE_NAME = 'tasks' AND row_data ? 'id' THEN
        audit_task_id := (row_data->>'id')::uuid;
        project_ref := row_data->>'project_id';
    ELSIF TG_TABLE_NAME = 'projects' AND row_data ? 'id' THEN
        project_ref := row_data->>'id';
    END IF;

    IF TG_OP = 'UPDATE' THEN
        SELECT COALESCE(array_agg(key ORDER BY key), ARRAY[]::text[])
        INTO changed_keys
        FROM (
            SELECT COALESCE(n.key, o.key) AS key
            FROM jsonb_each(old_data) AS o
            FULL JOIN jsonb_each(new_data) AS n ON n.key = o.key
            WHERE o.value IS DISTINCT FROM n.value
        ) changed;
    ELSE
        changed_keys := ARRAY[]::text[];
    END IF;

    INSERT INTO public.audit_logs (user_id, task_id, action, metadata)
    VALUES (
        actor_id,
        audit_task_id,
        lower(TG_TABLE_NAME || '_' || TG_OP),
        jsonb_build_object(
            'table', TG_TABLE_NAME,
            'operation', TG_OP,
            'record_id', row_data->>'id',
            'project_id', project_ref,
            'changed_fields', changed_keys
        )
    );

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.log_table_mutation_audit() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_table_mutation_audit() TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_table_mutation_audit() TO service_role;

DROP TRIGGER IF EXISTS audit_projects_mutations ON public.projects;
CREATE TRIGGER audit_projects_mutations
AFTER INSERT OR UPDATE OR DELETE ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.log_table_mutation_audit();

DROP TRIGGER IF EXISTS audit_tasks_mutations ON public.tasks;
CREATE TRIGGER audit_tasks_mutations
AFTER INSERT OR UPDATE OR DELETE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.log_table_mutation_audit();

DROP TRIGGER IF EXISTS audit_agents_mutations ON public.agents;
CREATE TRIGGER audit_agents_mutations
AFTER INSERT OR UPDATE OR DELETE ON public.agents
FOR EACH ROW EXECUTE FUNCTION public.log_table_mutation_audit();

DROP TRIGGER IF EXISTS audit_profiles_mutations ON public.profiles;
CREATE TRIGGER audit_profiles_mutations
AFTER UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.log_table_mutation_audit();

NOTIFY pgrst, 'reload schema';
