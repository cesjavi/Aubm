-- Emergency Reset for stuck tasks
-- Sets attempts to 0 and clears any old leases/errors

UPDATE tasks 
SET 
    status = 'queued',
    queue_attempts = 0,
    leased_at = NULL,
    lease_expires_at = NULL,
    next_attempt_at = NOW(),
    queue_worker_id = NULL
WHERE status IN ('queued', 'failed', 'in_progress');
