import type { SupabaseClient } from "@supabase/supabase-js";
import { differenceInCalendarDays } from "date-fns";
import { computeCardSummary, type Card, type Transaction } from "@/lib/finance";
import { toNumber } from "@/lib/money";
import { sendEmailAlert } from "@/lib/emailAlerts";
import { sendPushToUser } from "@/lib/pushServer";
import { getMonthRanges, normalizeMonthKey } from "@/lib/monthlyReports";

type AutomationRow = {
  id: string;
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
  last_run_at: string | null;
  last_status: string | null;
  last_error: string | null;
  config: Record<string, unknown> | null;
};

type ExpenseRow = {
  id: string;
  occurred_at: string;
  type: "expense" | "card_payment";
  transaction_type: string | null;
  description: string;
  category: string | null;
  amount: number;
};

type InsightRowInsert = {
  user_id: string;
  period: string;
  insight_type: string;
  title: string;
  body: string;
  severity: "info" | "warning" | "critical" | "success";
  source: "automation" | "ai";
  metadata: Record<string, unknown>;
};

type AutomationEvent = {
  alertType:
    | "card_closing_soon"
    | "card_due_soon"
    | "investment_drop"
    | "dollar_threshold"
    | "spending_spike"
    | "forecast_warning";
  title: string;
  body: string;
  dueAt?: string | null;
  cardId?: string | null;
};

type InvestmentRow = {
  id: string;
  asset_name: string | null;
  investment_type: string | null;
  quantity: number | null;
  current_price: number | null;
  average_price: number | null;
  current_amount: number | null;
  price_history: number[] | null;
};

type RunUserAutomationResult = {
  userId: string;
  events: AutomationEvent[];
  insightsCreated: number;
  categorized: number;
};

const DEFAULT_AUTOMATION_SETTINGS = {
  enabled: true,
  push_enabled: true,
  email_enabled: true,
  internal_enabled: true,
  card_due_days: 3,
  dollar_upper: null as number | null,
  dollar_lower: null as number | null,
  investment_drop_pct: 2,
  spending_spike_pct: 20,
  monthly_report_enabled: true,
  market_refresh_enabled: true,
  config: {} as Record<string, unknown>,
};

const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

const CATEGORY_RULES: Array<{ category: string; terms: string[] }> = [
  { category: "Alimentacao", terms: ["ifood", "restaurante", "lanche", "pizza", "hamburg", "padaria", "mercado", "supermercado", "delivery"] },
  { category: "Transporte", terms: ["uber", "99", "combustivel", "gasolina", "posto", "onibus", "metro", "estacionamento", "pedagio"] },
  { category: "Moradia", terms: ["aluguel", "condominio", "energia", "luz", "agua", "gas", "internet", "telefone"] },
  { category: "Saude", terms: ["farmacia", "medico", "hospital", "plano de saude", "clinica", "exame"] },
  { category: "Assinaturas", terms: ["netflix", "spotify", "prime", "disney", "hbo", "youtube", "assinatura", "icloud"] },
  { category: "Lazer", terms: ["cinema", "show", "bar", "viagem", "hotel", "jogo", "stream"] },
  { category: "Educacao", terms: ["curso", "faculdade", "livro", "udemy", "alura", "escola"] },
  { category: "Investimentos", terms: ["corretora", "tesouro", "cdb", "fii", "acao", "crypto", "bitcoin", "eth"] },
];

const normalizeText = (value?: string | null) =>
  (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const round2 = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  }).format(round2(value));

const formatPercent = (value: number) => `${value.toFixed(2).replace(".", ",")}%`;

