import { NextRequest, NextResponse } from "next/server";
import { getAdminClient, getUserFromRequest } from "@/lib/apiAuth";

type ProfileLike = Record<string, unknown> | null;

const CEO_ROLE_VALUES = new Set([
  "ceo",
  "chief executive officer",
  "owner",
  "dono",
  "fundador",
]);

const parseCsv = (value: string | undefined) =>
  (value || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

const coerceString = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const sanitizeRole = (value: string) =>
  value
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9 _-]/g, "")
    .trim()
    .slice(0, 40);

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
    .map((value) => sanitizeRole(value))
    .filter(Boolean);
};

const pickPrimaryRole = (user: { app_metadata?: unknown; user_metadata?: unknown }) => {
  const appMetadata = (user.app_metadata || {}) as Record<string, unknown>;
  const userMetadata = (user.user_metadata || {}) as Record<string, unknown>;
  const first = [
    coerceString(appMetadata.role),
    coerceString(appMetadata.cargo),
    coerceString(userMetadata.role),
    coerceString(userMetadata.cargo),
  ]
    .map((value) => sanitizeRole(value))
    .find(Boolean);
  return first || "usuario";
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

const resolveCeoContext = async (req: NextRequest) => {
  const auth = await getUserFromRequest(req);
  if (!auth.user || auth.error || !auth.client) {
    return {
      ok: false as const,
      response: NextResponse.json({ ok: false, message: auth.error || "Nao autenticado." }, { status: 401 }),
    };
  }

  const admin = getAdminClient();
  if (!admin) {
    return {
      ok: false as const,
      response: NextResponse.json({ ok: false, message: "Service role nao configurada." }, { status: 503 }),
    };
  }

  const ceoEmails = parseCsv(process.env.CEO_EMAILS || process.env.ADMIN_CEO_EMAILS);

  const { data: profileData } = await auth.client
    .from("profiles")
    .select("*")
    .eq("id", auth.user.id)
    .maybeSingle();

  const authUserRes = await admin.auth.admin.getUserById(auth.user.id);
  const actorAuthUser = authUserRes.data?.user || auth.user;

  const roleCandidates = pickRoleCandidates(profileData as ProfileLike, {
    app_metadata: actorAuthUser.app_metadata as unknown,
    user_metadata: actorAuthUser.user_metadata as unknown,
  });
  const actorEmail = coerceString(actorAuthUser.email || auth.user.email).toLowerCase();
  const isCeoByRole = roleCandidates.some((role) => CEO_ROLE_VALUES.has(role));
  const isCeoByEmail = !!actorEmail && ceoEmails.includes(actorEmail);

  let isCeo = isCeoByRole || isCeoByEmail;
  if (!isCeo) {
    // Bootstrap fallback: se nao existe nenhum CEO configurado, o primeiro perfil vira dono.
    const hasExplicitCeoConfig = roleCandidates.length > 0 || ceoEmails.length > 0;
    if (!hasExplicitCeoConfig) {
      const { data: firstProfile, error: firstProfileError } = await admin
        .from("profiles")
        .select("id, created_at")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (firstProfileError) {
        return {
          ok: false as const,
          response: NextResponse.json({ ok: false, message: firstProfileError.message }, { status: 500 }),
        };
      }
      isCeo = !!firstProfile?.id && firstProfile.id === auth.user.id;
    }
  }

  if (!isCeo) {
    return {
      ok: false as const,
      response: NextResponse.json({ ok: false, message: "Acesso restrito ao cargo CEO." }, { status: 403 }),
    };
  }

  return {
    ok: true as const,
    admin,
    actorUserId: auth.user.id,
    ceoEmails,
  };
};

export async function GET(req: NextRequest) {
  const ctx = await resolveCeoContext(req);
  if (!ctx.ok) return ctx.response;

  const { admin, ceoEmails } = ctx;
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
      const email = coerceString(row.email).toLowerCase();
      const role = pickPrimaryRole(row);
      const isCeo = CEO_ROLE_VALUES.has(role) || (!!email && ceoEmails.includes(email));

      return {
        id: row.id,
        name: pickName(row),
        email: coerceString(row.email) || "Sem email",
        role: isCeo ? "ceo" : role,
        is_ceo: isCeo,
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

  return NextResponse.json({ ok: true, users });
}

type AdminPatchBody = {
  userId?: string;
  action?: "set_role" | "set_ceo" | "remove_ceo";
  role?: string;
};

export async function PATCH(req: NextRequest) {
  const ctx = await resolveCeoContext(req);
  if (!ctx.ok) return ctx.response;

  const payload = (await req.json().catch(() => ({}))) as AdminPatchBody;
  const targetUserId = coerceString(payload.userId);
  if (!targetUserId) {
    return NextResponse.json({ ok: false, message: "Informe o usuario alvo." }, { status: 400 });
  }

  const action = payload.action || "set_role";
  let nextRole = "";
  if (action === "set_ceo") nextRole = "ceo";
  if (action === "remove_ceo") nextRole = "usuario";
  if (action === "set_role") {
    nextRole = sanitizeRole(coerceString(payload.role));
    if (!nextRole) {
      return NextResponse.json({ ok: false, message: "Informe um cargo valido." }, { status: 400 });
    }
  }

  if (action === "remove_ceo" && targetUserId === ctx.actorUserId) {
    return NextResponse.json({ ok: false, message: "Nao e permitido remover o proprio cargo CEO." }, { status: 400 });
  }

  const targetRes = await ctx.admin.auth.admin.getUserById(targetUserId);
  if (targetRes.error || !targetRes.data?.user) {
    return NextResponse.json({ ok: false, message: targetRes.error?.message || "Usuario nao encontrado." }, { status: 404 });
  }

  const targetUser = targetRes.data.user;
  const nextAppMetadata = {
    ...((targetUser.app_metadata || {}) as Record<string, unknown>),
    role: nextRole,
    cargo: nextRole,
  };
  const nextUserMetadata = {
    ...((targetUser.user_metadata || {}) as Record<string, unknown>),
    role: nextRole,
    cargo: nextRole,
  };

  const updateRes = await ctx.admin.auth.admin.updateUserById(targetUserId, {
    app_metadata: nextAppMetadata,
    user_metadata: nextUserMetadata,
  });
  if (updateRes.error) {
    return NextResponse.json({ ok: false, message: updateRes.error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    message: action === "set_ceo"
      ? "Cargo CEO concedido com sucesso."
      : action === "remove_ceo"
        ? "Cargo CEO removido com sucesso."
        : `Cargo atualizado para "${nextRole}".`,
  });
}

export async function DELETE(req: NextRequest) {
  const ctx = await resolveCeoContext(req);
  if (!ctx.ok) return ctx.response;

  const userIdFromQuery = coerceString(req.nextUrl.searchParams.get("userId"));
  const body = (await req.json().catch(() => ({}))) as { userId?: string };
  const targetUserId = userIdFromQuery || coerceString(body.userId);

  if (!targetUserId) {
    return NextResponse.json({ ok: false, message: "Informe o usuario alvo." }, { status: 400 });
  }

  if (targetUserId === ctx.actorUserId) {
    return NextResponse.json({ ok: false, message: "Nao e permitido excluir a propria conta por este painel." }, { status: 400 });
  }

  const deleteRes = await ctx.admin.auth.admin.deleteUser(targetUserId);
  if (deleteRes.error) {
    return NextResponse.json({ ok: false, message: deleteRes.error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, message: "Usuario excluido com sucesso." });
}
