import React, { useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, FileText, Link2, Paperclip, PlusCircle, RefreshCw, StickyNote, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '../services/supabase';
import { useAuth } from '../context/useAuth';
import type { UiMode } from '../services/uiMode';
import { getApiUrl } from '../services/runtimeConfig';

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

export interface GeneratedProjectSource {
  kind?: ProjectSource['kind'];
  label?: string;
  url?: string;
  content?: string;
  fileName?: string;
  mimeType?: string;
  size?: number;
  extracted?: boolean;
}

export interface InitialProjectData {
  name?: string;
  description?: string;
  context?: string;
  sources?: GeneratedProjectSource[];
}

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
  },
  {
    title: 'Magic Generation',
    description: 'Describe your project in natural language and attach reference docs. AI will pre-configure the workspace for you.'
  }
];

const expertAccessStep = {
  title: 'Workspace',
  description: 'Decide whether this project is personal or belongs to a team workspace.'
};

const getErrorMessage = (error: unknown) => error instanceof Error ? error.message : 'Unknown error';

const toProjectSource = (source: GeneratedProjectSource): ProjectSource | null => {
  const label = source.label?.trim() || source.fileName?.trim() || 'Generated source';

  if (source.kind === 'link' && source.url) {
    return {
      id: crypto.randomUUID(),
      kind: 'link',
      label,
      url: source.url
    };
  }

  if (source.kind === 'note' && source.content) {
    return {
      id: crypto.randomUUID(),
      kind: 'note',
      label,
      content: source.content
    };
  }

  if (source.kind === 'file' && source.fileName) {
    return {
      id: crypto.randomUUID(),
      kind: 'file',
      label,
      fileName: source.fileName,
      mimeType: source.mimeType ?? 'application/octet-stream',
      size: source.size ?? 0,
      content: source.content,
      extracted: source.extracted ?? Boolean(source.content)
    };
  }

  return null;
};

