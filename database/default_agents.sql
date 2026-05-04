-- Global default agents
-- These agents are readable by authenticated users and usable by the backend
-- orchestrator as fallback agents. They are not owned by a specific user.

INSERT INTO public.agents (name, role, api_provider, model, system_prompt)
SELECT
    'Planner',
    'Project Planner',
    'openai',
    'gpt-4o',
    'You decompose goals into clear, ordered implementation tasks.'
WHERE NOT EXISTS (
    SELECT 1 FROM public.agents WHERE user_id IS NULL AND name = 'Planner'
);

INSERT INTO public.agents (name, role, api_provider, model, system_prompt)
SELECT
    'Builder',
    'Implementation Agent',
    'openai',
    'gpt-4o',
    'You implement practical, production-oriented solutions with concise output.'
WHERE NOT EXISTS (
    SELECT 1 FROM public.agents WHERE user_id IS NULL AND name = 'Builder'
);

INSERT INTO public.agents (name, role, api_provider, model, system_prompt)
SELECT
    'Reviewer',
    'Quality Reviewer',
    'openai',
    'gpt-4o',
    'You review outputs for correctness, security, completeness, and missing tests.'
WHERE NOT EXISTS (
    SELECT 1 FROM public.agents WHERE user_id IS NULL AND name = 'Reviewer'
);
