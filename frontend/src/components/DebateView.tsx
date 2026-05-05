import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { MessageSquare, Play, CheckCircle2, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { getApiUrl } from '../services/runtimeConfig';

interface DebateAgent {
  id: string;
  name: string;
  model: string;
}

interface DebateTask {
  id: string;
  title: string;
}

const DebateView: React.FC = () => {
  const [agents, setAgents] = useState<DebateAgent[]>([]);
  const [tasks, setTasks] = useState<DebateTask[]>([]);
  const [selectedTask, setSelectedTask] = useState('');
  const [agentA, setAgentA] = useState('');
  const [agentB, setAgentB] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      const { data: agentsData } = await supabase.from('agents').select('id,name,model');
      const { data: tasksData } = await supabase.from('tasks').select('id,title').eq('status', 'todo');
      if (agentsData) setAgents(agentsData);
      if (tasksData) setTasks(tasksData);
    };
    fetchData();
  }, []);

  const handleStartDebate = async () => {
    if (!selectedTask || !agentA || !agentB) {
      alert('Please select a task and two different agents.');
      return;
    }
    if (agentA === agentB) {
      alert('Agents must be different for a debate.');
      return;
    }

    setLoading(true);
    setStatus('Initializing debate flow...');
    
    try {
      const response = await fetch(`${getApiUrl()}/orchestrator/debate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task_id: selectedTask,
          agent_a_id: agentA,
          agent_b_id: agentB
        })
      });

      if (response.ok) {
        setStatus('Debate started! Monitor the agent console for progress.');
      } else {
        setStatus('Failed to start debate.');
      }
    } catch {
      setStatus('Error connecting to backend.');
    }
    setLoading(false);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-panel form-panel"
    >
      <div className="panel-heading">
        <MessageSquare size={32} color="var(--accent)" />
        <div>
          <h2 style={{ fontSize: '1.5rem' }}>Multi-Agent Debate</h2>
          <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>Two agents collaborate to refine a task's output.</p>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
        <div>
          <label style={{ display: 'block', marginBottom: 'var(--space-xs)', fontWeight: 600 }}>Select Task</label>
          <select 
            value={selectedTask} 
            onChange={(e) => setSelectedTask(e.target.value)}
            style={{ width: '100%', padding: '0.8rem', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-md)', color: 'white' }}
          >
            <option value="">-- Choose a pending task --</option>
            {tasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
        </div>

        <div className="responsive-two-col">
          <div>
            <label style={{ display: 'block', marginBottom: 'var(--space-xs)', fontWeight: 600 }}>Agent A (Generator)</label>
            <select 
              value={agentA} 
              onChange={(e) => setAgentA(e.target.value)}
              style={{ width: '100%', padding: '0.8rem', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-md)', color: 'white' }}
            >
              <option value="">-- Select Agent --</option>
              {agents.map(a => <option key={a.id} value={a.id}>{a.name} ({a.model})</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 'var(--space-xs)', fontWeight: 600 }}>Agent B (Critique)</label>
            <select 
              value={agentB} 
              onChange={(e) => setAgentB(e.target.value)}
              style={{ width: '100%', padding: '0.8rem', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-md)', color: 'white' }}
            >
              <option value="">-- Select Agent --</option>
              {agents.map(a => <option key={a.id} value={a.id}>{a.name} ({a.model})</option>)}
            </select>
          </div>
        </div>

        {status && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', padding: 'var(--space-sm)', background: 'rgba(255,255,255,0.05)', borderRadius: 'var(--radius-sm)', fontSize: '0.9rem' }}>
            {status.includes('Error') || status.includes('Failed') ? <AlertCircle size={16} color="var(--danger)" /> : <CheckCircle2 size={16} color="var(--success)" />}
            <span>{status}</span>
          </div>
        )}

        <button 
          className="btn btn-primary" 
          onClick={handleStartDebate} 
          disabled={loading}
          style={{ width: '100%', padding: '1rem', marginTop: 'var(--space-md)' }}
        >
          <Play size={18} fill="white" />
          {loading ? 'Processing...' : 'Execute Debate Flow'}
        </button>
      </div>
    </motion.div>
  );
};

export default DebateView;
