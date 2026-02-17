import {
  addDays,
  addMonths,
  addYears,
  differenceInCalendarDays,
  subDays,
  subMonths,
  subYears,
} from "date-fns";
import { toNumber } from "@/lib/money";
import { sanitizeSubscriptionIconPath } from "@/lib/customMedia";

export type BillingCycle = "monthly" | "annual" | "weekly";
export type PaymentStatus = "paid" | "pending" | "skipped";

export type RecurringSubscriptionRow = {
  id: string;
  user_id: string;
  name: string;
  price: number;
  billing_day: number;
  billing_cycle: BillingCycle;
  start_date: string;
  category: string | null;
  payment_method: string | null;
  notes: string | null;
  icon_path: string | null;
  last_charge_date: string | null;
  last_used_at: string | null;
  active: boolean;
  created_at: string;
  updated_at: string | null;
};

export type RecurringSubscriptionPaymentRow = {
  id: string;
  subscription_id: string;
  user_id: string;
  charge_date: string;
  amount: number;
  status: PaymentStatus;
  created_at: string;
};

export type RecurringSubscriptionMetrics = {
  monthlyEquivalent: number;
  yearlyCommitment: number;
  currentDueDate: Date;
  nextChargeDate: Date;
  daysUntilCurrentDue: number;
  daysUntilCharge: number;
  isCurrentCyclePaid: boolean;
  isDueToday: boolean;
  isDueSoon: boolean;
  isOverdue: boolean;
  daysSinceLastUse: number | null;
  isUnderused: boolean;
  usageLevel: "high" | "medium" | "low" | "unknown";
};

export type RecurringSubscriptionWithMetrics = {
  row: RecurringSubscriptionRow;
  metrics: RecurringSubscriptionMetrics;
};

export type RecurringSubscriptionSummary = {
  active: RecurringSubscriptionWithMetrics[];
  dueToday: RecurringSubscriptionWithMetrics[];
  dueSoon: RecurringSubscriptionWithMetrics[];
  overdue: RecurringSubscriptionWithMetrics[];
  underused: RecurringSubscriptionWithMetrics[];
  upcoming: RecurringSubscriptionWithMetrics[];
  monthlyTotal: number;
  yearlyTotal: number;
  forecast3Months: number;
  forecast6Months: number;
  forecast12Months: number;
  projected30Days: number;
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
    return asDateStart(new Date(year, Math.max(0, month - 1), Math.max(1, day)));
  }
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return asDateStart(parsed);
  return asDateStart(new Date());
};

