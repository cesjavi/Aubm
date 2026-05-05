import React, { useEffect, useMemo, useState } from 'react';
import { Bot, CheckCircle2, PlusCircle, RefreshCw } from 'lucide-react';
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
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [provider, setProvider] = useState<SupportedProvider>(defaultProvider);
  const [model, setModel] = useState(getDefaultModel(defaultProvider));
  const [systemPrompt, setSystemPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const providerModels = providerOptions.find((option) => option.id === provider)?.models ?? [];

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
  }, []);

  const handleProviderChange = (value: SupportedProvider) => {
    setProvider(value);
    setModel(getDefaultModel(value));
  };

  const createAgent = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) {
      setError('You must be signed in to create an agent.');
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    const { error: insertError } = await supabase.from('agents').insert({
      user_id: user.id,
      name,
      role,
      api_provider: provider,
      model,
      system_prompt: systemPrompt || `You are ${name}, acting as ${role || 'an AI agent'}.`
    });

    if (insertError) {
      setError(insertError.message);
    } else {
      setName('');
      setRole('');
      setSystemPrompt('');
      setMessage('Agent created successfully.');
      await loadAgents();
    }

    setSaving(false);
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
          <div className="settings-section-title">
            <PlusCircle size={22} color="var(--accent)" />
            <h3>Create Agent</h3>
          </div>
          <form onSubmit={createAgent} style={{ display: 'grid', gap: 'var(--space-md)' }}>
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
              {saving ? 'Creating...' : 'Create Agent'}
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
              <div key={agent.id} className="task-row">
                <div>
                  <strong>{agent.name}</strong>
                  <p>{agent.role || 'No role provided.'}</p>
                </div>
                <span>{agent.api_provider} / {agent.model}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </motion.div>
  );
};

export default AgentsView;