const sanitizeNumber = (value: unknown, fallback: number) => {
  const parsed = toNumber(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const sanitizeBoolean = (value: unknown, fallback: boolean) => {
  if (typeof value === "boolean") return value;
  return fallback;
};

const sanitizeNullableNumber = (value: unknown) => {
  if (value === null || typeof value === "undefined" || value === "") return null;
  const parsed = toNumber(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const pickCategory = (description: string, currentCategory?: string | null) => {
  const existing = (currentCategory || "").trim();
  if (existing) return existing;

  const normalized = normalizeText(description);
  for (const rule of CATEGORY_RULES) {
    if (rule.terms.some((term) => normalized.includes(term))) {
      return rule.category;
    }
  }

  return "Outros";
};

export const normalizeAutomationSettings = (row?: Partial<AutomationRow> | null) => ({
  enabled: sanitizeBoolean(row?.enabled, DEFAULT_AUTOMATION_SETTINGS.enabled),
  push_enabled: sanitizeBoolean(row?.push_enabled, DEFAULT_AUTOMATION_SETTINGS.push_enabled),
  email_enabled: sanitizeBoolean(row?.email_enabled, DEFAULT_AUTOMATION_SETTINGS.email_enabled),
  internal_enabled: sanitizeBoolean(row?.internal_enabled, DEFAULT_AUTOMATION_SETTINGS.internal_enabled),
  card_due_days: Math.min(10, Math.max(1, Math.round(sanitizeNumber(row?.card_due_days, DEFAULT_AUTOMATION_SETTINGS.card_due_days)))),
  dollar_upper: sanitizeNullableNumber(row?.dollar_upper),
  dollar_lower: sanitizeNullableNumber(row?.dollar_lower),
  investment_drop_pct: Math.min(50, Math.max(0.5, sanitizeNumber(row?.investment_drop_pct, DEFAULT_AUTOMATION_SETTINGS.investment_drop_pct))),
  spending_spike_pct: Math.min(100, Math.max(5, sanitizeNumber(row?.spending_spike_pct, DEFAULT_AUTOMATION_SETTINGS.spending_spike_pct))),
  monthly_report_enabled: sanitizeBoolean(row?.monthly_report_enabled, DEFAULT_AUTOMATION_SETTINGS.monthly_report_enabled),
  market_refresh_enabled: sanitizeBoolean(row?.market_refresh_enabled, DEFAULT_AUTOMATION_SETTINGS.market_refresh_enabled),
  config: (row?.config && typeof row.config === "object" ? row.config : {}) as Record<string, unknown>,
});

export const ensureAutomationSettings = async (admin: SupabaseClient, userId: string) => {
  const rowRes = await admin
    .from("automations")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (rowRes.error) {
    throw new Error(rowRes.error.message || "Falha ao carregar automacao.");
  }

  if (rowRes.data) {
    return rowRes.data as AutomationRow;
  }

  const insertPayload = {
    user_id: userId,
    ...DEFAULT_AUTOMATION_SETTINGS,
  };

  const insertRes = await admin
    .from("automations")
    .insert(insertPayload)
    .select("*")
    .single();

  if (insertRes.error || !insertRes.data) {
    throw new Error(insertRes.error?.message || "Falha ao criar automacao padrao.");
  }

  return insertRes.data as AutomationRow;
};

export const fetchDollarBid = async () => {
  const response = await fetch("https://economia.awesomeapi.com.br/json/last/USD-BRL", {
    method: "GET",
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`AwesomeAPI USD-BRL falhou (${response.status}).`);
  const data = (await response.json()) as { USDBRL?: { bid?: string } };
  return sanitizeNumber(data?.USDBRL?.bid, 0);
};

const requestAiInsights = async ({
  monthLabel,
  totalExpense,
  previousExpense,
  deltaPercent,
  forecastNet,
  topCategory,
}: {
  monthLabel: string;
  totalExpense: number;
  previousExpense: number;
  deltaPercent: number | null;
  forecastNet: number;
  topCategory: string;
}) => {
  const apiKey = process.env.OPENAI_API_KEY ?? "";
  if (!apiKey) return [] as string[];

  const prompt = `
Voce e um analista financeiro pessoal.
Gere ate 3 insights curtos e acionaveis em portugues.

Mes: ${monthLabel}
Despesa atual: ${formatCurrency(totalExpense)}
Despesa mes anterior: ${formatCurrency(previousExpense)}
Variacao: ${deltaPercent === null ? "sem base" : formatPercent(deltaPercent)}
Categoria lider: ${topCategory}
Previsao de saldo do mes: ${formatCurrency(forecastNet)}
`.trim();

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          {
            role: "system",
            content: "Responda com uma lista de bullets simples, sem markdown extra.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.3,
      }),
    });
    if (!response.ok) return [] as string[];

    const data = await response.json();
    const text = String(data?.choices?.[0]?.message?.content || "");
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.replace(/^[-*•\d.)\s]+/, "").trim())
      .filter((line) => line.length > 6);

    const unique = Array.from(new Set(lines.map((line) => line.replace(/\s+/g, " ").trim())));
    return unique.slice(0, 3);
  } catch {
    return [] as string[];
  }
};

