interface RuntimeConfig {
  apiUrl?: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  sentryDsn?: string;
  appVersion?: string;
}

declare global {
  interface Window {
    __AUBM_CONFIG__?: RuntimeConfig;
  }
}

const runtimeConfig = window.__AUBM_CONFIG__ ?? {};

const isLocalHost = (hostname: string) => hostname === 'localhost' || hostname === '127.0.0.1';
const isFrontendDevServer = () => isLocalHost(window.location.hostname) && ['5173', '3000'].includes(window.location.port);

const normalizeApiUrl = (value?: string) => {
  const rawValue = value?.trim();
  if (!rawValue) return isFrontendDevServer() ? 'http://127.0.0.1:8000/api' : '/api';

  const withoutTrailingSlash = rawValue.replace(/\/+$/, '');
  return withoutTrailingSlash.endsWith('/api') ? withoutTrailingSlash : `${withoutTrailingSlash}/api`;
};

export const getApiUrl = () => normalizeApiUrl(import.meta.env.VITE_API_URL || runtimeConfig.apiUrl);

export const getApiUrlCandidates = () => {
  const primary = getApiUrl();
  const candidates = [primary];

  if (isLocalHost(window.location.hostname)) {
    for (const fallback of ['http://127.0.0.1:8000/api', 'http://localhost:8000/api']) {
      if (!candidates.includes(fallback)) candidates.push(fallback);
    }
  }

  return candidates;
};

export const getSupabaseUrl = () => (
  import.meta.env.VITE_SUPABASE_URL || runtimeConfig.supabaseUrl || ''
);

export const getSupabaseAnonKey = () => (
  import.meta.env.VITE_SUPABASE_ANON_KEY || runtimeConfig.supabaseAnonKey || ''
);

export const getSentryDsn = () => (
  import.meta.env.VITE_SENTRY_DSN || runtimeConfig.sentryDsn || ''
);

export const getAppVersion = () => runtimeConfig.appVersion || import.meta.env.VITE_APP_VERSION || '0.7.0';
