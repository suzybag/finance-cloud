import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export const BROKER_OPTIONS = [
  "Nubank",
  "Inter",
  "XP",
  "BTG",
  "Rico",
  "Clear",
  "C6",
  "Caixa",
  "Bradesco",
  "Itau",
  "Outros",
] as const;

export const INVESTMENT_CATEGORIES = [
  "Criptomoedas",
  "Tesouro Direto",
  "Acoes",
  "FIIs",
  "Commodities",
  "Renda Fixa",
  "Outros",
] as const;

export type InvestmentCategory = typeof INVESTMENT_CATEGORIES[number];

export const INVESTMENT_TYPE_CATEGORY_KEYS = [
  "renda_fixa",
  "renda_variavel",
  "cripto",
  "commodities",
] as const;

export type InvestmentTypeCategoryKey = typeof INVESTMENT_TYPE_CATEGORY_KEYS[number];

export const mapCategoryKeyToLabel = (key: string) => {
  switch ((key || "").toLowerCase()) {
    case "renda_fixa":
      return "Renda fixa";
    case "renda_variavel":
      return "Renda variavel";
    case "cripto":
      return "Cripto";
    case "commodities":
      return "Commodities";
    default:
      return "Outros";
  }
};

export const mapCategoryKeyToUiCategory = (key: string): InvestmentCategory => {
  switch ((key || "").toLowerCase()) {
    case "renda_fixa":
      return "Renda Fixa";
    case "renda_variavel":
      return "Acoes";
    case "cripto":
      return "Criptomoedas";
    case "commodities":
      return "Commodities";
    default:
      return "Outros";
  }
};

export const INVESTMENT_TYPE_GROUPS = [
  {
    label: "Renda fixa",
    options: [
      "CDB 100% CDI",
      "CDB 110% CDI",
      "Tesouro Selic",
      "Tesouro IPCA+",
      "LCI",
      "LCA",
      "Caixinha",
      "Poupanca",
    ],
  },
  {
    label: "Renda variavel",
    options: [
      "Acoes",
      "FIIs",
      "ETFs",
      "Criptomoedas",
    ],
  },
] as const;

export type InvestmentCurveInput = {
  principal: number;
  annualRate: number;
  startDate: string;
  referenceDate?: Date;
};

export type MonthlyEvolutionItem = {
  principal: number;
  annualRate: number;
  startDate: string;
};

export type MonthlyEvolutionPoint = {
  month: string;
  invested: number;
  totalValue: number;
};

export type InvestmentStatus = "CARO" | "NORMAL" | "BARATO";

const parseDate = (value: string) => {
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return new Date();
  return parsed;
};

const roundCurrency = (value: number) => Math.round(value * 100) / 100;

const monthDiff = (start: Date, end: Date) =>
  (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());

const monthStart = (value: Date) => new Date(value.getFullYear(), value.getMonth(), 1);

const monthEnd = (value: Date) => new Date(value.getFullYear(), value.getMonth() + 1, 0);

const safeNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export function calculateCompound({
  principal,
  annualRate,
  startDate,
  referenceDate = new Date(),
}: InvestmentCurveInput) {
  const initial = Number.isFinite(principal) ? principal : 0;
  const annual = Number.isFinite(annualRate) ? annualRate : 0;
  if (initial <= 0) return 0;

  const start = parseDate(startDate);
  const now = new Date(referenceDate);

  const months = Math.max(0, monthDiff(monthStart(start), monthStart(now)));
  const monthlyRate = annual / 12 / 100;
  const finalValue = initial * Math.pow(1 + monthlyRate, months);
  return roundCurrency(finalValue);
}

export const calculateReturnPercent = (invested: number, current: number) => {
  if (!Number.isFinite(invested) || invested <= 0) return 0;
  return ((current - invested) / invested) * 100;
};

export const calculateReturn = (invested: number, current: number) => {
  const difference = current - invested;
  const percent = calculateReturnPercent(invested, current);
  return {
    difference: roundCurrency(difference),
    percent,
  };
};

export const calculateTotal = ({
  quantity,
  unitPrice,
  costs = 0,
}: {
  quantity: number;
  unitPrice: number;
  costs?: number;
}) => {
  const qty = safeNumber(quantity);
  const price = safeNumber(unitPrice);
  const extra = safeNumber(costs);
  return roundCurrency((qty * price) + extra);
};

