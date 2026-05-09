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

### 7. Task Claims

Apply before using normalized claim/evidence extraction.

Run:

```sql
-- database/add_task_claims.sql
```

This creates `task_claims`, where structured task outputs can persist extracted claims, entities, normalized entity keys, claim hashes, source URLs, and confidence values.

### 8. Entity Aliases

Apply when extracted claims should canonicalize entity aliases before deduplication.

Run:

```sql
-- database/add_entity_aliases.sql
```

This creates `project_entity_aliases`, where project-scoped aliases can map multiple names to one canonical `entity_key`.

### 9. Project Budgets

Apply before using per-project token/cost budgets or budget APIs.

Run:

```sql
-- database/add_project_budgets.sql
```

This creates `project_budgets` and `project_usage_events`. Budgets are optional: projects without a budget row continue to execute normally.

### 10. Manager Role

Apply when admin settings need to assign `manager`.

Run:

```sql
-- database/add_profile_manager_role.sql
```

### 11. Final Profile RLS Hardening

Apply when profile/admin policies trigger recursive RLS errors, profile creation fails with RLS, or users need to edit their own profile without being able to change `role`.

Run:

```sql
-- database/fix_profiles_rls_final.sql
```

This replaces older profile policies with owner/admin policies and adds a trigger that prevents non-admin role changes.

If you only need the older minimal recursion fix, run:

```sql
-- database/fix_profiles_recursion.sql
```

### 12. Marketplace Templates

Apply when the Marketplace is empty or `agent_templates` does not exist.

Run:

```sql
-- database/marketplace.sql
```

### 13. Team Permissions

Apply when projects should be shared through explicit team membership rather than only `owner_id` or `is_public`.

Run:

```sql
-- database/add_team_permissions.sql
```

This creates `teams`, `team_members`, adds `projects.team_id`, and replaces project/task policies with owner-or-team access checks. If `task_claims`, `project_entity_aliases`, `project_budgets`, or `project_usage_events` already exist, the migration also updates their read policies to use `can_view_project(project_id)` so team members can read project evidence and budget status.

### 14. Agent Ownership

Apply when deploying marketplace agents fails because `agents.user_id` is missing or RLS blocks inserts.

Run:

```sql
-- database/agent_ownership.sql
```

### 13. Task Dependencies

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

Check final profile RLS trigger:

```sql
SELECT tgname
FROM pg_trigger
WHERE tgname = 'protect_profile_role_trigger';
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

Check task claims:

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'task_claims';
```

Check team permission helpers:

```sql
SELECT proname
FROM pg_proc
WHERE proname IN ('is_team_member', 'can_admin_team', 'can_view_project', 'can_edit_project');
```
