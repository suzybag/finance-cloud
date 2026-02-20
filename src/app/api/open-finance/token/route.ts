import { NextRequest, NextResponse } from "next/server";
import { getAdminClient, getUserFromRequest, logSecurityEvent } from "@/lib/apiAuth";
import {
  buildTokenReference,
  encryptText,
  hasEncryptionKey,
  sha256Hex,
} from "@/lib/security/encryption";
import { sanitizeFreeText } from "@/lib/security/input";

const MAX_BODY_SIZE_BYTES = 12 * 1024;

type OpenFinanceTokenRow = {
  provider: string;
  token_ref: string;
  expires_at: string | null;
  created_at: string;
  last_rotated_at: string;
};

const parseIsoDateOrNull = (raw: unknown) => {
  if (!raw) return null;
  const value = String(raw).trim();
  if (!value) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString();
};

const checkOpenFinanceConsent = async (userId: string) => {
  const admin = getAdminClient();
  if (!admin) return { allowed: false, reason: "Service role nao configurada." };

  const { data } = await admin
    .from("user_consents")
    .select("open_finance_accepted")
    .eq("user_id", userId)
    .maybeSingle();

  return { allowed: !!data?.open_finance_accepted, reason: null as string | null };
};

export async function GET(req: NextRequest) {
  const { user, error } = await getUserFromRequest(req);
  if (!user || error) {
    return NextResponse.json({ ok: false, message: error }, { status: 401 });
  }

  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json({ ok: false, message: "Service role nao configurada." }, { status: 503 });
  }

  const { data, error: listError } = await admin
    .from("open_finance_tokens")
    .select("provider, token_ref, expires_at, created_at, last_rotated_at")
    .eq("user_id", user.id)
    .order("provider");

  if (listError) {
    return NextResponse.json({ ok: false, message: listError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    tokens: (data || []) as OpenFinanceTokenRow[],
  });
}

export async function POST(req: NextRequest) {
  const contentLength = Number(req.headers.get("content-length") || "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_SIZE_BYTES) {
    return NextResponse.json({ ok: false, message: "Payload muito grande." }, { status: 413 });
  }

  const { user, error } = await getUserFromRequest(req);
  if (!user || error) {
    return NextResponse.json({ ok: false, message: error }, { status: 401 });
  }

  if (!hasEncryptionKey()) {
    return NextResponse.json({ ok: false, message: "APP_ENCRYPTION_KEY nao configurada." }, { status: 503 });
  }

  const consent = await checkOpenFinanceConsent(user.id);
  if (!consent.allowed) {
    return NextResponse.json(
      { ok: false, message: "Consentimento Open Finance nao concedido." },
      { status: 403 },
    );
  }

  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json({ ok: false, message: "Service role nao configurada." }, { status: 503 });
  }

  const body = await req.json().catch(() => null);
  const provider = sanitizeFreeText(body?.provider, 60).toLowerCase();
  const rawToken = String(body?.token ?? "").trim();
  const expiresAt = parseIsoDateOrNull(body?.expires_at);

  if (!provider || provider.length < 2) {
    return NextResponse.json({ ok: false, message: "Provider invalido." }, { status: 400 });
  }
  if (!rawToken || rawToken.length < 20 || rawToken.length > 8192) {
    return NextResponse.json({ ok: false, message: "Token Open Finance invalido." }, { status: 400 });
  }

  const encryptedToken = encryptText(rawToken);
  const tokenHash = sha256Hex(rawToken);
  const tokenRef = buildTokenReference("oft", `${user.id}:${provider}:${rawToken}`);
  const nowIso = new Date().toISOString();

  const { error: upsertError } = await admin.from("open_finance_tokens").upsert(
    {
      user_id: user.id,
      provider,
      token_ref: tokenRef,
      token_hash: tokenHash,
      token_enc: encryptedToken,
      expires_at: expiresAt,
      last_rotated_at: nowIso,
      updated_at: nowIso,
    },
    { onConflict: "user_id,provider" },
  );

  if (upsertError) {
    return NextResponse.json({ ok: false, message: upsertError.message }, { status: 500 });
  }

  await logSecurityEvent({
    req,
    eventType: "open_finance_token_rotated",
    severity: "info",
    message: "Token Open Finance atualizado em cofre criptografado.",
    userId: user.id,
    metadata: {
      provider,
      token_ref: tokenRef,
      expires_at: expiresAt,
    },
  });

  return NextResponse.json({
    ok: true,
    provider,
    token_ref: tokenRef,
    expires_at: expiresAt,
  });
}

export async function DELETE(req: NextRequest) {
  const { user, error } = await getUserFromRequest(req);
  if (!user || error) {
    return NextResponse.json({ ok: false, message: error }, { status: 401 });
  }

  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json({ ok: false, message: "Service role nao configurada." }, { status: 503 });
  }

  const body = await req.json().catch(() => null);
  const tokenRef = sanitizeFreeText(body?.token_ref, 120);
  const provider = sanitizeFreeText(body?.provider, 60).toLowerCase();

  if (!tokenRef && !provider) {
    return NextResponse.json(
      { ok: false, message: "Informe token_ref ou provider para remover." },
      { status: 400 },
    );
  }

  let query = admin
    .from("open_finance_tokens")
    .delete()
    .eq("user_id", user.id);

  if (tokenRef) query = query.eq("token_ref", tokenRef);
  if (provider) query = query.eq("provider", provider);

  const { error: deleteError } = await query;
  if (deleteError) {
    return NextResponse.json({ ok: false, message: deleteError.message }, { status: 500 });
  }

  await logSecurityEvent({
    req,
    eventType: "open_finance_token_deleted",
    severity: "info",
    message: "Token Open Finance removido do cofre.",
    userId: user.id,
    metadata: {
      provider: provider || null,
      token_ref: tokenRef || null,
    },
  });

  return NextResponse.json({ ok: true });
}