const NewProject: React.FC<{ uiMode: UiMode; initialData?: InitialProjectData; onCreated?: () => void }> = ({ uiMode, initialData, onCreated }) => {
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
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [showAdvancedSources, setShowAdvancedSources] = useState(uiMode === 'expert');
  const [wizardStep, setWizardStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [aiPrompt, setAiPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationFiles, setGenerationFiles] = useState<File[]>([]);

  const fetchTeams = React.useCallback(async () => {
    try {
      const { data, error } = await supabase.from('teams').select('id, name');
      if (error) throw error;
      setTeams(data || []);
    } catch (err) {
      console.error('Failed to fetch teams:', err);
    }
  }, []);
  
  React.useEffect(() => {
    if (uiMode === 'expert') {
      fetchTeams();
    }
  }, [fetchTeams, uiMode]);

  // Hydrate from Magic Bar / external data
  React.useEffect(() => {
    if (initialData) {
      if (initialData.name) setName(initialData.name);
      if (initialData.description) setDescription(initialData.description);
      if (initialData.context) setContext(initialData.context);
      if (initialData.sources && Array.isArray(initialData.sources)) {
        const aiSources = initialData.sources
          .map(toProjectSource)
          .filter((source): source is ProjectSource => source !== null);
        setSources(aiSources);
      }
      // If we have initial data, jump to step 0 of the wizard (Basics) 
      // but ensure we are in the wizard view
      setWizardStep(0);
    }
  }, [initialData]);

  const handleAiGenerate = async () => {
    if (!aiPrompt.trim()) return;
    setIsGenerating(true);
    setMessage('AI is analyzing your request and documents...');

    try {
      const formData = new FormData();
      formData.append('prompt', aiPrompt);
      generationFiles.forEach(file => {
        formData.append('files', file);
      });

      const response = await fetch(`${getApiUrl()}/generator/generate-project`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) throw new Error('AI generation failed');
      
      const data = await response.json() as InitialProjectData;
      
      setName(data.name || '');
      setDescription(data.description || '');
      setContext(data.context || '');
      
      if (data.sources && Array.isArray(data.sources)) {
        const aiSources = data.sources
          .map(toProjectSource)
          .filter((source): source is ProjectSource => source !== null);
        setSources(prev => [...prev, ...aiSources]);
      }

      setMessage('Success! AI has drafted your project. Review the fields in the next steps.');
      setWizardStep(1);
    } catch (err: unknown) {
      console.error('AI Generation Error:', err);
      setMessage(`AI Error: ${getErrorMessage(err)}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const isWizard = true;
  const projectWizardSteps = uiMode === 'expert'
    ? [wizardSteps[4], wizardSteps[0], wizardSteps[1], wizardSteps[2], expertAccessStep, wizardSteps[3]]
    : [wizardSteps[4], wizardSteps[0], wizardSteps[1], wizardSteps[2], wizardSteps[3]];
  const reviewStepIndex = projectWizardSteps.length - 1;
  const accessStepIndex = uiMode === 'expert' ? 4 : -1;
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
      team_id: selectedTeamId,
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

        {wizardStep === 0 && (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="wizard-form">
            <div className="form-group">
              <label>What would you like to build?</label>
              <textarea 
                placeholder='e.g., "Make me a security audit project for a Fintech app. Use the attached compliance docs as reference. I need to focus on OWASP Top 10."'
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                style={{ height: '160px', resize: 'none' }}
              />
            </div>
            
            <div className="form-group">
              <label>Reference Documents (Optional)</label>
              <div 
                className="drop-zone"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const dropped = Array.from(e.dataTransfer.files);
                  setGenerationFiles(prev => [...prev, ...dropped]);
                }}
                onClick={() => {
                   const input = document.createElement('input');
                   input.type = 'file';
                   input.multiple = true;
                   input.onchange = (e) => {
                     const selected = Array.from((e.target as HTMLInputElement).files || []);
                     setGenerationFiles(prev => [...prev, ...selected]);
                   };
                   input.click();
                }}
                style={{
                  border: '2px dashed var(--border)',
                  borderRadius: 'var(--radius-md)',
                  padding: 'var(--space-xl)',
                  textAlign: 'center',
                  cursor: 'pointer',
                  background: 'rgba(255,255,255,0.02)'
                }}
              >
                <Paperclip size={24} style={{ marginBottom: '8px', opacity: 0.5 }} />
                <p style={{ margin: 0 }}>Click or drag files to use as AI context</p>
                <span style={{ fontSize: '0.8rem', opacity: 0.6 }}>Supports PDF, Text, Markdown, JSON</span>
              </div>
              
              {generationFiles.length > 0 && (
                <div style={{ marginTop: 'var(--space-md)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {generationFiles.map((f, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.04)', padding: '8px 12px', borderRadius: '4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem' }}>
                        <FileText size={14} />
                        <span>{f.name}</span>
                      </div>
                      <button 
                        className="btn-icon" 
                        onClick={() => setGenerationFiles(prev => prev.filter((_, idx) => idx !== i))}
                        style={{ color: 'var(--danger)' }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ marginTop: 'var(--space-xl)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button className="btn btn-glass" type="button" onClick={() => setWizardStep(1)}>
                Skip to manual setup
              </button>
              <button 
                className="btn btn-primary" 
                type="button"
                onClick={handleAiGenerate}
                disabled={!aiPrompt.trim() || isGenerating}
              >
                {isGenerating ? <RefreshCw className="spin" size={18} /> : <PlusCircle size={18} />}
                {isGenerating ? 'Generating...' : 'Generate Project Structure'}
              </button>
            </div>
          </motion.div>
        )}

        {wizardStep === 1 && (
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

        {wizardStep === 2 && (
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

        {wizardStep === 3 && (
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

        {uiMode === 'expert' && wizardStep === accessStepIndex && (
          <div className="expert-access-fields" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
            <div className="field-with-help">
              <label>
                <span>Team Workspace (Optional)</span>
                <select 
                  className="glass-input" 
                  value={selectedTeamId || ''} 
                  onChange={(e) => setSelectedTeamId(e.target.value || null)}
                >
                  <option value="">Personal Project (No Team)</option>
                  {teams.map(team => (
                    <option key={team.id} value={team.id}>{team.name}</option>
                  ))}
                </select>
              </label>
              <FieldHelp title="Shared Context">
                Projects assigned to a team are visible to all team members according to their roles (admin, editor, viewer).
              </FieldHelp>
            </div>

            <div className="field-with-help">
              <label className="toggle-row">
                <input type="checkbox" checked={isPublic} onChange={(event) => setIsPublic(event.target.checked)} />
                <span>Make project visible to all authenticated users (Public)</span>
              </label>
              <FieldHelp title="Global Visibility">
                Public projects can be read by any authenticated user in the entire platform. Use this for open templates or public datasets.
              </FieldHelp>
            </div>
          </div>
        )}

        {wizardStep === reviewStepIndex && (
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
              <span>Workspace</span>
              <p>{selectedTeamId ? `Team: ${teams.find(t => t.id === selectedTeamId)?.name}` : 'Personal project'}</p>
            </div>
            <div>
              <span>Visibility</span>
              <p>{isPublic ? 'Public' : 'Private'}</p>
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
          <div className="wizard-actions" style={{ display: 'flex', gap: 'var(--space-md)', width: '100%' }}>
            <button 
              className="btn btn-glass" 
              type="button" 
              onClick={() => setWizardStep((step) => Math.max(0, step - 1))} 
              disabled={isFirstWizardStep || saving}
              style={{ flex: 1 }}
            >
              <ArrowLeft size={18} />
              Back
            </button>
            {!isLastWizardStep ? (
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => {
                  if (wizardStep === 1 && !name.trim()) {
                    setMessage('Project name is required');
                    return;
                  }
                  setWizardStep((step) => Math.min(projectWizardSteps.length - 1, step + 1));
                }}
                disabled={saving}
                style={{ flex: 1 }}
              >
                Next
                <ArrowRight size={18} />
              </button>
            ) : (
              <button 
                className="btn btn-primary" 
                type="submit" 
                disabled={saving || !name.trim()}
                style={{ flex: 1 }}
              >
                {saving ? <RefreshCw className="spin" size={18} /> : <PlusCircle size={18} />}
                {saving ? 'Creating...' : 'Create Project'}
              </button>
            )}
          </div>
          <FieldHelp title="Next step">
            After creation, open the project and run the orchestrator to generate tasks. Review outputs before approving the final report.
          </FieldHelp>
        </div>
      </form>
    </motion.div>
  );
};

export default NewProject;
