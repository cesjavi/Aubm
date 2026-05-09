-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- 1. Upgrade task_claims with vector support
ALTER TABLE public.task_claims
ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- Index for semantic search on claims
CREATE INDEX IF NOT EXISTS task_claims_embedding_idx 
ON public.task_claims 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- 2. Create Long-Term Project Memory table
-- This stores higher-level insights, approved summaries, and cross-project knowledge.
CREATE TABLE IF NOT EXISTS public.project_memory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    embedding vector(1536),
    metadata JSONB DEFAULT '{}'::jsonb,
    memory_type TEXT CHECK (memory_type IN ('strategic_insight', 'approved_output', 'code_snippet', 'market_data', 'custom')) DEFAULT 'approved_output',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for semantic search on long-term memory
CREATE INDEX IF NOT EXISTS project_memory_embedding_idx 
ON public.project_memory 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

ALTER TABLE public.project_memory ENABLE ROW LEVEL SECURITY;

-- Permissions
DROP POLICY IF EXISTS "Service role can manage memory" ON public.project_memory;
CREATE POLICY "Service role can manage memory" ON public.project_memory
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Memory visible to project owners" ON public.project_memory;
CREATE POLICY "Memory visible to project owners" ON public.project_memory
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.projects
            WHERE projects.id = project_memory.project_id
              AND (projects.owner_id = auth.uid() OR projects.is_public = true)
        )
    );

-- Helper function for semantic similarity search
CREATE OR REPLACE FUNCTION match_project_memory (
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  filter_project_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  project_id uuid,
  content text,
  metadata jsonb,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    pm.id,
    pm.project_id,
    pm.content,
    pm.metadata,
    1 - (pm.embedding <=> query_embedding) AS similarity
  FROM public.project_memory pm
  WHERE (filter_project_id IS NULL OR pm.project_id = filter_project_id)
    AND 1 - (pm.embedding <=> query_embedding) > match_threshold
  ORDER BY pm.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

NOTIFY pgrst, 'reload schema';
