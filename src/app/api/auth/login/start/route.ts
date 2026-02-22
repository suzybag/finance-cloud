import { randomUUID } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { getAdminClient, logSecurityEvent } from "@/lib/apiAuth";
import { sendEmailAlert } from "@/lib/emailAlerts";
import { encryptJson, hasEncryptionKey } from "@/lib/security/encryption";
import { generateOtpCode, hashSecret } from "@/lib/security/hash";
import { sanitizeEmail } from "@/lib/security/input";
import { getClientIp } from "@/lib/security/requestContext";

const MAX_BODY_SIZE_BYTES = 8 * 1024;
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;
const OTP_TTL_MINUTES = 10;
const GENERIC_LOGIN_ERROR = "Email ou senha invalidos.";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

type LoginAttemptRow = {
  attempt_key: string;
  failed_count: number;
  lock_until: string | null;
};

const maskEmail = (email: string) => {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  if (local.length <= 2) return `${local[0] || "*"}*@${domain}`;
  return `${local[0]}${"*".repeat(Math.max(local.length - 2, 1))}${local[local.length - 1]}@${domain}`;
};

const getAttemptKey = (email: string, ip: string | null) => `${email}::${ip || "unknown"}`;

const buildOtpEmail = ({
  code,
  minutes,
}: {
  code: string;
  minutes: number;
}) => {
  const subject = "Codigo de verificacao - Finance Cloud";
  const text = `Seu codigo de verificacao e: ${code}. Ele expira em ${minutes} minutos.`;
  const html = `
    <div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.5">
      <h2 style="margin:0 0 12px">Finance Cloud - Verificacao de login</h2>
      <p>Use este codigo para concluir seu login:</p>
      <p style="font-size:28px;font-weight:700;letter-spacing:6px;margin:14px 0">${code}</p>
      <p>O codigo expira em ${minutes} minutos.</p>
      <p>Se voce nao tentou entrar, troque sua senha imediatamente.</p>
    </div>
  `;
  return { subject, text, html };
};

const upsertAttemptState = async ({
  attemptKey,
  email,
  ip,
  failedCount,
  lockUntil,
}: {
  attemptKey: string;
  email: string;
  ip: string | null;
  failedCount: number;
  lockUntil: string | null;
}) => {
  const admin = getAdminClient();
  if (!admin) return;
  const nowIso = new Date().toISOString();
  await admin.from("auth_login_attempts").upsert(
    {
      attempt_key: attemptKey,
      email,
      ip_address: ip,
      failed_count: failedCount,
      lock_until: lockUntil,
      last_attempt_at: nowIso,
      updated_at: nowIso,
    },
    { onConflict: "attempt_key" },
  );
};

