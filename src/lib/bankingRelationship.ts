import { endOfMonth, format, parseISO, startOfMonth, subDays, subMonths } from "date-fns";
import type { SupabaseClient } from "@supabase/supabase-js";
import { computeCardSummary, type Card, type Transaction } from "@/lib/finance";
import { toNumber } from "@/lib/money";

export type InvestmentInputRow = {
  id: string;
  quantity: number | string | null;
  current_amount: number | string | null;
  invested_amount: number | string | null;
  operation: string | null;
  asset_name: string | null;
  investment_type: string | null;
  updated_at: string | null;
};

export type RelationshipRiskCode =
  | "delay_risk"
  | "limit_high"
  | "score_drop"
  | "spending_spike";

export type RelationshipRiskAlert = {
  code: RelationshipRiskCode;
  severity: "warning" | "critical";
  title: string;
  body: string;
};

export type RelationshipPillars = {
  punctuality: number;
  limitUsage: number;
  investments: number;
  history: number;
  spendingControl: number;
};

export type RelationshipIndicators = {
  cardsCount: number;
  cardsWithOpenInvoice: number;
  overdueInvoices: number;
  dueSoonInvoices: number;
  onTimePaymentRate: number;
  cardLimitUtilizationPct: number;
  activeInvestments: number;
  investedTotal: number;
  incomeCurrentMonth: number;
  expenseCurrentMonth: number;
  expenseDeltaPct: number | null;
  savingsRatePct: number | null;
  activityMonths90d: number;
};

export type RelationshipSummary = {
  score: number;
  previousScore: number | null;
  deltaScore: number | null;
  riskLevel: "excelente" | "bom" | "atencao" | "alto_risco";
  riskLabel: string;
  pillars: RelationshipPillars;
  indicators: RelationshipIndicators;
  recommendations: string[];
  aiRecommendations: string[];
  riskAlerts: RelationshipRiskAlert[];
  updatedAt: string;
};

export type RelationshipHistoryRow = {
  reference_date: string;
  score: number;
  risk_level: string;
  created_at: string;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const round = (value: number) => Math.round(Number.isFinite(value) ? value : 0);
const round2 = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;

const formatPercent = (value: number) => `${value.toFixed(1).replace(".", ",")}%`;

const monthRange = (base: Date) => {
  const start = startOfMonth(base);
  const end = endOfMonth(base);
  return {
    start,
    end,
    startKey: format(start, "yyyy-MM-dd"),
    endKey: format(end, "yyyy-MM-dd"),
  };
};

const parseDate = (value: string) => {
  const parsed = parseISO(value);
  return Number.isNaN(parsed.getTime()) ? new Date(value) : parsed;
};

const inRangeInclusive = (value: Date, start: Date, end: Date) =>
  value >= start && value <= end;

const isExpense = (tx: Transaction) =>
  tx.type === "expense" || tx.type === "card_payment";

const isIncome = (tx: Transaction) =>
  tx.type === "income" || tx.type === "adjustment";

const getLimitUsageScore = (utilizationPct: number, hasCards: boolean) => {
  if (!hasCards) return 75;
  if (utilizationPct <= 30) return 100;
  if (utilizationPct <= 50) return 88;
  if (utilizationPct <= 70) return 68;
  if (utilizationPct <= 85) return 42;
  return 20;
};

const getInvestmentScore = (activeInvestments: number, investedTotal: number) => {
  if (activeInvestments >= 3 && investedTotal >= 1000) return 100;
  if (activeInvestments >= 2 && investedTotal >= 500) return 90;
  if (activeInvestments >= 1 && investedTotal >= 200) return 78;
  if (activeInvestments >= 1) return 68;
  return 45;
};

const getHistoryScore = (activityMonths90d: number, txCount90d: number) => {
  if (activityMonths90d >= 3 && txCount90d >= 30) return 95;
  if (activityMonths90d >= 2 && txCount90d >= 15) return 82;
  if (activityMonths90d >= 1 && txCount90d >= 6) return 68;
  return 50;
};

const getRiskLabel = (riskLevel: RelationshipSummary["riskLevel"]) => {
  if (riskLevel === "excelente") return "Excelente relacionamento";
  if (riskLevel === "bom") return "Bom relacionamento";
  if (riskLevel === "atencao") return "Atencao: precisa melhorar";
  return "Alto risco";
};

const parseAiLines = (raw: string) => {
  return raw
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*.\d)\s]+/, "").trim())
    .filter((line) => line.length > 8)
    .slice(0, 3);
};

