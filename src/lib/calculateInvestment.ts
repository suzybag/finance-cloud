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