const insertInsightsSnapshot = async ({
  admin,
  userId,
  period,
  insights,
}: {
  admin: SupabaseClient;
  userId: string;
  period: string;
  insights: InsightRowInsert[];
}) => {
  await admin
    .from("insights")
    .delete()
    .eq("user_id", userId)
    .eq("period", period)
    .in("source", ["automation", "ai"]);

  if (!insights.length) return;

  await admin
    .from("insights")
    .insert(insights);
};

const buildHeuristicInsights = ({
  monthLabel,
  totalExpense,
  previousExpense,
  deltaPercent,
  topCategory,
  topCategoryTotal,
  topCategoryShare,
  forecastNet,
  outliers,
}: {
  monthLabel: string;
  totalExpense: number;
  previousExpense: number;
  deltaPercent: number | null;
  topCategory: string;
  topCategoryTotal: number;
  topCategoryShare: number;
  forecastNet: number;
  outliers: ExpenseRow[];
}) => {
  const lines: Array<{
    insight_type: string;
    title: string;
    body: string;
    severity: "info" | "warning" | "critical" | "success";
  }> = [];

  lines.push({
    insight_type: "overview",
    title: `Resumo de gastos (${monthLabel})`,
    body: `Total de gastos no mes: ${formatCurrency(totalExpense)}.`,
    severity: "info",
  });

  if (deltaPercent !== null) {
    if (deltaPercent >= 0) {
      lines.push({
        insight_type: "spending_spike",
        title: "Aumento de despesas",
        body: `Seu gasto subiu ${formatPercent(deltaPercent)} em relacao ao mes anterior (${formatCurrency(previousExpense)}).`,
        severity: deltaPercent >= 20 ? "warning" : "info",
      });
    } else {
      lines.push({
        insight_type: "spending_reduction",
        title: "Reducao de despesas",
        body: `Voce reduziu gastos em ${formatPercent(Math.abs(deltaPercent))} comparado ao mes anterior.`,
        severity: "success",
      });
    }
  }

  if (topCategory) {
    lines.push({
      insight_type: "category_focus",
      title: `Categoria lider: ${topCategory}`,
      body: `${topCategory} representa ${formatPercent(topCategoryShare)} do total (${formatCurrency(topCategoryTotal)}).`,
      severity: topCategoryShare >= 40 ? "warning" : "info",
    });
  }

  if (outliers.length) {
    const biggest = outliers[0];
    lines.push({
      insight_type: "outlier",
      title: "Gasto fora do padrao",
      body: `Maior gasto fora do padrao: ${biggest.description} (${formatCurrency(biggest.amount)}).`,
      severity: "warning",
    });
  }

  lines.push({
    insight_type: "forecast",
    title: "Previsao de saldo mensal",
    body: forecastNet >= 0
      ? `Previsao de saldo no fim do mes: ${formatCurrency(forecastNet)}.`
      : `Previsao de saldo no fim do mes: ${formatCurrency(forecastNet)} (negativo).`,
    severity: forecastNet >= 0 ? "success" : "critical",
  });

  return lines;
};

const autoCategorizeTransactions = async ({
  admin,
  userId,
}: {
  admin: SupabaseClient;
  userId: string;
}) => {
  const txRes = await admin
    .from("transactions")
    .select("id, description, category, type")
    .eq("user_id", userId)
    .in("type", ["expense", "card_payment"])
    .order("occurred_at", { ascending: false })
    .limit(400);

  if (txRes.error) return 0;

  const rows = (txRes.data || []) as Array<{ id: string; description: string | null; category: string | null; type: string | null }>;
  const updates = rows
    .filter((row) => !(row.category || "").trim())
    .slice(0, 100)
    .map((row) => ({
      id: row.id,
      category: pickCategory(row.description || ""),
    }));

  if (!updates.length) return 0;

  let updated = 0;
  for (const item of updates) {
    const updateRes = await admin
      .from("transactions")
      .update({ category: item.category })
      .eq("id", item.id)
      .eq("user_id", userId);
    if (!updateRes.error) updated += 1;
  }

  return updated;
};

