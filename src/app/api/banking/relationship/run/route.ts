import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getAdminClient,
  getBearerToken,
  getUserFromRequest,
  isCronAuthorized,
} from "@/lib/apiAuth";
import type { Card, Transaction } from "@/lib/finance";
import {
  computeBankRelationshipSummary,
  createRelationshipInternalAlerts,
  fetchRelationshipHistory,
  isRelationshipAlertTypeMissing,
  isRelationshipTableMissing,
  type InvestmentInputRow,
  type RelationshipHistoryRow,
} from "@/lib/bankingRelationship";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const getUserInputs = async ({
  db,
  userId,
}: {
  db: SupabaseClient;
  userId: string;
}) => {
  const [cardsRes, txRes, investmentsRes] = await Promise.all([
    db
      .from("cards")
      .select("id, name, issuer, limit_total, closing_day, due_day, archived, created_at")
      .eq("user_id", userId),
    db
      .from("transactions")
      .select("id, occurred_at, type, transaction_type, description, category, amount, account_id, to_account_id, card_id, tags, note")
      .eq("user_id", userId)
      .order("occurred_at", { ascending: false })
      .limit(2500),
    db
      .from("investments")
      .select("id, quantity, current_amount, invested_amount, operation, asset_name, investment_type, updated_at")
      .eq("user_id", userId),
  ]);

  if (cardsRes.error || txRes.error || investmentsRes.error) {
    throw new Error(cardsRes.error?.message || txRes.error?.message || investmentsRes.error?.message || "Falha ao carregar dados do usuario.");
  }

  return {
    cards: (cardsRes.data || []) as Card[],
    transactions: (txRes.data || []) as Transaction[],
    investments: (investmentsRes.data || []) as InvestmentInputRow[],
  };
};

