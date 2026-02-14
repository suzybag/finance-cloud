"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Archive,
  Calendar,
  CreditCard,
  Pencil,
  ShieldCheck,
  Sparkles,
  Trash2,
  TriangleAlert,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { BankLogo } from "@/components/BankLogo";
import { Bank3DCardVisual, StyledBankKey } from "@/components/Bank3DCardVisual";
import { PicPayCardVisual } from "@/components/PicPayCardVisual";
import { supabase } from "@/lib/supabaseClient";
import { getBankIconPath, resolveBankKey } from "@/lib/bankIcons";
import { brl, toNumber } from "@/lib/money";
import { Account, Card, Transaction, computeCardSummary } from "@/lib/finance";
import { useBankRelationship } from "@/ui/dashboard/useBankRelationship";

const BANK_ISSUER_OPTIONS = [
  "Nubank Ultravioleta",
  "Nu Invest",
  "Inter",
  "Bradesco",
  "Mercado Pago",
  "XP Investimentos",
  "PicPay",
  "Santander",
  "Caixa",
  "Banco do Brasil",
  "Wise",
  "Nomad",
  "C6 Bank",
  "BTG",
] as const;

const CARD_COLOR_OPTIONS = [
  "#14b8a6",
  "#3b82f6",
  "#8b5cf6",
  "#f59e0b",
  "#ec4899",
  "#06b6d4",
  "#f43f5e",
  "#6366f1",
  "#22c55e",
  "#94a3b8",
] as const;

const normalizeText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const inferIssuer = (value?: string | null) => {
  const text = normalizeText(value ?? "");
  if (!text) return null;
  if (text.includes("nubank") || text.includes("roxinho") || text.includes("ultravioleta")) return "Nubank Ultravioleta";
  if (text.includes("inter") || text.includes("bancointer")) return "Inter";
  if (text.includes("bradesco")) return "Bradesco";
  if (text.includes("nuinvest") || text.includes("nuinvestimentos") || text.includes("easynvest")) return "Nu Invest";
  if (text.includes("picpay")) return "PicPay";
  if (text.includes("santander")) return "Santander";
  if (text.includes("caixa") || text.includes("caixaeconomicafederal")) return "Caixa";
  if (text.includes("bancodobrasil") || text === "bb") return "Banco do Brasil";
  if (text.includes("wise") || text.includes("transferwise")) return "Wise";
  if (text.includes("nomad")) return "Nomad";
  if (text.includes("c6") || text.includes("c6bank")) return "C6 Bank";
  if (text.includes("mercadopago") || text.includes("mercadopag")) return "Mercado Pago";
  if (text.includes("btg") || text.includes("btgpactual")) return "BTG";
  if (text.includes("xp") || text.includes("xpinvestimentos")) return "XP Investimentos";
  return null;
};

const resolveIssuerLabel = (issuer?: string | null, name?: string | null) => {
  const explicitIssuer = issuer?.trim();
  if (explicitIssuer) {
    return inferIssuer(explicitIssuer) || explicitIssuer;
  }
  return (inferIssuer(name) || "").trim();
};

const CARD_INPUT_CLASS =
  "w-full rounded-xl border border-violet-300/20 bg-[#181126] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition focus:border-violet-400/70 focus:ring-2 focus:ring-violet-500/20";

const PRIMARY_BUTTON_CLASS =
  "rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 py-2 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(139,92,246,0.35)] transition hover:brightness-110 disabled:opacity-60";

const SOFT_BUTTON_CLASS =
  "rounded-xl border border-violet-300/20 bg-violet-950/35 px-3 py-2 text-xs font-semibold text-slate-100 transition hover:bg-violet-900/35";

const ULTRA_SECTION_CLASS =
  "rounded-2xl border border-violet-300/20 bg-[linear-gradient(160deg,rgba(34,18,61,0.76),rgba(12,9,31,0.86))] shadow-[0_18px_46px_rgba(76,29,149,0.28)] backdrop-blur-xl";

const STYLED_BANK_KEYS: StyledBankKey[] = [
  "nubank",
  "bradesco",
  "inter",
  "mercadopago",
  "xp",
  "btg",
  "santander",
  "caixa",
  "c6bank",
  "wise",
  "nomad",
  "bancodobrasil",
];

const isValidCycleDay = (value: number) =>
  Number.isInteger(value) && value >= 1 && value <= 31;

const isMissingCardsStyleColumnError = (message?: string | null) =>
  /could not find the '(color|note)' column of 'cards' in the schema cache/i.test(message ?? "");