const toIsoDate = (value: Date) =>
  `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;

const getLastDayOfMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();

const clampBillingCycle = (value?: string | null): BillingCycle => {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "annual") return "annual";
  if (normalized === "weekly") return "weekly";
  return "monthly";
};

const normalizeText = (value?: string | null) =>
  (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const clampBillingDay = (value: unknown, cycle: BillingCycle) => {
  const parsed = Math.round(toNumber(value));
  if (cycle === "weekly") return Math.max(0, Math.min(6, parsed));
  return Math.max(1, Math.min(31, parsed || 1));
};

const weekStart = (value: Date) => asDateStart(addDays(asDateStart(value), -asDateStart(value).getDay()));

const isSameMonthlyCycle = (left: Date, right: Date) =>
  left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth();

const isSameAnnualCycle = (left: Date, right: Date) => left.getFullYear() === right.getFullYear();

const isSameWeeklyCycle = (left: Date, right: Date) =>
  weekStart(left).getTime() === weekStart(right).getTime();

const getCurrentCycleDueDate = (row: RecurringSubscriptionRow, now = new Date()) => {
  const today = asDateStart(now);
  if (row.billing_cycle === "weekly") {
    const shift = row.billing_day - today.getDay();
    return asDateStart(addDays(today, shift));
  }

  if (row.billing_cycle === "annual") {
    const anchor = parseDateOnly(row.start_date);
    const year = today.getFullYear();
    const month = anchor.getMonth();
    const lastDay = getLastDayOfMonth(year, month);
    const day = Math.min(Math.max(1, row.billing_day), lastDay);
    return asDateStart(new Date(year, month, day));
  }

  const year = today.getFullYear();
  const month = today.getMonth();
  const lastDay = getLastDayOfMonth(year, month);
  const day = Math.min(Math.max(1, row.billing_day), lastDay);
  return asDateStart(new Date(year, month, day));
};

const addBillingCycle = (value: Date, cycle: BillingCycle) => {
  if (cycle === "weekly") return asDateStart(addDays(value, 7));
  if (cycle === "annual") return asDateStart(addYears(value, 1));
  return asDateStart(addMonths(value, 1));
};

const subtractBillingCycle = (value: Date, cycle: BillingCycle) => {
  if (cycle === "weekly") return asDateStart(subDays(value, 7));
  if (cycle === "annual") return asDateStart(subYears(value, 1));
  return asDateStart(subMonths(value, 1));
};

const isCurrentCyclePaid = (row: RecurringSubscriptionRow, currentDueDate: Date) => {
  if (!row.last_charge_date) return false;
  const paidAt = parseDateOnly(row.last_charge_date);
  if (row.billing_cycle === "weekly") return isSameWeeklyCycle(paidAt, currentDueDate);
  if (row.billing_cycle === "annual") return isSameAnnualCycle(paidAt, currentDueDate);
  return isSameMonthlyCycle(paidAt, currentDueDate);
};

const monthlyEquivalentForCycle = (price: number, cycle: BillingCycle) => {
  if (cycle === "annual") return round2(price / 12);
  if (cycle === "weekly") return round2((price * 52) / 12);
  return round2(price);
};

const usageLevelFromDays = (daysSinceLastUse: number | null): "high" | "medium" | "low" | "unknown" => {
  if (daysSinceLastUse === null) return "unknown";
  if (daysSinceLastUse <= 14) return "high";
  if (daysSinceLastUse <= 30) return "medium";
  return "low";
};

const estimateProjectedCost = (
  subscriptions: RecurringSubscriptionRow[],
  daysAhead: number,
  now = new Date(),
) => {
  const today = asDateStart(now);
  const safeWindow = Math.max(0, Math.round(daysAhead));

  let total = 0;
  for (const row of subscriptions) {
    if (!row.active) continue;
    const metrics = computeRecurringSubscriptionMetrics(row, now);
    let next = asDateStart(metrics.nextChargeDate);
    let guard = 0;
    while (guard < 500) {
      const diff = differenceInCalendarDays(next, today);
      if (diff > safeWindow) break;
      if (diff >= 0) total += row.price;
      next = addBillingCycle(next, row.billing_cycle);
      guard += 1;
    }
  }

  return round2(total);
};

export const normalizeRecurringSubscriptionRow = (
  row: Partial<RecurringSubscriptionRow>,
): RecurringSubscriptionRow => {
  const billingCycle = clampBillingCycle(row.billing_cycle);
  const price = Math.max(0, round2(toNumber(row.price)));
  const startDate = parseDateOnly(row.start_date);
  const billingDay = clampBillingDay(
    row.billing_day ?? (billingCycle === "weekly" ? startDate.getDay() : startDate.getDate()),
    billingCycle,
  );

  return {
    id: String(row.id || ""),
    user_id: String(row.user_id || ""),
    name: String(row.name || "Assinatura").trim() || "Assinatura",
    price,
    billing_day: billingDay,
    billing_cycle: billingCycle,
    start_date: toIsoDate(startDate),
    category: typeof row.category === "string" && row.category.trim() ? row.category.trim() : null,
    payment_method: typeof row.payment_method === "string" && row.payment_method.trim()
      ? row.payment_method.trim()
      : null,
    notes: typeof row.notes === "string" && row.notes.trim() ? row.notes.trim() : null,
    icon_path: sanitizeSubscriptionIconPath(row.icon_path),
    last_charge_date: row.last_charge_date ? toIsoDate(parseDateOnly(row.last_charge_date)) : null,
    last_used_at: row.last_used_at ? toIsoDate(parseDateOnly(row.last_used_at)) : null,
    active: typeof row.active === "boolean" ? row.active : true,
    created_at: row.created_at || new Date().toISOString(),
    updated_at: row.updated_at || null,
  };
};

export const inferRecurringSubscriptionCategory = (serviceName?: string | null, fallback?: string | null) => {
  const fallbackValue = (fallback || "").trim();
  if (fallbackValue) return fallbackValue;
  const normalized = normalizeText(serviceName);
  if (!normalized) return "Assinaturas";
  if (
    normalized.includes("netflix")
    || normalized.includes("spotify")
    || normalized.includes("prime")
    || normalized.includes("disney")
    || normalized.includes("hbo")
    || normalized.includes("youtube")
    || normalized.includes("stream")
  ) {
    return "Streaming";
  }
  if (
    normalized.includes("icloud")
    || normalized.includes("google drive")
    || normalized.includes("drive")
    || normalized.includes("dropbox")
    || normalized.includes("onedrive")
  ) {
    return "Cloud";
  }
  if (normalized.includes("academia") || normalized.includes("gym")) {
    return "Fitness";
  }
  if (
    normalized.includes("figma")
    || normalized.includes("notion")
    || normalized.includes("adobe")
    || normalized.includes("chatgpt")
  ) {
    return "Produtividade";
  }
  return "Assinaturas";
};

export const buildRecurringSubscriptionExternalId = (subscriptionId: string, chargeDate: string) =>
  `recurring-subscription:${String(subscriptionId || "").trim()}:${String(chargeDate || "").trim()}`;

export const getLatestRecurringDueDate = (
  subscription: RecurringSubscriptionRow | Partial<RecurringSubscriptionRow>,
  now = new Date(),
) => {
  const row = normalizeRecurringSubscriptionRow(subscription);
  const today = asDateStart(now);
  let dueDate = getCurrentCycleDueDate(row, today);
  if (dueDate.getTime() > today.getTime()) {
    dueDate = subtractBillingCycle(dueDate, row.billing_cycle);
  }
  const startDate = parseDateOnly(row.start_date);
  if (dueDate.getTime() < startDate.getTime()) return null;
  return dueDate;
};

export const isRecurringChargeCovered = (
  subscription: RecurringSubscriptionRow | Partial<RecurringSubscriptionRow>,
  dueDate: Date,
) => {
  const row = normalizeRecurringSubscriptionRow(subscription);
  if (!row.last_charge_date) return false;
  const lastCharge = parseDateOnly(row.last_charge_date);
  return asDateStart(lastCharge).getTime() >= asDateStart(dueDate).getTime();
};

export const toRecurringIsoDate = (value: Date) => toIsoDate(asDateStart(value));

export const normalizeRecurringSubscriptionPaymentRow = (
  row: Partial<RecurringSubscriptionPaymentRow>,
): RecurringSubscriptionPaymentRow => {
  const statusRaw = String(row.status || "").trim().toLowerCase();
  const status: PaymentStatus =
    statusRaw === "pending" || statusRaw === "skipped" ? statusRaw : "paid";

  return {
    id: String(row.id || ""),
    subscription_id: String(row.subscription_id || ""),
    user_id: String(row.user_id || ""),
    charge_date: toIsoDate(parseDateOnly(row.charge_date)),
    amount: Math.max(0, round2(toNumber(row.amount))),
    status,
    created_at: row.created_at || new Date().toISOString(),
  };
};

export const computeRecurringSubscriptionMetrics = (
  subscription: RecurringSubscriptionRow | Partial<RecurringSubscriptionRow>,
  now = new Date(),
): RecurringSubscriptionMetrics => {
  const row = normalizeRecurringSubscriptionRow(subscription);
  const today = asDateStart(now);
  const currentDueDate = getCurrentCycleDueDate(row, today);
  const paidCurrentCycle = isCurrentCyclePaid(row, currentDueDate);
  const nextChargeDate = paidCurrentCycle
    ? addBillingCycle(currentDueDate, row.billing_cycle)
    : currentDueDate;
  const daysUntilCurrentDue = differenceInCalendarDays(currentDueDate, today);
  const daysUntilCharge = differenceInCalendarDays(nextChargeDate, today);

  const lastUseDate = row.last_used_at ? parseDateOnly(row.last_used_at) : null;
  const daysSinceLastUse = lastUseDate ? differenceInCalendarDays(today, lastUseDate) : null;
  const daysSinceCreated = differenceInCalendarDays(today, parseDateOnly(row.created_at));
  const isUnderused = row.active && (
    daysSinceLastUse !== null
      ? daysSinceLastUse > 45
      : daysSinceCreated >= 30
  );

  const monthlyEquivalent = monthlyEquivalentForCycle(row.price, row.billing_cycle);

  return {
    monthlyEquivalent,
    yearlyCommitment: round2(monthlyEquivalent * 12),
    currentDueDate,
    nextChargeDate,
    daysUntilCurrentDue,
    daysUntilCharge,
    isCurrentCyclePaid: paidCurrentCycle,
    isDueToday: !paidCurrentCycle && daysUntilCurrentDue === 0,
    isDueSoon: !paidCurrentCycle && daysUntilCurrentDue > 0 && daysUntilCurrentDue <= 3,
    isOverdue: !paidCurrentCycle && daysUntilCurrentDue < 0,
    daysSinceLastUse,
    isUnderused,
    usageLevel: usageLevelFromDays(daysSinceLastUse),
  };
};

export const summarizeRecurringSubscriptions = (
  rows: Array<RecurringSubscriptionRow | Partial<RecurringSubscriptionRow>>,
  now = new Date(),
  upcomingWindowDays = 15,
): RecurringSubscriptionSummary => {
  const active = rows
    .map((raw) => normalizeRecurringSubscriptionRow(raw))
    .filter((row) => row.id && row.user_id && row.active)
    .map((row) => ({ row, metrics: computeRecurringSubscriptionMetrics(row, now) }));

  const dueToday = active
    .filter((item) => item.metrics.isDueToday)
    .sort((a, b) => a.metrics.daysUntilCurrentDue - b.metrics.daysUntilCurrentDue);

  const dueSoon = active
    .filter((item) => item.metrics.isDueSoon)
    .sort((a, b) => a.metrics.daysUntilCurrentDue - b.metrics.daysUntilCurrentDue);

  const overdue = active
    .filter((item) => item.metrics.isOverdue)
    .sort((a, b) => a.metrics.daysUntilCurrentDue - b.metrics.daysUntilCurrentDue);

  const underused = active
    .filter((item) => item.metrics.isUnderused)
    .sort((a, b) => {
      const left = a.metrics.daysSinceLastUse ?? Number.MAX_SAFE_INTEGER;
      const right = b.metrics.daysSinceLastUse ?? Number.MAX_SAFE_INTEGER;
      return right - left;
    });

  const upcoming = active
    .filter((item) =>
      item.metrics.daysUntilCharge >= 0
      && item.metrics.daysUntilCharge <= Math.max(0, Math.round(upcomingWindowDays)),
    )
    .sort((a, b) => a.metrics.daysUntilCharge - b.metrics.daysUntilCharge);

  const monthlyTotal = round2(active.reduce((sum, item) => sum + item.metrics.monthlyEquivalent, 0));

  const normalizedRows = active.map((item) => item.row);

  return {
    active,
    dueToday,
    dueSoon,
    overdue,
    underused,
    upcoming,
    monthlyTotal,
    yearlyTotal: round2(monthlyTotal * 12),
    forecast3Months: round2(monthlyTotal * 3),
    forecast6Months: round2(monthlyTotal * 6),
    forecast12Months: round2(monthlyTotal * 12),
    projected30Days: estimateProjectedCost(normalizedRows, 30, now),
  };
};
