import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { MessageSquare, Play, CheckCircle2, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { fetchBackend } from '../services/api';

type JsonRecord = Record<string, unknown>;

interface DebateAgent {
  id: string;
  name: string;
  model: string;
}

interface DebateTask {
  id: string;
  title: string;
  status: string;
}

interface DebateHistory {
  initial?: unknown;
  critique?: unknown;
  final?: unknown;
}

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const renderContent = (content: unknown): React.ReactNode => {
  if (!content) return null;
  if (typeof content === 'string') return content;
  
  if (Array.isArray(content) && content.length > 0 && isRecord(content[0])) {
    const keys = Object.keys(content[0]);
    const isTableCandidate = content.every(item => 
      isRecord(item) &&
      Object.keys(item).length === keys.length && 
      keys.every(k => Object.keys(item).includes(k))
    );

    if (isTableCandidate && keys.length <= 6) {
      const rows = content as JsonRecord[];
      return (
        <div style={{ overflowX: 'auto', marginBottom: '16px', borderRadius: 'var(--radius-md)', border: '1px solid rgba(255,255,255,0.05)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
            <thead>
              <tr style={{ background: 'rgba(110, 89, 255, 0.1)', borderBottom: '2px solid rgba(110, 89, 255, 0.2)' }}>
                {keys.map(k => (
                  <th key={k} style={{ textAlign: 'left', padding: '12px 8px', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700 }}>
                    {k.replace(/_/g, ' ')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((item, i) => (
                <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                  {keys.map(k => (
                    <td key={k} style={{ padding: '10px 8px', color: 'rgba(255,255,255,0.9)' }}>
                      {isRecord(item[k]) || Array.isArray(item[k]) ? JSON.stringify(item[k]) : String(item[k])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
  }

  if (Array.isArray(content)) {
    return (
      <ul style={{ paddingLeft: '20px', margin: 0 }}>
        {content.map((item, i) => (
          <li key={i} style={{ marginBottom: '8px' }}>
            {isRecord(item) || Array.isArray(item) ? renderContent(item) : String(item)}
          </li>
        ))}
      </ul>
    );
  }

  if (isRecord(content)) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {Object.entries(content).map(([key, value]) => (
          <div key={key}>
            <div style={{ 
              fontWeight: 700, 
              color: 'var(--accent)', 
              fontSize: '0.7rem', 
              textTransform: 'uppercase', 
              letterSpacing: '1px',
              marginBottom: '6px',
              opacity: 0.8
            }}>
              {key.replace(/_/g, ' ').replace(/-/g, ' ')}
            </div>
            <div style={{ 
              paddingLeft: '12px', 
              borderLeft: '2px solid rgba(110, 89, 255, 0.3)', 
              color: 'rgba(255,255,255,0.9)',
              lineHeight: '1.5'
            }}>
              {isRecord(value) || Array.isArray(value) ? renderContent(value) : String(value)}
            </div>
          </div>
        ))}
      </div>
    );
  }
  return String(content);
};

const DebateView: React.FC = () => {
  const [agents, setAgents] = useState<DebateAgent[]>([]);
  const [tasks, setTasks] = useState<DebateTask[]>([]);
  const [selectedTask, setSelectedTask] = useState('');
  const [agentA, setAgentA] = useState('');
  const [agentB, setAgentB] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [debateResult, setDebateResult] = useState<DebateHistory | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      const { data: agentsData } = await supabase.from('agents').select('id,name,model');
      const { data: tasksData } = await supabase.from('tasks')
        .select('id,title,status')
        .in('status', ['todo', 'awaiting_approval']);
      if (agentsData) setAgents(agentsData);
      if (tasksData) setTasks(tasksData);
    };
    fetchData();
  }, []);

  useEffect(() => {
    let interval: number;
    if (loading && selectedTask) {
      interval = window.setInterval(async () => {
        const { data } = await supabase.from('tasks').select('status, output_data').eq('id', selectedTask).single();
        if (data && data.status !== 'in_progress') {
          setLoading(false);
          setStatus(data.status === 'awaiting_approval' ? 'Debate completed successfully!' : `Debate finished with status: ${data.status}`);
          
          if (data.status === 'awaiting_approval' && data.output_data?.debate_history) {
            setDebateResult(data.output_data.debate_history);
          }
          
          window.clearInterval(interval);
        }
      }, 3000);
    }
    return () => window.clearInterval(interval);
  }, [loading, selectedTask]);

  const handleStartDebate = async () => {
    if (!selectedTask || !agentA || !agentB) {
      alert('Please select a task and two different agents.');
      return;
    }
    if (agentA === agentB) {
      alert('Agents must be different for a debate.');
      return;
    }

    setDebateResult(null);
    setLoading(true);
    setStatus('Initializing debate flow...');
    
    try {
      await fetchBackend('/orchestrator/debate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task_id: selectedTask,
          agent_a_id: agentA,
          agent_b_id: agentB
        })
      });

      setStatus('Debate started! Monitor the agent console for progress.');
      // We keep loading=true, the useEffect will poll until completion
    } catch (exc) {
      setStatus(exc instanceof Error ? exc.message : 'Error connecting to backend.');
      setLoading(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-panel"
      style={{ 
        width: '100%', 
        maxWidth: debateResult ? '1000px' : '600px', 
        margin: '0 auto',
        padding: 'var(--space-xl)',
        transition: 'max-width 0.5s ease-in-out'
      }}
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
            {tasks.map(t => <option key={t.id} value={t.id}>{t.title} ({t.status.replace('_', ' ')})</option>)}
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
          {loading ? 'Processing Debate...' : 'Execute Debate Flow'}
        </button>

        {debateResult && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            style={{ marginTop: 'var(--space-xl)', borderTop: '1px solid var(--glass-border)', paddingTop: 'var(--space-lg)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: 'var(--space-md)' }}>
              <CheckCircle2 size={20} color="var(--success)" />
              <h3 style={{ fontSize: '1.1rem', margin: 0 }}>Debate Results: Before & After</h3>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-lg)' }}>
              <div className="glass-panel" style={{ padding: 'var(--space-md)', background: 'rgba(255,255,255,0.02)' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: '12px', letterSpacing: '1px' }}>Initial Proposal</div>
                <div style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.8)', maxHeight: '500px', overflowY: 'auto' }}>
                  {renderContent(debateResult.initial)}
                </div>
              </div>

              <div className="glass-panel" style={{ padding: 'var(--space-md)', background: 'rgba(110, 89, 255, 0.05)', border: '1px solid rgba(110, 89, 255, 0.2)' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--accent)', textTransform: 'uppercase', marginBottom: '12px', letterSpacing: '1px' }}>Refined Final Result</div>
                <div style={{ fontSize: '0.9rem', color: 'white', maxHeight: '500px', overflowY: 'auto' }}>
                  {renderContent(debateResult.final)}
                </div>
              </div>
            </div>

            {debateResult.critique !== undefined && debateResult.critique !== null && (
              <div style={{ marginTop: 'var(--space-md)', padding: 'var(--space-md)', background: 'rgba(255, 107, 107, 0.05)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(255, 107, 107, 0.1)' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--danger)', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '1px' }}>Critique Context</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)', fontStyle: 'italic' }}>
                  {renderContent(debateResult.critique)}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </div>
    </motion.div>
  );
};

export default DebateView;
