-- Add execution duration tracking to existing Supabase projects.
-- Apply this migration if task_runs was created before duration_seconds existed.

ALTER TABLE public.task_runs
ADD COLUMN IF NOT EXISTS duration_seconds NUMERIC(10, 2);

NOTIFY pgrst, 'reload schema';
