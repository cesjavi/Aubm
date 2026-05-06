import React, { useEffect, useMemo, useState } from 'react';
import { Bot, CheckCircle2, KeyRound, LogOut, Server, Settings, Shield, UserCircle, Users } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAuth } from '../context/useAuth';
import { getDefaultModel, getDefaultProvider, providerOptions, saveProviderDefaults } from '../services/llmConfig';
import type { SupportedProvider } from '../services/llmConfig';
import { getApiUrl, getAppVersion, getSupabaseUrl } from '../services/runtimeConfig';
import type { UiMode } from '../services/uiMode';
import { supabase } from '../services/supabase';

interface ProfileRow {
  id: string;
  role: 'user' | 'manager' | 'admin';
  full_name: string | null;
  avatar_url: string | null;
}

const SettingsView: React.FC<{ uiMode: UiMode; onUiModeChange: (mode: UiMode) => void }> = ({ uiMode, onUiModeChange }) => {
  const { user, session, profile, signOut, refreshProfile } = useAuth();
  const initialProvider = useMemo(() => getDefaultProvider(), []);
  const [provider, setProvider] = useState<SupportedProvider>(initialProvider);
  const [model, setModel] = useState(getDefaultModel(initialProvider));
  const [saved, setSaved] = useState(false);
  const [fullName, setFullName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [adminMessage, setAdminMessage] = useState<string | null>(null);

  const config = useMemo(() => {
    const apiUrl = getApiUrl() || 'Same origin';
    const supabaseUrl = getSupabaseUrl() || 'Not configured';
    const appVersion = getAppVersion();
    return { apiUrl, supabaseUrl, appVersion };
  }, []);

  const providerModels = providerOptions.find((option) => option.id === provider)?.models ?? [];
  const isAdmin = profile?.role === 'admin';

  useEffect(() => {
    setFullName(profile?.full_name ?? '');
    setAvatarUrl(profile?.avatar_url ?? '');
  }, [profile]);

  useEffect(() => {
    if (!isAdmin) return;

    const loadProfiles = async () => {
      setProfilesLoading(true);
      const { data } = await supabase
        .from('profiles')
        .select('id,role,full_name,avatar_url')
        .order('created_at', { ascending: false });
      setProfiles(data ?? []);
      setProfilesLoading(false);
    };

    loadProfiles();
  }, [isAdmin, adminMessage]);

  const updateProvider = (value: SupportedProvider) => {
    setProvider(value);
    setModel(getDefaultModel(value));
    setSaved(false);
  };

  const saveDefaults = () => {
    saveProviderDefaults(provider, model);
    setSaved(true);
  };

  const saveProfile = async () => {
    if (!user) return;
    setSavingProfile(true);
    setProfileMessage(null);

    const { error } = await supabase
      .from('profiles')
      .upsert(
        {
          id: user.id,
          role: profile?.role ?? 'user',
          full_name: fullName.trim() || null,
          avatar_url: avatarUrl.trim() || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      );

    if (error) {
      setProfileMessage(error.message);
      setSavingProfile(false);
      return;
    }

    await refreshProfile();
    setProfileMessage('Profile updated.');
    setSavingProfile(false);
  };

  const updateUserRole = async (profileId: string, role: 'user' | 'admin') => {
    setAdminMessage(null);
    const { error } = await supabase
      .from('profiles')
      .update({ role, updated_at: new Date().toISOString() })
      .eq('id', profileId);

    if (error) {
      setAdminMessage(error.message);
      return;
    }

    setProfiles((current) => current.map((entry) => (entry.id === profileId ? { ...entry, role } : entry)));
    if (profileId === user?.id) {
      await refreshProfile();
    }
    setAdminMessage('User roles updated.');
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
          <SettingRow label="Role" value={profile?.role ?? 'user'} />
          <SettingRow label="Expires" value={session?.expires_at ? new Date(session.expires_at * 1000).toLocaleString() : 'Unknown'} />
        </section>

        <section className="glass-panel settings-section">
          <div className="settings-section-title">
            <UserCircle size={22} color="var(--accent)" />
            <h3>Profile</h3>
          </div>
          <label>
            <span>Full Name</span>
            <input value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Your name" />
          </label>
          <label>
            <span>Avatar URL</span>
            <input value={avatarUrl} onChange={(event) => setAvatarUrl(event.target.value)} placeholder="https://..." />
          </label>
          <button className="btn btn-primary" onClick={saveProfile} disabled={savingProfile}>
            <CheckCircle2 size={18} />
            {savingProfile ? 'Saving...' : 'Save Profile'}
          </button>
          {profileMessage && <p style={{ color: profileMessage.includes('updated') ? 'var(--success)' : 'var(--danger)' }}>{profileMessage}</p>}
        </section>

        <section className="glass-panel settings-section">
          <div className="settings-section-title">
            <Server size={22} color="var(--accent)" />
            <h3>Runtime</h3>
          </div>
          <SettingRow label="API URL" value={config.apiUrl} />
          <SettingRow label="Supabase URL" value={config.supabaseUrl} />
          <SettingRow label="Frontend Mode" value={import.meta.env.MODE} />
          <SettingRow label="App Version" value={config.appVersion} />
        </section>

        <section className="glass-panel settings-section">
          <div className="settings-section-title">
            <Bot size={22} color="var(--accent)" />
            <h3>Workspace Mode</h3>
          </div>
          <p style={{ color: 'var(--text-dim)' }}>Guided keeps the product focused on the main workflow. Expert exposes the full tool surface.</p>
          <label>
            <span>Mode</span>
            <select value={uiMode} onChange={(event) => onUiModeChange(event.target.value as UiMode)}>
              <option value="guided">Guided</option>
              <option value="expert">Expert</option>
            </select>
          </label>
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
          <SettingRow label="Admin Access" value={isAdmin ? 'Enabled' : 'Disabled'} />
        </section>

        {isAdmin && (
          <section className="glass-panel settings-section" style={{ gridColumn: '1 / -1' }}>
            <div className="settings-section-title">
              <Users size={22} color="var(--accent)" />
              <h3>User Management</h3>
            </div>
            <p style={{ color: 'var(--text-dim)' }}>Manage profile roles for users in this workspace.</p>
            {adminMessage && <div className="inline-status">{adminMessage}</div>}
            <div className="task-list">
              {profilesLoading && <p style={{ color: 'var(--text-dim)' }}>Loading users...</p>}
              {!profilesLoading && profiles.length === 0 && <p style={{ color: 'var(--text-dim)' }}>No profiles found.</p>}
              {profiles.map((entry) => (
                <div key={entry.id} className="task-row">
                  <div style={{ flex: 1 }}>
                    <strong>{entry.full_name || 'Unnamed user'}</strong>
                    <p>{entry.id}</p>
                  </div>
                  <select
                    value={entry.role}
                    onChange={(event) => updateUserRole(entry.id, event.target.value as 'user' | 'admin')}
                    style={{ maxWidth: '160px' }}
                  >
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              ))}
            </div>
          </section>
        )}

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
