import { NextRequest } from "next/server";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const getBearerToken = (req: NextRequest) => {
  const header = req.headers.get("authorization") || "";
  return header.replace("Bearer ", "").trim();
};

export const isCronAuthorized = (req: NextRequest) => {
  const secret = process.env.CRON_SECRET ?? "";
  if (!secret) return true;
  const token = getBearerToken(req);
  return token === secret;
};

export const getTokenClient = (token: string) => {
  if (!supabaseUrl) {
    return { client: null as SupabaseClient | null, error: "NEXT_PUBLIC_SUPABASE_URL nao configurada." };
  }
  if (!token) {
    return { client: null as SupabaseClient | null, error: "Token ausente." };
  }

  const keyToUse = serviceRole || supabaseAnonKey;
  if (!keyToUse) {
    return {
      client: null as SupabaseClient | null,
      error: "SUPABASE_SERVICE_ROLE_KEY ou NEXT_PUBLIC_SUPABASE_ANON_KEY nao configurada.",
    };
  }

  const client = createClient(supabaseUrl, keyToUse, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  return { client, error: null as string | null };
};

export const getAdminClient = () => {
  if (!supabaseUrl || !serviceRole) return null;
  return createClient(supabaseUrl, serviceRole);
};

export const getUserFromRequest = async (req: NextRequest) => {
  const token = getBearerToken(req);
  const { client, error } = getTokenClient(token);
  if (!client || error) {
    return { user: null as User | null, client: null as SupabaseClient | null, error };
  }

  const { data, error: userError } = await client.auth.getUser(token);
  if (userError || !data.user) {
    return { user: null as User | null, client: null as SupabaseClient | null, error: "Token invalido." };
  }

  return { user: data.user, client, error: null as string | null };
};
