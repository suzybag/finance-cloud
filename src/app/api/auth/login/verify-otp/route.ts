import { NextRequest, NextResponse } from "next/server";
import { getAdminClient, logSecurityEvent } from "@/lib/apiAuth";
import { sendEmailAlert } from "@/lib/emailAlerts";
import { sendPushToUser } from "@/lib/pushServer";
import { decryptJson } from "@/lib/security/encryption";
import { verifySecret } from "@/lib/security/hash";
import { sanitizeOtpCode } from "@/lib/security/input";
import { getClientIp } from "@/lib/security/requestContext";

const MAX_BODY_SIZE_BYTES = 8 * 1024;
const STRICT_IP_MATCH = (process.env.AUTH_OTP_STRICT_IP || "").trim().toLowerCase() === "true";

type OtpChallengeRow = {
  id: string;
  user_id: string;
  email: string;
  code_hash: string;
  payload_enc: string;
  attempts_count: number;
  max_attempts: number;
  expires_at: string;
  consumed_at: string | null;
  ip_address: string | null;
};

type OtpSessionPayload = {
  access_token: string;
  refresh_token: string;
  expires_at: number | null;
  token_type?: string;
  user_id: string;
  email: string;
};

const createSameErrorResponse = () =>
  NextResponse.json(
    { ok: false, message: "Codigo invalido ou expirado." },
    { status: 401 },
  );

const registerLoginSuccess = async ({
  req,
  userId,
  ip,
  suspicious,
  previousIp,
}: {
  req: NextRequest;
  userId: string;
  ip: string | null;
  suspicious: boolean;
  previousIp: string | null;
}) => {
  await logSecurityEvent({
    req,
    eventType: "auth_login_success",
    severity: suspicious ? "warning" : "info",
    message: suspicious
      ? "Login concluido com comportamento suspeito (IP diferente do ultimo acesso)."
      : "Login concluido com sucesso.",
    userId,
    metadata: {
      current_ip: ip,
      previous_ip: previousIp,
      suspicious,
    },
  });
};

