/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Account, Card, Transaction } from "@/lib/finance";
import {
  computeDashboardSummary,
  monthInputValue,
  normalizePeriod,
} from "@/core/finance/dashboardSummary";
import { loadDashboardData } from "@/data/dashboard/loadDashboardData";
import { normalizeInstallmentRow, type InstallmentRow } from "@/lib/installments";
import {
  normalizeRecurringSubscriptionRow,
  type RecurringSubscriptionRow,
} from "@/lib/recurringSubscriptions";
import { toNumber } from "@/lib/money";
import { supabase } from "@/lib/supabaseClient";

const isMissingInstallmentsTableError = (message?: string | null) =>
  /relation .*installments/i.test(message || "")
  || /schema cache/i.test((message || "").toLowerCase());

const isMissingRecurringSubscriptionsTableError = (message?: string | null) =>
  /relation .*recurring_subscriptions/i.test(message || "")
  || /schema cache/i.test((message || "").toLowerCase());

const isMissingPlanningTableError = (message?: string | null) =>
  /relation .*financial_planning/i.test(message || "")
  || /schema cache/i.test((message || "").toLowerCase());

export type DashboardPlanningGoalRow = {
  id: string;
  user_id: string;
  goal_name: string;
  goal_amount: number;
  current_amount: number;
  months: number;
  is_completed: boolean;
  completed_at: string | null;
  created_at: string;
};

const toSafeMonths = (value: unknown) => Math.max(1, Math.round(toNumber(value) || 1));

const normalizePlanningGoalRow = (row: Partial<DashboardPlanningGoalRow>): DashboardPlanningGoalRow => ({
  id: String(row.id || ""),
  user_id: String(row.user_id || ""),
  goal_name: String(row.goal_name || ""),
  goal_amount: Math.max(0, toNumber(row.goal_amount)),
  current_amount: Math.max(0, toNumber(row.current_amount)),
  months: toSafeMonths(row.months),
  is_completed: Boolean(row.is_completed),
  completed_at: row.completed_at || null,
  created_at: row.created_at || new Date().toISOString(),
});

export const useDashboardSummary = () => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [installments, setInstallments] = useState<InstallmentRow[]>([]);
  const [recurringSubscriptions, setRecurringSubscriptions] = useState<RecurringSubscriptionRow[]>([]);
  const [planningGoals, setPlanningGoals] = useState<DashboardPlanningGoalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [period, setPeriod] = useState(monthInputValue());

  const refresh = useCallback(async () => {
    setLoading(true);
    setMessage(null);

    const [result, installmentRes, recurringRes, planningRes] = await Promise.all([
      loadDashboardData(),
      supabase.from("installments").select("*").order("created_at", { ascending: false }),
      supabase.from("recurring_subscriptions").select("*").order("created_at", { ascending: false }),
      supabase.from("financial_planning").select("*").order("created_at", { ascending: false }),
    ]);

    if (installmentRes.error) {
      setInstallments([]);
      if (!isMissingInstallmentsTableError(installmentRes.error.message)) {
        setMessage(`Parcelas indisponiveis: ${installmentRes.error.message}`);
      }
    } else {
      const normalized = ((installmentRes.data || []) as Partial<InstallmentRow>[])
        .map((row) => normalizeInstallmentRow(row))
        .filter((row) => row.id && row.user_id);
      setInstallments(normalized);
    }

    if (recurringRes.error) {
      setRecurringSubscriptions([]);
      if (!isMissingRecurringSubscriptionsTableError(recurringRes.error.message)) {
        setMessage((prev) =>
          prev
            ? `${prev} | Assinaturas indisponiveis: ${recurringRes.error?.message}`
            : `Assinaturas indisponiveis: ${recurringRes.error?.message}`,
        );
      }
    } else {
      const normalized = ((recurringRes.data || []) as Partial<RecurringSubscriptionRow>[])
        .map((row) => normalizeRecurringSubscriptionRow(row))
        .filter((row) => row.id && row.user_id);
      setRecurringSubscriptions(normalized);
    }

    if (planningRes.error) {
      setPlanningGoals([]);
      if (!isMissingPlanningTableError(planningRes.error.message)) {
        setMessage((prev) =>
          prev
            ? `${prev} | Planejamento indisponivel: ${planningRes.error?.message}`
            : `Planejamento indisponivel: ${planningRes.error?.message}`,
        );
      }
    } else {
      const normalized = ((planningRes.data || []) as Partial<DashboardPlanningGoalRow>[])
        .map((row) => normalizePlanningGoalRow(row))
        .filter((row) => row.id && row.user_id);
      setPlanningGoals(normalized);
    }

    if (result.error || !result.data) {
      const baseError = result.error || "Falha ao carregar dados.";
      setMessage((prev) => (prev ? `${baseError} | ${prev}` : baseError));
      setLoading(false);
      return;
    }

    setAccounts(result.data.accounts);
    setCards(result.data.cards);
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
    accounts,
    cards,
    transactions,
    installments,
    recurringSubscriptions,
    planningGoals,
    summary,
    setPeriod,
    refresh,
  };
};
