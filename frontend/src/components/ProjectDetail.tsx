import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Bot, CheckCircle2, Download, FilePenLine, FileText, ListTodo, Map as MapIcon, PlayCircle, PlusCircle, RefreshCw, Trash2, X } from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '../services/supabase';
import { useAuth } from '../context/useAuth';
import { getDefaultModel, getDefaultProvider } from '../services/llmConfig';
import { getApiUrl } from '../services/runtimeConfig';
import type { UiMode } from '../services/uiMode';

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
  role?: string | null;
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

interface TaskDependency {
  task_id: string;
  depends_on_task_id: string;
}

interface ProjectDetailProps {
  projectId: string;
  uiMode: UiMode;
  initialTaskId?: string | null;
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

const hasTaskErrorOutput = (task: Task) =>
  Boolean(task.output_data && typeof task.output_data === 'object' && 'error' in task.output_data);

const ProjectDetail: React.FC<ProjectDetailProps> = ({ projectId, uiMode, initialTaskId = null, onBack }) => {
  const { user } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [dependencies, setDependencies] = useState<TaskDependency[]>([]);
  const [dependencyTableAvailable, setDependencyTableAvailable] = useState(true);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [agentId, setAgentId] = useState('');
  const [dependencyIds, setDependencyIds] = useState<string[]>([]);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [showAdvancedTaskControls, setShowAdvancedTaskControls] = useState(uiMode === 'expert');
  const [saving, setSaving] = useState(false);
  const [orchestrating, setOrchestrating] = useState(false);
  const [approvingAll, setApprovingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [taskActionError, setTaskActionError] = useState<string | null>(null);
  const [taskActionPending, setTaskActionPending] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [finalReport, setFinalReport] = useState<string | null>(null);
  const [finalReportVariant, setFinalReportVariant] = useState<'full' | 'brief' | 'pessimistic'>('full');
  const [showRoadmap, setShowRoadmap] = useState(false);
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

  const dependencyMap = useCallback(
    (taskId: string) => dependencies.filter((dependency) => dependency.task_id === taskId).map((dependency) => dependency.depends_on_task_id),
    [dependencies]
  );

  const dependentMap = useCallback(
    (taskId: string) => dependencies.filter((dependency) => dependency.depends_on_task_id === taskId).map((dependency) => dependency.task_id),
    [dependencies]
  );

  const loadProject = useCallback(async () => {
    setError(null);
    setMessage(null);

    const [
      { data: projectData, error: projectError },
      { data: taskData, error: taskError },
      { data: agentData },
      dependencyResponse
    ] = await Promise.all([
      supabase.from('projects').select('id,name,description,context,status').eq('id', projectId).single(),
      supabase.from('tasks').select('id,title,description,status,priority,assigned_agent_id,output_data').eq('project_id', projectId).order('created_at', { ascending: false }),
      supabase.from('agents').select('id,name,role,model').order('created_at', { ascending: false }),
      supabase.from('task_dependencies').select('task_id,depends_on_task_id').eq('project_id', projectId)
    ]);

    if (projectError) setError(projectError.message);
    if (taskError) setError(taskError.message);
    if (dependencyResponse.error) {
      setDependencyTableAvailable(false);
      setDependencies([]);
      if (dependencyResponse.error.code !== '42P01') {
        setError(dependencyResponse.error.message);
      }
    } else {
      setDependencyTableAvailable(true);
      setDependencies(dependencyResponse.data ?? []);
    }

    setProject(projectData ?? null);
    setTasks(taskData ?? []);
    setAgents(agentData ?? []);
  }, [projectId]);

  useEffect(() => {
    loadProject();
  }, [loadProject]);

  const resetTaskForm = () => {
    setEditingTaskId(null);
    setTitle('');
    setDescription('');
    setAgentId('');
    setDependencyIds([]);
  };

  const startEditingTask = useCallback((task: Task) => {
    if (project?.status === 'completed') {
      setError('Completed projects are locked. Tasks cannot be edited.');
      return;
    }
    setEditingTaskId(task.id);
    setTitle(task.title);
    setDescription(task.description ?? '');
    setAgentId(task.assigned_agent_id ?? '');
    setDependencyIds(dependencyMap(task.id));
    setError(null);
    setMessage(null);
  }, [dependencyMap, project?.status]);

  useEffect(() => {
    if (!initialTaskId || tasks.length === 0) return;
    const task = tasks.find((item) => item.id === initialTaskId);
    if (task) {
      startEditingTask(task);
      if (task.output_data) {
        setSelectedTask(task);
      }
    }
  }, [initialTaskId, startEditingTask, tasks]);

  const saveTaskDependencies = async (taskId: string, selectedDependencyIds: string[]) => {
    if (!dependencyTableAvailable) return null;

    const { error: deleteError } = await supabase
      .from('task_dependencies')
      .delete()
      .eq('project_id', projectId)
      .eq('task_id', taskId);

    if (deleteError) {
      return deleteError;
    }

    const uniqueIds = Array.from(new Set(selectedDependencyIds.filter((id) => id && id !== taskId)));
    if (uniqueIds.length === 0) {
      return null;
    }

    const { error: insertError } = await supabase.from('task_dependencies').insert(
      uniqueIds.map((dependsOnTaskId) => ({
        project_id: projectId,
        task_id: taskId,
        depends_on_task_id: dependsOnTaskId
      }))
    );

    return insertError;
  };

  const createTask = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canModifyProject) {
      setError('Completed projects are locked. Create a new project or reopen this one before adding tasks.');
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);

    const payload = {
      title,
      description,
      assigned_agent_id: agentId || null,
    };

    const response = editingTaskId
      ? await supabase.from('tasks').update(payload).eq('id', editingTaskId).select('id').single()
      : await supabase.from('tasks').insert({
          project_id: projectId,
          ...payload,
          status: 'todo',
          priority: 0
        }).select('id').single();

    if (response.error) {
      setError(response.error.message);
    } else {
      const savedTaskId = editingTaskId ?? response.data?.id;
      if (savedTaskId) {
        const dependencyError = await saveTaskDependencies(savedTaskId, dependencyIds);
        if (dependencyError) {
          setError(dependencyError.message);
          setSaving(false);
          return;
        }
      }

      resetTaskForm();
      await loadProject();
      setMessage(editingTaskId ? 'Task updated.' : 'Task added.');
    }

    setSaving(false);
  };

