import React, { useCallback, useEffect, useState } from 'react';
import { Database, Search, ExternalLink, ShieldCheck, Filter } from 'lucide-react';
import { fetchBackend } from '../services/api';

interface Claim {
  id: string;
  claim_text: string;
  entity_name: string | null;
  source_url: string | null;
  confidence: string;
  merged_count?: number;
}

interface EvidenceSummary {
  claim_count: number;
  sourced_claim_count: number;
  unsourced_claim_count: number;
  source_coverage: number;
  by_entity: Record<string, number>;
}

interface EvidenceData {
  project_id: string;
  merged: boolean;
  summary: EvidenceSummary;
  claims: Claim[];
}

interface EvidenceViewProps {
  projectId: string;
}

// Helpers removed (using fetchBackend)
const getSourceHostname = (sourceUrl: string) => {
  try {
    return new URL(sourceUrl).hostname;
  } catch {
    return sourceUrl;
  }
};

const EvidenceView: React.FC<EvidenceViewProps> = ({ projectId }) => {
  const [data, setData] = useState<EvidenceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mergeEnabled, setMergeEnabled] = useState(true);

  const loadEvidence = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchBackend<EvidenceData>(`/orchestrator/projects/${projectId}/evidence?merge=${mergeEnabled}`);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [mergeEnabled, projectId]);

  useEffect(() => {
    loadEvidence();
  }, [loadEvidence]);

  if (loading && !data) {
    return (
      <div className="glass-panel" style={{ padding: 'var(--space-xl)', textAlign: 'center' }}>
        <div className="loading-spinner" style={{ margin: '0 auto var(--space-md)' }} />
        <p style={{ color: 'var(--text-dim)' }}>Analyzing project evidence...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass-panel" style={{ padding: 'var(--space-xl)', textAlign: 'center', borderColor: 'var(--danger)' }}>
        <p style={{ color: 'var(--danger)' }}>Error: {error}</p>
        <button className="btn btn-glass" onClick={loadEvidence} style={{ marginTop: 'var(--space-md)' }}>
          Retry
        </button>
      </div>
    );
  }

  const summary = data?.summary;
  const claims = data?.claims || [];

  return (
    <div className="evidence-view">
      {/* Stats Summary */}
      <div className="evidence-stats-grid">
        <div className="glass-panel stat-card">
          <Database size={20} color="var(--accent)" />
          <div className="stat-content">
            <span className="stat-label">Total Claims</span>
            <span className="stat-value">{summary?.claim_count || 0}</span>
          </div>
        </div>
        <div className="glass-panel stat-card">
          <ShieldCheck size={20} color="var(--success)" />
          <div className="stat-content">
            <span className="stat-label">Source Coverage</span>
            <span className="stat-value">{((summary?.source_coverage || 0) * 100).toFixed(0)}%</span>
          </div>
        </div>
        <div className="glass-panel stat-card">
          <Search size={20} color="var(--info)" />
          <div className="stat-content">
            <span className="stat-label">Entities</span>
            <span className="stat-value">{Object.keys(summary?.by_entity || {}).length}</span>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="evidence-controls">
        <button 
          className={`btn ${mergeEnabled ? 'btn-primary' : 'btn-glass'}`} 
          onClick={() => setMergeEnabled(!mergeEnabled)}
          style={{ gap: 'var(--space-xs)' }}
        >
          <Filter size={16} />
          {mergeEnabled ? 'Semantic Merging Active' : 'Show All Raw Claims'}
        </button>
      </div>

      {/* Claims List */}
      <div className="claims-container">
        {claims.length === 0 ? (
          <div className="glass-panel" style={{ padding: 'var(--space-xl)', textAlign: 'center' }}>
            <p style={{ color: 'var(--text-dim)' }}>No evidence claims have been extracted for this project yet.</p>
          </div>
        ) : (
          <div className="claims-grid">
            {claims.map((claim) => (
              <div key={claim.id} className="glass-panel claim-card">
                <div className="claim-header">
                  {claim.entity_name && (
                    <span className="entity-badge">{claim.entity_name}</span>
                  )}
                  <span className={`confidence-badge confidence-${claim.confidence.toLowerCase()}`}>
                    {claim.confidence} confidence
                  </span>
                  {claim.merged_count && claim.merged_count > 1 && (
                    <span className="merged-badge">x{claim.merged_count} verified</span>
                  )}
                </div>
                <p className="claim-text">{claim.claim_text}</p>
                {claim.source_url && (
                  <div className="claim-source">
                    <ExternalLink size={14} />
                    <a href={claim.source_url} target="_blank" rel="noopener noreferrer">
                      {getSourceHostname(claim.source_url)}
                    </a>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <style>{`
        .evidence-view {
          display: flex;
          flex-direction: column;
          gap: var(--space-lg);
          padding: var(--space-md) 0;
        }
        .evidence-stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: var(--space-md);
        }
        .stat-card {
          display: flex;
          align-items: center;
          gap: var(--space-md);
          padding: var(--space-md);
        }
        .stat-content {
          display: flex;
          flex-direction: column;
        }
        .stat-label {
          font-size: 0.75rem;
          color: var(--text-dim);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .stat-value {
          font-size: 1.25rem;
          font-weight: 700;
          color: var(--text-main);
        }
        .evidence-controls {
          display: flex;
          justify-content: flex-end;
        }
        .claims-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: var(--space-md);
        }
        .claim-card {
          display: flex;
          flex-direction: column;
          gap: var(--space-sm);
          padding: var(--space-md);
          transition: transform 0.2s, border-color 0.2s;
        }
        .claim-card:hover {
          transform: translateY(-2px);
          border-color: var(--accent);
        }
        .claim-header {
          display: flex;
          flex-wrap: wrap;
          gap: var(--space-xs);
          align-items: center;
        }
        .entity-badge {
          background: rgba(110, 89, 255, 0.15);
          color: var(--accent);
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 0.7rem;
          font-weight: 700;
          text-transform: uppercase;
        }
        .confidence-badge {
          font-size: 0.65rem;
          padding: 2px 6px;
          border-radius: 4px;
          text-transform: capitalize;
        }
        .confidence-high { background: rgba(39, 174, 96, 0.15); color: #2ecc71; }
        .confidence-medium { background: rgba(241, 196, 15, 0.15); color: #f1c40f; }
        .confidence-low { background: rgba(231, 76, 60, 0.15); color: #e74c3c; }
        .merged-badge {
          background: rgba(52, 152, 219, 0.15);
          color: #3498db;
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 0.65rem;
          font-weight: 700;
        }
        .claim-text {
          font-size: 0.95rem;
          line-height: 1.5;
          color: var(--text-main);
          margin: 0;
        }
        .claim-source {
          margin-top: auto;
          display: flex;
          align-items: center;
          gap: var(--space-xs);
          font-size: 0.8rem;
          color: var(--text-dim);
        }
        .claim-source a {
          color: var(--accent);
          text-decoration: none;
        }
        .claim-source a:hover {
          text-decoration: underline;
        }
      `}</style>
    </div>
  );
};

export default EvidenceView;
