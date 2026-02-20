import { NextRequest, NextResponse } from "next/server";
import { getAdminClient, getUserFromRequest, logSecurityEvent } from "@/lib/apiAuth";

const MAX_BODY_SIZE_BYTES = 8 * 1024;
const TERMS_VERSION = process.env.NEXT_PUBLIC_TERMS_VERSION || "2026-02-19";
const PRIVACY_VERSION = process.env.NEXT_PUBLIC_PRIVACY_VERSION || "2026-02-19";

type ConsentRow = {
  user_id: string;
  terms_accepted: boolean;
  terms_version: string | null;
  terms_accepted_at: string | null;
  privacy_accepted: boolean;
  privacy_version: string | null;
  privacy_accepted_at: string | null;
  marketing_opt_in: boolean;
  open_finance_accepted: boolean;
  open_finance_accepted_at: string | null;
  updated_at: string;
};

const defaultConsentPayload = {
  terms_accepted: false,
  terms_version: TERMS_VERSION,
  terms_accepted_at: null,
  privacy_accepted: false,
  privacy_version: PRIVACY_VERSION,
  privacy_accepted_at: null,
  marketing_opt_in: false,
  open_finance_accepted: false,
  open_finance_accepted_at: null,
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

  const { data, error: consentError } = await admin
    .from("user_consents")
    .select("user_id, terms_accepted, terms_version, terms_accepted_at, privacy_accepted, privacy_version, privacy_accepted_at, marketing_opt_in, open_finance_accepted, open_finance_accepted_at, updated_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (consentError) {
    return NextResponse.json({ ok: false, message: consentError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    terms_version: TERMS_VERSION,
    privacy_version: PRIVACY_VERSION,
    consent: (data as ConsentRow | null) || {
      user_id: user.id,
      ...defaultConsentPayload,
      updated_at: new Date(0).toISOString(),
    },
  });
}

export async function PUT(req: NextRequest) {
  const contentLength = Number(req.headers.get("content-length") || "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_SIZE_BYTES) {
    return NextResponse.json({ ok: false, message: "Payload muito grande." }, { status: 413 });
  }

  const { user, error } = await getUserFromRequest(req);
  if (!user || error) {
    return NextResponse.json({ ok: false, message: error }, { status: 401 });
  }

  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json({ ok: false, message: "Service role nao configurada." }, { status: 503 });
  }

  const body = await req.json().catch(() => null);
  const termsAccepted = Boolean(body?.terms_accepted);
  const privacyAccepted = Boolean(body?.privacy_accepted);
  const marketingOptIn = Boolean(body?.marketing_opt_in);
  const openFinanceAccepted = Boolean(body?.open_finance_accepted);
  const nowIso = new Date().toISOString();

  if (!termsAccepted || !privacyAccepted) {
    return NextResponse.json(
      { ok: false, message: "Aceite de Termos e Politica de Privacidade e obrigatorio." },
      { status: 400 },
    );
  }

  const payload = {
    user_id: user.id,
    terms_accepted: true,
    terms_version: TERMS_VERSION,
    terms_accepted_at: nowIso,
    privacy_accepted: true,
    privacy_version: PRIVACY_VERSION,
    privacy_accepted_at: nowIso,
    marketing_opt_in: marketingOptIn,
    open_finance_accepted: openFinanceAccepted,
    open_finance_accepted_at: openFinanceAccepted ? nowIso : null,
    updated_at: nowIso,
  };

  const { data, error: upsertError } = await admin
    .from("user_consents")
    .upsert(payload, { onConflict: "user_id" })
    .select("user_id, terms_accepted, terms_version, terms_accepted_at, privacy_accepted, privacy_version, privacy_accepted_at, marketing_opt_in, open_finance_accepted, open_finance_accepted_at, updated_at")
    .maybeSingle();

  if (upsertError) {
    return NextResponse.json({ ok: false, message: upsertError.message }, { status: 500 });
  }

  await logSecurityEvent({
    req,
    eventType: "lgpd_consent_updated",
    severity: "info",
    message: "Consentimentos LGPD atualizados pelo usuario.",
    userId: user.id,
    metadata: {
      terms_version: TERMS_VERSION,
      privacy_version: PRIVACY_VERSION,
      marketing_opt_in: marketingOptIn,
      open_finance_accepted: openFinanceAccepted,
    },
  });

  return NextResponse.json({
    ok: true,
    consent: (data as ConsentRow | null) || payload,
  });
}
