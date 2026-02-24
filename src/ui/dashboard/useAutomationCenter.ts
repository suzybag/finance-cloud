"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export type InsightItem = {
  id: string;
  period: string;
  insight_type: string;
  title: string;
  body: string;
  severity: "info" | "warning" | "critical" | "success";
  source: "automation" | "ai" | "manual";
  metadata: Record<string, unknown>;
  created_at: string;
};

export type AutomationSettings = {
  enabled: boolean;
  push_enabled: boolean;
  email_enabled: boolean;
  internal_enabled: boolean;
  card_due_days: number;
  dollar_upper: number | null;
  dollar_lower: number | null;
  investment_drop_pct: number;
  spending_spike_pct: number;
  monthly_report_enabled: boolean;
  market_refresh_enabled: boolean;
  config: Record<string, unknown>;
};

type FeedbackState = {
  kind: "success" | "error" | "info";
  message: string;
} | null;

const DEFAULT_SETTINGS: AutomationSettings = {
  enabled: true,
  push_enabled: true,
  email_enabled: true,
  internal_enabled: true,
  card_due_days: 3,
  dollar_upper: null,
  dollar_lower: null,
  investment_drop_pct: 2,
  spending_spike_pct: 20,
  monthly_report_enabled: true,
  market_refresh_enabled: true,
  config: {},
};
const SW_PATH = "/sw.js?v=2026-02-24-2";

