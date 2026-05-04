import React, { useEffect, useState } from 'react';
import { Activity, AlertTriangle, Database, RefreshCw, Server, ShieldCheck } from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '../services/supabase';

interface MonitoringSummary {
  status: string;
  checks: Record<string, string>;
  counts: Record<string, number>;
  timestamp: string;
  error?: string;
}

const emptySummary: MonitoringSummary = {
  status: 'loading',
  checks: { api: 'checking', database: 'checking' },
  counts: {
    projects: 0,
    tasks: 0,
    agents: 0,
    task_runs: 0,
    failed_tasks: 0,
    pending_reviews: 0
  },
  timestamp: new Date().toISOString()
};

const MonitoringView: React.FC = () => {
  const [summary, setSummary] = useState<MonitoringSummary>(emptySummary);
  const [loading, setLoading] = useState(false);

  const fetchFallbackSummary = async (): Promise<MonitoringSummary> => {
    const [projects, tasks, agents, runs, failed, reviews] = await Promise.all([
      supabase.from('projects').select('id', { count: 'exact', head: true }),
      supabase.from('tasks').select('id', { count: 'exact', head: true }),
      supabase.from('agents').select('id', { count: 'exact', head: true }),
      supabase.from('task_runs').select('id', { count: 'exact', head: true }),
      supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
      supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('status', 'awaiting_approval')
    ]);

    return {
      status: 'ok',
      checks: { api: 'unreachable', database: 'ok' },
      counts: {
        projects: projects.count ?? 0,
        tasks: tasks.count ?? 0,
        agents: agents.count ?? 0,
        task_runs: runs.count ?? 0,
        failed_tasks: failed.count ?? 0,
        pending_reviews: reviews.count ?? 0
      },
      timestamp: new Date().toISOString(),
      error: 'Backend monitoring endpoint unavailable; using Supabase fallback.'
    };
  };

  const refresh = async () => {
    setLoading(true);
    const apiUrl = import.meta.env.VITE_API_URL;

    try {
      if (!apiUrl) throw new Error('VITE_API_URL is not configured');
      const response = await fetch(`${apiUrl}/monitoring/summary`);
      if (!response.ok) throw new Error(`Backend returned ${response.status}`);
      setSummary(await response.json());
    } catch {
      setSummary(await fetchFallbackSummary());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const degraded = summary.status !== 'ok' || Object.values(summary.checks).some((check) => check === 'error');

  return (
    <div className="monitoring-page animate-fade-in">
      <div className="monitoring-header">
        <div className="panel-heading" style={{ marginBottom: 0 }}>
          <Activity size={32} color="var(--accent)" />
          <div>
            <h2>Operations Monitor</h2>
            <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>Track platform health and workflow volume.</p>
          </div>
        </div>
        <button className="btn btn-glass" onClick={refresh} disabled={loading}>
          <RefreshCw size={18} />
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <div className={`glass-panel monitoring-status ${degraded ? 'is-degraded' : 'is-ok'}`}>
        {degraded ? <AlertTriangle size={24} /> : <ShieldCheck size={24} />}
        <div>
          <span>System Status</span>
          <strong>{degraded ? 'Degraded' : 'Operational'}</strong>
          {summary.error && <p>{summary.error}</p>}
        </div>
      </div>

      <div className="monitoring-grid">
        <MetricCard icon={<Server size={20} />} label="Projects" value={summary.counts.projects} />
        <MetricCard icon={<Activity size={20} />} label="Tasks" value={summary.counts.tasks} />
        <MetricCard icon={<Database size={20} />} label="Agents" value={summary.counts.agents} />
        <MetricCard icon={<RefreshCw size={20} />} label="Runs" value={summary.counts.task_runs} />
        <MetricCard icon={<AlertTriangle size={20} />} label="Failed" value={summary.counts.failed_tasks} danger />
        <MetricCard icon={<ShieldCheck size={20} />} label="Reviews" value={summary.counts.pending_reviews} />
      </div>

      <div className="glass-panel monitoring-checks">
        <h3>Checks</h3>
        {Object.entries(summary.checks).map(([name, value]) => (
          <div key={name}>
            <span>{name}</span>
            <strong className={`check-${value}`}>{value}</strong>
          </div>
        ))}
        <small>Updated {new Date(summary.timestamp).toLocaleString()}</small>
      </div>
    </div>
  );
};

const MetricCard: React.FC<{ icon: React.ReactNode; label: string; value: number; danger?: boolean }> = ({ icon, label, value, danger }) => (
  <motion.div className={`glass-panel monitoring-card ${danger ? 'is-danger' : ''}`} whileHover={{ y: -3 }}>
    {icon}
    <div>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  </motion.div>
);

export default MonitoringView;
