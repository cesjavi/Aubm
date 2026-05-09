-- Normalized task claims and evidence extracted from structured task outputs.

CREATE TABLE IF NOT EXISTS public.task_claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    claim_text TEXT NOT NULL,
    claim_type TEXT CHECK (claim_type IN ('finding', 'entity_strength', 'entity_weakness', 'recommendation', 'risk', 'unknown')) DEFAULT 'finding',
    entity_name TEXT,
    entity_key TEXT,
    claim_hash TEXT,
    source_url TEXT,
    confidence TEXT CHECK (confidence IN ('low', 'medium', 'high', 'unknown')) DEFAULT 'unknown',
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS task_claims_project_idx
ON public.task_claims(project_id);

CREATE INDEX IF NOT EXISTS task_claims_task_idx
ON public.task_claims(task_id);

CREATE INDEX IF NOT EXISTS task_claims_entity_idx
ON public.task_claims(entity_name);

CREATE INDEX IF NOT EXISTS task_claims_entity_key_idx
ON public.task_claims(entity_key);

CREATE UNIQUE INDEX IF NOT EXISTS task_claims_project_hash_idx
ON public.task_claims(project_id, claim_hash)
WHERE claim_hash IS NOT NULL;

ALTER TABLE public.task_claims
ADD COLUMN IF NOT EXISTS entity_key TEXT,
ADD COLUMN IF NOT EXISTS claim_hash TEXT;

ALTER TABLE public.task_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can manage task claims" ON public.task_claims;
DROP POLICY IF EXISTS "Task claims visible through projects" ON public.task_claims;

CREATE POLICY "Service role can manage task claims" ON public.task_claims
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Task claims visible through projects" ON public.task_claims
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.projects
            WHERE projects.id = task_claims.project_id
              AND (projects.owner_id = auth.uid() OR projects.is_public = true)
        )
    );

NOTIFY pgrst, 'reload schema';