export async function POST(req: NextRequest) {
  const contentLength = Number(req.headers.get("content-length") || "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_SIZE_BYTES) {
    return NextResponse.json({ ok: false, message: "Payload muito grande." }, { status: 413 });
  }

  const body = await req.json().catch(() => null);
  const email = sanitizeEmail(body?.email);
  const password = String(body?.password ?? "");
  const ip = getClientIp(req);
  const userAgent = req.headers.get("user-agent");

  if (!email || !password || password.length > 512) {
    return NextResponse.json({ ok: false, message: "Informe email e senha validos." }, { status: 400 });
  }

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json(
      { ok: false, message: "Supabase Auth nao configurado." },
      { status: 503 },
    );
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const encryptionReady = hasEncryptionKey();
  const admin = getAdminClient();
  if (!encryptionReady || !admin) {
    const { data: loginData, error: loginError } = await authClient.auth.signInWithPassword({
      email,
      password,
    });

    if (loginError || !loginData.user || !loginData.session) {
      return NextResponse.json(
        {
          ok: false,
          message: GENERIC_LOGIN_ERROR,
        },
        { status: 401 },
      );
    }

    await logSecurityEvent({
      req,
      eventType: "auth_login_without_otp_fallback",
      severity: "warning",
      message: "Login concluido sem OTP por configuracao incompleta de seguranca.",
      userId: loginData.user.id,
      metadata: {
        reason: !encryptionReady ? "missing_encryption_key" : "missing_service_role",
      },
    });

    return NextResponse.json({
      ok: true,
      requires_otp: false,
      security_mode: "degraded",
      session: {
        access_token: loginData.session.access_token,
        refresh_token: loginData.session.refresh_token,
      },
    });
  }

  const attemptKey = getAttemptKey(email, ip);

  const { data: attemptData } = await admin
    .from("auth_login_attempts")
    .select("attempt_key, failed_count, lock_until")
    .eq("attempt_key", attemptKey)
    .maybeSingle();

  const attempt = (attemptData as LoginAttemptRow | null) ?? null;
  const lockUntilMs = attempt?.lock_until ? Date.parse(attempt.lock_until) : 0;
  const nowMs = Date.now();

  if (lockUntilMs && lockUntilMs > nowMs) {
    await logSecurityEvent({
      req,
      eventType: "auth_login_blocked",
      severity: "warning",
      message: "Tentativa de login bloqueada por excesso de falhas.",
      metadata: { email, lock_until: attempt?.lock_until },
    });

    return NextResponse.json(
      {
        ok: false,
        message: `Login bloqueado. Tente novamente em ${Math.ceil((lockUntilMs - nowMs) / 60000)} minuto(s).`,
        lock_until: attempt?.lock_until,
      },
      { status: 423 },
    );
  }

  if (lockUntilMs && lockUntilMs <= nowMs) {
    await upsertAttemptState({
      attemptKey,
      email,
      ip,
      failedCount: 0,
      lockUntil: null,
    });
  }

  const { data: loginData, error: loginError } = await authClient.auth.signInWithPassword({
    email,
    password,
  });

  if (loginError || !loginData.user || !loginData.session) {
    const nextFailedCount = Math.max((attempt?.failed_count || 0) + 1, 1);
    const shouldLock = nextFailedCount >= MAX_LOGIN_ATTEMPTS;
    const lockUntil = shouldLock
      ? new Date(nowMs + LOCKOUT_MINUTES * 60 * 1000).toISOString()
      : null;

    await upsertAttemptState({
      attemptKey,
      email,
      ip,
      failedCount: nextFailedCount,
      lockUntil,
    });

    await logSecurityEvent({
      req,
      eventType: shouldLock ? "auth_login_failed_locked" : "auth_login_failed",
      severity: shouldLock ? "critical" : "warning",
      message: GENERIC_LOGIN_ERROR,
      metadata: {
        email,
        failed_count: nextFailedCount,
        lock_until: lockUntil,
      },
    });

    if (shouldLock) {
      return NextResponse.json(
        {
          ok: false,
          message: `Muitas tentativas invalidas. Bloqueado por ${LOCKOUT_MINUTES} minutos.`,
          lock_until: lockUntil,
        },
        { status: 423 },
      );
    }

    return NextResponse.json(
      {
        ok: false,
        message: GENERIC_LOGIN_ERROR,
        attempts_remaining: Math.max(MAX_LOGIN_ATTEMPTS - nextFailedCount, 0),
      },
      { status: 401 },
    );
  }

  await upsertAttemptState({
    attemptKey,
    email,
    ip,
    failedCount: 0,
    lockUntil: null,
  });

  const otpCode = generateOtpCode();
  const otpHash = await hashSecret(otpCode);
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000).toISOString();
  const challengeId = randomUUID();

  const payloadEnc = encryptJson({
    access_token: loginData.session.access_token,
    refresh_token: loginData.session.refresh_token,
    expires_at: loginData.session.expires_at ?? null,
    token_type: loginData.session.token_type ?? "bearer",
    user_id: loginData.user.id,
    email: loginData.user.email || email,
  });

  const { error: challengeError } = await admin.from("auth_otp_challenges").insert({
    id: challengeId,
    user_id: loginData.user.id,
    email: loginData.user.email || email,
    code_hash: otpHash,
    payload_enc: payloadEnc,
    attempts_count: 0,
    max_attempts: MAX_LOGIN_ATTEMPTS,
    expires_at: expiresAt,
    ip_address: ip,
    user_agent: userAgent,
  });

  if (challengeError) {
    await logSecurityEvent({
      req,
      eventType: "auth_otp_challenge_create_failed",
      severity: "critical",
      message: challengeError.message,
      userId: loginData.user.id,
    });
    return NextResponse.json(
      { ok: false, message: "Nao foi possivel iniciar verificacao em duas etapas." },
      { status: 500 },
    );
  }

  const mail = buildOtpEmail({ code: otpCode, minutes: OTP_TTL_MINUTES });
  const emailResult = await sendEmailAlert({
    to: loginData.user.email || email,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
  });

  if (!emailResult.ok) {
    await admin.from("auth_otp_challenges").delete().eq("id", challengeId);
    await logSecurityEvent({
      req,
      eventType: "auth_otp_delivery_failed",
      severity: "critical",
      message: emailResult.error || "Falha ao enviar OTP por email.",
      userId: loginData.user.id,
    });
    return NextResponse.json(
      { ok: false, message: "Nao foi possivel enviar o codigo OTP. Tente novamente." },
      { status: 503 },
    );
  }

  await logSecurityEvent({
    req,
    eventType: "auth_password_validated",
    severity: "info",
    message: "Senha validada. OTP enviado por email.",
    userId: loginData.user.id,
    metadata: {
      challenge_id: challengeId,
      otp_expires_at: expiresAt,
      provider: emailResult.provider,
    },
  });

  return NextResponse.json({
    ok: true,
    requires_otp: true,
    challenge_id: challengeId,
    expires_at: expiresAt,
    masked_email: maskEmail(loginData.user.email || email),
  });
}
