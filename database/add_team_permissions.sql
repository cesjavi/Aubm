-- Add workspace/team permissions while preserving existing owner-based access.
-- Roles:
-- - admin: manage team membership and edit team projects/tasks
-- - editor: edit team projects/tasks
-- - viewer: read team projects/tasks

CREATE TABLE IF NOT EXISTS public.teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.team_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('admin', 'editor', 'viewer')) DEFAULT 'viewer',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(team_id, user_id)
);

ALTER TABLE public.teams
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.team_members
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.projects
ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS team_members_team_user_idx
ON public.team_members(team_id, user_id);

CREATE INDEX IF NOT EXISTS projects_team_id_idx
ON public.projects(team_id);

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.add_team_creator_as_admin()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.created_by IS NOT NULL THEN
    INSERT INTO public.team_members (team_id, user_id, role)
    VALUES (NEW.id, NEW.created_by, 'admin')
    ON CONFLICT (team_id, user_id) DO UPDATE
    SET role = 'admin',
        updated_at = NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.add_team_creator_as_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_team_creator_as_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_team_creator_as_admin() TO service_role;

DROP TRIGGER IF EXISTS add_team_creator_as_admin_trigger ON public.teams;
CREATE TRIGGER add_team_creator_as_admin_trigger
AFTER INSERT ON public.teams
FOR EACH ROW EXECUTE FUNCTION public.add_team_creator_as_admin();

