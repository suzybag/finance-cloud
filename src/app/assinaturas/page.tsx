"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Activity,
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Cloud,
  CreditCard,
  Dumbbell,
  Laptop,
  Loader2,
  Music2,
  PlayCircle,
  Plus,
  Repeat2,
  Sparkles,
  Trash2,
  Tv,
  Wallet,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { brl, toNumber } from "@/lib/money";
import { getSubscriptionLogoPath } from "@/lib/customMedia";
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

const INPUT_CLASS =
  "w-full rounded-xl border border-cyan-300/20 bg-[#101622] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition focus:border-cyan-400/70 focus:ring-2 focus:ring-cyan-500/25";

const CARD_CLASS =
  "rounded-2xl border border-cyan-300/20 bg-[linear-gradient(155deg,rgba(13,18,32,0.86),rgba(7,10,19,0.92))] p-4 shadow-[0_18px_40px_rgba(0,0,0,0.35)]";

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

const formatMonthYear = (value?: string | Date | null) => {
  if (!value) return "--";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleDateString("pt-BR", {
    month: "short",
    year: "numeric",
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

const getServiceVisual = (name?: string | null) => {
  const normalized = normalizeText(name);
  const logoSrc = getSubscriptionLogoPath(name);
  if (
    normalized.includes("netflix")
    || normalized.includes("netlix")
    || normalized.includes("netflx")
    || normalized.includes("disney")
    || normalized.includes("hbo")
    || normalized.includes("htbo")
    || normalized.includes("prime video")
  ) {
    return { icon: Tv, tone: "border-rose-300/30 bg-rose-500/10 text-rose-100", logoSrc };
  }
  if (
    normalized.includes("spotify")
    || normalized.includes("deezer")
    || normalized.includes("apple music")
  ) {
    return { icon: Music2, tone: "border-emerald-300/30 bg-emerald-500/10 text-emerald-100", logoSrc };
  }
  if (
    normalized.includes("google drive")
    || normalized.includes("drive")
    || normalized.includes("icloud")
    || normalized.includes("dropbox")
  ) {
    return { icon: Cloud, tone: "border-sky-300/30 bg-sky-500/10 text-sky-100", logoSrc };
  }
  if (normalized.includes("academia") || normalized.includes("gym")) {
    return { icon: Dumbbell, tone: "border-amber-300/30 bg-amber-500/10 text-amber-100", logoSrc };
  }
  if (normalized.includes("youtube")) {
    return { icon: PlayCircle, tone: "border-red-300/30 bg-red-500/10 text-red-100", logoSrc };
  }
  if (normalized.includes("adobe") || normalized.includes("figma") || normalized.includes("notion")) {
    return { icon: Laptop, tone: "border-violet-300/30 bg-violet-500/10 text-violet-100", logoSrc };
  }
  return { icon: Repeat2, tone: "border-cyan-300/30 bg-cyan-500/10 text-cyan-100", logoSrc };
};

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
        if (a.active !== b.active) return Number(b.active) - Number(a.active);
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }),
    [subscriptions],
  );

  const paymentsBySubscription = useMemo(() => {
    const map = new Map<string, RecurringSubscriptionPaymentRow[]>();
    for (const payment of payments) {
      if (!map.has(payment.subscription_id)) map.set(payment.subscription_id, []);
      map.get(payment.subscription_id)?.push(payment);
    }
    return map;
  }, [payments]);

  const pricePreview = Math.max(0, toNumber(form.priceMasked));
  const monthlyEquivalentPreview = round2(
    form.billingCycle === "annual"
      ? pricePreview / 12
      : form.billingCycle === "weekly"
        ? (pricePreview * 52) / 12
        : pricePreview,
  );

  const topMonthlyShares = useMemo(
    () =>
      [...summary.active]
        .sort((a, b) => b.metrics.monthlyEquivalent - a.metrics.monthlyEquivalent)
        .slice(0, 6),
    [summary.active],
  );

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
      contentClassName="parcelas-premium-bg"
    >
      {loading ? (
        <div className={CARD_CLASS}>Carregando assinaturas...</div>
      ) : (
        <div className="space-y-5">
          <section className="grid gap-4 lg:grid-cols-4">
            <article className={CARD_CLASS}>
              <p className="text-xs uppercase tracking-[0.14em] text-cyan-200/60">Total mensal</p>
              <p className="mt-2 text-2xl font-bold text-cyan-50">{brl(summary.monthlyTotal)}</p>
              <p className="mt-1 text-xs text-cyan-100/65">Equivalente mensal das assinaturas ativas</p>
            </article>
            <article className={CARD_CLASS}>
              <p className="text-xs uppercase tracking-[0.14em] text-cyan-200/60">Proximas cobrancas</p>
              <p className="mt-2 text-2xl font-bold text-cyan-50">{summary.upcoming.length}</p>
              <p className="mt-1 text-xs text-cyan-100/65">Vencimentos previstos para os proximos 14 dias</p>
            </article>
            <article className={CARD_CLASS}>
              <p className="text-xs uppercase tracking-[0.14em] text-cyan-200/60">Esquecidas</p>
              <p className="mt-2 text-2xl font-bold text-cyan-50">{summary.underused.length}</p>
              <p className="mt-1 text-xs text-cyan-100/65">Sem uso recente ou sem uso registrado</p>
            </article>
            <article className={CARD_CLASS}>
              <p className="text-xs uppercase tracking-[0.14em] text-cyan-200/60">Previsao 12 meses</p>
              <p className="mt-2 text-2xl font-bold text-cyan-50">{brl(summary.forecast12Months)}</p>
              <p className="mt-1 text-xs text-cyan-100/65">Compromisso estimado em recorrencias</p>
            </article>
          </section>

          <section className="rounded-2xl border border-cyan-300/20 bg-[linear-gradient(140deg,rgba(8,14,28,0.94),rgba(8,11,23,0.96))] p-4 shadow-[0_18px_36px_rgba(0,0,0,0.4)]">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xl font-semibold tracking-tight text-white">Radar de Assinaturas</p>
                <p className="text-xs text-cyan-100/70">
                  Alertas em 3 dias, no dia da cobranca e deteccao de servicos pouco usados.
                </p>
              </div>
              <div className="inline-flex items-center gap-1 rounded-full border border-cyan-300/25 bg-cyan-500/10 px-2.5 py-1 text-[11px] font-semibold text-cyan-100">
                <Sparkles className="h-3.5 w-3.5" />
                Previsao 30 dias: {brl(summary.projected30Days)}
              </div>
            </div>

            {!topMonthlyShares.length ? (
              <p className="text-sm text-cyan-100/80">Cadastre a primeira assinatura para ver distribuicao.</p>
            ) : (
              <div className="grid gap-2 md:grid-cols-2">
                {topMonthlyShares.map((item) => {
                  const share = summary.monthlyTotal > 0
                    ? Math.max(3, Math.min(100, (item.metrics.monthlyEquivalent / summary.monthlyTotal) * 100))
                    : 0;
                  return (
                    <div key={item.row.id} className="rounded-xl border border-cyan-300/20 bg-black/25 p-3">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold text-cyan-50">{item.row.name}</p>
                        <span className="text-xs text-cyan-100/80">{brl(item.metrics.monthlyEquivalent)}/mes</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full border border-cyan-300/20 bg-[#09111d]">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-sky-400 to-blue-400"
                          style={{ width: `${share.toFixed(2)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <div className="grid gap-4 xl:grid-cols-[380px_1fr]">
            <section className={`${CARD_CLASS} h-fit`}>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-cyan-50">Nova assinatura</h2>
                <div className="inline-flex items-center gap-1 rounded-full border border-cyan-300/25 bg-cyan-500/10 px-2.5 py-1 text-[11px] text-cyan-100">
                  <Activity className="h-3.5 w-3.5" />
                  Controle recorrente
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
                    <span className="mb-1 block text-xs font-medium text-cyan-100/80">Tipo de cobranca</span>
                    <select
                      className={INPUT_CLASS}
                      value={form.billingCycle}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, billingCycle: event.target.value as BillingCycle }))
                      }
                    >
                      <option value="monthly">Mensal</option>
                      <option value="annual">Anual</option>
                      <option value="weekly">Semanal</option>
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-cyan-100/80">Data cobranca</span>
                    <input
                      type="date"
                      className={INPUT_CLASS}
                      value={form.chargeDate}
                      onChange={(event) => setForm((prev) => ({ ...prev, chargeDate: event.target.value }))}
                    />
                  </label>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-cyan-100/80">Categoria</span>
                    <input
                      type="text"
                      className={INPUT_CLASS}
                      value={form.category}
                      onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))}
                      placeholder="Streaming, Cloud, Fitness..."
                      maxLength={80}
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

                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-cyan-100/80">Observacao</span>
                  <textarea
                    className={`${INPUT_CLASS} min-h-20 resize-y`}
                    value={form.notes}
                    onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
                    placeholder="Detalhes da assinatura, plano, login..."
                    maxLength={500}
                  />
                </label>

                <div className="rounded-xl border border-cyan-300/20 bg-[#0b1220]/80 p-3 text-sm">
                  <p className="text-cyan-100/80">Resumo automatico</p>
                  <p className="mt-1 text-lg font-bold text-cyan-50">{brl(monthlyEquivalentPreview)}/mes</p>
                  <p className="mt-1 text-xs text-cyan-100/65">
                    {cycleLabel[form.billingCycle]} - {billingDayLabel(form.billingCycle, form.chargeDate)}
                  </p>
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

            <section className="space-y-3">
              {!subscriptionsSorted.length ? (
                <div className={CARD_CLASS}>
                  <p className="text-sm text-cyan-100/80">Nenhuma assinatura cadastrada ainda.</p>
                </div>
              ) : (
                subscriptionsSorted.map((row) => {
                  const metrics = computeRecurringSubscriptionMetrics(row);
                  const history = [...(paymentsBySubscription.get(row.id) || [])]
                    .sort((left, right) => new Date(right.charge_date).getTime() - new Date(left.charge_date).getTime());
                  const paidHistory = history.filter((payment) => payment.status === "paid");
                  const totalSpent = paidHistory.reduce((sum, payment) => sum + payment.amount, 0);
                  const serviceVisual = getServiceVisual(row.name);
                  const Icon = serviceVisual.icon;
                  const monthlyShare = summary.monthlyTotal > 0
                    ? Math.max(0, Math.min(100, (metrics.monthlyEquivalent / summary.monthlyTotal) * 100))
                    : 0;

                  const statusBadge = !row.active
                    ? { className: "border-slate-300/30 bg-slate-500/15 text-slate-100", label: "Pausada", icon: CheckCircle2 }
                    : metrics.isOverdue
                      ? { className: "border-rose-300/35 bg-rose-500/15 text-rose-100", label: `Atrasada ${Math.abs(metrics.daysUntilCurrentDue)} dia(s)`, icon: AlertTriangle }
                      : metrics.isDueToday
                        ? { className: "border-amber-300/35 bg-amber-500/15 text-amber-100", label: "Cobranca hoje", icon: CalendarClock }
                        : metrics.isDueSoon
                          ? { className: "border-amber-300/35 bg-amber-500/15 text-amber-100", label: `Vence em ${metrics.daysUntilCurrentDue} dia(s)`, icon: CalendarClock }
                          : metrics.isCurrentCyclePaid
                            ? { className: "border-emerald-300/35 bg-emerald-500/15 text-emerald-100", label: "Pago neste ciclo", icon: CheckCircle2 }
                            : { className: "border-cyan-300/35 bg-cyan-500/15 text-cyan-100", label: `Proxima em ${metrics.daysUntilCharge} dia(s)`, icon: CalendarClock };

                  const StatusIcon = statusBadge.icon;

                  return (
                    <article
                      key={row.id}
                      className="rounded-2xl border border-cyan-300/20 bg-[linear-gradient(145deg,rgba(8,13,25,0.9),rgba(10,18,32,0.86))] p-4 shadow-[0_16px_34px_rgba(0,0,0,0.35)]"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-3">
                          <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border ${serviceVisual.tone}`}>
                            {serviceVisual.logoSrc ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={serviceVisual.logoSrc}
                                alt=""
                                className="h-6 w-6 rounded object-contain"
                                loading="lazy"
                              />
                            ) : (
                              <Icon className="h-5 w-5" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <h3 className="truncate text-base font-semibold text-cyan-50">{row.name}</h3>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-cyan-100/70">
                              <span className="inline-flex items-center gap-1">
                                <Wallet className="h-3.5 w-3.5" />
                                {brl(row.price)} / {cycleLabel[row.billing_cycle].toLowerCase()}
                              </span>
                              {row.category ? (
                                <span className="rounded-full border border-cyan-300/25 bg-cyan-500/10 px-2 py-0.5">
                                  {row.category}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>

                        <div className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${statusBadge.className}`}>
                          <StatusIcon className="h-3.5 w-3.5" />
                          {statusBadge.label}
                        </div>
                      </div>

                      <div className="mt-4 grid gap-2 text-xs text-cyan-100/75 sm:grid-cols-4">
                        <div className="rounded-lg border border-cyan-300/15 bg-black/25 px-3 py-2">
                          <p className="text-cyan-100/55">Equivalente mensal</p>
                          <p className="mt-0.5 font-semibold text-cyan-50">{brl(metrics.monthlyEquivalent)}</p>
                        </div>
                        <div className="rounded-lg border border-cyan-300/15 bg-black/25 px-3 py-2">
                          <p className="text-cyan-100/55">Proxima cobranca</p>
                          <p className="mt-0.5 font-semibold text-cyan-50">{formatShortDate(metrics.nextChargeDate)}</p>
                        </div>
                        <div className="rounded-lg border border-cyan-300/15 bg-black/25 px-3 py-2">
                          <p className="text-cyan-100/55">Pagamento</p>
                          <p className="mt-0.5 font-semibold text-cyan-50">{paymentMethodLabel(row.payment_method)}</p>
                        </div>
                        <div className="rounded-lg border border-cyan-300/15 bg-black/25 px-3 py-2">
                          <p className="text-cyan-100/55">Ultimo uso</p>
                          <p className="mt-0.5 font-semibold text-cyan-50">{formatDate(row.last_used_at)}</p>
                        </div>
                      </div>

                      <div className="mt-3">
                        <div className="mb-2 flex items-center justify-between text-xs text-cyan-100/75">
                          <span>Peso no total mensal</span>
                          <span>{monthlyShare.toFixed(1).replace(".", ",")}%</span>
                        </div>
                        <div className="h-2.5 overflow-hidden rounded-full border border-cyan-300/20 bg-[#09111d]">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-sky-400 to-blue-400 transition-[width] duration-700"
                            style={{ width: `${monthlyShare.toFixed(2)}%` }}
                          />
                        </div>
                      </div>

                      {metrics.isUnderused ? (
                        <p className="mt-3 rounded-lg border border-amber-300/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                          Assinatura possivelmente esquecida. Ultimo uso: {formatDate(row.last_used_at)}.
                        </p>
                      ) : null}

                      <div className="mt-3 rounded-lg border border-cyan-300/15 bg-black/20 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-medium text-cyan-100/85">Extrato de renovacoes</p>
                          <span className="text-[11px] text-cyan-100/65">{paidHistory.length} pagamento(s)</span>
                        </div>
                        <div className="mt-2 grid gap-2 text-xs text-cyan-100/75 sm:grid-cols-2">
                          <div className="rounded-md border border-cyan-300/15 bg-black/30 px-2.5 py-1.5">
                            <p className="text-cyan-100/55">Total acumulado</p>
                            <p className="font-semibold text-cyan-50">{brl(totalSpent)}</p>
                          </div>
                          <div className="rounded-md border border-cyan-300/15 bg-black/30 px-2.5 py-1.5">
                            <p className="text-cyan-100/55">Ultima renovacao</p>
                            <p className="font-semibold text-cyan-50">{history[0] ? formatDate(history[0].charge_date) : "--"}</p>
                          </div>
                        </div>
                        {!history.length ? (
                          <p className="mt-1 text-xs text-cyan-100/65">Sem pagamentos registrados.</p>
                        ) : (
                          <div className="mt-2 max-h-44 space-y-1.5 overflow-y-auto pr-1">
                            {history.map((payment) => (
                              <div key={payment.id} className="flex items-center justify-between gap-2 text-xs text-cyan-100/75">
                                <div className="min-w-0">
                                  <p className="truncate font-medium text-cyan-50">{formatMonthYear(payment.charge_date)}</p>
                                  <p className="text-[11px] text-cyan-100/60">{formatDate(payment.charge_date)}</p>
                                </div>
                                <span className="font-medium text-cyan-50">{brl(payment.amount)}</span>
                                <span className="uppercase tracking-wide">{payment.status}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-lg border border-emerald-300/35 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/20 disabled:opacity-50"
                          onClick={() => void handleRegisterPayment(row)}
                          disabled={saving || !row.active}
                        >
                          <CreditCard className="h-3.5 w-3.5" />
                          Registrar pagamento
                        </button>
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-lg border border-cyan-300/35 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-100 hover:bg-cyan-500/20 disabled:opacity-50"
                          onClick={() => void handleMarkUsageToday(row)}
                          disabled={saving}
                        >
                          <Activity className="h-3.5 w-3.5" />
                          Marcar uso hoje
                        </button>
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-lg border border-amber-300/35 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-100 hover:bg-amber-500/20 disabled:opacity-50"
                          onClick={() => void handleToggleActive(row)}
                          disabled={saving}
                        >
                          {row.active ? "Pausar" : "Reativar"}
                        </button>
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-lg border border-rose-300/35 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-100 hover:bg-rose-500/20 disabled:opacity-50"
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
