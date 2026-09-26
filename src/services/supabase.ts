import { createClient, SupabaseClient } from '@supabase/supabase-js';

export const DEFAULT_QUIZ_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

// Key storage for manual configuration fallback if environment variables are not injected into the client bundle
const STORAGE_SUPABASE_URL = 'tech_test_supabase_url';
const STORAGE_SUPABASE_ANON_KEY = 'tech_test_supabase_anon_key';

let cachedClient: SupabaseClient | null = null;
let cachedConfigKey: string = '';

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  isCustom: boolean;
}

export const getSupabaseConfig = (): SupabaseConfig => {
  // 1. Vite environment variables (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)
  const envUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
  const envAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

  if (envUrl && envAnonKey) {
    return { url: envUrl, anonKey: envAnonKey, isCustom: false };
  }

  // 2. Window config (if provided by server /api/supabase/config)
  if (typeof window !== 'undefined') {
    const winConfig = (window as any).__SUPABASE_CONFIG__;
    if (winConfig?.url && winConfig?.anonKey) {
      return { url: winConfig.url, anonKey: winConfig.anonKey, isCustom: false };
    }

    // 3. User manual override stored in localStorage
    const savedUrl = (localStorage.getItem(STORAGE_SUPABASE_URL) || '').trim();
    const savedAnonKey = (localStorage.getItem(STORAGE_SUPABASE_ANON_KEY) || '').trim();
    if (savedUrl && savedAnonKey) {
      return { url: savedUrl, anonKey: savedAnonKey, isCustom: true };
    }
  }

  return { url: '', anonKey: '', isCustom: false };
};

export const isSupabaseConfigured = (): boolean => {
  const config = getSupabaseConfig();
  return Boolean(config.url && config.anonKey);
};

export const setManualSupabaseConfig = (url: string, anonKey: string) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_SUPABASE_URL, url.trim());
    localStorage.setItem(STORAGE_SUPABASE_ANON_KEY, anonKey.trim());
    cachedClient = null;
    cachedConfigKey = '';
  }
};

export const clearManualSupabaseConfig = () => {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(STORAGE_SUPABASE_URL);
    localStorage.removeItem(STORAGE_SUPABASE_ANON_KEY);
    cachedClient = null;
    cachedConfigKey = '';
  }
};

export const getSupabaseClient = (): SupabaseClient | null => {
  const config = getSupabaseConfig();
  if (!config.url || !config.anonKey) {
    return null;
  }

  const currentKey = `${config.url}::${config.anonKey}`;
  if (cachedClient && cachedConfigKey === currentKey) {
    return cachedClient;
  }

  try {
    cachedClient = createClient(config.url, config.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false
      },
      realtime: {
        params: {
          eventsPerSecond: 15
        }
      }
    });
    cachedConfigKey = currentKey;
    return cachedClient;
  } catch (err) {
    console.error('Failed to initialize Supabase client:', err);
    return null;
  }
};

/**
 * Validates connection to the Supabase database and verifies the required tables exist.
 */
export const testSupabaseConnection = async (): Promise<{
  ok: boolean;
  message: string;
  tablesFound?: boolean;
}> => {
  const client = getSupabaseClient();
  if (!client) {
    return {
      ok: false,
      message: 'Supabase credentials are not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
    };
  }

  try {
    const { data, error } = await client
      .from('quizzes')
      .select('id, name')
      .eq('id', DEFAULT_QUIZ_ID)
      .maybeSingle();

    if (error) {
      if (error.code === '42P01') {
        // relation does not exist
        return {
          ok: false,
          tablesFound: false,
          message:
            'Supabase connected, but tables were not found! Please run the SQL schema in supabase_schema.sql via Supabase SQL Editor.'
        };
      }
      return { ok: false, message: `Database query failed: ${error.message} (${error.code || ''})` };
    }

    return {
      ok: true,
      tablesFound: true,
      message: data ? 'Connected to Supabase and verified quiz tables successfully.' : 'Connected to Supabase. Quiz table is ready.'
    };
  } catch (err: any) {
    return {
      ok: false,
      message: `Connection error: ${err.message || 'Unknown network error'}`
    };
  }
};
