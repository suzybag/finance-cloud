"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  Briefcase,
  CalendarDays,
  Car,
  CheckCircle2,
  CircleDollarSign,
  CreditCard,
  House,
  Laptop,
  Loader2,
  Plane,
  Plus,
  ShoppingBag,
  Smartphone,
  Trash2,
  Utensils,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import {
  computeInstallmentMetrics,
  normalizeInstallmentRow,
  summarizeInstallments,
  type InstallmentRow,
} from "@/lib/installments";
import { brl, toNumber } from "@/lib/money";
import { supabase } from "@/lib/supabaseClient";

type InstallmentFormState = {
  name: string;
  totalValueMasked: string;
  installments: string;
  startDate: string;
  category: string;
  observation: string;
};

const INPUT_CLASS =
  "w-full rounded-xl border border-cyan-300/20 bg-[#101622] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition focus:border-cyan-400/70 focus:ring-2 focus:ring-cyan-500/25";

const CARD_CLASS =
  "rounded-2xl border border-cyan-300/20 bg-[linear-gradient(155deg,rgba(13,18,32,0.86),rgba(7,10,19,0.92))] p-4 shadow-[0_18px_40px_rgba(0,0,0,0.35)]";

const emptyForm = (): InstallmentFormState => ({
  name: "",
  totalValueMasked: "",
  installments: "12",
  startDate: new Date().toISOString().slice(0, 10),
  category: "",
  observation: "",
});

const round2 = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;