const requestAiRecommendations = async ({
  score,
  indicators,
  riskLevel,
}: {
  score: number;
  indicators: RelationshipIndicators;
  riskLevel: RelationshipSummary["riskLevel"];
}) => {
  const apiKey = process.env.OPENAI_API_KEY ?? "";
  if (!apiKey) return [] as string[];

  const prompt = `
Voce e um consultor financeiro pessoal.
Forneca ate 3 dicas curtas e praticas, em portugues, para melhorar score bancario e credito.

Score atual: ${score}
Nivel de risco: ${riskLevel}
Uso de limite: ${formatPercent(indicators.cardLimitUtilizationPct)}
Pontualidade: ${formatPercent(indicators.onTimePaymentRate)}
Delta de despesas: ${indicators.expenseDeltaPct === null ? "sem base" : formatPercent(indicators.expenseDeltaPct)}
Taxa de poupanca: ${indicators.savingsRatePct === null ? "sem base" : formatPercent(indicators.savingsRatePct)}
Investimentos ativos: ${indicators.activeInvestments}
`.trim();

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "Responda com bullets simples, sem markdown extra.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.35,
      }),
    });
    if (!response.ok) return [] as string[];
    const json = await response.json();
    const text = String(json?.choices?.[0]?.message?.content || "");
    return parseAiLines(text);
  } catch {
    return [] as string[];
  }
};

const mapRiskLevel = (score: number): RelationshipSummary["riskLevel"] => {
  if (score >= 85) return "excelente";
  if (score >= 70) return "bom";
  if (score >= 50) return "atencao";
  return "alto_risco";
};

const buildRecommendations = ({
  indicators,
  pillars,
}: {
  indicators: RelationshipIndicators;
  pillars: RelationshipPillars;
}) => {
  const recommendations: string[] = [];

  if (pillars.punctuality < 80 || indicators.dueSoonInvoices > 0 || indicators.overdueInvoices > 0) {
    recommendations.push("Pague faturas antes do vencimento para aumentar confianca bancaria.");
  }

  if (indicators.cardLimitUtilizationPct >= 70) {
    recommendations.push("Mantenha uso do limite abaixo de 70% para melhorar score de credito.");
  } else if (indicators.cardLimitUtilizationPct <= 40 && indicators.cardsCount > 0) {
    recommendations.push("Uso de limite esta saudavel. Continue mantendo consumo consciente.");
  }

  if (indicators.activeInvestments <= 0) {
    recommendations.push("Comece com aportes mensais em investimentos para fortalecer relacionamento financeiro.");
  } else if (indicators.activeInvestments >= 2) {
    recommendations.push("Seu habito de investimento esta positivo para evolucao de credito.");
  }

  if ((indicators.expenseDeltaPct ?? 0) >= 20) {
    recommendations.push("Suas despesas subiram forte. Revise gastos variaveis e defina teto semanal.");
  }

  if ((indicators.savingsRatePct ?? 0) < 10) {
    recommendations.push("Aumente a reserva mensal para pelo menos 10% da receita.");
  } else if ((indicators.savingsRatePct ?? 0) >= 20) {
    recommendations.push("Taxa de poupanca elevada. Isso fortalece seu perfil bancario.");
  }

  if (pillars.history < 70) {
    recommendations.push("Movimente conta com regularidade e mantenha historico financeiro consistente.");
  }

  return Array.from(new Set(recommendations)).slice(0, 6);
};