CREATE OR REPLACE FUNCTION public.is_team_member(target_team_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.team_members
    WHERE team_id = target_team_id
      AND user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.can_admin_team(target_team_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.team_members
    WHERE team_id = target_team_id
      AND user_id = auth.uid()
      AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.can_view_project(target_project_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  project_owner UUID;
  project_team UUID;
  project_public BOOLEAN;
BEGIN
  SELECT owner_id, team_id, is_public
  INTO project_owner, project_team, project_public
  FROM public.projects
  WHERE id = target_project_id;

  RETURN auth.uid() = project_owner
    OR COALESCE(project_public, false)
    OR (project_team IS NOT NULL AND public.is_team_member(project_team));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.can_edit_project(target_project_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  project_owner UUID;
  project_team UUID;
BEGIN
  SELECT owner_id, team_id
  INTO project_owner, project_team
  FROM public.projects
  WHERE id = target_project_id;

  RETURN auth.uid() = project_owner
    OR EXISTS (
      SELECT 1
      FROM public.team_members
      WHERE team_id = project_team
        AND user_id = auth.uid()
        AND role IN ('admin', 'editor')
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.is_team_member(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_admin_team(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_view_project(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_edit_project(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_team_member(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_admin_team(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_project(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_edit_project(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_team_member(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.can_admin_team(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.can_view_project(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.can_edit_project(UUID) TO service_role;

-- Teams
DROP POLICY IF EXISTS "Teams are readable by members" ON public.teams;
DROP POLICY IF EXISTS "Users can create teams" ON public.teams;
DROP POLICY IF EXISTS "Team admins can update teams" ON public.teams;
DROP POLICY IF EXISTS "Team admins can delete teams" ON public.teams;

CREATE POLICY "Teams are readable by members" ON public.teams
  FOR SELECT TO authenticated
  USING (public.is_team_member(id));

CREATE POLICY "Users can create teams" ON public.teams
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Team admins can update teams" ON public.teams
  FOR UPDATE TO authenticated
  USING (public.can_admin_team(id))
  WITH CHECK (public.can_admin_team(id));

CREATE POLICY "Team admins can delete teams" ON public.teams
  FOR DELETE TO authenticated
  USING (public.can_admin_team(id));

-- Team members
DROP POLICY IF EXISTS "Team members are readable by team" ON public.team_members;
DROP POLICY IF EXISTS "Users can add themselves as team admin on own team" ON public.team_members;
DROP POLICY IF EXISTS "Team admins can add members" ON public.team_members;
DROP POLICY IF EXISTS "Team admins can update members" ON public.team_members;
DROP POLICY IF EXISTS "Team admins can delete members" ON public.team_members;

CREATE POLICY "Team members are readable by team" ON public.team_members
  FOR SELECT TO authenticated
  USING (public.is_team_member(team_id));

CREATE POLICY "Users can add themselves as team admin on own team" ON public.team_members
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND role = 'admin'
    AND EXISTS (
      SELECT 1
      FROM public.teams
      WHERE teams.id = team_id
        AND teams.created_by = auth.uid()
    )
  );

CREATE POLICY "Team admins can add members" ON public.team_members
  FOR INSERT TO authenticated
  WITH CHECK (public.can_admin_team(team_id));

CREATE POLICY "Team admins can update members" ON public.team_members
  FOR UPDATE TO authenticated
  USING (public.can_admin_team(team_id))
  WITH CHECK (public.can_admin_team(team_id));

CREATE POLICY "Team admins can delete members" ON public.team_members
  FOR DELETE TO authenticated
  USING (public.can_admin_team(team_id));

-- Projects
DROP POLICY IF EXISTS "Projects visibility" ON public.projects;
DROP POLICY IF EXISTS "Projects ownership" ON public.projects;
DROP POLICY IF EXISTS "Team members can view team projects" ON public.projects;
DROP POLICY IF EXISTS "Team admins and editors can modify projects" ON public.projects;
DROP POLICY IF EXISTS "Projects are visible by owner team or public" ON public.projects;
DROP POLICY IF EXISTS "Projects are insertable by owner or team admin" ON public.projects;
DROP POLICY IF EXISTS "Projects are editable by owner or team editors" ON public.projects;
DROP POLICY IF EXISTS "Projects are deletable by owner or team admins" ON public.projects;

CREATE POLICY "Projects are visible by owner team or public" ON public.projects
  FOR SELECT TO authenticated
  USING (auth.uid() = owner_id OR is_public = true OR public.is_team_member(team_id));

CREATE POLICY "Projects are insertable by owner or team admin" ON public.projects
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = owner_id
    AND (team_id IS NULL OR public.can_admin_team(team_id))
  );

CREATE POLICY "Projects are editable by owner or team editors" ON public.projects
  FOR UPDATE TO authenticated
  USING (public.can_edit_project(id))
  WITH CHECK (
    auth.uid() = owner_id
    OR public.can_edit_project(id)
  );

CREATE POLICY "Projects are deletable by owner or team admins" ON public.projects
  FOR DELETE TO authenticated
  USING (
    auth.uid() = owner_id
    OR (
      team_id IS NOT NULL
      AND public.can_admin_team(team_id)
    )
  );

-- Tasks inherit project permissions.
DROP POLICY IF EXISTS "Tasks visibility" ON public.tasks;
DROP POLICY IF EXISTS "Project owners can create tasks" ON public.tasks;
DROP POLICY IF EXISTS "Project owners can update tasks" ON public.tasks;
DROP POLICY IF EXISTS "Project owners can delete tasks" ON public.tasks;
DROP POLICY IF EXISTS "Tasks are visible through project access" ON public.tasks;
DROP POLICY IF EXISTS "Tasks are insertable by project editors" ON public.tasks;
DROP POLICY IF EXISTS "Tasks are editable by project editors" ON public.tasks;
DROP POLICY IF EXISTS "Tasks are deletable by project editors" ON public.tasks;

CREATE POLICY "Tasks are visible through project access" ON public.tasks
  FOR SELECT TO authenticated
  USING (public.can_view_project(project_id));

CREATE POLICY "Tasks are insertable by project editors" ON public.tasks
  FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_project(project_id));

CREATE POLICY "Tasks are editable by project editors" ON public.tasks
  FOR UPDATE TO authenticated
  USING (public.can_edit_project(project_id))
  WITH CHECK (public.can_edit_project(project_id));

CREATE POLICY "Tasks are deletable by project editors" ON public.tasks
  FOR DELETE TO authenticated
  USING (public.can_edit_project(project_id));

-- Optional evidence table integration. Keep this in the team migration so
-- add_task_claims.sql can still run independently before team support exists.
DO $$
BEGIN
  IF to_regclass('public.task_claims') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Task claims visible through projects" ON public.task_claims';
    EXECUTE 'DROP POLICY IF EXISTS "Task claims visible through project access" ON public.task_claims';
    EXECUTE 'CREATE POLICY "Task claims visible through project access" ON public.task_claims
      FOR SELECT TO authenticated
      USING (public.can_view_project(project_id))';
  END IF;

  IF to_regclass('public.project_entity_aliases') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Project entity aliases visible through projects" ON public.project_entity_aliases';
    EXECUTE 'DROP POLICY IF EXISTS "Project entity aliases visible through project access" ON public.project_entity_aliases';
    EXECUTE 'CREATE POLICY "Project entity aliases visible through project access" ON public.project_entity_aliases
      FOR SELECT TO authenticated
      USING (public.can_view_project(project_id))';
  END IF;

  IF to_regclass('public.project_budgets') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Project budgets visible through projects" ON public.project_budgets';
    EXECUTE 'DROP POLICY IF EXISTS "Project budgets visible through project access" ON public.project_budgets';
    EXECUTE 'CREATE POLICY "Project budgets visible through project access" ON public.project_budgets
      FOR SELECT TO authenticated
      USING (public.can_view_project(project_id))';
  END IF;

  IF to_regclass('public.project_usage_events') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Project usage visible through projects" ON public.project_usage_events';
    EXECUTE 'DROP POLICY IF EXISTS "Project usage visible through project access" ON public.project_usage_events';
    EXECUTE 'CREATE POLICY "Project usage visible through project access" ON public.project_usage_events
      FOR SELECT TO authenticated
      USING (public.can_view_project(project_id))';
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
