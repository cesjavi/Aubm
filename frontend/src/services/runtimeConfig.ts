interface RuntimeConfig {
  apiUrl?: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  sentryDsn?: string;
}

declare global {
  interface Window {
    __AUBM_CONFIG__?: RuntimeConfig;
  }
}

const runtimeConfig = window.__AUBM_CONFIG__ ?? {};

export const getApiUrl = () => import.meta.env.VITE_API_URL || runtimeConfig.apiUrl || '';

export const getSupabaseUrl = () => (
  import.meta.env.VITE_SUPABASE_URL || runtimeConfig.supabaseUrl || ''
);

export const getSupabaseAnonKey = () => (
  import.meta.env.VITE_SUPABASE_ANON_KEY || runtimeConfig.supabaseAnonKey || ''
);

export const getSentryDsn = () => (
  import.meta.env.VITE_SENTRY_DSN || runtimeConfig.sentryDsn || ''
);
