-- Migration to fix decommissioned Groq models
-- Replaces llama3-70b-8192 with llama-3.3-70b-versatile across all tables

-- 1. Update agents (this is where the model is stored)
UPDATE public.agents 
SET model = 'llama-3.3-70b-versatile' 
WHERE model = 'llama3-70b-8192';

-- 2. Update any app_config entries
UPDATE public.app_config 
SET value = jsonb_set(value, '{default_model}', '"llama-3.3-70b-versatile"')
WHERE key = 'groq' AND value->>'default_model' = 'llama3-70b-8192';

-- 3. Reset failed tasks that were stuck due to this error
-- We don't filter by model here because tasks don't have a model column,
-- but we can filter by the error message logged in 'last_error'
UPDATE public.tasks 
SET status = 'queued' 
WHERE status = 'failed' AND last_error LIKE '%llama3-70b-8192%';
