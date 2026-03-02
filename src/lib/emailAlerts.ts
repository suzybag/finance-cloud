type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments?: Array<{
    filename: string;
    content: string; // base64
    contentType?: string;
  }>;
};

type SendEmailResult = {
  ok: boolean;
  provider: "resend" | "brevo" | "none";
  messageId?: string;
  error?: string;
};

const DEFAULT_FROM = "Finance Cloud <alerts@finance-cloud.local>";

const mapProviderError = (provider: "resend" | "brevo", rawError: string) => {
  const reason = rawError.trim();
  if (!reason) {
    return provider === "resend" ? "Resend falhou no envio." : "Brevo falhou no envio.";
  }

  if (provider === "resend") {
    if (/you can only send testing emails/i.test(reason) || /testing emails/i.test(reason)) {
      return "Resend em modo de teste. Verifique um dominio no Resend e configure RESEND_FROM ou ALERT_EMAIL_FROM.";
    }
    if (/domain .*not verified/i.test(reason) || /verify a domain/i.test(reason)) {
      return "Dominio de envio nao verificado no Resend. Verifique o dominio e ajuste RESEND_FROM.";
    }
    if (/invalid .*from/i.test(reason) || /from .*invalid/i.test(reason)) {
      return "Remetente invalido no Resend. Ajuste RESEND_FROM ou ALERT_EMAIL_FROM.";
    }
  }

  if (provider === "brevo") {
    if (/unauthorized/i.test(reason) || /invalid api key/i.test(reason)) {
      return "BREVO_API_KEY invalida ou nao autorizada.";
    }
    if (/sender/i.test(reason) && /not verified/i.test(reason)) {
      return "Remetente do Brevo nao verificado. Ajuste BREVO_FROM.";
    }
  }

  return reason;
};

const mergeFailures = (primary: SendEmailResult, fallback: SendEmailResult): SendEmailResult => {
  const primaryError = (primary.error || "").trim();
  const fallbackError = (fallback.error || "").trim();

  if (
    /RESEND_API_KEY nao configurada\./i.test(primaryError) &&
    /BREVO_API_KEY nao configurada\./i.test(fallbackError)
  ) {
    return {
      ok: false,
      provider: primary.provider,
      error: "Nenhum provedor de email configurado. Configure RESEND_API_KEY ou BREVO_API_KEY.",
    };
  }

  const joined = [primaryError, fallbackError].filter(Boolean).join(" | fallback: ");
  return {
    ok: false,
    provider: primary.provider,
    error: joined || "Falha ao enviar email.",
  };
};

const parseFrom = (raw?: string) => {
  const value = (raw || "").trim() || DEFAULT_FROM;
  const match = value.match(/^(.*)<([^>]+)>$/);
  if (!match) {
    return {
      name: "Finance Cloud",
      email: value,
      raw: value,
    };
  }
  return {
    name: match[1].trim() || "Finance Cloud",
    email: match[2].trim(),
    raw: value,
  };
};

const sendViaResend = async (input: SendEmailInput): Promise<SendEmailResult> => {
  const apiKey = process.env.RESEND_API_KEY ?? "";
  if (!apiKey) {
    return { ok: false, provider: "none", error: "RESEND_API_KEY nao configurada." };
  }

  const fromRaw = process.env.RESEND_FROM || process.env.ALERT_EMAIL_FROM || DEFAULT_FROM;
  const from = parseFrom(fromRaw);

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: from.raw,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
      attachments: (input.attachments || []).map((attachment) => ({
        filename: attachment.filename,
        content: attachment.content,
      })),
    }),
  });

  const data = await response.json().catch(() => ({} as { id?: string; message?: string; error?: string }));
  if (!response.ok) {
    const rawError = data?.message || data?.error || `Resend falhou (${response.status}).`;
    return {
      ok: false,
      provider: "resend",
      error: mapProviderError("resend", rawError),
    };
  }

  return {
    ok: true,
    provider: "resend",
    messageId: data?.id,
  };
};

const sendViaBrevo = async (input: SendEmailInput): Promise<SendEmailResult> => {
  const apiKey = process.env.BREVO_API_KEY ?? "";
  if (!apiKey) {
    return { ok: false, provider: "none", error: "BREVO_API_KEY nao configurada." };
  }

  const fromRaw = process.env.BREVO_FROM || process.env.ALERT_EMAIL_FROM || DEFAULT_FROM;
  const from = parseFrom(fromRaw);
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sender: {
        name: from.name,
        email: from.email,
      },
      to: [{ email: input.to }],
      subject: input.subject,
      htmlContent: input.html,
      textContent: input.text,
      attachment: (input.attachments || []).map((attachment) => ({
        name: attachment.filename,
        content: attachment.content,
      })),
    }),
  });

  const data = await response.json().catch(() => ({} as { messageId?: string; message?: string; code?: string }));
  if (!response.ok) {
    const rawError = data?.message || data?.code || `Brevo falhou (${response.status}).`;
    return {
      ok: false,
      provider: "brevo",
      error: mapProviderError("brevo", rawError),
    };
  }

  return {
    ok: true,
    provider: "brevo",
    messageId: data?.messageId,
  };
};

export const sendEmailAlert = async (input: SendEmailInput): Promise<SendEmailResult> => {
  const preferred = (process.env.EMAIL_PROVIDER || "").trim().toLowerCase();
  if (preferred === "brevo") {
    const brevoResult = await sendViaBrevo(input);
    if (brevoResult.ok) return brevoResult;
    const resendFallback = await sendViaResend(input);
    return resendFallback.ok ? resendFallback : mergeFailures(brevoResult, resendFallback);
  }

  const resendResult = await sendViaResend(input);
  if (resendResult.ok) return resendResult;
  const brevoFallback = await sendViaBrevo(input);
  return brevoFallback.ok ? brevoFallback : mergeFailures(resendResult, brevoFallback);
};