export async function POST(req: NextRequest) {
  const contentLength = Number(req.headers.get("content-length") || "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_SIZE_BYTES) {
    return NextResponse.json({ ok: false, message: "Payload muito grande." }, { status: 413 });
  }

  const body = await req.json().catch(() => null);
  const challengeId = String(body?.challenge_id ?? "").trim();
  const otpCode = sanitizeOtpCode(body?.otp);

  if (!challengeId || !otpCode || otpCode.length !== 6) {
    return NextResponse.json({ ok: false, message: "Codigo OTP invalido." }, { status: 400 });
  }

  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json(
      { ok: false, message: "Service role nao configurada para login seguro." },
      { status: 503 },
    );
  }

  const { data: challengeData } = await admin
    .from("auth_otp_challenges")
    .select("id, user_id, email, code_hash, payload_enc, attempts_count, max_attempts, expires_at, consumed_at, ip_address")
    .eq("id", challengeId)
    .maybeSingle();

  const challenge = (challengeData as OtpChallengeRow | null) ?? null;
  if (!challenge) {
    return createSameErrorResponse();
  }

  const nowMs = Date.now();
  const expiresMs = Date.parse(challenge.expires_at);
  if (
    challenge.consumed_at
    || !Number.isFinite(expiresMs)
    || expiresMs <= nowMs
    || challenge.attempts_count >= challenge.max_attempts
  ) {
    return createSameErrorResponse();
  }

  const ip = getClientIp(req);
  if (STRICT_IP_MATCH && challenge.ip_address && ip && challenge.ip_address !== ip) {
    await logSecurityEvent({
      req,
      eventType: "auth_otp_ip_mismatch",
      severity: "critical",
      message: "Tentativa de validar OTP com IP diferente do inicio de login.",
      userId: challenge.user_id,
      metadata: {
        initial_ip: challenge.ip_address,
        current_ip: ip,
      },
    });
    return NextResponse.json(
      { ok: false, message: "Codigo invalido ou expirado. Inicie o login novamente." },
      { status: 401 },
    );
  }

  const otpMatches = await verifySecret(otpCode, challenge.code_hash);
  if (!otpMatches) {
    const nextAttempts = challenge.attempts_count + 1;
    const shouldConsume = nextAttempts >= challenge.max_attempts;

    await admin
      .from("auth_otp_challenges")
      .update({
        attempts_count: nextAttempts,
        consumed_at: shouldConsume ? new Date().toISOString() : null,
      })
      .eq("id", challenge.id);

    await logSecurityEvent({
      req,
      eventType: shouldConsume ? "auth_otp_failed_locked" : "auth_otp_failed",
      severity: shouldConsume ? "critical" : "warning",
      message: "Codigo OTP invalido.",
      userId: challenge.user_id,
      metadata: {
        attempts: nextAttempts,
        max_attempts: challenge.max_attempts,
      },
    });

    return NextResponse.json(
      {
        ok: false,
        message: "Codigo invalido.",
        attempts_remaining: Math.max(challenge.max_attempts - nextAttempts, 0),
      },
      { status: 401 },
    );
  }

  let sessionPayload: OtpSessionPayload;
  try {
    sessionPayload = decryptJson<OtpSessionPayload>(challenge.payload_enc);
  } catch {
    await logSecurityEvent({
      req,
      eventType: "auth_otp_payload_decrypt_failed",
      severity: "critical",
      message: "Falha ao descriptografar sessao temporaria de OTP.",
      userId: challenge.user_id,
    });
    return NextResponse.json(
      { ok: false, message: "Falha ao concluir login seguro." },
      { status: 500 },
    );
  }

  if (!sessionPayload?.access_token || !sessionPayload?.refresh_token) {
    return NextResponse.json(
      { ok: false, message: "Sessao temporaria invalida." },
      { status: 500 },
    );
  }

  await admin
    .from("auth_otp_challenges")
    .update({
      consumed_at: new Date().toISOString(),
      attempts_count: challenge.max_attempts,
    })
    .eq("id", challenge.id);

  const attemptKeys = new Set([
    `${challenge.email}::${ip || "unknown"}`,
    `${challenge.email}::${challenge.ip_address || "unknown"}`,
  ]);
  const nowIso = new Date().toISOString();
  await Promise.all(
    Array.from(attemptKeys).map((attemptKey) =>
      admin.from("auth_login_attempts").upsert(
        {
          attempt_key: attemptKey,
          email: challenge.email,
          ip_address: attemptKey.split("::")[1] || null,
          failed_count: 0,
          lock_until: null,
          last_attempt_at: nowIso,
          updated_at: nowIso,
        },
        { onConflict: "attempt_key" },
      )),
  );

  const { data: previousLoginData } = await admin
    .from("security_events")
    .select("ip_address, created_at")
    .eq("user_id", challenge.user_id)
    .eq("event_type", "auth_login_success")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const previousIp = String(previousLoginData?.ip_address || "").trim() || null;
  const suspicious = !!previousIp && !!ip && previousIp !== ip;

  if (suspicious) {
    const currentDateTime = new Date().toLocaleString("pt-BR");
    const alertText = [
      "Detectamos um novo acesso na sua conta Finance Cloud.",
      `Horario: ${currentDateTime}`,
      `IP atual: ${ip || "indisponivel"}`,
      `IP anterior: ${previousIp || "indisponivel"}`,
      "Se nao foi voce, altere a senha imediatamente.",
    ].join("\n");

    await Promise.allSettled([
      sendEmailAlert({
        to: challenge.email,
        subject: "Alerta de seguranca: novo acesso detectado",
        text: alertText,
        html: alertText.replace(/\n/g, "<br/>"),
      }),
      sendPushToUser({
        admin,
        userId: challenge.user_id,
        payload: {
          title: "Alerta de seguranca",
          body: "Novo acesso detectado. Verifique se foi voce.",
          url: "/profile",
          tag: "security-login-alert",
        },
      }),
    ]);

    await logSecurityEvent({
      req,
      eventType: "auth_suspicious_login_detected",
      severity: "warning",
      message: "Login suspeito detectado por alteracao de IP.",
      userId: challenge.user_id,
      metadata: {
        current_ip: ip,
        previous_ip: previousIp,
      },
    });
  }

  await registerLoginSuccess({
    req,
    userId: challenge.user_id,
    ip,
    suspicious,
    previousIp,
  });

  return NextResponse.json({
    ok: true,
    session: {
      access_token: sessionPayload.access_token,
      refresh_token: sessionPayload.refresh_token,
    },
  });
}
