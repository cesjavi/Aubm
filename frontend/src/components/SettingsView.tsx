import React, { useMemo, useState } from 'react';
import { Bot, CheckCircle2, KeyRound, LogOut, Server, Settings, Shield, UserCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { getDefaultModel, getDefaultProvider, providerOptions, saveProviderDefaults } from '../services/llmConfig';
import type { SupportedProvider } from '../services/llmConfig';

const SettingsView: React.FC = () => {
  const { user, session, signOut } = useAuth();
  const initialProvider = useMemo(() => getDefaultProvider(), []);
  const [provider, setProvider] = useState<SupportedProvider>(initialProvider);
  const [model, setModel] = useState(getDefaultModel(initialProvider));
  const [saved, setSaved] = useState(false);

  const config = useMemo(() => {
    const apiUrl = import.meta.env.VITE_API_URL || 'Not configured';
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'Not configured';
    return { apiUrl, supabaseUrl };
  }, []);

  const providerModels = providerOptions.find((option) => option.id === provider)?.models ?? [];

  const updateProvider = (value: SupportedProvider) => {
    setProvider(value);
    setModel(getDefaultModel(value));
    setSaved(false);
  };

  const saveDefaults = () => {
    saveProviderDefaults(provider, model);
    setSaved(true);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="settings-page animate-fade-in">
      <div className="panel-heading">
        <Settings size={32} color="var(--accent)" />
        <div>
          <h2>Settings</h2>
          <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>Review environment, session, and security configuration.</p>
        </div>
      </div>

      <div className="settings-grid">
        <section className="glass-panel settings-section">
          <div className="settings-section-title">
            <UserCircle size={22} color="var(--accent)" />
            <h3>Session</h3>
          </div>
          <SettingRow label="Email" value={user?.email ?? 'Unknown'} />
          <SettingRow label="User ID" value={user?.id ?? 'Unknown'} />
          <SettingRow label="Provider" value={user?.app_metadata?.provider ?? 'email'} />
          <SettingRow label="Expires" value={session?.expires_at ? new Date(session.expires_at * 1000).toLocaleString() : 'Unknown'} />
        </section>

        <section className="glass-panel settings-section">
          <div className="settings-section-title">
            <Server size={22} color="var(--accent)" />
            <h3>Runtime</h3>
          </div>
          <SettingRow label="API URL" value={config.apiUrl} />
          <SettingRow label="Supabase URL" value={config.supabaseUrl} />
          <SettingRow label="Frontend Mode" value={import.meta.env.MODE} />
        </section>

        <section className="glass-panel settings-section">
          <div className="settings-section-title">
            <Bot size={22} color="var(--accent)" />
            <h3>LLM Defaults</h3>
          </div>
          <p style={{ color: 'var(--text-dim)' }}>These defaults are used when creating new agents from the UI. API keys stay in backend `.env`.</p>
          <label>
            <span>Default Provider</span>
            <select value={provider} onChange={(event) => updateProvider(event.target.value as SupportedProvider)}>
              {providerOptions.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Default Model</span>
            <select value={model} onChange={(event) => { setModel(event.target.value); setSaved(false); }}>
              {providerModels.map((providerModel) => (
                <option key={providerModel} value={providerModel}>{providerModel}</option>
              ))}
            </select>
          </label>
          <button className="btn btn-primary" onClick={saveDefaults}>
            <CheckCircle2 size={18} />
            Save LLM Defaults
          </button>
          {saved && <p style={{ color: 'var(--success)' }}>LLM defaults saved.</p>}
        </section>

        <section className="glass-panel settings-section">
          <div className="settings-section-title">
            <Shield size={22} color="var(--accent)" />
            <h3>Security</h3>
          </div>
          <SettingRow label="Authentication" value="Supabase Auth" />
          <SettingRow label="Database Access" value="RLS protected" />
          <SettingRow label="Marketplace Deploy" value="Owned by user_id" />
        </section>

        <section className="glass-panel settings-section">
          <div className="settings-section-title">
            <KeyRound size={22} color="var(--accent)" />
            <h3>Account</h3>
          </div>
          <p style={{ color: 'var(--text-dim)' }}>Signing out clears the local Supabase session and returns to the login screen.</p>
          <button className="btn btn-glass" onClick={signOut}>
            <LogOut size={18} />
            Sign Out
          </button>
        </section>
      </div>
    </motion.div>
  );
};

const SettingRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="setting-row">
    <span>{label}</span>
    <strong title={value}>{value}</strong>
  </div>
);

export default SettingsView;