const moneyMask = (value: string) => {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  const amount = Number(digits) / 100;
  return amount.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const normalizeText = (value?: string | null) =>
  (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const parseInstallmentCount = (value: string) =>
  Math.min(240, Math.max(1, Math.round(toNumber(value) || 1)));

const isMissingInstallmentsTableError = (message?: string | null) =>
  /relation .*installments/i.test(message || "")
  || /schema cache/i.test((message || "").toLowerCase());

const getCategoryIcon = (category?: string | null) => {
  const normalized = normalizeText(category);
  if (normalized.includes("carro") || normalized.includes("transporte") || normalized.includes("combust")) {
    return Car;
  }
  if (normalized.includes("casa") || normalized.includes("moradia") || normalized.includes("aluguel")) {
    return House;
  }
  if (normalized.includes("comida") || normalized.includes("aliment") || normalized.includes("restaurante")) {
    return Utensils;
  }
  if (normalized.includes("trabalho") || normalized.includes("empresa")) {
    return Briefcase;
  }
  if (normalized.includes("viagem")) {
    return Plane;
  }
  if (normalized.includes("tecnologia") || normalized.includes("notebook") || normalized.includes("celular")) {
    return Laptop;
  }
  return ShoppingBag;
};

const formatDate = (value?: string | Date | null) => {
  if (!value) return "--";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

export default function ParcelasPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [installments, setInstallments] = useState<InstallmentRow[]>([]);
  const [form, setForm] = useState<InstallmentFormState>(emptyForm);

  const loadInstallments = useCallback(async () => {
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
      .from("installments")
      .select("*")
      .eq("user_id", resolvedUserId)
      .order("created_at", { ascending: false });

    if (error) {
      setLoading(false);
      setFeedback(
        isMissingInstallmentsTableError(error.message)
          ? "Tabela installments nao encontrada. Rode o supabase.sql atualizado."
          : `Falha ao carregar parcelas: ${error.message}`,
      );
      return;
    }

    const normalized = ((data || []) as Partial<InstallmentRow>[])
      .map((row) => normalizeInstallmentRow(row))
      .filter((row) => row.id && row.user_id);

    setInstallments(normalized);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadInstallments();
  }, [loadInstallments]);

  const installmentCountPreview = parseInstallmentCount(form.installments);
  const totalValuePreview = Math.max(0, toNumber(form.totalValueMasked));
  const installmentValuePreview = round2(totalValuePreview / installmentCountPreview);

  const enriched = useMemo(
    () =>
      installments.map((row) => ({
        row,
        metrics: computeInstallmentMetrics(row),
      })),
    [installments],
  );

  const summary = useMemo(() => summarizeInstallments(installments, new Date(), 10), [installments]);
  const nearDueAlerts = useMemo(
    () =>
      summary.active.filter((item) =>
        item.metrics.daysUntilDue !== null
        && item.metrics.daysUntilDue >= 0
        && item.metrics.daysUntilDue <= 3,
      ),
    [summary.active],
  );

  const explainCard = useMemo(() => {
    const firstActive = summary.active[0];
    if (firstActive) {
      return {
        title: firstActive.row.name,
        paid: firstActive.metrics.paidInstallments,
        total: firstActive.metrics.installmentCount,
        installmentValue: firstActive.metrics.installmentValue,
        progress: firstActive.metrics.percentagePaid,
      };
    }
    return {
      title: "iPhone 15",
      paid: 5,
      total: 12,
      installmentValue: 499,
      progress: (5 / 12) * 100,
    };
  }, [summary.active]);

  const handleCreateInstallment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!userId) return;

    const name = form.name.trim();
    const totalValue = Math.max(0, round2(toNumber(form.totalValueMasked)));
    const installmentCount = parseInstallmentCount(form.installments);
    const startDate = form.startDate || new Date().toISOString().slice(0, 10);
    const category = form.category.trim() || null;
    const observation = form.observation.trim() || null;
    const installmentValue = round2(totalValue / installmentCount);

    if (!name) {
      setFeedback("Informe o nome da compra.");
      return;
    }
    if (totalValue <= 0) {
      setFeedback("Informe um valor total maior que zero.");
      return;
    }

    setSaving(true);
    setFeedback(null);

    const payload = {
      user_id: userId,
      name,
      total_value: totalValue,
      installments: installmentCount,
      paid_installments: 0,
      installment_value: installmentValue,
      start_date: startDate,
      category,
      observation,
    };

    const { data, error } = await supabase
      .from("installments")
      .insert(payload)
      .select("*")
      .single();

    setSaving(false);

    if (error || !data) {
      setFeedback(
        isMissingInstallmentsTableError(error?.message)
          ? "Tabela installments nao encontrada. Rode o supabase.sql atualizado."
          : `Falha ao salvar parcela: ${error?.message || "erro desconhecido"}`,
      );
      return;
    }

    const inserted = normalizeInstallmentRow(data as Partial<InstallmentRow>);
    setInstallments((prev) => [inserted, ...prev]);
    setForm((prev) => ({ ...emptyForm(), startDate: prev.startDate || emptyForm().startDate }));
    setFeedback("Compra parcelada cadastrada com sucesso.");
  };

  const handleMarkInstallmentPaid = async (row: InstallmentRow, step: 1 | -1) => {
    if (!userId) return;

    const metrics = computeInstallmentMetrics(row);
    const nextPaid = Math.min(
      metrics.installmentCount,
      Math.max(0, metrics.paidInstallments + step),
    );

    if (nextPaid === metrics.paidInstallments) return;

    setSaving(true);
    setFeedback(null);

    const { error } = await supabase
      .from("installments")
      .update({ paid_installments: nextPaid })
      .eq("id", row.id)
      .eq("user_id", userId);

    setSaving(false);

    if (error) {
      setFeedback(`Falha ao atualizar parcela: ${error.message}`);
      return;
    }

    setInstallments((prev) =>
      prev.map((item) =>
        item.id === row.id
          ? {
              ...item,
              paid_installments: nextPaid,
              updated_at: new Date().toISOString(),
            }
          : item,
      ),
    );
    setFeedback(step > 0 ? "Parcela marcada como paga." : "Pagamento da parcela ajustado.");
  };

  const handleDeleteInstallment = async (row: InstallmentRow) => {
    if (!userId) return;
    const confirmed = window.confirm(`Excluir o parcelamento "${row.name}"?`);
    if (!confirmed) return;

    setSaving(true);
    setFeedback(null);

    const { error } = await supabase
      .from("installments")
      .delete()
      .eq("id", row.id)
      .eq("user_id", userId);

    setSaving(false);

    if (error) {
      setFeedback(`Falha ao excluir parcelamento: ${error.message}`);
      return;
    }

    setInstallments((prev) => prev.filter((item) => item.id !== row.id));
    setFeedback("Parcelamento excluido.");
  };

  return (
    <AppShell
      title="Parcelas"
      subtitle="Compras parceladas com acompanhamento mensal automatico"
      contentClassName="parcelas-premium-bg"
    >
      {loading ? (
        <div className={CARD_CLASS}>Carregando parcelas...</div>
      ) : (
        <div className="space-y-5">
          <section className="grid gap-4 lg:grid-cols-4">
            <article className={CARD_CLASS}>
              <p className="text-xs uppercase tracking-[0.14em] text-cyan-200/60">Total parcelado ativo</p>
              <p className="mt-2 text-2xl font-bold text-cyan-50">{brl(summary.activeTotalRemaining)}</p>
              <p className="mt-1 text-xs text-cyan-100/65">Soma do valor restante das compras abertas</p>
            </article>
            <article className={CARD_CLASS}>
              <p className="text-xs uppercase tracking-[0.14em] text-cyan-200/60">Parcelas restantes</p>
              <p className="mt-2 text-2xl font-bold text-cyan-50">{summary.activeRemainingInstallments}</p>
              <p className="mt-1 text-xs text-cyan-100/65">Total de parcelas que ainda faltam pagar</p>
            </article>
            <article className={CARD_CLASS}>
              <p className="text-xs uppercase tracking-[0.14em] text-cyan-200/60">Proximas a vencer</p>
              <p className="mt-2 text-2xl font-bold text-cyan-50">{summary.dueSoon.length}</p>
              <p className="mt-1 text-xs text-cyan-100/65">Vencimentos previstos para os proximos 10 dias</p>
            </article>
            <article className={CARD_CLASS}>
              <p className="text-xs uppercase tracking-[0.14em] text-cyan-200/60">Alertas de vencimento</p>
              <p className="mt-2 text-2xl font-bold text-cyan-50">{summary.overdue.length + nearDueAlerts.length}</p>
              <p className="mt-1 text-xs text-cyan-100/65">Atrasadas ou vencendo em ate 3 dias</p>
            </article>
          </section>

          <section className="parcelas-explain-card">
            <div className="flex items-start gap-3">
              <div className="parcelas-explain-icon">
                <Smartphone className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-2xl font-semibold tracking-tight text-white">Parcelas</p>
                <p className="text-xs text-violet-200/80">Gerencie compras parceladas com progresso visual</p>
              </div>
            </div>

            <div className="parcelas-explain-item">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div>
                  <p className="line-clamp-1 text-base font-semibold text-white">{explainCard.title}</p>
                  <p className="text-xs text-slate-300/80">{explainCard.paid}/{explainCard.total} parcelas</p>
                </div>
                <p className="text-2xl font-bold tracking-tight text-white">{brl(explainCard.installmentValue)}</p>
              </div>
              <div className="parcelas-explain-track">
                <div
                  className="parcelas-explain-fill"
                  style={{ width: `${Math.max(0, Math.min(100, explainCard.progress)).toFixed(2)}%` }}
                />
              </div>
            </div>
          </section>

          <div className="grid gap-4 xl:grid-cols-[380px_1fr]">
            <section className={`${CARD_CLASS} h-fit`}>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-cyan-50">Nova compra parcelada</h2>
                <div className="inline-flex items-center gap-1 rounded-full border border-cyan-300/25 bg-cyan-500/10 px-2.5 py-1 text-[11px] text-cyan-100">
                  <CircleDollarSign className="h-3.5 w-3.5" />
                  Valor automatico por parcela
                </div>
              </div>

              <form className="space-y-3" onSubmit={(event) => void handleCreateInstallment(event)}>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-cyan-100/80">Nome da compra</span>
                  <input
                    type="text"
                    className={INPUT_CLASS}
                    value={form.name}
                    onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                    placeholder="Ex: iPhone 16 Pro"
                    maxLength={120}
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-cyan-100/80">Valor total</span>
                  <input
                    type="text"
                    className={INPUT_CLASS}
                    value={form.totalValueMasked}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, totalValueMasked: moneyMask(event.target.value) }))
                    }
                    placeholder="0,00"
                    inputMode="decimal"
                  />
                </label>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-cyan-100/80">Numero de parcelas</span>
                    <input
                      type="number"
                      min={1}
                      max={240}
                      className={INPUT_CLASS}
                      value={form.installments}
                      onChange={(event) => setForm((prev) => ({ ...prev, installments: event.target.value }))}
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-cyan-100/80">Primeira parcela</span>
                    <input
                      type="date"
                      className={INPUT_CLASS}
                      value={form.startDate}
                      onChange={(event) => setForm((prev) => ({ ...prev, startDate: event.target.value }))}
                    />
                  </label>
                </div>

                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-cyan-100/80">Categoria (opcional)</span>
                  <input
                    type="text"
                    className={INPUT_CLASS}
                    value={form.category}
                    onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))}
                    placeholder="Ex: Eletronicos, Viagem, Casa..."
                    maxLength={80}
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-cyan-100/80">Observacao</span>
                  <textarea
                    className={`${INPUT_CLASS} min-h-20 resize-y`}
                    value={form.observation}
                    onChange={(event) => setForm((prev) => ({ ...prev, observation: event.target.value }))}
                    placeholder="Notas sobre a compra..."
                    maxLength={500}
                  />
                </label>

                <div className="rounded-xl border border-cyan-300/20 bg-[#0b1220]/80 p-3 text-sm">
                  <p className="text-cyan-100/80">Valor por parcela (calculado automaticamente)</p>
                  <p className="mt-1 text-xl font-bold text-cyan-50">{brl(installmentValuePreview)}</p>
                  <p className="mt-1 text-xs text-cyan-100/65">
                    {installmentCountPreview}x de {brl(installmentValuePreview)}
                  </p>
                </div>

                <button
                  type="submit"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-300/35 bg-cyan-500/15 px-4 py-2.5 text-sm font-semibold text-cyan-50 transition hover:bg-cyan-500/25 disabled:opacity-60"
                  disabled={saving}
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Salvar parcelamento
                </button>
              </form>
            </section>

            <section className="space-y-3">
              {!enriched.length ? (
                <div className={CARD_CLASS}>
                  <p className="text-sm text-cyan-100/80">
                    Nenhuma compra parcelada cadastrada ainda.
                  </p>
                </div>
              ) : (
                enriched.map(({ row, metrics }) => {
                  const Icon = getCategoryIcon(row.category);
                  const progressWidth = `${Math.max(0, Math.min(100, metrics.percentagePaid)).toFixed(2)}%`;
                  const nextDueLabel = formatDate(metrics.nextDueDate);
                  const urgencyClass = metrics.isOverdue
                    ? "border-rose-400/35 bg-rose-500/10 text-rose-100"
                    : metrics.isDueSoon
                      ? "border-amber-300/35 bg-amber-500/10 text-amber-100"
                      : "border-cyan-300/35 bg-cyan-500/10 text-cyan-100";

                  return (
                    <article
                      key={row.id}
                      className="rounded-2xl border border-cyan-300/20 bg-[linear-gradient(145deg,rgba(8,13,25,0.9),rgba(10,18,32,0.86))] p-4 shadow-[0_16px_34px_rgba(0,0,0,0.35)]"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-3">
                          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-cyan-300/20 bg-cyan-500/10 text-cyan-100">
                            <Icon className="h-5 w-5" />
                          </div>
                          <div className="min-w-0">
                            <h3 className="truncate text-base font-semibold text-cyan-50">{row.name}</h3>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-cyan-100/70">
                              <span className="inline-flex items-center gap-1">
                                <CreditCard className="h-3.5 w-3.5" />
                                {brl(metrics.installmentValue)} por mes
                              </span>
                              {row.category ? (
                                <span className="rounded-full border border-cyan-300/25 bg-cyan-500/10 px-2 py-0.5">
                                  {row.category}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>

                        <div className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${urgencyClass}`}>
                          {metrics.isCompleted ? (
                            <>
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Concluido
                            </>
                          ) : metrics.isOverdue ? (
                            <>
                              <AlertTriangle className="h-3.5 w-3.5" />
                              Atrasado
                            </>
                          ) : (
                            <>
                              <CalendarDays className="h-3.5 w-3.5" />
                              Vence em {metrics.daysUntilDue ?? "--"} dia(s)
                            </>
                          )}
                        </div>
                      </div>

                      <div className="mt-4">
                        <div className="mb-2 flex items-center justify-between text-xs text-cyan-100/75">
                          <span>{metrics.paidInstallments}/{metrics.installmentCount} parcelas</span>
                          <span>{metrics.percentagePaid.toFixed(1).replace(".", ",")}% pago</span>
                        </div>
                        <div className="relative h-2.5 overflow-hidden rounded-full border border-cyan-300/20 bg-[#09111d]">
                          <div
                            className="parcelas-progress-fill h-full rounded-full bg-gradient-to-r from-cyan-400 via-sky-400 to-blue-400 transition-[width] duration-700"
                            style={{ width: progressWidth }}
                          >
                            <span className="parcelas-progress-shine" />
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-2 text-xs text-cyan-100/75 sm:grid-cols-3">
                        <div className="rounded-lg border border-cyan-300/15 bg-black/25 px-3 py-2">
                          <p className="text-cyan-100/55">Valor restante</p>
                          <p className="mt-0.5 font-semibold text-cyan-50">{brl(metrics.remainingValue)}</p>
                        </div>
                        <div className="rounded-lg border border-cyan-300/15 bg-black/25 px-3 py-2">
                          <p className="text-cyan-100/55">Proximo vencimento</p>
                          <p className="mt-0.5 font-semibold text-cyan-50">{nextDueLabel}</p>
                        </div>
                        <div className="rounded-lg border border-cyan-300/15 bg-black/25 px-3 py-2">
                          <p className="text-cyan-100/55">Valor total</p>
                          <p className="mt-0.5 font-semibold text-cyan-50">{brl(metrics.totalValue)}</p>
                        </div>
                      </div>

                      {row.observation ? (
                        <p className="mt-3 rounded-lg border border-cyan-300/15 bg-black/20 px-3 py-2 text-xs text-cyan-100/70">
                          {row.observation}
                        </p>
                      ) : null}

                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-lg border border-emerald-300/35 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/20 disabled:opacity-50"
                          onClick={() => void handleMarkInstallmentPaid(row, 1)}
                          disabled={saving || metrics.isCompleted}
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Pagar parcela
                        </button>

                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-lg border border-amber-300/35 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-100 hover:bg-amber-500/20 disabled:opacity-50"
                          onClick={() => void handleMarkInstallmentPaid(row, -1)}
                          disabled={saving || metrics.paidInstallments <= 0}
                        >
                          Ajustar (-1)
                        </button>

                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-lg border border-rose-300/35 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-100 hover:bg-rose-500/20 disabled:opacity-50"
                          onClick={() => void handleDeleteInstallment(row)}
                          disabled={saving}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Excluir
                        </button>
                      </div>
                    </article>
                  );
                })
              )}
            </section>
          </div>

          {feedback ? (
            <div className="rounded-xl border border-cyan-300/20 bg-cyan-900/20 px-4 py-3 text-sm text-cyan-100">
              {feedback}
            </div>
          ) : null}
        </div>
      )}
    </AppShell>
  );
}
