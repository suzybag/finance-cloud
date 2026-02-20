import { NextRequest } from "next/server";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { getJwtExpirationMs, isJwtExpired } from "@/lib/security/jwt";
import { getClientIp } from "@/lib/security/requestContext";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

const BEARER_PATTERN = /^Bearer\s+(.+)$/i;
const TOKEN_MAX_LENGTH = 8192;

export const getBearerToken = (req: NextRequest) => {
  const header = req.headers.get("authorization") || "";
  const match = header.match(BEARER_PATTERN);
  const token = (match?.[1] || "").trim();
  if (!token || token.length > TOKEN_MAX_LENGTH) return "";
  return token;
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

  // Prioriza ANON para fluxo autenticado por JWT do usuario.
  // Isso evita falha do app quando a service role estiver ausente ou invalida.
  const keyToUse = supabaseAnonKey || serviceRole;
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

export const logSecurityEvent = async ({
  req,
  eventType,
  severity,
  message,
  userId,
  metadata,
}: {
  req: NextRequest;
  eventType: string;
  severity: "info" | "warning" | "critical";
  message: string;
  userId?: string | null;
  metadata?: Record<string, unknown>;
}) => {
  try {
    const admin = getAdminClient();
    if (!admin) return;
    await admin.from("security_events").insert({
      user_id: userId ?? null,
      event_type: eventType,
      severity,
      message,
      ip_address: getClientIp(req),
      user_agent: req.headers.get("user-agent"),
      path: req.nextUrl.pathname,
      metadata: metadata ?? {},
    });
  } catch {
    // best-effort audit logging
  }
};

export const getUserFromRequest = async (req: NextRequest) => {
  const token = getBearerToken(req);
  const tokenExpirationMs = getJwtExpirationMs(token);

  if (token && isJwtExpired(token)) {
    await logSecurityEvent({
      req,
      eventType: "auth_expired_token",
      severity: "warning",
      message: "Token JWT expirado.",
      metadata: { exp: tokenExpirationMs },
    });
    return { user: null as User | null, client: null as SupabaseClient | null, error: "Token expirado." };
  }

  const { client, error } = getTokenClient(token);
  if (!client || error) {
    await logSecurityEvent({
      req,
      eventType: "auth_missing_or_invalid_token",
      severity: "warning",
      message: error || "Token ausente ou invalido no header Authorization.",
      metadata: { exp: tokenExpirationMs },
    });
    return { user: null as User | null, client: null as SupabaseClient | null, error };
  }

  const { data, error: userError } = await client.auth.getUser(token);
  if (userError || !data.user) {
    await logSecurityEvent({
      req,
      eventType: "auth_token_rejected",
      severity: "warning",
      message: userError?.message || "Token rejeitado pelo provedor de autenticacao.",
      metadata: { exp: tokenExpirationMs },
    });
    return { user: null as User | null, client: null as SupabaseClient | null, error: "Token invalido." };
  }

  return { user: data.user, client, error: null as string | null };
};
