import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, FolderTree, Layers3, PencilLine, RefreshCw, RotateCcw, UserRound, Workflow } from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '../services/supabase';
import { useAuth } from '../context/useAuth';

interface SpatialDashboardProps {
  selectedProjectId: string | null;
  onSelectProject: (projectId: string) => void;
  onOpenTask: (projectId: string, taskId: string) => void;
}

interface ProjectSummary {
  id: string;
  name: string;
  status: string;
}

interface AgentSummary {
  id: string;
  name: string;
  role?: string | null;
  model: string;
}

interface TaskNode {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority?: number;
  project_id: string;
  assigned_agent_id?: string | null;
}

interface TaskDependency {
  task_id: string;
  depends_on_task_id: string;
}

interface EdgeLine {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  key: string;
}

const statusLabels: Record<string, string> = {
  todo: 'Queued',
  in_progress: 'Running',
  awaiting_approval: 'Review',
  done: 'Done',
  failed: 'Failed',
  cancelled: 'Cancelled'
};

const stageOrder = ['todo', 'in_progress', 'awaiting_approval', 'done', 'failed'];

const SpatialDashboard: React.FC<SpatialDashboardProps> = ({ selectedProjectId, onSelectProject, onOpenTask }) => {
  const { user } = useAuth();
  const planeRef = useRef<HTMLDivElement | null>(null);
  const nodeRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [tasks, setTasks] = useState<TaskNode[]>([]);
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [dependencies, setDependencies] = useState<TaskDependency[]>([]);
  const [dependencyTableAvailable, setDependencyTableAvailable] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [compact, setCompact] = useState(false);
  const [edgeLines, setEdgeLines] = useState<EdgeLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  useEffect(() => {
    const loadProjects = async () => {
      if (!user) return;
      setError(null);

      const { data, error: projectError } = await supabase
        .from('projects')
        .select('id,name,status')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false });

      if (projectError) {
        setError(projectError.message);
        return;
      }

      const nextProjects = data ?? [];
      setProjects(nextProjects);
      if (!selectedProjectId && nextProjects[0]) {
        onSelectProject(nextProjects[0].id);
      }
    };

    loadProjects();
  }, [onSelectProject, reloadNonce, selectedProjectId, user]);

  useEffect(() => {
    const loadProjectGraph = async () => {
      if (!selectedProjectId) {
        setTasks([]);
        setDependencies([]);
        return;
      }

      setLoading(true);
      setError(null);

      const [
        { data: taskData, error: taskError },
        { data: agentData, error: agentError },
        dependencyResponse
      ] = await Promise.all([
        supabase
          .from('tasks')
          .select('id,title,description,status,priority,project_id,assigned_agent_id')
          .eq('project_id', selectedProjectId)
          .order('priority', { ascending: false })
          .order('created_at', { ascending: true }),
        supabase.from('agents').select('id,name,role,model').order('created_at', { ascending: false }),
        supabase.from('task_dependencies').select('task_id,depends_on_task_id').eq('project_id', selectedProjectId)
      ]);

      if (taskError) setError(taskError.message);
      if (agentError) setError(agentError.message);

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

      const nextTasks = taskData ?? [];
      setTasks(nextTasks);
      setAgents(agentData ?? []);
      setSelectedId((current) => current && nextTasks.some((task) => task.id === current) ? current : nextTasks[0]?.id ?? null);
      setLoading(false);
    };

    loadProjectGraph();
  }, [reloadNonce, selectedProjectId]);

  const visibleTasks = tasks;
  const selectedTask = visibleTasks.find((task) => task.id === selectedId) ?? visibleTasks[0] ?? null;
  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? null;

  const agentMap = useMemo(
    () => new Map(agents.map((agent) => [agent.id, agent])),
    [agents]
  );

  const dependencyMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const dependency of dependencies) {
      const current = map.get(dependency.task_id) ?? [];
      current.push(dependency.depends_on_task_id);
      map.set(dependency.task_id, current);
    }
    return map;
  }, [dependencies]);

  const dependentMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const dependency of dependencies) {
      const current = map.get(dependency.depends_on_task_id) ?? [];
      current.push(dependency.task_id);
      map.set(dependency.depends_on_task_id, current);
    }
    return map;
  }, [dependencies]);

  const metrics = useMemo(() => {
    return visibleTasks.reduce(
      (acc, task) => {
        acc.total += 1;
        acc[task.status] = (acc[task.status] ?? 0) + 1;
        if (task.assigned_agent_id) acc.assigned += 1;
        return acc;
      },
      { total: 0, assigned: 0 } as Record<string, number>
    );
  }, [visibleTasks]);

  const tasksByStage = stageOrder.map((status) => ({
    status,
    tasks: visibleTasks.filter((task) => task.status === status)
  }));

  useEffect(() => {
    const updateEdges = () => {
      if (!planeRef.current || dependencies.length === 0) {
        setEdgeLines([]);
        return;
      }

      const planeBounds = planeRef.current.getBoundingClientRect();
      const nextLines = dependencies.flatMap((dependency) => {
        const sourceNode = nodeRefs.current[dependency.depends_on_task_id];
        const targetNode = nodeRefs.current[dependency.task_id];
        if (!sourceNode || !targetNode) return [];

        const sourceBounds = sourceNode.getBoundingClientRect();
        const targetBounds = targetNode.getBoundingClientRect();

        return [{
          key: `${dependency.depends_on_task_id}-${dependency.task_id}`,
          fromX: sourceBounds.left + sourceBounds.width / 2 - planeBounds.left,
          fromY: sourceBounds.top + sourceBounds.height / 2 - planeBounds.top,
          toX: targetBounds.left + targetBounds.width / 2 - planeBounds.left,
          toY: targetBounds.top + targetBounds.height / 2 - planeBounds.top
        }];
      });

      setEdgeLines(nextLines);
    };

    updateEdges();
    window.addEventListener('resize', updateEdges);
    return () => window.removeEventListener('resize', updateEdges);
  }, [compact, dependencies, tasksByStage]);

  const selectedDependencies = selectedTask ? dependencyMap.get(selectedTask.id) ?? [] : [];
  const selectedDependents = selectedTask ? dependentMap.get(selectedTask.id) ?? [] : [];
  const selectedAgent = selectedTask?.assigned_agent_id ? agentMap.get(selectedTask.assigned_agent_id) : null;

  return (
    <div className="spatial-page animate-fade-in">
      <div className="spatial-toolbar">
        <div className="panel-heading" style={{ marginBottom: 0 }}>
          <Box size={32} color="var(--accent)" />
          <div style={{ display: 'grid', gap: 'var(--space-sm)' }}>
            <div>
              <h2>Spatial Project View</h2>
              <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>Inspect one project as a task graph with agents and blockers.</p>
            </div>
            <label style={{ display: 'grid', gap: '6px', maxWidth: '360px' }}>
              <span style={{ color: 'var(--text-dim)', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 800 }}>Project</span>
              <select
                value={selectedProjectId ?? ''}
                onChange={(event) => onSelectProject(event.target.value)}
                className="spatial-project-select"
              >
                <option value="">Select a project</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name} ({project.status})
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="spatial-actions">
          <button className="btn btn-glass" onClick={() => setCompact(!compact)}>
            <Layers3 size={18} />
            {compact ? 'Expand' : 'Compact'}
          </button>
          <button className="btn btn-glass" onClick={() => setSelectedId(null)}>
            <RotateCcw size={18} />
            Reset
          </button>
          <button className="btn btn-glass" onClick={() => setReloadNonce((current) => current + 1)} disabled={!selectedProjectId || loading}>
            <RefreshCw size={18} />
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && <div className="inline-status">{error}</div>}
      {!dependencyTableAvailable && (
        <div className="inline-status">
          Task links are disabled until `database/task_dependencies.sql` is applied in Supabase.
        </div>
      )}

      <div className="spatial-grid">
        <section className="glass-panel spatial-stage-panel">
          <div className="spatial-stage-header">
            <div>
              <span style={{ color: 'var(--text-dim)', fontSize: '0.8rem', textTransform: 'uppercase', fontWeight: 700 }}>Project Graph</span>
              <h3>{selectedProject?.name ?? 'No project selected'}</h3>
            </div>
            <div style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>
              {visibleTasks.length} tasks
            </div>
          </div>

          <div className={`spatial-stage ${compact ? 'is-compact' : ''}`}>
            <div className="spatial-plane" ref={planeRef}>
              {edgeLines.length > 0 && (
                <svg className="spatial-edge-layer" viewBox={`0 0 ${planeRef.current?.clientWidth ?? 900} ${planeRef.current?.clientHeight ?? 430}`} preserveAspectRatio="none">
                  {edgeLines.map((line) => (
                    <g key={line.key}>
                      <line x1={line.fromX} y1={line.fromY} x2={line.toX} y2={line.toY} className="spatial-edge-line" />
                      <circle cx={line.toX} cy={line.toY} r="3" className="spatial-edge-dot" />
                    </g>
                  ))}
                </svg>
              )}

              {tasksByStage.map(({ status, tasks: stageTasks }, stageIndex) => (
                <div key={status} className="spatial-lane">
                  <div className="spatial-lane-header">
                    <i className={`status-dot status-${status}`} />
                    <span>{statusLabels[status]}</span>
                    <strong>{stageTasks.length}</strong>
                  </div>

                  <div className="spatial-lane-stack">
                    {stageTasks.length === 0 && <div className="spatial-empty">No tasks</div>}
                    {stageTasks.map((task, taskIndex) => {
                      const assignedAgent = task.assigned_agent_id ? agentMap.get(task.assigned_agent_id) : null;
                      const dependencyCount = dependencyMap.get(task.id)?.length ?? 0;
                      return (
                        <motion.button
                          key={task.id}
                          ref={(element) => {
                            nodeRefs.current[task.id] = element;
                          }}
                          type="button"
                          className={`spatial-node status-${task.status} ${selectedTask?.id === task.id ? 'is-selected' : ''}`}
                          onClick={() => setSelectedId(task.id)}
                          initial={{ opacity: 0, y: 12 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: (stageIndex + taskIndex) * 0.035 }}
                        >
                          <span>{statusLabels[task.status] ?? task.status}</span>
                          <strong>{task.title}</strong>
                          <small>{assignedAgent ? assignedAgent.name : 'Unassigned'}</small>
                          {dependencyCount > 0 && <em>{dependencyCount} blockers</em>}
                        </motion.button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <aside className="glass-panel spatial-inspector">
          <div className="spatial-metrics">
            <Metric label="Total" value={metrics.total ?? 0} />
            <Metric label="Assigned" value={metrics.assigned ?? 0} />
            <Metric label="Review" value={metrics.awaiting_approval ?? 0} />
            <Metric label="Failed" value={metrics.failed ?? 0} />
          </div>

          <div className="spatial-selected">
            <Workflow size={24} color="var(--accent)" />
            <div>
              <span>Selected Task</span>
              <h3>{selectedTask?.title ?? 'No task selected'}</h3>
              <p>{selectedTask ? statusLabels[selectedTask.status] ?? selectedTask.status : 'Unknown'}</p>
            </div>
          </div>

          {selectedTask && (
            <div className="default-agent-panel" style={{ padding: 'var(--space-md)' }}>
              <div className="spatial-inspector-row">
                <FolderTree size={16} />
                <span>{selectedProject?.name ?? 'Project not loaded'}</span>
              </div>
              <div className="spatial-inspector-row">
                <UserRound size={16} />
                <span>{selectedAgent ? `${selectedAgent.name} (${selectedAgent.model})` : 'Unassigned'}</span>
              </div>
              <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>
                {selectedTask.description || 'No task description provided.'}
              </p>

              <div style={{ display: 'grid', gap: 'var(--space-sm)' }}>
                <div>
                  <strong style={{ fontSize: '0.85rem' }}>Depends on</strong>
                  {selectedDependencies.length === 0 ? (
                    <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>No upstream blockers.</p>
                  ) : (
                    selectedDependencies.map((dependencyTaskId) => (
                      <p key={dependencyTaskId} style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>
                        {visibleTasks.find((task) => task.id === dependencyTaskId)?.title ?? 'Unknown task'}
                      </p>
                    ))
                  )}
                </div>

                <div>
                  <strong style={{ fontSize: '0.85rem' }}>Unblocks</strong>
                  {selectedDependents.length === 0 ? (
                    <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>No downstream tasks.</p>
                  ) : (
                    selectedDependents.map((dependentTaskId) => (
                      <p key={dependentTaskId} style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>
                        {visibleTasks.find((task) => task.id === dependentTaskId)?.title ?? 'Unknown task'}
                      </p>
                    ))
                  )}
                </div>
              </div>

              {selectedProjectId && (
                <button className="btn btn-primary" type="button" onClick={() => onOpenTask(selectedProjectId, selectedTask.id)}>
                  <PencilLine size={16} />
                  Open Task Editor
                </button>
              )}
            </div>
          )}

          <div className="spatial-legend">
            {stageOrder.map((status) => (
              <div key={status}>
                <i className={`status-dot status-${status}`} />
                <span>{statusLabels[status]}</span>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
};

const Metric: React.FC<{ label: string; value: number }> = ({ label, value }) => (
  <div>
    <strong>{value}</strong>
    <span>{label}</span>
  </div>
);

export default SpatialDashboard;
