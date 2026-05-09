import React, { useState } from 'react';
import { supabase } from '../services/supabase';
import { LogIn, Mail, Lock, UserPlus, ArrowLeft, RefreshCw, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import AubixIcon from './AubixIcon';

const Login: React.FC = () => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    setLoading(false);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        }
      }
    });

    if (error) {
      setError(error.message);
    } else {
      setSuccess('Account created! You can now sign in.');
      setIsSignUp(false);
      setFullName('');
    }
    setLoading(false);
  };

  return (
    <div className="login-screen" style={{ 
      minHeight: '100vh', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      background: 'radial-gradient(circle at center, #1a1a2e 0%, #0d0d14 100%)',
      padding: 'var(--space-md)'
    }}>
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-panel login-panel"
        style={{ width: '100%', maxWidth: '440px', padding: 'var(--space-xl)', textAlign: 'center' }}
      >
        <div style={{ marginBottom: 'var(--space-xl)' }}>
          <AubixIcon size={120} />
          <h1 style={{ fontSize: '2.5rem', marginBottom: 'var(--space-xs)', fontWeight: 800 }}>
            {isSignUp ? 'Join Aubm' : 'Welcome'}
          </h1>
          <p style={{ color: 'var(--text-dim)' }}>
            {isSignUp ? 'Create your agent operator profile' : 'Access the Aubm Orchestrator'}
          </p>
        </div>

        {success && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            style={{ padding: 'var(--space-md)', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid var(--success)', borderRadius: 'var(--radius-md)', color: 'var(--success)', marginBottom: 'var(--space-md)', display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}
          >
            <CheckCircle2 size={18} />
            {success}
          </motion.div>
        )}

        <form onSubmit={isSignUp ? handleSignUp : handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
          <AnimatePresence mode="wait">
            {isSignUp && (
              <motion.div 
                key="signup-fields"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                style={{ overflow: 'hidden' }}
              >
                <div style={{ position: 'relative', marginBottom: 'var(--space-md)' }}>
                  <UserPlus size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input 
                    type="text" 
                    placeholder="Full Name" 
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required={isSignUp}
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
              </motion.div>
            )}
          </AnimatePresence>

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
            style={{ padding: '0.85rem', marginTop: 'var(--space-sm)' }}
          >
            {loading ? <RefreshCw className="spin" size={18} /> : (isSignUp ? <UserPlus size={18} /> : <LogIn size={18} />)}
            {loading ? (isSignUp ? 'Creating...' : 'Authenticating...') : (isSignUp ? 'Create Account' : 'Sign In')}
          </button>
        </form>

        <div style={{ marginTop: 'var(--space-xl)', paddingTop: 'var(--space-lg)', borderTop: '1px solid var(--glass-border)' }}>
          <button 
            type="button" 
            className="btn btn-glass" 
            onClick={() => {
              setIsSignUp(!isSignUp);
              setError(null);
              setSuccess(null);
            }}
            style={{ width: '100%' }}
          >
            {isSignUp ? <ArrowLeft size={18} /> : <UserPlus size={18} />}
            {isSignUp ? 'Back to Sign In' : 'Need an account? Sign Up'}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default Login;
