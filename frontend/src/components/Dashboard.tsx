import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FolderOpen, Play, RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '../services/supabase';
import { useAuth } from '../context/useAuth';

interface Project {
  id: string;
  name: string;
  description: string | null;
  status: string;
  created_at: string;
}

interface Task {
  id: string;
  project_id: string;
  status: string;
}

interface DashboardProps {
  onNewProject: () => void;
  onOpenProject: (projectId: string) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ onNewProject, onOpenProject }) => {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);

    const { data: projectData, error: projectError } = await supabase
      .from('projects')
      .select('id,name,description,status,created_at')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: false });

    if (projectError) {
      setError(projectError.message);
      setLoading(false);
      return;
    }

    const projectIds = (projectData ?? []).map((project) => project.id);
    let taskData: Task[] = [];

    if (projectIds.length) {
      const { data, error: taskError } = await supabase
        .from('tasks')
        .select('id,project_id,status')
        .in('project_id', projectIds);

      if (taskError) {
        setError(taskError.message);
      } else {
        taskData = data ?? [];
      }
    }

    setProjects(projectData ?? []);
    setTasks(taskData);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const taskCounts = useMemo(() => {
    return tasks.reduce<Record<string, { done: number; total: number }>>((acc, task) => {
      if (!acc[task.project_id]) acc[task.project_id] = { done: 0, total: 0 };
      acc[task.project_id].total += 1;
      if (task.status === 'done') acc[task.project_id].done += 1;
      return acc;
    }, {});
  }, [tasks]);

  return (
    <>
      <div className="page-heading dashboard-heading">
        <div>
          <h2>Project Dashboard</h2>
          <p style={{ color: 'var(--text-dim)' }}>Monitor and manage your autonomous AI agent workflows.</p>
        </div>
        <div className="button-row">
          <button className="btn btn-glass" onClick={loadDashboard} disabled={loading}>
            <RefreshCw size={18} />
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
          <button className="btn btn-primary" onClick={onNewProject}>
            <FolderOpen size={18} />
            New Project
          </button>
        </div>
      </div>

      {error && <div className="inline-status">{error}</div>}

      {!loading && projects.length === 0 && (
        <div className="glass-panel empty-state">
          <FolderOpen size={32} color="var(--accent)" />
          <h3>No projects yet</h3>
          <p>Create a project to start assigning agents and tasks.</p>
          <button className="btn btn-primary" onClick={onNewProject}>
            Create Project
          </button>
        </div>
      )}

      <div className="dashboard-grid">
        {projects.map((project) => {
          const counts = taskCounts[project.id] ?? { done: 0, total: 0 };
          return (
            <ProjectCard
              key={project.id}
              name={project.name}
              description={project.description}
              status={project.status}
              tasksDone={counts.done}
              tasksTotal={counts.total}
              onOpen={() => onOpenProject(project.id)}
            />
          );
        })}
      </div>
    </>
  );
};

const ProjectCard: React.FC<{ name: string; description: string | null; status: string; tasksDone: number; tasksTotal: number; onOpen: () => void }> = ({
  name,
  description,
  status,
  tasksDone,
  tasksTotal,
  onOpen
}) => {
  const progress = tasksTotal > 0 ? (tasksDone / tasksTotal) * 100 : 0;

  return (
    <motion.div whileHover={{ y: -5 }} className="glass-panel project-card" style={{ padding: 'var(--space-lg)', position: 'relative', overflow: 'hidden' }}>
      <div className="project-card-header">
        <h3 style={{ fontSize: '1.25rem' }}>{name}</h3>
        <StatusBadge status={status} />
      </div>

      <p style={{ color: 'var(--text-dim)', minHeight: '3rem', marginBottom: 'var(--space-lg)' }}>
        {description || 'No description provided.'}
      </p>

      <div style={{ marginBottom: 'var(--space-lg)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: 'var(--space-xs)' }}>
          <span style={{ color: 'var(--text-dim)' }}>Tasks Progress</span>
          <span>{tasksDone}/{tasksTotal}</span>
        </div>
        <div style={{ height: '6px', width: '100%', background: 'rgba(255,255,255,0.1)', borderRadius: '3px' }}>
          <div style={{ height: '100%', width: `${progress}%`, background: 'var(--accent)', borderRadius: '3px', boxShadow: '0 0 10px var(--accent)' }} />
        </div>
      </div>

      <button className="btn btn-primary" style={{ width: '100%' }} onClick={onOpen}>
        <Play size={16} fill="white" />
        Open Project
      </button>
    </motion.div>
  );
};

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const normalized = status.replace('_', ' ');
  const color = status === 'active' ? 'var(--success)' : status === 'completed' ? 'var(--info)' : 'var(--text-muted)';

  return (
    <span style={{
      fontSize: '0.7rem',
      padding: '0.2rem 0.6rem',
      borderRadius: 'var(--radius-full)',
      background: 'rgba(255,255,255,0.05)',
      border: `1px solid ${color}`,
      color,
      textTransform: 'uppercase',
      fontWeight: 700,
      letterSpacing: '0.05em'
    }}>
      {normalized}
    </span>
  );
};

export default Dashboard;
