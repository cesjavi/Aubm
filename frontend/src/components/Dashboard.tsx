import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FolderOpen, Play, RefreshCw, Search, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { getApiUrl } from '../services/runtimeConfig';
import { motion } from 'framer-motion';
import { supabase } from '../services/supabase';
import { useAuth } from '../context/useAuth';
import AubixIcon from './AubixIcon';
import StatusBadge from './common/StatusBadge';

interface Project {
  id: string;
  name: string;
  description: string | null;
  status: string;
  created_at: string;
  owner_id: string;
  is_public: boolean;
}

interface Task {
  id: string;
  project_id: string;
  status: string;
}

interface DashboardProps {
  onNewProject: (data?: any) => void;
  onOpenProject: (projectId: string) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ onNewProject, onOpenProject }) => {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [progressFilter, setProgressFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest');
  const [aiPrompt, setAiPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [magicFiles, setMagicFiles] = useState<File[]>([]);

  const loadDashboard = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);

    const { data: projectData, error: projectError } = await supabase
      .from('projects')
      .select('id,name,description,status,created_at,owner_id,is_public')
      .or(`owner_id.eq.${user.id},is_public.eq.true`)
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

  const handleDeleteProject = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete "${name}"? This action cannot be undone.`)) return;

    const { error: deleteError } = await supabase.from('projects').delete().eq('id', id);
    if (deleteError) {
      setError(`Error deleting project: ${deleteError.message}`);
    } else {
      loadDashboard();
    }
  };

  const handleMagicGenerate = async () => {
    if (!aiPrompt.trim()) return;
    setIsGenerating(true);
    
    try {
      const formData = new FormData();
      formData.append('prompt', aiPrompt);
      magicFiles.forEach(file => {
        formData.append('files', file);
      });

      const apiUrl = getApiUrl();

      const response = await fetch(`${apiUrl}/generator/generate-project`, {
        method: 'POST',
        body: formData
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'AI Generation failed');
      
      onNewProject(data); // Open NewProject wizard with pre-filled data
      setAiPrompt('');
      setMagicFiles([]);
    } catch (err: any) {
      console.error('Magic Generate Error:', err);
      setError(`AI Error: ${err.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const taskCounts = useMemo(() => {
    return tasks.reduce<Record<string, { done: number; total: number }>>((acc, task) => {
      if (!acc[task.project_id]) acc[task.project_id] = { done: 0, total: 0 };
      acc[task.project_id].total += 1;
      if (task.status === 'done') acc[task.project_id].done += 1;
      return acc;
    }, {});
  }, [tasks]);

  const filteredProjects = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return projects
      .filter((project) => {
        if (statusFilter !== 'all' && project.status !== statusFilter) return false;

        if (normalizedSearch) {
          const searchableText = `${project.name} ${project.description ?? ''}`.toLowerCase();
          if (!searchableText.includes(normalizedSearch)) return false;
        }

        const counts = taskCounts[project.id] ?? { done: 0, total: 0 };
        const progress = counts.total > 0 ? counts.done / counts.total : 0;

        if (progressFilter === 'not_started') return counts.done === 0;
        if (progressFilter === 'in_progress') return progress > 0 && progress < 1;
        if (progressFilter === 'completed') return counts.total > 0 && progress === 1;
        if (progressFilter === 'no_tasks') return counts.total === 0;

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'name') return a.name.localeCompare(b.name);
        if (sortBy === 'oldest') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        if (sortBy === 'progress') {
          const aCounts = taskCounts[a.id] ?? { done: 0, total: 0 };
          const bCounts = taskCounts[b.id] ?? { done: 0, total: 0 };
          const aProgress = aCounts.total > 0 ? aCounts.done / aCounts.total : 0;
          const bProgress = bCounts.total > 0 ? bCounts.done / bCounts.total : 0;
          return bProgress - aProgress;
        }

        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  }, [progressFilter, projects, searchTerm, sortBy, statusFilter, taskCounts]);

  const hasActiveFilters = Boolean(searchTerm.trim()) || statusFilter !== 'all' || progressFilter !== 'all' || sortBy !== 'newest';

  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setProgressFilter('all');
    setSortBy('newest');
  };

  return (
    <>
      <div className="page-heading dashboard-heading" style={{ marginBottom: 'var(--space-md)' }}>
        <div>
          <h2>Project Dashboard</h2>
          <p style={{ color: 'var(--text-dim)' }}>Monitor and manage your autonomous AI agent workflows.</p>
        </div>
        <div className="button-row">
          <button className="btn btn-glass" onClick={loadDashboard} disabled={loading}>
            <RefreshCw size={18} className={loading ? 'spin' : ''} />
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
          <button className="btn btn-primary" onClick={() => onNewProject()}>
            <FolderOpen size={18} />
            New Project
          </button>
        </div>
      </div>

      {/* AI Magic Bar (Aubix) */}
      <section className="glass-panel magic-box" style={{ 
        marginBottom: 'var(--space-xl)', 
        padding: '12px 20px', 
        border: '1px solid var(--accent)',
        boxShadow: '0 0 30px rgba(110, 89, 255, 0.15)',
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-lg)',
        background: 'rgba(110, 89, 255, 0.05)'
      }}>
        <AubixIcon size={64} />
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', gap: 'var(--space-sm)', position: 'relative' }}>
             <input 
               type="text" 
               placeholder="Ask Aubix to build a project... (e.g. 'Audit the Aubm codebase using MD files')"
               value={aiPrompt}
               onChange={(e) => setAiPrompt(e.target.value)}
               onKeyDown={(e) => e.key === 'Enter' && handleMagicGenerate()}
               style={{
                 width: '100%',
                 padding: '12px 20px',
                 paddingRight: '140px',
                 background: 'rgba(0,0,0,0.2)',
                 border: '1px solid var(--border)',
                 borderRadius: 'var(--radius-md)',
                 color: 'white',
                 fontSize: '1rem',
                 outline: 'none'
               }}
             />
             <div style={{ position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)', display: 'flex', gap: '6px' }}>
               <button 
                 className="btn btn-sm btn-glass" 
                 title="Reference Files"
                 onClick={() => {
                   const input = document.createElement('input');
                   input.type = 'file';
                   input.multiple = true;
                   input.onchange = (e) => setMagicFiles(Array.from((e.target as HTMLInputElement).files || []));
                   input.click();
                 }}
                 style={{ padding: '8px' }}
               >
                 <Search size={16} style={{ transform: 'rotate(45deg)' }} />
                 {magicFiles.length > 0 && <span className="count-badge" style={{ position: 'absolute', top: '-5px', right: '-5px', background: 'var(--accent)', fontSize: '0.6rem', padding: '2px 4px', borderRadius: '50%' }}>{magicFiles.length}</span>}
               </button>
               <button 
                 className="btn btn-sm btn-primary"
                 onClick={handleMagicGenerate}
                 disabled={isGenerating || !aiPrompt.trim()}
                 style={{ minWidth: '80px' }}
               >
                 {isGenerating ? <RefreshCw className="spin" size={16} /> : <Play size={16} />}
                 {isGenerating ? '...' : 'Generate'}
               </button>
             </div>
          </div>
          {magicFiles.length > 0 && (
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
              {magicFiles.map((f, i) => (
                <span key={i} style={{ fontSize: '0.7rem', background: 'rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid rgba(255,255,255,0.1)' }}>
                  {f.name}
                  <X size={10} style={{ cursor: 'pointer', opacity: 0.5 }} onClick={() => setMagicFiles(prev => prev.filter((_, idx) => idx !== i))} />
                </span>
              ))}
            </div>
          )}
        </div>
      </section>

      {error && <div className="inline-status">{error}</div>}

      {projects.length > 0 && (
        <div className="dashboard-controls glass-panel">
          <div className="dashboard-search">
            <Search size={17} />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search projects..."
              aria-label="Search projects"
            />
          </div>

          <div className="dashboard-filter-group">
            <SlidersHorizontal size={17} />
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter by status">
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
              <option value="archived">Archived</option>
            </select>
            <select value={progressFilter} onChange={(event) => setProgressFilter(event.target.value)} aria-label="Filter by progress">
              <option value="all">All progress</option>
              <option value="not_started">Not started</option>
              <option value="in_progress">In progress</option>
              <option value="completed">Completed tasks</option>
              <option value="no_tasks">No tasks</option>
            </select>
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value)} aria-label="Sort projects">
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="name">Name A-Z</option>
              <option value="progress">Most progress</option>
            </select>
          </div>

          <div className="dashboard-results">
            <span>{filteredProjects.length}/{projects.length} shown</span>
            {hasActiveFilters && (
              <button className="btn btn-glass btn-sm" type="button" onClick={clearFilters}>
                <X size={14} />
                Clear
              </button>
            )}
          </div>
        </div>
      )}

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

      {!loading && projects.length > 0 && filteredProjects.length === 0 && (
        <div className="glass-panel empty-state">
          <Search size={32} color="var(--accent)" />
          <h3>No matching projects</h3>
          <p>Adjust the search or filters to show more projects.</p>
          <button className="btn btn-glass" onClick={clearFilters}>
            Clear Filters
          </button>
        </div>
      )}

      <div className="dashboard-grid">
        {filteredProjects.map((project) => {
          const counts = taskCounts[project.id] ?? { done: 0, total: 0 };
          return (
            <ProjectCard
              key={project.id}
              name={project.name}
              status={project.status}
              tasksDone={counts.done}
              tasksTotal={counts.total}
              onOpen={() => onOpenProject(project.id)}
              onDelete={() => handleDeleteProject(project.id, project.name)}
              isOwner={user?.id === project.owner_id}
              isPublic={project.is_public}
            />
          );
        })}
      </div>
    </>
  );
};

