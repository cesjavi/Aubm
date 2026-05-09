-- Seed Data for Aubm

-- 1. Default Agents
INSERT INTO public.agents (name, role, api_provider, model, system_prompt)
VALUES 
('Qwen on AMD', 'General Intelligence', 'amd', 'qwen3-coder-flash', 'You are a highly capable AI assistant running on AMD inference.'),
('AMD Qwen Coder', 'Performance Specialist', 'amd', 'qwen3-coder-flash', 'You are a high-performance agent running Qwen on AMD infrastructure.'),
('Qwen Fast Logic', 'Fast Logic', 'amd', 'qwen3-coder-flash', 'You are a fast and efficient reasoning agent running Qwen on AMD infrastructure.');

-- 2. Default App Config
INSERT INTO public.app_config (key, value)
VALUES 
('output_language', '"en"'),
('max_parallel_tasks', '5'),
('enable_human_loop', 'true');
