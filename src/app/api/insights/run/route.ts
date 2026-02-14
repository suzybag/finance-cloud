import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/apiAuth";
import {
  ensureAutomationSettings,
  fetchDollarBid,
  normalizeAutomationSettings,
  runUserAutomation,
} from "@/lib/automationEngine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const mapTableHint = (message?: string | null) => {
  const text = message || "";
  if (/relation .*automations/i.test(text)) return "Tabela automations nao encontrada.";
  if (/relation .*insights/i.test(text)) return "Tabela insights nao encontrada.";
  if (/relation .*subscriptions/i.test(text)) return "Tabela subscriptions nao encontrada.";
  if (/relation .*alerts/i.test(text)) return "Tabela alerts nao encontrada.";
  return null;
};

async function runInsights(req: NextRequest) {
  const { user, client, error } = await getUserFromRequest(req);
  if (!user || !client || error) {
    return NextResponse.json({ ok: false, message: error || "Nao autorizado." }, { status: 401 });
  }

  try {
    const settingsRow = await ensureAutomationSettings(client, user.id);
    const settings = normalizeAutomationSettings(settingsRow);

    let dollarBid = 0;
    try {
      dollarBid = await fetchDollarBid();
    } catch {
      dollarBid = 0;
    }

    const result = await runUserAutomation({
      admin: client,
      userId: user.id,
      userEmail: user.email || "",
      settings,
      dollarBid,
    });

    await client
      .from("automations")
      .update({
        last_run_at: new Date().toISOString(),
        last_status: "success",
        last_error: null,
      })
      .eq("user_id", user.id);

    return NextResponse.json({
      ok: true,
      result,
      dollarBid,
    });
  } catch (runError) {
    const message = runError instanceof Error ? runError.message : "Falha ao executar insights.";
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

export async function GET(req: NextRequest) {
  return runInsights(req);
}

export async function POST(req: NextRequest) {
  return runInsights(req);
}
