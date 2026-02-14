import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getUserFromRequest } from "@/lib/apiAuth";
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

const fetchRelationshipInputs = async ({
  userId,
  client,
}: {
  userId: string;
  client: SupabaseClient;
}) => {
  const [cardsRes, txRes, investmentsRes] = await Promise.all([
    client
      .from("cards")
      .select("id, name, issuer, limit_total, closing_day, due_day, archived, created_at")
      .eq("user_id", userId),
    client
      .from("transactions")
      .select("id, occurred_at, type, transaction_type, description, category, amount, account_id, to_account_id, card_id, tags, note")
      .eq("user_id", userId)
      .order("occurred_at", { ascending: false })
      .limit(2500),
    client
      .from("investments")
      .select("id, quantity, current_amount, invested_amount, operation, asset_name, investment_type, updated_at")
      .eq("user_id", userId),
  ]);

  if (cardsRes.error || txRes.error || investmentsRes.error) {
    throw new Error(cardsRes.error?.message || txRes.error?.message || investmentsRes.error?.message || "Falha ao carregar dados.");
  }

  return {
    cards: (cardsRes.data || []) as Card[],
    transactions: (txRes.data || []) as Transaction[],
    investments: (investmentsRes.data || []) as InvestmentInputRow[],
  };
};

export async function GET(req: NextRequest) {
  const { user, client, error } = await getUserFromRequest(req);
  if (!user || !client || error) {
    return NextResponse.json({ ok: false, message: error || "Nao autorizado." }, { status: 401 });
  }

  const warnings: string[] = [];

  let previousScore: number | null = null;
  let historyRows: RelationshipHistoryRow[] = [];

  const historyRes = await fetchRelationshipHistory({
    db: client,
    userId: user.id,
    limit: 40,
  });

  if (historyRes.error) {
    if (isRelationshipTableMissing(historyRes.error.message)) {
      warnings.push("Tabela banking_relationship_scores nao encontrada. Rode o supabase.sql atualizado.");
    } else {
      return NextResponse.json({ ok: false, message: historyRes.error.message }, { status: 500 });
    }
  } else {
    historyRows = (historyRes.data || []) as RelationshipHistoryRow[];
    previousScore = historyRows[0]?.score ?? null;
  }

  try {
    const { cards, transactions, investments } = await fetchRelationshipInputs({
      userId: user.id,
      client,
    });

    const summary = await computeBankRelationshipSummary({
      cards,
      transactions,
      investments,
      previousScore,
      now: new Date(),
    });

    if (!warnings.length) {
      const upsertRes = await client
        .from("banking_relationship_scores")
        .upsert(
          {
            user_id: user.id,
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

      if (upsertRes.error && !isRelationshipTableMissing(upsertRes.error.message)) {
        return NextResponse.json({ ok: false, message: upsertRes.error.message }, { status: 500 });
      }

      if (upsertRes.error && isRelationshipTableMissing(upsertRes.error.message)) {
        warnings.push("Tabela banking_relationship_scores nao encontrada. Rode o supabase.sql atualizado.");
      }
    }

    const alertRes = await createRelationshipInternalAlerts({
      db: client,
      userId: user.id,
      summary,
    });

    if (alertRes.error) {
      if (isRelationshipAlertTypeMissing(alertRes.error)) {
        warnings.push("Tipos de alerta de relacionamento nao encontrados. Rode o supabase.sql atualizado.");
      } else if (/relation .*alerts/i.test(alertRes.error || "")) {
        warnings.push("Tabela alerts nao encontrada. Rode o supabase.sql atualizado.");
      } else {
        warnings.push(alertRes.error);
      }
    }

    const refreshedHistoryRes = await fetchRelationshipHistory({
      db: client,
      userId: user.id,
      limit: 24,
    });

    const history = refreshedHistoryRes.error
      ? historyRows
      : ((refreshedHistoryRes.data || []) as RelationshipHistoryRow[]);

    return NextResponse.json({
      ok: true,
      summary,
      history,
      alertsCreated: alertRes.created,
      warnings,
    });
  } catch (summaryError) {
    return NextResponse.json(
      {
        ok: false,
        message: summaryError instanceof Error ? summaryError.message : "Falha ao calcular relacionamento bancario.",
      },
      { status: 500 },
    );
  }
}
