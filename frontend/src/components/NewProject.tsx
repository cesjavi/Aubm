import React, { useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, FileText, Link2, Paperclip, PlusCircle, StickyNote, Trash2 } from 'lucide-react';
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

const FieldHelp: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <aside className="field-help">
    <strong>{title}</strong>
    <p>{children}</p>
  </aside>
);

const wizardSteps = [
  {
    title: 'Basics',
    description: 'Name the workspace and describe the business outcome. Agents use this to understand what success looks like.'
  },
  {
    title: 'Context',
    description: 'Add constraints, acceptance criteria, tone, risks, and assumptions. Good context reduces generic task plans.'
  },
  {
    title: 'Sources',
    description: 'Attach links, notes, or files that should influence planning. This step is optional when the description is enough.'
  },
  {
    title: 'Review',
    description: 'Check the setup before creating the project. You will generate tasks from the project page after creation.'
  }
];

const expertAccessStep = {
  title: 'Access',
  description: 'Decide whether this project should stay private or be visible to authenticated users in the workspace.'
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
  const [wizardStep, setWizardStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const isWizard = true;
  const projectWizardSteps = uiMode === 'expert'
    ? [wizardSteps[0], wizardSteps[1], wizardSteps[2], expertAccessStep, wizardSteps[3]]
    : wizardSteps;
  const reviewStepIndex = projectWizardSteps.length - 1;
  const accessStepIndex = uiMode === 'expert' ? 3 : -1;
  const currentWizardStep = projectWizardSteps[wizardStep] ?? projectWizardSteps[0];
  const isFirstWizardStep = wizardStep === 0;
  const isLastWizardStep = wizardStep === reviewStepIndex;

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
      setWizardStep(0);
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
        {isWizard && (
          <div className="wizard-panel">
            <div className="wizard-steps" aria-label="Create project steps">
              {projectWizardSteps.map((step, index) => (
                <button
                  key={step.title}
                  className={`wizard-step ${wizardStep === index ? 'active' : ''} ${wizardStep > index ? 'complete' : ''}`}
                  type="button"
                  onClick={() => setWizardStep(index)}
                >
                  <span>{index + 1}</span>
                  {step.title}
                </button>
              ))}
            </div>
            <div className="wizard-explanation">
              <strong>{currentWizardStep.title}</strong>
              <p>{currentWizardStep.description}</p>
            </div>
          </div>
        )}

        {(!isWizard || wizardStep === 0) && (
        <>
        <div className="field-with-help">
          <label>
            <span>Project Name</span>
            <input value={name} onChange={(event) => setName(event.target.value)} required placeholder="Customer onboarding automation" />
          </label>
          <FieldHelp title="What this controls">
            This becomes the workspace title shown on the dashboard, task pages, reports, and spatial view. Use a short outcome-oriented name.
          </FieldHelp>
        </div>

        <div className="field-with-help">
          <label>
            <span>Description</span>
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What should this project accomplish?" rows={4} />
          </label>
          <FieldHelp title="How agents use it">
            The planner reads this as the main objective when decomposing work. Include the desired result, audience, and success criteria.
          </FieldHelp>
        </div>
        </>
        )}

        {(!isWizard || wizardStep === 1) && (
        <div className="field-with-help">
          <label>
            <span>Context</span>
            <textarea value={context} onChange={(event) => setContext(event.target.value)} placeholder="Business constraints, preferred tone, source links, acceptance criteria..." rows={6} />
          </label>
          <FieldHelp title="When to add context">
            Add constraints, assumptions, tone, links, examples, acceptance criteria, and known risks. This reduces generic agent output.
          </FieldHelp>
        </div>
        )}

        {(!isWizard || wizardStep === 2) && (
        <div className="default-agent-panel project-sources-panel" style={{ gap: 'var(--space-lg)' }}>
          <div className="settings-section-title">
            <Paperclip size={20} color="var(--accent)" />
            <h3>Project Sources</h3>
          </div>
          <div className="field-with-help field-with-help-compact">
            <div>
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
            </div>
            <FieldHelp title="What sources do">
              Sources are appended to the project context before agents plan work. Use links for references, notes for stakeholder input, and files for specs or datasets.
            </FieldHelp>
          </div>

          {sources.length > 0 && (
            <div className="task-list">
              {sources.map((source) => (
                <div key={source.id} className="task-row">
                  <div style={{ flex: 1 }}>
                    <strong>{source.label}</strong>
                    <p>
                      {source.kind === 'link' && source.url}
                      {source.kind === 'note' && source.content}
                      {source.kind === 'file' && `${source.fileName} - ${formatFileSize(source.size)}${source.extracted ? ' - text imported' : ' - reference only'}`}
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
        )}

        {uiMode === 'expert' && (!isWizard || wizardStep === accessStepIndex) && (
          <div className="field-with-help">
            <label className="toggle-row">
              <input type="checkbox" checked={isPublic} onChange={(event) => setIsPublic(event.target.checked)} />
              <span>Make project visible to authenticated users</span>
            </label>
            <FieldHelp title="Visibility">
              Public projects can be read by authenticated users in this workspace. Keep private work, client data, or regulated material off this setting.
            </FieldHelp>
          </div>
        )}

        {isWizard && wizardStep === reviewStepIndex && (
          <div className="wizard-review">
            <div>
              <span>Project name</span>
              <strong>{name.trim() || 'Missing project name'}</strong>
            </div>
            <div>
              <span>Description</span>
              <p>{description.trim() || 'No description provided.'}</p>
            </div>
            <div>
              <span>Context</span>
              <p>{context.trim() || 'No extra context provided.'}</p>
            </div>
            <div>
              <span>Sources</span>
              <p>{sources.length > 0 ? `${sources.length} source${sources.length === 1 ? '' : 's'} attached.` : 'No sources attached.'}</p>
            </div>
          </div>
        )}

        {message && (
          <div className="inline-status">
            {message.includes('success') ? <CheckCircle2 size={16} color="var(--success)" /> : <FileText size={16} color="var(--warning)" />}
            <span>{message}</span>
          </div>
        )}

        <div className="field-with-help field-with-help-action">
          {isWizard ? (
            <div className="wizard-actions">
              <button className="btn btn-glass" type="button" onClick={() => setWizardStep((step) => Math.max(0, step - 1))} disabled={isFirstWizardStep || saving}>
                <ArrowLeft size={18} />
                Back
              </button>
              {!isLastWizardStep ? (
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={() => setWizardStep((step) => Math.min(projectWizardSteps.length - 1, step + 1))}
                  disabled={wizardStep === 0 && !name.trim()}
                >
                  Next
                  <ArrowRight size={18} />
                </button>
              ) : (
                <button className="btn btn-primary" type="submit" disabled={saving || !name.trim()}>
                  <PlusCircle size={18} />
                  {saving ? 'Creating...' : 'Create Project'}
                </button>
              )}
            </div>
          ) : (
            <button className="btn btn-primary" type="submit" disabled={saving}>
              <PlusCircle size={18} />
              {saving ? 'Creating...' : 'Create Project'}
            </button>
          )}
          <FieldHelp title="Next step">
            After creation, open the project and run the orchestrator to generate tasks. Review outputs before approving the final report.
          </FieldHelp>
        </div>
      </form>
    </motion.div>
  );
};

export default NewProject;
