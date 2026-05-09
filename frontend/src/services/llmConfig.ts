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
      'qwen/qwen3-32b'
    ]
  },
  {
    id: 'openai',
    label: 'OpenAI',
    models: ['qwen3-coder-flash']
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    models: ['gemini-2.0-flash', 'gemini-1.5-pro']
  },
  {
    id: 'amd',
    label: 'AMD Inference',
    models: [
      'qwen3-coder-flash'
    ]
  },
  {
    id: 'local',
    label: 'Local (Ollama)',
    models: ['qwen2.5']
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
  const providerModels = providerOptions.find((option) => option.id === provider)?.models ?? ['qwen3-coder-flash'];
  if (stored && !providerModels.includes(stored)) {
    localStorage.setItem(providerStorageKeys.model, providerModels[0]);
    return providerModels[0];
  }
  return stored ?? providerModels[0];
};

export const saveProviderDefaults = (provider: SupportedProvider, model: string) => {
  localStorage.setItem(providerStorageKeys.provider, provider);
  localStorage.setItem(providerStorageKeys.model, model);
};
