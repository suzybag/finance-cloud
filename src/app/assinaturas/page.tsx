"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Activity,
  CalendarClock,
  CreditCard,
  Loader2,
  Plus,
  Trash2,
  Wallet,
} from "lucide-react";
import { Inter } from "next/font/google";
import { AppShell } from "@/components/AppShell";
import { brl, toNumber } from "@/lib/money";
import {
  buildRecurringSubscriptionExternalId,
  computeRecurringSubscriptionMetrics,
  inferRecurringSubscriptionCategory,
  normalizeRecurringSubscriptionPaymentRow,
  normalizeRecurringSubscriptionRow,
  summarizeRecurringSubscriptions,
  type BillingCycle,
  type RecurringSubscriptionPaymentRow,
  type RecurringSubscriptionRow,
} from "@/lib/recurringSubscriptions";
import { supabase } from "@/lib/supabaseClient";

type SubscriptionFormState = {
  name: string;
  priceMasked: string;
  category: string;
  chargeDate: string;
  billingCycle: BillingCycle;
  paymentMethod: string;
  notes: string;
};

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const INPUT_CLASS =
  "w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition duration-200 focus:border-cyan-300/65 focus:bg-white/[0.06] focus:ring-2 focus:ring-cyan-500/20";

const CARD_CLASS =
  "rounded-3xl border border-white/10 bg-[linear-gradient(150deg,rgba(13,19,34,0.64),rgba(7,11,22,0.74))] p-5 backdrop-blur-xl shadow-[0_18px_44px_rgba(0,0,0,0.4),0_0_0_1px_rgba(125,211,252,0.08)]";

