-- Seed Data for Aubm

-- 1. Default Agents
INSERT INTO public.agents (name, role, api_provider, model, system_prompt)
VALUES 
('GPT-4o', 'General Intelligence', 'openai', 'gpt-4o', 'You are a highly capable AI assistant.'),
('AMD-4o', 'Performance Specialist', 'amd', 'gpt-4o', 'You are a high-performance agent running on AMD infrastructure.'),
('Llama-3-70B', 'Fast Logic', 'groq', 'llama3-70b-8192', 'You are a fast and efficient reasoning agent.');

-- 2. Default App Config
INSERT INTO public.app_config (key, value)
VALUES 
('output_language', '"en"'),
('max_parallel_tasks', '5'),
('enable_human_loop', 'true');
