import React, { useState } from 'react';
import { 
  Bot, 
  LayoutDashboard, 
  Settings, 
  PlusCircle, 
  Menu,
  X,
  LogOut,
  MessageSquare,
  ShoppingBag,
  Volume2,
  Box,
  Activity,
  Users,
  ShieldCheck
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from './context/useAuth';
import Login from './components/Login';
import DebateView from './components/DebateView';
import Marketplace from './components/Marketplace';
import VoiceControl from './components/VoiceControl';
import SpatialDashboard from './components/SpatialDashboard';
import MonitoringView from './components/MonitoringView';
import NewProject from './components/NewProject';
import SettingsView from './components/SettingsView';
import Dashboard from './components/Dashboard';
import ProjectDetail from './components/ProjectDetail';
import AgentsView from './components/AgentsView';
import AgentConsole from './components/AgentConsole';
import SplashScreen from './components/SplashScreen';
import TeamsView from './components/TeamsView';
import AuditView from './components/AuditView';
import { useEffect } from 'react';
import { getUiMode, saveUiMode } from './services/uiMode';
import type { UiMode } from './services/uiMode';
import { getAppVersion } from './services/runtimeConfig';

type AppTab = 'dashboard' | 'project-detail' | 'agents' | 'marketplace' | 'debate' | 'voice' | 'spatial' | 'monitoring' | 'teams' | 'audit' | 'new-project' | 'settings';

const App: React.FC = () => {
  const { session, loading, signOut, profile, user } = useAuth();
  const appVersion = getAppVersion();
  const [activeTab, setActiveTab] = useState<AppTab>('dashboard');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [initialTaskId, setInitialTaskId] = useState<string | null>(null);
  const [projectDetailReturnTab, setProjectDetailReturnTab] = useState<AppTab>('dashboard');
  const [initialProjectData, setInitialProjectData] = useState<any>(null);
  const [uiMode, setUiMode] = useState<UiMode>(() => getUiMode());
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => typeof window === 'undefined' || window.innerWidth >= 900);
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), 2500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (uiMode === 'expert') return;
    if (['agents', 'marketplace', 'debate', 'voice', 'spatial', 'monitoring'].includes(activeTab)) {
      setActiveTab('dashboard');
    }
  }, [activeTab, uiMode]);

  const navigateTo = (tab: AppTab) => {
    setActiveTab(tab);
    if (typeof window !== 'undefined' && window.innerWidth < 900) {
      setIsSidebarOpen(false);
    }
  };

  const openProjectDetail = (projectId: string, options?: { taskId?: string | null; returnTab?: AppTab }) => {
    setSelectedProjectId(projectId);
    setInitialTaskId(options?.taskId ?? null);
    setProjectDetailReturnTab(options?.returnTab ?? 'dashboard');
    navigateTo('project-detail');
  };

  const updateUiMode = (mode: UiMode) => {
    setUiMode(mode);
    saveUiMode(mode);
  };

  if (loading || showSplash) return <AnimatePresence><SplashScreen /></AnimatePresence>;
  if (!session) return <Login />;

  return (
    <div className="app-container">
      {isSidebarOpen && <button className="sidebar-backdrop" aria-label="Close sidebar" onClick={() => setIsSidebarOpen(false)} />}
      {/* Sidebar */}
      <AnimatePresence mode="wait">
        {isSidebarOpen && (
          <motion.aside 
            initial={{ x: -280 }}
            animate={{ x: 0 }}
            exit={{ x: -280 }}
            className="glass-panel app-sidebar"
            style={{ 
              display: 'flex', 
              flexDirection: 'column'
            }}
          >
            <div className="sidebar-brand">
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                <Bot size={32} color="var(--accent)" />
                <h1 style={{ fontSize: '1.5rem', margin: 0 }}>Aubm</h1>
              </div>
              <button 
                className="mobile-only sidebar-close" 
                onClick={() => setIsSidebarOpen(false)}
                style={{ color: 'var(--text-dim)', padding: '4px' }}
              >
                <X size={24} />
              </button>
            </div>

            <nav className="sidebar-nav">
              <SidebarItem 
                icon={<LayoutDashboard size={20} />} 
                label="Dashboard" 
                active={activeTab === 'dashboard'} 
                onClick={() => navigateTo('dashboard')} 
              />
              <SidebarItem 
                icon={<PlusCircle size={20} />} 
                label="New Project" 
                active={activeTab === 'new-project'} 
                onClick={() => navigateTo('new-project')} 
              />
              {uiMode === 'expert' && (
                <>
                  <SidebarItem 
                    icon={<ShoppingBag size={20} />} 
                    label="Marketplace" 
                    active={activeTab === 'marketplace'} 
                    onClick={() => navigateTo('marketplace')} 
                  />
                  <SidebarItem
                    icon={<Bot size={20} />}
                    label="Agents"
                    active={activeTab === 'agents'}
                    onClick={() => navigateTo('agents')}
                  />
                  <SidebarItem 
                    icon={<MessageSquare size={20} />} 
                    label="Agent Debate" 
                    active={activeTab === 'debate'} 
                    onClick={() => navigateTo('debate')} 
                  />
                  <SidebarItem
                    icon={<Volume2 size={20} />}
                    label="Voice Control"
                    active={activeTab === 'voice'}
                    onClick={() => navigateTo('voice')}
                  />
                  <SidebarItem
                    icon={<Box size={20} />}
                    label="Spatial View"
                    active={activeTab === 'spatial'}
                    onClick={() => navigateTo('spatial')}
                  />
                  <SidebarItem
                    icon={<Activity size={20} />}
                    label="Monitoring"
                    active={activeTab === 'monitoring'}
                    onClick={() => navigateTo('monitoring')}
                  />
                  <SidebarItem
                    icon={<Users size={20} />}
                    label="Teams"
                    active={activeTab === 'teams'}
                    onClick={() => navigateTo('teams')}
                  />
                  <SidebarItem
                    icon={<ShieldCheck size={20} />}
                    label="Audit Logs"
                    active={activeTab === 'audit'}
                    onClick={() => navigateTo('audit')}
                  />
                </>
              )}
              <SidebarItem 
                icon={<Settings size={20} />} 
                label="Settings" 
                active={activeTab === 'settings'} 
                onClick={() => navigateTo('settings')} 
              />
              <SidebarItem 
                icon={<LogOut size={20} />} 
                label="Sign Out" 
                onClick={signOut} 
              />
            </nav>

            <div className="sidebar-user">
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifySelf: 'center', justifyContent: 'center' }}>
                  {(profile?.full_name || user?.email || 'U').slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontWeight: 600 }}>{profile?.full_name || user?.email || 'User'}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>{profile?.role || 'user'}</div>
                </div>
              </div>
              <div style={{ marginTop: 'var(--space-sm)', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                Version {appVersion}
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="app-main">
        <header className="app-header">
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="btn-glass" style={{ padding: 'var(--space-sm)' }}>
            {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          
          <div style={{ display: 'flex', gap: 'var(--space-md)', alignItems: 'center' }}>
            <div className="glass-panel api-status" style={{ background: 'rgba(var(--accent-rgb), 0.1)', border: '1px solid var(--accent)' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--accent)', textTransform: 'uppercase' }}>
                Engine: AMD / Llama-3.3-70B
              </span>
            </div>
            <div className="glass-panel api-status mobile-hide">
              <span style={{ color: 'var(--success)' }}>●</span>
              <span>API Online</span>
            </div>
            <div className="glass-panel api-status mobile-hide">
              <span>{uiMode === 'guided' ? 'Guided Mode' : 'Expert Mode'}</span>
            </div>
          </div>
        </header>

        <section className="animate-fade-in app-content">
          {activeTab === 'dashboard' && (
            <Dashboard
              onNewProject={(data?: any) => {
                setInitialProjectData(data || null);
                navigateTo('new-project');
              }}
              onOpenProject={(projectId) => openProjectDetail(projectId)}
            />
          )}
          {activeTab === 'project-detail' && selectedProjectId && (
            <ProjectDetail
              projectId={selectedProjectId}
              uiMode={uiMode}
              initialTaskId={initialTaskId}
              onBack={() => {
                setInitialTaskId(null);
                navigateTo(projectDetailReturnTab);
              }}
            />
          )}

          {activeTab === 'debate' && uiMode === 'expert' && <DebateView />}
          {activeTab === 'agents' && uiMode === 'expert' && <AgentsView />}
          {activeTab === 'marketplace' && uiMode === 'expert' && <Marketplace />}
          {activeTab === 'voice' && uiMode === 'expert' && <VoiceControl onNavigate={navigateTo} />}
          {activeTab === 'spatial' && uiMode === 'expert' && (
            <SpatialDashboard
              selectedProjectId={selectedProjectId}
              onSelectProject={(projectId) => setSelectedProjectId(projectId)}
              onOpenTask={(projectId, taskId) => openProjectDetail(projectId, { taskId, returnTab: 'spatial' })}
            />
          )}
          {activeTab === 'monitoring' && uiMode === 'expert' && <MonitoringView />}
          {activeTab === 'teams' && uiMode === 'expert' && <TeamsView />}
          {activeTab === 'audit' && uiMode === 'expert' && <AuditView />}
          {activeTab === 'new-project' && <NewProject uiMode={uiMode} initialData={initialProjectData} onCreated={() => { setInitialProjectData(null); navigateTo('dashboard'); }} />}
          {activeTab === 'settings' && <SettingsView uiMode={uiMode} onUiModeChange={updateUiMode} />}
        </section>

        {/* Real-time Agent Console */}
        <AgentConsole />
      </main>
    </div>
  );
};

const SidebarItem: React.FC<{ icon: React.ReactNode, label: string, active?: boolean, onClick: () => void }> = ({ icon, label, active, onClick }) => (
  <button 
    onClick={onClick}
    style={{ 
      display: 'flex', 
      alignItems: 'center', 
      gap: 'var(--space-md)', 
      width: '100%', 
      padding: 'var(--space-md)', 
      borderRadius: 'var(--radius-md)',
      background: active ? 'var(--primary)' : 'transparent',
      color: active ? 'white' : 'var(--text-dim)',
      marginBottom: 'var(--space-xs)',
      textAlign: 'left'
    }}
  >
    {icon}
    <span style={{ fontWeight: 500 }}>{label}</span>
  </button>
);

export default App;
