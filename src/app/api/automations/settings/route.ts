import { NextRequest, NextResponse } from "next/server";
import { getAdminClient, getUserFromRequest } from "@/lib/apiAuth";
import {
  ensureAutomationSettings,
  normalizeAutomationSettings,
} from "@/lib/automationEngine";
import { hasPushConfig } from "@/lib/pushServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type SettingsBody = Partial<{
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
  config: Record<string, unknown>;
}>;

const mapTableHint = (message?: string | null) => {
  const text = message || "";
  if (/relation .*automations/i.test(text)) return "Tabela automations nao encontrada.";
  return null;
};

export async function GET(req: NextRequest) {
  const { user, error } = await getUserFromRequest(req);
  if (!user || error) {
    return NextResponse.json({ ok: false, message: error || "Nao autorizado." }, { status: 401 });
  }

  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json(
      { ok: false, message: "Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY." },
      { status: 500 },
    );
  }

  try {
    const row = await ensureAutomationSettings(admin, user.id);
    const settings = normalizeAutomationSettings(row);
    return NextResponse.json({
      ok: true,
      settings,
      pushConfigured: hasPushConfig(),
      lastRunAt: row.last_run_at || null,
      lastStatus: row.last_status || null,
      lastError: row.last_error || null,
    });
  } catch (loadError) {
    const message = loadError instanceof Error ? loadError.message : "Falha ao carregar automacoes.";
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

export async function POST(req: NextRequest) {
  const { user, error } = await getUserFromRequest(req);
  if (!user || error) {
    return NextResponse.json({ ok: false, message: error || "Nao autorizado." }, { status: 401 });
  }

  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json(
      { ok: false, message: "Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY." },
      { status: 500 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as SettingsBody;

  try {
    const current = await ensureAutomationSettings(admin, user.id);
    const merged = normalizeAutomationSettings({
      ...current,
      ...body,
      config:
        body.config && typeof body.config === "object"
          ? body.config
          : current.config,
    });

    const { data, error: updateError } = await admin
      .from("automations")
      .update({
        ...merged,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id)
      .select("*")
      .single();

    if (updateError || !data) {
      throw new Error(updateError?.message || "Falha ao salvar automacoes.");
    }

    return NextResponse.json({
      ok: true,
      settings: normalizeAutomationSettings(data),
      pushConfigured: hasPushConfig(),
      lastRunAt: data.last_run_at || null,
      lastStatus: data.last_status || null,
      lastError: data.last_error || null,
    });
  } catch (saveError) {
    const message = saveError instanceof Error ? saveError.message : "Falha ao salvar automacoes.";
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
