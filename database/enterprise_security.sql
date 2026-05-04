-- Enterprise Teams Table
CREATE TABLE IF NOT EXISTS teams (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Team Members Table
CREATE TABLE IF NOT EXISTS team_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT CHECK (role IN ('admin', 'editor', 'viewer')) DEFAULT 'viewer',
    UNIQUE(team_id, user_id)
);

-- Add team_id to Projects
ALTER TABLE projects ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id);

-- Advanced RLS for Projects
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view projects of their teams
CREATE POLICY "Team members can view team projects" ON projects
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM team_members 
            WHERE team_members.team_id = projects.team_id 
            AND team_members.user_id = auth.uid()
        )
    );

-- Policy: Only admins and editors can modify projects
CREATE POLICY "Team admins and editors can modify projects" ON projects
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM team_members 
            WHERE team_members.team_id = projects.team_id 
            AND team_members.user_id = auth.uid()
            AND team_members.role IN ('admin', 'editor')
        )
    );

-- Audit Logs for RLS
CREATE POLICY "Team members can view audit logs" ON audit_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM projects
            JOIN team_members ON team_members.team_id = projects.team_id
            WHERE projects.id = audit_logs.task_id -- Simplified link
            AND team_members.user_id = auth.uid()
        )
    );
