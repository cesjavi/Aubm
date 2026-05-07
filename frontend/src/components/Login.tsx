import React, { useState } from 'react';
import { supabase } from '../services/supabase';
import { LogIn, Mail, Lock, Bot, Globe, GitBranch } from 'lucide-react';
import { motion } from 'framer-motion';

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    setLoading(false);
  };

  return (
    <div className="login-screen">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="glass-panel login-panel"
      >
        <div style={{ marginBottom: 'var(--space-lg)' }}>
          <Bot size={48} color="var(--accent)" style={{ marginBottom: 'var(--space-md)' }} />
          <h1 style={{ fontSize: '2rem', marginBottom: 'var(--space-xs)' }}>Welcome Back</h1>
          <p style={{ color: 'var(--text-dim)' }}>Access the Aubm Orchestrator</p>
        </div>

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
          <div style={{ position: 'relative' }}>
            <Mail size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input 
              type="email" 
              placeholder="Email Address" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{ 
                width: '100%', 
                padding: '0.8rem 1rem 0.8rem 2.5rem', 
                background: 'rgba(255,255,255,0.05)', 
                border: '1px solid var(--glass-border)', 
                borderRadius: 'var(--radius-md)',
                color: 'white',
                outline: 'none'
              }}
            />
          </div>

          <div style={{ position: 'relative' }}>
            <Lock size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input 
              type="password" 
              placeholder="Password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{ 
                width: '100%', 
                padding: '0.8rem 1rem 0.8rem 2.5rem', 
                background: 'rgba(255,255,255,0.05)', 
                border: '1px solid var(--glass-border)', 
                borderRadius: 'var(--radius-md)',
                color: 'white',
                outline: 'none'
              }}
            />
          </div>

          {error && <div style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>{error}</div>}

          <button 
            type="submit" 
            className="btn btn-primary" 
            disabled={loading}
            style={{ padding: '0.8rem', marginTop: 'var(--space-sm)' }}
          >
            {loading ? 'Authenticating...' : (
              <>
                <LogIn size={18} />
                Sign In
              </>
            )}
          </button>
        </form>

        {/* Social Login - Hidden for now but code preserved 
        <div style={{ margin: 'var(--space-lg) 0', display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
          <div style={{ flex: 1, height: '1px', background: 'var(--glass-border)' }}></div>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>OR CONTINUE WITH</span>
          <div style={{ flex: 1, height: '1px', background: 'var(--glass-border)' }}></div>
        </div>

        <div className="auth-provider-grid">
          <button className="btn btn-glass" onClick={() => (window as any).handleSSOLogin?.('google')}>
            <Globe size={18} />
            Google
          </button>
          <button className="btn btn-glass" onClick={() => (window as any).handleSSOLogin?.('github')}>
            <GitBranch size={18} />
            GitHub
          </button>
        </div>
        */}

        <div style={{ marginTop: 'var(--space-lg)', fontSize: '0.85rem', color: 'var(--text-dim)' }}>
          Enterprise authentication enabled.
        </div>
      </motion.div>
    </div>
  );
};

export default Login;
