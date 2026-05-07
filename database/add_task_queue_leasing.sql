-- Add queue leasing metadata and an atomic claim function for background workers.

ALTER TABLE public.tasks
ADD COLUMN IF NOT EXISTS queued_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS leased_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS queue_worker_id TEXT,
ADD COLUMN IF NOT EXISTS queue_attempts INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_error TEXT;

CREATE INDEX IF NOT EXISTS tasks_queue_claim_idx
ON public.tasks (status, priority DESC, queued_at, created_at)
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
    ORDER BY priority DESC, COALESCE(queued_at, created_at), created_at
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

NOTIFY pgrst, 'reload schema';
