import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Bot, CheckCircle2, Download, FileText, ListTodo, PlayCircle, PlusCircle, RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '../services/supabase';
import { useAuth } from '../context/useAuth';
import { getDefaultModel, getDefaultProvider } from '../services/llmConfig';
import { getApiUrl } from '../services/runtimeConfig';

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
  output_data: unknown | null;
}

interface ChartDatum {
  label: string;
  value: number;
}

interface ReportCharts {
  status: ChartDatum[];
  priorities: ChartDatum[];
  categories: ChartDatum[];
  scores: ChartDatum[];
}

interface ProjectDetailProps {
  projectId: string;
  onBack: () => void;
}

const getBackendErrorDetail = async (response: Response) => {
  let detail = `Backend returned ${response.status}`;
  try {
    const body = await response.json();
    detail = body.detail || body.message || detail;
  } catch {
    // Keep the HTTP status fallback.
  }
  return detail;
};

const ensureBackendOk = async (response: Response, fallback?: string) => {
  if (!response.ok) {
    const detail = fallback ?? (await getBackendErrorDetail(response));
    throw new Error(detail);
  }
};

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
  const [taskActionError, setTaskActionError] = useState<string | null>(null);
  const [taskActionPending, setTaskActionPending] = useState(false);
  const [finalReport, setFinalReport] = useState<string | null>(null);
  const [finalReportVariant, setFinalReportVariant] = useState<'full' | 'brief' | 'pessimistic'>('full');
  const [reportCharts, setReportCharts] = useState<ReportCharts | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
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
    },
    {
      name: 'Brief Writer',
      role: 'Executive Briefing Agent',
      api_provider: defaultProvider,
      model: defaultModel,
      system_prompt: 'You turn approved project work into concise executive briefs. Write plain English, no JSON, no code blocks.'
    },
    {
      name: 'Pessimistic Analyst',
      role: 'Risk and Downside Analysis Agent',
      api_provider: defaultProvider,
      model: defaultModel,
      system_prompt: 'You produce skeptical downside-focused analysis. Identify weak assumptions, failure modes, risks, and mitigation priorities. Write plain English, no JSON.'
    }
  ];

  const loadProject = useCallback(async () => {
    setError(null);
    setMessage(null);

    const [{ data: projectData, error: projectError }, { data: taskData, error: taskError }, { data: agentData }] = await Promise.all([
      supabase.from('projects').select('id,name,description,context,status').eq('id', projectId).single(),
      supabase.from('tasks').select('id,title,description,status,priority,assigned_agent_id,output_data').eq('project_id', projectId).order('created_at', { ascending: false }),
      supabase.from('agents').select('id,name,model').order('created_at', { ascending: false })
    ]);

    if (projectError) setError(projectError.message);
    if (taskError) setError(taskError.message);

    setProject(projectData ?? null);
    setTasks(taskData ?? []);
    setAgents(agentData ?? []);
  }, [projectId]);

  useEffect(() => {
    loadProject();
  }, [loadProject]);

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
      const apiUrl = getApiUrl();

      const response = await fetch(`${apiUrl}/orchestrator/projects/${projectId}/run`, {
        method: 'POST'
      });

      await ensureBackendOk(
        response,
        `Backend returned ${response.status} for POST /orchestrator/projects/${projectId}/run. Stop the stale process on port 8000 and restart backend from D:\\sistemas\\Aubm\\backend.`
      );
      setMessage('Project orchestrator started.');
      window.setTimeout(loadProject, 1200);
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : 'Failed to start orchestrator.');
    } finally {
      setOrchestrating(false);
    }
  };

  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const allTasksApproved = tasks.length > 0 && tasks.every((task) => task.status === 'done');

  const humanizeKey = (key: string) => key.replace(/[_-]/g, ' ').trim().replace(/\b\w/g, (char) => char.toUpperCase());

  const formatHumanReadable = (value: unknown): string[] => {
    if (value === null || value === undefined) return ['Not specified.'];

    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return [String(value)];
    }

    if (Array.isArray(value)) {
      if (value.length === 0) return ['No items.'];
      return value.flatMap((item) => {
        if (item && typeof item === 'object') {
          const lines = formatHumanReadable(item);
          return lines.length ? [`- ${lines[0]}`, ...lines.slice(1).map((line) => `  ${line}`)] : [];
        }
        return [`- ${String(item)}`];
      });
    }

    if (typeof value === 'object') {
      return Object.entries(value as Record<string, unknown>).flatMap(([key, item]) => {
        const label = humanizeKey(key);
        if (item && typeof item === 'object') {
          return [`${label}:`, ...formatHumanReadable(item).map((line) => `  ${line}`)];
        }
        return [`${label}: ${item ?? 'Not specified.'}`];
      });
    }

    return [String(value)];
  };

  const formatTaskOutput = (output: unknown) => {
    if (!output) return 'No output was saved for this task.';

    if (typeof output === 'string') return output;

    if (typeof output === 'object') {
      const outputRecord = output as Record<string, unknown>;
      const primaryOutput = outputRecord.data ?? outputRecord.raw_output ?? outputRecord.final ?? output;
      return typeof primaryOutput === 'string' ? primaryOutput : formatHumanReadable(primaryOutput).join('\n');
    }

    return String(output);
  };

  const updateTaskReviewStatus = async (taskId: string, action: 'approve' | 'reject') => {
    const apiUrl = getApiUrl();

    const response = await fetch(`${apiUrl}/tasks/${taskId}/${action}`, {
      method: 'POST'
    });

    await ensureBackendOk(response);
  };

  const approveTask = async (taskId: string) => {
    setTaskActionPending(true);
    setTaskActionError(null);
    setError(null);
    setMessage(null);

    try {
      await updateTaskReviewStatus(taskId, 'approve');
      setSelectedTask(null);
      await loadProject();
      setMessage('Task approved!');
    } catch (exc) {
      setTaskActionError(`Could not approve task: ${exc instanceof Error ? exc.message : 'Unknown error'}`);
    } finally {
      setTaskActionPending(false);
    }
  };

  const rejectTask = async (taskId: string) => {
    setTaskActionPending(true);
    setTaskActionError(null);
    setError(null);
    setMessage(null);

    try {
      await updateTaskReviewStatus(taskId, 'reject');
      setSelectedTask(null);
      await loadProject();
      setMessage('Task rejected. Agent will try again.');
    } catch (exc) {
      setTaskActionError(`Could not reject task: ${exc instanceof Error ? exc.message : 'Unknown error'}`);
    } finally {
      setTaskActionPending(false);
    }
  };

  const openFinalReport = async (variant: 'full' | 'brief' | 'pessimistic' = 'full') => {
    setReportLoading(true);
    setError(null);
    setMessage(null);

    try {
      const apiUrl = getApiUrl();

      const response = await fetch(`${apiUrl}/orchestrator/projects/${projectId}/final-report?variant=${variant}`);
      await ensureBackendOk(response);

      const body = await response.json();
      setFinalReport(body.report);
      setReportCharts(body.charts ?? null);
      setFinalReportVariant(variant);
      await loadProject();
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : 'Failed to build final report.');
    } finally {
      setReportLoading(false);
    }
  };

  const renderBarChart = (title: string, data: ChartDatum[]) => {
    const maxValue = Math.max(...data.map((item) => item.value), 1);
    return (
      <div className="report-chart">
        <h4>{title}</h4>
        {data.map((item) => (
          <div key={item.label} className="report-chart-row">
            <span>{item.label}</span>
            <div className="report-chart-track">
              <div className="report-chart-fill" style={{ width: `${(item.value / maxValue) * 100}%` }} />
            </div>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>
    );
  };

  const renderScoreChart = (data: ChartDatum[]) => (
    <div className="report-chart report-score-chart">
      <h4>Scores</h4>
      <div className="report-score-grid">
        {data.map((item) => (
          <div key={item.label} className="report-score">
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <div className="report-chart-track">
              <div className="report-chart-fill" style={{ width: `${Math.min(item.value, 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const downloadFinalReportPdf = async () => {
    setPdfLoading(true);
    setError(null);

    try {
      const apiUrl = getApiUrl();

      const response = await fetch(`${apiUrl}/orchestrator/projects/${projectId}/final-report.pdf?variant=${finalReportVariant}`);
      await ensureBackendOk(response);

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${project?.name ?? 'project'}-${finalReportVariant}.pdf`.replace(/[^a-z0-9_.-]+/gi, '_');
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : 'Failed to export PDF.');
    } finally {
      setPdfLoading(false);
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
          {allTasksApproved && (
            <button className="btn btn-primary" onClick={() => openFinalReport('full')} disabled={reportLoading}>
              <FileText size={18} />
              {reportLoading ? 'Building...' : 'Final Report'}
            </button>
          )}
          {allTasksApproved && (
            <button className="btn btn-glass" onClick={() => openFinalReport('brief')} disabled={reportLoading}>
              <FileText size={18} />
              Short Brief
            </button>
          )}
          {allTasksApproved && (
            <button className="btn btn-glass" onClick={() => openFinalReport('pessimistic')} disabled={reportLoading}>
              <FileText size={18} />
              Pessimistic Analysis
            </button>
          )}
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
                <div style={{ flex: 1 }}>
                  <strong>{task.title}</strong>
                  <p>{task.description || 'No description provided.'}</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                  <span className={`status-badge status-${task.status}`}>
                    {task.status.replace('_', ' ')}
                  </span>
                  {task.status === 'awaiting_approval' && (
                    <button
                      className="btn btn-glass btn-sm"
                      onClick={() => {
                        setTaskActionError(null);
                        setSelectedTask(task);
                      }}
                    >
                      Review Output
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {selectedTask && (
        <div className="modal-overlay" onClick={() => setSelectedTask(null)}>
          <div className="glass-panel modal-content task-review-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Review: {selectedTask.title}</h3>
            <div className="task-output-preview">
              <pre>{formatTaskOutput(selectedTask.output_data)}</pre>
            </div>
            {taskActionError && <div className="inline-status modal-error">{taskActionError}</div>}
            <div className="button-row modal-actions">
              <button className="btn btn-primary" onClick={() => approveTask(selectedTask.id)} disabled={taskActionPending}>
                {taskActionPending ? 'Saving...' : 'Approve Task'}
              </button>
              <button className="btn btn-glass" onClick={() => rejectTask(selectedTask.id)} disabled={taskActionPending}>
                Reject & Re-run
              </button>
              <button className="btn btn-glass" onClick={() => setSelectedTask(null)} disabled={taskActionPending}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {finalReport && (
        <div className="modal-overlay" onClick={() => setFinalReport(null)}>
          <div className="glass-panel modal-content task-review-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Final Report</h3>
            {reportCharts && (
              <div className="report-charts">
                {renderScoreChart(reportCharts.scores)}
                {renderBarChart('Task Categories', reportCharts.categories)}
                {renderBarChart('Priorities', reportCharts.priorities)}
              </div>
            )}
            <div className="task-output-preview final-report-preview">
              <pre>{finalReport}</pre>
            </div>
            <div className="button-row modal-actions">
              <button className="btn btn-primary" onClick={downloadFinalReportPdf} disabled={pdfLoading}>
                <Download size={18} />
                {pdfLoading ? 'Exporting...' : 'Export PDF'}
              </button>
              <button className="btn btn-glass" onClick={() => setFinalReport(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
};

export default ProjectDetail;
