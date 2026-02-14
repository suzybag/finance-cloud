"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarClock,
  CheckCircle2,
  Loader2,
  Pencil,
  Plus,
  Target,
  Trash2,
  Trophy,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { brl, toNumber } from "@/lib/money";
import { supabase } from "@/lib/supabaseClient";

type PlanningGoalRow = {
  id: string;
  user_id: string;
  goal_name: string;
  goal_amount: number;
  current_amount: number;
  months: number;
  is_completed: boolean;
  completed_at: string | null;
  created_at: string;
  updated_at: string | null;
};

type GoalFormState = {
  goalName: string;
  goalAmountMasked: string;
  currentAmountMasked: string;
  months: string;
};

type ProgressMode = "add_value" | "pay_months";

type ProgressFormState = {
  amountMasked: string;
  monthsPaid: string;
};

type GoalMetrics = {
  valueRestante: number;
  valueMonthlyNeeded: number;
  percentual: number;
  isCompleted: boolean;
  forecastDate: Date;
};

const EMPTY_FORM: GoalFormState = {
  goalName: "",
  goalAmountMasked: "",
  currentAmountMasked: "",
  months: "12",
};

const EMPTY_PROGRESS_FORM: ProgressFormState = {
  amountMasked: "",
  monthsPaid: "1",
};

const INPUT_CLASS =
  "w-full rounded-xl border border-violet-300/20 bg-[#181126] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition focus:border-violet-400/70 focus:ring-2 focus:ring-violet-500/20";

const SOFT_CARD_CLASS =
  "rounded-2xl border border-violet-300/20 bg-[linear-gradient(160deg,rgba(31,22,54,0.72),rgba(12,9,26,0.82))] p-4 backdrop-blur-xl";

const roundCurrency = (value: number) => Math.round(value * 100) / 100;

