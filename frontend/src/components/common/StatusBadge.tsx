import React from 'react';

interface StatusBadgeProps {
  status: string;
  style?: React.CSSProperties;
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ status, style }) => {
  const getStatusColor = (s: string) => {
    switch (s?.toLowerCase()) {
      case 'done':
      case 'completed':
      case 'approved':
        return 'var(--success)';
      case 'in_progress':
      case 'running':
        return 'var(--accent)';
      case 'todo':
      case 'queued':
        return 'var(--text-dim)';
      case 'failed':
      case 'error':
        return 'var(--danger)';
      case 'awaiting_approval':
        return 'var(--warning)';
      default:
        return 'var(--text-dim)';
    }
  };

  const formatStatus = (s: string) => {
    return (s || 'Unknown').replace(/_/g, ' ').toUpperCase();
  };

  return (
    <span style={{ 
      padding: '4px 8px', 
      borderRadius: '4px', 
      fontSize: '0.7rem', 
      fontWeight: 600,
      background: 'rgba(255,255,255,0.05)',
      border: `1px solid ${getStatusColor(status)}33`,
      color: getStatusColor(status),
      display: 'inline-flex',
      alignItems: 'center',
      gap: '4px',
      ...style
    }}>
      <span style={{ 
        width: '6px', 
        height: '6px', 
        borderRadius: '50%', 
        background: getStatusColor(status),
        boxShadow: `0 0 8px ${getStatusColor(status)}`
      }} />
      {formatStatus(status)}
    </span>
  );
};

export default StatusBadge;