export const calculateInvestmentStatus = (
  averagePrice: number,
  currentPrice: number,
): InvestmentStatus => {
  const average = safeNumber(averagePrice);
  const current = safeNumber(currentPrice);
  if (average <= 0 || current <= 0) return "NORMAL";
  if (current > average * 1.1) return "CARO";
  if (current < average * 0.9) return "BARATO";
  return "NORMAL";
};

export const mapInvestmentTypeToCategory = (investmentType: string): InvestmentCategory => {
  const normalized = (investmentType || "").toLowerCase();

  if (
    normalized.includes("cripto")
    || normalized.includes("btc")
    || normalized.includes("bitcoin")
    || normalized.includes("eth")
    || normalized.includes("ethereum")
  ) {
    return "Criptomoedas";
  }

  if (normalized.includes("tesouro")) return "Tesouro Direto";

  if (
    normalized.includes("acao")
    || normalized.includes("ações")
    || normalized.includes("stock")
  ) {
    return "Acoes";
  }

  if (normalized.includes("fii")) return "FIIs";

  if (
    normalized.includes("ouro")
    || normalized.includes("commodity")
    || normalized.includes("commodities")
  ) {
    return "Commodities";
  }

  if (
    normalized.includes("cdb")
    || normalized.includes("lci")
    || normalized.includes("lca")
    || normalized.includes("ipca")
    || normalized.includes("selic")
    || normalized.includes("caixinha")
    || normalized.includes("poup")
    || normalized.includes("renda fixa")
  ) {
    return "Renda Fixa";
  }

  return "Outros";
};

const toHistoryNumbers = (value: unknown): number[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => safeNumber(entry))
    .filter((entry) => entry > 0);
};

const hashSeed = (value: string) =>
  value.split("").reduce((acc, char) => ((acc * 31) + char.charCodeAt(0)) % 9973, 17);

export const buildSyntheticPriceHistory = (
  averagePrice: number,
  currentPrice: number,
  seedRef = "",
) => {
  const avg = Math.max(safeNumber(averagePrice), 0.0001);
  const cur = Math.max(safeNumber(currentPrice), 0.0001);
  const seed = hashSeed(seedRef || "asset");
  const delta = cur - avg;
  const wiggleBase = Math.max(Math.abs(delta) * 0.12, avg * 0.01);

  const history: number[] = [];
  for (let index = 0; index < 30; index += 1) {
    const progress = index / 29;
    const trend = avg + (delta * progress);
    const wave = Math.sin((index + seed) * 0.45) * wiggleBase * (1 - progress * 0.35);
    history.push(roundCurrency(Math.max(0.0001, trend + wave)));
  }
  return history;
};

export const resolvePriceHistory = ({
  history,
  averagePrice,
  currentPrice,
  seedRef,
}: {
  history: unknown;
  averagePrice: number;
  currentPrice: number;
  seedRef: string;
}) => {
  const parsed = toHistoryNumbers(history);
  if (parsed.length >= 2) {
    return parsed.slice(-30);
  }
  return buildSyntheticPriceHistory(averagePrice, currentPrice, seedRef);
};

export const buildMonthlyEvolution = (
  items: MonthlyEvolutionItem[],
  referenceDate = new Date(),
) => {
  if (!items.length) return [] as MonthlyEvolutionPoint[];

  const starts = items.map((item) => parseDate(item.startDate));
  const earliest = starts.reduce((min, current) => (current < min ? current : min), starts[0]);

  const firstMonth = monthStart(earliest);
  const lastMonth = monthStart(referenceDate);
  const diff = Math.max(0, monthDiff(firstMonth, lastMonth));

  const series: MonthlyEvolutionPoint[] = [];
  for (let index = 0; index <= diff; index += 1) {
    const pointMonth = new Date(firstMonth.getFullYear(), firstMonth.getMonth() + index, 1);
    const pointEnd = monthEnd(pointMonth);

    const totalValue = items.reduce(
      (sum, item) =>
        sum + calculateCompound({
          principal: item.principal,
          annualRate: item.annualRate,
          startDate: item.startDate,
          referenceDate: pointEnd,
        }),
      0,
    );

    const invested = items.reduce((sum, item) => {
      const start = parseDate(item.startDate);
      return start <= pointEnd ? sum + item.principal : sum;
    }, 0);

    series.push({
      month: format(pointMonth, "MMM/yy", { locale: ptBR }).replace(".", ""),
      invested: roundCurrency(invested),
      totalValue: roundCurrency(totalValue),
    });
  }

  return series;
};
