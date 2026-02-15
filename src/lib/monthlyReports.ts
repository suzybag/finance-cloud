import type { SupabaseClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import { toNumber } from "@/lib/money";
import {
  buildCategoryMetadataLookup,
  ensureCategoryMetadataForNames,
} from "@/lib/categoryMetadata";
import {
  normalizeCategoryKey,
  resolveCategoryVisual,
} from "@/lib/categoryVisuals";

type TransactionExpenseRow = {
  id: string;
  occurred_at: string;
  description: string | null;
  category: string | null;
  amount: number | string | null;
  type: string | null;
  transaction_type: string | null;
  tags: string[] | null;
  card_id: string | null;
};

type InvestmentExpenseRow = {
  id: string;
  start_date: string | null;
  created_at: string | null;
  operation: string | null;
  category: string | null;
  asset_name: string | null;
  investment_type: string | null;
  invested_amount: number | string | null;
};

export type MonthlyExpenseRow = {
  id: string;
  date: string;
  description: string;
  category: string;
  categoryIconName: string;
  categoryIconColor: string;
  amount: number;
  expenseType: string;
  source: "transacao" | "investimento";
};

export type MonthlyCategoryTotal = {
  category: string;
  categoryIconName: string;
  categoryIconColor: string;
  total: number;
  percent: number;
};

export type MonthlyReportSummary = {
  month: string;
  monthLabel: string;
  total: number;
  previousTotal: number;
  delta: number;
  deltaPercent: number | null;
  topCategory: string | null;
  topCategoryTotal: number;
  categoryTotals: MonthlyCategoryTotal[];
  topExpenses: MonthlyExpenseRow[];
  rowCount: number;
  insights: string[];
  aiInsights: string[];
  heuristicInsights: string[];
  warnings: string[];
};

export type MonthlyReportData = {
  rows: MonthlyExpenseRow[];
  summary: MonthlyReportSummary;
  period: {
    startDate: string;
    endDateExclusive: string;
    previousStartDate: string;
    previousEndDateExclusive: string;
  };
};

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const MAX_INSIGHTS = 6;
const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

const asDateIso = (value: Date) => value.toISOString().slice(0, 10);
const roundCurrency = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;

const formatMonthLabel = (year: number, monthIndex0: number) =>
  new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, monthIndex0, 1)),
  );