const runForUser = async ({
  db,
  userId,
}: {
  db: SupabaseClient;
  userId: string;
}) => {
  const warnings: string[] = [];
  let previousScore: number | null = null;
  let historyRows: RelationshipHistoryRow[] = [];

  const historyRes = await fetchRelationshipHistory({
    db,
    userId,
    limit: 24,
  });

  if (historyRes.error) {
    if (isRelationshipTableMissing(historyRes.error.message)) {
      warnings.push("Tabela banking_relationship_scores nao encontrada.");
    } else {
      throw new Error(historyRes.error.message || "Falha ao ler historico.");
    }
  } else {
    historyRows = (historyRes.data || []) as RelationshipHistoryRow[];
    previousScore = historyRows[0]?.score ?? null;
  }

  const inputs = await getUserInputs({ db, userId });
  const summary = await computeBankRelationshipSummary({
    cards: inputs.cards,
    transactions: inputs.transactions,
    investments: inputs.investments,
    previousScore,
    now: new Date(),
  });

  if (!warnings.length) {
    const upsertRes = await db
      .from("banking_relationship_scores")
      .upsert(
        {
          user_id: userId,
          reference_date: new Date().toISOString().slice(0, 10),
          month_ref: `${new Date().toISOString().slice(0, 7)}-01`,
          score: summary.score,
          punctuality_score: summary.pillars.punctuality,
          limit_usage_score: summary.pillars.limitUsage,
          investment_score: summary.pillars.investments,
          history_score: summary.pillars.history,
          spending_control_score: summary.pillars.spendingControl,
          risk_level: summary.riskLevel,
          recommendations: summary.recommendations,
          ai_recommendations: summary.aiRecommendations,
          indicators: summary.indicators,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,reference_date" },
      );

    if (upsertRes.error) {
      if (isRelationshipTableMissing(upsertRes.error.message)) {
        warnings.push("Tabela banking_relationship_scores nao encontrada.");
      } else {
        throw new Error(upsertRes.error.message || "Falha ao salvar score.");
      }
    }
  }

  const alertRes = await createRelationshipInternalAlerts({
    db,
    userId,
    summary,
  });

  if (alertRes.error) {
    if (isRelationshipAlertTypeMissing(alertRes.error)) {
      warnings.push("Tipos de alerta de relacionamento nao encontrados.");
    } else if (/relation .*alerts/i.test(alertRes.error || "")) {
      warnings.push("Tabela alerts nao encontrada.");
    } else {
      warnings.push(alertRes.error);
    }
  }

  const refreshedHistoryRes = await fetchRelationshipHistory({
    db,
    userId,
    limit: 24,
  });

  const history = refreshedHistoryRes.error
    ? historyRows
    : ((refreshedHistoryRes.data || []) as RelationshipHistoryRow[]);

  return {
    summary,
    history,
    warnings,
    alertsCreated: alertRes.created,
  };
};

const collectUserIdsForCron = async (admin: SupabaseClient) => {
  const [txRes, cardsRes, invRes] = await Promise.all([
    admin.from("transactions").select("user_id").gte("occurred_at", "2020-01-01").limit(8000),
    admin.from("cards").select("user_id").limit(4000),
    admin.from("investments").select("user_id").limit(4000),
  ]);

  if (txRes.error && cardsRes.error && invRes.error) {
    throw new Error(txRes.error?.message || cardsRes.error?.message || invRes.error?.message || "Falha ao listar usuarios.");
  }

  const users = new Set<string>();
  ((txRes.data || []) as Array<{ user_id: string }>).forEach((row) => row.user_id && users.add(row.user_id));
  ((cardsRes.data || []) as Array<{ user_id: string }>).forEach((row) => row.user_id && users.add(row.user_id));
  ((invRes.data || []) as Array<{ user_id: string }>).forEach((row) => row.user_id && users.add(row.user_id));
  return Array.from(users);
};

async function runRelationship(req: NextRequest) {
  const bearerToken = getBearerToken(req);
  const cronSecret = process.env.CRON_SECRET ?? "";
  const cronAuthorized = isCronAuthorized(req);
  const isCronCall = cronSecret
    ? bearerToken === cronSecret
    : req.headers.has("x-vercel-cron");

  const authUser = await getUserFromRequest(req);
  if (authUser.user && authUser.client) {
    try {
      const result = await runForUser({
        db: authUser.client,
        userId: authUser.user.id,
      });
      return NextResponse.json({
        ok: true,
        mode: "user",
        summary: result.summary,
        history: result.history,
        warnings: result.warnings,
        alertsCreated: result.alertsCreated,
      });
    } catch (runError) {
      return NextResponse.json(
        {
          ok: false,
          message: runError instanceof Error ? runError.message : "Falha ao executar score bancario.",
        },
        { status: 500 },
      );
    }
  }

  if (!isCronCall) {
    return NextResponse.json(
      { ok: false, message: authUser.error || "Nao autorizado." },
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
    const userIds = await collectUserIdsForCron(admin);
    let processed = 0;
    let failed = 0;
    let alertsCreated = 0;
    const warnings: string[] = [];
    const errors: string[] = [];

    for (const userId of userIds) {
      try {
        const result = await runForUser({
          db: admin,
          userId,
        });
        processed += 1;
        alertsCreated += result.alertsCreated;
        if (result.warnings.length) {
          warnings.push(...result.warnings.map((item) => `[${userId}] ${item}`));
        }
      } catch (itemError) {
        failed += 1;
        errors.push(`[${userId}] ${itemError instanceof Error ? itemError.message : "Erro ao processar usuario."}`);
      }
    }

    return NextResponse.json({
      ok: true,
      mode: "cron",
      checked: userIds.length,
      processed,
      failed,
      alertsCreated,
      warnings,
      errors,
    });
  } catch (cronError) {
    return NextResponse.json(
      {
        ok: false,
        message: cronError instanceof Error ? cronError.message : "Falha ao executar cron de relacionamento bancario.",
      },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  return runRelationship(req);
}

export async function POST(req: NextRequest) {
  return runRelationship(req);
}