const fetchMonthExpenses = async ({
  admin,
  userId,
  startDate,
  endDateExclusive,
}: {
  admin: SupabaseClient;
  userId: string;
  startDate: string;
  endDateExclusive: string;
}) => {
  const txRes = await admin
    .from("transactions")
    .select("id, occurred_at, type, transaction_type, description, category, amount")
    .eq("user_id", userId)
    .gte("occurred_at", startDate)
    .lt("occurred_at", endDateExclusive)
    .in("type", ["income", "adjustment", "expense", "card_payment"]);

  if (txRes.error) throw new Error(txRes.error.message || "Falha ao carregar transacoes.");

  const txRows = (txRes.data || []) as Array<{
    id: string;
    occurred_at: string;
    type: string;
    transaction_type: string | null;
    description: string | null;
    category: string | null;
    amount: number | string | null;
  }>;

  let income = 0;
  let expense = 0;
  const expenseRows: ExpenseRow[] = [];
  const categoryMap = new Map<string, number>();

  txRows.forEach((row) => {
    const amount = Math.abs(toNumber(row.amount));
    if (!Number.isFinite(amount) || amount <= 0) return;

    if (row.type === "income" || row.type === "adjustment") {
      income += amount;
      return;
    }

    if (row.type === "expense" || row.type === "card_payment") {
      expense += amount;
      const category = pickCategory(row.description || "", row.category);
      categoryMap.set(category, round2((categoryMap.get(category) || 0) + amount));
      expenseRows.push({
        id: row.id,
        occurred_at: row.occurred_at,
        type: row.type as "expense" | "card_payment",
        transaction_type: row.transaction_type,
        description: (row.description || "Lancamento").trim(),
        category,
        amount: round2(amount),
      });
    }
  });

  const categories = Array.from(categoryMap.entries())
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total);

  return {
    income: round2(income),
    expense: round2(expense),
    categories,
    expenseRows: expenseRows.sort((a, b) => b.amount - a.amount),
  };
};

const createInternalAlert = async ({
  admin,
  userId,
  event,
}: {
  admin: SupabaseClient;
  userId: string;
  event: AutomationEvent;
}) => {
  const cutoff = new Date(Date.now() - 18 * 60 * 60 * 1000).toISOString();
  const existsRes = await admin
    .from("alerts")
    .select("id")
    .eq("user_id", userId)
    .eq("type", event.alertType)
    .eq("title", event.title)
    .gte("created_at", cutoff)
    .limit(1)
    .maybeSingle();

  if (!existsRes.error && existsRes.data?.id) return false;

  const insertRes = await admin
    .from("alerts")
    .insert({
      user_id: userId,
      card_id: event.cardId || null,
      type: event.alertType,
      title: event.title,
      body: event.body,
      due_at: event.dueAt || null,
      is_read: false,
    });

  return !insertRes.error;
};