  const handleDeleteTask = async (task: Task) => {
    if (!canModifyProject) {
      setError('Completed projects are locked. Tasks cannot be deleted.');
      return;
    }
    const confirmed = window.confirm(`Delete task "${task.title}"? This cannot be undone.`);
    if (!confirmed) return;

    setError(null);
    setMessage(null);

    const { error: deleteError } = await supabase.from('tasks').delete().eq('id', task.id);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    if (editingTaskId === task.id) {
      resetTaskForm();
    }
    if (selectedTask?.id === task.id) {
      setSelectedTask(null);
    }

    await loadProject();
    setMessage('Task deleted.');
  };

  const assignTaskAgent = async (taskId: string, assignedAgentId: string) => {
    if (!canModifyProject) {
      setError('Completed projects are locked. Task assignments cannot be changed.');
      return;
    }
    setError(null);
    setMessage(null);

    const { error: updateError } = await supabase
      .from('tasks')
      .update({ assigned_agent_id: assignedAgentId || null })
      .eq('id', taskId);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    if (editingTaskId === taskId) {
      setAgentId(assignedAgentId);
    }

    await loadProject();
    setMessage('Task assignment updated.');
  };

  const createDefaultAgents = async () => {
    if (!canModifyProject) {
      setError('Completed projects are locked. Agents cannot be generated from this project.');
      return;
    }
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
    if (!canModifyProject) {
      setError('Completed projects are locked. The orchestrator cannot add or rerun tasks.');
      return;
    }
    setOrchestrating(true);
    setError(null);
    setMessage(null);

    try {
      const errorOutputTaskIds = tasks
        .filter((task) => hasTaskErrorOutput(task))
        .map((task) => task.id);

      if (errorOutputTaskIds.length > 0) {
        const { error: resetError } = await supabase
          .from('tasks')
          .update({ status: 'todo', output_data: null })
          .in('id', errorOutputTaskIds);

        if (resetError) throw resetError;
      }

      const apiUrl = getApiUrl();
      const response = await fetch(`${apiUrl}/orchestrator/projects/${projectId}/run`, {
        method: 'POST'
      });

      await ensureBackendOk(
        response,
        `Backend returned ${response.status} for POST /orchestrator/projects/${projectId}/run. Stop the stale process on port 8000 and restart backend from D:\\sistemas\\Aubm\\backend.`
      );
      const body = await response.json().catch(() => null);
      setMessage(body?.mode === 'queue' ? 'Project tasks queued for worker execution.' : 'Project orchestrator started for queued and failed tasks.');
      // Refresh after a delay to show the new tasks
      window.setTimeout(loadProject, 2000);
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : 'Failed to start orchestrator.');
    } finally {
      // We keep orchestrating=true for a bit longer to allow the backend to finish decomposition
      window.setTimeout(() => setOrchestrating(false), 2000);
    }
  };

  const retryTask = async (task: Task) => {
    if (!canModifyProject) {
      setTaskActionError('Completed projects are locked. This task cannot be retried.');
      return;
    }
    setTaskActionPending(true);
    setTaskActionError(null);
    setError(null);
    setMessage(null);

    try {
      const { error: resetError } = await supabase
        .from('tasks')
        .update({ status: 'todo', output_data: null })
        .eq('id', task.id);

      if (resetError) throw resetError;

      setSelectedTask(null);
      await loadProject();
      await runOrchestrator();
      setMessage('Task reset and queued for retry.');
    } catch (exc) {
      setTaskActionError(`Could not retry task: ${exc instanceof Error ? exc.message : 'Unknown error'}`);
    } finally {
      setTaskActionPending(false);
    }
  };

  const handleApproveAll = async () => {
    if (!projectId) return;
    if (!canModifyProject) {
      setError('Completed projects are locked. Pending approvals cannot be changed.');
      return;
    }
    setApprovingAll(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`${getApiUrl()}/tasks/project/${projectId}/approve-all`, {
        method: 'POST'
      });
      if (response.ok) {
        setMessage('All pending tasks approved!');
        loadProject();
      } else {
        setError('Failed to approve all tasks.');
      }
    } catch {
      setError('Error connecting to backend.');
    }
    setApprovingAll(false);
  };
  const allTasksApproved = tasks.length > 0 && tasks.every((task) => task.status === 'done');
  const taskLookup = new Map(tasks.map((task) => [task.id, task]));
  const tasksAwaitingApproval = tasks.filter((task) => task.status === 'awaiting_approval').length;
  const completedTasks = tasks.filter((task) => task.status === 'done').length;
  const retryableTasks = tasks.filter((task) => task.status === 'failed' || hasTaskErrorOutput(task)).length;
  const isProjectCompleted = project?.status === 'completed';
  const canModifyProject = !isProjectCompleted;
  const roadmapPhases = useMemo(() => {
    const orderedPhases = [
      'Foundation',
      'Build',
      'Execution',
      'Review',
      'Recovery',
      'Finalize',
      'Completed'
    ];
    const phaseMap = new Map<string, Task[]>();
    const dependencyCounts = dependencies.reduce<Record<string, number>>((acc, dependency) => {
      acc[dependency.task_id] = (acc[dependency.task_id] ?? 0) + 1;
      return acc;
    }, {});
    const blockerCounts = dependencies.reduce<Record<string, number>>((acc, dependency) => {
      acc[dependency.depends_on_task_id] = (acc[dependency.depends_on_task_id] ?? 0) + 1;
      return acc;
    }, {});

    for (const task of tasks) {
      let phase = 'Build';
      if (task.status === 'done') phase = 'Completed';
      else if (task.status === 'awaiting_approval') phase = 'Review';
      else if (task.status === 'queued' || task.status === 'in_progress') phase = 'Execution';
      else if (task.status === 'failed') phase = 'Recovery';
      else if ((dependencyCounts[task.id] ?? 0) === 0) phase = 'Foundation';
      else if ((blockerCounts[task.id] ?? 0) === 0) phase = 'Finalize';

      phaseMap.set(phase, [...(phaseMap.get(phase) ?? []), task]);
    }

    return orderedPhases
      .map((phase) => ({
        phase,
        tasks: (phaseMap.get(phase) ?? []).sort((a, b) => b.priority - a.priority || a.title.localeCompare(b.title))
      }))
      .filter((item) => item.tasks.length > 0);
  }, [dependencies, tasks]);

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
      
      // Handle unified debate structure or standard agent result
      const primaryOutput = outputRecord.data ?? outputRecord.raw_output ?? outputRecord.final ?? output;
      
      if (outputRecord.is_debate && outputRecord.debate_history) {
        // We could also show a "Debate Consensus" prefix here
        return typeof primaryOutput === 'string' ? primaryOutput : formatHumanReadable(primaryOutput).join('\n');
      }

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
    if (!canModifyProject) {
      setTaskActionError('Completed projects are locked. Task approval cannot be changed.');
      return;
    }
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
    if (!canModifyProject) {
      setTaskActionError('Completed projects are locked. Task approval cannot be changed.');
      return;
    }
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
      setFinalReportVariant(variant);
      await loadProject();
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : 'Failed to build final report.');
    } finally {
      setReportLoading(false);
    }
  };

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
          {tasks.length > 0 && (
            <button className="btn btn-glass" onClick={() => setShowRoadmap(true)}>
              <MapIcon size={18} />
              Roadmap
            </button>
          )}
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
          {canModifyProject && tasks.some(t => t.status === 'awaiting_approval') && (
            <button className="btn btn-glass" onClick={handleApproveAll} disabled={approvingAll} style={{ borderColor: 'var(--success)', color: 'var(--success)' }}>
              <CheckCircle2 size={18} />
              {approvingAll ? 'Approving...' : 'Approve All'}
            </button>
          )}
          {canModifyProject && (
            <button className="btn btn-primary" onClick={runOrchestrator} disabled={orchestrating}>
              <PlayCircle size={18} />
              {orchestrating ? 'Starting...' : retryableTasks > 0 ? `Retry Failed (${retryableTasks})` : 'Run Orchestrator'}
            </button>
          )}
          <button className="btn btn-glass" onClick={loadProject}>
            <RefreshCw size={18} />
            Refresh
          </button>
        </div>
      </div>

      {error && <div className="inline-status">{error}</div>}
      {message && <div className="inline-status"><CheckCircle2 size={16} color="var(--success)" />{message}</div>}
      {isProjectCompleted && (
        <div className="inline-status project-locked-notice">
          <CheckCircle2 size={16} color="var(--success)" />
          <span>This project is completed and locked. Reports remain available, but tasks, agents, approvals, retries, and assignments are read-only.</span>
        </div>
      )}

      {uiMode === 'guided' && (
        <section className="glass-panel project-form">
          <div className="settings-section-title">
            <CheckCircle2 size={22} color="var(--accent)" />
            <h3>Guided Workflow</h3>
          </div>
          <div className="task-list">
            <div className="task-row">
              <div>
                <strong>1. Prepare agents</strong>
                <p>{agents.length > 0 ? `${agents.length} agents available.` : 'Create the default agents for this workspace.'}</p>
              </div>
              <button className="btn btn-glass btn-sm" type="button" onClick={createDefaultAgents} disabled={!canModifyProject}>
                Generate Defaults
              </button>
            </div>
            <div className="task-row">
              <div>
                <strong>2. Build the plan</strong>
                <p>{retryableTasks > 0 ? `${retryableTasks} failed tasks can be retried.` : tasks.length > 0 ? `${tasks.length} tasks in the current plan.` : 'Run the orchestrator to generate the task plan from the project context.'}</p>
              </div>
              <button className="btn btn-primary btn-sm" type="button" onClick={runOrchestrator} disabled={orchestrating || !canModifyProject}>
                {orchestrating ? 'Starting...' : retryableTasks > 0 ? 'Retry Failed' : tasks.length > 0 ? 'Run Queued' : 'Generate Plan'}
              </button>
            </div>
            <div className="task-row">
              <div>
                <strong>3. Review outputs</strong>
                <p>{tasksAwaitingApproval > 0 ? `${tasksAwaitingApproval} tasks are waiting for approval.` : 'No tasks are waiting for approval right now.'}</p>
              </div>
              {canModifyProject && tasksAwaitingApproval > 0 && (
                <button className="btn btn-glass btn-sm" type="button" onClick={handleApproveAll} disabled={approvingAll}>
                  {approvingAll ? 'Approving...' : 'Approve Pending'}
                </button>
              )}
            </div>
            <div className="task-row">
              <div>
                <strong>4. Finalize</strong>
                <p>{allTasksApproved ? 'The project is ready for final reporting.' : `${completedTasks}/${tasks.length} tasks approved.`}</p>
              </div>
              <button className="btn btn-glass btn-sm" type="button" disabled={!allTasksApproved || reportLoading} onClick={() => openFinalReport('full')}>
                {reportLoading ? 'Building...' : 'Open Report'}
              </button>
            </div>
          </div>
          <button className="btn btn-glass" type="button" onClick={() => setShowAdvancedTaskControls((current) => !current)}>
            {showAdvancedTaskControls ? 'Hide Advanced Controls' : 'Show Advanced Controls'}
          </button>
        </section>
      )}

      <div className="project-detail-grid">
        <section className="glass-panel project-form">
          {(uiMode === 'expert' || showAdvancedTaskControls) && (
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
            <button className="btn btn-glass" onClick={createDefaultAgents} disabled={!canModifyProject}>
              <PlusCircle size={18} />
              Generate Defaults
            </button>
          </div>
          )}

          <div className="settings-section-title" style={{ justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
              <PlusCircle size={22} color="var(--accent)" />
              <h3>{editingTaskId ? 'Edit Task' : uiMode === 'guided' ? 'Add Manual Task' : 'Add Task'}</h3>
            </div>
            {editingTaskId && canModifyProject && (
              <button className="btn btn-icon" type="button" onClick={resetTaskForm} title="Cancel edit">
                <X size={18} />
              </button>
            )}
          </div>
          {!canModifyProject && (
            <div className="read-only-note">
              This project is complete. Adding more tasks would change the approved scope, so task planning is disabled.
            </div>
          )}
          <form onSubmit={createTask} style={{ display: 'grid', gap: 'var(--space-md)' }}>
            <label>
              <span>Task Title</span>
              <input value={title} onChange={(event) => setTitle(event.target.value)} required placeholder="Draft implementation plan" disabled={!canModifyProject} />
            </label>
            <label>
              <span>Description</span>
              <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={4} placeholder="Instructions for the assigned agent..." disabled={!canModifyProject} />
            </label>
            {(uiMode === 'expert' || showAdvancedTaskControls) && (
            <label>
              <span>Assigned Agent</span>
              <select value={agentId} onChange={(event) => setAgentId(event.target.value)} disabled={!canModifyProject}>
                <option value="">Unassigned</option>
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>{agent.name} ({agent.model})</option>
                ))}
              </select>
            </label>
            )}
            {(uiMode === 'expert' || showAdvancedTaskControls) && (
            <div className="default-agent-panel" style={{ gap: 'var(--space-sm)' }}>
              <div>
                <span style={{ color: 'var(--text-dim)', fontSize: '0.85rem', fontWeight: 700 }}>Dependencies</span>
                <p style={{ color: 'var(--text-dim)', marginTop: 'var(--space-xs)', fontSize: '0.85rem' }}>
                  Select the tasks that must be completed before this task can run.
                </p>
              </div>
              {!dependencyTableAvailable && (
                <div className="inline-status">
                  Apply `database/task_dependencies.sql` in Supabase to enable persistent task links.
                </div>
              )}
              {tasks.filter((task) => task.id !== editingTaskId).length === 0 && (
                <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>Add at least one other task to create dependencies.</p>
              )}
              <div style={{ display: 'grid', gap: 'var(--space-sm)', maxHeight: '220px', overflowY: 'auto' }}>
                {tasks
                  .filter((task) => task.id !== editingTaskId)
                  .map((task) => (
                    <label key={task.id} className="toggle-row" style={{ alignItems: 'flex-start' }}>
                      <input
                        type="checkbox"
                        checked={dependencyIds.includes(task.id)}
                        disabled={!canModifyProject}
                        onChange={(event) => {
                          setDependencyIds((current) =>
                            event.target.checked
                              ? [...current, task.id]
                              : current.filter((id) => id !== task.id)
                          );
                        }}
                      />
                      <span style={{ display: 'grid', gap: '2px' }}>
                        <strong style={{ color: 'var(--text-main)' }}>{task.title}</strong>
                        <small style={{ color: 'var(--text-dim)' }}>{task.status.replace('_', ' ')}</small>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            <button className="btn btn-primary" type="submit" disabled={saving || !canModifyProject}>
              <CheckCircle2 size={18} />
              {saving ? (editingTaskId ? 'Saving...' : 'Adding...') : (editingTaskId ? 'Save Task' : 'Add Task')}
            </button>
          </form>
        </section>

        <section className="glass-panel task-list-panel">
          <div className="settings-section-title">
            <ListTodo size={22} color="var(--accent)" />
            <h3>Tasks</h3>
          </div>
          <div className="filter-bar" style={{ display: 'flex', gap: '8px', marginBottom: '16px', overflowX: 'auto', paddingBottom: '4px' }}>
            {['all', 'todo', 'queued', 'in_progress', 'awaiting_approval', 'done', 'failed'].map((f) => (
              <button 
                key={f}
                className={`btn ${filter === f ? 'btn-primary' : 'btn-glass'}`}
                onClick={() => setFilter(f)}
                style={{ fontSize: '0.75rem', padding: '4px 12px', textTransform: 'capitalize' }}
              >
                {f.replace('_', ' ')}
              </button>
            ))}
          </div>
          {tasks.length === 0 && <p style={{ color: 'var(--text-dim)' }}>No tasks yet.</p>}
          <div className="task-list">
            {tasks
              .filter((t) => filter === 'all' || t.status === filter)
              .map((task) => (
              <div 
                key={task.id} 
                className={`task-row ${task.output_data ? 'clickable' : ''}`}
                onClick={() => {
                  if (task.output_data) {
                    setTaskActionError(null);
                    setSelectedTask(task);
                  }
                }}
              >
                <div style={{ flex: 1 }}>
                  <strong>{task.title}</strong>
                  <p>{task.description || 'No description provided.'}</p>
                  {(uiMode === 'expert' || showAdvancedTaskControls) && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: 'var(--space-sm)' }}>
                    {dependencyMap(task.id).length > 0 && (
                      <span className="task-meta-chip">
                        Depends on {dependencyMap(task.id).length}
                      </span>
                    )}
                    {dependentMap(task.id).length > 0 && (
                      <span className="task-meta-chip">
                        Blocks {dependentMap(task.id).length}
                      </span>
                    )}
                  </div>
                  )}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-sm)', marginTop: 'var(--space-sm)', alignItems: 'center' }}>
                    {(uiMode === 'expert' || showAdvancedTaskControls) && (
                    <select
                      value={task.assigned_agent_id ?? ''}
                      disabled={!canModifyProject}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        e.stopPropagation();
                        assignTaskAgent(task.id, e.target.value);
                      }}
                      style={{ maxWidth: '320px' }}
                    >
                      <option value="">Unassigned</option>
                      {agents.map((agent) => (
                        <option key={agent.id} value={agent.id}>{agent.name} ({agent.model})</option>
                      ))}
                    </select>
                    )}
                    {canModifyProject && (
                      <>
                        <button
                          className="btn btn-glass btn-sm"
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            startEditingTask(task);
                          }}
                        >
                          <FilePenLine size={14} />
                          Edit
                        </button>
                        <button
                          className="btn btn-glass btn-sm"
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteTask(task);
                          }}
                          style={{ color: 'var(--danger)', borderColor: 'rgba(231, 76, 60, 0.25)' }}
                        >
                          <Trash2 size={14} />
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                  {(uiMode === 'expert' || showAdvancedTaskControls) && dependencyMap(task.id).length > 0 && (
                    <div style={{ marginTop: 'var(--space-sm)', display: 'grid', gap: '4px' }}>
                      {dependencyMap(task.id).map((dependencyTaskId) => (
                        <small key={dependencyTaskId} style={{ color: 'var(--text-dim)' }}>
                          Requires: {taskLookup.get(dependencyTaskId)?.title ?? 'Unknown task'}
                        </small>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                  <span className={`status-badge status-${task.status}`}>
                    {task.status.replace('_', ' ')}
                  </span>
                  {task.status === 'awaiting_approval' && (
                    <button
                      className="btn btn-glass btn-sm"
                      onClick={(e) => {
                        e.stopPropagation();
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
              {!canModifyProject ? (
                <div style={{ flex: 1, textAlign: 'left', color: 'var(--text-dim)', fontSize: '0.9rem' }}>
                  This project is completed and locked. Task output can be reviewed, but task status cannot be changed.
                </div>
              ) : hasTaskErrorOutput(selectedTask) ? (
                <>
                  <button className="btn btn-primary" onClick={() => retryTask(selectedTask)} disabled={taskActionPending || orchestrating}>
                    {taskActionPending || orchestrating ? 'Retrying...' : 'Retry Task'}
                  </button>
                  <div style={{ flex: 1, textAlign: 'left', color: 'var(--danger)', fontSize: '0.9rem' }}>
                    This task has a saved execution error and needs to be retried.
                  </div>
                </>
              ) : selectedTask.status === 'awaiting_approval' ? (
                <>
                  <button className="btn btn-primary" onClick={() => approveTask(selectedTask.id)} disabled={taskActionPending}>
                    {taskActionPending ? 'Saving...' : 'Approve Task'}
                  </button>
                  <button className="btn btn-glass" onClick={() => rejectTask(selectedTask.id)} disabled={taskActionPending}>
                    Reject & Re-run
                  </button>
                </>
              ) : (
                <div style={{ flex: 1, textAlign: 'left', color: 'var(--text-dim)', fontSize: '0.9rem' }}>
                  This task is completed and approved.
                </div>
              )}
              <button className="btn btn-glass" onClick={() => setSelectedTask(null)} disabled={taskActionPending}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showRoadmap && (
        <div className="modal-overlay" onClick={() => setShowRoadmap(false)}>
          <div className="glass-panel modal-content task-review-modal roadmap-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title-row">
              <div>
                <h3>Roadmap: {project?.name ?? 'Project'}</h3>
                <p>{completedTasks}/{tasks.length} tasks complete. Phases are inferred from task status, priority, and dependencies.</p>
              </div>
              <button className="btn btn-glass btn-sm" onClick={() => setShowRoadmap(false)}>
                Close
              </button>
            </div>

            <div className="roadmap-timeline">
              {roadmapPhases.map((phase, phaseIndex) => (
                <section key={phase.phase} className="roadmap-phase">
                  <div className="roadmap-phase-marker">
                    <span>{phaseIndex + 1}</span>
                  </div>
                  <div className="roadmap-phase-content">
                    <div className="roadmap-phase-header">
                      <h4>{phase.phase}</h4>
                      <span>{phase.tasks.length} task{phase.tasks.length === 1 ? '' : 's'}</span>
                    </div>
                    <div className="roadmap-task-list">
                      {phase.tasks.map((task) => (
                        <article key={task.id} className="roadmap-task">
                          <div>
                            <strong>{task.title}</strong>
                            <p>{task.description || 'No description provided.'}</p>
                            {(dependencyMap(task.id).length > 0 || dependentMap(task.id).length > 0) && (
                              <small>
                                {dependencyMap(task.id).length > 0 && `Depends on ${dependencyMap(task.id).length}`}
                                {dependencyMap(task.id).length > 0 && dependentMap(task.id).length > 0 && ' · '}
                                {dependentMap(task.id).length > 0 && `Blocks ${dependentMap(task.id).length}`}
                              </small>
                            )}
                          </div>
                          <div className="roadmap-task-meta">
                            <span className={`status-badge status-${task.status}`}>
                              {task.status.replace('_', ' ')}
                            </span>
                            <span>Priority {task.priority}</span>
                          </div>
                        </article>
                      ))}
                    </div>
                  </div>
                </section>
              ))}
            </div>
          </div>
        </div>
      )}

      {finalReport && (
        <div className="modal-overlay" onClick={() => setFinalReport(null)}>
          <div className="glass-panel modal-content task-review-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Final Report</h3>
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
