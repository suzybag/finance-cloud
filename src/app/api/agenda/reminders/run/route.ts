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

type AgendaReminderRow = {
  id: string;
  user_id: string;
  user_email: string;
  title: string;
  description: string | null;
  event_at: string;
  alert_at: string;
  timezone: string | null;
  alert_enabled: boolean;
  email_sent_at: string | null;
  last_attempt_at: string | null;
  attempt_count: number | null;
  email_error: string | null;
};

const MAX_BATCH_SIZE = 300;

const mapTableHint = (message?: string | null) => {
  const text = message || "";
  if (/relation .*agenda_events/i.test(text)) return "Tabela agenda_events nao encontrada.";
  return null;
};

const formatDateTimeInTimezone = (isoDate: string, timezone: string) => {
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

const formatDateKeyInTimezone = (isoDate: string, timezone: string) => {
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
  }).format(parsed);
};

const runAgendaReminders = async ({
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

  let query = db
    .from("agenda_events")
    .select(
      "id, user_id, user_email, title, description, event_at, alert_at, timezone, alert_enabled, email_sent_at, last_attempt_at, attempt_count, email_error",
    )
    .eq("alert_enabled", true)
    .is("email_sent_at", null)
    .lte("alert_at", nowIso)
    .order("alert_at", { ascending: true })
    .limit(MAX_BATCH_SIZE);

  if (userFilter) {
    query = query.eq("user_id", userFilter);
  }

  const remindersRes = await query;
  if (remindersRes.error) {
    const hint = mapTableHint(remindersRes.error.message);
    throw new Error(hint ? `${hint} Rode o supabase.sql atualizado.` : remindersRes.error.message);
  }

  const reminders = (remindersRes.data || []) as AgendaReminderRow[];
  if (!reminders.length) {
    return {
      processed: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      errors: [] as string[],
    };
  }

  const errors: string[] = [];
  let processed = 0;
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of reminders) {
    processed += 1;

    const timezone = row.timezone || "America/Sao_Paulo";
    const eventDateText = formatDateTimeInTimezone(row.event_at, timezone);
    const todayKey = formatDateKeyInTimezone(nowIso, timezone);
    const eventDayKey = formatDateKeyInTimezone(row.event_at, timezone);

    const recipient = (row.user_email || "").trim() || (fallbackEmail || "").trim();
    if (!recipient) {
      skipped += 1;
      await db
        .from("agenda_events")
        .update({
          last_attempt_at: nowIso,
          attempt_count: (row.attempt_count || 0) + 1,
          email_error: "Usuario sem email para envio.",
        })
        .eq("id", row.id)
        .eq("user_id", row.user_id);
      continue;
    }

    const title = `Lembrete Finance Cloud: ${row.title}`;
    const mainLine = todayKey && todayKey === eventDayKey
      ? `Hoje voce tem compromisso: ${row.title}.`
      : `Lembrete do seu compromisso: ${row.title}.`;
    const ruleLine = `Data/hora do compromisso: ${eventDateText} (${timezone}).`;
    const descriptionLine = row.description ? `Descricao: ${row.description}` : "";

    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.5;color:#0f172a;">
        <h2 style="margin:0 0 12px 0;color:#111827;">${title}</h2>
        <p style="margin:0 0 10px 0;">${mainLine}</p>
        <p style="margin:0 0 10px 0;">${ruleLine}</p>
        ${descriptionLine ? `<p style="margin:0 0 10px 0;">${descriptionLine}</p>` : ""}
        <p style="margin:0;color:#475569;">Enviado em: ${now.toLocaleString("pt-BR")}</p>
      </div>
    `;

    const text = [title, mainLine, ruleLine, descriptionLine, `Enviado em: ${now.toLocaleString("pt-BR")}`]
      .filter(Boolean)
      .join("\n");

    const send = await sendEmailAlert({
      to: recipient,
      subject: title,
      html,
      text,
    });

    if (!send.ok) {
      failed += 1;
      const reason = send.error || "Falha no envio de email.";
      errors.push(`[${row.id}] ${reason}`);
      await db
        .from("agenda_events")
        .update({
          last_attempt_at: nowIso,
          attempt_count: (row.attempt_count || 0) + 1,
          email_error: reason.slice(0, 500),
        })
        .eq("id", row.id)
        .eq("user_id", row.user_id);
      continue;
    }

    sent += 1;
    await db
      .from("agenda_events")
      .update({
        email_sent_at: nowIso,
        last_attempt_at: nowIso,
        attempt_count: (row.attempt_count || 0) + 1,
        email_error: null,
      })
      .eq("id", row.id)
      .eq("user_id", row.user_id);
  }

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
      const result = await runAgendaReminders({
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
          message: error instanceof Error ? error.message : "Falha ao executar lembretes.",
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
    const result = await runAgendaReminders({ db: admin });
    return NextResponse.json({
      ok: true,
      mode: "cron",
      ...result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Falha ao executar lembretes.",
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
