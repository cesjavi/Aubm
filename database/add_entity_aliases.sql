-- Project-scoped entity aliases for normalized evidence.
-- Allows "OpenAI Inc." and "OpenAI" to share the same canonical entity_key.

CREATE TABLE IF NOT EXISTS public.project_entity_aliases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    canonical_name TEXT NOT NULL,
    canonical_key TEXT NOT NULL,
    alias TEXT NOT NULL,
    alias_key TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_id, alias_key)
);

CREATE INDEX IF NOT EXISTS project_entity_aliases_project_idx
ON public.project_entity_aliases(project_id);

CREATE INDEX IF NOT EXISTS project_entity_aliases_canonical_key_idx
ON public.project_entity_aliases(project_id, canonical_key);

ALTER TABLE public.project_entity_aliases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can manage project entity aliases" ON public.project_entity_aliases;
DROP POLICY IF EXISTS "Project entity aliases visible through projects" ON public.project_entity_aliases;

CREATE POLICY "Service role can manage project entity aliases" ON public.project_entity_aliases
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Project entity aliases visible through projects" ON public.project_entity_aliases
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.projects
            WHERE projects.id = project_entity_aliases.project_id
              AND (projects.owner_id = auth.uid() OR projects.is_public = true)
        )
    );

NOTIFY pgrst, 'reload schema';