const buildRiskAlerts = ({
  indicators,
  previousScore,
  score,
}: {
  indicators: RelationshipIndicators;
  previousScore: number | null;
  score: number;
}) => {
  const riskAlerts: RelationshipRiskAlert[] = [];

  if (indicators.overdueInvoices > 0 || indicators.dueSoonInvoices > 0) {
    riskAlerts.push({
      code: "delay_risk",
      severity: indicators.overdueInvoices > 0 ? "critical" : "warning",
      title: indicators.overdueInvoices > 0 ? "Risco alto de atraso" : "Risco de atraso de fatura",
      body:
        indicators.overdueInvoices > 0
          ? `${indicators.overdueInvoices} fatura(s) com vencimento ultrapassado.`
          : `${indicators.dueSoonInvoices} fatura(s) vencem em ate 3 dias sem quitacao total.`,
    });
  }

  if (indicators.cardLimitUtilizationPct >= 70) {
    riskAlerts.push({
      code: "limit_high",
      severity: indicators.cardLimitUtilizationPct >= 85 ? "critical" : "warning",
      title: "Uso de limite elevado",
      body: `Uso atual de limite em ${formatPercent(indicators.cardLimitUtilizationPct)}.`,
    });
  }

  if (previousScore !== null && score <= previousScore - 7) {
    riskAlerts.push({
      code: "score_drop",
      severity: "warning",
      title: "Score bancario em queda",
      body: `Seu score caiu ${previousScore - score} ponto(s) no periodo recente.`,
    });
  }

  if ((indicators.expenseDeltaPct ?? 0) >= 20) {
    riskAlerts.push({
      code: "spending_spike",
      severity: "warning",
      title: "Gastos fora do padrao",
      body: `Despesas subiram ${formatPercent(indicators.expenseDeltaPct || 0)} versus media recente.`,
    });
  }

  return riskAlerts;
};

const expenseForMonth = (transactions: Transaction[], baseDate: Date) => {
  const range = monthRange(baseDate);
  return round2(
    transactions
      .filter((tx) => isExpense(tx))
      .filter((tx) => {
        const occurred = parseDate(tx.occurred_at);
        return inRangeInclusive(occurred, range.start, range.end);
      })
      .reduce((sum, tx) => sum + Math.abs(toNumber(tx.amount)), 0),
  );
};

const incomeForMonth = (transactions: Transaction[], baseDate: Date) => {
  const range = monthRange(baseDate);
  return round2(
    transactions
      .filter((tx) => isIncome(tx))
      .filter((tx) => {
        const occurred = parseDate(tx.occurred_at);
        return inRangeInclusive(occurred, range.start, range.end);
      })
      .reduce((sum, tx) => sum + Math.abs(toNumber(tx.amount)), 0),
  );
};

