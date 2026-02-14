import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  format,
  getDaysInMonth,
  isAfter,
  isBefore,
  parseISO,
  startOfMonth,
  subMonths,
} from "date-fns";
import { toNumber } from "./money";

export type TransactionType =
  | "income"
  | "expense"
  | "transfer"
  | "adjustment"
  | "card_payment";

export type TransactionCategoryType =
  | "pix"
  | "receita"
  | "despesa"
  | "cartao";

export type Account = {
  id: string;
  name: string;
  institution: string | null;
  currency: string;
  opening_balance: number;
  archived: boolean;
  created_at: string;
};

export type Card = {
  id: string;
  name: string;
  issuer: string | null;
  limit_total: number;
  closing_day: number;
  due_day: number;
  color?: string | null;
  note?: string | null;
  archived: boolean;
  created_at: string;
};

export type Transaction = {
  id: string;
  occurred_at: string;
  type: TransactionType;
  transaction_type?: TransactionCategoryType | null;
  description: string;
  category: string | null;
  amount: number;
  account_id: string | null;
  to_account_id: string | null;
  card_id: string | null;
  tags?: string[] | null;
  note?: string | null;
};

export type Alert = {
  id: string;
  type:
    | "card_closing_soon"
    | "card_due_soon"
    | "investment_drop"
    | "dollar_threshold"
    | "spending_spike"
    | "forecast_warning"
    | "relationship_delay_risk"
    | "relationship_limit_high"
    | "relationship_score_drop"
    | "relationship_spending_spike";
  title: string;
  body: string;
  due_at: string | null;
  card_id?: string | null;
  is_read: boolean;
  created_at: string;
};

export const getMonthKey = (date: Date) => format(date, "yyyy-MM");

export const lastMonths = (count = 12, baseDate = new Date()) =>
  Array.from({ length: count }, (_, index) =>
    subMonths(baseDate, count - 1 - index),
  );

const safeSetDay = (date: Date, day: number) => {
  const maxDay = getDaysInMonth(date);
  const safeDay = Math.min(Math.max(day, 1), maxDay);
  const copy = new Date(date);
  copy.setDate(safeDay);
  copy.setHours(0, 0, 0, 0);
  return copy;
};

export const buildMonthlySeries = (
  transactions: Transaction[],
  baseDate = new Date(),
) => {
  return lastMonths(12, baseDate).map((monthDate) => {
    const key = getMonthKey(monthDate);
    const monthTxs = transactions.filter((tx) =>
      getMonthKey(parseISO(tx.occurred_at)) === key,
    );
    const income = monthTxs
      .filter((tx) => tx.type === "income")
      .reduce((sum, tx) => sum + toNumber(tx.amount), 0);
    const expense = monthTxs
      .filter((tx) => tx.type === "expense" || tx.type === "card_payment")
      .reduce((sum, tx) => sum + toNumber(tx.amount), 0);
    return {
      month: format(monthDate, "MMM"),
      income,
      expense,
    };
  });
};

