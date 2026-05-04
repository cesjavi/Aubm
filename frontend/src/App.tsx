import React, { useState } from 'react';
import { 
  Bot, 
  LayoutDashboard, 
  Settings, 
  PlusCircle, 
  Terminal,
  Menu,
  X,
  LogOut,
  MessageSquare,
  ShoppingBag,
  Volume2,
  Box,
  Activity
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from './context/AuthContext';
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

type AppTab = 'dashboard' | 'project-detail' | 'agents' | 'marketplace' | 'debate' | 'voice' | 'spatial' | 'monitoring' | 'new-project' | 'settings';

const App: React.FC = () => {
  const { session, loading, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState<AppTab>('dashboard');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => typeof window === 'undefined' || window.innerWidth >= 900);

  const navigateTo = (tab: AppTab) => {
    setActiveTab(tab);
    if (typeof window !== 'undefined' && window.innerWidth < 900) {
      setIsSidebarOpen(false);
    }
  };

  if (loading) return null; // Or a premium loading spinner
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
              width: '280px', 
              margin: 'var(--space-md)', 
              display: 'flex', 
              flexDirection: 'column',
              zIndex: 100
            }}
          >
            <div className="sidebar-brand">
              <Bot size={32} color="var(--accent)" />
              <h1 style={{ fontSize: '1.5rem', margin: 0 }}>Aubm</h1>
            </div>

            <nav className="sidebar-nav">
              <SidebarItem 
                icon={<LayoutDashboard size={20} />} 
                label="Dashboard" 
                active={activeTab === 'dashboard'} 
                onClick={() => navigateTo('dashboard')} 
              />
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
                icon={<PlusCircle size={20} />} 
                label="New Project" 
                active={activeTab === 'new-project'} 
                onClick={() => navigateTo('new-project')} 
              />
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
                  JD
                </div>
                <div>
                  <div style={{ fontWeight: 600 }}>John Doe</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>Administrator</div>
                </div>
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
          
          <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
            <div className="glass-panel api-status">
              <span style={{ color: 'var(--success)' }}>●</span>
              <span>API Online</span>
            </div>
          </div>
        </header>

        <section className="animate-fade-in app-content">
          {activeTab === 'dashboard' && (
            <Dashboard
              onNewProject={() => navigateTo('new-project')}
              onOpenProject={(projectId) => {
                setSelectedProjectId(projectId);
                navigateTo('project-detail');
              }}
            />
          )}
          {activeTab === 'project-detail' && selectedProjectId && (
            <ProjectDetail projectId={selectedProjectId} onBack={() => navigateTo('dashboard')} />
          )}

          {activeTab === 'debate' && <DebateView />}
          {activeTab === 'agents' && <AgentsView />}
          {activeTab === 'marketplace' && <Marketplace />}
          {activeTab === 'voice' && <VoiceControl onNavigate={navigateTo} />}
          {activeTab === 'spatial' && <SpatialDashboard />}
          {activeTab === 'monitoring' && <MonitoringView />}
          {activeTab === 'new-project' && <NewProject onCreated={() => navigateTo('dashboard')} />}
          {activeTab === 'settings' && <SettingsView />}
        </section>

        {/* Real-time Console Placeholder */}
        <section className="glass-panel app-console">
          <div style={{ padding: 'var(--space-sm) var(--space-md)', borderBottom: '1px solid var(--glass-border)', display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
            <Terminal size={16} color="var(--accent)" />
            <span style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Agent Console</span>
          </div>
          <div style={{ padding: 'var(--space-md)', height: '150px', overflowY: 'auto', fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--accent)' }}>
            <div>[System] Initializing orchestrator...</div>
            <div>[Orchestrator] Scanning for pending tasks...</div>
            <div>[Agent: Researcher] Starting web search for "Market trends 2026"...</div>
          </div>
        </section>
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
