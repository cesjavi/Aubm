import React, { useRef, useState } from 'react';
import { CheckCircle2, FileText, Link2, Paperclip, PlusCircle, StickyNote, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '../services/supabase';
import { useAuth } from '../context/useAuth';
import type { UiMode } from '../services/uiMode';

type ProjectSource =
  | {
      id: string;
      kind: 'link';
      label: string;
      url: string;
    }
  | {
      id: string;
      kind: 'note';
      label: string;
      content: string;
    }
  | {
      id: string;
      kind: 'file';
      label: string;
      fileName: string;
      mimeType: string;
      size: number;
      content?: string;
      extracted: boolean;
    };

const supportedTextMimeTypes = new Set([
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
]);

const formatFileSize = (size: number) => {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const buildContextPayload = (baseContext: string, sources: ProjectSource[]) => {
  const sections: string[] = [];

  const trimmedContext = baseContext.trim();
  if (trimmedContext) {
    sections.push(trimmedContext);
  }

  if (sources.length) {
    const sourceLines = sources.flatMap((source, index) => {
      if (source.kind === 'link') {
        return [`${index + 1}. [${source.label}](${source.url})`];
      }

      if (source.kind === 'note') {
        return [
          `${index + 1}. ${source.label}`,
          source.content,
        ];
      }

      const metadata = `${source.fileName} (${source.mimeType || 'unknown'}, ${formatFileSize(source.size)})`;
      if (source.extracted && source.content) {
        return [
          `${index + 1}. ${source.label} - ${metadata}`,
          source.content,
        ];
      }

      return [`${index + 1}. ${source.label} - ${metadata}`];
    });

    sections.push(`Project Sources:\n${sourceLines.join('\n\n')}`);
  }

  return sections.join('\n\n').trim();
};

const NewProject: React.FC<{ uiMode: UiMode; onCreated?: () => void }> = ({ uiMode, onCreated }) => {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [context, setContext] = useState('');
  const [sourceLabel, setSourceLabel] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [noteLabel, setNoteLabel] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [sources, setSources] = useState<ProjectSource[]>([]);
  const [isPublic, setIsPublic] = useState(false);
  const [showAdvancedSources, setShowAdvancedSources] = useState(uiMode === 'expert');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const appendSource = (source: ProjectSource) => {
    setSources((current) => [...current, source]);
  };

  const handleAddLink = () => {
    if (!sourceUrl.trim()) {
      setMessage('Add a valid link before saving it.');
      return;
    }

    appendSource({
      id: crypto.randomUUID(),
      kind: 'link',
      label: sourceLabel.trim() || sourceUrl.trim(),
      url: sourceUrl.trim(),
    });

    setSourceLabel('');
    setSourceUrl('');
    setMessage(null);
  };

  const handleAddNote = () => {
    if (!noteContent.trim()) {
      setMessage('Write some note content before saving it.');
      return;
    }

    appendSource({
      id: crypto.randomUUID(),
      kind: 'note',
      label: noteLabel.trim() || 'Inline note',
      content: noteContent.trim(),
    });

    setNoteLabel('');
    setNoteContent('');
    setMessage(null);
  };

  const handleFileSelection = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    const nextSources: ProjectSource[] = [];

    for (const file of files) {
      const canExtractText =
        supportedTextMimeTypes.has(file.type) ||
        /\.(md|txt|csv|json)$/i.test(file.name);

      let content: string | undefined;
      if (canExtractText) {
        content = (await file.text()).slice(0, 12000);
      }

      nextSources.push({
        id: crypto.randomUUID(),
        kind: 'file',
        label: file.name,
        fileName: file.name,
        mimeType: file.type,
        size: file.size,
        content,
        extracted: Boolean(content),
      });
    }

    if (nextSources.length) {
      setSources((current) => [...current, ...nextSources]);
      setMessage(null);
    }

    event.target.value = '';
  };

  const removeSource = (id: string) => {
    setSources((current) => current.filter((source) => source.id !== id));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) {
      setMessage('You must be signed in to create a project.');
      return;
    }

    setSaving(true);
    setMessage(null);

    const contextPayload = buildContextPayload(context, sources);

    const { error } = await supabase.from('projects').insert({
      name,
      description,
      context: contextPayload,
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
      setSourceLabel('');
      setSourceUrl('');
      setNoteLabel('');
      setNoteContent('');
      setSources([]);
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
          <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>
            {uiMode === 'guided'
              ? 'Describe the goal, add relevant context, and create the workspace.'
              : 'Start a workspace for agents, tasks, context, and reviews.'}
          </p>
        </div>
      </div>

      <form className="glass-panel project-form" onSubmit={handleSubmit}>
        {uiMode === 'guided' && (
          <div className="default-agent-panel">
            <strong>Guided flow</strong>
            <p style={{ color: 'var(--text-dim)' }}>
              1. Name the project. 2. Describe the outcome. 3. Add context and sources. 4. Create the workspace and generate the plan from the project page.
            </p>
          </div>
        )}

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

        <div className="default-agent-panel" style={{ gap: 'var(--space-lg)' }}>
          <div className="settings-section-title">
            <Paperclip size={20} color="var(--accent)" />
            <h3>Project Sources</h3>
          </div>

          {uiMode === 'guided' && !showAdvancedSources && (
            <>
              <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>
                Add the links, notes, or files that should shape the plan. Skip this if the description already contains enough context.
              </p>
              <button className="btn btn-glass" type="button" onClick={() => setShowAdvancedSources(true)}>
                <Paperclip size={16} />
                Add Sources
              </button>
            </>
          )}

          {(uiMode === 'expert' || showAdvancedSources) && (
            <>
          <div className="responsive-two-col">
            <label>
              <span>Link Label</span>
              <input value={sourceLabel} onChange={(event) => setSourceLabel(event.target.value)} placeholder="Market report" />
            </label>
            <label>
              <span>Link URL</span>
              <input value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://..." />
            </label>
          </div>
          <button className="btn btn-glass" type="button" onClick={handleAddLink}>
            <Link2 size={16} />
            Add Link
          </button>

          <label>
            <span>Quick Note</span>
            <input value={noteLabel} onChange={(event) => setNoteLabel(event.target.value)} placeholder="Stakeholder note" />
          </label>
          <label>
            <span>Note Content</span>
            <textarea value={noteContent} onChange={(event) => setNoteContent(event.target.value)} rows={3} placeholder="Paste text, markdown, requirements, or snippets..." />
          </label>
          <button className="btn btn-glass" type="button" onClick={handleAddNote}>
            <StickyNote size={16} />
            Add Text
          </button>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.md,.txt,.doc,.docx,.xls,.xlsx,.csv,.json,.rtf"
            onChange={handleFileSelection}
            style={{ display: 'none' }}
          />
          <button className="btn btn-glass" type="button" onClick={() => fileInputRef.current?.click()}>
            <Paperclip size={16} />
            Add Files
          </button>

          <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', marginTop: '-0.25rem' }}>
            Text and markdown files are embedded into project context. PDF, Word, and Excel files are stored as named references in the context.
          </p>
            </>
          )}

          {sources.length > 0 && (
            <div className="task-list">
              {sources.map((source) => (
                <div key={source.id} className="task-row">
                  <div style={{ flex: 1 }}>
                    <strong>{source.label}</strong>
                    <p>
                      {source.kind === 'link' && source.url}
                      {source.kind === 'note' && source.content}
                      {source.kind === 'file' && `${source.fileName} · ${formatFileSize(source.size)}${source.extracted ? ' · text imported' : ' · reference only'}`}
                    </p>
                  </div>
                  <button className="btn btn-glass btn-sm" type="button" onClick={() => removeSource(source.id)}>
                    <Trash2 size={14} />
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {uiMode === 'expert' && (
          <label className="toggle-row">
            <input type="checkbox" checked={isPublic} onChange={(event) => setIsPublic(event.target.checked)} />
            <span>Make project visible to authenticated users</span>
          </label>
        )}

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
