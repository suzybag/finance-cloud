import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const AUTH_STORAGE_MODE_KEY = "finance_auth_storage_mode";

let cachedClient: SupabaseClient | null = null;

const isBrowser = () => typeof window !== "undefined";

type AuthStorageMode = "local" | "session";

const getAuthStorageModeInternal = (): AuthStorageMode => {
  if (!isBrowser()) return "local";
  const raw = window.localStorage.getItem(AUTH_STORAGE_MODE_KEY);
  return raw === "session" ? "session" : "local";
};

const authStorage = {
  getItem: (key: string) => {
    if (!isBrowser()) return null;
    const storage = getAuthStorageModeInternal() === "session"
      ? window.sessionStorage
      : window.localStorage;
    return storage.getItem(key);
  },
  setItem: (key: string, value: string) => {
    if (!isBrowser()) return;
    const storage = getAuthStorageModeInternal() === "session"
      ? window.sessionStorage
      : window.localStorage;
    storage.setItem(key, value);
  },
  removeItem: (key: string) => {
    if (!isBrowser()) return;
    const storage = getAuthStorageModeInternal() === "session"
      ? window.sessionStorage
      : window.localStorage;
    storage.removeItem(key);
  },
};

export const setAuthStorageMode = (rememberLogin: boolean) => {
  if (!isBrowser()) return;
  window.localStorage.setItem(AUTH_STORAGE_MODE_KEY, rememberLogin ? "local" : "session");
};

export const getAuthStorageMode = (): AuthStorageMode => getAuthStorageModeInternal();

const getClient = () => {
  if (cachedClient) return cachedClient;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase env vars ausentes: NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }
  cachedClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storage: authStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return cachedClient;
};

export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = getClient();
    const value = client[prop as keyof SupabaseClient];
    return typeof value === "function" ? value.bind(client) : value;
  },
}) as SupabaseClient;
