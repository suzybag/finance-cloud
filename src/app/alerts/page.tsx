"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bell,
  BellRing,
  BrainCircuit,
  Loader2,
  Pencil,
  Play,
  Plus,
  RefreshCcw,
  Save,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  Trash2,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useConfirmDialog } from "@/context/ConfirmDialogContext";
import { brl, toNumber } from "@/lib/money";
import { supabase } from "@/lib/supabaseClient";
import { useAutomationCenter } from "@/ui/dashboard/useAutomationCenter";
import { useBankRelationship } from "@/ui/dashboard/useBankRelationship";

type RuleType = "cartao" | "investimento" | "dolar";
type RuleStatus =
  | "vence_3_dias"
  | "queda_percentual"
  | "queda_valor"
  | "negativo_dia"
  | "acima"
  | "abaixo";

type EmailAlertRule = {
  id: string;
  user_id: string;
  user_email: string;
  tipo_alerta: RuleType;
  ativo: string | null;
  valor_alvo: number | null;
  percentual: number | null;
  status: RuleStatus | null;
  last_triggered_at: string | null;
  ativo_boolean: boolean;
  created_at: string;
  updated_at: string | null;
};

type RuleFormState = {
  tipoAlerta: RuleType;
  ativo: string;
  status: RuleStatus;
  valorAlvoMasked: string;
  percentual: string;
  ativoBoolean: boolean;
};

const INPUT_CLASS =
  "w-full rounded-xl border border-violet-300/20 bg-[#181126] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition focus:border-violet-400/70 focus:ring-2 focus:ring-violet-500/20";

const CARD_CLASS =
  "rounded-2xl border border-violet-300/20 bg-[linear-gradient(160deg,rgba(31,22,54,0.72),rgba(12,9,26,0.82))] p-4 backdrop-blur-xl";

const statusByType: Record<RuleType, RuleStatus[]> = {
  cartao: ["vence_3_dias"],
  investimento: ["queda_percentual", "queda_valor", "negativo_dia"],
  dolar: ["acima", "abaixo"],
};

const statusLabel: Record<RuleStatus, string> = {
  vence_3_dias: "Vence em 3 dias (fatura aberta)",
  queda_percentual: "Queda diaria maior que X%",
  queda_valor: "Prejuizo diario maior que X reais",
  negativo_dia: "Desempenho diario negativo",
  acima: "Subir acima de valor",
  abaixo: "Cair abaixo de valor",
};

const typeLabel: Record<RuleType, string> = {
  cartao: "Cartao",
  investimento: "Investimento",
  dolar: "Dolar",
};

