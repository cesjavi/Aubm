import React, { useEffect, useState, useRef } from 'react';
import { Terminal } from 'lucide-react';
import { supabase } from '../services/supabase';

interface LogEntry {
  id: string;
  created_at: string;
  action: string;
  content: string;
  task_id: string | null;
}

const AgentConsole: React.FC = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchLogs = async () => {
      const { data, error: supabaseError } = await supabase
        .from('agent_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (supabaseError) {
        console.error('Error fetching logs:', supabaseError);
        setError(supabaseError.message);
        return;
      }

      setError(null);
      if (data) {
        setLogs(data.reverse());
      }
    };

    fetchLogs();
    
    // Fallback polling every 3 seconds
    const pollInterval = setInterval(fetchLogs, 3000);
    
    // Set up real-time subscription
    const channel = supabase
      .channel('agent_logs_changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'agent_logs' }, (payload) => {
        setLogs(prev => {
          const newLog = payload.new as LogEntry;
          if (prev.some(l => l.id === newLog.id)) return prev;
          return [...prev, newLog].slice(-50);
        });
      })
      .subscribe();

    return () => {
      clearInterval(pollInterval);
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const formatTimestamp = (ts: string) => {
    const date = new Date(ts);
    return date.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <section className="glass-panel app-console">
      <div style={{ padding: 'var(--space-sm) var(--space-md)', borderBottom: '1px solid var(--glass-border)', display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
        <Terminal size={16} color="var(--accent)" />
        <span style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Agent Console</span>
      </div>
      <div 
        ref={scrollRef}
        style={{ 
          padding: 'var(--space-md)', 
          height: '150px', 
          overflowY: 'auto', 
          fontFamily: 'monospace', 
          fontSize: '0.85rem', 
          color: 'var(--accent)',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px'
        }}
      >
        {error && (
          <div style={{ color: 'var(--danger)', padding: 'var(--space-sm)', border: '1px solid var(--danger)', borderRadius: 'var(--radius-sm)', marginBottom: '8px' }}>
            [ERROR] {error}. This might be due to Supabase RLS policies.
          </div>
        )}
        {logs.length === 0 && !error && <div style={{ color: 'var(--text-dim)' }}>[System] Waiting for logs...</div>}
        {logs.map((log) => (
          <div key={log.id}>
            <span style={{ color: 'var(--text-dim)', marginRight: '8px' }}>[{formatTimestamp(log.created_at)}]</span>
            <span style={{ color: 'var(--info)', marginRight: '8px' }}>[{log.action.toUpperCase()}]</span>
            <span>{log.content}</span>
          </div>
        ))}
      </div>
    </section>
  );
};

export default AgentConsole;
