"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BellRing,
  Loader2,
  Pencil,
  Plus,
  RefreshCcw,
  Trash2,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { brl, toNumber } from "@/lib/money";
import { supabase } from "@/lib/supabaseClient";

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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string>("");
  const [rules, setRules] = useState<EmailAlertRule[]>([]);
  const [form, setForm] = useState<RuleFormState>(emptyForm);
  const [editingRule, setEditingRule] = useState<EmailAlertRule | null>(null);
  const [editForm, setEditForm] = useState<RuleFormState>(emptyForm);

  const loadRules = useCallback(async () => {
    setLoading(true);
    setFeedback(null);

    const { data: userData, error: userError } = await supabase.auth.getUser();
    const user = userData.user;
    if (userError || !user) {
      setFeedback("Sessao nao encontrada. Faca login novamente.");
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
      setFeedback(
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
      setFeedback("Email do usuario nao encontrado.");
      return;
    }

    const payload = createPayloadFromForm(form);
    const validationError = validatePayload(payload);
    if (validationError) {
      setFeedback(validationError);
      return;
    }

    setSaving(true);
    setFeedback(null);
    const { error } = await supabase.from("email_alert_rules").insert({
      user_id: userId,
      user_email: userEmail,
      ...payload,
    });
    setSaving(false);

    if (error) {
      setFeedback(`Nao foi possivel criar alerta: ${error.message}`);
      return;
    }

    setForm(emptyForm());
    setFeedback("Alerta criado com sucesso.");
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
      setFeedback(validationError);
      return;
    }

    setSaving(true);
    setFeedback(null);
    const { error } = await supabase
      .from("email_alert_rules")
      .update(payload)
      .eq("id", editingRule.id)
      .eq("user_id", userId);
    setSaving(false);

    if (error) {
      setFeedback(`Nao foi possivel editar alerta: ${error.message}`);
      return;
    }

    closeEdit();
    setFeedback("Alerta atualizado.");
    await loadRules();
  };

  const handleToggleActive = async (rule: EmailAlertRule) => {
    if (!userId) return;
    setSaving(true);
    setFeedback(null);
    const { error } = await supabase
      .from("email_alert_rules")
      .update({ ativo_boolean: !rule.ativo_boolean })
      .eq("id", rule.id)
      .eq("user_id", userId);
    setSaving(false);

    if (error) {
      setFeedback(`Nao foi possivel alterar status: ${error.message}`);
      return;
    }

    setFeedback(rule.ativo_boolean ? "Alerta desativado." : "Alerta ativado.");
    await loadRules();
  };

  const handleDelete = async (rule: EmailAlertRule) => {
    if (!userId) return;
    const confirmed = window.confirm(`Excluir alerta "${typeLabel[rule.tipo_alerta]} - ${rule.ativo || "USD/BRL"}"?`);
    if (!confirmed) return;

    setSaving(true);
    setFeedback(null);
    const { error } = await supabase
      .from("email_alert_rules")
      .delete()
      .eq("id", rule.id)
      .eq("user_id", userId);
    setSaving(false);

    if (error) {
      setFeedback(`Nao foi possivel excluir alerta: ${error.message}`);
      return;
    }

    setFeedback("Alerta excluido.");
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
      onClick={() => void loadRules()}
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
          {feedback ? (
            <div className="rounded-xl border border-violet-300/30 bg-violet-950/35 px-4 py-3 text-sm text-violet-100">
              {feedback}
            </div>
          ) : null}

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
