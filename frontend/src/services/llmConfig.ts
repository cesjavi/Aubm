export type SupportedProvider = 'openai' | 'amd' | 'groq' | 'gemini' | 'local';

export const providerOptions: Array<{
  id: SupportedProvider;
  label: string;
  models: string[];
}> = [
  {
    id: 'groq',
    label: 'Groq',
    models: [
      'llama-3.3-70b-versatile', 
      'llama-3.1-8b-instant', 
      'openai/gpt-oss-120b',
      'openai/gpt-oss-20b',
      'openai/gpt-oss-safeguard-20b',
      'meta-llama/llama-4-scout-17b-16e-instruct',
      'qwen/qwen3-32b',
      'groq/compound',
      'groq/compound-mini',
      'allam-2-7b',
      'meta-llama/llama-prompt-guard-2-22m',
      'meta-llama/llama-prompt-guard-2-86m',
      'canopylabs/orpheus-arabic-saudi',
      'canopylabs/orpheus-v1-english',
      'mixtral-8x7b-32768'
    ]
  },
  {
    id: 'openai',
    label: 'OpenAI',
    models: ['gpt-4o', 'gpt-4o-mini']
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    models: ['gemini-2.0-flash', 'gemini-1.5-pro']
  },
  {
    id: 'amd',
    label: 'AMD Inference',
    models: ['llama-3.3-70b-instruct']
  },
  {
    id: 'local',
    label: 'Local (Ollama)',
    models: ['llama3.1:8b', 'mistral', 'qwen2.5']
  }
];

export const providerStorageKeys = {
  provider: 'aubm.defaultProvider',
  model: 'aubm.defaultModel'
};

export const getDefaultProvider = (): SupportedProvider => {
  const stored = localStorage.getItem(providerStorageKeys.provider);
  const validProviders: SupportedProvider[] = ['openai', 'amd', 'groq', 'gemini', 'local'];
  return (stored && validProviders.includes(stored as SupportedProvider)) ? (stored as SupportedProvider) : 'amd';
};

export const getDefaultModel = (provider: SupportedProvider): string => {
  const stored = localStorage.getItem(providerStorageKeys.model);
  const providerModels = providerOptions.find((option) => option.id === provider)?.models ?? ['llama-3.3-70b-versatile'];
  return stored && providerModels.includes(stored) ? stored : providerModels[0];
};

export const saveProviderDefaults = (provider: SupportedProvider, model: string) => {
  localStorage.setItem(providerStorageKeys.provider, provider);
  localStorage.setItem(providerStorageKeys.model, model);
};
