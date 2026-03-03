import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getAdminClient,
  getBearerToken,
  getUserFromRequest,
  isCronAuthorized,
} from "@/lib/apiAuth";
import { sendEmailAlert } from "@/lib/emailAlerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const MAX_BATCH_SIZE = 3000;
const DEFAULT_TZ = "America/Sao_Paulo";
const DAILY_SENT_EVENT_TYPE = "agenda_daily_alert_sent";
const DAILY_ERROR_EVENT_TYPE = "agenda_daily_alert_error";
const DAILY_SKIPPED_EVENT_TYPE = "agenda_daily_alert_skipped";

type AgendaEventRow = {
  id: string;
  user_id: string;
  user_email: string;
  title: string;
  description: string | null;
  event_at: string;
  timezone: string | null;
  alert_enabled: boolean;
};

type GroupedDailyAgenda = {
  userId: string;
  referenceDate: string;
  timezone: string;
  recipient: string;
  events: AgendaEventRow[];
};

const mapTableHint = (message?: string | null) => {
  const text = message || "";
  if (/relation .*agenda_events/i.test(text)) return "Tabela agenda_events nao encontrada.";
  if (/relation .*agenda_daily_alerts/i.test(text)) return "Tabela agenda_daily_alerts nao encontrada.";
  if (/relation .*security_events/i.test(text)) return "Tabela security_events nao encontrada.";
  return null;
};

const sleep = (ms: number) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

const normalizeTimezone = (value?: string | null) => {
  const timezone = (value || "").trim();
  return timezone || DEFAULT_TZ;
};

const formatDateKeyInTimezone = (isoDate: string, timezone: string) => {
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(parsed);
  const year = parts.find((part) => part.type === "year")?.value || "";
  const month = parts.find((part) => part.type === "month")?.value || "";
  const day = parts.find((part) => part.type === "day")?.value || "";
  return year && month && day ? `${year}-${month}-${day}` : "";
};

const formatDateLabel = (isoDate: string, timezone: string) => {
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: timezone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(parsed);
};

const formatDateTimeLabel = (isoDate: string, timezone: string) => {
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: timezone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
};

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");

