import React, { useCallback, useEffect, useState } from 'react';
import { 
  ShieldCheck, 
  Search, 
  Filter, 
  Download, 
  Calendar,
  User,
  Bot,
  FileText,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  ExternalLink
} from 'lucide-react';
import { supabase } from '../services/supabase';

interface AuditLog {
  id: string;
  created_at: string;
  user_id: string | null;
  action: string;
  agent_id: string | null;
  task_id: string | null;
  metadata: Record<string, unknown> | null;
  actor_email?: string | null;
  agent_name?: string | null;
  task_title?: string | null;
  profiles?: {
    full_name: string | null;
    email: string | null;
  };
  agents?: {
    name: string | null;
  };
  tasks?: {
    title: string | null;
  };
}

const getErrorMessage = (error: unknown) => error instanceof Error ? error.message : 'Unknown error';

const AuditView: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const pageSize = 50;

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error: fetchError } = await supabase
        .from('audit_logs_with_details')
        .select('*')
        .order('created_at', { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (fetchError) throw fetchError;
      setLogs(data || []);
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [page, pageSize]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const exportCSV = () => {
    const headers = ['Timestamp', 'Action', 'User', 'Agent', 'Task', 'Metadata'];
    const rows = logs.map(log => [
      log.created_at,
      log.action,
      log.actor_email || 'System',
      log.agent_name || 'N/A',
      log.task_title || 'N/A',
      JSON.stringify(log.metadata)
    ]);
    
    const csvContent = [headers, ...rows].map(e => e.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `aubm_audit_logs_${new Date().toISOString()}.csv`);
    link.click();
  };

  const filteredLogs = logs.filter(log => 
    log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (log.actor_email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (log.agent_name || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatTimestamp = (ts: string) => {
    return new Date(ts).toLocaleString();
  };

  const getActionBadgeColor = (action: string) => {
    if (action.includes('error') || action.includes('failed')) return 'var(--danger)';
    if (action.includes('created') || action.includes('added')) return 'var(--success)';
    if (action.includes('approved')) return 'var(--accent)';
    return 'var(--text-dim)';
  };

  return (
    <div className="audit-view">
      <header className="view-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
          <ShieldCheck size={32} color="var(--accent)" />
          <div>
            <h2 style={{ margin: 0 }}>Audit Explorer</h2>
            <p style={{ color: 'var(--text-dim)', margin: 0 }}>Track system actions and governance events</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
          <button className="btn btn-glass" onClick={() => fetchLogs()} disabled={loading}>
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button className="btn btn-glass" onClick={exportCSV}>
            <Download size={18} />
            Export CSV
          </button>
        </div>
      </header>

      <div className="glass-panel" style={{ marginTop: 'var(--space-lg)', padding: 'var(--space-md)' }}>
        <div style={{ display: 'flex', gap: 'var(--space-md)', marginBottom: 'var(--space-md)' }}>
          <div className="search-bar" style={{ flex: 1, position: 'relative' }}>
            <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
            <input 
              type="text" 
              className="glass-input" 
              placeholder="Search actions, users, or agents..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ width: '100%', paddingLeft: '40px' }}
            />
          </div>
          <button className="btn btn-glass">
            <Filter size={18} />
            Filters
          </button>
        </div>

        <div className="audit-table-container" style={{ overflowX: 'auto' }}>
          <table className="audit-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', textAlign: 'left' }}>
                <th style={{ padding: 'var(--space-md)', color: 'var(--text-dim)', fontSize: '0.85rem' }}>Timestamp</th>
                <th style={{ padding: 'var(--space-md)', color: 'var(--text-dim)', fontSize: '0.85rem' }}>Action</th>
                <th style={{ padding: 'var(--space-md)', color: 'var(--text-dim)', fontSize: '0.85rem' }}>Actor</th>
                <th style={{ padding: 'var(--space-md)', color: 'var(--text-dim)', fontSize: '0.85rem' }}>Context</th>
                <th style={{ padding: 'var(--space-md)', color: 'var(--text-dim)', fontSize: '0.85rem' }}></th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map(log => (
                <React.Fragment key={log.id}>
                  <tr 
                    style={{ 
                      borderBottom: '1px solid rgba(255,255,255,0.05)',
                      cursor: 'pointer',
                      background: expandedLog === log.id ? 'rgba(255,255,255,0.05)' : 'transparent'
                    }}
                    onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                  >
                    <td style={{ padding: 'var(--space-md)', whiteSpace: 'nowrap', fontSize: '0.9rem' }}>
                      <Calendar size={14} style={{ marginRight: '8px', opacity: 0.5 }} />
                      {formatTimestamp(log.created_at)}
                    </td>
                    <td style={{ padding: 'var(--space-md)' }}>
                      <span style={{ 
                        padding: '2px 8px', 
                        borderRadius: '12px', 
                        fontSize: '0.75rem', 
                        fontWeight: 600,
                        background: 'rgba(255,255,255,0.1)',
                        color: getActionBadgeColor(log.action),
                        textTransform: 'uppercase'
                      }}>
                        {log.action.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td style={{ padding: 'var(--space-md)', fontSize: '0.9rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <User size={14} style={{ opacity: 0.5 }} />
                        {log.actor_email || <span style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>System</span>}
                      </div>
                    </td>
                    <td style={{ padding: 'var(--space-md)', fontSize: '0.9rem' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {log.agent_id && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--accent)', fontSize: '0.8rem' }}>
                            <Bot size={12} />
                            {log.agent_name}
                          </div>
                        )}
                        {log.task_id && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-dim)', fontSize: '0.8rem' }}>
                            <FileText size={12} />
                            {log.task_title}
                          </div>
                        )}
                        {!log.agent_id && !log.task_id && <span style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>-</span>}
                      </div>
                    </td>
                    <td style={{ padding: 'var(--space-md)', textAlign: 'right' }}>
                      {expandedLog === log.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </td>
                  </tr>
                  {expandedLog === log.id && (
                    <tr>
                      <td colSpan={5} style={{ padding: 'var(--space-md)', background: 'rgba(0,0,0,0.3)' }}>
                        <div style={{ display: 'flex', gap: 'var(--space-lg)' }}>
                          <div style={{ flex: 1 }}>
                            <h5 style={{ margin: '0 0 8px 0', color: 'var(--text-dim)' }}>Metadata</h5>
                            <pre style={{ 
                              background: 'rgba(0,0,0,0.2)', 
                              padding: 'var(--space-md)', 
                              borderRadius: '8px',
                              fontSize: '0.8rem',
                              maxHeight: '200px',
                              overflowY: 'auto'
                            }}>
                              {JSON.stringify(log.metadata, null, 2)}
                            </pre>
                          </div>
                          <div style={{ width: '200px' }}>
                            <h5 style={{ margin: '0 0 8px 0', color: 'var(--text-dim)' }}>Quick Links</h5>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              {log.task_id && (
                                <button className="btn btn-glass btn-sm" style={{ width: '100%', justifyContent: 'flex-start' }}>
                                  <ExternalLink size={14} />
                                  View Task
                                </button>
                              )}
                              {typeof log.metadata?.project_id === 'string' && (
                                <button className="btn btn-glass btn-sm" style={{ width: '100%', justifyContent: 'flex-start' }}>
                                  <ExternalLink size={14} />
                                  View Project
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>

        <div className="pagination" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'var(--space-lg)', padding: '0 var(--space-md)' }}>
          <div style={{ fontSize: '0.9rem', color: 'var(--text-dim)' }}>
            Showing {filteredLogs.length} logs on this page
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
            <button 
              className="btn btn-glass btn-sm" 
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0 || loading}
            >
              Previous
            </button>
            <span style={{ display: 'flex', alignItems: 'center', padding: '0 var(--space-md)', fontWeight: 600 }}>{page + 1}</span>
            <button 
              className="btn btn-glass btn-sm" 
              onClick={() => setPage(p => p + 1)}
              disabled={logs.length < pageSize || loading}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuditView;
