import React, { useEffect, useState } from 'react';
import { ArrowLeft, Bot, CheckCircle2, ListTodo, PlayCircle, PlusCircle, RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '../services/supabase';
import { useAuth } from '../context/AuthContext';
import { getDefaultModel, getDefaultProvider } from '../services/llmConfig';

interface Project {
  id: string;
  name: string;
  description: string | null;
  context: string | null;
  status: string;
}

interface Agent {
  id: string;
  name: string;
  model: string;
}

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: number;
  assigned_agent_id: string | null;
}

interface ProjectDetailProps {
  projectId: string;
  onBack: () => void;
}

const ProjectDetail: React.FC<ProjectDetailProps> = ({ projectId, onBack }) => {
  const { user } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [agentId, setAgentId] = useState('');
  const [saving, setSaving] = useState(false);
  const [orchestrating, setOrchestrating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const defaultProvider = getDefaultProvider();
  const defaultModel = getDefaultModel(defaultProvider);

  const defaultAgents = [
    {
      name: 'Planner',
      role: 'Project Planner',
      api_provider: defaultProvider,
      model: defaultModel,
      system_prompt: 'You decompose goals into clear, ordered implementation tasks.'
    },
    {
      name: 'Builder',
      role: 'Implementation Agent',
      api_provider: defaultProvider,
      model: defaultModel,
      system_prompt: 'You implement practical, production-oriented solutions with concise output.'
    },
    {
      name: 'Reviewer',
      role: 'Quality Reviewer',
      api_provider: defaultProvider,
      model: defaultModel,
      system_prompt: 'You review outputs for correctness, security, completeness, and missing tests.'
    }
  ];

  const loadProject = async () => {
    setError(null);
    setMessage(null);

    const [{ data: projectData, error: projectError }, { data: taskData, error: taskError }, { data: agentData }] = await Promise.all([
      supabase.from('projects').select('id,name,description,context,status').eq('id', projectId).single(),
      supabase.from('tasks').select('id,title,description,status,priority,assigned_agent_id').eq('project_id', projectId).order('created_at', { ascending: false }),
      supabase.from('agents').select('id,name,model').order('created_at', { ascending: false })
    ]);

    if (projectError) setError(projectError.message);
    if (taskError) setError(taskError.message);

    setProject(projectData ?? null);
    setTasks(taskData ?? []);
    setAgents(agentData ?? []);
  };

  useEffect(() => {
    loadProject();
  }, [projectId]);

  const createTask = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);

    const { error: insertError } = await supabase.from('tasks').insert({
      project_id: projectId,
      title,
      description,
      assigned_agent_id: agentId || null,
      status: 'todo',
      priority: 0
    });

    if (insertError) {
      setError(insertError.message);
    } else {
      setTitle('');
      setDescription('');
      setAgentId('');
      await loadProject();
      setMessage('Task added.');
    }

    setSaving(false);
  };

  const createDefaultAgents = async () => {
    if (!user) {
      setError('You must be signed in to create default agents.');
      return;
    }

    setError(null);
    setMessage(null);

    const existingNames = new Set(agents.map((agent) => agent.name));
    const missingAgents = defaultAgents
      .filter((agent) => !existingNames.has(agent.name))
      .map((agent) => ({ ...agent, user_id: user.id }));

    if (missingAgents.length === 0) {
      setMessage('Default agents already exist.');
      return;
    }

    const { error: insertError } = await supabase.from('agents').insert(missingAgents);
    if (insertError) {
      setError(insertError.message);
      return;
    }

    setMessage(`Created ${missingAgents.length} default agents.`);
    await loadProject();
  };

  const runOrchestrator = async () => {
    setError(null);
    setMessage(null);
    setOrchestrating(true);

    try {
      const apiUrl = import.meta.env.VITE_API_URL;
      if (!apiUrl) throw new Error('VITE_API_URL is not configured.');

      const response = await fetch(`${apiUrl}/orchestrator/projects/${projectId}/run`, {
        method: 'POST'
      });

      if (!response.ok) {
        throw new Error(
          `Backend returned ${response.status} for POST /orchestrator/projects/${projectId}/run. Stop the stale process on port 8000 and restart backend from D:\\sistemas\\Aubm\\backend.`
        );
      }
      setMessage('Project orchestrator started.');
      window.setTimeout(loadProject, 1200);
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : 'Failed to start orchestrator.');
    } finally {
      setOrchestrating(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="project-detail-page">
      <div className="dashboard-heading page-heading">
        <div>
          <button className="btn btn-glass" onClick={onBack} style={{ marginBottom: 'var(--space-md)' }}>
            <ArrowLeft size={18} />
            Back
          </button>
          <h2>{project?.name ?? 'Project'}</h2>
          <p style={{ color: 'var(--text-dim)' }}>{project?.description || 'No description provided.'}</p>
        </div>
        <div className="button-row">
          <button className="btn btn-primary" onClick={runOrchestrator} disabled={orchestrating}>
            <PlayCircle size={18} />
            {orchestrating ? 'Starting...' : 'Run Orchestrator'}
          </button>
          <button className="btn btn-glass" onClick={loadProject}>
            <RefreshCw size={18} />
            Refresh
          </button>
        </div>
      </div>

      {error && <div className="inline-status">{error}</div>}
      {message && <div className="inline-status"><CheckCircle2 size={16} color="var(--success)" />{message}</div>}

      <div className="project-detail-grid">
        <section className="glass-panel project-form">
          <div className="default-agent-panel">
            <div>
              <div className="settings-section-title">
                <Bot size={22} color="var(--accent)" />
                <h3>Default Agents</h3>
              </div>
              <p style={{ color: 'var(--text-dim)', marginTop: 'var(--space-xs)' }}>
                Create Planner, Builder, and Reviewer agents for this workspace.
              </p>
            </div>
            <button className="btn btn-glass" onClick={createDefaultAgents}>
              <PlusCircle size={18} />
              Generate Defaults
            </button>
          </div>

          <div className="settings-section-title">
            <PlusCircle size={22} color="var(--accent)" />
            <h3>Add Task</h3>
          </div>
          <form onSubmit={createTask} style={{ display: 'grid', gap: 'var(--space-md)' }}>
            <label>
              <span>Task Title</span>
              <input value={title} onChange={(event) => setTitle(event.target.value)} required placeholder="Draft implementation plan" />
            </label>
            <label>
              <span>Description</span>
              <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={4} placeholder="Instructions for the assigned agent..." />
            </label>
            <label>
              <span>Assigned Agent</span>
              <select value={agentId} onChange={(event) => setAgentId(event.target.value)}>
                <option value="">Unassigned</option>
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>{agent.name} ({agent.model})</option>
                ))}
              </select>
            </label>
            <button className="btn btn-primary" type="submit" disabled={saving}>
              <CheckCircle2 size={18} />
              {saving ? 'Adding...' : 'Add Task'}
            </button>
          </form>
        </section>

        <section className="glass-panel task-list-panel">
          <div className="settings-section-title">
            <ListTodo size={22} color="var(--accent)" />
            <h3>Tasks</h3>
          </div>
          {tasks.length === 0 && <p style={{ color: 'var(--text-dim)' }}>No tasks yet.</p>}
          <div className="task-list">
            {tasks.map((task) => (
              <div key={task.id} className="task-row">
                <div>
                  <strong>{task.title}</strong>
                  <p>{task.description || 'No description provided.'}</p>
                </div>
                <span>{task.status.replace('_', ' ')}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </motion.div>
  );
};

export default ProjectDetail;