const toNullableNumber = (value: string) => {
  if (!value.trim()) return null;
  const normalized =
    value.includes(",") && value.includes(".")
      ? value.replace(/\./g, "").replace(",", ".")
      : value.includes(",")
        ? value.replace(",", ".")
        : value;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const urlBase64ToUint8Array = (base64String: string) => {
  try {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = `${base64String}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let index = 0; index < rawData.length; index += 1) {
      outputArray[index] = rawData.charCodeAt(index);
    }
    return outputArray;
  } catch {
    return null;
  }
};

const supportsPush = () =>
  typeof window !== "undefined"
  && "Notification" in window
  && "serviceWorker" in navigator
  && "PushManager" in window;

const normalizeSettings = (input?: Partial<AutomationSettings> | null): AutomationSettings => ({
  enabled: typeof input?.enabled === "boolean" ? input.enabled : DEFAULT_SETTINGS.enabled,
  push_enabled: typeof input?.push_enabled === "boolean" ? input.push_enabled : DEFAULT_SETTINGS.push_enabled,
  email_enabled: typeof input?.email_enabled === "boolean" ? input.email_enabled : DEFAULT_SETTINGS.email_enabled,
  internal_enabled: typeof input?.internal_enabled === "boolean" ? input.internal_enabled : DEFAULT_SETTINGS.internal_enabled,
  card_due_days: Number.isFinite(Number(input?.card_due_days))
    ? Math.max(1, Math.min(10, Math.round(Number(input?.card_due_days))))
    : DEFAULT_SETTINGS.card_due_days,
  dollar_upper: Number.isFinite(Number(input?.dollar_upper)) ? Number(input?.dollar_upper) : null,
  dollar_lower: Number.isFinite(Number(input?.dollar_lower)) ? Number(input?.dollar_lower) : null,
  investment_drop_pct: Number.isFinite(Number(input?.investment_drop_pct))
    ? Math.max(0.5, Number(input?.investment_drop_pct))
    : DEFAULT_SETTINGS.investment_drop_pct,
  spending_spike_pct: Number.isFinite(Number(input?.spending_spike_pct))
    ? Math.max(5, Number(input?.spending_spike_pct))
    : DEFAULT_SETTINGS.spending_spike_pct,
  monthly_report_enabled:
    typeof input?.monthly_report_enabled === "boolean"
      ? input.monthly_report_enabled
      : DEFAULT_SETTINGS.monthly_report_enabled,
  market_refresh_enabled:
    typeof input?.market_refresh_enabled === "boolean"
      ? input.market_refresh_enabled
      : DEFAULT_SETTINGS.market_refresh_enabled,
  config:
    input?.config && typeof input.config === "object"
      ? input.config
      : {},
});

export const useAutomationCenter = () => {
  const [settings, setSettings] = useState<AutomationSettings>(DEFAULT_SETTINGS);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [runningAutomation, setRunningAutomation] = useState(false);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [lastStatus, setLastStatus] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  const [insights, setInsights] = useState<InsightItem[]>([]);
  const [insightPeriod, setInsightPeriod] = useState<string | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(true);

  const [pushSupported, setPushSupported] = useState(false);
  const [pushConfigured, setPushConfigured] = useState(false);
  const [pushPermission, setPushPermission] = useState<NotificationPermission>("default");
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

  const [feedback, setFeedback] = useState<FeedbackState>(null);

  const getToken = useCallback(async () => {
    const sessionRes = await supabase.auth.getSession();
    return sessionRes.data.session?.access_token || null;
  }, []);

  const refreshPushState = useCallback(async () => {
    if (!supportsPush()) {
      setPushSupported(false);
      setPushConfigured(false);
      setPushSubscribed(false);
      return;
    }

    try {
      setPushSupported(true);
      setPushPermission(Notification.permission);

      const vapidResponse = await fetch("/api/push/vapid", { method: "GET", cache: "no-store" });
      const vapidJson = await vapidResponse.json().catch(() => ({} as { configured?: boolean }));
      setPushConfigured(Boolean(vapidJson?.configured));

      const registration = await navigator.serviceWorker.register(SW_PATH, { updateViaCache: "none" });
      const sub = await registration.pushManager.getSubscription();
      setPushSubscribed(Boolean(sub));
    } catch {
      setPushConfigured(false);
      setPushSubscribed(false);
    }
  }, []);

  const loadSettings = useCallback(async () => {
    setSettingsLoading(true);
    const token = await getToken();
    if (!token) {
      setSettingsLoading(false);
      setFeedback({ kind: "error", message: "Sessao nao encontrada. Faca login novamente." });
      return;
    }

    const response = await fetch("/api/automations/settings", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });

    const json = await response.json().catch(() => ({} as {
      ok?: boolean;
      message?: string;
      settings?: AutomationSettings;
      pushConfigured?: boolean;
      lastRunAt?: string | null;
      lastStatus?: string | null;
      lastError?: string | null;
    }));

    if (!response.ok || !json.ok || !json.settings) {
      setFeedback({ kind: "error", message: json.message || "Falha ao carregar automacoes." });
      setSettingsLoading(false);
      return;
    }

    setSettings(normalizeSettings(json.settings));
    setPushConfigured(Boolean(json.pushConfigured));
    setLastRunAt(json.lastRunAt || null);
    setLastStatus(json.lastStatus || null);
    setLastError(json.lastError || null);
    setSettingsLoading(false);
  }, [getToken]);

  const loadInsights = useCallback(async () => {
    setInsightsLoading(true);
    const token = await getToken();
    if (!token) {
      setInsightsLoading(false);
      return;
    }

    const response = await fetch("/api/insights/latest?limit=6", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });

    const json = await response.json().catch(() => ({} as {
      ok?: boolean;
      insights?: InsightItem[];
      period?: string | null;
      warning?: string;
      message?: string;
    }));

    if (!response.ok || !json.ok) {
      if (json?.message) {
        setFeedback({ kind: "error", message: json.message });
      }
      setInsights([]);
      setInsightPeriod(null);
      setInsightsLoading(false);
      return;
    }

    if (json.warning) {
      setFeedback({ kind: "info", message: json.warning });
    }

    setInsights(Array.isArray(json.insights) ? json.insights : []);
    setInsightPeriod(json.period || null);
    setInsightsLoading(false);
  }, [getToken]);

  const enablePush = useCallback(async () => {
    if (!supportsPush()) {
      setFeedback({ kind: "error", message: "Push nao suportado neste navegador." });
      return;
    }

    setPushBusy(true);
    setFeedback(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Sessao nao encontrada.");

      const permission = await Notification.requestPermission();
      setPushPermission(permission);
      if (permission !== "granted") {
        throw new Error("Permissao de notificacao negada.");
      }

      const vapidResponse = await fetch("/api/push/vapid", { method: "GET", cache: "no-store" });
      const vapidJson = await vapidResponse.json().catch(() => ({} as { configured?: boolean; publicKey?: string }));
      if (!vapidJson.configured || !vapidJson.publicKey) {
        throw new Error("VAPID nao configurado no servidor.");
      }
      const applicationServerKey = urlBase64ToUint8Array(vapidJson.publicKey);
      if (!applicationServerKey) {
        throw new Error("Chave VAPID invalida.");
      }

      const registration = await navigator.serviceWorker.register(SW_PATH, { updateViaCache: "none" });
      const existing = await registration.pushManager.getSubscription();
      const subscription = existing || await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });

      const saveResponse = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          subscription: subscription.toJSON(),
        }),
      });

      const saveJson = await saveResponse.json().catch(() => ({} as { message?: string }));
      if (!saveResponse.ok) {
        throw new Error(saveJson.message || "Falha ao salvar subscription.");
      }

      setPushSubscribed(true);
      setFeedback({ kind: "success", message: "Push ativado com sucesso." });
    } catch (error) {
      setFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "Falha ao ativar push.",
      });
    } finally {
      setPushBusy(false);
    }
  }, [getToken]);

  const disablePush = useCallback(async () => {
    if (!supportsPush()) return;
    setPushBusy(true);
    setFeedback(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Sessao nao encontrada.");

      const registration = await navigator.serviceWorker.register(SW_PATH, { updateViaCache: "none" });
      const subscription = await registration.pushManager.getSubscription();
      const endpoint = subscription?.endpoint || "";

      if (subscription) {
        await subscription.unsubscribe();
      }

      const response = await fetch("/api/push/subscribe", {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ endpoint }),
      });

      const json = await response.json().catch(() => ({} as { message?: string }));
      if (!response.ok) {
        throw new Error(json.message || "Falha ao desativar push.");
      }

      setPushSubscribed(false);
      setFeedback({ kind: "success", message: "Push desativado." });
    } catch (error) {
      setFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "Falha ao desativar push.",
      });
    } finally {
      setPushBusy(false);
    }
  }, [getToken]);

  const sendPushTest = useCallback(async () => {
    setPushBusy(true);
    setFeedback(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Sessao nao encontrada.");

      const response = await fetch("/api/push/test", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: "Finance Cloud",
          body: "Notificacao push enviada com sucesso.",
          url: "/dashboard",
          tag: "finance-cloud-test",
        }),
      });

      const json = await response.json().catch(() => ({} as { message?: string; sent?: number }));
      if (!response.ok) throw new Error(json.message || "Falha ao enviar push de teste.");
      if (!json.sent) throw new Error("Nenhuma subscription ativa para enviar push.");

      setFeedback({ kind: "success", message: "Push de teste enviado." });
    } catch (error) {
      setFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "Falha no push de teste.",
      });
    } finally {
      setPushBusy(false);
    }
  }, [getToken]);

  const saveSettings = useCallback(async () => {
    setSettingsSaving(true);
    setFeedback(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Sessao nao encontrada.");

      const response = await fetch("/api/automations/settings", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(settings),
      });

      const json = await response.json().catch(() => ({} as {
        ok?: boolean;
        message?: string;
        settings?: AutomationSettings;
        pushConfigured?: boolean;
        lastRunAt?: string | null;
        lastStatus?: string | null;
        lastError?: string | null;
      }));
      if (!response.ok || !json.ok || !json.settings) {
        throw new Error(json.message || "Falha ao salvar automacoes.");
      }

      setSettings(normalizeSettings(json.settings));
      setPushConfigured(Boolean(json.pushConfigured));
      setLastRunAt(json.lastRunAt || null);
      setLastStatus(json.lastStatus || null);
      setLastError(json.lastError || null);
      setFeedback({ kind: "success", message: "Automacoes salvas." });
    } catch (error) {
      setFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "Falha ao salvar.",
      });
    } finally {
      setSettingsSaving(false);
    }
  }, [getToken, settings]);

  const runNow = useCallback(async () => {
    setRunningAutomation(true);
    setFeedback(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Sessao nao encontrada.");

      const response = await fetch("/api/automations/run", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const json = await response.json().catch(() => ({} as {
        ok?: boolean;
        message?: string;
        skipped?: boolean;
        result?: { events?: Array<unknown>; insightsCreated?: number };
      }));

      if (!response.ok || !json.ok) {
        throw new Error(json.message || "Falha ao executar automacoes.");
      }

      await Promise.all([loadInsights(), loadSettings()]);
      const eventsCount = Array.isArray(json.result?.events) ? json.result?.events.length : 0;
      const insightsCount = Number(json.result?.insightsCreated || 0);
      const suffix = json.skipped
        ? "Automacao desativada para este usuario."
        : `Execucao concluida (${eventsCount} alertas, ${insightsCount} insights).`;
      setFeedback({ kind: "success", message: suffix });
    } catch (error) {
      setFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "Falha ao executar automacoes.",
      });
    } finally {
      setRunningAutomation(false);
    }
  }, [getToken, loadInsights, loadSettings]);

  useEffect(() => {
    void Promise.all([loadSettings(), loadInsights(), refreshPushState()]);
  }, [loadSettings, loadInsights, refreshPushState]);

  const setBooleanSetting = useCallback((key: keyof AutomationSettings, value: boolean) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

  const setNumberSetting = useCallback((key: keyof AutomationSettings, value: number | null) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

  const dollarUpperInput = useMemo(
    () => (settings.dollar_upper === null ? "" : String(settings.dollar_upper).replace(".", ",")),
    [settings.dollar_upper],
  );
  const dollarLowerInput = useMemo(
    () => (settings.dollar_lower === null ? "" : String(settings.dollar_lower).replace(".", ",")),
    [settings.dollar_lower],
  );

  return {
    settings,
    settingsLoading,
    settingsSaving,
    runningAutomation,
    lastRunAt,
    lastStatus,
    lastError,
    insights,
    insightPeriod,
    insightsLoading,
    pushSupported,
    pushConfigured,
    pushPermission,
    pushSubscribed,
    pushBusy,
    feedback,
    setFeedback,
    setBooleanSetting,
    setNumberSetting,
    setCardDueDays: (value: number) => setNumberSetting("card_due_days", Math.max(1, Math.min(10, Math.round(value)))),
    setInvestmentDropPct: (value: number) => setNumberSetting("investment_drop_pct", Math.max(0.5, value)),
    setSpendingSpikePct: (value: number) => setNumberSetting("spending_spike_pct", Math.max(5, value)),
    setDollarUpperFromInput: (value: string) => setNumberSetting("dollar_upper", toNullableNumber(value)),
    setDollarLowerFromInput: (value: string) => setNumberSetting("dollar_lower", toNullableNumber(value)),
    dollarUpperInput,
    dollarLowerInput,
    enablePush,
    disablePush,
    sendPushTest,
    saveSettings,
    runNow,
    refreshInsights: loadInsights,
    refreshAll: async () => {
      await Promise.all([loadSettings(), loadInsights(), refreshPushState()]);
    },
  };
};
