import React, { useMemo, useRef, useState } from 'react';
import { Activity, Mic, MicOff, Volume2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '../services/supabase';

type AppTab = 'dashboard' | 'marketplace' | 'debate' | 'new-project' | 'settings';

interface VoiceControlProps {
  onNavigate: (tab: AppTab) => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognition;

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

const VoiceControl: React.FC<VoiceControlProps> = ({ onNavigate }) => {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [status, setStatus] = useState('Voice assistant ready');
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const recognitionAvailable = useMemo(
    () => Boolean(window.SpeechRecognition || window.webkitSpeechRecognition),
    []
  );

  const speak = (message: string) => {
    setStatus(message);
    if (!window.speechSynthesis) return;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.rate = 0.95;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
  };

  const getSystemSummary = async () => {
    const [{ data: projects }, { data: tasks }] = await Promise.all([
      supabase.from('projects').select('id,status'),
      supabase.from('tasks').select('id,status')
    ]);

    const taskCount = tasks?.length ?? 0;
    const projectCount = projects?.length ?? 0;
    const inProgress = tasks?.filter((task) => task.status === 'in_progress').length ?? 0;
    const awaiting = tasks?.filter((task) => task.status === 'awaiting_approval').length ?? 0;
    const failed = tasks?.filter((task) => task.status === 'failed').length ?? 0;

    return `${projectCount} projects, ${taskCount} tasks, ${inProgress} running, ${awaiting} awaiting approval, and ${failed} failed.`;
  };

  const handleCommand = async (command: string) => {
    const normalized = command.toLowerCase();
    setTranscript(command);

    if (normalized.includes('dashboard') || normalized.includes('panel')) {
      onNavigate('dashboard');
      speak('Opening dashboard.');
      return;
    }

    if (normalized.includes('marketplace') || normalized.includes('market')) {
      onNavigate('marketplace');
      speak('Opening agent marketplace.');
      return;
    }

    if (normalized.includes('debate')) {
      onNavigate('debate');
      speak('Opening multi agent debate.');
      return;
    }

    if (normalized.includes('settings') || normalized.includes('config')) {
      onNavigate('settings');
      speak('Opening settings.');
      return;
    }

    if (normalized.includes('new project') || normalized.includes('nuevo proyecto')) {
      onNavigate('new-project');
      speak('Opening new project.');
      return;
    }

    if (normalized.includes('status') || normalized.includes('estado') || normalized.includes('summary')) {
      try {
        const summary = await getSystemSummary();
        speak(summary);
      } catch {
        speak('I could not read the current project status.');
      }
      return;
    }

    speak('Command not recognized. Try dashboard, marketplace, debate, settings, or status.');
  };

  const startListening = () => {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      speak('Voice recognition is not supported in this browser.');
      return;
    }

    const recognition = new Recognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    recognition.onresult = (event) => {
      const command = event.results[0]?.[0]?.transcript ?? '';
      if (command) void handleCommand(command);
    };
    recognition.onerror = (event) => {
      setListening(false);
      speak(`Voice recognition error: ${event.error}`);
    };
    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
    setListening(true);
    setStatus('Listening...');
    recognition.start();
  };

  const stopListening = () => {
    recognitionRef.current?.stop();
    setListening(false);
    setStatus('Voice assistant paused');
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-panel form-panel form-panel-wide"
    >
      <div className="panel-heading panel-heading-split">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
          <Volume2 size={32} color="var(--accent)" />
          <div>
            <h2 style={{ fontSize: '1.5rem' }}>Voice Control</h2>
            <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>Navigate and request project status by voice.</p>
          </div>
        </div>
        <div style={{ color: recognitionAvailable ? 'var(--success)' : 'var(--warning)', display: 'flex', alignItems: 'center', gap: 'var(--space-xs)', fontSize: '0.85rem' }}>
          <Activity size={16} />
          {recognitionAvailable ? 'Available' : 'Unsupported'}
        </div>
      </div>

      <div style={{ display: 'grid', gap: 'var(--space-md)' }}>
        <div style={{ padding: 'var(--space-md)', background: 'rgba(255,255,255,0.05)', borderRadius: 'var(--radius-md)', border: '1px solid var(--glass-border)' }}>
          <div style={{ color: 'var(--text-dim)', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 700, marginBottom: 'var(--space-xs)' }}>Last command</div>
          <div style={{ minHeight: '1.5rem' }}>{transcript || 'No command captured yet.'}</div>
        </div>

        <div style={{ padding: 'var(--space-md)', background: 'rgba(255,255,255,0.05)', borderRadius: 'var(--radius-md)', border: '1px solid var(--glass-border)' }}>
          <div style={{ color: 'var(--text-dim)', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 700, marginBottom: 'var(--space-xs)' }}>Assistant</div>
          <div>{status}</div>
        </div>

        <div className="button-row">
          <button className="btn btn-primary" onClick={listening ? stopListening : startListening}>
            {listening ? <MicOff size={18} /> : <Mic size={18} />}
            {listening ? 'Stop Listening' : 'Start Listening'}
          </button>
          <button className="btn btn-glass" onClick={() => void handleCommand('status')}>
            <Volume2 size={18} />
            Read Status
          </button>
        </div>
      </div>
    </motion.div>
  );
};

export default VoiceControl;