const sendEventEmail = async ({
  email,
  events,
}: {
  email: string;
  events: AutomationEvent[];
}) => {
  if (!email || !events.length) return { ok: true };

  const title = "Finance Cloud - alertas automaticos";
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;line-height:1.5">
      <h2 style="margin:0 0 10px 0">Alertas automaticos do Finance Cloud</h2>
      <ul style="padding-left:20px;margin:8px 0;">
        ${events.map((event) => `<li><strong>${event.title}</strong><br/>${event.body}</li>`).join("")}
      </ul>
    </div>
  `;
  const text = [
    "Alertas automaticos do Finance Cloud",
    "",
    ...events.map((event) => `- ${event.title}: ${event.body}`),
  ].join("\n");

  return sendEmailAlert({
    to: email,
    subject: title,
    html,
    text,
  });
};

export const runUserAutomation = async ({
  admin,
  userId,
  userEmail,
  settings,
  dollarBid,
}: {
  admin: SupabaseClient;
  userId: string;
  userEmail: string;
  settings: ReturnType<typeof normalizeAutomationSettings>;
  dollarBid: number;
}): Promise<RunUserAutomationResult> => {
  const categorized = await autoCategorizeTransactions({ admin, userId });

  const now = new Date();
  const currentMonth = normalizeMonthKey();
  const range = getMonthRanges(currentMonth);

  const [current, previous] = await Promise.all([
    fetchMonthExpenses({
      admin,
      userId,
      startDate: range.startDate,
      endDateExclusive: range.endDateExclusive,
    }),
    fetchMonthExpenses({
      admin,
      userId,
      startDate: range.previousStartDate,
      endDateExclusive: range.previousEndDateExclusive,
    }),
  ]);

  const topCategory = current.categories[0]?.category || "Sem categoria";
  const topCategoryTotal = current.categories[0]?.total || 0;
  const topCategoryShare = current.expense > 0 ? (topCategoryTotal / current.expense) * 100 : 0;
  const delta = current.expense - previous.expense;
  const deltaPercent = previous.expense > 0 ? (delta / previous.expense) * 100 : null;

  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysElapsed = Math.max(1, now.getDate());
  const forecastIncome = current.income * (daysInMonth / daysElapsed);
  const forecastExpense = current.expense * (daysInMonth / daysElapsed);
  const forecastNet = round2(forecastIncome - forecastExpense);

  const avgTicket = current.expenseRows.length ? current.expense / current.expenseRows.length : 0;
  const outliers = current.expenseRows.filter((row) => row.amount >= Math.max(80, avgTicket * 2.4)).slice(0, 3);

  const heuristics = buildHeuristicInsights({
    monthLabel: range.monthLabel,
    totalExpense: current.expense,
    previousExpense: previous.expense,
    deltaPercent,
    topCategory,
    topCategoryTotal,
    topCategoryShare,
    forecastNet,
    outliers,
  });

  const aiInsights = await requestAiInsights({
    monthLabel: range.monthLabel,
    totalExpense: current.expense,
    previousExpense: previous.expense,
    deltaPercent,
    forecastNet,
    topCategory,
  });

  const insightsToInsert: InsightRowInsert[] = [
    ...heuristics.map((item) => ({
      user_id: userId,
      period: range.month,
      insight_type: item.insight_type,
      title: item.title,
      body: item.body,
      severity: item.severity,
      source: "automation" as const,
      metadata: {
        totalExpense: current.expense,
        previousExpense: previous.expense,
        deltaPercent,
        forecastNet,
      },
    })),
    ...aiInsights.map((line, index) => ({
      user_id: userId,
      period: range.month,
      insight_type: "ai_tip",
      title: `Insight IA ${index + 1}`,
      body: line,
      severity: "info" as const,
      source: "ai" as const,
      metadata: {},
    })),
  ];

  await insertInsightsSnapshot({
    admin,
    userId,
    period: range.month,
    insights: insightsToInsert,
  });

  const events: AutomationEvent[] = [];

  if (deltaPercent !== null && deltaPercent >= settings.spending_spike_pct) {
    events.push({
      alertType: "spending_spike",
      title: "Aumento relevante de despesas",
      body: `Seus gastos subiram ${formatPercent(deltaPercent)} no mes vs. periodo anterior.`,
    });
  }

  if (forecastNet < 0) {
    events.push({
      alertType: "forecast_warning",
      title: "Previsao de saldo negativo",
      body: `A previsao atual indica saldo de ${formatCurrency(forecastNet)} no fechamento do mes.`,
    });
  }

  if (dollarBid > 0 && settings.dollar_upper !== null && dollarBid >= settings.dollar_upper) {
    events.push({
      alertType: "dollar_threshold",
      title: "Dolar acima do limite",
      body: `USD/BRL em ${formatCurrency(dollarBid)} (limite superior ${formatCurrency(settings.dollar_upper)}).`,
    });
  }

  if (dollarBid > 0 && settings.dollar_lower !== null && dollarBid <= settings.dollar_lower) {
    events.push({
      alertType: "dollar_threshold",
      title: "Dolar abaixo do limite",
      body: `USD/BRL em ${formatCurrency(dollarBid)} (limite inferior ${formatCurrency(settings.dollar_lower)}).`,
    });
  }

  const cardsRes = await admin
    .from("cards")
    .select("id, name, issuer, limit_total, closing_day, due_day, archived, created_at")
    .eq("user_id", userId)
    .eq("archived", false);

  const txRes = await admin
    .from("transactions")
    .select("id, occurred_at, type, transaction_type, description, category, amount, account_id, to_account_id, card_id, tags, note")
    .eq("user_id", userId)
    .order("occurred_at", { ascending: false })
    .limit(2000);

  if (!cardsRes.error && !txRes.error) {
    const cards = (cardsRes.data || []) as Card[];
    const transactions = (txRes.data || []) as Transaction[];
    cards.forEach((card) => {
      const summary = computeCardSummary(card, transactions, now);
      const dueInDays = differenceInCalendarDays(summary.dueDate, now);
      const closingInDays = differenceInCalendarDays(summary.closingDate, now);
      const openInvoice = summary.currentTotal > 0.009;

      if (openInvoice && dueInDays >= 0 && dueInDays <= settings.card_due_days) {
        events.push({
          alertType: "card_due_soon",
          title: `Fatura ${card.name} vence em breve`,
          body: `Vence em ${dueInDays} dia(s). Valor atual: ${formatCurrency(summary.currentTotal)}.`,
          dueAt: summary.dueDate.toISOString().slice(0, 10),
          cardId: card.id,
        });
      }

      if (openInvoice && closingInDays >= 0 && closingInDays <= settings.card_due_days) {
        events.push({
          alertType: "card_closing_soon",
          title: `Fatura ${card.name} fecha em breve`,
          body: `Fecha em ${closingInDays} dia(s). Parcial atual: ${formatCurrency(summary.currentTotal)}.`,
          dueAt: summary.closingDate.toISOString().slice(0, 10),
          cardId: card.id,
        });
      }
    });
  }

  const invRes = await admin
    .from("investments")
    .select("id, asset_name, investment_type, quantity, current_price, average_price, current_amount, price_history")
    .eq("user_id", userId);

  if (!invRes.error) {
    const investments = (invRes.data || []) as InvestmentRow[];
    const worst = investments
      .map((inv) => {
        const quantity = Math.abs(toNumber(inv.quantity));
        const current = toNumber(inv.current_price);
        const history = Array.isArray(inv.price_history) ? inv.price_history : [];
        const previousByHistory = toNumber(history[history.length - 2]);
        const previous = previousByHistory > 0 ? previousByHistory : toNumber(inv.average_price);
        const pct = previous > 0 ? ((current - previous) / previous) * 100 : 0;
        return {
          inv,
          quantity,
          previous,
          current,
          pct,
        };
      })
      .filter((item) => item.quantity > 0 && item.previous > 0)
      .sort((a, b) => a.pct - b.pct)[0];

    if (worst && worst.pct <= -settings.investment_drop_pct) {
      const label = worst.inv.asset_name || worst.inv.investment_type || "Investimento";
      events.push({
        alertType: "investment_drop",
        title: `Queda em ${label}`,
        body: `${label} caiu ${formatPercent(Math.abs(worst.pct))} no periodo recente.`,
      });
    }
  }

  const uniqueKey = new Set<string>();
  const dedupedEvents = events.filter((event) => {
    const key = `${event.alertType}|${event.title}|${event.body}`;
    if (uniqueKey.has(key)) return false;
    uniqueKey.add(key);
    return true;
  });

  if (settings.internal_enabled) {
    for (const event of dedupedEvents) {
      await createInternalAlert({
        admin,
        userId,
        event,
      });
    }
  }

  if (settings.push_enabled && dedupedEvents.length) {
    for (const event of dedupedEvents) {
      await sendPushToUser({
        admin,
        userId,
        payload: {
          title: event.title,
          body: event.body,
          url: "/dashboard",
          tag: event.alertType,
        },
      });
    }
  }

  if (settings.email_enabled && userEmail && dedupedEvents.length) {
    await sendEventEmail({
      email: userEmail,
      events: dedupedEvents,
    });
  }

  return {
    userId,
    events: dedupedEvents,
    insightsCreated: insightsToInsert.length,
    categorized,
  };
};
