import React, { useEffect, useMemo, useState } from 'react';
import { Box, Layers3, RotateCcw, Workflow } from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '../services/supabase';

interface TaskNode {
  id: string;
  title: string;
  status: string;
  priority?: number;
  project_id?: string;
}

const demoTasks: TaskNode[] = [
  { id: 'demo-1', title: 'Research Brief', status: 'done', priority: 2 },
  { id: 'demo-2', title: 'Architecture Pass', status: 'in_progress', priority: 4 },
  { id: 'demo-3', title: 'Security Review', status: 'awaiting_approval', priority: 3 },
  { id: 'demo-4', title: 'Deploy Plan', status: 'todo', priority: 1 },
  { id: 'demo-5', title: 'Regression Sweep', status: 'failed', priority: 5 }
];

const statusLabels: Record<string, string> = {
  todo: 'Queued',
  in_progress: 'Running',
  awaiting_approval: 'Review',
  done: 'Done',
  failed: 'Failed',
  cancelled: 'Cancelled'
};

const SpatialDashboard: React.FC = () => {
  const [tasks, setTasks] = useState<TaskNode[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const fetchTasks = async () => {
      const { data } = await supabase
        .from('tasks')
        .select('id,title,status,priority,project_id')
        .order('priority', { ascending: false })
        .limit(12);

      setTasks(data?.length ? data : demoTasks);
    };

    fetchTasks();
  }, []);

  const visibleTasks = tasks.length ? tasks : demoTasks;
  const selectedTask = visibleTasks.find((task) => task.id === selectedId) ?? visibleTasks[0];

  const metrics = useMemo(() => {
    return visibleTasks.reduce(
      (acc, task) => {
        acc.total += 1;
        acc[task.status] = (acc[task.status] ?? 0) + 1;
        return acc;
      },
      { total: 0 } as Record<string, number>
    );
  }, [visibleTasks]);

  const stageOrder = ['todo', 'in_progress', 'awaiting_approval', 'done', 'failed'];
  const tasksByStage = stageOrder.map((status) => ({
    status,
    tasks: visibleTasks.filter((task) => task.status === status)
  }));

  return (
    <div className="spatial-page animate-fade-in">
      <div className="spatial-toolbar">
        <div className="panel-heading" style={{ marginBottom: 0 }}>
          <Box size={32} color="var(--accent)" />
          <div>
            <h2>Spatial Project View</h2>
            <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>Inspect task flow as a layered execution map.</p>
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
        </div>
      </div>

      <div className="spatial-grid">
        <section className="glass-panel spatial-stage-panel">
          <div className="spatial-stage-header">
            <div>
              <span style={{ color: 'var(--text-dim)', fontSize: '0.8rem', textTransform: 'uppercase', fontWeight: 700 }}>DAG Field</span>
              <h3>{visibleTasks.length} active nodes</h3>
            </div>
          </div>

          <div className={`spatial-stage ${compact ? 'is-compact' : ''}`}>
            <div className="spatial-plane">
              {tasksByStage.map(({ status, tasks: stageTasks }, stageIndex) => (
                <div key={status} className="spatial-lane">
                  <div className="spatial-lane-header">
                    <i className={`status-dot status-${status}`} />
                    <span>{statusLabels[status]}</span>
                    <strong>{stageTasks.length}</strong>
                  </div>

                  <div className="spatial-lane-stack">
                    {stageTasks.length === 0 && <div className="spatial-empty">No tasks</div>}
                    {stageTasks.map((task, taskIndex) => (
                      <motion.button
                        key={task.id}
                        type="button"
                        className={`spatial-node status-${task.status} ${selectedTask?.id === task.id ? 'is-selected' : ''}`}
                        onClick={() => setSelectedId(task.id)}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: (stageIndex + taskIndex) * 0.035 }}
                      >
                        <span>{statusLabels[task.status] ?? task.status}</span>
                        <strong>{task.title}</strong>
                      </motion.button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <aside className="glass-panel spatial-inspector">
          <div className="spatial-metrics">
            <Metric label="Total" value={metrics.total ?? 0} />
            <Metric label="Running" value={metrics.in_progress ?? 0} />
            <Metric label="Review" value={metrics.awaiting_approval ?? 0} />
            <Metric label="Failed" value={metrics.failed ?? 0} />
          </div>

          <div className="spatial-selected">
            <Workflow size={24} color="var(--accent)" />
            <div>
              <span>Selected Node</span>
              <h3>{selectedTask?.title ?? 'No task selected'}</h3>
              <p>{statusLabels[selectedTask?.status ?? ''] ?? selectedTask?.status ?? 'Unknown'}</p>
            </div>
          </div>

          <div className="spatial-legend">
            {['todo', 'in_progress', 'awaiting_approval', 'done', 'failed'].map((status) => (
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
