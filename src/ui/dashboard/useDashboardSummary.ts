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
import { supabase } from "@/lib/supabaseClient";

const isMissingInstallmentsTableError = (message?: string | null) =>
  /relation .*installments/i.test(message || "")
  || /schema cache/i.test((message || "").toLowerCase());

const isMissingRecurringSubscriptionsTableError = (message?: string | null) =>
  /relation .*recurring_subscriptions/i.test(message || "")
  || /schema cache/i.test((message || "").toLowerCase());

export const useDashboardSummary = () => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [installments, setInstallments] = useState<InstallmentRow[]>([]);
  const [recurringSubscriptions, setRecurringSubscriptions] = useState<RecurringSubscriptionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [period, setPeriod] = useState(monthInputValue());

  const refresh = useCallback(async () => {
    setLoading(true);
    setMessage(null);

    const [result, installmentRes, recurringRes] = await Promise.all([
      loadDashboardData(),
      supabase.from("installments").select("*").order("created_at", { ascending: false }),
      supabase.from("recurring_subscriptions").select("*").order("created_at", { ascending: false }),
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
    summary,
    setPeriod,
    refresh,
  };
};
