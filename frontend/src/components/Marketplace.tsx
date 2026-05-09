import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { Star, Download, Search, Users } from 'lucide-react';
import { motion } from 'framer-motion';

interface AgentTemplate {
  id: string;
  name: string;
  role: string;
  model: string;
  api_provider: string;
  system_prompt: string;
  category: string;
  description: string;
  is_featured: boolean;
  team_id?: string;
  is_public: boolean;
  teams?: { name: string };
}

const getErrorMessage = (error: unknown) => error instanceof Error ? error.message : 'Unknown error';

const Marketplace: React.FC = () => {
  const [templates, setTemplates] = useState<AgentTemplate[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [deployingId, setDeployingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<'all' | 'public' | 'team'>('all');

  useEffect(() => {
    const fetchTemplates = async () => {
      setLoading(true);
      setError(null);
      const { data, error: templateError } = await supabase
        .from('agent_templates')
        .select(`
          *,
          teams:team_id(name)
        `)
        .order('category', { ascending: true })
        .order('name', { ascending: true });

      if (templateError) {
        setError(templateError.message);
      } else {
        setTemplates(data ?? []);
      }
      setLoading(false);
    };
    fetchTemplates();
  }, []);

  const handleDeploy = async (template: AgentTemplate) => {
    setMessage(null);
    setError(null);
    setDeployingId(template.id);

    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      setError('Please log in to deploy agents.');
      setDeployingId(null);
      return;
    }

    try {
      const { data: existingAgent, error: lookupError } = await supabase
        .from('agents')
        .select('id')
        .eq('user_id', userData.user.id)
        .eq('name', template.name)
        .eq('role', template.role)
        .limit(1)
        .maybeSingle();

      if (lookupError) throw lookupError;
      if (existingAgent) {
        setMessage(`${template.name} is already in your agent fleet.`);
        return;
      }

      const { error: insertError } = await supabase.from('agents').insert({
        user_id: userData.user.id,
        name: template.name,
        role: template.role,
        model: template.model,
        api_provider: template.api_provider,
        system_prompt: template.system_prompt
      });

      if (insertError) throw insertError;
      setMessage(`${template.name} has been added to your agent fleet.`);
    } catch (e: unknown) {
      setError(`Failed to deploy agent: ${getErrorMessage(e)}`);
    } finally {
      setDeployingId(null);
    }
  };

  const filteredTemplates = templates.filter(t => {
    const matchesSearch = t.name.toLowerCase().includes(search.toLowerCase()) || 
                         t.category.toLowerCase().includes(search.toLowerCase());
    
    if (activeFilter === 'public') return matchesSearch && t.is_public;
    if (activeFilter === 'team') return matchesSearch && t.team_id !== null;
    return matchesSearch;
  });

  return (
    <div className="animate-fade-in marketplace-page">
      <div className="marketplace-header">
        <div>
          <h2>Agent Marketplace</h2>
          <p style={{ color: 'var(--text-dim)' }}>Deploy pre-configured expert agents to your projects.</p>
        </div>
        <div className="marketplace-search-container" style={{ display: 'flex', gap: 'var(--space-md)', flex: 1, justifyContent: 'flex-end' }}>
          <div className="marketplace-search" style={{ position: 'relative', width: '300px' }}>
            <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
            <input 
              type="text" 
              placeholder="Search experts..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ 
                width: '100%', padding: '0.8rem 1rem 0.8rem 2.5rem', 
                background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', 
                borderRadius: 'var(--radius-md)', color: 'white', outline: 'none'
              }}
            />
          </div>
        </div>
      </div>

      <div className="filter-tabs" style={{ display: 'flex', gap: 'var(--space-sm)', marginBottom: 'var(--space-lg)' }}>
        <button 
          className={`btn ${activeFilter === 'all' ? 'btn-primary' : 'btn-glass'}`}
          onClick={() => setActiveFilter('all')}
        >
          All Assets
        </button>
        <button 
          className={`btn ${activeFilter === 'public' ? 'btn-primary' : 'btn-glass'}`}
          onClick={() => setActiveFilter('public')}
        >
          Public
        </button>
        <button 
          className={`btn ${activeFilter === 'team' ? 'btn-primary' : 'btn-glass'}`}
          onClick={() => setActiveFilter('team')}
        >
          Team Assets
        </button>
      </div>

      {error && <div className="inline-status modal-error">{error}</div>}
      {message && <div className="inline-status"><span>{message}</span></div>}
      {loading && <div className="inline-status">Loading marketplace templates...</div>}
      {!loading && filteredTemplates.length === 0 && (
        <div className="glass-panel empty-state">
          <h3>No templates found</h3>
          <p>{search ? 'Try a different search term.' : 'Apply database/marketplace.sql in Supabase to seed marketplace templates.'}</p>
        </div>
      )}

      <div className="marketplace-grid">
        {filteredTemplates.map((template, i) => (
          <motion.div 
            key={template.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="glass-panel hover-lift"
            style={{ padding: 'var(--space-lg)', display: 'flex', flexDirection: 'column' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
              <div style={{ display: 'flex', gap: 'var(--space-xs)' }}>
                <span style={{ 
                  padding: '0.25rem 0.75rem', background: 'rgba(255,255,255,0.1)', 
                  borderRadius: 'var(--radius-full)', fontSize: '0.75rem', fontWeight: 600, color: 'var(--accent)'
                }}>
                  {template.category}
                </span>
                {template.team_id && (
                  <span style={{ 
                    padding: '0.25rem 0.75rem', background: 'var(--primary)', 
                    borderRadius: 'var(--radius-full)', fontSize: '0.75rem', fontWeight: 600, color: 'white',
                    display: 'flex', alignItems: 'center', gap: '4px'
                  }}>
                    <Users size={12} />
                    {template.teams?.name || 'Team'}
                  </span>
                )}
              </div>
              {template.is_featured && <Star size={16} fill="var(--accent)" color="var(--accent)" />}
            </div>

            <h3 style={{ fontSize: '1.25rem', marginBottom: 'var(--space-xs)' }}>{template.name}</h3>
            <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem', marginBottom: 'var(--space-lg)', flex: 1 }}>
              {template.description}
            </p>

            <div className="marketplace-card-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{template.model}</span>
              <button
                className="btn btn-glass"
                style={{ padding: '0.5rem 1rem' }}
                onClick={() => handleDeploy(template)}
                disabled={deployingId === template.id}
              >
                <Download size={16} />
                {deployingId === template.id ? 'Deploying...' : 'Deploy'}
              </button>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export default Marketplace;
