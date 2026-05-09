import React, { useEffect, useMemo, useState } from 'react';
import { Bot, CheckCircle2, PlusCircle, RefreshCw, X, ShoppingBag } from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '../services/supabase';
import { useAuth } from '../context/useAuth';
import { getDefaultModel, getDefaultProvider, providerOptions } from '../services/llmConfig';
import type { SupportedProvider } from '../services/llmConfig';

interface Agent {
  id: string;
  name: string;
  role: string | null;
  api_provider: SupportedProvider;
  model: string;
  system_prompt: string | null;
  created_at: string;
}

const AgentsView: React.FC = () => {
  const { user } = useAuth();
  const defaultProvider = useMemo(() => getDefaultProvider(), []);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [provider, setProvider] = useState<SupportedProvider>(defaultProvider);
  const [model, setModel] = useState(getDefaultModel(defaultProvider));
  const [systemPrompt, setSystemPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [sharingAgent, setSharingAgent] = useState<Agent | null>(null);
  const [shareToTeam, setShareToTeam] = useState<string | null>(null);
  const [shareDescription, setShareDescription] = useState('');
  const [shareCategory, setShareCategory] = useState('General');
  const [isPublicTemplate, setIsPublicTemplate] = useState(false);
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);

  const providerModels = providerOptions.find((option) => option.id === provider)?.models ?? [];
  const isEditing = selectedAgentId !== null;

  const loadAgents = async () => {
    setLoading(true);
    setError(null);

    const { data, error: selectError } = await supabase
      .from('agents')
      .select('id,name,role,api_provider,model,system_prompt,created_at')
      .order('created_at', { ascending: false });

    if (selectError) setError(selectError.message);
    setAgents((data ?? []) as Agent[]);
    setLoading(false);
  };

  useEffect(() => {
    loadAgents();
    fetchTeams();
  }, []);

  const fetchTeams = async () => {
    try {
      const { data } = await supabase.from('teams').select('id, name');
      setTeams(data || []);
    } catch (err) {
      console.error('Failed to fetch teams');
    }
  };

  const handleProviderChange = (value: SupportedProvider) => {
    setProvider(value);
    setModel(getDefaultModel(value));
  };

  const resetForm = () => {
    setSelectedAgentId(null);
    setName('');
    setRole('');
    setProvider(defaultProvider);
    setModel(getDefaultModel(defaultProvider));
    setSystemPrompt('');
  };

  const selectAgent = (agent: Agent) => {
    setSelectedAgentId(agent.id);
    setName(agent.name);
    setRole(agent.role ?? '');
    setProvider(agent.api_provider);
    setModel(agent.model);
    setSystemPrompt(agent.system_prompt ?? '');
    setMessage(null);
    setError(null);
  };

  const saveAgent = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) {
      setError(`You must be signed in to ${isEditing ? 'update' : 'create'} an agent.`);
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    const payload = {
      user_id: user.id,
      name,
      role,
      api_provider: provider,
      model,
      system_prompt: systemPrompt || `You are ${name}, acting as ${role || 'an AI agent'}.`
    };

    const response = isEditing
      ? await supabase.from('agents').update(payload).eq('id', selectedAgentId)
      : await supabase.from('agents').insert(payload);

    if (response.error) {
      setError(response.error.message);
    } else {
      resetForm();
      setMessage(isEditing ? 'Agent updated successfully.' : 'Agent created successfully.');
      await loadAgents();
    }

    setSaving(false);
  };

  const handleShareTemplate = async () => {
    if (!sharingAgent || !user) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('agent_templates').insert({
        name: sharingAgent.name,
        role: sharingAgent.role,
        description: shareDescription || `Custom agent: ${sharingAgent.name}`,
        model: sharingAgent.model,
        api_provider: sharingAgent.api_provider,
        system_prompt: sharingAgent.system_prompt,
        category: shareCategory,
        author_id: user.id,
        team_id: isPublicTemplate ? null : shareToTeam,
        is_public: isPublicTemplate
      });

      if (error) throw error;
      setMessage('Agent shared to marketplace!');
      setShowShareModal(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="agents-page animate-fade-in">
      <div className="dashboard-heading page-heading">
        <div className="panel-heading" style={{ marginBottom: 0 }}>
          <Bot size={32} color="var(--accent)" />
          <div>
            <h2>Agents</h2>
            <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>Create custom agents and choose the LLM provider used at runtime.</p>
          </div>
        </div>
        <button className="btn btn-glass" onClick={loadAgents} disabled={loading}>
          <RefreshCw size={18} />
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {error && <div className="inline-status">{error}</div>}
      {message && <div className="inline-status"><CheckCircle2 size={16} color="var(--success)" />{message}</div>}

      <div className="project-detail-grid">
        <section className="glass-panel project-form">
          <div className="settings-section-title" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
              <PlusCircle size={22} color="var(--accent)" />
              <h3>{isEditing ? 'Edit Agent' : 'Create Agent'}</h3>
            </div>
            {isEditing && (
              <button className="btn btn-icon" type="button" onClick={resetForm} title="Close editor">
                <X size={18} />
              </button>
            )}
          </div>
          <form onSubmit={saveAgent} style={{ display: 'grid', gap: 'var(--space-md)' }}>
            <label>
              <span>Name</span>
              <input value={name} onChange={(event) => setName(event.target.value)} required placeholder="Research Analyst" />
            </label>
            <label>
              <span>Role</span>
              <input value={role} onChange={(event) => setRole(event.target.value)} placeholder="Market research specialist" />
            </label>
            <div className="responsive-two-col">
              <label>
                <span>Provider</span>
                <select value={provider} onChange={(event) => handleProviderChange(event.target.value as SupportedProvider)}>
                  {providerOptions.map((option) => (
                    <option key={option.id} value={option.id}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Model</span>
                <select value={model} onChange={(event) => setModel(event.target.value)}>
                  {providerModels.map((providerModel) => (
                    <option key={providerModel} value={providerModel}>{providerModel}</option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              <span>System Prompt</span>
              <textarea value={systemPrompt} onChange={(event) => setSystemPrompt(event.target.value)} rows={6} placeholder="Define behavior, boundaries, output style, and quality criteria." />
            </label>
            <button className="btn btn-primary" type="submit" disabled={saving}>
              <Bot size={18} />
              {saving ? (isEditing ? 'Saving...' : 'Creating...') : (isEditing ? 'Save Agent' : 'Create Agent')}
            </button>
          </form>
        </section>

        <section className="glass-panel task-list-panel">
          <div className="settings-section-title">
            <Bot size={22} color="var(--accent)" />
            <h3>Agent Fleet</h3>
          </div>
          {agents.length === 0 && <p style={{ color: 'var(--text-dim)' }}>No agents created yet.</p>}
          <div className="task-list">
            {agents.map((agent) => (
              <div
                key={agent.id}
                className="task-row"
                onClick={() => selectAgent(agent)}
                style={{
                  width: '100%',
                  background: selectedAgentId === agent.id ? 'rgba(255,255,255,0.06)' : undefined,
                  borderColor: selectedAgentId === agent.id ? 'var(--accent)' : undefined,
                  textAlign: 'left',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{agent.name}</strong>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{agent.role || 'No role provided.'}</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', paddingLeft: 'var(--space-md)' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--accent)', whiteSpace: 'nowrap' }}>{agent.api_provider} / {agent.model}</span>
                  <button 
                    className="btn btn-glass btn-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSharingAgent(agent);
                      setShowShareModal(true);
                    }}
                    title="Share to Marketplace"
                    style={{ padding: '8px' }}
                  >
                    <ShoppingBag size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Share Modal */}
      {showShareModal && sharingAgent && (
        <div className="modal-overlay" onClick={() => setShowShareModal(false)}>
          <div className="glass-panel modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <div className="panel-heading">
              <ShoppingBag size={28} color="var(--accent)" />
              <div>
                <h3>Share as Template</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>Publish '{sharingAgent.name}' to the Marketplace.</p>
              </div>
            </div>

            <div style={{ display: 'grid', gap: 'var(--space-md)', marginTop: 'var(--space-lg)' }}>
              <label>
                <span>Description</span>
                <textarea 
                  className="glass-input" 
                  value={shareDescription} 
                  onChange={e => setShareDescription(e.target.value)}
                  placeholder="What is this agent expert at?"
                  rows={3}
                />
              </label>

              <div className="responsive-two-col">
                <label>
                  <span>Category</span>
                  <select className="glass-input" value={shareCategory} onChange={e => setShareCategory(e.target.value)}>
                    <option value="General">General</option>
                    <option value="Marketing">Marketing</option>
                    <option value="Development">Development</option>
                    <option value="Legal">Legal</option>
                    <option value="Research">Research</option>
                    <option value="Finance">Finance</option>
                  </select>
                </label>
                <label>
                  <span>Visibility</span>
                  <select 
                    className="glass-input" 
                    value={isPublicTemplate ? 'public' : 'team'} 
                    onChange={e => setIsPublicTemplate(e.target.value === 'public')}
                  >
                    <option value="team">Share to Team</option>
                    <option value="public">Make Public (Global)</option>
                  </select>
                </label>
              </div>

              {!isPublicTemplate && (
                <label>
                  <span>Target Team</span>
                  <select 
                    className="glass-input" 
                    value={shareToTeam || ''} 
                    onChange={e => setShareToTeam(e.target.value || null)}
                  >
                    <option value="">Select a team...</option>
                    {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </label>
              )}

              <div className="button-row" style={{ marginTop: 'var(--space-lg)' }}>
                <button className="btn btn-glass" onClick={() => setShowShareModal(false)}>Cancel</button>
                <button 
                  className="btn btn-primary" 
                  onClick={handleShareTemplate}
                  disabled={saving || (!isPublicTemplate && !shareToTeam)}
                >
                  <ShoppingBag size={18} />
                  {saving ? 'Sharing...' : 'Publish to Marketplace'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
};

export default AgentsView;
