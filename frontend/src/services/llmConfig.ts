export type SupportedProvider = 'openai' | 'amd' | 'groq' | 'gemini' | 'local';

export const providerOptions: Array<{
  id: SupportedProvider;
  label: string;
  models: string[];
}> = [
  {
    id: 'groq',
    label: 'Groq',
    models: ['llama-3.3-70b-versatile', 'llama-3.1-70b-versatile', 'mixtral-8x7b-32768']
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
    models: ['gpt-4o']
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
  return (stored && validProviders.includes(stored as SupportedProvider)) ? (stored as SupportedProvider) : 'groq';
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
