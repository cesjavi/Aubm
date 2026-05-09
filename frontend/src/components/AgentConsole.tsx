import React, { useEffect, useState, useRef } from 'react';
import { Terminal } from 'lucide-react';
import { supabase } from '../services/supabase';
import { getApiUrl } from '../services/runtimeConfig';

interface LogEntry {
  id: string;
  created_at: string;
  action: string;
  content: string;
  task_id: string | null;
}

interface AgentConsoleProps {
  projectId?: string | null;
  taskId?: string | null;
}

const AgentConsole: React.FC<AgentConsoleProps> = ({ projectId, taskId }) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const appendLog = (newLog: LogEntry) => {
      setLogs(prev => {
        if (prev.some(l => l.id === newLog.id)) return prev;
        return [...prev, newLog].slice(-50);
      });
    };

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

    const apiUrl = getApiUrl();
    let eventSource: EventSource | null = null;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let pollInterval: number | null = null;
    let active = true;

    const connectBackendStream = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
        if (!active || !accessToken) {
          setError('Authenticated log stream unavailable. Please refresh manually for latest logs.');
          fetchLogs();
          return;
        }
      const params = new URLSearchParams();
      params.set('access_token', accessToken);
      if (taskId) {
        params.set('task_id', taskId);
      } else if (projectId) {
        params.set('project_id', projectId);
      }
      const query = params.toString();
      eventSource = new EventSource(`${apiUrl}/tasks/logs/stream${query ? `?${query}` : ''}`);
      eventSource.addEventListener('ready', () => setError(null));
      eventSource.addEventListener('log', (event) => {
        try {
          appendLog(JSON.parse((event as MessageEvent).data) as LogEntry);
          setError(null);
        } catch (parseError) {
          console.error('Error parsing log stream event:', parseError);
        }
      });
      eventSource.addEventListener('error', () => {
        setError('Backend log stream disconnected. Polling disabled to save resources.');
        // fetchLogs(); // Manual fetch only or auto-reconnect logic without tight loops
      });
    };

    if (apiUrl) {
      connectBackendStream();
    } else {
      fetchLogs();
      pollInterval = window.setInterval(() => {
        if (document.visibilityState === 'visible') fetchLogs();
      }, 15000);

      channel = supabase
        .channel('agent_logs_changes')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'agent_logs' }, (payload) => {
          appendLog(payload.new as LogEntry);
        })
        .subscribe();
    }

    return () => {
      active = false;
      if (eventSource) eventSource.close();
      if (pollInterval) window.clearInterval(pollInterval);
      if (channel) supabase.removeChannel(channel);
    };
  }, [projectId, taskId]);

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