const riskBadgeClass = (level: "excelente" | "bom" | "atencao" | "alto_risco") => {
  if (level === "excelente") return "border-emerald-400/40 bg-emerald-500/15 text-emerald-200";
  if (level === "bom") return "border-cyan-400/40 bg-cyan-500/15 text-cyan-200";
  if (level === "atencao") return "border-amber-400/40 bg-amber-500/15 text-amber-200";
  return "border-rose-400/40 bg-rose-500/15 text-rose-200";
};

const pillarMeta: Array<{
  key: "punctuality" | "limitUsage" | "investments" | "history" | "spendingControl";
  label: string;
}> = [
  { key: "punctuality", label: "Pontualidade" },
  { key: "limitUsage", label: "Uso do limite" },
  { key: "investments", label: "Investimentos" },
  { key: "history", label: "Historico financeiro" },
  { key: "spendingControl", label: "Controle de gastos" },
];

const formatShortDate = (value: string) => {
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
};

export default function CardsPage() {
  const [cards, setCards] = useState<Card[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [issuer, setIssuer] = useState("");
  const [limitTotal, setLimitTotal] = useState("");
  const [closingDay, setClosingDay] = useState("10");
  const [dueDay, setDueDay] = useState("17");
  const [cardColor, setCardColor] = useState<string>(CARD_COLOR_OPTIONS[0]);
  const [cardNote, setCardNote] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [editId, setEditId] = useState<string | null>(null);
  const [tab, setTab] = useState<"active" | "archived">("active");
  const [busyCardId, setBusyCardId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [supportsCardStyleFields, setSupportsCardStyleFields] = useState(true);

  const [paymentCard, setPaymentCard] = useState("");
  const [paymentAccount, setPaymentAccount] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
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

  const loadData = async (resolvedUserId?: string | null) => {
    try {
      setLoading(true);
      const effectiveUserId = resolvedUserId || (await ensureUserId());
      if (!effectiveUserId) {
        setLoading(false);
        return;
      }

      const [cardsRes, txRes, accountsRes] = await Promise.all([
        supabase
          .from("cards")
          .select("*")
          .eq("user_id", effectiveUserId)
          .order("created_at"),
        supabase
          .from("transactions")
          .select("*")
          .eq("user_id", effectiveUserId)
          .order("occurred_at", { ascending: false })
          .limit(500),
        supabase
          .from("accounts")
          .select("*")
          .eq("user_id", effectiveUserId)
          .order("created_at"),
      ]);

      if (cardsRes.error || txRes.error || accountsRes.error) {
        setFeedback(cardsRes.error?.message || txRes.error?.message || accountsRes.error?.message || "Falha ao carregar dados.");
        setLoading(false);
        return;
      }

      setCards((cardsRes.data as Card[]) || []);
      setTransactions((txRes.data as Transaction[]) || []);
      setAccounts((accountsRes.data as Account[]) || []);
      setLoading(false);
    } catch (error) {
      setLoading(false);
      setFeedback(`Falha inesperada ao carregar cartoes: ${error instanceof Error ? error.message : "erro desconhecido"}`);
    }
  };

  useEffect(() => {
    void (async () => {
      const resolvedUserId = await ensureUserId();
      await loadData(resolvedUserId);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetForm = () => {
    setEditId(null);
    setName("");
    setIssuer("");
    setLimitTotal("");
    setClosingDay("10");
    setDueDay("17");
    setCardColor(CARD_COLOR_OPTIONS[0]);
    setCardNote("");
  };

  const prepareModalViewport = () => {
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "auto" });
    }
  };

  const openCreateModal = () => {
    resetForm();
    prepareModalViewport();
    setIsFormOpen(true);
  };

  const ensureUserId = async () => {
    if (userId) return userId;

    const sessionRes = await supabase.auth.getSession();
    const fromSession = sessionRes.data.session?.user?.id ?? null;
    if (fromSession) {
      setUserId(fromSession);
      return fromSession;
    }

    const { data, error } = await supabase.auth.getUser();
    if (error) {
      setFeedback(`Nao foi possivel validar sessao: ${error.message}`);
      return null;
    }

    const resolvedUserId = data.user?.id ?? null;
    setUserId(resolvedUserId);

    if (!resolvedUserId) {
      setFeedback("Sessao nao carregada. Entre novamente e tente criar o cartao.");
      return null;
    }

    return resolvedUserId;
  };

  const handleCreate = async () => {
    try {
      if (!name.trim()) return;
      setSaving(true);
      setFeedback(null);
      const resolvedUserId = await ensureUserId();
      if (!resolvedUserId) {
        setSaving(false);
        return;
      }

      const closingDayValue = Number(closingDay);
      const dueDayValue = Number(dueDay);
      if (!isValidCycleDay(closingDayValue) || !isValidCycleDay(dueDayValue)) {
        setSaving(false);
        setFeedback("Fechamento e vencimento devem estar entre 1 e 31.");
        return;
      }

      const issuerToSave = resolveIssuerLabel(issuer, name);
      const basePayload = {
        user_id: resolvedUserId,
        name: name.trim(),
        issuer: issuerToSave || null,
        limit_total: toNumber(limitTotal),
        closing_day: closingDayValue,
        due_day: dueDayValue,
      };
      const styledPayload = {
        ...basePayload,
        color: cardColor,
        note: cardNote.trim() ? cardNote.trim() : null,
      };

      let usedFallback = !supportsCardStyleFields;
      const createRes = supportsCardStyleFields
        ? await supabase.from("cards").insert(styledPayload)
        : await supabase.from("cards").insert(basePayload);

      let error = createRes.error;
      if (error && supportsCardStyleFields && isMissingCardsStyleColumnError(error.message)) {
        setSupportsCardStyleFields(false);
        usedFallback = true;
        const retryRes = await supabase.from("cards").insert(basePayload);
        error = retryRes.error;
      }

      if (error) {
        setSaving(false);
        setFeedback(`Nao foi possivel criar: ${error.message}`);
        return;
      }

      setSaving(false);
      setIsFormOpen(false);
      setFeedback(
        usedFallback
          ? "Cartao criado. Cor e observacao ficam indisponiveis ate atualizar o banco."
          : "Cartao criado com sucesso.",
      );
      resetForm();
      await loadData(resolvedUserId);
    } catch (error) {
      setSaving(false);
      setFeedback(`Falha inesperada ao criar cartao: ${error instanceof Error ? error.message : "erro desconhecido"}`);
    }
  };

  const handleArchive = async (card: Card) => {
    try {
      setFeedback(null);
      const resolvedUserId = await ensureUserId();
      if (!resolvedUserId) return;

      setBusyCardId(card.id);
      const { data, error } = await supabase
        .from("cards")
        .update({ archived: !card.archived })
        .eq("id", card.id)
        .eq("user_id", resolvedUserId)
        .select("id")
        .maybeSingle();
      setBusyCardId(null);
      if (error) {
        setFeedback(`Nao foi possivel alterar arquivo: ${error.message}`);
        return;
      }
      if (!data) {
        setFeedback("Cartao nao encontrado para arquivar.");
        return;
      }
      await loadData(resolvedUserId);
    } catch (error) {
      setBusyCardId(null);
      setFeedback(`Falha inesperada ao arquivar cartao: ${error instanceof Error ? error.message : "erro desconhecido"}`);
    }
  };

  const handleDelete = async (card: Card) => {
    try {
      setFeedback(null);
      const ok = window.confirm(
        `Excluir o cartao "${card.name}"? Essa acao nao pode ser desfeita.`,
      );
      if (!ok) return;
      const resolvedUserId = await ensureUserId();
      if (!resolvedUserId) return;

      setBusyCardId(card.id);
      const { data, error } = await supabase
        .from("cards")
        .delete()
        .eq("id", card.id)
        .eq("user_id", resolvedUserId)
        .select("id")
        .maybeSingle();
      setBusyCardId(null);

      if (error) {
        setFeedback(`Nao foi possivel excluir: ${error.message}`);
        return;
      }
      if (!data) {
        setFeedback("Cartao nao encontrado para exclusao.");
        return;
      }

      if (editId === card.id) {
        resetForm();
        setIsFormOpen(false);
      }

      setFeedback("Cartao excluido com sucesso.");
      await loadData(resolvedUserId);
    } catch (error) {
      setBusyCardId(null);
      setFeedback(`Falha inesperada ao excluir cartao: ${error instanceof Error ? error.message : "erro desconhecido"}`);
    }
  };

  const handleEdit = (card: Card) => {
    setEditId(card.id);
    setName(card.name);
    setIssuer(card.issuer ?? "");
    setLimitTotal(String(card.limit_total));
    setClosingDay(String(card.closing_day));
    setDueDay(String(card.due_day));
    setCardColor(card.color || CARD_COLOR_OPTIONS[0]);
    setCardNote(card.note || "");
    prepareModalViewport();
    setIsFormOpen(true);
  };

  const handleSaveEdit = async () => {
    try {
      if (!editId || !name.trim()) return;
      const resolvedUserId = await ensureUserId();
      if (!resolvedUserId) return;

      setSaving(true);
      setFeedback(null);

      const closingDayValue = Number(closingDay);
      const dueDayValue = Number(dueDay);
      if (!isValidCycleDay(closingDayValue) || !isValidCycleDay(dueDayValue)) {
        setSaving(false);
        setFeedback("Fechamento e vencimento devem estar entre 1 e 31.");
        return;
      }

      const issuerToSave = resolveIssuerLabel(issuer, name);
      const basePayload = {
        name: name.trim(),
        issuer: issuerToSave || null,
        limit_total: toNumber(limitTotal),
        closing_day: closingDayValue,
        due_day: dueDayValue,
      };
      const styledPayload = {
        ...basePayload,
        color: cardColor,
        note: cardNote.trim() ? cardNote.trim() : null,
      };

      let usedFallback = !supportsCardStyleFields;
      const saveRes = supportsCardStyleFields
        ? await supabase
          .from("cards")
          .update(styledPayload)
          .eq("id", editId)
          .eq("user_id", resolvedUserId)
          .select("id")
        : await supabase
          .from("cards")
          .update(basePayload)
          .eq("id", editId)
          .eq("user_id", resolvedUserId)
          .select("id");

      let error = saveRes.error;
      let updatedRows = (saveRes.data ?? []).length;
      if (error && supportsCardStyleFields && isMissingCardsStyleColumnError(error.message)) {
        setSupportsCardStyleFields(false);
        usedFallback = true;
        const retryRes = await supabase
          .from("cards")
          .update(basePayload)
          .eq("id", editId)
          .eq("user_id", resolvedUserId)
          .select("id");
        error = retryRes.error;
        updatedRows = (retryRes.data ?? []).length;
      }

      if (error) {
        setSaving(false);
        setFeedback(`Nao foi possivel salvar: ${error.message}`);
        return;
      }
      if (!updatedRows) {
        setSaving(false);
        setFeedback("Cartao nao encontrado para edicao.");
        return;
      }

      setSaving(false);
      setIsFormOpen(false);
      setFeedback(
        usedFallback
          ? "Cartao atualizado. Cor e observacao ficam indisponiveis ate atualizar o banco."
          : "Cartao atualizado com sucesso.",
      );
      resetForm();
      await loadData(resolvedUserId);
    } catch (error) {
      setSaving(false);
      setFeedback(`Falha inesperada ao editar cartao: ${error instanceof Error ? error.message : "erro desconhecido"}`);
    }
  };

  const handleSetBank = async (card: Card) => {
    try {
      const resolvedUserId = await ensureUserId();
      if (!resolvedUserId) return;

      const current = resolveIssuerLabel(card.issuer, card.name) || "";
      const next = window.prompt(
        `Informe o banco (${BANK_ISSUER_OPTIONS.join(", ")}):`,
        current,
      );
      if (!next) return;

      const normalized = resolveIssuerLabel(next, card.name);
      if (!normalized) return;

      const { data, error } = await supabase
        .from("cards")
        .update({ issuer: normalized })
        .eq("id", card.id)
        .eq("user_id", resolvedUserId)
        .select("id")
        .maybeSingle();
      if (error) {
        setFeedback(`Nao foi possivel definir banco: ${error.message}`);
        return;
      }
      if (!data) {
        setFeedback("Cartao nao encontrado para definir banco.");
        return;
      }

      await loadData(resolvedUserId);
    } catch (error) {
      setFeedback(`Falha inesperada ao definir banco: ${error instanceof Error ? error.message : "erro desconhecido"}`);
    }
  };

  const handlePayment = async () => {
    try {
      if (!paymentCard || !paymentAccount || !paymentAmount.trim()) {
        setFeedback("Selecione cartao, conta e valor do pagamento.");
        return;
      }
      setFeedback(null);
      const resolvedUserId = await ensureUserId();
      if (!resolvedUserId) return;

      const { error } = await supabase.from("transactions").insert({
        user_id: resolvedUserId,
        type: "card_payment",
        description: "Pagamento de fatura",
        category: "Cartao",
        amount: toNumber(paymentAmount),
        account_id: paymentAccount,
        card_id: paymentCard,
        occurred_at: new Date().toISOString().slice(0, 10),
      });
      if (error) {
        setFeedback(`Nao foi possivel registrar pagamento: ${error.message}`);
        return;
      }

      setPaymentAmount("");
      setFeedback("Pagamento registrado com sucesso.");
      await loadData(resolvedUserId);
    } catch (error) {
      setFeedback(`Falha inesperada ao registrar pagamento: ${error instanceof Error ? error.message : "erro desconhecido"}`);
    }
  };

  const cardSummaries = useMemo(
    () =>
      cards
        .filter((card) => (tab === "archived" ? card.archived : !card.archived))
        .map((card) => ({ card, summary: computeCardSummary(card, transactions) })),
    [cards, transactions, tab],
  );

  return (
    <AppShell
      title="Cartoes"
      subtitle="Controle limites e faturas com visual ultravioleta"
      contentClassName="cards-ultra-bg"
    >
      {loading ? (
        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/50 p-6 text-slate-300">
          Carregando...
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {feedback ? (
            <div className="rounded-xl border border-violet-300/25 bg-violet-950/35 px-4 py-3 text-sm text-violet-100">
              {feedback}
            </div>
          ) : null}

          {relationshipWarnings.length ? (
            <div className="rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              {relationshipWarnings.join(" | ")}
            </div>
          ) : null}

          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <article className={`${ULTRA_SECTION_CLASS} p-5`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="inline-flex items-center gap-2 text-lg font-bold text-white">
                    <ShieldCheck className="h-5 w-5 text-cyan-300" />
                    Score Relacionamento Bancario
                  </h2>
                  <p className="text-xs text-slate-400">
                    Saude financeira para melhorar score e confianca de credito.
                  </p>
                </div>
                <button
                  type="button"
                  className="rounded-lg border border-white/15 bg-black/30 px-3 py-1.5 text-xs font-semibold text-slate-100 hover:bg-black/45"
                  onClick={() => void refreshRelationship()}
                >
                  Atualizar
                </button>
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
                  <div className="mt-4 flex flex-wrap items-end gap-4">
                    <div className="flex items-end gap-2">
                      <p className="text-5xl font-black text-white">{relationshipSummary.score}</p>
                      <p className="pb-1 text-sm text-slate-400">/100</p>
                    </div>
                    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${riskBadgeClass(relationshipSummary.riskLevel)}`}>
                      {relationshipSummary.riskLabel}
                    </span>
                    <span className="text-xs text-slate-400">
                      {relationshipSummary.deltaScore === null
                        ? "Sem base anterior"
                        : `Variacao: ${relationshipSummary.deltaScore > 0 ? "+" : ""}${relationshipSummary.deltaScore} ponto(s)`}
                    </span>
                  </div>

                  <div className="mt-4 space-y-2">
                    {pillarMeta.map((pillar) => {
                      const score = relationshipSummary.pillars[pillar.key];
                      return (
                        <div key={pillar.key}>
                          <div className="mb-1 flex items-center justify-between text-xs">
                            <span className="text-slate-300">{pillar.label}</span>
                            <span className="font-semibold text-slate-100">{score}</span>
                          </div>
                          <div className="h-2 rounded-full bg-slate-900">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-violet-500"
                              style={{ width: `${score}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
                      <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Uso de limite</p>
                      <p className="text-sm font-semibold text-slate-100">
                        {relationshipSummary.indicators.cardLimitUtilizationPct.toFixed(1).replace(".", ",")}%
                      </p>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
                      <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Pontualidade</p>
                      <p className="text-sm font-semibold text-slate-100">
                        {relationshipSummary.indicators.onTimePaymentRate.toFixed(1).replace(".", ",")}%
                      </p>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
                      <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Investimentos ativos</p>
                      <p className="text-sm font-semibold text-slate-100">
                        {relationshipSummary.indicators.activeInvestments}
                      </p>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
                      <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Poupanca no mes</p>
                      <p className="text-sm font-semibold text-slate-100">
                        {relationshipSummary.indicators.savingsRatePct === null
                          ? "-"
                          : `${relationshipSummary.indicators.savingsRatePct.toFixed(1).replace(".", ",")}%`}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 rounded-xl border border-white/10 bg-black/25 px-3 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Historico recente</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {relationshipHistory.slice(0, 8).map((item) => (
                        <div key={`${item.reference_date}-${item.score}`} className="rounded-lg border border-white/10 bg-slate-900/50 px-2 py-1 text-xs text-slate-200">
                          {formatShortDate(item.reference_date)}: <span className="font-semibold">{item.score}</span>
                        </div>
                      ))}
                      {!relationshipHistory.length ? (
                        <span className="text-xs text-slate-400">Sem historico ainda.</span>
                      ) : null}
                    </div>
                  </div>
                </>
              ) : null}
            </article>

            <article className={`${ULTRA_SECTION_CLASS} p-5`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="inline-flex items-center gap-2 text-lg font-bold text-white">
                    <Sparkles className="h-5 w-5 text-violet-300" />
                    Alertas e Recomendacoes
                  </h2>
                  <p className="text-xs text-slate-400">
                    Acoes praticas para melhorar score bancario e evitar riscos.
                  </p>
                </div>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-lg border border-violet-400/30 bg-violet-500/15 px-3 py-1.5 text-xs font-semibold text-violet-100 hover:bg-violet-500/25 disabled:opacity-60"
                  onClick={() => void runAssessment()}
                  disabled={relationshipRunning || relationshipLoading}
                >
                  {relationshipRunning ? "Recalculando..." : "Recalcular"}
                </button>
              </div>

              {relationshipSummary?.riskAlerts.length ? (
                <div className="mt-4 space-y-2">
                  {relationshipSummary.riskAlerts.slice(0, 4).map((risk) => (
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
                <div className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-3 text-sm text-emerald-100">
                  Nenhum risco critico detectado no momento.
                </div>
              )}

              <div className="mt-4 space-y-2">
                {(relationshipSummary?.recommendations || []).slice(0, 4).map((tip) => (
                  <div key={`tip-${tip.slice(0, 24)}`} className="rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-100">
                    {tip}
                  </div>
                ))}
                {(relationshipSummary?.aiRecommendations || []).slice(0, 3).map((tip) => (
                  <div key={`ai-${tip.slice(0, 24)}`} className="rounded-xl border border-violet-400/30 bg-violet-500/10 px-3 py-2 text-sm text-violet-100">
                    {tip}
                  </div>
                ))}
              </div>

              {relationshipSummary ? (
                <div className="mt-4 grid gap-2 sm:grid-cols-2 text-xs">
                  <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-slate-300">
                    <p className="text-slate-400">Despesa atual</p>
                    <p className="font-semibold text-slate-100">{brl(relationshipSummary.indicators.expenseCurrentMonth)}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-slate-300">
                    <p className="text-slate-400">Receita atual</p>
                    <p className="font-semibold text-slate-100">{brl(relationshipSummary.indicators.incomeCurrentMonth)}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-slate-300">
                    <p className="text-slate-400">Delta de gastos</p>
                    <p className="font-semibold text-slate-100">
                      {relationshipSummary.indicators.expenseDeltaPct === null
                        ? "-"
                        : `${relationshipSummary.indicators.expenseDeltaPct > 0 ? "+" : ""}${relationshipSummary.indicators.expenseDeltaPct.toFixed(1).replace(".", ",")}%`}
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-slate-300">
                    <p className="text-slate-400">Status do score</p>
                    <p className="inline-flex items-center gap-1 font-semibold text-slate-100">
                      {relationshipSummary.deltaScore !== null && relationshipSummary.deltaScore < 0 ? (
                        <TrendingDown className="h-3.5 w-3.5 text-rose-300" />
                      ) : (
                        <TrendingUp className="h-3.5 w-3.5 text-emerald-300" />
                      )}
                      {relationshipSummary.deltaScore === null
                        ? "Sem comparacao"
                        : `${relationshipSummary.deltaScore > 0 ? "+" : ""}${relationshipSummary.deltaScore}`}
                    </p>
                  </div>
                </div>
              ) : null}
            </article>
          </section>

          <section className={`${ULTRA_SECTION_CLASS} p-6`}>
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-xl font-extrabold tracking-tight text-violet-100">Novo cartao</h2>
                <p className="mt-1 text-sm text-violet-200/75">
                  Abra o formulario completo para cadastrar ou editar seu cartao.
                </p>
              </div>
              <button
                type="button"
                className={PRIMARY_BUTTON_CLASS}
                onClick={openCreateModal}
              >
                Criar cartao
              </button>
            </div>
          </section>

          {isFormOpen ? (
            <div
              className="fixed inset-0 z-[120] overflow-y-auto p-4 backdrop-blur-sm"
              style={{ backgroundColor: "rgba(6, 4, 13, 0.82)" }}
            >
              <div className="flex min-h-full items-start justify-center py-6 sm:items-center">
                <div className="w-full max-w-xl rounded-2xl border border-violet-300/20 bg-[linear-gradient(170deg,rgba(31,17,56,0.96),rgba(14,10,31,0.97))] p-5 shadow-[0_20px_60px_rgba(76,29,149,0.45)]">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-extrabold tracking-tight text-violet-100">
                    {editId ? "Editar cartao" : "Novo cartao"}
                  </h3>
                  <button
                    type="button"
                    className="rounded-lg border border-violet-300/20 px-2 py-1 text-sm text-violet-100 hover:bg-violet-500/15"
                    onClick={() => {
                      setIsFormOpen(false);
                      resetForm();
                    }}
                  >
                    X
                  </button>
                </div>

                <div className="mt-4 grid gap-3">
                  <div>
                    <p className="mb-1 text-sm font-semibold text-violet-100">Nome do cartao</p>
                    <input
                      className={CARD_INPUT_CLASS}
                      placeholder="Ex: Nubank Ultravioleta"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                    />
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <p className="mb-1 text-sm font-semibold text-violet-100">Banco</p>
                      <input
                        className={CARD_INPUT_CLASS}
                        placeholder="Ex: Nubank Ultravioleta, Itau"
                        value={issuer}
                        onChange={(event) => setIssuer(event.target.value)}
                      />
                    </div>
                    <div>
                      <p className="mb-1 text-sm font-semibold text-violet-100">Selecionar banco rapido</p>
                      <select
                        className={CARD_INPUT_CLASS}
                        value=""
                        onChange={(event) => {
                          if (event.target.value) setIssuer(event.target.value);
                        }}
                      >
                        <option value="">Escolha um banco</option>
                        {BANK_ISSUER_OPTIONS.map((bank) => (
                          <option key={bank} value={bank}>
                            {bank}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-3">
                    <div>
                      <p className="mb-1 text-sm font-semibold text-violet-100">Limite total (R$)</p>
                      <input
                        className={CARD_INPUT_CLASS}
                        placeholder="0,00"
                        value={limitTotal}
                        onChange={(event) => setLimitTotal(event.target.value)}
                      />
                    </div>
                    <div>
                      <p className="mb-1 text-sm font-semibold text-violet-100">Fechamento</p>
                      <input
                        className={CARD_INPUT_CLASS}
                        placeholder="10"
                        value={closingDay}
                        onChange={(event) => setClosingDay(event.target.value)}
                      />
                    </div>
                    <div>
                      <p className="mb-1 text-sm font-semibold text-violet-100">Vencimento</p>
                      <input
                        className={CARD_INPUT_CLASS}
                        placeholder="17"
                        value={dueDay}
                        onChange={(event) => setDueDay(event.target.value)}
                      />
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 text-sm font-semibold text-violet-100">Cor</p>
                    <div className="flex flex-wrap items-center gap-2">
                      {CARD_COLOR_OPTIONS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          className={`h-8 w-8 rounded-full border-2 ${
                            cardColor === color ? "border-white" : "border-transparent"
                          }`}
                          style={{ backgroundColor: color }}
                          onClick={() => setCardColor(color)}
                          aria-label={`Selecionar cor ${color}`}
                        />
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="mb-1 text-sm font-semibold text-violet-100">Observacoes</p>
                    <textarea
                      className={`${CARD_INPUT_CLASS} min-h-[92px]`}
                      placeholder="Notas adicionais..."
                      value={cardNote}
                      onChange={(event) => setCardNote(event.target.value)}
                    />
                  </div>
                </div>

                <div className="mt-5 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    className={`${SOFT_BUTTON_CLASS} px-4 py-2 text-sm`}
                    onClick={() => {
                      setIsFormOpen(false);
                      resetForm();
                    }}
                    disabled={saving}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className={`${PRIMARY_BUTTON_CLASS} disabled:opacity-60`}
                    onClick={editId ? handleSaveEdit : handleCreate}
                    disabled={saving || !name.trim()}
                  >
                    {saving ? "Salvando..." : editId ? "Salvar alteracoes" : "Criar cartao"}
                  </button>
                </div>
              </div>
              </div>
            </div>
          ) : null}

          <section className={`${ULTRA_SECTION_CLASS} p-5`}>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className={`rounded-full px-4 py-2 text-xs font-semibold ${
                  tab === "active"
                    ? "border-violet-300/60 bg-violet-500/25 text-violet-100"
                    : "border-violet-300/20 bg-violet-950/35 text-violet-100/70"
                } border`}
                onClick={() => setTab("active")}
              >
                Meus cartoes
              </button>
              <button
                type="button"
                className={`rounded-full px-4 py-2 text-xs font-semibold ${
                  tab === "archived"
                    ? "border-violet-300/60 bg-violet-500/25 text-violet-100"
                    : "border-violet-300/20 bg-violet-950/35 text-violet-100/70"
                } border`}
                onClick={() => setTab("archived")}
              >
                Arquivados
              </button>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {cardSummaries.map(({ card, summary }) => {
                const usedPct = card.limit_total
                  ? Math.min((summary.limitUsed / card.limit_total) * 100, 100)
                  : 0;
                const issuerLabel = resolveIssuerLabel(card.issuer, card.name);
                const bankName = issuerLabel || card.name?.trim() || "";
                const hasBankLogo = !!getBankIconPath(bankName);
                const detectedBankKey =
                  resolveBankKey(issuerLabel) || resolveBankKey(card.name);
                const isPicPay = detectedBankKey === "picpay";
                const isStyledBank =
                  !!detectedBankKey
                  && STYLED_BANK_KEYS.includes(detectedBankKey as StyledBankKey);
                const accentColor =
                  card.color && /^#([0-9a-fA-F]{6})$/.test(card.color)
                    ? card.color
                    : "#38bdf8";

                return (
                  <div
                    key={card.id}
                    className="rounded-2xl border border-violet-300/20 bg-[linear-gradient(160deg,rgba(34,18,61,0.88),rgba(12,9,31,0.9))] p-5 shadow-[0_12px_35px_rgba(30,12,58,0.45)]"
                    style={{ borderColor: `${accentColor}55` }}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 items-center justify-center">
                          {hasBankLogo ? (
                            <BankLogo bankName={bankName} size={30} />
                          ) : (
                            <CreditCard className="h-5 w-5 text-slate-300" />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-xs text-slate-400">
                              {issuerLabel || "Banco nao informado"}
                            </p>
                          </div>
                          <p className="text-2xl font-extrabold text-slate-100">{card.name}</p>
                          {card.note ? (
                            <p className="mt-1 line-clamp-1 text-xs text-slate-400">{card.note}</p>
                          ) : null}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-slate-400">Fatura atual</p>
                        <p className="text-xl font-extrabold text-slate-100">{brl(summary.currentTotal)}</p>
                      </div>
                    </div>

                    <div className="mt-4 pointer-events-none">
                      {isPicPay ? (
                        <PicPayCardVisual />
                      ) : isStyledBank ? (
                        <Bank3DCardVisual bankKey={detectedBankKey as StyledBankKey} />
                      ) : null}
                    </div>

                    <div className="mt-4">
                      <p className="text-xs text-slate-400">Limite usado</p>
                      <div className="mt-2 h-2 overflow-hidden rounded-full border border-white/10 bg-slate-900/60">
                        <div
                          className="h-full"
                          style={{ width: `${usedPct}%`, backgroundColor: accentColor }}
                        />
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 text-sm">
                      <div>
                        <p className="text-xs text-slate-400">Limite usado</p>
                        <p className="font-extrabold text-rose-400">{brl(summary.limitUsed)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400">Limite disponivel</p>
                        <p className="font-extrabold text-emerald-400">{brl(summary.limitAvailable)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400">Limite total</p>
                        <p className="font-extrabold text-slate-100">{brl(card.limit_total)}</p>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 grid-cols-1 sm:grid-cols-2 text-sm">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-slate-400" />
                        <div>
                          <p className="text-xs text-slate-400">Fechamento</p>
                          <p className="font-semibold">Todo dia {card.closing_day}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-slate-400" />
                        <div>
                          <p className="text-xs text-slate-400">Vencimento</p>
                          <p className="font-semibold">Todo dia {card.due_day}</p>
                        </div>
                      </div>
                    </div>

                    <div className="relative z-20 mt-4 flex flex-wrap items-center justify-between gap-2">
                      <Link
                        className="relative z-20 rounded-xl border border-white/10 bg-slate-900/50 px-4 py-2 text-xs font-semibold hover:bg-slate-900/70"
                        href={`/cards/${card.id}/invoice`}
                      >
                        Ver detalhes da fatura
                      </Link>
                      <div className="relative z-20 flex gap-2">
                        {!hasBankLogo ? (
                          <button
                            type="button"
                            className="relative z-20 rounded-xl border border-white/10 bg-slate-900/50 px-3 py-2 text-xs font-semibold hover:bg-slate-900/70"
                            onClick={() => handleSetBank(card)}
                          >
                            Definir banco
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="relative z-20 flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-slate-900/50 hover:bg-slate-900/70"
                          onClick={() => handleEdit(card)}
                          disabled={busyCardId === card.id}
                          aria-label="Editar cartao"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          className="relative z-20 flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-slate-900/50 hover:bg-slate-900/70"
                          onClick={() => handleArchive(card)}
                          disabled={busyCardId === card.id}
                          aria-label="Arquivar cartao"
                        >
                          <Archive className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          className="relative z-20 flex h-9 w-9 items-center justify-center rounded-xl border border-rose-400/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 disabled:opacity-60"
                          onClick={() => handleDelete(card)}
                          disabled={busyCardId === card.id}
                          aria-label="Excluir cartao"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
              {!cardSummaries.length && (
                <div className="text-sm text-muted">Nenhum cartao cadastrado.</div>
              )}
            </div>
          </section>

          <section className={`${ULTRA_SECTION_CLASS} p-6`}>
            <h2 className="text-xl font-extrabold tracking-tight text-violet-100">
              Registrar pagamento de fatura
            </h2>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <select
                className={CARD_INPUT_CLASS}
                value={paymentCard}
                onChange={(event) => setPaymentCard(event.target.value)}
              >
                <option value="">Selecione o cartao</option>
                {cards.map((card) => (
                  <option key={card.id} value={card.id}>
                    {card.name}
                  </option>
                ))}
              </select>
              <select
                className={CARD_INPUT_CLASS}
                value={paymentAccount}
                onChange={(event) => setPaymentAccount(event.target.value)}
              >
                <option value="">Conta de pagamento</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
              <input
                className={CARD_INPUT_CLASS}
                placeholder="Valor pago"
                value={paymentAmount}
                onChange={(event) => setPaymentAmount(event.target.value)}
              />
            </div>
            <button
              type="button"
              className={`mt-4 ${PRIMARY_BUTTON_CLASS}`}
              onClick={handlePayment}
            >
              Registrar pagamento
            </button>
          </section>
        </div>
      )}
    </AppShell>
  );
}