export const groupByCategory = (
  transactions: Transaction[],
  monthDate = new Date(),
) => {
  const key = getMonthKey(monthDate);
  const map = new Map<string, number>();
  transactions
    .filter((tx) =>
      getMonthKey(parseISO(tx.occurred_at)) === key,
    )
    .filter((tx) => tx.type === "expense" || tx.type === "card_payment")
    .forEach((tx) => {
      const cat = tx.category || "Outros";
      map.set(cat, (map.get(cat) ?? 0) + toNumber(tx.amount));
    });
  return Array.from(map.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
};

export const computeAccountBalances = (
  accounts: Account[],
  transactions: Transaction[],
) => {
  const balances = new Map<string, number>();
  accounts.forEach((account) => {
    balances.set(account.id, toNumber(account.opening_balance));
  });

  transactions.forEach((tx) => {
    const amount = toNumber(tx.amount);
    if (tx.type === "income" && tx.account_id) {
      balances.set(tx.account_id, (balances.get(tx.account_id) ?? 0) + amount);
    }
    if (tx.type === "expense" && tx.account_id) {
      balances.set(tx.account_id, (balances.get(tx.account_id) ?? 0) - amount);
    }
    if (tx.type === "transfer") {
      if (tx.account_id) {
        balances.set(tx.account_id, (balances.get(tx.account_id) ?? 0) - amount);
      }
      if (tx.to_account_id) {
        balances.set(
          tx.to_account_id,
          (balances.get(tx.to_account_id) ?? 0) + amount,
        );
      }
    }
    if (tx.type === "adjustment" && tx.account_id) {
      balances.set(tx.account_id, (balances.get(tx.account_id) ?? 0) + amount);
    }
    if (tx.type === "card_payment" && tx.account_id) {
      balances.set(tx.account_id, (balances.get(tx.account_id) ?? 0) - amount);
    }
  });

  return balances;
};

export const computeAvailableBalance = (
  accounts: Account[],
  transactions: Transaction[],
) => {
  const balances = computeAccountBalances(accounts, transactions);
  return accounts
    .filter((account) => !account.archived)
    .reduce((sum, account) => sum + (balances.get(account.id) ?? 0), 0);
};

export const computeForecastBalance = (
  accounts: Account[],
  transactions: Transaction[],
  baseDate = new Date(),
) => {
  const current = computeAvailableBalance(accounts, transactions);
  const futureDelta = transactions
    .filter((tx) => isAfter(parseISO(tx.occurred_at), baseDate))
    .reduce((sum, tx) => {
      const amount = toNumber(tx.amount);
      if (tx.type === "income") return sum + amount;
      if (tx.type === "expense" || tx.type === "card_payment") return sum - amount;
      if (tx.type === "adjustment") return sum + amount;
      if (tx.type === "transfer") return sum;
      return sum;
    }, 0);
  return current + futureDelta;
};

export const calculateInsights = (
  transactions: Transaction[],
  baseDate = new Date(),
) => {
  const currentKey = getMonthKey(baseDate);
  const prevKey = getMonthKey(subMonths(baseDate, 1));

  const sumForMonth = (key: string) =>
    transactions
      .filter((tx) => getMonthKey(parseISO(tx.occurred_at)) === key)
      .filter((tx) => tx.type === "expense" || tx.type === "card_payment")
      .reduce((sum, tx) => sum + toNumber(tx.amount), 0);

  const currentExpense = sumForMonth(currentKey);
  const prevExpense = sumForMonth(prevKey);
  const deltaPct = prevExpense
    ? ((currentExpense - prevExpense) / prevExpense) * 100
    : 0;

  const categories = groupByCategory(transactions, baseDate);
  const topCategory = categories[0];

  return {
    currentExpense,
    prevExpense,
    deltaPct,
    topCategory,
  };
};

export const computeCardCycleDates = (card: Card, baseDate = new Date()) => {
  const monthStart = startOfMonth(baseDate);
  const closingThisMonth = safeSetDay(monthStart, card.closing_day);
  const closingDate =
    baseDate <= closingThisMonth
      ? closingThisMonth
      : safeSetDay(addMonths(monthStart, 1), card.closing_day);

  const prevClosing = safeSetDay(subMonths(closingDate, 1), card.closing_day);
  const cycleStart = addDays(prevClosing, 1);
  const cycleEnd = closingDate;

  const dueDate =
    card.due_day > card.closing_day
      ? safeSetDay(closingDate, card.due_day)
      : safeSetDay(addMonths(closingDate, 1), card.due_day);

  return { cycleStart, cycleEnd, dueDate, closingDate };
};

export const computeCardSummary = (
  card: Card,
  transactions: Transaction[],
  baseDate = new Date(),
) => {
  const { cycleStart, cycleEnd, closingDate, dueDate } =
    computeCardCycleDates(card, baseDate);

  const cardTxs = transactions.filter(
    (tx) => tx.card_id === card.id && tx.type !== "card_payment",
  );

  const inCurrentCycle = cardTxs.filter((tx) => {
    const d = parseISO(tx.occurred_at);
    return !isBefore(d, cycleStart) && !isAfter(d, cycleEnd);
  });

  const currentTotal = inCurrentCycle.reduce(
    (sum, tx) => sum + toNumber(tx.amount),
    0,
  );

  const nextClosing = safeSetDay(addMonths(closingDate, 1), card.closing_day);
  const forecastTxs = cardTxs.filter((tx) => {
    const d = parseISO(tx.occurred_at);
    return isAfter(d, cycleEnd) && !isAfter(d, nextClosing);
  });

  const forecastTotal = forecastTxs.reduce(
    (sum, tx) => sum + toNumber(tx.amount),
    0,
  );

  const limitUsed = currentTotal;
  const limitAvailable = Math.max(card.limit_total - limitUsed, 0);

  return {
    cycleStart,
    cycleEnd,
    closingDate,
    dueDate,
    currentTotal,
    forecastTotal,
    limitUsed,
    limitAvailable,
  };
};

export const buildCardAlerts = (
  cards: Card[],
  baseDate = new Date(),
  daysBefore = 3,
) => {
  const alerts: Omit<Alert, "id" | "is_read" | "created_at">[] = [];

  cards.forEach((card) => {
    const { closingDate, dueDate } = computeCardCycleDates(card, baseDate);
    const closingDiff = differenceInCalendarDays(closingDate, baseDate);
    const dueDiff = differenceInCalendarDays(dueDate, baseDate);

    if (closingDiff >= 0 && closingDiff <= daysBefore) {
      alerts.push({
        type: "card_closing_soon",
        title: `Cartao ${card.name} fecha em ${format(
          closingDate,
          "dd/MM",
        )}`,
        body: `Fechamento em ${format(
          closingDate,
          "dd/MM/yyyy",
        )}. Vencimento em ${format(dueDate, "dd/MM/yyyy")}.`,
        due_at: format(closingDate, "yyyy-MM-dd"),
        card_id: card.id,
      });
    }

    if (dueDiff >= 0 && dueDiff <= daysBefore) {
      alerts.push({
        type: "card_due_soon",
        title: `Cartao ${card.name} vence em ${format(dueDate, "dd/MM")}`,
        body: `Vencimento em ${format(
          dueDate,
          "dd/MM/yyyy",
        )}. Fechamento em ${format(closingDate, "dd/MM/yyyy")}.`,
        due_at: format(dueDate, "yyyy-MM-dd"),
        card_id: card.id,
      });
    }
  });

  return alerts;
};

export const monthLabel = (dateStr: string) => {
  const d = parseISO(dateStr);
  return format(d, "dd/MM/yyyy");
};
