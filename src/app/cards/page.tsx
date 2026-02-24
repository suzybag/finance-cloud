"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Archive,
  Calendar,
  CircleDollarSign,
  CreditCard,
  Pencil,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { BankLogo } from "@/components/BankLogo";
import { Bank3DCardVisual, StyledBankKey } from "@/components/Bank3DCardVisual";
import { DeleteActionButton } from "@/components/DeleteActionButton";
import { PicPayCardVisual } from "@/components/PicPayCardVisual";
import { useConfirmDialog } from "@/context/ConfirmDialogContext";
import { supabase } from "@/lib/supabaseClient";
import { getBankIconPath, resolveBankKey } from "@/lib/bankIcons";
import { brl, toNumber } from "@/lib/money";
import { Account, Card, Transaction, computeCardSummary } from "@/lib/finance";
import { hasCardSensitiveData, sanitizeFreeText } from "@/lib/security/input";
import { useBankRelationship } from "@/ui/dashboard/useBankRelationship";

const BANK_ISSUER_OPTIONS = [
  "Nubank Ultravioleta",
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

const isRemovedIssuer = (value?: string | null) => {
  const text = normalizeText(value ?? "");
  if (!text) return false;
  return text.includes("nuinvest") || text.includes("nuinvestimentos") || text.includes("easynvest");
};

const inferIssuer = (value?: string | null) => {
  const text = normalizeText(value ?? "");
  if (!text) return null;
  if (text.includes("nubank") || text.includes("roxinho") || text.includes("ultravioleta")) return "Nubank Ultravioleta";
  if (text.includes("inter") || text.includes("bancointer")) return "Inter";
  if (text.includes("bradesco")) return "Bradesco";
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

const isMissingCardsBankScoreColumnError = (message?: string | null) =>
  /could not find the 'bank_score' column of 'cards' in the schema cache/i.test(message ?? "");

const parseBankScoreInput = (rawValue: string) => {
  const trimmed = rawValue.trim();
  if (!trimmed) return null;

  const parsed = Number(trimmed.replace(",", "."));
  if (!Number.isFinite(parsed)) return undefined;

  const normalized = Math.round(parsed);
  if (normalized < 0 || normalized > 1000) return undefined;
  return normalized;
};

const parsePositiveAmountInput = (rawValue?: string | null) => {
  const amount = Math.abs(toNumber(rawValue ?? ""));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return amount;
};

const hasSensitiveCardInput = ({
  name,
  issuer,
  note,
}: {
  name: string;
  issuer: string;
  note: string;
}) => hasCardSensitiveData(`${name} ${issuer} ${note}`);

type CardQuickActionState =
  | {
      type: "set_limit_used";
      card: Card;
      currentUsed: number;
    }
  | {
      type: "add_spend";
      card: Card;
      currentUsed: number;
    };

export default function CardsPage() {
  const confirmDialog = useConfirmDialog();
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
  const [bankScore, setBankScore] = useState("");
  const [cardColor, setCardColor] = useState<string>(CARD_COLOR_OPTIONS[0]);
  const [cardNote, setCardNote] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [editId, setEditId] = useState<string | null>(null);
  const [tab, setTab] = useState<"active" | "archived">("active");
  const [busyCardId, setBusyCardId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [supportsCardStyleFields, setSupportsCardStyleFields] = useState(true);
  const [supportsCardBankScoreField, setSupportsCardBankScoreField] = useState(true);
  const [quickAction, setQuickAction] = useState<CardQuickActionState | null>(null);
  const [quickAmount, setQuickAmount] = useState("");
  const [quickDescription, setQuickDescription] = useState("Gasto no cartao");
  const [quickSaving, setQuickSaving] = useState(false);

  const [paymentCard, setPaymentCard] = useState("");
  const [paymentAccount, setPaymentAccount] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const {
    loading: relationshipLoading,
    running: relationshipRunning,
    error: relationshipError,
    warnings: relationshipWarnings,
    summary: relationshipSummary,
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

      setCards(
        ((cardsRes.data as Card[]) || []).filter(
          (card) => !isRemovedIssuer(card.issuer) && !isRemovedIssuer(card.name),
        ),
      );
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
    setBankScore("");
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

  const resetQuickAction = () => {
    setQuickAction(null);
    setQuickAmount("");
    setQuickDescription("Gasto no cartao");
  };

  const closeQuickActionModal = () => {
    if (quickSaving) return;
    resetQuickAction();
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

      const bankScoreValue = parseBankScoreInput(bankScore);
      if (typeof bankScoreValue === "undefined") {
        setSaving(false);
        setFeedback("Score do banco deve ser um numero de 0 a 1000.");
        return;
      }

      const sanitizedName = sanitizeFreeText(name, 80);
      if (!sanitizedName) {
        setSaving(false);
        setFeedback("Informe um nome valido para o cartao.");
        return;
      }
      const issuerToSave = sanitizeFreeText(resolveIssuerLabel(issuer, name), 80);
      const sanitizedNote = sanitizeFreeText(cardNote, 500);
      if (hasSensitiveCardInput({ name: sanitizedName, issuer: issuerToSave, note: sanitizedNote })) {
        setSaving(false);
        setFeedback("Nao armazene numero completo do cartao, CVV, PIN ou senha.");
        return;
      }

      const basePayload = {
        user_id: resolvedUserId,
        name: sanitizedName,
        issuer: issuerToSave || null,
        limit_total: toNumber(limitTotal),
        closing_day: closingDayValue,
        due_day: dueDayValue,
      };

      let includeStyle = supportsCardStyleFields;
      let includeBankScore = supportsCardBankScoreField;
      let usedStyleFallback = !supportsCardStyleFields;
      let usedBankScoreFallback = !supportsCardBankScoreField;

      const insertCard = () => {
        const payload = {
          ...basePayload,
          ...(includeStyle
            ? {
                color: cardColor,
                note: sanitizedNote || null,
              }
            : {}),
          ...(includeBankScore ? { bank_score: bankScoreValue } : {}),
        };
        return supabase.from("cards").insert(payload);
      };

      let createRes = await insertCard();
      let error = createRes.error;

      for (let attempt = 0; attempt < 2 && error; attempt += 1) {
        if (includeStyle && isMissingCardsStyleColumnError(error.message)) {
          includeStyle = false;
          usedStyleFallback = true;
          setSupportsCardStyleFields(false);
          createRes = await insertCard();
          error = createRes.error;
          continue;
        }

        if (includeBankScore && isMissingCardsBankScoreColumnError(error.message)) {
          includeBankScore = false;
          usedBankScoreFallback = true;
          setSupportsCardBankScoreField(false);
          createRes = await insertCard();
          error = createRes.error;
          continue;
        }

        break;
      }

      if (error) {
        setSaving(false);
        setFeedback(`Nao foi possivel criar: ${error.message}`);
        return;
      }

      setSaving(false);
      setIsFormOpen(false);
      if (usedStyleFallback && usedBankScoreFallback) {
        setFeedback("Cartao criado. Cor, observacao e score ficam indisponiveis ate atualizar o banco.");
      } else if (usedStyleFallback) {
        setFeedback("Cartao criado. Cor e observacao ficam indisponiveis ate atualizar o banco.");
      } else if (usedBankScoreFallback) {
        setFeedback("Cartao criado. Campo de score fica indisponivel ate atualizar o banco.");
      } else {
        setFeedback("Cartao criado com sucesso.");
      }
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
      const ok = await confirmDialog({
        title: "Excluir cartao?",
        description: `O cartao "${card.name}" sera removido e essa acao nao pode ser desfeita.`,
        confirmLabel: "Excluir",
        cancelLabel: "Cancelar",
        tone: "danger",
      });
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
    setBankScore(
      typeof card.bank_score === "number" && Number.isFinite(card.bank_score)
        ? String(Math.round(card.bank_score))
        : "",
    );
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

      const bankScoreValue = parseBankScoreInput(bankScore);
      if (typeof bankScoreValue === "undefined") {
        setSaving(false);
        setFeedback("Score do banco deve ser um numero de 0 a 1000.");
        return;
      }

      const sanitizedName = sanitizeFreeText(name, 80);
      if (!sanitizedName) {
        setSaving(false);
        setFeedback("Informe um nome valido para o cartao.");
        return;
      }
      const issuerToSave = sanitizeFreeText(resolveIssuerLabel(issuer, name), 80);
      const sanitizedNote = sanitizeFreeText(cardNote, 500);
      if (hasSensitiveCardInput({ name: sanitizedName, issuer: issuerToSave, note: sanitizedNote })) {
        setSaving(false);
        setFeedback("Nao armazene numero completo do cartao, CVV, PIN ou senha.");
        return;
      }

      const basePayload = {
        name: sanitizedName,
        issuer: issuerToSave || null,
        limit_total: toNumber(limitTotal),
        closing_day: closingDayValue,
        due_day: dueDayValue,
      };

      let includeStyle = supportsCardStyleFields;
      let includeBankScore = supportsCardBankScoreField;
      let usedStyleFallback = !supportsCardStyleFields;
      let usedBankScoreFallback = !supportsCardBankScoreField;

      const updateCard = () => {
        const payload = {
          ...basePayload,
          ...(includeStyle
            ? {
                color: cardColor,
                note: sanitizedNote || null,
              }
            : {}),
          ...(includeBankScore ? { bank_score: bankScoreValue } : {}),
        };

        return supabase
          .from("cards")
          .update(payload)
          .eq("id", editId)
          .eq("user_id", resolvedUserId)
          .select("id");
      };

      let saveRes = await updateCard();
      let error = saveRes.error;
      let updatedRows = (saveRes.data ?? []).length;

      for (let attempt = 0; attempt < 2 && error; attempt += 1) {
        if (includeStyle && isMissingCardsStyleColumnError(error.message)) {
          includeStyle = false;
          usedStyleFallback = true;
          setSupportsCardStyleFields(false);
          saveRes = await updateCard();
          error = saveRes.error;
          updatedRows = (saveRes.data ?? []).length;
          continue;
        }

        if (includeBankScore && isMissingCardsBankScoreColumnError(error.message)) {
          includeBankScore = false;
          usedBankScoreFallback = true;
          setSupportsCardBankScoreField(false);
          saveRes = await updateCard();
          error = saveRes.error;
          updatedRows = (saveRes.data ?? []).length;
          continue;
        }

        break;
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
      if (usedStyleFallback && usedBankScoreFallback) {
        setFeedback("Cartao atualizado. Cor, observacao e score ficam indisponiveis ate atualizar o banco.");
      } else if (usedStyleFallback) {
        setFeedback("Cartao atualizado. Cor e observacao ficam indisponiveis ate atualizar o banco.");
      } else if (usedBankScoreFallback) {
        setFeedback("Cartao atualizado. Campo de score fica indisponivel ate atualizar o banco.");
      } else {
        setFeedback("Cartao atualizado com sucesso.");
      }
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
      if (hasCardSensitiveData(normalized)) {
        setFeedback("Nao armazene dados sensiveis no nome do banco/cartao.");
        return;
      }

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

  const insertCardExpense = async ({
    card,
    amount,
    description,
  }: {
    card: Card;
    amount: number;
    description: string;
  }) => {
    const resolvedUserId = await ensureUserId();
    if (!resolvedUserId) return false;

    const { error } = await supabase.from("transactions").insert({
      user_id: resolvedUserId,
      type: "expense",
      occurred_at: new Date().toISOString().slice(0, 10),
      description,
      category: "Cartao",
      amount,
      account_id: null,
      to_account_id: null,
      card_id: card.id,
      tags: ["cartao_manual"],
      note: null,
    });

    if (error) {
      setFeedback(`Nao foi possivel registrar gasto: ${error.message}`);
      return false;
    }

    return true;
  };

  const handleAddCardSpend = (card: Card) => {
    setFeedback(null);
    prepareModalViewport();
    setQuickAction({
      type: "add_spend",
      card,
      currentUsed: 0,
    });
    setQuickAmount("");
    setQuickDescription("Gasto no cartao");
  };

  const handleSetLimitUsed = (card: Card, currentUsed: number) => {
    setFeedback(null);
    prepareModalViewport();
    setQuickAction({
      type: "set_limit_used",
      card,
      currentUsed,
    });
    setQuickAmount(String(currentUsed.toFixed(2)));
    setQuickDescription("Ajuste limite usado");
  };

  const handleSubmitQuickAction = async () => {
    if (!quickAction) return;

    const parsedAmount = parsePositiveAmountInput(quickAmount);
    if (!parsedAmount) {
      setFeedback("Informe um valor valido maior que zero.");
      return;
    }

    let amountToInsert = parsedAmount;
    let descriptionToSave = (quickDescription || "").trim() || "Gasto no cartao";
    if (quickAction.type === "set_limit_used") {
      const delta = parsedAmount - quickAction.currentUsed;
      if (delta <= 0) {
        setFeedback("Esse botao adiciona gasto. Informe um valor maior que o limite usado atual.");
        return;
      }
      amountToInsert = delta;
      descriptionToSave = "Ajuste limite usado";
    }

    try {
      setFeedback(null);
      setQuickSaving(true);
      setBusyCardId(quickAction.card.id);
      const ok = await insertCardExpense({
        card: quickAction.card,
        amount: amountToInsert,
        description: descriptionToSave,
      });
      setBusyCardId(null);
      setQuickSaving(false);
      if (!ok) return;

      const message =
        quickAction.type === "set_limit_used"
          ? `Limite usado atualizado. Foi adicionado ${brl(amountToInsert)} no cartao ${quickAction.card.name}.`
          : `Gasto de ${brl(amountToInsert)} adicionado no cartao ${quickAction.card.name}.`;
      resetQuickAction();
      setFeedback(message);
      await loadData();
    } catch (error) {
      setBusyCardId(null);
      setQuickSaving(false);
      setFeedback(`Falha inesperada ao salvar acao no cartao: ${error instanceof Error ? error.message : "erro desconhecido"}`);
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

          <section className={`${ULTRA_SECTION_CLASS} p-4 sm:p-5`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xs font-extrabold uppercase tracking-[0.12em] text-violet-100/90">
                  Indicadores essenciais
                </h2>
                <p className="text-xs text-slate-400">
                  Status do score, uso de limite, pontualidade, despesa e receita atual.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-white/15 bg-black/30 px-3 py-1.5 text-xs font-semibold text-slate-100 hover:bg-black/45"
                  onClick={() => void refreshRelationship()}
                >
                  Atualizar
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-lg border border-violet-400/30 bg-violet-500/15 px-3 py-1.5 text-xs font-semibold text-violet-100 hover:bg-violet-500/25 disabled:opacity-60"
                  onClick={() => void runAssessment()}
                  disabled={relationshipRunning || relationshipLoading}
                >
                  {relationshipRunning ? "Recalculando..." : "Recalcular"}
                </button>
              </div>
            </div>

            {relationshipLoading ? (
              <div className="mt-3 rounded-xl border border-white/10 bg-black/25 px-3 py-3 text-sm text-slate-300">
                Carregando indicadores...
              </div>
            ) : relationshipError ? (
              <div className="mt-3 rounded-xl border border-rose-400/40 bg-rose-500/10 px-3 py-3 text-sm text-rose-100">
                {relationshipError}
              </div>
            ) : relationshipSummary ? (
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5 text-xs">
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
                <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-slate-300">
                  <p className="text-slate-400">Uso de limite</p>
                  <p className="font-semibold text-slate-100">
                    {relationshipSummary.indicators.cardLimitUtilizationPct.toFixed(1).replace(".", ",")}%
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-slate-300">
                  <p className="text-slate-400">Pontualidade</p>
                  <p className="font-semibold text-slate-100">
                    {relationshipSummary.indicators.onTimePaymentRate.toFixed(1).replace(".", ",")}%
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-slate-300">
                  <p className="text-slate-400">Despesa atual</p>
                  <p className="font-semibold text-slate-100">
                    {brl(relationshipSummary.indicators.expenseCurrentMonth)}
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-slate-300">
                  <p className="text-slate-400">Receita atual</p>
                  <p className="font-semibold text-slate-100">
                    {brl(relationshipSummary.indicators.incomeCurrentMonth)}
                  </p>
                </div>
              </div>
            ) : null}
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

                  <div className="grid gap-3 md:grid-cols-4">
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
                    <div>
                      <p className="mb-1 text-sm font-semibold text-violet-100">Score banco (0-1000)</p>
                      <input
                        className={CARD_INPUT_CLASS}
                        placeholder="Ex: 890"
                        value={bankScore}
                        onChange={(event) => setBankScore(event.target.value)}
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

          {quickAction ? (
            <div
              className="fixed inset-0 z-[125] overflow-y-auto p-4 backdrop-blur-sm"
              style={{ backgroundColor: "rgba(6, 4, 13, 0.82)" }}
            >
              <div className="flex min-h-full items-start justify-center py-6 sm:items-center">
                <div className="w-full max-w-lg rounded-2xl border border-violet-300/20 bg-[linear-gradient(170deg,rgba(31,17,56,0.96),rgba(14,10,31,0.97))] p-5 shadow-[0_20px_60px_rgba(76,29,149,0.45)]">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CircleDollarSign className="h-5 w-5 text-violet-200" />
                      <h3 className="text-lg font-extrabold text-violet-100">
                        {quickAction.type === "set_limit_used" ? "Definir limite usado" : "Adicionar gasto"}
                      </h3>
                    </div>
                    <button
                      type="button"
                      className="rounded-lg border border-violet-300/20 px-2 py-1 text-sm text-violet-100 hover:bg-violet-500/15"
                      onClick={closeQuickActionModal}
                      disabled={quickSaving}
                    >
                      X
                    </button>
                  </div>

                  <p className="mt-2 text-sm text-violet-200/80">
                    Cartao: <span className="font-semibold text-violet-100">{quickAction.card.name}</span>
                  </p>
                  {quickAction.type === "set_limit_used" ? (
                    <p className="mt-1 text-xs text-violet-200/70">
                      Limite usado atual: {brl(quickAction.currentUsed)}
                    </p>
                  ) : null}

                  <div className="mt-4 grid gap-3">
                    <div>
                      <p className="mb-1 text-sm font-semibold text-violet-100">Valor (R$)</p>
                      <input
                        className={CARD_INPUT_CLASS}
                        placeholder="0,00"
                        value={quickAmount}
                        onChange={(event) => setQuickAmount(event.target.value)}
                      />
                    </div>
                    <div>
                      <p className="mb-1 text-sm font-semibold text-violet-100">Descricao</p>
                      <input
                        className={CARD_INPUT_CLASS}
                        placeholder="Ex: Compra mercado"
                        value={quickDescription}
                        onChange={(event) => setQuickDescription(event.target.value)}
                      />
                    </div>
                  </div>

                  <div className="mt-5 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      className={`${SOFT_BUTTON_CLASS} px-4 py-2 text-sm`}
                      onClick={closeQuickActionModal}
                      disabled={quickSaving}
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      className={`${PRIMARY_BUTTON_CLASS} disabled:opacity-60`}
                      onClick={handleSubmitQuickAction}
                      disabled={quickSaving}
                    >
                      {quickSaving ? "Salvando..." : "Salvar"}
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

                    <div className="mt-4 grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 text-sm">
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
                      <div>
                        <p className="text-xs text-slate-400">Score banco</p>
                        <p className="font-extrabold text-cyan-300">
                          {typeof card.bank_score === "number" && Number.isFinite(card.bank_score)
                            ? Math.round(card.bank_score)
                            : "--"}
                        </p>
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
                      <div className="relative z-20 flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="rounded-xl border border-white/10 bg-slate-900/50 px-3 py-2 text-xs font-semibold hover:bg-slate-900/70 disabled:opacity-60"
                          onClick={() => handleSetLimitUsed(card, summary.currentTotal)}
                          disabled={busyCardId === card.id}
                        >
                          Definir limite usado
                        </button>
                        <button
                          type="button"
                          className="rounded-xl border border-white/10 bg-slate-900/50 px-3 py-2 text-xs font-semibold hover:bg-slate-900/70 disabled:opacity-60"
                          onClick={() => handleAddCardSpend(card)}
                          disabled={busyCardId === card.id}
                        >
                          Adicionar gasto
                        </button>
                        <Link
                          className="rounded-xl border border-white/10 bg-slate-900/50 px-4 py-2 text-xs font-semibold hover:bg-slate-900/70"
                          href={`/cards/${card.id}/invoice`}
                        >
                          Ver detalhes da fatura
                        </Link>
                      </div>
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
                        <DeleteActionButton
                          onClick={() => handleDelete(card)}
                          disabled={busyCardId === card.id}
                          label="Excluir"
                          ariaLabel={`Excluir cartao ${card.name}`}
                          size="sm"
                          className="relative z-20"
                        />
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
