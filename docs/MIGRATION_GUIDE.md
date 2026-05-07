# Existing Supabase Migration Guide

Use this guide when the app code is newer than an existing Supabase database.

Run migrations from the Supabase SQL Editor. Most files are idempotent or use `IF NOT EXISTS`, but still review them before applying in production.

## Recommended Order

For an existing project, apply only the migrations that match your current missing feature or error.

### 1. Task Run Duration

Apply when the app reports:

```text
Could not find the 'duration_seconds' column of 'task_runs' in the schema cache
```

Run:

```sql
-- database/add_task_run_duration.sql
```

### 2. Queued Task Status

Apply before using `backend/worker.py` or `TaskQueueService`.

Run:

```sql
-- database/add_task_queued_status.sql
```

This allows:

```text
tasks.status = queued
```

### 3. Queue Leasing

Apply before running more than one worker, or when the worker reports that `claim_next_queued_task` is missing.

Run:

```sql
-- database/add_task_queue_leasing.sql
```

This adds queue metadata columns and the atomic claim function used by `TaskQueueService.claim_next_queued_task`.

### 4. Worker Heartbeats

Apply before using Monitoring to inspect worker activity.

Run:

```sql
-- database/add_worker_heartbeats.sql
```

This creates `worker_heartbeats`, used by `backend/worker.py` and `/monitoring/summary`.

### 5. Retry Backoff

Apply before using worker retry/backoff behavior.

Run:

```sql
-- database/add_task_queue_retry_backoff.sql
```

This adds `tasks.next_attempt_at` and updates `claim_next_queued_task` so delayed retries are not claimed too early.

### 6. Audit Mutation Triggers

Apply when you want direct Supabase writes from the frontend to create audit events.

Run:

```sql
-- database/add_audit_mutation_triggers.sql
```

This adds triggers for project, task, agent, and profile mutations.

### 7. Manager Role

Apply when admin settings need to assign `manager`.

Run:

```sql
-- database/add_profile_manager_role.sql
```

### 8. Profile RLS Recursion Fix

Apply when profile/admin policies trigger recursive RLS errors.

Run:

```sql
-- database/fix_profiles_recursion.sql
```

### 9. Marketplace Templates

Apply when the Marketplace is empty or `agent_templates` does not exist.

Run:

```sql
-- database/marketplace.sql
```

### 10. Agent Ownership

Apply when deploying marketplace agents fails because `agents.user_id` is missing or RLS blocks inserts.

Run:

```sql
-- database/agent_ownership.sql
```

### 11. Task Dependencies

Apply when dependency links do not persist.

Run:

```sql
-- database/task_dependencies.sql
```

## Schema Cache

After schema changes, reload PostgREST:

```sql
NOTIFY pgrst, 'reload schema';
```

Some migration files already include this line.

## Verification Queries

Check task statuses:

```sql
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.tasks'::regclass
  AND contype = 'c';
```

Check task run duration:

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'task_runs'
  AND column_name = 'duration_seconds';
```

Check profile roles:

```sql
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'profiles';
```

Check marketplace templates:

```sql
SELECT COUNT(*) AS template_count
FROM public.agent_templates;
```

Check queue claim function:

```sql
SELECT proname
FROM pg_proc
WHERE proname = 'claim_next_queued_task';
```

Check worker heartbeats:

```sql
SELECT worker_id, status, current_task_id, last_seen_at
FROM public.worker_heartbeats
ORDER BY last_seen_at DESC;
```

Check delayed retries:

```sql
SELECT id, title, queue_attempts, next_attempt_at, last_error
FROM public.tasks
WHERE status = 'queued'
  AND next_attempt_at > NOW()
ORDER BY next_attempt_at;
```

Check audit trigger installation:

```sql
SELECT tgname
FROM pg_trigger
WHERE tgname LIKE 'audit_%_mutations'
ORDER BY tgname;
```
