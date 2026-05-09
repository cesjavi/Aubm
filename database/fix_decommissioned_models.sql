-- Migration to fix decommissioned legacy models
-- Replaces decommissioned legacy models with AMD/Qwen across all tables

-- 1. Update agents (this is where the model is stored)
UPDATE public.agents 
SET api_provider = 'amd',
    model = 'qwen3-coder-flash'
WHERE model IN ('llama3-70b-8192', 'llama-3.3-70b-versatile', 'llama3.3-70b-instruct');

-- 2. Update any app_config entries
UPDATE public.app_config 
SET value = jsonb_set(value, '{default_model}', '"qwen3-coder-flash"')
WHERE key = 'amd' AND value->>'default_model' IN ('llama3-70b-8192', 'llama-3.3-70b-versatile', 'llama3.3-70b-instruct');

-- 3. Reset failed tasks that were stuck due to this error
-- We don't filter by model here because tasks don't have a model column,
-- but we can filter by the error message logged in 'last_error'
UPDATE public.tasks 
SET status = 'queued' 
WHERE status = 'failed' AND last_error LIKE '%llama3-70b-8192%';
