-- Configure AMD as the default Qwen provider and migrate existing agents.

UPDATE public.agents
SET
  api_provider = 'amd',
  model = 'qwen3-coder-flash'
WHERE api_provider IN ('amd', 'openai')
   OR model IN ('gpt-4o', 'gpt-4o-mini', 'llama3.3-70b-instruct');

INSERT INTO public.app_config (key, value)
VALUES (
  'amd',
  '{
    "enabled": true,
    "default_model": "qwen3-coder-flash",
    "temperature": 0.7,
    "max_tokens": 4096,
    "base_url": "https://inference.do-ai.run/v1"
  }'::jsonb
)
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value;

INSERT INTO public.app_config (key, value)
VALUES (
  'default_provider',
  '"amd"'::jsonb
)
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value;
