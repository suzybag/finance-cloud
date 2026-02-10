/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Account, Transaction } from "@/lib/finance";
import {
  computeDashboardSummary,
  monthInputValue,
  normalizePeriod,
} from "@/core/finance/dashboardSummary";
import { loadDashboardData } from "@/data/dashboard/loadDashboardData";

export const useDashboardSummary = () => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [period, setPeriod] = useState(monthInputValue());

  const refresh = useCallback(async () => {
    setLoading(true);
    setMessage(null);

    const result = await loadDashboardData();

    if (result.error || !result.data) {
      setMessage(result.error ?? "Falha ao carregar dados.");
      setLoading(false);
      return;
    }

    setAccounts(result.data.accounts);
    setTransactions(result.data.transactions);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const summary = useMemo(
    () => computeDashboardSummary(accounts, transactions, normalizePeriod(period)),
    [accounts, transactions, period],
  );

  return {
    loading,
    message,
    period,
    summary,
    setPeriod,
    refresh,
  };
};
