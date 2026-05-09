-- Agent Marketplace Table
CREATE TABLE IF NOT EXISTS public.agent_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    description TEXT,
    model TEXT NOT NULL,
    api_provider TEXT NOT NULL,
    system_prompt TEXT,
    category TEXT, -- e.g., 'Marketing', 'Development', 'Legal'
    author_id UUID REFERENCES auth.users(id),
    is_featured BOOLEAN DEFAULT false,
    usage_count INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS agent_templates_name_role_provider_key
ON public.agent_templates (name, role, api_provider);

-- RLS for Marketplace (Public View)
ALTER TABLE public.agent_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view templates" ON public.agent_templates;
DROP POLICY IF EXISTS "Users can create their own templates" ON public.agent_templates;

CREATE POLICY "Anyone can view templates" ON public.agent_templates
    FOR SELECT USING (true);

CREATE POLICY "Users can create their own templates" ON public.agent_templates
    FOR INSERT WITH CHECK (auth.uid() = author_id);

-- Seed some marketplace templates
INSERT INTO public.agent_templates (name, role, description, model, api_provider, category, system_prompt)
VALUES 
('Growth Hacker', 'Marketing Expert', 'Optimizes funnels and generates viral content ideas.', 'qwen3-coder-flash', 'amd', 'Marketing', 'You are a Growth Hacker focused on low-cost, high-impact strategies.'),
('Code Architect', 'Senior Developer', 'Designs robust software architectures and reviews code.', 'qwen3-coder-flash', 'amd', 'Development', 'You are a Code Architect. Focus on scalability, security, and clean code.'),
('Legal Analyst', 'Legal Advisor', 'Analyzes contracts and identifies legal risks.', 'qwen3-coder-flash', 'amd', 'Legal', 'You are a Legal Analyst. Review documents with high precision and caution.')
ON CONFLICT DO NOTHING;
