-- Support for team-specific agent templates in the marketplace
ALTER TABLE public.agent_templates
ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT true;

-- Update existing templates to be public
UPDATE public.agent_templates SET is_public = true WHERE is_public IS NULL;

-- Update RLS Policies
DROP POLICY IF EXISTS "Anyone can view templates" ON public.agent_templates;
CREATE POLICY "Anyone can view templates" ON public.agent_templates
    FOR SELECT TO authenticated
    USING (
        is_public = true 
        OR (team_id IS NOT NULL AND public.is_team_member(team_id))
    );

DROP POLICY IF EXISTS "Users can create their own templates" ON public.agent_templates;
CREATE POLICY "Users can create templates" ON public.agent_templates
    FOR INSERT TO authenticated
    WITH CHECK (
        auth.uid() = author_id 
        AND (team_id IS NULL OR public.can_edit_project(team_id)) -- Borrowing can_edit_project logic or using can_admin_team
    );

-- Better: use can_admin_team for team templates
DROP POLICY IF EXISTS "Users can create templates" ON public.agent_templates;
CREATE POLICY "Users can create templates" ON public.agent_templates
    FOR INSERT TO authenticated
    WITH CHECK (
        auth.uid() = author_id 
        AND (
            (team_id IS NULL AND is_public = true) -- Public templates by anyone (could be restricted later)
            OR (team_id IS NOT NULL AND public.is_team_member(team_id)) -- Team members can create team templates
        )
    );

DROP POLICY IF EXISTS "Owners or team admins can delete templates" ON public.agent_templates;
CREATE POLICY "Owners or team admins can delete templates" ON public.agent_templates
    FOR DELETE TO authenticated
    USING (
        auth.uid() = author_id 
        OR (team_id IS NOT NULL AND public.can_admin_team(team_id))
    );