const moneyMask = (value: string) => {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  const amount = Number(digits) / 100;
  return amount.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const toMaskFromNumber = (value: number) =>
  (Number.isFinite(value) ? value : 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const addMonths = (date: Date, months: number) => {
  const copy = new Date(date);
  copy.setMonth(copy.getMonth() + months);
  return copy;
};

const toSafeMonths = (value: unknown) => Math.max(1, Math.round(toNumber(value) || 1));

const formatDate = (value: Date | string) =>
  new Date(value).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

const normalizeGoalRow = (row: Partial<PlanningGoalRow>): PlanningGoalRow => ({
  id: String(row.id || ""),
  user_id: String(row.user_id || ""),
  goal_name: String(row.goal_name || ""),
  goal_amount: Math.max(0, toNumber(row.goal_amount)),
  current_amount: Math.max(0, toNumber(row.current_amount)),
  months: toSafeMonths(row.months),
  is_completed: Boolean(row.is_completed),
  completed_at: row.completed_at || null,
  created_at: row.created_at || new Date().toISOString(),
  updated_at: row.updated_at || null,
});

const computeGoalMetrics = (goal: {
  goal_amount: number;
  current_amount: number;
  months: number;
  created_at?: string;
  completed_at?: string | null;
}) => {
  const goalAmount = Math.max(0, toNumber(goal.goal_amount));
  const currentAmount = Math.max(0, toNumber(goal.current_amount));
  const months = toSafeMonths(goal.months);
  const valueRestante = Math.max(0, goalAmount - currentAmount);
  const valueMonthlyNeeded = months > 0 ? valueRestante / months : valueRestante;
  const percentual = goalAmount > 0 ? Math.min((currentAmount / goalAmount) * 100, 100) : 0;
  const isCompleted = goalAmount > 0 && currentAmount >= goalAmount;
  const baseDate = goal.created_at ? new Date(goal.created_at) : new Date();
  const forecastDate = isCompleted
    ? new Date(goal.completed_at || new Date().toISOString())
    : addMonths(baseDate, months);

  return {
    valueRestante: roundCurrency(valueRestante),
    valueMonthlyNeeded: roundCurrency(valueMonthlyNeeded),
    percentual: Number.isFinite(percentual) ? percentual : 0,
    isCompleted,
    forecastDate,
  } as GoalMetrics;
};

const parseGoalForm = (form: GoalFormState) => {
  const goalName = form.goalName.trim();
  const goalAmount = Math.max(0, toNumber(form.goalAmountMasked));
  const currentAmount = Math.max(0, toNumber(form.currentAmountMasked));
  const months = toSafeMonths(form.months);
  return { goalName, goalAmount, currentAmount, months };
};

const isMissingPlanningTableError = (message?: string | null) =>
  /relation .*financial_planning/i.test(message || "");

const ProgressBar = ({ percentual, done }: { percentual: number; done: boolean }) => {
  const width = Math.max(0, Math.min(100, percentual));
  return (
    <div className="h-3 overflow-hidden rounded-full border border-violet-300/20 bg-black/40">
      <div
        className={`h-full rounded-full transition-[width] duration-700 ${
          done
            ? "animate-pulse bg-gradient-to-r from-emerald-400 via-emerald-300 to-lime-300"
            : "bg-gradient-to-r from-violet-500 via-fuchsia-500 to-cyan-400"
        }`}
        style={{ width: `${width}%` }}
      />
    </div>
  );
};

export default function PlanningPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [goals, setGoals] = useState<PlanningGoalRow[]>([]);
  const [form, setForm] = useState<GoalFormState>(EMPTY_FORM);
  const [editingGoal, setEditingGoal] = useState<PlanningGoalRow | null>(null);
  const [editForm, setEditForm] = useState<GoalFormState>(EMPTY_FORM);
  const [progressGoal, setProgressGoal] = useState<PlanningGoalRow | null>(null);
  const [progressMode, setProgressMode] = useState<ProgressMode | null>(null);
  const [progressForm, setProgressForm] = useState<ProgressFormState>(EMPTY_PROGRESS_FORM);

  const createSectionRef = useRef<HTMLDivElement | null>(null);

  const loadGoals = useCallback(async () => {
    setLoading(true);
    setFeedback(null);

    const { data: userData, error: userError } = await supabase.auth.getUser();
    const resolvedUserId = userData.user?.id ?? null;
    if (userError || !resolvedUserId) {
      setLoading(false);
      setFeedback("Sessao nao encontrada. Entre novamente.");
      return;
    }
    setUserId(resolvedUserId);

    const { data, error } = await supabase
      .from("financial_planning")
      .select("*")
      .eq("user_id", resolvedUserId)
      .order("created_at", { ascending: false });

    if (error) {
      setLoading(false);
      setFeedback(
        isMissingPlanningTableError(error.message)
          ? "Tabela financial_planning nao encontrada. Rode o supabase.sql atualizado."
          : `Falha ao carregar planejamento: ${error.message}`,
      );
      return;
    }

    const normalized = ((data || []) as Partial<PlanningGoalRow>[])
      .map((row) => normalizeGoalRow(row))
      .filter((row) => row.id && row.user_id);

    setGoals(normalized);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadGoals();
  }, [loadGoals]);

  const goalsWithMetrics = useMemo(
    () =>
      goals.map((goal) => ({
        ...goal,
        metrics: computeGoalMetrics(goal),
      })),
    [goals],
  );

  const activeGoals = useMemo(
    () =>
      goalsWithMetrics
        .filter((goal) => !goal.metrics.isCompleted)
        .sort(
          (a, b) =>
            new Date(a.metrics.forecastDate).getTime() - new Date(b.metrics.forecastDate).getTime(),
        ),
    [goalsWithMetrics],
  );

  const completedGoals = useMemo(
    () =>
      goalsWithMetrics
        .filter((goal) => goal.metrics.isCompleted)
        .sort((a, b) => new Date(b.completed_at || b.created_at).getTime() - new Date(a.completed_at || a.created_at).getTime()),
    [goalsWithMetrics],
  );

  const highlightedGoal = activeGoals[0] || completedGoals[0] || null;

  const highlightedMetrics = highlightedGoal
    ? highlightedGoal.metrics
    : {
        valueRestante: 0,
        valueMonthlyNeeded: 0,
        percentual: 0,
        isCompleted: false,
        forecastDate: addMonths(new Date(), 12),
      };

  const previewMetrics = useMemo(() => {
    const parsed = parseGoalForm(form);
    return computeGoalMetrics({
      goal_amount: parsed.goalAmount,
      current_amount: parsed.currentAmount,
      months: parsed.months,
      created_at: new Date().toISOString(),
      completed_at: null,
    });
  }, [form]);

  const openEditModal = (goal: PlanningGoalRow) => {
    setEditingGoal(goal);
    setEditForm({
      goalName: goal.goal_name,
      goalAmountMasked: toMaskFromNumber(goal.goal_amount),
      currentAmountMasked: toMaskFromNumber(goal.current_amount),
      months: String(goal.months),
    });
  };

  const closeEditModal = () => {
    setEditingGoal(null);
    setEditForm(EMPTY_FORM);
  };

  const openProgressModal = (goal: PlanningGoalRow, mode: ProgressMode) => {
    setProgressGoal(goal);
    setProgressMode(mode);
    setProgressForm({
      amountMasked: "",
      monthsPaid: "1",
    });
  };

  const closeProgressModal = () => {
    setProgressGoal(null);
    setProgressMode(null);
    setProgressForm(EMPTY_PROGRESS_FORM);
  };

  const handleCreateGoal = async () => {
    if (!userId) return;
    const parsed = parseGoalForm(form);

    if (!parsed.goalName) {
      setFeedback("Informe o nome do objetivo.");
      return;
    }
    if (parsed.goalAmount <= 0) {
      setFeedback("O valor total do objetivo deve ser maior que zero.");
      return;
    }

    setSaving(true);
    setFeedback(null);

    const isCompleted = parsed.currentAmount >= parsed.goalAmount;
    const payload = {
      user_id: userId,
      goal_name: parsed.goalName,
      goal_amount: roundCurrency(parsed.goalAmount),
      current_amount: roundCurrency(parsed.currentAmount),
      months: parsed.months,
      is_completed: isCompleted,
      completed_at: isCompleted ? new Date().toISOString() : null,
    };

    const { error } = await supabase.from("financial_planning").insert(payload);
    setSaving(false);

    if (error) {
      setFeedback(`Nao foi possivel salvar meta: ${error.message}`);
      return;
    }

    setForm(EMPTY_FORM);
    setFeedback("Meta criada com sucesso.");
    await loadGoals();
  };

  const handleUpdateGoal = async () => {
    if (!userId || !editingGoal) return;
    const parsed = parseGoalForm(editForm);

    if (!parsed.goalName) {
      setFeedback("Informe o nome do objetivo.");
      return;
    }
    if (parsed.goalAmount <= 0) {
      setFeedback("O valor total do objetivo deve ser maior que zero.");
      return;
    }

    setSaving(true);
    setFeedback(null);

    const isCompleted = parsed.currentAmount >= parsed.goalAmount;
    const completedAt = isCompleted
      ? editingGoal.completed_at || new Date().toISOString()
      : null;

    const { error } = await supabase
      .from("financial_planning")
      .update({
        goal_name: parsed.goalName,
        goal_amount: roundCurrency(parsed.goalAmount),
        current_amount: roundCurrency(parsed.currentAmount),
        months: parsed.months,
        is_completed: isCompleted,
        completed_at: completedAt,
      })
      .eq("id", editingGoal.id)
      .eq("user_id", userId);

    setSaving(false);

    if (error) {
      setFeedback(`Nao foi possivel editar meta: ${error.message}`);
      return;
    }

    closeEditModal();
    setFeedback("Meta atualizada.");
    await loadGoals();
  };

  const handleApplyProgress = async () => {
    if (!userId || !progressGoal || !progressMode) return;

    const addAmount = Math.max(0, toNumber(progressForm.amountMasked));
    if (addAmount <= 0) {
      setFeedback("Informe um valor maior que zero para adicionar.");
      return;
    }

    const paidMonths = progressMode === "pay_months"
      ? Math.max(1, Math.round(toNumber(progressForm.monthsPaid) || 0))
      : 0;

    if (progressMode === "pay_months" && paidMonths <= 0) {
      setFeedback("Informe quantos meses voce ja conseguiu pagar.");
      return;
    }

    setSaving(true);
    setFeedback(null);

    const nextCurrent = roundCurrency(progressGoal.current_amount + addAmount);
    const nextMonths = progressMode === "pay_months"
      ? Math.max(1, progressGoal.months - paidMonths)
      : progressGoal.months;
    const isCompleted = nextCurrent >= progressGoal.goal_amount;
    const completedAt = isCompleted
      ? progressGoal.completed_at || new Date().toISOString()
      : null;

    const { error } = await supabase
      .from("financial_planning")
      .update({
        current_amount: nextCurrent,
        months: nextMonths,
        is_completed: isCompleted,
        completed_at: completedAt,
      })
      .eq("id", progressGoal.id)
      .eq("user_id", userId);

    setSaving(false);

    if (error) {
      setFeedback(`Nao foi possivel atualizar progresso: ${error.message}`);
      return;
    }

    closeProgressModal();
    setFeedback(
      progressMode === "pay_months"
        ? `Progresso registrado: +${brl(addAmount)} e ${paidMonths} mes(es) abatido(s).`
        : `Valor abatido com sucesso: +${brl(addAmount)}.`,
    );
    await loadGoals();
  };

  const handleDeleteGoal = async (goal: PlanningGoalRow) => {
    if (!userId) return;
    const confirmDelete = window.confirm(`Excluir a meta "${goal.goal_name}"?`);
    if (!confirmDelete) return;

    setSaving(true);
    setFeedback(null);
    const { error } = await supabase
      .from("financial_planning")
      .delete()
      .eq("id", goal.id)
      .eq("user_id", userId);
    setSaving(false);

    if (error) {
      setFeedback(`Nao foi possivel excluir: ${error.message}`);
      return;
    }

    setFeedback("Meta excluida.");
    await loadGoals();
  };

  const actions = (
    <button
      type="button"
      className="inline-flex items-center gap-2 rounded-xl border border-violet-300/30 bg-violet-500/20 px-3 py-2 text-xs font-semibold text-violet-100 transition hover:bg-violet-500/30"
      onClick={() => createSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
    >
      <Plus className="h-3.5 w-3.5" />
      Nova meta
    </button>
  );

  return (
    <AppShell
      title="Planejamento"
      subtitle="Planilha de metas para atingir objetivos de economia"
      actions={actions}
      contentClassName="ultra-shell-bg"
    >
      {loading ? (
        <div className={`${SOFT_CARD_CLASS} text-slate-200`}>Carregando planejamento...</div>
      ) : (
        <div className="space-y-6">
          {feedback ? (
            <div className="rounded-xl border border-violet-300/30 bg-violet-950/35 px-4 py-3 text-sm text-violet-100">
              {feedback}
            </div>
          ) : null}

          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <article className="rounded-3xl border border-violet-300/25 bg-[linear-gradient(160deg,rgba(35,20,64,0.88),rgba(12,10,30,0.92))] p-5 shadow-[0_18px_50px_rgba(50,20,100,0.35)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-violet-200/70">
                    Objetivo em destaque
                  </p>
                  <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-white">
                    {highlightedGoal?.goal_name || "Nenhuma meta cadastrada"}
                  </h2>
                </div>
                <div className="rounded-xl border border-violet-300/25 bg-black/25 p-2">
                  <Target className="h-5 w-5 text-violet-200" />
                </div>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
                <div>
                  <p className="text-sm text-violet-100/75">Progresso</p>
                  <p className="text-3xl font-black text-white">
                    {highlightedMetrics.percentual.toFixed(1).replace(".", ",")}%
                  </p>
                </div>
                <div className="rounded-2xl border border-violet-300/20 bg-black/20 p-3 text-right">
                  <p className="text-xs text-violet-100/70">Guardado</p>
                  <p className="mt-1 text-lg font-bold text-cyan-200">
                    {brl(highlightedGoal?.current_amount || 0)}
                  </p>
                  <p className="mt-1 text-[11px] text-violet-100/65">
                    de {brl(highlightedGoal?.goal_amount || 0)}
                  </p>
                </div>
              </div>

              <div className="mt-4">
                <ProgressBar
                  percentual={highlightedMetrics.percentual}
                  done={highlightedMetrics.isCompleted}
                />
              </div>

              {highlightedMetrics.isCompleted ? (
                <div className="mt-3 inline-flex animate-pulse items-center gap-2 rounded-full border border-emerald-300/35 bg-emerald-500/15 px-3 py-1 text-xs font-bold text-emerald-200">
                  <Trophy className="h-3.5 w-3.5" />
                  Meta concluida com sucesso
                </div>
              ) : null}
            </article>

            <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
              <article className={SOFT_CARD_CLASS}>
                <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Valor restante</p>
                <p className="mt-2 text-2xl font-bold text-white">
                  {brl(highlightedMetrics.valueRestante)}
                </p>
              </article>
              <article className={SOFT_CARD_CLASS}>
                <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Valor mensal necessario</p>
                <p className="mt-2 text-2xl font-bold text-cyan-200">
                  {brl(highlightedMetrics.valueMonthlyNeeded)}
                </p>
              </article>
              <article className={SOFT_CARD_CLASS}>
                <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Previsao de conclusao</p>
                <p className="mt-2 inline-flex items-center gap-2 text-lg font-bold text-white">
                  <CalendarClock className="h-4 w-4 text-violet-200" />
                  {formatDate(highlightedMetrics.forecastDate)}
                </p>
              </article>
            </div>
          </section>

          <section ref={createSectionRef} className={`${SOFT_CARD_CLASS} rounded-3xl`}>
            <div className="mb-4 flex items-center justify-between gap-2">
              <h3 className="text-lg font-bold text-white">Nova meta de economia</h3>
              <span className="rounded-full border border-violet-300/30 bg-violet-500/20 px-3 py-1 text-[11px] font-semibold text-violet-100">
                Planejamento inteligente
              </span>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-violet-100/75">Nome do objetivo</span>
                <input
                  className={INPUT_CLASS}
                  placeholder="Ex: Comprar carro"
                  value={form.goalName}
                  onChange={(event) => setForm((prev) => ({ ...prev, goalName: event.target.value }))}
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-violet-100/75">Valor total (R$)</span>
                <input
                  className={INPUT_CLASS}
                  placeholder="0,00"
                  inputMode="decimal"
                  value={form.goalAmountMasked}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, goalAmountMasked: moneyMask(event.target.value) }))
                  }
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-violet-100/75">Valor ja guardado (R$)</span>
                <input
                  className={INPUT_CLASS}
                  placeholder="0,00"
                  inputMode="decimal"
                  value={form.currentAmountMasked}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, currentAmountMasked: moneyMask(event.target.value) }))
                  }
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-violet-100/75">Prazo (meses)</span>
                <input
                  className={INPUT_CLASS}
                  type="number"
                  min={1}
                  value={form.months}
                  onChange={(event) => setForm((prev) => ({ ...prev, months: event.target.value }))}
                />
              </label>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <div className="rounded-xl border border-violet-300/20 bg-black/30 p-3">
                <p className="text-[11px] text-slate-400">Falta juntar</p>
                <p className="mt-1 text-base font-bold text-white">{brl(previewMetrics.valueRestante)}</p>
              </div>
              <div className="rounded-xl border border-violet-300/20 bg-black/30 p-3">
                <p className="text-[11px] text-slate-400">Guardar por mes</p>
                <p className="mt-1 text-base font-bold text-cyan-200">{brl(previewMetrics.valueMonthlyNeeded)}</p>
              </div>
              <div className="rounded-xl border border-violet-300/20 bg-black/30 p-3">
                <p className="text-[11px] text-slate-400">Percentual atingido</p>
                <p className="mt-1 text-base font-bold text-violet-100">
                  {previewMetrics.percentual.toFixed(1).replace(".", ",")}%
                </p>
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 py-2 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(124,58,237,0.4)] transition hover:brightness-110 disabled:opacity-60"
                onClick={() => void handleCreateGoal()}
                disabled={saving}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Criar objetivo
              </button>
            </div>
          </section>

          <section className={`${SOFT_CARD_CLASS} rounded-3xl`}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">Planilha de metas ativas</h3>
              <span className="rounded-full border border-violet-300/25 bg-violet-900/35 px-3 py-1 text-[11px] font-semibold text-violet-100/85">
                {activeGoals.length} ativa(s)
              </span>
            </div>

            {!activeGoals.length ? (
              <p className="rounded-xl border border-violet-300/20 bg-black/25 px-4 py-5 text-sm text-slate-300">
                Nenhuma meta ativa no momento.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full border-separate border-spacing-y-2">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-[0.12em] text-slate-400">
                      <th className="px-3 py-1">Objetivo</th>
                      <th className="px-3 py-1">Meta</th>
                      <th className="px-3 py-1">Guardado</th>
                      <th className="px-3 py-1">Restante</th>
                      <th className="px-3 py-1">Mensal</th>
                      <th className="px-3 py-1">Progresso</th>
                      <th className="px-3 py-1">Previsao</th>
                      <th className="px-3 py-1">Acoes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeGoals.map((goal) => (
                      <tr
                        key={goal.id}
                        className="rounded-2xl border border-violet-300/20 bg-black/25 text-sm text-slate-100"
                      >
                        <td className="rounded-l-xl px-3 py-3 font-semibold">{goal.goal_name}</td>
                        <td className="px-3 py-3">{brl(goal.goal_amount)}</td>
                        <td className="px-3 py-3">{brl(goal.current_amount)}</td>
                        <td className="px-3 py-3">{brl(goal.metrics.valueRestante)}</td>
                        <td className="px-3 py-3">{brl(goal.metrics.valueMonthlyNeeded)}</td>
                        <td className="px-3 py-3">
                          <div className="w-[160px]">
                            <p className="mb-1 text-[11px] font-semibold text-violet-100">
                              {goal.metrics.percentual.toFixed(1).replace(".", ",")}%
                            </p>
                            <ProgressBar percentual={goal.metrics.percentual} done={false} />
                          </div>
                        </td>
                        <td className="px-3 py-3">{formatDate(goal.metrics.forecastDate)}</td>
                        <td className="rounded-r-xl px-3 py-3">
                          <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                className="inline-flex items-center gap-1 rounded-lg border border-cyan-300/25 bg-cyan-500/10 px-2 py-1 text-xs text-cyan-100 hover:bg-cyan-500/20"
                                onClick={() => openProgressModal(goal, "add_value")}
                              >
                                + Valor
                              </button>
                              <button
                                type="button"
                                className="inline-flex items-center gap-1 rounded-lg border border-sky-300/25 bg-sky-500/10 px-2 py-1 text-xs text-sky-100 hover:bg-sky-500/20"
                                onClick={() => openProgressModal(goal, "pay_months")}
                              >
                                + Mes(es)
                              </button>
                            </div>
                            <div className="flex items-center gap-2">
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 rounded-lg border border-violet-300/25 bg-violet-500/15 px-2 py-1 text-xs text-violet-100 hover:bg-violet-500/25"
                              onClick={() => openEditModal(goal)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Editar
                            </button>
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 rounded-lg border border-rose-300/25 bg-rose-500/10 px-2 py-1 text-xs text-rose-100 hover:bg-rose-500/20"
                              onClick={() => void handleDeleteGoal(goal)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Excluir
                            </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className={`${SOFT_CARD_CLASS} rounded-3xl`}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="inline-flex items-center gap-2 text-lg font-bold text-white">
                <CheckCircle2 className="h-5 w-5 text-emerald-300" />
                Historico de metas concluidas
              </h3>
              <span className="rounded-full border border-emerald-300/25 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold text-emerald-200">
                {completedGoals.length} concluida(s)
              </span>
            </div>

            {!completedGoals.length ? (
              <p className="rounded-xl border border-emerald-300/20 bg-black/25 px-4 py-5 text-sm text-slate-300">
                Ainda nao ha metas concluidas.
              </p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {completedGoals.map((goal) => (
                  <article
                    key={goal.id}
                    className="rounded-2xl border border-emerald-300/25 bg-emerald-500/10 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-emerald-100">{goal.goal_name}</p>
                        <p className="mt-1 text-xs text-emerald-100/85">
                          Concluida em {formatDate(goal.completed_at || goal.created_at)}
                        </p>
                      </div>
                      <Trophy className="h-5 w-5 animate-pulse text-amber-300" />
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-lg border border-emerald-300/25 bg-black/25 px-3 py-2">
                        <p className="text-emerald-100/80">Meta</p>
                        <p className="font-semibold text-white">{brl(goal.goal_amount)}</p>
                      </div>
                      <div className="rounded-lg border border-emerald-300/25 bg-black/25 px-3 py-2">
                        <p className="text-emerald-100/80">Guardado</p>
                        <p className="font-semibold text-white">{brl(goal.current_amount)}</p>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {progressGoal && progressMode ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#07030f]/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-2xl border border-cyan-300/30 bg-[linear-gradient(160deg,rgba(18,28,52,0.96),rgba(11,14,28,0.96))] p-5 shadow-[0_28px_70px_rgba(21,94,117,0.4)]">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-xl font-extrabold text-white">
                {progressMode === "pay_months" ? "Registrar meses pagos" : "Abater valor na meta"}
              </h3>
              <button
                type="button"
                className="rounded-lg border border-cyan-300/30 px-2 py-1 text-xs text-cyan-100 hover:bg-cyan-500/20"
                onClick={closeProgressModal}
                disabled={saving}
              >
                Fechar
              </button>
            </div>

            <div className="mb-3 rounded-xl border border-cyan-300/20 bg-black/30 p-3 text-xs text-cyan-100/85">
              <p className="font-semibold text-cyan-100">{progressGoal.goal_name}</p>
              <p className="mt-1">Guardado atual: {brl(progressGoal.current_amount)}</p>
              <p>Meta total: {brl(progressGoal.goal_amount)}</p>
              <p>Meses restantes: {progressGoal.months}</p>
            </div>

            <div className="grid gap-3">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-cyan-100/80">
                  Quanto voce conseguiu guardar agora (R$)
                </span>
                <input
                  className={INPUT_CLASS}
                  inputMode="decimal"
                  placeholder="0,00"
                  value={progressForm.amountMasked}
                  onChange={(event) =>
                    setProgressForm((prev) => ({
                      ...prev,
                      amountMasked: moneyMask(event.target.value),
                    }))
                  }
                />
              </label>

              {progressMode === "pay_months" ? (
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-cyan-100/80">
                    Quantos meses voce ja conseguiu pagar
                  </span>
                  <input
                    className={INPUT_CLASS}
                    type="number"
                    min={1}
                    value={progressForm.monthsPaid}
                    onChange={(event) =>
                      setProgressForm((prev) => ({
                        ...prev,
                        monthsPaid: event.target.value,
                      }))
                    }
                  />
                </label>
              ) : null}
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                className="rounded-xl border border-cyan-300/30 bg-cyan-950/40 px-4 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-900/40"
                onClick={closeProgressModal}
                disabled={saving}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-sky-500 px-4 py-2 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(14,165,233,0.4)] transition hover:brightness-110 disabled:opacity-60"
                onClick={() => void handleApplyProgress()}
                disabled={saving}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {progressMode === "pay_months" ? "Salvar progresso de meses" : "Abater valor"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editingGoal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#07030f]/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl border border-violet-300/30 bg-[linear-gradient(160deg,rgba(33,16,56,0.95),rgba(13,9,30,0.95))] p-5 shadow-[0_28px_70px_rgba(74,29,150,0.45)]">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-xl font-extrabold text-white">Editar objetivo</h3>
              <button
                type="button"
                className="rounded-lg border border-violet-300/30 px-2 py-1 text-xs text-violet-100 hover:bg-violet-500/20"
                onClick={closeEditModal}
                disabled={saving}
              >
                Fechar
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="block md:col-span-2">
                <span className="mb-1 block text-xs font-semibold text-violet-100/75">Nome do objetivo</span>
                <input
                  className={INPUT_CLASS}
                  value={editForm.goalName}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, goalName: event.target.value }))}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-violet-100/75">Valor total (R$)</span>
                <input
                  className={INPUT_CLASS}
                  inputMode="decimal"
                  value={editForm.goalAmountMasked}
                  onChange={(event) =>
                    setEditForm((prev) => ({ ...prev, goalAmountMasked: moneyMask(event.target.value) }))
                  }
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-violet-100/75">Valor ja guardado (R$)</span>
                <input
                  className={INPUT_CLASS}
                  inputMode="decimal"
                  value={editForm.currentAmountMasked}
                  onChange={(event) =>
                    setEditForm((prev) => ({ ...prev, currentAmountMasked: moneyMask(event.target.value) }))
                  }
                />
              </label>
              <label className="block md:col-span-2">
                <span className="mb-1 block text-xs font-semibold text-violet-100/75">Prazo em meses</span>
                <input
                  className={INPUT_CLASS}
                  type="number"
                  min={1}
                  value={editForm.months}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, months: event.target.value }))}
                />
              </label>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                className="rounded-xl border border-violet-300/30 bg-violet-950/40 px-4 py-2 text-sm font-semibold text-violet-100 hover:bg-violet-900/40"
                onClick={closeEditModal}
                disabled={saving}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 py-2 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(124,58,237,0.4)] transition hover:brightness-110 disabled:opacity-60"
                onClick={() => void handleUpdateGoal()}
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