export const computeBankRelationshipSummary = async ({
  cards,
  transactions,
  investments,
  previousScore,
  now = new Date(),
}: {
  cards: Card[];
  transactions: Transaction[];
  investments: InvestmentInputRow[];
  previousScore: number | null;
  now?: Date;
}): Promise<RelationshipSummary> => {
  const visibleCards = cards.filter((card) => !card.archived);
  const cardById = new Map<string, Card>(visibleCards.map((card) => [card.id, card]));
  const cardSummaries = visibleCards.map((card) => computeCardSummary(card, transactions, now));

  const totalLimit = round2(visibleCards.reduce((sum, card) => sum + Math.max(0, toNumber(card.limit_total)), 0));
  const usedLimit = round2(cardSummaries.reduce((sum, summary) => sum + Math.max(0, toNumber(summary.limitUsed)), 0));
  const utilizationPct = totalLimit > 0 ? (usedLimit / totalLimit) * 100 : 0;

  const cardPayments = transactions.filter((tx) => tx.type === "card_payment" && !!tx.card_id && cardById.has(tx.card_id || ""));
  const onTimePayments = cardPayments.filter((tx) => {
    const card = tx.card_id ? cardById.get(tx.card_id) : null;
    if (!card) return true;
    const occurred = parseDate(tx.occurred_at);
    return occurred.getDate() <= card.due_day;
  });
  const onTimeRate = cardPayments.length
    ? (onTimePayments.length / cardPayments.length) * 100
    : visibleCards.length
      ? 65
      : 80;

  const overdueInvoices = cardSummaries.filter((summary) => summary.currentTotal > 0.009 && summary.dueDate < now).length;
  const dueSoonInvoices = cardSummaries.filter((summary) => {
    if (summary.currentTotal <= 0.009) return false;
    const diff = Math.ceil((summary.dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diff >= 0 && diff <= 3;
  }).length;
  const cardsWithOpenInvoice = cardSummaries.filter((summary) => summary.currentTotal > 0.009).length;

  let punctualityScore = onTimeRate;
  punctualityScore -= overdueInvoices * 25;
  punctualityScore -= dueSoonInvoices * 8;
  if (!cardPayments.length && visibleCards.length) {
    punctualityScore = Math.min(punctualityScore, 70);
  }
  punctualityScore = clamp(round(punctualityScore), 0, 100);

  const activeInvestments = investments.filter((inv) => {
    if ((inv.operation || "").toLowerCase() === "venda") return false;
    const quantity = Math.abs(toNumber(inv.quantity));
    const currentAmount = Math.abs(toNumber(inv.current_amount));
    return quantity > 0 || currentAmount > 0;
  });
  const investedTotal = round2(activeInvestments.reduce((sum, inv) => sum + Math.abs(toNumber(inv.current_amount)), 0));

  const ninetyDaysAgo = subDays(now, 90);
  const tx90 = transactions.filter((tx) => parseDate(tx.occurred_at) >= ninetyDaysAgo);
  const activityMap = new Map<string, number>();
  tx90.forEach((tx) => {
    const key = format(parseDate(tx.occurred_at), "yyyy-MM");
    activityMap.set(key, (activityMap.get(key) || 0) + 1);
  });
  const activityMonths90d = Array.from(activityMap.values()).filter((count) => count >= 8).length;

  const currentExpense = expenseForMonth(transactions, now);
  const currentIncome = incomeForMonth(transactions, now);
  const previousExpenses = [1, 2, 3].map((step) => expenseForMonth(transactions, subMonths(now, step)));
  const previousAvgExpense = previousExpenses.filter((value) => value > 0).length
    ? previousExpenses.reduce((sum, value) => sum + value, 0) / previousExpenses.length
    : 0;

  const expenseDeltaPct = previousAvgExpense > 0
    ? ((currentExpense - previousAvgExpense) / previousAvgExpense) * 100
    : null;
  const savingsRatePct = currentIncome > 0
    ? ((currentIncome - currentExpense) / currentIncome) * 100
    : null;

  let spendingControlScore = 82;
  if ((expenseDeltaPct ?? 0) > 30) spendingControlScore -= 34;
  else if ((expenseDeltaPct ?? 0) > 15) spendingControlScore -= 20;
  else if ((expenseDeltaPct ?? 0) > 5) spendingControlScore -= 10;
  else if ((expenseDeltaPct ?? 0) < -10) spendingControlScore += 8;

  if ((savingsRatePct ?? 0) < 0) spendingControlScore -= 22;
  else if ((savingsRatePct ?? 0) < 10) spendingControlScore -= 12;
  else if ((savingsRatePct ?? 0) >= 20) spendingControlScore += 8;
  spendingControlScore = clamp(round(spendingControlScore), 0, 100);

  const pillars: RelationshipPillars = {
    punctuality: punctualityScore,
    limitUsage: getLimitUsageScore(utilizationPct, visibleCards.length > 0),
    investments: getInvestmentScore(activeInvestments.length, investedTotal),
    history: getHistoryScore(activityMonths90d, tx90.length),
    spendingControl: spendingControlScore,
  };

  const score = clamp(
    round(
      pillars.punctuality * 0.3
      + pillars.limitUsage * 0.25
      + pillars.investments * 0.15
      + pillars.history * 0.15
      + pillars.spendingControl * 0.15,
    ),
    0,
    100,
  );

  const riskLevel = mapRiskLevel(score);
  const indicators: RelationshipIndicators = {
    cardsCount: visibleCards.length,
    cardsWithOpenInvoice,
    overdueInvoices,
    dueSoonInvoices,
    onTimePaymentRate: round2(onTimeRate),
    cardLimitUtilizationPct: round2(utilizationPct),
    activeInvestments: activeInvestments.length,
    investedTotal,
    incomeCurrentMonth: currentIncome,
    expenseCurrentMonth: currentExpense,
    expenseDeltaPct: expenseDeltaPct === null ? null : round2(expenseDeltaPct),
    savingsRatePct: savingsRatePct === null ? null : round2(savingsRatePct),
    activityMonths90d,
  };

  const recommendations = buildRecommendations({ indicators, pillars });
  const aiRecommendations = await requestAiRecommendations({
    score,
    indicators,
    riskLevel,
  });

  const riskAlerts = buildRiskAlerts({
    indicators,
    previousScore,
    score,
  });

  return {
    score,
    previousScore,
    deltaScore: previousScore === null ? null : score - previousScore,
    riskLevel,
    riskLabel: getRiskLabel(riskLevel),
    pillars,
    indicators,
    recommendations,
    aiRecommendations,
    riskAlerts,
    updatedAt: new Date().toISOString(),
  };
};

export const isRelationshipTableMissing = (message?: string | null) =>
  /relation .*banking_relationship_scores/i.test(message || "");

export const isRelationshipAlertTypeMissing = (message?: string | null) =>
  /invalid input value for enum alert_type/i.test(message || "");

export const fetchRelationshipHistory = async ({
  db,
  userId,
  limit = 30,
}: {
  db: SupabaseClient;
  userId: string;
  limit?: number;
}) => {
  return db
    .from("banking_relationship_scores")
    .select("reference_date, score, risk_level, created_at")
    .eq("user_id", userId)
    .order("reference_date", { ascending: false })
    .limit(limit);
};

export const upsertRelationshipSnapshot = async ({
  db,
  userId,
  summary,
  now = new Date(),
}: {
  db: SupabaseClient;
  userId: string;
  summary: RelationshipSummary;
  now?: Date;
}) => {
  const referenceDate = format(now, "yyyy-MM-dd");
  const monthRef = format(startOfMonth(now), "yyyy-MM-dd");

  return db
    .from("banking_relationship_scores")
    .upsert(
      {
        user_id: userId,
        reference_date: referenceDate,
        month_ref: monthRef,
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
      {
        onConflict: "user_id,reference_date",
      },
    );
};

const relationshipAlertTypeByCode: Record<RelationshipRiskCode, string> = {
  delay_risk: "relationship_delay_risk",
  limit_high: "relationship_limit_high",
  score_drop: "relationship_score_drop",
  spending_spike: "relationship_spending_spike",
};

export const createRelationshipInternalAlerts = async ({
  db,
  userId,
  summary,
}: {
  db: SupabaseClient;
  userId: string;
  summary: RelationshipSummary;
}) => {
  if (!summary.riskAlerts.length) return { created: 0, skipped: 0, error: null as string | null };

  const cutoff = new Date(Date.now() - 18 * 60 * 60 * 1000).toISOString();
  let created = 0;
  let skipped = 0;

  for (const risk of summary.riskAlerts) {
    const alertType = relationshipAlertTypeByCode[risk.code];
    const existsRes = await db
      .from("alerts")
      .select("id")
      .eq("user_id", userId)
      .eq("type", alertType)
      .eq("title", risk.title)
      .gte("created_at", cutoff)
      .limit(1)
      .maybeSingle();

    if (!existsRes.error && existsRes.data?.id) {
      skipped += 1;
      continue;
    }

    const insertRes = await db
      .from("alerts")
      .insert({
        user_id: userId,
        card_id: null,
        type: alertType,
        title: risk.title,
        body: risk.body,
        due_at: null,
        is_read: false,
      });

    if (insertRes.error) {
      return {
        created,
        skipped,
        error: insertRes.error.message || "Falha ao criar alerta interno.",
      };
    }

    created += 1;
  }

  return { created, skipped, error: null as string | null };
};

