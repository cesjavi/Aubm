import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { Star, Download, Search } from 'lucide-react';
import { motion } from 'framer-motion';

const Marketplace: React.FC = () => {
  const [templates, setTemplates] = useState<any[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const fetchTemplates = async () => {
      const { data } = await supabase.from('agent_templates').select('*');
      if (data) setTemplates(data);
    };
    fetchTemplates();
  }, []);

  const handleDeploy = async (template: any) => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      alert('Please log in to deploy agents.');
      return;
    }

    try {
      const { error } = await supabase.from('agents').insert({
        user_id: userData.user.id,
        name: template.name,
        role: template.role,
        model: template.model,
        api_provider: template.api_provider,
        system_prompt: template.system_prompt
      });

      if (error) throw error;
      alert(`${template.name} has been added to your agent fleet!`);
    } catch (e) {
      const message =
        e instanceof Error
          ? e.message
          : typeof e === 'object' && e !== null && 'message' in e
            ? String((e as { message?: unknown }).message)
            : 'Unknown error';
      alert(`Failed to deploy agent: ${message}`);
    }
  };

  const filteredTemplates = templates.filter(t => 
    t.name.toLowerCase().includes(search.toLowerCase()) || 
    t.category.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="animate-fade-in marketplace-page">
      <div className="marketplace-header">
        <div>
          <h2>Agent Marketplace</h2>
          <p style={{ color: 'var(--text-dim)' }}>Deploy pre-configured expert agents to your projects.</p>
        </div>
        <div className="marketplace-search">
          <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
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

      <div className="marketplace-grid">
        {filteredTemplates.map((template, i) => (
          <motion.div 
            key={template.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="glass-panel hover-lift"
            style={{ padding: 'var(--space-lg)', display: 'flex', flexDirection: 'column' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-md)' }}>
              <span style={{ 
                padding: '0.25rem 0.75rem', background: 'rgba(255,255,255,0.1)', 
                borderRadius: 'var(--radius-full)', fontSize: '0.75rem', fontWeight: 600, color: 'var(--accent)'
              }}>
                {template.category}
              </span>
              {template.is_featured && <Star size={16} fill="var(--accent)" color="var(--accent)" />}
            </div>

            <h3 style={{ fontSize: '1.25rem', marginBottom: 'var(--space-xs)' }}>{template.name}</h3>
            <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem', marginBottom: 'var(--space-lg)', flex: 1 }}>
              {template.description}
            </p>

            <div className="marketplace-card-footer">
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{template.model}</span>
              <button className="btn btn-glass" style={{ padding: '0.5rem 1rem' }} onClick={() => handleDeploy(template)}>
                <Download size={16} />
                Deploy
              </button>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export default Marketplace;
