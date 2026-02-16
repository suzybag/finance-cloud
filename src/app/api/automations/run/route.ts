import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getAdminClient,
  getBearerToken,
  getUserFromRequest,
  isCronAuthorized,
} from "@/lib/apiAuth";
import {
  ensureAutomationSettings,
  fetchDollarBid,
  normalizeAutomationSettings,
  runUserAutomation,
} from "@/lib/automationEngine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type AutomationSettingsRow = {
  user_id: string;
  enabled: boolean;
  push_enabled: boolean;
  email_enabled: boolean;
  internal_enabled: boolean;
  card_due_days: number;
  dollar_upper: number | null;
  dollar_lower: number | null;
  investment_drop_pct: number;
  spending_spike_pct: number;
  monthly_report_enabled: boolean;
  market_refresh_enabled: boolean;
  config: Record<string, unknown> | null;
};

const mapTableHint = (message?: string | null) => {
  const text = message || "";
  if (/relation .*automations/i.test(text)) return "Tabela automations nao encontrada.";
  if (/relation .*insights/i.test(text)) return "Tabela insights nao encontrada.";
  if (/relation .*recurring_subscriptions/i.test(text)) return "Tabela recurring_subscriptions nao encontrada.";
  if (/relation .*subscriptions/i.test(text)) return "Tabela subscriptions nao encontrada.";
  if (/relation .*alerts/i.test(text)) return "Tabela alerts nao encontrada.";
  return null;
};

const runForSingleUser = async ({
  db,
  userId,
  userEmail,
  settingsRow,
  dollarBid,
}: {
  db: SupabaseClient;
  userId: string;
  userEmail: string;
  settingsRow?: Partial<AutomationSettingsRow> | null;
  dollarBid: number;
}) => {
  const base = settingsRow
    ? settingsRow
    : await ensureAutomationSettings(db, userId);
  const settings = normalizeAutomationSettings(base);

  if (!settings.enabled) {
    await db
      .from("automations")
      .update({
        last_run_at: new Date().toISOString(),
        last_status: "skipped",
        last_error: null,
      })
      .eq("user_id", userId);

    return {
      userId,
      skipped: true,
      result: null,
    };
  }

  const result = await runUserAutomation({
    admin: db,
    userId,
    userEmail,
    settings,
    dollarBid,
  });

  await db
    .from("automations")
    .update({
      last_run_at: new Date().toISOString(),
      last_status: "success",
      last_error: null,
    })
    .eq("user_id", userId);

  return {
    userId,
    skipped: false,
    result,
  };
};

async function runAutomations(req: NextRequest) {
  const bearerToken = getBearerToken(req);
  const cronSecret = process.env.CRON_SECRET ?? "";
  const cronAuthorized = isCronAuthorized(req);
  const isCronCall = cronSecret
    ? bearerToken === cronSecret
    : req.headers.has("x-vercel-cron");

  const authAttempt = await getUserFromRequest(req);
  if (authAttempt.user && authAttempt.client) {
    try {
      const settingsRow = await ensureAutomationSettings(authAttempt.client, authAttempt.user.id);
      let dollarBid = 0;
      try {
        dollarBid = await fetchDollarBid();
      } catch {
        dollarBid = 0;
      }

      const run = await runForSingleUser({
        db: authAttempt.client,
        userId: authAttempt.user.id,
        userEmail: authAttempt.user.email || "",
        settingsRow,
        dollarBid,
      });

      return NextResponse.json({
        ok: true,
        mode: "user",
        userId: authAttempt.user.id,
        skipped: run.skipped,
        result: run.result,
        dollarBid,
      });
    } catch (runError) {
      const message = runError instanceof Error ? runError.message : "Falha ao executar automacao.";
      const hint = mapTableHint(message);
      return NextResponse.json(
        {
          ok: false,
          message: hint ? `${hint} Rode o supabase.sql atualizado.` : message,
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

  const automationsRes = await admin
    .from("automations")
    .select(
      "user_id, enabled, push_enabled, email_enabled, internal_enabled, card_due_days, dollar_upper, dollar_lower, investment_drop_pct, spending_spike_pct, monthly_report_enabled, market_refresh_enabled, config",
    )
    .eq("enabled", true);

  if (automationsRes.error) {
    const hint = mapTableHint(automationsRes.error.message);
    return NextResponse.json(
      {
        ok: false,
        message: hint ? `${hint} Rode o supabase.sql atualizado.` : automationsRes.error.message,
      },
      { status: 500 },
    );
  }

  const settingsRows = (automationsRes.data || []) as AutomationSettingsRow[];
  if (!settingsRows.length) {
    return NextResponse.json({
      ok: true,
      mode: "cron",
      checked: 0,
      processed: 0,
      skipped: 0,
      failed: 0,
      totalEvents: 0,
      totalInsights: 0,
      totalCategorized: 0,
      errors: [],
    });
  }

  let dollarBid = 0;
  try {
    dollarBid = await fetchDollarBid();
  } catch {
    dollarBid = 0;
  }

  let checked = 0;
  let processed = 0;
  let skipped = 0;
  let failed = 0;
  let totalEvents = 0;
  let totalInsights = 0;
  let totalCategorized = 0;
  const errors: string[] = [];

  for (const row of settingsRows) {
    checked += 1;

    const userRes = await admin.auth.admin.getUserById(row.user_id);
    const email = userRes.data.user?.email || "";

    try {
      const run = await runForSingleUser({
        db: admin,
        userId: row.user_id,
        userEmail: email,
        settingsRow: row,
        dollarBid,
      });

      if (run.skipped || !run.result) {
        skipped += 1;
        continue;
      }

      processed += 1;
      totalEvents += run.result.events.length;
      totalInsights += run.result.insightsCreated;
      totalCategorized += run.result.categorized;
    } catch (itemError) {
      failed += 1;
      const message = itemError instanceof Error ? itemError.message : "Erro ao processar usuario.";
      errors.push(`[${row.user_id}] ${message}`);

      await admin
        .from("automations")
        .update({
          last_run_at: new Date().toISOString(),
          last_status: "error",
          last_error: message.slice(0, 500),
        })
        .eq("user_id", row.user_id);
    }
  }

  return NextResponse.json({
    ok: true,
    mode: "cron",
    checked,
    processed,
    skipped,
    failed,
    totalEvents,
    totalInsights,
    totalCategorized,
    dollarBid,
    errors,
  });
}

export async function GET(req: NextRequest) {
  return runAutomations(req);
}

export async function POST(req: NextRequest) {
  return runAutomations(req);
}