const ProjectCard: React.FC<{ name: string; status: string; tasksDone: number; tasksTotal: number;  onOpen: () => void;
  onDelete: () => void;
  isOwner: boolean;
  isPublic: boolean;
}> = ({
  name,
  status,
  tasksDone,
  tasksTotal,
  onOpen,
  onDelete,
  isOwner,
  isPublic
}) => {
  const progress = tasksTotal > 0 ? (tasksDone / tasksTotal) * 100 : 0;

  return (
    <motion.div whileHover={{ y: -5 }} className="glass-panel project-card">
      <div className="project-card-header">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <h3>{name}</h3>
          {!isOwner && isPublic && (
            <span style={{ fontSize: '0.65rem', color: 'var(--info)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Public Community Project
            </span>
          )}
        </div>
        <div className="project-card-actions">
          <StatusBadge status={status} />
          {isOwner && (
            <button 
              className="btn btn-icon" 
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              style={{ color: 'var(--danger)', opacity: 0.6 }}
              title="Delete Project"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Description removed as requested for a cleaner layout */}

      <div className="project-card-progress">
        <div className="project-card-progress-label">
          <span>Tasks Progress</span>
          <span>{tasksDone}/{tasksTotal}</span>
        </div>
        <div className="project-card-progress-track">
          <div className="project-card-progress-fill" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <button className="btn btn-primary project-card-open" onClick={onOpen}>
        <Play size={16} fill="white" />
        Open Project
      </button>
    </motion.div>
  );
};


export default Dashboard;
