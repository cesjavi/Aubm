export type SupportedProvider = 'openai' | 'amd';

export const providerOptions: Array<{
  id: SupportedProvider;
  label: string;
  models: string[];
}> = [
  {
    id: 'openai',
    label: 'OpenAI',
    models: ['gpt-4o', 'gpt-4o-mini']
  },
  {
    id: 'amd',
    label: 'AMD Inference',
    models: ['gpt-4o']
  }
];

export const providerStorageKeys = {
  provider: 'aubm.defaultProvider',
  model: 'aubm.defaultModel'
};

export const getDefaultProvider = (): SupportedProvider => {
  const stored = localStorage.getItem(providerStorageKeys.provider);
  return stored === 'amd' || stored === 'openai' ? stored : 'openai';
};

export const getDefaultModel = (provider: SupportedProvider): string => {
  const stored = localStorage.getItem(providerStorageKeys.model);
  const providerModels = providerOptions.find((option) => option.id === provider)?.models ?? ['gpt-4o'];
  return stored && providerModels.includes(stored) ? stored : providerModels[0];
};

export const saveProviderDefaults = (provider: SupportedProvider, model: string) => {
  localStorage.setItem(providerStorageKeys.provider, provider);
  localStorage.setItem(providerStorageKeys.model, model);
};
