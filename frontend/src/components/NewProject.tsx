import React, { useState } from 'react';
import { CheckCircle2, FileText, PlusCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '../services/supabase';
import { useAuth } from '../context/useAuth';

const NewProject: React.FC<{ onCreated?: () => void }> = ({ onCreated }) => {
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [context, setContext] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) {
      setMessage('You must be signed in to create a project.');
      return;
    }

    setSaving(true);
    setMessage(null);

    const { error } = await supabase.from('projects').insert({
      name,
      description,
      context,
      owner_id: user.id,
      is_public: isPublic,
      status: 'active'
    });

    if (error) {
      setMessage(error.message);
    } else {
      setName('');
      setDescription('');
      setContext('');
      setIsPublic(false);
      setMessage('Project created successfully.');
      window.setTimeout(() => onCreated?.(), 500);
    }

    setSaving(false);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="form-panel form-panel-wide">
      <div className="panel-heading">
        <PlusCircle size={32} color="var(--accent)" />
        <div>
          <h2>Create Project</h2>
          <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>Start a workspace for agents, tasks, context, and reviews.</p>
        </div>
      </div>

      <form className="glass-panel project-form" onSubmit={handleSubmit}>
        <label>
          <span>Project Name</span>
          <input value={name} onChange={(event) => setName(event.target.value)} required placeholder="Customer onboarding automation" />
        </label>

        <label>
          <span>Description</span>
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What should this project accomplish?" rows={4} />
        </label>

        <label>
          <span>Context</span>
          <textarea value={context} onChange={(event) => setContext(event.target.value)} placeholder="Business constraints, preferred tone, source links, acceptance criteria..." rows={6} />
        </label>

        <label className="toggle-row">
          <input type="checkbox" checked={isPublic} onChange={(event) => setIsPublic(event.target.checked)} />
          <span>Make project visible to authenticated users</span>
        </label>

        {message && (
          <div className="inline-status">
            {message.includes('success') ? <CheckCircle2 size={16} color="var(--success)" /> : <FileText size={16} color="var(--warning)" />}
            <span>{message}</span>
          </div>
        )}

        <button className="btn btn-primary" type="submit" disabled={saving}>
          <PlusCircle size={18} />
          {saving ? 'Creating...' : 'Create Project'}
        </button>
      </form>
    </motion.div>
  );
};

export default NewProject;
