import React from 'react';
import { motion } from 'framer-motion';
import { Compass, Zap, CheckCircle2 } from 'lucide-react';
import type { UiMode } from '../services/uiMode';

interface ModeSelectionProps {
  onSelect: (mode: UiMode) => void;
}

const ModeSelection: React.FC<ModeSelectionProps> = ({ onSelect }) => {
  return (
    <div className="mode-selection-overlay" style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'var(--bg-dark)',
      zIndex: 2000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 'var(--space-md)'
    }}>
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-panel"
        style={{
          maxWidth: '800px',
          width: '100%',
          padding: 'var(--space-xl)',
          textAlign: 'center',
          border: '1px solid var(--glass-border)',
          background: 'var(--glass-bg)'
        }}
      >
        <h2 style={{ fontSize: '2rem', marginBottom: 'var(--space-xs)', background: 'linear-gradient(135deg, #fff 0%, var(--accent) 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          Choose your Experience
        </h2>
        <p style={{ color: 'var(--text-dim)', marginBottom: 'var(--space-xl)' }}>
          Select how you want to interact with the Aubm Agent Orchestration Engine.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-lg)' }}>
          {/* Guided Mode */}
          <motion.div 
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onSelect('guided')}
            style={{
              padding: 'var(--space-lg)',
              borderRadius: 'var(--radius-lg)',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid var(--glass-border)',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'all 0.3s ease'
            }}
            className="mode-card hover-glow"
          >
            <div style={{ marginBottom: 'var(--space-md)', color: 'var(--success)' }}>
              <Compass size={40} />
            </div>
            <h3 style={{ fontSize: '1.25rem', marginBottom: 'var(--space-sm)' }}>Guided Mode</h3>
            <ul style={{ listStyle: 'none', padding: 0, fontSize: '0.9rem', color: 'var(--text-dim)' }}>
              <li style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)', marginBottom: 'var(--space-xs)' }}>
                <CheckCircle2 size={14} color="var(--success)" /> Simplified interface
              </li>
              <li style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)', marginBottom: 'var(--space-xs)' }}>
                <CheckCircle2 size={14} color="var(--success)" /> Focus on results
              </li>
              <li style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }}>
                <CheckCircle2 size={14} color="var(--success)" /> Automatic agent handling
              </li>
            </ul>
          </motion.div>

          {/* Expert Mode */}
          <motion.div 
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onSelect('expert')}
            style={{
              padding: 'var(--space-lg)',
              borderRadius: 'var(--radius-lg)',
              background: 'rgba(var(--accent-rgb), 0.05)',
              border: '1px solid var(--accent)',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'all 0.3s ease'
            }}
            className="mode-card hover-glow"
          >
            <div style={{ marginBottom: 'var(--space-md)', color: 'var(--accent)' }}>
              <Zap size={40} />
            </div>
            <h3 style={{ fontSize: '1.25rem', marginBottom: 'var(--space-sm)' }}>Expert Mode</h3>
            <ul style={{ listStyle: 'none', padding: 0, fontSize: '0.9rem', color: 'var(--text-dim)' }}>
              <li style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)', marginBottom: 'var(--space-xs)' }}>
                <CheckCircle2 size={14} color="var(--accent)" /> Full orchestration control
              </li>
              <li style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)', marginBottom: 'var(--space-xs)' }}>
                <CheckCircle2 size={14} color="var(--accent)" /> Detailed agent console
              </li>
              <li style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }}>
                <CheckCircle2 size={14} color="var(--accent)" /> Multi-agent debates
              </li>
            </ul>
          </motion.div>
        </div>

        <p style={{ marginTop: 'var(--space-xl)', fontSize: '0.8rem', color: 'var(--text-dim)' }}>
          You can change this anytime in the Settings menu.
        </p>
      </motion.div>
    </div>
  );
};

export default ModeSelection;
