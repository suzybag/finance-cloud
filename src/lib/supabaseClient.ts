import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getStorageItem, removeStorageItem, setStorageItem } from "./safeStorage";

const sanitizePublicEnv = (value?: string) =>
  String(value || "")
    .replace(/\\n/g, "")
    .replace(/[\r\n]+/g, "")
    .trim();

const supabaseUrl = sanitizePublicEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseAnonKey = sanitizePublicEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const AUTH_STORAGE_MODE_KEY = "finance_auth_storage_mode";

let cachedClient: SupabaseClient | null = null;

const isBrowser = () => typeof window !== "undefined";

type AuthStorageMode = "local" | "session";

const getAuthStorageModeInternal = (): AuthStorageMode => {
  if (!isBrowser()) return "local";
  const raw = getStorageItem(AUTH_STORAGE_MODE_KEY, "local");
  return raw === "session" ? "session" : "local";
};

const getAuthStorageKind = () => (getAuthStorageModeInternal() === "session" ? "session" : "local");

const authStorage = {
  getItem: (key: string) => {
    if (!isBrowser()) return null;
    return getStorageItem(key, getAuthStorageKind());
  },
  setItem: (key: string, value: string) => {
    if (!isBrowser()) return;
    setStorageItem(key, value, getAuthStorageKind());
  },
  removeItem: (key: string) => {
    if (!isBrowser()) return;
    removeStorageItem(key, getAuthStorageKind());
  },
};

export const setAuthStorageMode = (rememberLogin: boolean) => {
  if (!isBrowser()) return;
  setStorageItem(AUTH_STORAGE_MODE_KEY, rememberLogin ? "local" : "session", "local");
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