const emptyForm = (): SubscriptionFormState => ({
  name: "",
  priceMasked: "",
  category: "",
  chargeDate: new Date().toISOString().slice(0, 10),
  billingCycle: "monthly",
  paymentMethod: "cartao",
  notes: "",
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

const cycleLabel: Record<BillingCycle, string> = {
  monthly: "Mensal",
  annual: "Anual",
  weekly: "Semanal",
};

const paymentMethodLabel = (value?: string | null) => {
  const normalized = normalizeText(value);
  if (normalized.includes("cart")) return "Cartao";
  if (normalized.includes("conta")) return "Conta";
  if (normalized.includes("pix")) return "Pix";
  if (normalized.includes("deb")) return "Debito";
  return "Nao informado";
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

const formatShortDate = (value?: Date | null) => {
  if (!value) return "--";
  if (Number.isNaN(value.getTime())) return "--";
  return value.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });
};

const billingDayLabel = (cycle: BillingCycle, dateRaw: string) => {
  const date = new Date(`${dateRaw}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "--";
  if (cycle === "weekly") {
    const weekday = date.toLocaleDateString("pt-BR", { weekday: "long" });
    return `${weekday} (${date.getDay()})`;
  }
  if (cycle === "annual") {
    return `${date.toLocaleDateString("pt-BR", { day: "2-digit", month: "long" })}`;
  }
  return `Dia ${date.getDate()}`;
};

function getServiceIcon(name?: string | null) {
  const n = normalizeText(name);

  if (n.includes("netflix") || n.includes("netlix") || n.includes("netflx")) return "/icons/netflix.png";
  if (n.includes("hbo") || n.includes("hbomax") || n.includes("hbo max") || n.includes("htbo")) return "/icons/hbo.png";
  if (n.includes("spotify")) return "/icons/spotify.png";
  if (n.includes("amazon") || n.includes("prime")) return "/icons/amazon.png";
  if (n.includes("disney")) return "/icons/disney.png";

  return "/icons/default.png";
}

const isMissingRecurringSubscriptionsTableError = (message?: string | null) =>
  /relation .*recurring_subscriptions/i.test(message || "")
  || /schema cache/i.test((message || "").toLowerCase());

const isMissingRecurringSubscriptionPaymentsTableError = (message?: string | null) =>
  /relation .*recurring_subscription_payments/i.test(message || "")
  || /schema cache/i.test((message || "").toLowerCase());

export default function AssinaturasPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [subscriptions, setSubscriptions] = useState<RecurringSubscriptionRow[]>([]);
  const [payments, setPayments] = useState<RecurringSubscriptionPaymentRow[]>([]);
  const [form, setForm] = useState<SubscriptionFormState>(emptyForm);

  const loadData = useCallback(async () => {
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

    const [subscriptionsRes, paymentsRes] = await Promise.all([
      supabase
        .from("recurring_subscriptions")
        .select("*")
        .eq("user_id", resolvedUserId)
        .order("created_at", { ascending: false }),
      supabase
        .from("recurring_subscription_payments")
        .select("*")
        .eq("user_id", resolvedUserId)
        .order("charge_date", { ascending: false })
        .limit(500),
    ]);

    if (subscriptionsRes.error) {
      setLoading(false);
      setFeedback(
        isMissingRecurringSubscriptionsTableError(subscriptionsRes.error.message)
          ? "Tabela recurring_subscriptions nao encontrada. Rode o supabase.sql atualizado."
          : `Falha ao carregar assinaturas: ${subscriptionsRes.error.message}`,
      );
      return;
    }

    if (paymentsRes.error) {
      setLoading(false);
      setFeedback(
        isMissingRecurringSubscriptionPaymentsTableError(paymentsRes.error.message)
          ? "Tabela recurring_subscription_payments nao encontrada. Rode o supabase.sql atualizado."
          : `Falha ao carregar historico de pagamentos: ${paymentsRes.error.message}`,
      );
      return;
    }

    const normalizedSubscriptions = ((subscriptionsRes.data || []) as Partial<RecurringSubscriptionRow>[])
      .map((row) => normalizeRecurringSubscriptionRow(row))
      .filter((row) => row.id && row.user_id);

    const normalizedPayments = ((paymentsRes.data || []) as Partial<RecurringSubscriptionPaymentRow>[])
      .map((row) => normalizeRecurringSubscriptionPaymentRow(row))
      .filter((row) => row.id && row.subscription_id && row.user_id);

    setSubscriptions(normalizedSubscriptions);
    setPayments(normalizedPayments);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const summary = useMemo(
    () => summarizeRecurringSubscriptions(subscriptions, new Date(), 14),
    [subscriptions],
  );

  const subscriptionsSorted = useMemo(
    () =>
      [...subscriptions].sort((a, b) => {
        const aMetrics = computeRecurringSubscriptionMetrics(a);
        const bMetrics = computeRecurringSubscriptionMetrics(b);
        const aCharge = aMetrics.nextChargeDate ? aMetrics.nextChargeDate.getTime() : Number.MAX_SAFE_INTEGER;
        const bCharge = bMetrics.nextChargeDate ? bMetrics.nextChargeDate.getTime() : Number.MAX_SAFE_INTEGER;
        if (aCharge !== bCharge) return aCharge - bCharge;
        return a.name.localeCompare(b.name, "pt-BR");
      }),
    [subscriptions],
  );

  const pricePreview = Math.max(0, toNumber(form.priceMasked));
  const monthlyEquivalentPreview = round2(
    form.billingCycle === "annual"
      ? pricePreview / 12
      : form.billingCycle === "weekly"
        ? (pricePreview * 52) / 12
        : pricePreview,
  );
  const activeSubscriptionsCount = subscriptions.filter((row) => row.active).length;
  const nextChargeDate = subscriptionsSorted.length
    ? computeRecurringSubscriptionMetrics(subscriptionsSorted[0]).nextChargeDate
    : null;

  const handleCreateSubscription = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!userId) return;

    const name = form.name.trim();
    const price = Math.max(0, round2(toNumber(form.priceMasked)));
    const chargeDate = form.chargeDate || new Date().toISOString().slice(0, 10);
    const chargeDateParsed = new Date(`${chargeDate}T12:00:00`);
    const category = inferRecurringSubscriptionCategory(name, form.category.trim() || null);
    const paymentMethod = form.paymentMethod.trim() || null;
    const notes = form.notes.trim() || null;

    if (!name) {
      setFeedback("Informe o nome do servico.");
      return;
    }
    if (price <= 0) {
      setFeedback("Informe um valor maior que zero.");
      return;
    }
    if (Number.isNaN(chargeDateParsed.getTime())) {
      setFeedback("Informe uma data de cobranca valida.");
      return;
    }

    const billingDay = form.billingCycle === "weekly"
      ? chargeDateParsed.getDay()
      : chargeDateParsed.getDate();

    setSaving(true);
    setFeedback(null);

    const payload = {
      user_id: userId,
      name,
      price,
      billing_day: billingDay,
      billing_cycle: form.billingCycle,
      start_date: chargeDate,
      category,
      payment_method: paymentMethod,
      notes,
      last_charge_date: chargeDate,
      active: true,
    };

    const { data, error } = await supabase
      .from("recurring_subscriptions")
      .insert(payload)
      .select("*")
      .single();

    if (error || !data) {
      setSaving(false);
      setFeedback(
        isMissingRecurringSubscriptionsTableError(error?.message)
          ? "Tabela recurring_subscriptions nao encontrada. Rode o supabase.sql atualizado."
          : `Falha ao salvar assinatura: ${error?.message || "erro desconhecido"}`,
      );
      return;
    }

    const insertedSubscription = normalizeRecurringSubscriptionRow(data as Partial<RecurringSubscriptionRow>);
    const externalId = buildRecurringSubscriptionExternalId(insertedSubscription.id, chargeDate);

    const [paymentRes, existingTxRes] = await Promise.all([
      supabase
        .from("recurring_subscription_payments")
        .upsert(
          {
            subscription_id: insertedSubscription.id,
            user_id: userId,
            charge_date: chargeDate,
            amount: price,
            status: "paid",
          },
          { onConflict: "subscription_id,charge_date" },
        )
        .select("*")
        .single(),
      supabase
        .from("transactions")
        .select("id")
        .eq("user_id", userId)
        .eq("external_id", externalId)
        .maybeSingle(),
    ]);

    if (paymentRes.error) {
      setSaving(false);
      setFeedback(`Assinatura salva, mas falhou ao registrar historico: ${paymentRes.error.message}`);
      setSubscriptions((prev) => [insertedSubscription, ...prev]);
      return;
    }

    if (existingTxRes.error) {
      setSaving(false);
      setFeedback(`Assinatura salva, mas falhou ao verificar gasto existente: ${existingTxRes.error.message}`);
      setSubscriptions((prev) => [insertedSubscription, ...prev]);
      const normalizedPayment = normalizeRecurringSubscriptionPaymentRow(
        paymentRes.data as Partial<RecurringSubscriptionPaymentRow>,
      );
      setPayments((prev) => [normalizedPayment, ...prev]);
      return;
    }

    if (!existingTxRes.data?.id) {
      const txRes = await supabase.from("transactions").insert({
        user_id: userId,
        type: "expense",
        occurred_at: chargeDate,
        description: `${insertedSubscription.name} - assinatura`,
        category,
        amount: price,
        account_id: null,
        to_account_id: null,
        card_id: null,
        transaction_type: "despesa",
        tags: ["assinatura", "recorrente", form.billingCycle],
        note: `Cobranca automatica (${cycleLabel[form.billingCycle].toLowerCase()})`,
        external_id: externalId,
      });

      if (txRes.error) {
        setSaving(false);
        setFeedback(`Assinatura salva, mas falhou ao gerar gasto automatico: ${txRes.error.message}`);
        setSubscriptions((prev) => [insertedSubscription, ...prev]);
        const normalizedPayment = normalizeRecurringSubscriptionPaymentRow(
          paymentRes.data as Partial<RecurringSubscriptionPaymentRow>,
        );
        setPayments((prev) => [normalizedPayment, ...prev]);
        return;
      }
    }

    setSaving(false);
    const normalizedPayment = normalizeRecurringSubscriptionPaymentRow(
      paymentRes.data as Partial<RecurringSubscriptionPaymentRow>,
    );
    setSubscriptions((prev) => [insertedSubscription, ...prev]);
    setPayments((prev) => [normalizedPayment, ...prev]);
    setForm((prev) => ({ ...emptyForm(), chargeDate: prev.chargeDate || emptyForm().chargeDate }));
    setFeedback("Assinatura cadastrada com gasto automatico e historico inicial.");
  };

  const handleRegisterPayment = async (row: RecurringSubscriptionRow) => {
    if (!userId || !row.active) return;
    const chargeDate = new Date().toISOString().slice(0, 10);
    const category = inferRecurringSubscriptionCategory(row.name, row.category);
    const externalId = buildRecurringSubscriptionExternalId(row.id, chargeDate);

    setSaving(true);
    setFeedback(null);

    const [paymentRes, updateSubscriptionRes, existingTxRes] = await Promise.all([
      supabase
        .from("recurring_subscription_payments")
        .upsert(
          {
            subscription_id: row.id,
            user_id: userId,
            charge_date: chargeDate,
            amount: row.price,
            status: "paid",
          },
          { onConflict: "subscription_id,charge_date" },
        )
        .select("*")
        .single(),
      supabase
        .from("recurring_subscriptions")
        .update({ last_charge_date: chargeDate })
        .eq("id", row.id)
        .eq("user_id", userId),
      supabase
        .from("transactions")
        .select("id")
        .eq("user_id", userId)
        .eq("external_id", externalId)
        .maybeSingle(),
    ]);

    setSaving(false);

    if (paymentRes.error) {
      setFeedback(`Falha ao registrar pagamento: ${paymentRes.error.message}`);
      return;
    }
    if (updateSubscriptionRes.error) {
      setFeedback(`Pagamento registrado, mas falhou ao atualizar assinatura: ${updateSubscriptionRes.error.message}`);
      return;
    }

    if (existingTxRes.error) {
      setFeedback(`Pagamento registrado, mas falhou ao verificar gasto existente: ${existingTxRes.error.message}`);
      return;
    }

    if (!existingTxRes.data?.id) {
      const txRes = await supabase.from("transactions").insert({
        user_id: userId,
        type: "expense",
        occurred_at: chargeDate,
        description: `${row.name} - assinatura`,
        category,
        amount: row.price,
        account_id: null,
        to_account_id: null,
        card_id: null,
        transaction_type: "despesa",
        tags: ["assinatura", "recorrente", row.billing_cycle],
        note: `Pagamento manual em ${chargeDate}`,
        external_id: externalId,
      });

      if (txRes.error) {
        setFeedback(`Pagamento registrado, mas falhou ao gerar gasto em transacoes: ${txRes.error.message}`);
        return;
      }
    }

    const normalizedPayment = normalizeRecurringSubscriptionPaymentRow(
      paymentRes.data as Partial<RecurringSubscriptionPaymentRow>,
    );
    setPayments((prev) => [
      normalizedPayment,
      ...prev.filter(
        (item) =>
          !(item.subscription_id === normalizedPayment.subscription_id && item.charge_date === normalizedPayment.charge_date),
      ),
    ]);
    setSubscriptions((prev) =>
      prev.map((item) =>
        item.id === row.id
          ? { ...item, last_charge_date: chargeDate, updated_at: new Date().toISOString() }
          : item,
      ),
    );
    setFeedback("Pagamento registrado.");
  };

  const handleMarkUsageToday = async (row: RecurringSubscriptionRow) => {
    if (!userId) return;
    const usageDate = new Date().toISOString().slice(0, 10);

    setSaving(true);
    setFeedback(null);

    const { error } = await supabase
      .from("recurring_subscriptions")
      .update({ last_used_at: usageDate })
      .eq("id", row.id)
      .eq("user_id", userId);

    setSaving(false);

    if (error) {
      setFeedback(`Falha ao atualizar uso: ${error.message}`);
      return;
    }

    setSubscriptions((prev) =>
      prev.map((item) =>
        item.id === row.id ? { ...item, last_used_at: usageDate, updated_at: new Date().toISOString() } : item,
      ),
    );
    setFeedback("Uso atualizado para hoje.");
  };

  const handleToggleActive = async (row: RecurringSubscriptionRow) => {
    if (!userId) return;
    const nextActive = !row.active;

    setSaving(true);
    setFeedback(null);

    const { error } = await supabase
      .from("recurring_subscriptions")
      .update({ active: nextActive })
      .eq("id", row.id)
      .eq("user_id", userId);

    setSaving(false);

    if (error) {
      setFeedback(`Falha ao atualizar assinatura: ${error.message}`);
      return;
    }

    setSubscriptions((prev) =>
      prev.map((item) =>
        item.id === row.id ? { ...item, active: nextActive, updated_at: new Date().toISOString() } : item,
      ),
    );
    setFeedback(nextActive ? "Assinatura reativada." : "Assinatura pausada.");
  };

  const handleDelete = async (row: RecurringSubscriptionRow) => {
    if (!userId) return;
    const confirmed = window.confirm(`Excluir a assinatura "${row.name}"?`);
    if (!confirmed) return;

    setSaving(true);
    setFeedback(null);

    const { error } = await supabase
      .from("recurring_subscriptions")
      .delete()
      .eq("id", row.id)
      .eq("user_id", userId);

    setSaving(false);

    if (error) {
      setFeedback(`Falha ao excluir assinatura: ${error.message}`);
      return;
    }

    setSubscriptions((prev) => prev.filter((item) => item.id !== row.id));
    setPayments((prev) => prev.filter((item) => item.subscription_id !== row.id));
    setFeedback("Assinatura excluida.");
  };

  return (
    <AppShell
      title="Assinaturas"
      subtitle="Controle recorrencias, previsao de gastos e alertas de cobranca"
      contentClassName="assinaturas-premium-bg"
    >
      {loading ? (
        <div className={CARD_CLASS}>Carregando assinaturas...</div>
      ) : (
        <div className={`${inter.className} space-y-6`}>
          <section className="rounded-3xl border border-cyan-200/20 bg-[linear-gradient(140deg,rgba(7,14,30,0.68),rgba(7,11,22,0.78))] p-6 backdrop-blur-xl shadow-[0_24px_56px_rgba(0,0,0,0.45),0_0_30px_rgba(34,211,238,0.12)]">
            <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-cyan-200/70">Total mensal</p>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-4xl font-semibold tracking-tight text-cyan-50 sm:text-[2.7rem]">{brl(summary.monthlyTotal)}</p>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="inline-flex items-center gap-1 rounded-full border border-cyan-300/30 bg-cyan-400/10 px-3.5 py-1.5 text-cyan-100/90 backdrop-blur-md">
                  <Wallet className="h-3.5 w-3.5" />
                  {activeSubscriptionsCount} ativa(s)
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-slate-900/45 px-3.5 py-1.5 text-cyan-100/80 backdrop-blur-md">
                  <CalendarClock className="h-3.5 w-3.5" />
                  Proxima: {formatDate(nextChargeDate)}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-slate-900/45 px-3.5 py-1.5 text-cyan-100/80 backdrop-blur-md">
                  <CreditCard className="h-3.5 w-3.5" />
                  {payments.length} pagamento(s)
                </span>
              </div>
            </div>
          </section>

          <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
            <section className={`${CARD_CLASS} h-fit`}>
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-sm font-medium tracking-wide text-cyan-100/90">Nova assinatura</h2>
                <div className="inline-flex items-center gap-1 rounded-full border border-cyan-300/25 bg-cyan-500/10 px-2.5 py-1 text-[11px] text-cyan-100/90 backdrop-blur-md">
                  <Activity className="h-3.5 w-3.5" />
                  Simples e rapido
                </div>
              </div>

              <form className="space-y-3" onSubmit={(event) => void handleCreateSubscription(event)}>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-cyan-100/80">Nome do servico</span>
                  <input
                    type="text"
                    className={INPUT_CLASS}
                    value={form.name}
                    onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                    placeholder="Ex: Netflix, Spotify, Academia..."
                    maxLength={120}
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-cyan-100/80">Valor</span>
                  <input
                    type="text"
                    className={INPUT_CLASS}
                    value={form.priceMasked}
                    onChange={(event) => setForm((prev) => ({ ...prev, priceMasked: moneyMask(event.target.value) }))}
                    placeholder="0,00"
                    inputMode="decimal"
                  />
                </label>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-cyan-100/80">Data cobranca</span>
                    <input
                      type="date"
                      className={INPUT_CLASS}
                      value={form.chargeDate}
                      onChange={(event) => setForm((prev) => ({ ...prev, chargeDate: event.target.value }))}
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-cyan-100/80">Forma de pagamento</span>
                    <select
                      className={INPUT_CLASS}
                      value={form.paymentMethod}
                      onChange={(event) => setForm((prev) => ({ ...prev, paymentMethod: event.target.value }))}
                    >
                      <option value="cartao">Cartao</option>
                      <option value="conta">Conta</option>
                      <option value="pix">Pix</option>
                      <option value="debito">Debito</option>
                    </select>
                  </label>
                </div>

                <div className="rounded-xl border border-cyan-300/20 bg-[#0b1220]/80 p-3 text-sm">
                  <p className="text-cyan-100/80">Resumo</p>
                  <p className="mt-1 text-lg font-bold text-cyan-50">{brl(monthlyEquivalentPreview)}/mes</p>
                  <p className="mt-1 text-xs text-cyan-100/65">{billingDayLabel(form.billingCycle, form.chargeDate)}</p>
                </div>

                <button
                  type="submit"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-300/35 bg-cyan-500/15 px-4 py-2.5 text-sm font-semibold text-cyan-50 transition hover:bg-cyan-500/25 disabled:opacity-60"
                  disabled={saving}
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Salvar assinatura
                </button>
              </form>
            </section>

            <section className="space-y-4">
              {!subscriptionsSorted.length ? (
                <div className={CARD_CLASS}>
                  <p className="text-sm text-cyan-100/80">Nenhuma assinatura cadastrada ainda.</p>
                </div>
              ) : (
                subscriptionsSorted.map((row) => {
                  const metrics = computeRecurringSubscriptionMetrics(row);
                  const serviceIcon = getServiceIcon(row.name);
                  const chargeDateLabel = formatShortDate(metrics.nextChargeDate);

                  return (
                    <article
                      key={row.id}
                      className="subscription-row-card group p-5"
                    >
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex min-w-0 items-center gap-3.5">
                          <div className="subscription-icon-orb">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={serviceIcon}
                              alt={`Logo ${row.name}`}
                              className="subscription-icon-img"
                              loading="lazy"
                              onError={(event) => {
                                event.currentTarget.src = "/icons/default.png";
                              }}
                            />
                          </div>
                          <div className="min-w-0">
                            <h3 className="truncate text-sm font-medium tracking-wide text-cyan-100/78">{row.name}</h3>
                            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-cyan-100/65">
                              <span className="inline-flex items-center gap-1">
                                <CalendarClock className="h-3.5 w-3.5" />
                                Cobranca: {chargeDateLabel}
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <CreditCard className="h-3.5 w-3.5" />
                                {paymentMethodLabel(row.payment_method)}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="text-left sm:text-right">
                          <p className="subscription-price text-2xl font-semibold tracking-tight sm:text-[1.7rem]">{brl(metrics.monthlyEquivalent)}</p>
                          <p className="mt-0.5 text-[11px] uppercase tracking-[0.14em] text-cyan-100/55">valor mensal</p>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-2 opacity-100 sm:opacity-0 sm:transition sm:duration-200 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-lg border border-emerald-300/35 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-medium text-emerald-100 transition hover:bg-emerald-500/20 disabled:opacity-50"
                          onClick={() => void handleRegisterPayment(row)}
                          disabled={saving || !row.active}
                        >
                          <CreditCard className="h-3.5 w-3.5" />
                          Registrar pagamento
                        </button>
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-lg border border-cyan-300/35 bg-cyan-500/10 px-2.5 py-1.5 text-xs font-medium text-cyan-100 transition hover:bg-cyan-500/20 disabled:opacity-50"
                          onClick={() => void handleMarkUsageToday(row)}
                          disabled={saving}
                        >
                          <Activity className="h-3.5 w-3.5" />
                          Marcar uso hoje
                        </button>
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-lg border border-amber-300/35 bg-amber-500/10 px-2.5 py-1.5 text-xs font-medium text-amber-100 transition hover:bg-amber-500/20 disabled:opacity-50"
                          onClick={() => void handleToggleActive(row)}
                          disabled={saving}
                        >
                          {row.active ? "Pausar" : "Reativar"}
                        </button>
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-lg border border-rose-300/35 bg-rose-500/10 px-2.5 py-1.5 text-xs font-medium text-rose-100 transition hover:bg-rose-500/20 disabled:opacity-50"
                          onClick={() => void handleDelete(row)}
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
