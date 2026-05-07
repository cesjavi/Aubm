-- Track background worker heartbeats for operations monitoring.

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

ALTER TABLE public.worker_heartbeats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can manage worker heartbeats" ON public.worker_heartbeats;

CREATE POLICY "Service role can manage worker heartbeats" ON public.worker_heartbeats
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