const formatDatePt = (isoDate: string) => {
  const parsed = new Date(`${isoDate}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(parsed);
};

const formatCurrencyPt = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  }).format(roundCurrency(value));

const formatPercentPt = (value: number, fractionDigits = 1) =>
  `${value.toFixed(fractionDigits).replace(".", ",")}%`;

const normalizeText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const dedupeLines = (lines: string[]) => {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const line of lines) {
    const cleaned = line.replace(/\s+/g, " ").trim();
    if (!cleaned) continue;
    const key = normalizeText(cleaned);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(cleaned);
    if (output.length >= MAX_INSIGHTS) break;
  }
  return output;
};

export const getCurrentMonthKey = (baseDate = new Date()) => {
  const year = baseDate.getFullYear();
  const month = String(baseDate.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
};

export const getPreviousMonthKey = (baseDate = new Date()) => {
  const prev = new Date(Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth() - 1, 1));
  const year = prev.getUTCFullYear();
  const month = String(prev.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
};

export const normalizeMonthKey = (rawMonth?: string | null) => {
  const value = (rawMonth || "").trim();
  if (!value) return getCurrentMonthKey();
  return MONTH_PATTERN.test(value) ? value : getCurrentMonthKey();
};

export const getMonthRanges = (monthKey: string) => {
  const safeMonth = normalizeMonthKey(monthKey);
  const [year, month] = safeMonth.split("-").map(Number);
  const monthIndex0 = month - 1;

  const start = new Date(Date.UTC(year, monthIndex0, 1));
  const endExclusive = new Date(Date.UTC(year, monthIndex0 + 1, 1));
  const previousStart = new Date(Date.UTC(year, monthIndex0 - 1, 1));
  const previousEndExclusive = start;

  return {
    month: safeMonth,
    monthLabel: formatMonthLabel(year, monthIndex0),
    startDate: asDateIso(start),
    endDateExclusive: asDateIso(endExclusive),
    previousStartDate: asDateIso(previousStart),
    previousEndDateExclusive: asDateIso(previousEndExclusive),
  };
};

const isPixTransaction = (row: TransactionExpenseRow) => {
  if ((row.transaction_type || "").toLowerCase() === "pix") return true;
  if ((row.tags || []).some((tag) => normalizeText(tag) === "pix")) return true;
  return /^pix\b/i.test(row.description || "");
};

const classifyExpenseType = (row: TransactionExpenseRow) => {
  if (row.type === "card_payment" || !!row.card_id) return "cartao";
  if (isPixTransaction(row)) return "pix";
  const category = normalizeText(row.category || "");
  if (category.includes("invest")) return "investimento";
  return row.type === "expense" ? "despesa" : (row.type || "gasto");
};

const mapTransactionsToExpenseRows = (rows: TransactionExpenseRow[]): MonthlyExpenseRow[] => {
  const mapped: MonthlyExpenseRow[] = [];
  for (const row of rows) {
    const amount = Math.abs(toNumber(row.amount));
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const category = (row.category || "Sem categoria").trim() || "Sem categoria";
    const visual = resolveCategoryVisual({ categoryName: category });

    mapped.push({
      id: row.id,
      date: row.occurred_at,
      description: (row.description || "Lancamento").trim(),
      category,
      categoryIconName: visual.iconName,
      categoryIconColor: visual.iconColor,
      amount: roundCurrency(amount),
      expenseType: classifyExpenseType(row),
      source: "transacao",
    });
  }
  return mapped;
};

const mapInvestmentsToExpenseRows = (rows: InvestmentExpenseRow[]): MonthlyExpenseRow[] => {
  const mapped: MonthlyExpenseRow[] = [];
  for (const row of rows) {
    const amount = Math.abs(toNumber(row.invested_amount));
    if (!Number.isFinite(amount) || amount <= 0) continue;

    const date = row.start_date || row.created_at?.slice(0, 10) || "";
    if (!date) continue;

    const asset = (row.asset_name || row.investment_type || "Investimento").trim();
    const operation = normalizeText(row.operation || "compra");
    const description = operation === "venda" ? `Venda ${asset}` : `Aporte ${asset}`;
    const category = (row.category || "Investimentos").trim() || "Investimentos";
    const visual = resolveCategoryVisual({ categoryName: category });

    mapped.push({
      id: row.id,
      date,
      description,
      category,
      categoryIconName: visual.iconName,
      categoryIconColor: visual.iconColor,
      amount: roundCurrency(amount),
      expenseType: "investimento",
      source: "investimento",
    });
  }
  return mapped;
};

const fetchMonthlyExpenseRowsForRange = async ({
  client,
  userId,
  startDate,
  endDateExclusive,
}: {
  client: SupabaseClient;
  userId: string;
  startDate: string;
  endDateExclusive: string;
}) => {
  const warnings: string[] = [];

  const [txRes, invRes] = await Promise.all([
    client
      .from("transactions")
      .select("id, occurred_at, description, category, amount, type, transaction_type, tags, card_id")
      .eq("user_id", userId)
      .gte("occurred_at", startDate)
      .lt("occurred_at", endDateExclusive)
      .in("type", ["expense", "card_payment"]),
    client
      .from("investments")
      .select("id, start_date, created_at, operation, category, asset_name, investment_type, invested_amount")
      .eq("user_id", userId)
      .eq("operation", "compra")
      .gte("start_date", startDate)
      .lt("start_date", endDateExclusive),
  ]);

  if (txRes.error) {
    throw new Error(txRes.error.message || "Falha ao buscar transacoes.");
  }

  const transactionRows = mapTransactionsToExpenseRows((txRes.data || []) as TransactionExpenseRow[]);

  let investmentRows: MonthlyExpenseRow[] = [];
  if (invRes.error) {
    if (/relation .*investments/i.test(invRes.error.message || "")) {
      warnings.push("Tabela investments nao encontrada. Gastos de investimento nao incluidos.");
    } else {
      warnings.push(`Falha ao buscar investimentos: ${invRes.error.message}`);
    }
  } else {
    investmentRows = mapInvestmentsToExpenseRows((invRes.data || []) as InvestmentExpenseRow[]);
  }

  const combined = [...transactionRows, ...investmentRows].sort((a, b) => {
    const dateCompare = a.date.localeCompare(b.date);
    if (dateCompare !== 0) return dateCompare;
    return a.description.localeCompare(b.description);
  });

  return { rows: combined, warnings };
};

const buildCategoryTotals = (rows: MonthlyExpenseRow[]) => {
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  const byCategory = new Map<
    string,
    { total: number; categoryIconName: string; categoryIconColor: string }
  >();

  rows.forEach((row) => {
    const key = row.category || "Sem categoria";
    const curr = byCategory.get(key);
    const visual = resolveCategoryVisual({
      categoryName: key,
      iconName: row.categoryIconName,
      iconColor: row.categoryIconColor,
    });
    byCategory.set(key, {
      total: roundCurrency((curr?.total || 0) + row.amount),
      categoryIconName: curr?.categoryIconName || visual.iconName,
      categoryIconColor: curr?.categoryIconColor || visual.iconColor,
    });
  });

  const categories = Array.from(byCategory.entries())
    .map(([category, value]) => ({
      category,
      categoryIconName: value.categoryIconName,
      categoryIconColor: value.categoryIconColor,
      total: roundCurrency(value.total),
      percent: total > 0 ? roundCurrency((value.total / total) * 100) : 0,
    }))
    .sort((a, b) => b.total - a.total);

  return {
    total: roundCurrency(total),
    categories,
  };
};

const applyCategoryMetadata = ({
  rows,
  metadataRows,
}: {
  rows: MonthlyExpenseRow[];
  metadataRows: Array<{
    name: string;
    icon_name: string | null;
    icon_color: string | null;
  }>;
}) => {
  const metadataByKey = buildCategoryMetadataLookup(metadataRows);
  return rows.map((row) => {
    const metadata = metadataByKey.get(normalizeCategoryKey(row.category));
    const visual = resolveCategoryVisual({
      categoryName: row.category,
      iconName: metadata?.icon_name || row.categoryIconName,
      iconColor: metadata?.icon_color || row.categoryIconColor,
    });
    return {
      ...row,
      categoryIconName: visual.iconName,
      categoryIconColor: visual.iconColor,
    };
  });
};

const detectSubscriptionSpend = (rows: MonthlyExpenseRow[]) => {
  const keywords = ["assinatura", "netflix", "spotify", "prime", "hbo", "disney", "youtube", "apple", "cloud"];
  const grouped = new Map<string, { count: number; total: number }>();

  rows.forEach((row) => {
    const text = normalizeText(`${row.description} ${row.category}`);
    if (!keywords.some((keyword) => text.includes(keyword))) return;
    const key = normalizeText(row.description);
    const curr = grouped.get(key) || { count: 0, total: 0 };
    grouped.set(key, {
      count: curr.count + 1,
      total: roundCurrency(curr.total + row.amount),
    });
  });

  const repeated = Array.from(grouped.entries())
    .filter(([, item]) => item.count >= 1)
    .sort((a, b) => b[1].total - a[1].total);

  const total = repeated.reduce((sum, [, item]) => sum + item.total, 0);
  return { total: roundCurrency(total), repeated };
};

const detectDeliverySpend = (rows: MonthlyExpenseRow[]) => {
  const deliveryKeywords = ["delivery", "ifood", "uber eats", "rappi", "lanche", "restaurante", "pizza", "hamburguer"];
  return roundCurrency(
    rows
      .filter((row) => {
        const text = normalizeText(`${row.description} ${row.category}`);
        return deliveryKeywords.some((keyword) => text.includes(keyword));
      })
      .reduce((sum, row) => sum + row.amount, 0),
  );
};

const buildHeuristicInsights = ({
  rows,
  monthLabel,
  total,
  previousTotal,
  delta,
  deltaPercent,
  categoryTotals,
}: {
  rows: MonthlyExpenseRow[];
  monthLabel: string;
  total: number;
  previousTotal: number;
  delta: number;
  deltaPercent: number | null;
  categoryTotals: MonthlyCategoryTotal[];
}) => {
  if (!rows.length || total <= 0) {
    return ["Sem gastos registrados no periodo selecionado."];
  }

  const insights: string[] = [];
  const topCategory = categoryTotals[0];
  const topExpense = [...rows].sort((a, b) => b.amount - a.amount)[0];

  if (topCategory) {
    insights.push(
      `Maior categoria em ${monthLabel}: ${topCategory.category} (${formatCurrencyPt(topCategory.total)}, ${formatPercentPt(topCategory.percent)} do total).`,
    );
  }

  if (previousTotal > 0 && deltaPercent !== null) {
    if (deltaPercent > 5) {
      insights.push(
        `Voce gastou ${formatPercentPt(Math.abs(deltaPercent))} a mais que no mes anterior (${formatCurrencyPt(Math.abs(delta))} de aumento).`,
      );
    } else if (deltaPercent < -5) {
      insights.push(
        `Voce reduziu gastos em ${formatPercentPt(Math.abs(deltaPercent))} vs. o mes anterior (${formatCurrencyPt(Math.abs(delta))} economizados).`,
      );
    } else {
      insights.push(
        `Gasto praticamente estavel comparado ao mes anterior (${formatPercentPt(Math.abs(deltaPercent))} de variacao).`,
      );
    }
  } else {
    insights.push("Nao ha base suficiente para comparacao com o mes anterior.");
  }

  if (topCategory && topCategory.percent >= 35) {
    insights.push(
      `Se reduzir ${topCategory.category} em 10%, a economia estimada e ${formatCurrencyPt(topCategory.total * 0.1)} no proximo mes.`,
    );
  }

  const deliveryTotal = detectDeliverySpend(rows);
  if (deliveryTotal > 0 && total > 0 && (deliveryTotal / total) * 100 >= 8) {
    insights.push(
      `Delivery e alimentacao pronta consumiram ${formatCurrencyPt(deliveryTotal)}. Planejar refeicoes pode reduzir essa frente.`,
    );
  }

  const subscription = detectSubscriptionSpend(rows);
  if (subscription.total > 0) {
    insights.push(
      `Assinaturas e servicos recorrentes somaram ${formatCurrencyPt(subscription.total)}. Revise planos pouco utilizados.`,
    );
  }

  if (topExpense) {
    insights.push(
      `Maior gasto individual: ${topExpense.description} (${formatCurrencyPt(topExpense.amount)} em ${formatDatePt(topExpense.date)}).`,
    );
  }

  return dedupeLines(insights);
};

const normalizeAiInsights = (text: string) => {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*•\d.)\s]+/, "").trim())
    .filter((line) => line.length >= 8);
  return dedupeLines(lines);
};

const requestOpenAiInsights = async ({
  monthLabel,
  total,
  previousTotal,
  deltaPercent,
  categories,
  topExpenses,
}: {
  monthLabel: string;
  total: number;
  previousTotal: number;
  deltaPercent: number | null;
  categories: MonthlyCategoryTotal[];
  topExpenses: MonthlyExpenseRow[];
}) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return [] as string[];

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const prompt = `
Voce e um analista financeiro pessoal.
Gere de 3 a 5 insights em portugues do Brasil, objetivos e acionaveis.

Contexto:
- Mes: ${monthLabel}
- Total gasto: ${formatCurrencyPt(total)}
- Total mes anterior: ${formatCurrencyPt(previousTotal)}
- Variacao percentual: ${deltaPercent === null ? "sem base" : formatPercentPt(deltaPercent)}
- Categorias: ${JSON.stringify(categories.slice(0, 8))}
- Maiores gastos: ${JSON.stringify(
    topExpenses.slice(0, 8).map((item) => ({
      descricao: item.description,
      categoria: item.category,
      valor: item.amount,
    })),
  )}

Foque em:
1) onde o gasto esta concentrado,
2) oportunidades de economia,
3) recomendacoes praticas para o proximo mes.
`.trim();

  try {
    const response = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: "Responda apenas com bullets curtos em texto simples.",
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
    const data = await response.json();
    const raw = String(data?.choices?.[0]?.message?.content || "").trim();
    if (!raw) return [] as string[];
    return normalizeAiInsights(raw);
  } catch {
    return [] as string[];
  }
};

export const buildMonthlyReportData = async ({
  client,
  userId,
  month,
}: {
  client: SupabaseClient;
  userId: string;
  month?: string | null;
}): Promise<MonthlyReportData> => {
  const ranges = getMonthRanges(normalizeMonthKey(month));

  const [currentRes, previousRes] = await Promise.all([
    fetchMonthlyExpenseRowsForRange({
      client,
      userId,
      startDate: ranges.startDate,
      endDateExclusive: ranges.endDateExclusive,
    }),
    fetchMonthlyExpenseRowsForRange({
      client,
      userId,
      startDate: ranges.previousStartDate,
      endDateExclusive: ranges.previousEndDateExclusive,
    }),
  ]);

  const allCategoryNames = [
    ...currentRes.rows.map((row) => row.category),
    ...previousRes.rows.map((row) => row.category),
  ];

  let categoryMetadataRows: Array<{
    name: string;
    icon_name: string | null;
    icon_color: string | null;
  }> = [];
  const warnings = [...currentRes.warnings, ...previousRes.warnings];

  try {
    const metadataResult = await ensureCategoryMetadataForNames({
      client,
      userId,
      names: allCategoryNames,
    });
    categoryMetadataRows = metadataResult.rows;
    if (!metadataResult.tableAvailable) {
      warnings.push("Tabela transaction_categories nao encontrada. Icones padrao aplicados.");
    }
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : "Falha ao carregar metadados de categoria.");
  }

  const rows = applyCategoryMetadata({
    rows: currentRes.rows,
    metadataRows: categoryMetadataRows,
  });
  const previousRows = applyCategoryMetadata({
    rows: previousRes.rows,
    metadataRows: categoryMetadataRows,
  });

  const currentTotals = buildCategoryTotals(rows);
  const previousTotals = buildCategoryTotals(previousRows);
  const total = currentTotals.total;
  const previousTotal = previousTotals.total;
  const delta = roundCurrency(total - previousTotal);
  const deltaPercent = previousTotal > 0 ? roundCurrency((delta / previousTotal) * 100) : null;
  const topCategory = currentTotals.categories[0];

  const topExpenses = [...rows].sort((a, b) => b.amount - a.amount).slice(0, 10);
  const heuristicInsights = buildHeuristicInsights({
    rows,
    monthLabel: ranges.monthLabel,
    total,
    previousTotal,
    delta,
    deltaPercent,
    categoryTotals: currentTotals.categories,
  });

  const aiInsights = await requestOpenAiInsights({
    monthLabel: ranges.monthLabel,
    total,
    previousTotal,
    deltaPercent,
    categories: currentTotals.categories,
    topExpenses,
  });

  const insights = dedupeLines([...aiInsights, ...heuristicInsights]);

  return {
    rows,
    summary: {
      month: ranges.month,
      monthLabel: ranges.monthLabel,
      total,
      previousTotal,
      delta,
      deltaPercent,
      topCategory: topCategory?.category || null,
      topCategoryTotal: topCategory?.total || 0,
      categoryTotals: currentTotals.categories,
      topExpenses,
      rowCount: rows.length,
      insights,
      aiInsights,
      heuristicInsights,
      warnings: dedupeLines(warnings),
    },
    period: {
      startDate: ranges.startDate,
      endDateExclusive: ranges.endDateExclusive,
      previousStartDate: ranges.previousStartDate,
      previousEndDateExclusive: ranges.previousEndDateExclusive,
    },
  };
};

const setCurrencyFormatOnColumn = (sheet: XLSX.WorkSheet, column: string, rowStart: number, rowEnd: number) => {
  for (let row = rowStart; row <= rowEnd; row += 1) {
    const address = `${column}${row}`;
    const cell = sheet[address];
    if (!cell || typeof cell.v !== "number") continue;
    cell.t = "n";
    cell.z = '"R$" #,##0.00';
  }
};

export const createMonthlyWorkbookBuffer = (report: MonthlyReportData) => {
  const { rows, summary } = report;

  const detailRows = rows.map((row) => ({
    Data: formatDatePt(row.date),
    Descricao: row.description,
    Categoria: row.category,
    IconeCategoria: row.categoryIconName,
    CorIcone: row.categoryIconColor,
    Valor: row.amount,
    Tipo: row.expenseType,
  }));

  detailRows.push({
    Data: "",
    Descricao: "TOTAL GERAL",
    Categoria: "",
    IconeCategoria: "",
    CorIcone: "",
    Valor: summary.total,
    Tipo: "",
  });

  const detailSheet = XLSX.utils.json_to_sheet(detailRows);
  detailSheet["!cols"] = [
    { wch: 14 },
    { wch: 48 },
    { wch: 24 },
    { wch: 16 },
    { wch: 14 },
    { wch: 18 },
    { wch: 18 },
  ];
  setCurrencyFormatOnColumn(detailSheet, "F", 2, detailRows.length + 1);

  const summaryAoa: Array<Array<string | number>> = [
    ["Resumo financeiro mensal", ""],
    ["Mes de referencia", summary.monthLabel],
    ["Total gasto", summary.total],
    ["Total mes anterior", summary.previousTotal],
    ["Variacao (R$)", summary.delta],
    ["Variacao (%)", summary.deltaPercent === null ? "sem base" : summary.deltaPercent / 100],
    ["Categoria com maior gasto", summary.topCategory || "-"],
    ["Valor da maior categoria", summary.topCategoryTotal],
    [],
    ["Totais por categoria", "", "", "", ""],
    ["Categoria", "Icone", "Cor", "Total", "Percentual"],
    ...summary.categoryTotals.map((item) => [
      item.category,
      item.categoryIconName,
      item.categoryIconColor,
      item.total,
      item.percent / 100,
    ]),
    [],
    ["Insights automaticos", "", "", "", ""],
    ...summary.insights.map((item) => [item]),
  ];

  const summarySheet = XLSX.utils.aoa_to_sheet(summaryAoa);
  summarySheet["!cols"] = [
    { wch: 42 },
    { wch: 16 },
    { wch: 14 },
    { wch: 22 },
    { wch: 16 },
  ];

  setCurrencyFormatOnColumn(summarySheet, "B", 3, 8);
  const categoryStartRow = 12;
  const categoryEndRow = categoryStartRow + summary.categoryTotals.length - 1;
  if (summary.categoryTotals.length > 0) {
    setCurrencyFormatOnColumn(summarySheet, "D", categoryStartRow, categoryEndRow);
    for (let row = categoryStartRow; row <= categoryEndRow; row += 1) {
      const pctCell = summarySheet[`E${row}`];
      if (pctCell && typeof pctCell.v === "number") {
        pctCell.t = "n";
        pctCell.z = "0.00%";
      }
    }
  }

  const variationPercentCell = summarySheet.B6;
  if (variationPercentCell && typeof variationPercentCell.v === "number") {
    variationPercentCell.t = "n";
    variationPercentCell.z = "0.00%";
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, detailSheet, "Gastos");
  XLSX.utils.book_append_sheet(workbook, summarySheet, "Resumo");

  return XLSX.write(workbook, {
    type: "buffer",
    bookType: "xlsx",
  }) as Buffer;
};
