import type { Account, Transaction } from "@/lib/finance";
import { toNumber } from "@/lib/money";

export type DashboardSummary = {
  availableBalance: number;
  monthIncome: number;
  monthExpense: number;
  net: number;
};

const PERIOD_REGEX = /^\d{4}-\d{2}$/;

export const monthInputValue = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

const getMonthKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

export const normalizePeriod = (period?: string) =>
  period && PERIOD_REGEX.test(period) ? period : monthInputValue();

const applyTransactionToBalances = (
  balances: Map<string, number>,
  transaction: Transaction,
) => {
  const amount = toNumber(transaction.amount);

  if (transaction.type === "income" && transaction.account_id) {
    balances.set(
      transaction.account_id,
      (balances.get(transaction.account_id) ?? 0) + amount,
    );
  }

  if (
    (transaction.type === "expense" || transaction.type === "card_payment") &&
    transaction.account_id
  ) {
    balances.set(
      transaction.account_id,
      (balances.get(transaction.account_id) ?? 0) - amount,
    );
  }

  if (transaction.type === "adjustment" && transaction.account_id) {
    balances.set(
      transaction.account_id,
      (balances.get(transaction.account_id) ?? 0) + amount,
    );
  }

  if (transaction.type === "transfer") {
    if (transaction.account_id) {
      balances.set(
        transaction.account_id,
        (balances.get(transaction.account_id) ?? 0) - amount,
      );
    }
    if (transaction.to_account_id) {
      balances.set(
        transaction.to_account_id,
        (balances.get(transaction.to_account_id) ?? 0) + amount,
      );
    }
  }
};

const computeAvailableBalance = (accounts: Account[], transactions: Transaction[]) => {
  const balances = new Map<string, number>();

  accounts.forEach((account) => {
    balances.set(account.id, toNumber(account.opening_balance));
  });

  transactions.forEach((transaction) => {
    applyTransactionToBalances(balances, transaction);
  });

  return accounts
    .filter((account) => !account.archived)
    .reduce((sum, account) => sum + (balances.get(account.id) ?? 0), 0);
};

const computeMonthTotals = (transactions: Transaction[], period: string) => {
  let monthIncome = 0;
  let monthExpense = 0;

  transactions.forEach((transaction) => {
    const key = getMonthKey(new Date(transaction.occurred_at));
    if (key !== period) return;

    const amount = toNumber(transaction.amount);
    if (transaction.type === "income") {
      monthIncome += amount;
    }

    if (transaction.type === "expense" || transaction.type === "card_payment") {
      monthExpense += amount;
    }
  });

  return { monthIncome, monthExpense };
};

export const computeDashboardSummary = (
  accounts: Account[],
  transactions: Transaction[],
  period: string,
): DashboardSummary => {
  const safePeriod = normalizePeriod(period);
  const availableBalance = computeAvailableBalance(accounts, transactions);
  const { monthIncome, monthExpense } = computeMonthTotals(transactions, safePeriod);

  return {
    availableBalance,
    monthIncome,
    monthExpense,
    net: monthIncome - monthExpense,
  };
};

