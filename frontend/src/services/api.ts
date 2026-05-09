import { getApiUrlCandidates } from './runtimeConfig';
import { supabase } from './supabase';

export const getAuthToken = async () => {
  const { data: sessionData } = await supabase.auth.getSession();
  return sessionData.session?.access_token;
};

export const fetchBackend = async <T,>(path: string, init?: RequestInit): Promise<T> => {
  const token = await getAuthToken();
  const headers = new Headers(init?.headers);
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let lastError: Error | null = null;
  const candidates = getApiUrlCandidates();

  for (const apiUrl of candidates) {
    try {
      const response = await fetch(`${apiUrl}${path}`, {
        ...init,
        headers
      });

      if (!response.ok) {
        const contentType = response.headers.get('content-type') || '';
        let detail = `Error ${response.status}`;
        
        if (contentType.includes('application/json')) {
          const body = await response.json();
          detail = body.detail || body.message || detail;
        } else {
          const text = await response.text();
          if (text.trim().toLowerCase().startsWith('<!doctype')) {
            detail = 'Backend returned HTML (possibly SPA fallback). Check API URL.';
          } else {
            detail = text || detail;
          }
        }
        throw new Error(detail);
      }

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        return await response.json() as T;
      }
      return await response.text() as unknown as T;
    } catch (err) {
      lastError = err as Error;
      if (candidates.length > 1) {
        console.warn(`API candidate ${apiUrl} failed, trying next...`, err);
        continue;
      }
      break;
    }
  }

  throw lastError || new Error('All API candidates failed');
};

export const fetchBackendBlob = async (path: string, init?: RequestInit): Promise<Blob> => {
  const token = await getAuthToken();
  const headers = new Headers(init?.headers);
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let lastError: Error | null = null;
  const candidates = getApiUrlCandidates();

  for (const apiUrl of candidates) {
    try {
      const response = await fetch(`${apiUrl}${path}`, {
        ...init,
        headers
      });

      if (!response.ok) {
        const contentType = response.headers.get('content-type') || '';
        let detail = `Error ${response.status}`;
        
        if (contentType.includes('application/json')) {
          const body = await response.json();
          detail = body.detail || body.message || detail;
        } else {
          const text = await response.text();
          if (text.trim().toLowerCase().startsWith('<!doctype')) {
            detail = 'Backend returned HTML. Check API URL.';
          } else {
            detail = text || detail;
          }
        }
        throw new Error(detail);
      }

      return await response.blob();
    } catch (err) {
      lastError = err as Error;
      if (candidates.length > 1) {
        console.warn(`API candidate ${apiUrl} failed for blob, trying next...`, err);
        continue;
      }
      break;
    }
  }

  throw lastError || new Error('All API candidates failed for blob');
};
