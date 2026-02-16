import { differenceInCalendarDays } from "date-fns";
import { toNumber } from "@/lib/money";

export type InstallmentRow = {
  id: string;
  user_id: string;
  name: string;
  total_value: number;
  installments: number;
  paid_installments: number;
  installment_value: number;
  start_date: string;
  category: string | null;
  observation: string | null;
  created_at: string;
  updated_at: string | null;
};

export type InstallmentMetrics = {
  installmentCount: number;
  paidInstallments: number;
  remainingInstallments: number;
  totalValue: number;
  installmentValue: number;
  paidValue: number;
  remainingValue: number;
  percentagePaid: number;
  isCompleted: boolean;
  isActive: boolean;
  nextDueDate: Date | null;
  daysUntilDue: number | null;
  isDueSoon: boolean;
  isOverdue: boolean;
};

export type InstallmentWithMetrics = {
  row: InstallmentRow;
  metrics: InstallmentMetrics;
};

export type InstallmentSummary = {
  active: InstallmentWithMetrics[];
  dueSoon: InstallmentWithMetrics[];
  overdue: InstallmentWithMetrics[];
  activeTotalRemaining: number;
  activeRemainingInstallments: number;
};

const round2 = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;

const asDateStart = (value: Date) => new Date(
  value.getFullYear(),
  value.getMonth(),
  value.getDate(),
  12,
  0,
  0,
  0,
);

const parseDateOnly = (value?: string | null) => {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    return new Date(year, Math.max(0, month - 1), Math.max(1, day), 12, 0, 0, 0);
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return asDateStart(parsed);

  return asDateStart(new Date());
};

const toIsoDate = (value: Date) =>
  `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;

const addMonthsClamped = (baseDate: Date, months: number) => {
  const base = asDateStart(baseDate);
  const day = base.getDate();
  base.setDate(1);
  base.setMonth(base.getMonth() + Math.round(months));
  const lastDay = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
  base.setDate(Math.min(day, lastDay));
  return asDateStart(base);
};

const safeInstallmentCount = (value: unknown) => Math.max(1, Math.round(toNumber(value) || 1));

export const normalizeInstallmentRow = (row: Partial<InstallmentRow>): InstallmentRow => {
  const totalValue = Math.max(0, round2(toNumber(row.total_value)));
  const installments = safeInstallmentCount(row.installments);
  const paidInstallments = Math.min(
    installments,
    Math.max(0, Math.round(toNumber(row.paid_installments) || 0)),
  );
  const installmentValueRaw = round2(toNumber(row.installment_value));
  const installmentValue = installmentValueRaw > 0
    ? installmentValueRaw
    : round2(totalValue / installments);
  const startDate = parseDateOnly(row.start_date);

  return {
    id: String(row.id || ""),
    user_id: String(row.user_id || ""),
    name: String(row.name || "Compra parcelada"),
    total_value: totalValue,
    installments,
    paid_installments: paidInstallments,
    installment_value: installmentValue,
    start_date: toIsoDate(startDate),
    category: typeof row.category === "string" && row.category.trim() ? row.category.trim() : null,
    observation: typeof row.observation === "string" && row.observation.trim() ? row.observation.trim() : null,
    created_at: row.created_at || new Date().toISOString(),
    updated_at: row.updated_at || null,
  };
};

export const getInstallmentDueDate = (startDate: string, installmentIndex: number) => {
  const safeIndex = Math.max(0, Math.round(installmentIndex));
  return addMonthsClamped(parseDateOnly(startDate), safeIndex);
};

export const computeInstallmentMetrics = (
  installment: InstallmentRow | Partial<InstallmentRow>,
  now = new Date(),
): InstallmentMetrics => {
  const row = normalizeInstallmentRow(installment);
  const totalValue = round2(
    row.total_value > 0 ? row.total_value : row.installment_value * row.installments,
  );
  const paidValue = round2(Math.min(totalValue, row.installment_value * row.paid_installments));
  const remainingInstallments = Math.max(0, row.installments - row.paid_installments);
  const remainingValue = round2(Math.max(0, totalValue - paidValue));
  const percentagePaid = row.installments > 0 ? (row.paid_installments / row.installments) * 100 : 0;
  const isCompleted = remainingInstallments <= 0 || remainingValue <= 0.009;
  const nextDueDate = isCompleted ? null : getInstallmentDueDate(row.start_date, row.paid_installments);
  const daysUntilDue = nextDueDate
    ? differenceInCalendarDays(asDateStart(nextDueDate), asDateStart(now))
    : null;

  return {
    installmentCount: row.installments,
    paidInstallments: row.paid_installments,
    remainingInstallments,
    totalValue,
    installmentValue: row.installment_value,
    paidValue,
    remainingValue,
    percentagePaid: Number.isFinite(percentagePaid) ? Math.max(0, Math.min(100, percentagePaid)) : 0,
    isCompleted,
    isActive: !isCompleted,
    nextDueDate,
    daysUntilDue,
    isDueSoon: daysUntilDue !== null && daysUntilDue >= 0 && daysUntilDue <= 7,
    isOverdue: daysUntilDue !== null && daysUntilDue < 0,
  };
};

export const computeAutoPaidInstallments = (
  installment: InstallmentRow | Partial<InstallmentRow>,
  now = new Date(),
) => {
  const row = normalizeInstallmentRow(installment);
  let nextPaidInstallments = row.paid_installments;
  let advanced = 0;
  const today = asDateStart(now);

  while (nextPaidInstallments < row.installments) {
    const dueDate = asDateStart(getInstallmentDueDate(row.start_date, nextPaidInstallments));
    if (dueDate.getTime() > today.getTime()) break;
    nextPaidInstallments += 1;
    advanced += 1;
  }

  return { nextPaidInstallments, advanced };
};

export const summarizeInstallments = (
  rows: Array<InstallmentRow | Partial<InstallmentRow>>,
  now = new Date(),
  dueSoonDays = 7,
): InstallmentSummary => {
  const enriched = rows.map((raw) => {
    const row = normalizeInstallmentRow(raw);
    const metrics = computeInstallmentMetrics(row, now);
    return { row, metrics };
  });

  const active = enriched.filter((item) => item.metrics.isActive);
  const dueSoon = active
    .filter((item) =>
      item.metrics.daysUntilDue !== null
      && item.metrics.daysUntilDue >= 0
      && item.metrics.daysUntilDue <= Math.max(0, Math.round(dueSoonDays)),
    )
    .sort((a, b) => {
      const left = a.metrics.nextDueDate ? a.metrics.nextDueDate.getTime() : Number.MAX_SAFE_INTEGER;
      const right = b.metrics.nextDueDate ? b.metrics.nextDueDate.getTime() : Number.MAX_SAFE_INTEGER;
      return left - right;
    });
  const overdue = active
    .filter((item) => item.metrics.daysUntilDue !== null && item.metrics.daysUntilDue < 0)
    .sort((a, b) => {
      const left = a.metrics.daysUntilDue ?? 0;
      const right = b.metrics.daysUntilDue ?? 0;
      return left - right;
    });

  return {
    active,
    dueSoon,
    overdue,
    activeTotalRemaining: round2(active.reduce((sum, item) => sum + item.metrics.remainingValue, 0)),
    activeRemainingInstallments: active.reduce((sum, item) => sum + item.metrics.remainingInstallments, 0),
  };
};

