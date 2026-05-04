import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { Save, CheckCircle, XCircle, ThumbsUp, ThumbsDown } from 'lucide-react';
import { motion } from 'framer-motion';

interface TaskEditorProps {
  taskId: string;
  onClose: () => void;
}

const TaskEditor: React.FC<TaskEditorProps> = ({ taskId, onClose }) => {
  const [task, setTask] = useState<any>(null);
  const [editedOutput, setEditedOutput] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchTask = async () => {
      const { data } = await supabase
        .from('tasks')
        .select('*')
        .eq('id', taskId)
        .single();
      
      if (data) {
        setTask(data);
        setEditedOutput(JSON.stringify(data.output_data, null, 2));
      }
    };
    fetchTask();
  }, [taskId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const parsed = JSON.parse(editedOutput);
      await supabase
        .from('tasks')
        .update({ output_data: parsed })
        .eq('id', taskId);
      alert('Task updated successfully!');
    } catch (e) {
      alert('Invalid JSON format');
    }
    setSaving(false);
  };

  const handleFeedback = async (rating: number) => {
    await supabase.from('task_feedback').upsert({
      task_id: taskId,
      rating: rating
    });
    alert(rating === 1 ? 'Glad you liked it!' : 'Feedback recorded. We will use this to improve.');
  };

  const handleApprove = async () => {
    await supabase.from('tasks').update({ status: 'done' }).eq('id', taskId);
    onClose();
  };

  if (!task) return null;

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{ 
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
        background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)',
        zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem'
      }}
    >
      <motion.div 
        initial={{ y: 50 }}
        animate={{ y: 0 }}
        className="glass-panel task-editor-panel"
        style={{ width: '100%', maxWidth: '800px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
      >
        <div style={{ padding: 'var(--space-lg)', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: '1.5rem' }}>{task.title}</h2>
            <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>Review and refine agent output</p>
          </div>
          <button onClick={onClose}><XCircle size={24} color="var(--text-muted)" /></button>
        </div>

        <div style={{ flex: 1, padding: 'var(--space-lg)', overflowY: 'auto' }}>
          <label style={{ display: 'block', marginBottom: 'var(--space-sm)', fontWeight: 600 }}>Raw Output (JSON)</label>
          <textarea
            className="task-editor-textarea"
            value={editedOutput}
            onChange={(e) => setEditedOutput(e.target.value)}
            style={{ 
              width: '100%', height: '400px', background: 'rgba(0,0,0,0.3)', 
              color: 'var(--accent)', fontFamily: 'monospace', padding: '1rem',
              border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-md)',
              outline: 'none', resize: 'none'
            }}
          />
        </div>

        <div style={{ padding: 'var(--space-lg)', borderTop: '1px solid var(--glass-border)', display: 'flex', gap: 'var(--space-md)', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
            <button className="btn btn-glass" style={{ padding: '0.5rem' }} onClick={() => handleFeedback(1)}>
              <ThumbsUp size={18} color="var(--success)" />
            </button>
            <button className="btn btn-glass" style={{ padding: '0.5rem' }} onClick={() => handleFeedback(-1)}>
              <ThumbsDown size={18} color="var(--danger)" />
            </button>
          </div>

          <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
            <button className="btn btn-glass" onClick={handleSave} disabled={saving}>
              <Save size={18} />
              {saving ? 'Saving...' : 'Save Draft'}
            </button>
            <button className="btn btn-primary" onClick={handleApprove}>
              <CheckCircle size={18} />
              Approve & Finalize
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default TaskEditor;
