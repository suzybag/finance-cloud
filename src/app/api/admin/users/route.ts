import { NextRequest, NextResponse } from "next/server";
import { getAdminClient, getUserFromRequest } from "@/lib/apiAuth";

type ProfileLike = Record<string, unknown> | null;

const CEO_ROLE_VALUES = new Set(["ceo", "owner", "dono", "fundador", "chief executive officer"]);

const parseCsv = (value: string | undefined) =>
  (value || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

const coerceString = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const pickRoleCandidates = (profile: ProfileLike, user: { app_metadata?: unknown; user_metadata?: unknown }) => {
  const appMetadata = (user.app_metadata || {}) as Record<string, unknown>;
  const userMetadata = (user.user_metadata || {}) as Record<string, unknown>;

  return [
    coerceString(profile?.role),
    coerceString(profile?.cargo),
    coerceString(profile?.access_level),
    coerceString(profile?.user_role),
    coerceString(appMetadata.role),
    coerceString(appMetadata.cargo),
    coerceString(userMetadata.role),
    coerceString(userMetadata.cargo),
  ]
    .map((value) => value.toLowerCase())
    .filter(Boolean);
};

const pickName = (row: {
  email?: string | null;
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
}) => {
  const fromUser = coerceString(row.user_metadata?.display_name || row.user_metadata?.full_name || row.user_metadata?.name);
  if (fromUser) return fromUser;

  const fromApp = coerceString(row.app_metadata?.display_name || row.app_metadata?.full_name || row.app_metadata?.name);
  if (fromApp) return fromApp;

  const email = coerceString(row.email);
  if (email.includes("@")) return email.split("@")[0];
  return email || "Sem nome";
};

const pickStatus = (row: { email?: string | null; email_confirmed_at?: string | null; banned_until?: string | null }) => {
  const hasEmail = !!coerceString(row.email);
  if (!hasEmail) return { label: "Sem email", tone: "neutral" as const };

  if (row.banned_until) {
    const bannedUntil = new Date(row.banned_until).getTime();
    if (Number.isFinite(bannedUntil) && bannedUntil > Date.now()) {
      return { label: "Bloqueado", tone: "error" as const };
    }
  }

  if (row.email_confirmed_at) return { label: "Ativo", tone: "success" as const };
  return { label: "Pendente", tone: "warning" as const };
};

export async function GET(req: NextRequest) {
  const { user, error, client } = await getUserFromRequest(req);
  if (!user || error || !client) {
    return NextResponse.json({ ok: false, message: error || "Nao autenticado." }, { status: 401 });
  }

  const ceoEmails = parseCsv(process.env.CEO_EMAILS || process.env.ADMIN_CEO_EMAILS);

  const { data: profileData } = await client
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  const roleCandidates = pickRoleCandidates(profileData as ProfileLike, {
    app_metadata: user.app_metadata as unknown,
    user_metadata: user.user_metadata as unknown,
  });
  const userEmail = coerceString(user.email).toLowerCase();
  const isCeoByRole = roleCandidates.some((role) => CEO_ROLE_VALUES.has(role));
  const isCeoByEmail = !!userEmail && ceoEmails.includes(userEmail);

  if (!isCeoByRole && !isCeoByEmail) {
    return NextResponse.json({ ok: false, message: "Acesso restrito ao cargo CEO." }, { status: 403 });
  }

  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json({ ok: false, message: "Service role nao configurada." }, { status: 503 });
  }

  const perPage = 200;
  const maxPages = 10;
  const allUsers: Array<{
    id: string;
    email?: string | null;
    created_at?: string | null;
    email_confirmed_at?: string | null;
    last_sign_in_at?: string | null;
    banned_until?: string | null;
    user_metadata?: Record<string, unknown>;
    app_metadata?: Record<string, unknown>;
  }> = [];

  for (let page = 1; page <= maxPages; page += 1) {
    const { data, error: listError } = await admin.auth.admin.listUsers({ page, perPage });
    if (listError) {
      return NextResponse.json({ ok: false, message: listError.message }, { status: 500 });
    }

    const rows = (data?.users || []) as typeof allUsers;
    allUsers.push(...rows);

    if (rows.length < perPage) break;
  }

  const users = allUsers
    .map((row) => {
      const status = pickStatus(row);
      return {
        id: row.id,
        name: pickName(row),
        email: coerceString(row.email) || "Sem email",
        status: status.label,
        status_tone: status.tone,
        created_at: row.created_at || null,
        last_sign_in_at: row.last_sign_in_at || null,
      };
    })
    .sort((a, b) => {
      const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
      return bTime - aTime;
    });

  return NextResponse.json({ ok: true, is_ceo: true, users });
}