const buildDailySummaryEmail = (group: GroupedDailyAgenda) => {
  const orderedEvents = [...group.events].sort(
    (a, b) => new Date(a.event_at).getTime() - new Date(b.event_at).getTime(),
  );
  const dateLabel = orderedEvents.length
    ? formatDateLabel(orderedEvents[0].event_at, group.timezone)
    : group.referenceDate;
  const subject = `Resumo da agenda de hoje - ${dateLabel}`;

  const htmlItems = orderedEvents
    .map((event) => {
      const when = formatDateTimeLabel(event.event_at, group.timezone);
      const title = escapeHtml(event.title || "Compromisso");
      const description = (event.description || "").trim();
      const descriptionHtml = description
        ? `<p style="margin:2px 0 0 0;color:#475569;">${escapeHtml(description)}</p>`
        : "";
      return `
        <li style="margin:0 0 10px 0;">
          <strong>${title}</strong>
          <div style="color:#334155;">${escapeHtml(when)} (${escapeHtml(group.timezone)})</div>
          ${descriptionHtml}
        </li>
      `;
    })
    .join("");

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.5;color:#0f172a;">
      <h2 style="margin:0 0 12px 0;">${escapeHtml(subject)}</h2>
      <p style="margin:0 0 10px 0;">Voce tem ${orderedEvents.length} compromisso(s) para hoje:</p>
      <ul style="margin:0 0 12px 20px;padding:0;">${htmlItems}</ul>
      <p style="margin:0;color:#64748b;">Enviado automaticamente pelo Finance Cloud.</p>
    </div>
  `;

  const textLines = [
    subject,
    `Voce tem ${orderedEvents.length} compromisso(s) para hoje.`,
    "",
    ...orderedEvents.flatMap((event) => {
      const when = formatDateTimeLabel(event.event_at, group.timezone);
      const title = event.title || "Compromisso";
      const description = (event.description || "").trim();
      return [
        `- ${title}`,
        `  ${when} (${group.timezone})`,
        ...(description ? [`  ${description}`] : []),
      ];
    }),
    "",
    "Enviado automaticamente pelo Finance Cloud.",
  ];

  return {
    subject,
    html,
    text: textLines.join("\n"),
    eventsCount: orderedEvents.length,
  };
};

const hasDailySentMarker = async ({
  db,
  userId,
  referenceDate,
}: {
  db: SupabaseClient;
  userId: string;
  referenceDate: string;
}) => {
  const markerRes = await db
    .from("security_events")
    .select("id")
    .eq("user_id", userId)
    .eq("event_type", DAILY_SENT_EVENT_TYPE)
    .contains("metadata", { reference_date: referenceDate })
    .limit(1);

  if (markerRes.error) {
    const hint = mapTableHint(markerRes.error.message);
    throw new Error(hint ? `${hint} Rode o supabase.sql atualizado.` : markerRes.error.message);
  }

  return (markerRes.data || []).length > 0;
};

const writeDailyLog = async ({
  db,
  userId,
  referenceDate,
  eventType,
  severity,
  message,
  metadata,
}: {
  db: SupabaseClient;
  userId: string;
  referenceDate: string;
  eventType: string;
  severity: "info" | "warning" | "critical";
  message: string;
  metadata?: Record<string, unknown>;
}) => {
  const insertRes = await db
    .from("security_events")
    .insert({
      user_id: userId,
      event_type: eventType,
      severity,
      message: message.slice(0, 500),
      path: "/api/agenda/daily-alerts",
      metadata: {
        reference_date: referenceDate,
        ...(metadata || {}),
      },
    });

  if (insertRes.error) {
    const hint = mapTableHint(insertRes.error.message);
    throw new Error(hint ? `${hint} Rode o supabase.sql atualizado.` : insertRes.error.message);
  }
};

const sendWithRetry = async ({
  to,
  subject,
  html,
  text,
}: {
  to: string;
  subject: string;
  html: string;
  text: string;
}) => {
  let attempt = 0;
  let lastResult = await sendEmailAlert({ to, subject, html, text });
  while (!lastResult.ok && attempt < 2) {
    const reason = String(lastResult.error || "");
    if (!/too many requests|rate limit/i.test(reason)) {
      return lastResult;
    }
    attempt += 1;
    await sleep(700 * attempt);
    lastResult = await sendEmailAlert({ to, subject, html, text });
  }
  return lastResult;
};

const runDailyAgendaAlerts = async ({
  db,
  userFilter,
  fallbackEmail,
}: {
  db: SupabaseClient;
  userFilter?: string;
  fallbackEmail?: string;
}) => {
  const now = new Date();
  const nowIso = now.toISOString();
  const utcStartToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
  const windowStart = new Date(utcStartToday.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const windowEnd = new Date(utcStartToday.getTime() + 48 * 60 * 60 * 1000).toISOString();

  let query = db
    .from("agenda_events")
    .select("id, user_id, user_email, title, description, event_at, timezone, alert_enabled")
    .eq("alert_enabled", true)
    .gte("event_at", windowStart)
    .lt("event_at", windowEnd)
    .order("user_id", { ascending: true })
    .order("event_at", { ascending: true })
    .limit(MAX_BATCH_SIZE);

  if (userFilter) {
    query = query.eq("user_id", userFilter);
  }

  const eventsRes = await query;
  if (eventsRes.error) {
    const hint = mapTableHint(eventsRes.error.message);
    throw new Error(hint ? `${hint} Rode o supabase.sql atualizado.` : eventsRes.error.message);
  }

  const grouped = new Map<string, GroupedDailyAgenda>();
  const fallbackRecipient = (fallbackEmail || "").trim();

  ((eventsRes.data || []) as AgendaEventRow[]).forEach((row) => {
    const userId = String(row.user_id || "").trim();
    if (!userId) return;

    const timezone = normalizeTimezone(row.timezone);
    const todayKey = formatDateKeyInTimezone(nowIso, timezone);
    const eventDayKey = formatDateKeyInTimezone(row.event_at, timezone);
    if (!todayKey || todayKey !== eventDayKey) return;

    const recipient = fallbackRecipient || String(row.user_email || "").trim();
    const current = grouped.get(userId);
    if (current) {
      if (!current.recipient && recipient) current.recipient = recipient;
      current.events.push(row);
      return;
    }

    grouped.set(userId, {
      userId,
      referenceDate: todayKey,
      timezone,
      recipient,
      events: [row],
    });
  });

  if (!grouped.size) {
    console.info("[agenda-daily-alerts] nenhum compromisso para resumo diario.");
    return {
      processed: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      errors: [] as string[],
    };
  }

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  const errors: string[] = [];
  let sequence = 0;

  for (const group of grouped.values()) {
    const alreadySent = await hasDailySentMarker({
      db,
      userId: group.userId,
      referenceDate: group.referenceDate,
    });
    if (alreadySent) {
      skipped += 1;
      console.info(`[agenda-daily-alerts] skip user=${group.userId} date=${group.referenceDate} motivo=ja_enviado`);
      continue;
    }

    if (!group.recipient) {
      skipped += 1;
      const reason = "Usuario sem email para envio de resumo diario.";
      await writeDailyLog({
        db,
        userId: group.userId,
        referenceDate: group.referenceDate,
        eventType: DAILY_SKIPPED_EVENT_TYPE,
        severity: "warning",
        message: reason,
        metadata: {
          recipient: "",
          events_count: group.events.length,
          attempted_at: nowIso,
        },
      });
      console.warn(`[agenda-daily-alerts] skip user=${group.userId} date=${group.referenceDate} motivo=sem_email`);
      continue;
    }

    if (sequence > 0) {
      await sleep(550);
    }
    sequence += 1;

    const payload = buildDailySummaryEmail(group);
    const send = await sendWithRetry({
      to: group.recipient,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
    });

    if (!send.ok) {
      failed += 1;
      const reason = send.error || "Falha no envio do resumo diario.";
      errors.push(`[${group.userId}] ${reason}`);
      await writeDailyLog({
        db,
        userId: group.userId,
        referenceDate: group.referenceDate,
        eventType: DAILY_ERROR_EVENT_TYPE,
        severity: "critical",
        message: reason.slice(0, 500),
        metadata: {
          recipient: group.recipient,
          events_count: payload.eventsCount,
          attempted_at: nowIso,
        },
      });
      console.error(`[agenda-daily-alerts] erro user=${group.userId} date=${group.referenceDate} reason=${reason}`);
      continue;
    }

    sent += 1;
    await writeDailyLog({
      db,
      userId: group.userId,
      referenceDate: group.referenceDate,
      eventType: DAILY_SENT_EVENT_TYPE,
      severity: "info",
      message: `Resumo diario enviado via ${send.provider}.`,
      metadata: {
        recipient: group.recipient,
        events_count: payload.eventsCount,
        provider: send.provider,
        sent_at: nowIso,
      },
    });
    console.info(`[agenda-daily-alerts] enviado user=${group.userId} date=${group.referenceDate} provider=${send.provider}`);
  }

  const processed = grouped.size;
  console.info(`[agenda-daily-alerts] resumo processed=${processed} sent=${sent} skipped=${skipped} failed=${failed}`);
  return {
    processed,
    sent,
    skipped,
    failed,
    errors,
  };
};

async function run(req: NextRequest) {
  const token = getBearerToken(req);
  const cronSecret = process.env.CRON_SECRET ?? "";
  const cronAuthorized = isCronAuthorized(req);
  const isCronCall = cronSecret ? token === cronSecret : req.headers.has("x-vercel-cron");

  const authAttempt = await getUserFromRequest(req);
  if (authAttempt.user && authAttempt.client) {
    try {
      const admin = getAdminClient();
      const result = await runDailyAgendaAlerts({
        db: admin || authAttempt.client,
        userFilter: authAttempt.user.id,
        fallbackEmail: authAttempt.user.email || "",
      });

      return NextResponse.json({
        ok: true,
        mode: "user",
        userId: authAttempt.user.id,
        ...result,
      });
    } catch (error) {
      return NextResponse.json(
        {
          ok: false,
          message: error instanceof Error ? error.message : "Falha ao executar resumo diario da agenda.",
        },
        { status: 500 },
      );
    }
  }

  if (!isCronCall) {
    return NextResponse.json(
      { ok: false, message: authAttempt.error || "Nao autorizado." },
      { status: 401 },
    );
  }

  if (!cronAuthorized) {
    return NextResponse.json({ ok: false, message: "Nao autorizado." }, { status: 401 });
  }

  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json(
      { ok: false, message: "Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY." },
      { status: 500 },
    );
  }

  try {
    const result = await runDailyAgendaAlerts({ db: admin });
    return NextResponse.json({
      ok: true,
      mode: "cron",
      ...result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Falha ao executar resumo diario da agenda.",
      },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  return run(req);
}

export async function POST(req: NextRequest) {
  return run(req);
}