const moneyMask = (value: string) => {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  const amount = Number(digits) / 100;
  return amount.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const toMaskFromNumber = (value: number | null | undefined) =>
  (Number.isFinite(Number(value)) ? Number(value) : 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const formatDateTime = (value?: string | null) => {
  if (!value) return "Nunca disparado";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Nunca disparado";
  return parsed.toLocaleString("pt-BR");
};

const formatAutomationDateTime = (value?: string | null) => {
  if (!value) return "Nunca";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Nunca";
  return parsed.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const severityClass = (severity: "info" | "warning" | "critical" | "success") => {
  if (severity === "critical") return "border-rose-400/35 bg-rose-500/15 text-rose-100";
  if (severity === "warning") return "border-amber-400/35 bg-amber-500/15 text-amber-100";
  if (severity === "success") return "border-emerald-400/35 bg-emerald-500/15 text-emerald-100";
  return "border-cyan-400/35 bg-cyan-500/15 text-cyan-100";
};

const scoreBadgeClass = (level: "excelente" | "bom" | "atencao" | "alto_risco") => {
  if (level === "excelente") return "border-emerald-400/35 bg-emerald-500/15 text-emerald-200";
  if (level === "bom") return "border-cyan-400/35 bg-cyan-500/15 text-cyan-200";
  if (level === "atencao") return "border-amber-400/35 bg-amber-500/15 text-amber-200";
  return "border-rose-400/35 bg-rose-500/15 text-rose-200";
};

const defaultStatusForType = (type: RuleType): RuleStatus => {
  if (type === "cartao") return "vence_3_dias";
  if (type === "investimento") return "queda_percentual";
  return "acima";
};

const emptyForm = (): RuleFormState => ({
  tipoAlerta: "cartao",
  ativo: "",
  status: "vence_3_dias",
  valorAlvoMasked: "",
  percentual: "2",
  ativoBoolean: true,
});

const shouldShowPercentual = (status: RuleStatus) => status === "queda_percentual";
const shouldShowValorAlvo = (status: RuleStatus) =>
  status === "queda_valor" || status === "acima" || status === "abaixo";

const isMissingTableError = (message?: string | null) =>
  /relation .*email_alert_rules/i.test(message || "");

const normalizeRule = (row: Partial<EmailAlertRule>): EmailAlertRule => ({
  id: String(row.id || ""),
  user_id: String(row.user_id || ""),
  user_email: String(row.user_email || ""),
  tipo_alerta: (row.tipo_alerta as RuleType) || "cartao",
  ativo: row.ativo || null,
  valor_alvo: Number.isFinite(Number(row.valor_alvo)) ? Number(row.valor_alvo) : null,
  percentual: Number.isFinite(Number(row.percentual)) ? Number(row.percentual) : null,
  status: (row.status as RuleStatus | null) || null,
  last_triggered_at: row.last_triggered_at || null,
  ativo_boolean: Boolean(row.ativo_boolean),
  created_at: row.created_at || new Date().toISOString(),
  updated_at: row.updated_at || null,
});

const formFromRule = (rule: EmailAlertRule): RuleFormState => ({
  tipoAlerta: rule.tipo_alerta,
  ativo: rule.ativo || "",
  status: rule.status || defaultStatusForType(rule.tipo_alerta),
  valorAlvoMasked: toMaskFromNumber(rule.valor_alvo),
  percentual: String(rule.percentual ?? 2),
  ativoBoolean: rule.ativo_boolean,
});

export default function AlertsPage() {
  const confirmDialog = useConfirmDialog();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [ruleFeedback, setRuleFeedback] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string>("");
  const [rules, setRules] = useState<EmailAlertRule[]>([]);
  const [form, setForm] = useState<RuleFormState>(emptyForm);
  const [editingRule, setEditingRule] = useState<EmailAlertRule | null>(null);
  const [editForm, setEditForm] = useState<RuleFormState>(emptyForm);
  const {
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
    feedback: automationFeedback,
    setFeedback: setAutomationFeedback,
    setBooleanSetting,
    setCardDueDays,
    setInvestmentDropPct,
    setSpendingSpikePct,
    setDollarUpperFromInput,
    setDollarLowerFromInput,
    dollarUpperInput,
    dollarLowerInput,
    enablePush,
    disablePush,
    sendPushTest,
    saveSettings,
    runNow,
    refreshInsights,
    refreshAll: refreshAutomationCenter,
  } = useAutomationCenter();
  const {
    loading: relationshipLoading,
    running: relationshipRunning,
    error: relationshipError,
    warnings: relationshipWarnings,
    summary: relationshipSummary,
    history: relationshipHistory,
    refresh: refreshRelationship,
    runAssessment,
  } = useBankRelationship();

  const loadRules = useCallback(async () => {
    setLoading(true);
    setRuleFeedback(null);

    const { data: userData, error: userError } = await supabase.auth.getUser();
    const user = userData.user;
    if (userError || !user) {
      setRuleFeedback("Sessao nao encontrada. Faca login novamente.");
      setLoading(false);
      return;
    }

    setUserId(user.id);
    setUserEmail(user.email || "");

    const { data, error } = await supabase
      .from("email_alert_rules")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      setLoading(false);
      setRuleFeedback(
        isMissingTableError(error.message)
          ? "Tabela email_alert_rules nao encontrada. Rode o supabase.sql atualizado."
          : `Falha ao carregar alertas: ${error.message}`,
      );
      return;
    }

    const normalized = ((data || []) as Partial<EmailAlertRule>[])
      .map((row) => normalizeRule(row))
      .filter((row) => row.id && row.user_id);
    setRules(normalized);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadRules();
  }, [loadRules]);

  const sortedRules = useMemo(
    () =>
      [...rules].sort((a, b) => {
        if (a.ativo_boolean !== b.ativo_boolean) return a.ativo_boolean ? -1 : 1;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }),
    [rules],
  );

  const createPayloadFromForm = (state: RuleFormState) => {
    const tipo = state.tipoAlerta;
    const status = state.status;
    const ativo =
      tipo === "dolar"
        ? "USD/BRL"
        : state.ativo.trim();
    const valorAlvo = shouldShowValorAlvo(status)
      ? Math.max(0, toNumber(state.valorAlvoMasked))
      : null;
    const percentual = shouldShowPercentual(status)
      ? Math.max(0, toNumber(state.percentual))
      : null;

    return {
      tipo_alerta: tipo,
      status,
      ativo,
      valor_alvo: valorAlvo && valorAlvo > 0 ? valorAlvo : null,
      percentual: percentual && percentual > 0 ? percentual : null,
      ativo_boolean: state.ativoBoolean,
    };
  };

  const validatePayload = (payload: ReturnType<typeof createPayloadFromForm>) => {
    if (payload.tipo_alerta !== "dolar" && !payload.ativo) {
      return "Informe o ativo/cartao que sera monitorado.";
    }
    if (payload.status === "queda_percentual" && (!payload.percentual || payload.percentual <= 0)) {
      return "Informe o percentual de queda (ex: 2%).";
    }
    if (
      (payload.status === "queda_valor" || payload.status === "acima" || payload.status === "abaixo")
      && (!payload.valor_alvo || payload.valor_alvo <= 0)
    ) {
      return "Informe o valor alvo para essa regra.";
    }
    return null;
  };

  const handleCreateRule = async () => {
    if (!userId || !userEmail) {
      setRuleFeedback("Email do usuario nao encontrado.");
      return;
    }

    const payload = createPayloadFromForm(form);
    const validationError = validatePayload(payload);
    if (validationError) {
      setRuleFeedback(validationError);
      return;
    }

    setSaving(true);
    setRuleFeedback(null);
    const { error } = await supabase.from("email_alert_rules").insert({
      user_id: userId,
      user_email: userEmail,
      ...payload,
    });
    setSaving(false);

    if (error) {
      setRuleFeedback(`Nao foi possivel criar alerta: ${error.message}`);
      return;
    }

    setForm(emptyForm());
    setRuleFeedback("Alerta criado com sucesso.");
    await loadRules();
  };

  const openEdit = (rule: EmailAlertRule) => {
    setEditingRule(rule);
    setEditForm(formFromRule(rule));
  };

  const closeEdit = () => {
    setEditingRule(null);
    setEditForm(emptyForm());
  };

  const handleSaveEdit = async () => {
    if (!editingRule || !userId) return;

    const payload = createPayloadFromForm(editForm);
    const validationError = validatePayload(payload);
    if (validationError) {
      setRuleFeedback(validationError);
      return;
    }

    setSaving(true);
    setRuleFeedback(null);
    const { error } = await supabase
      .from("email_alert_rules")
      .update(payload)
      .eq("id", editingRule.id)
      .eq("user_id", userId);
    setSaving(false);

    if (error) {
      setRuleFeedback(`Nao foi possivel editar alerta: ${error.message}`);
      return;
    }

    closeEdit();
    setRuleFeedback("Alerta atualizado.");
    await loadRules();
  };

  const handleToggleActive = async (rule: EmailAlertRule) => {
    if (!userId) return;
    setSaving(true);
    setRuleFeedback(null);
    const { error } = await supabase
      .from("email_alert_rules")
      .update({ ativo_boolean: !rule.ativo_boolean })
      .eq("id", rule.id)
      .eq("user_id", userId);
    setSaving(false);

    if (error) {
      setRuleFeedback(`Nao foi possivel alterar status: ${error.message}`);
      return;
    }

    setRuleFeedback(rule.ativo_boolean ? "Alerta desativado." : "Alerta ativado.");
    await loadRules();
  };

  const handleDelete = async (rule: EmailAlertRule) => {
    if (!userId) return;
    const confirmed = await confirmDialog({
      title: "Excluir alerta?",
      description: `O alerta "${typeLabel[rule.tipo_alerta]} - ${rule.ativo || "USD/BRL"}" sera removido permanentemente.`,
      confirmLabel: "Excluir",
      cancelLabel: "Cancelar",
      tone: "danger",
    });
    if (!confirmed) return;

    setSaving(true);
    setRuleFeedback(null);
    const { error } = await supabase
      .from("email_alert_rules")
      .delete()
      .eq("id", rule.id)
      .eq("user_id", userId);
    setSaving(false);

    if (error) {
      setRuleFeedback(`Nao foi possivel excluir alerta: ${error.message}`);
      return;
    }

    setRuleFeedback("Alerta excluido.");
    await loadRules();
  };

  const renderForm = (
    state: RuleFormState,
    onChange: (next: RuleFormState) => void,
  ) => {
    const statuses = statusByType[state.tipoAlerta];
    const safeStatus = statuses.includes(state.status) ? state.status : statuses[0];
    const needsPercentual = shouldShowPercentual(safeStatus);
    const needsValorAlvo = shouldShowValorAlvo(safeStatus);

    return (
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-violet-100/75">Tipo de alerta</span>
          <select
            className={INPUT_CLASS}
            value={state.tipoAlerta}
            onChange={(event) => {
              const nextType = event.target.value as RuleType;
              onChange({
                ...state,
                tipoAlerta: nextType,
                status: defaultStatusForType(nextType),
              });
            }}
          >
            <option value="cartao">Cartao</option>
            <option value="investimento">Investimento</option>
            <option value="dolar">Dolar</option>
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-violet-100/75">
            {state.tipoAlerta === "cartao" ? "Nome do cartao" : state.tipoAlerta === "investimento" ? "Ativo" : "Ativo"}
          </span>
          <input
            className={INPUT_CLASS}
            placeholder={
              state.tipoAlerta === "cartao"
                ? "Ex: Nubank"
                : state.tipoAlerta === "investimento"
                  ? "Ex: BTC ou Bitcoin"
                  : "USD/BRL"
            }
            value={state.tipoAlerta === "dolar" ? "USD/BRL" : state.ativo}
            onChange={(event) => onChange({ ...state, ativo: event.target.value })}
            disabled={state.tipoAlerta === "dolar"}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-violet-100/75">Regra</span>
          <select
            className={INPUT_CLASS}
            value={safeStatus}
            onChange={(event) => onChange({ ...state, status: event.target.value as RuleStatus })}
          >
            {statuses.map((status) => (
              <option key={status} value={status}>
                {statusLabel[status]}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-violet-100/75">
            Valor alvo (R$) {needsValorAlvo ? "" : "(opcional)"}
          </span>
          <input
            className={INPUT_CLASS}
            placeholder="0,00"
            inputMode="decimal"
            value={state.valorAlvoMasked}
            onChange={(event) =>
              onChange({
                ...state,
                valorAlvoMasked: moneyMask(event.target.value),
              })
            }
            disabled={!needsValorAlvo}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-violet-100/75">
            Percentual (%) {needsPercentual ? "" : "(opcional)"}
          </span>
          <input
            className={INPUT_CLASS}
            type="number"
            min={0}
            step={0.1}
            value={state.percentual}
            onChange={(event) => onChange({ ...state, percentual: event.target.value })}
            disabled={!needsPercentual}
          />
        </label>
      </div>
    );
  };

  const actions = (
    <button
      type="button"
      className="inline-flex items-center gap-2 rounded-xl border border-violet-300/30 bg-violet-500/20 px-3 py-2 text-xs font-semibold text-violet-100 transition hover:bg-violet-500/30"
      onClick={() => {
        void loadRules();
        void refreshAutomationCenter();
        void refreshRelationship();
      }}
    >
      <RefreshCcw className="h-3.5 w-3.5" />
      Atualizar
    </button>
  );

  return (
    <AppShell
      title="Alertas Inteligentes"
      subtitle="Regras automáticas de email para cartao, investimento e dolar"
      actions={actions}
      contentClassName="ultra-shell-bg"
    >
      {loading ? (
        <div className={`${CARD_CLASS} text-slate-200`}>Carregando alertas...</div>
      ) : (
        <div className="space-y-6">
          {ruleFeedback ? (
            <div className="rounded-xl border border-violet-300/30 bg-violet-950/35 px-4 py-3 text-sm text-violet-100">
              {ruleFeedback}
            </div>
          ) : null}

          {automationFeedback ? (
            <div
              className={`rounded-xl px-4 py-3 text-sm ${
                automationFeedback.kind === "error"
                  ? "border border-rose-400/40 bg-rose-500/15 text-rose-100"
                  : automationFeedback.kind === "success"
                    ? "border border-emerald-400/40 bg-emerald-500/15 text-emerald-100"
                    : "border border-cyan-400/40 bg-cyan-500/15 text-cyan-100"
              }`}
            >
              {automationFeedback.message}
            </div>
          ) : null}

          {relationshipWarnings.length ? (
            <div className="rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              {relationshipWarnings.join(" | ")}
            </div>
          ) : null}

          <section className={`${CARD_CLASS} rounded-3xl`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="inline-flex items-center gap-2 text-lg font-bold text-white">
                  <ShieldCheck className="h-5 w-5 text-cyan-300" />
                  Relacionamento Bancario
                </h2>
                <p className="text-xs text-slate-400">
                  Score interno para melhorar credito, limite e saude financeira.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-white/15 bg-black/30 px-3 py-1.5 text-xs font-semibold text-slate-100 hover:bg-black/45"
                  onClick={() => void refreshRelationship()}
                >
                  Atualizar score
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-violet-400/30 bg-violet-500/15 px-3 py-1.5 text-xs font-semibold text-violet-100 hover:bg-violet-500/25 disabled:opacity-60"
                  onClick={() => void runAssessment()}
                  disabled={relationshipRunning || relationshipLoading}
                >
                  {relationshipRunning ? "Recalculando..." : "Executar analise"}
                </button>
              </div>
            </div>

            {relationshipLoading ? (
              <div className="mt-4 rounded-xl border border-white/10 bg-black/25 px-3 py-3 text-sm text-slate-300">
                Carregando score bancario...
              </div>
            ) : relationshipError ? (
              <div className="mt-4 rounded-xl border border-rose-400/40 bg-rose-500/10 px-3 py-3 text-sm text-rose-100">
                {relationshipError}
              </div>
            ) : relationshipSummary ? (
              <>
                <div className="mt-4 flex flex-wrap items-end gap-3">
                  <div className="flex items-end gap-2">
                    <p className="text-5xl font-black text-white">{relationshipSummary.score}</p>
                    <span className="pb-1 text-sm text-slate-400">/100</span>
                  </div>
                  <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${scoreBadgeClass(relationshipSummary.riskLevel)}`}>
                    {relationshipSummary.riskLabel}
                  </span>
                  <span className="text-xs text-slate-400">
                    {relationshipSummary.deltaScore === null
                      ? "Sem base anterior"
                      : `Variacao: ${relationshipSummary.deltaScore > 0 ? "+" : ""}${relationshipSummary.deltaScore} ponto(s)`}
                  </span>
                </div>

                <div className="mt-4 grid gap-2 md:grid-cols-4">
                  <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-xs text-slate-300">
                    <p className="text-slate-400">Uso limite</p>
                    <p className="text-sm font-semibold text-slate-100">
                      {relationshipSummary.indicators.cardLimitUtilizationPct.toFixed(1).replace(".", ",")}%
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-xs text-slate-300">
                    <p className="text-slate-400">Pontualidade</p>
                    <p className="text-sm font-semibold text-slate-100">
                      {relationshipSummary.indicators.onTimePaymentRate.toFixed(1).replace(".", ",")}%
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-xs text-slate-300">
                    <p className="text-slate-400">Investimentos ativos</p>
                    <p className="text-sm font-semibold text-slate-100">
                      {relationshipSummary.indicators.activeInvestments}
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-xs text-slate-300">
                    <p className="text-slate-400">Historico 90d</p>
                    <p className="text-sm font-semibold text-slate-100">
                      {relationshipSummary.indicators.activityMonths90d} mes(es) ativo(s)
                    </p>
                  </div>
                </div>

                {relationshipSummary.riskAlerts.length ? (
                  <div className="mt-4 space-y-2">
                    {relationshipSummary.riskAlerts.map((risk) => (
                      <div
                        key={`${risk.code}-${risk.title}`}
                        className={`rounded-xl border px-3 py-2 ${
                          risk.severity === "critical"
                            ? "border-rose-400/40 bg-rose-500/10 text-rose-100"
                            : "border-amber-400/40 bg-amber-500/10 text-amber-100"
                        }`}
                      >
                        <p className="inline-flex items-center gap-2 text-sm font-semibold">
                          <TriangleAlert className="h-4 w-4" />
                          {risk.title}
                        </p>
                        <p className="mt-1 text-xs">{risk.body}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-4 rounded-xl border border-emerald-400/35 bg-emerald-500/10 px-3 py-3 text-sm text-emerald-100">
                    Nenhum risco alto detectado no relacionamento bancario.
                  </div>
                )}

                <div className="mt-4 space-y-2">
                  {relationshipSummary.recommendations.slice(0, 4).map((tip) => (
                    <div key={`rel-tip-${tip.slice(0, 24)}`} className="rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-100">
                      {tip}
                    </div>
                  ))}
                  {relationshipSummary.aiRecommendations.slice(0, 3).map((tip) => (
                    <div key={`rel-ai-${tip.slice(0, 24)}`} className="rounded-xl border border-violet-400/30 bg-violet-500/10 px-3 py-2 text-sm text-violet-100">
                      {tip}
                    </div>
                  ))}
                </div>

                <div className="mt-4 rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-xs text-slate-300">
                  <p className="mb-1 font-semibold text-slate-200">Evolucao recente do score</p>
                  <div className="flex flex-wrap gap-2">
                    {relationshipHistory.slice(0, 8).map((item) => (
                      <span key={`${item.reference_date}-${item.score}`} className="rounded-lg border border-white/10 bg-slate-900/55 px-2 py-1">
                        {item.reference_date}: {item.score}
                      </span>
                    ))}
                    {!relationshipHistory.length ? (
                      <span className="text-slate-400">Sem historico ainda.</span>
                    ) : null}
                  </div>
                </div>
              </>
            ) : null}

            {relationshipSummary && relationshipSummary.deltaScore !== null ? (
              <div className="mt-3 text-xs text-slate-400">
                <span className="inline-flex items-center gap-1">
                  {relationshipSummary.deltaScore < 0 ? (
                    <TrendingDown className="h-3.5 w-3.5 text-rose-300" />
                  ) : (
                    <TrendingUp className="h-3.5 w-3.5 text-emerald-300" />
                  )}
                  {relationshipSummary.deltaScore > 0 ? "+" : ""}
                  {relationshipSummary.deltaScore} ponto(s) no score
                </span>
              </div>
            ) : null}
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
            <article className={`${CARD_CLASS} rounded-3xl`}>
              <div className="flex items-center justify-between">
                <h2 className="inline-flex items-center gap-2 text-lg font-bold text-white">
                  <Bell className="h-5 w-5 text-violet-300" />
                  Notificacoes Push
                </h2>
                <button
                  type="button"
                  className="rounded-lg border border-white/15 bg-black/30 px-3 py-1.5 text-xs font-semibold text-slate-100 hover:bg-black/45"
                  onClick={() => void refreshAutomationCenter()}
                >
                  Atualizar
                </button>
              </div>

              <div className="mt-3 space-y-2 text-sm text-slate-300">
                <p>
                  Suporte navegador:{" "}
                  <span className={pushSupported ? "text-emerald-300" : "text-rose-300"}>
                    {pushSupported ? "Disponivel" : "Nao suportado"}
                  </span>
                </p>
                <p>
                  VAPID no servidor:{" "}
                  <span className={pushConfigured ? "text-emerald-300" : "text-amber-300"}>
                    {pushConfigured ? "Configurado" : "Pendente"}
                  </span>
                </p>
                <p>
                  Permissao:{" "}
                  <span className="text-slate-100">{pushPermission}</span>
                </p>
                <p>
                  Subscription:{" "}
                  <span className={pushSubscribed ? "text-emerald-300" : "text-slate-300"}>
                    {pushSubscribed ? "Ativa" : "Inativa"}
                  </span>
                </p>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {pushSubscribed ? (
                  <button
                    type="button"
                    className="rounded-xl border border-rose-400/30 bg-rose-500/15 px-3 py-2 text-xs font-semibold text-rose-100 transition hover:bg-rose-500/25 disabled:opacity-60"
                    onClick={() => void disablePush()}
                    disabled={pushBusy}
                  >
                    {pushBusy ? "Desativando..." : "Desativar push"}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="rounded-xl border border-violet-400/30 bg-violet-500/20 px-3 py-2 text-xs font-semibold text-violet-100 transition hover:bg-violet-500/30 disabled:opacity-60"
                    onClick={() => void enablePush()}
                    disabled={pushBusy || !pushSupported || !pushConfigured}
                  >
                    {pushBusy ? "Ativando..." : "Ativar push"}
                  </button>
                )}
                <button
                  type="button"
                  className="rounded-xl border border-cyan-400/30 bg-cyan-500/15 px-3 py-2 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-500/25 disabled:opacity-60"
                  onClick={() => void sendPushTest()}
                  disabled={pushBusy || !pushSubscribed}
                >
                  Testar push
                </button>
              </div>
            </article>

            <article className={`${CARD_CLASS} rounded-3xl`}>
              <div className="flex items-center justify-between">
                <h2 className="inline-flex items-center gap-2 text-lg font-bold text-white">
                  <BrainCircuit className="h-5 w-5 text-fuchsia-300" />
                  Insights IA de gastos
                </h2>
                <button
                  type="button"
                  className="rounded-lg border border-white/15 bg-black/30 px-3 py-1.5 text-xs font-semibold text-slate-100 hover:bg-black/45"
                  onClick={() => void refreshInsights()}
                >
                  Atualizar
                </button>
              </div>
              <p className="mt-1 text-xs text-slate-400">
                Periodo: {insightPeriod || "sem dados"}
              </p>

              <div className="mt-3 space-y-2">
                {insightsLoading ? (
                  <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-3 text-sm text-slate-300">
                    Carregando insights...
                  </div>
                ) : insights.length ? (
                  insights.slice(0, 6).map((item) => (
                    <div
                      key={item.id}
                      className={`rounded-xl border px-3 py-2 ${severityClass(item.severity)}`}
                    >
                      <p className="text-xs uppercase tracking-[0.12em] opacity-85">{item.title}</p>
                      <p className="mt-1 text-sm">{item.body}</p>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-3 text-sm text-slate-300">
                    Nenhum insight disponivel. Execute a automacao para gerar analise.
                  </div>
                )}
              </div>
            </article>
          </section>

          <section className={`${CARD_CLASS} rounded-3xl`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-white">Automacao Finance Cloud</h2>
                <p className="text-xs text-slate-400">
                  Regras para alertas automaticos por push, email e notificacao interna.
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Ultima execucao: {formatAutomationDateTime(lastRunAt)} | Status: {lastStatus || "n/a"}
                </p>
                {lastError ? (
                  <p className="mt-1 text-xs text-rose-300">Erro: {lastError}</p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-500/25 disabled:opacity-60"
                  onClick={() => {
                    setAutomationFeedback(null);
                    void runNow();
                  }}
                  disabled={runningAutomation || settingsLoading}
                >
                  <Play className="h-3.5 w-3.5" />
                  {runningAutomation ? "Executando..." : "Executar agora"}
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-xl border border-violet-400/30 bg-violet-500/20 px-3 py-2 text-xs font-semibold text-violet-100 transition hover:bg-violet-500/30 disabled:opacity-60"
                  onClick={() => {
                    setAutomationFeedback(null);
                    void saveSettings();
                  }}
                  disabled={settingsSaving || settingsLoading}
                >
                  <Save className="h-3.5 w-3.5" />
                  {settingsSaving ? "Salvando..." : "Salvar automacoes"}
                </button>
              </div>
            </div>

            {settingsLoading ? (
              <div className="mt-4 rounded-xl border border-white/10 bg-black/25 px-3 py-3 text-sm text-slate-300">
                Carregando configuracoes...
              </div>
            ) : (
              <>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <label className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-slate-100">
                    <input
                      type="checkbox"
                      checked={settings.enabled}
                      onChange={(event) => setBooleanSetting("enabled", event.target.checked)}
                    />
                    Automacao ativa
                  </label>
                  <label className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-slate-100">
                    <input
                      type="checkbox"
                      checked={settings.push_enabled}
                      onChange={(event) => setBooleanSetting("push_enabled", event.target.checked)}
                    />
                    Push ativo
                  </label>
                  <label className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-slate-100">
                    <input
                      type="checkbox"
                      checked={settings.email_enabled}
                      onChange={(event) => setBooleanSetting("email_enabled", event.target.checked)}
                    />
                    Email ativo
                  </label>
                  <label className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-slate-100">
                    <input
                      type="checkbox"
                      checked={settings.internal_enabled}
                      onChange={(event) => setBooleanSetting("internal_enabled", event.target.checked)}
                    />
                    Notificacao interna
                  </label>
                  <label className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-slate-100">
                    <input
                      type="checkbox"
                      checked={settings.monthly_report_enabled}
                      onChange={(event) => setBooleanSetting("monthly_report_enabled", event.target.checked)}
                    />
                    Relatorio mensal
                  </label>
                  <label className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-slate-100">
                    <input
                      type="checkbox"
                      checked={settings.market_refresh_enabled}
                      onChange={(event) => setBooleanSetting("market_refresh_enabled", event.target.checked)}
                    />
                    Atualizacao mercado
                  </label>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  <label className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
                    <span className="text-[11px] uppercase tracking-[0.12em] text-slate-400">
                      Cartao (dias)
                    </span>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900/60 px-2 py-1.5 text-sm text-slate-100"
                      value={settings.card_due_days}
                      onChange={(event) => setCardDueDays(Number(event.target.value))}
                    />
                  </label>

                  <label className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
                    <span className="text-[11px] uppercase tracking-[0.12em] text-slate-400">
                      Queda investimento (%)
                    </span>
                    <input
                      type="number"
                      min={0.5}
                      step={0.1}
                      className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900/60 px-2 py-1.5 text-sm text-slate-100"
                      value={settings.investment_drop_pct}
                      onChange={(event) => setInvestmentDropPct(Number(event.target.value))}
                    />
                  </label>

                  <label className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
                    <span className="text-[11px] uppercase tracking-[0.12em] text-slate-400">
                      Pico gastos (%)
                    </span>
                    <input
                      type="number"
                      min={5}
                      step={1}
                      className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900/60 px-2 py-1.5 text-sm text-slate-100"
                      value={settings.spending_spike_pct}
                      onChange={(event) => setSpendingSpikePct(Number(event.target.value))}
                    />
                  </label>

                  <label className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
                    <span className="text-[11px] uppercase tracking-[0.12em] text-slate-400">
                      Dolar maximo (R$)
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="ex: 5,60"
                      className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900/60 px-2 py-1.5 text-sm text-slate-100"
                      value={dollarUpperInput}
                      onChange={(event) => setDollarUpperFromInput(event.target.value)}
                    />
                  </label>

                  <label className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
                    <span className="text-[11px] uppercase tracking-[0.12em] text-slate-400">
                      Dolar minimo (R$)
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="ex: 4,90"
                      className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900/60 px-2 py-1.5 text-sm text-slate-100"
                      value={dollarLowerInput}
                      onChange={(event) => setDollarLowerFromInput(event.target.value)}
                    />
                  </label>
                </div>
              </>
            )}
          </section>

          <section className={`${CARD_CLASS} rounded-3xl`}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="inline-flex items-center gap-2 text-lg font-bold text-white">
                <BellRing className="h-5 w-5 text-violet-200" />
                Nova regra de alerta por email
              </h2>
              <span className="rounded-full border border-violet-300/25 bg-violet-900/35 px-3 py-1 text-[11px] font-semibold text-violet-100/90">
                Usuario: {userEmail || "sem email"}
              </span>
            </div>

            {renderForm(form, setForm)}

            <div className="mt-4 flex items-center justify-end">
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 py-2 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(124,58,237,0.4)] transition hover:brightness-110 disabled:opacity-60"
                onClick={() => void handleCreateRule()}
                disabled={saving}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Criar alerta
              </button>
            </div>
          </section>

          <section className={`${CARD_CLASS} rounded-3xl`}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">Regras cadastradas</h3>
              <span className="rounded-full border border-violet-300/25 bg-violet-900/35 px-3 py-1 text-[11px] font-semibold text-violet-100/90">
                {sortedRules.length} regra(s)
              </span>
            </div>

            {!sortedRules.length ? (
              <p className="rounded-xl border border-violet-300/20 bg-black/25 px-4 py-5 text-sm text-slate-300">
                Nenhum alerta cadastrado ainda.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full border-separate border-spacing-y-2">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-[0.12em] text-slate-400">
                      <th className="px-3 py-1">Tipo</th>
                      <th className="px-3 py-1">Ativo</th>
                      <th className="px-3 py-1">Regra</th>
                      <th className="px-3 py-1">Parametros</th>
                      <th className="px-3 py-1">Ultimo disparo</th>
                      <th className="px-3 py-1">Status</th>
                      <th className="px-3 py-1">Acoes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRules.map((rule) => (
                      <tr
                        key={rule.id}
                        className="rounded-2xl border border-violet-300/20 bg-black/25 text-sm text-slate-100"
                      >
                        <td className="rounded-l-xl px-3 py-3 font-semibold">{typeLabel[rule.tipo_alerta]}</td>
                        <td className="px-3 py-3">{rule.ativo || "USD/BRL"}</td>
                        <td className="px-3 py-3">{statusLabel[(rule.status || defaultStatusForType(rule.tipo_alerta)) as RuleStatus]}</td>
                        <td className="px-3 py-3 text-xs text-slate-300">
                          {rule.percentual ? `Percentual: ${rule.percentual}%` : "-"}{" "}
                          {rule.valor_alvo ? `| Valor: ${brl(rule.valor_alvo)}` : ""}
                        </td>
                        <td className="px-3 py-3 text-xs">{formatDateTime(rule.last_triggered_at)}</td>
                        <td className="px-3 py-3">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                              rule.ativo_boolean
                                ? "border border-emerald-300/30 bg-emerald-500/15 text-emerald-200"
                                : "border border-slate-400/30 bg-slate-500/20 text-slate-300"
                            }`}
                          >
                            {rule.ativo_boolean ? "Ativo" : "Inativo"}
                          </span>
                        </td>
                        <td className="rounded-r-xl px-3 py-3">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 rounded-lg border border-violet-300/25 bg-violet-500/15 px-2 py-1 text-xs text-violet-100 hover:bg-violet-500/25"
                              onClick={() => openEdit(rule)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Editar
                            </button>
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 rounded-lg border border-cyan-300/25 bg-cyan-500/10 px-2 py-1 text-xs text-cyan-100 hover:bg-cyan-500/20"
                              onClick={() => void handleToggleActive(rule)}
                            >
                              {rule.ativo_boolean ? "Desativar" : "Ativar"}
                            </button>
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 rounded-lg border border-rose-300/25 bg-rose-500/10 px-2 py-1 text-xs text-rose-100 hover:bg-rose-500/20"
                              onClick={() => void handleDelete(rule)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Excluir
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {editingRule ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#07030f]/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-4xl rounded-2xl border border-violet-300/30 bg-[linear-gradient(160deg,rgba(33,16,56,0.95),rgba(13,9,30,0.95))] p-5 shadow-[0_28px_70px_rgba(74,29,150,0.45)]">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-xl font-extrabold text-white">Editar alerta</h3>
              <button
                type="button"
                className="rounded-lg border border-violet-300/30 px-2 py-1 text-xs text-violet-100 hover:bg-violet-500/20"
                onClick={closeEdit}
                disabled={saving}
              >
                Fechar
              </button>
            </div>

            {renderForm(editForm, setEditForm)}

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                className="rounded-xl border border-violet-300/30 bg-violet-950/40 px-4 py-2 text-sm font-semibold text-violet-100 hover:bg-violet-900/40"
                onClick={closeEdit}
                disabled={saving}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 py-2 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(124,58,237,0.4)] transition hover:brightness-110 disabled:opacity-60"
                onClick={() => void handleSaveEdit()}
                disabled={saving}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
                Salvar alteracoes
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
