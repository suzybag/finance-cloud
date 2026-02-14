/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export type BankRelationshipRiskAlert = {
  code: "delay_risk" | "limit_high" | "score_drop" | "spending_spike";
  severity: "warning" | "critical";
  title: string;
  body: string;
};

export type BankRelationshipSummary = {
  score: number;
  previousScore: number | null;
  deltaScore: number | null;
  riskLevel: "excelente" | "bom" | "atencao" | "alto_risco";
  riskLabel: string;
  pillars: {
    punctuality: number;
    limitUsage: number;
    investments: number;
    history: number;
    spendingControl: number;
  };
  indicators: {
    cardsCount: number;
    cardsWithOpenInvoice: number;
    overdueInvoices: number;
    dueSoonInvoices: number;
    onTimePaymentRate: number;
    cardLimitUtilizationPct: number;
    activeInvestments: number;
    investedTotal: number;
    incomeCurrentMonth: number;
    expenseCurrentMonth: number;
    expenseDeltaPct: number | null;
    savingsRatePct: number | null;
    activityMonths90d: number;
  };
  recommendations: string[];
  aiRecommendations: string[];
  riskAlerts: BankRelationshipRiskAlert[];
  updatedAt: string;
};

export type BankRelationshipHistory = {
  reference_date: string;
  score: number;
  risk_level: string;
  created_at: string;
};

type RelationshipResponse = {
  ok: boolean;
  summary?: BankRelationshipSummary;
  history?: BankRelationshipHistory[];
  warnings?: string[];
  message?: string;
};

export const useBankRelationship = () => {
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [summary, setSummary] = useState<BankRelationshipSummary | null>(null);
  const [history, setHistory] = useState<BankRelationshipHistory[]>([]);

  const getToken = useCallback(async () => {
    const sessionRes = await supabase.auth.getSession();
    return sessionRes.data.session?.access_token || null;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const token = await getToken();
    if (!token) {
      setError("Sessao nao encontrada. Faca login novamente.");
      setLoading(false);
      return;
    }

    const response = await fetch("/api/banking/relationship/summary", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });

    const json = (await response.json().catch(() => ({}))) as RelationshipResponse;
    if (!response.ok || !json.ok || !json.summary) {
      setError(json.message || "Falha ao carregar score bancario.");
      setWarnings([]);
      setSummary(null);
      setHistory([]);
      setLoading(false);
      return;
    }

    setSummary(json.summary);
    setHistory(json.history || []);
    setWarnings(json.warnings || []);
    setLoading(false);
  }, [getToken]);

  const runAssessment = useCallback(async () => {
    setRunning(true);
    setError(null);

    const token = await getToken();
    if (!token) {
      setError("Sessao nao encontrada. Faca login novamente.");
      setRunning(false);
      return false;
    }

    const response = await fetch("/api/banking/relationship/run", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const json = (await response.json().catch(() => ({}))) as RelationshipResponse;
    if (!response.ok || !json.ok || !json.summary) {
      setError(json.message || "Falha ao recalcular score bancario.");
      setRunning(false);
      return false;
    }

    setSummary(json.summary);
    setHistory(json.history || []);
    setWarnings(json.warnings || []);
    setRunning(false);
    return true;
  }, [getToken]);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    loading,
    running,
    error,
    warnings,
    summary,
    history,
    refresh: load,
    runAssessment,
  };
};
