"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Archive, Calendar, CreditCard, Pencil, Trash2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { BankLogo } from "@/components/BankLogo";
import { supabase } from "@/lib/supabaseClient";
import { getBankIconPath } from "@/lib/bankIcons";
import { brl, toNumber } from "@/lib/money";
import { Account, Card, Transaction, computeCardSummary } from "@/lib/finance";

const BANK_ISSUER_OPTIONS = [
  "Nubank",
  "Inter",
  "Bradesco",
  "Mercado Pago",
  "XP",
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
  if (text.includes("nubank") || text.includes("roxinho")) return "Nubank";
  if (text.includes("inter") || text.includes("bancointer")) return "Inter";
  if (text.includes("bradesco")) return "Bradesco";
  if (text.includes("mercadopago") || text.includes("mercadopag")) return "Mercado Pago";
  if (text.includes("btg") || text.includes("btgpactual")) return "BTG";
  if (text.includes("xp") || text.includes("xpinvestimentos")) return "XP";
  return null;
};

const resolveIssuerLabel = (issuer?: string | null, name?: string | null) =>
  (issuer?.trim() || inferIssuer(name) || "").trim();

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

  const [paymentCard, setPaymentCard] = useState("");
  const [paymentAccount, setPaymentAccount] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");

  const loadData = async () => {
    setLoading(true);
    const [cardsRes, txRes, accountsRes] = await Promise.all([
      supabase.from("cards").select("*").order("created_at"),
      supabase
        .from("transactions")
        .select("*")
        .order("occurred_at", { ascending: false })
        .limit(500),
      supabase.from("accounts").select("*").order("created_at"),
    ]);
    setCards((cardsRes.data as Card[]) || []);
    setTransactions((txRes.data as Transaction[]) || []);
    setAccounts((accountsRes.data as Account[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
    loadData();
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

  const openCreateModal = () => {
    resetForm();
    setIsFormOpen(true);
  };

  const handleCreate = async () => {
    if (!userId || !name.trim()) return;
    setSaving(true);
    setFeedback(null);
    const issuerToSave = resolveIssuerLabel(issuer, name);
    const { error } = await supabase.from("cards").insert({
      user_id: userId,
      name: name.trim(),
      issuer: issuerToSave || null,
      limit_total: toNumber(limitTotal),
      closing_day: Number(closingDay),
      due_day: Number(dueDay),
      color: cardColor,
      note: cardNote.trim() ? cardNote.trim() : null,
    });

    if (error) {
      setSaving(false);
      setFeedback(`Nao foi possivel criar: ${error.message}`);
      return;
    }

    setSaving(false);
    setIsFormOpen(false);
    setFeedback("Cartao criado com sucesso.");
    resetForm();
    loadData();
  };

  const handleArchive = async (card: Card) => {
    setFeedback(null);
    setBusyCardId(card.id);
    await supabase.from("cards").update({ archived: !card.archived }).eq("id", card.id);
    setBusyCardId(null);
    loadData();
  };

  const handleDelete = async (card: Card) => {
    setFeedback(null);
    const ok = window.confirm(
      `Excluir o cartao "${card.name}"? Essa acao nao pode ser desfeita.`,
    );
    if (!ok) return;

    setBusyCardId(card.id);
    const { error } = await supabase.from("cards").delete().eq("id", card.id);
    setBusyCardId(null);

    if (error) {
      setFeedback(`Nao foi possivel excluir: ${error.message}`);
      return;
    }

    if (editId === card.id) {
      resetForm();
      setIsFormOpen(false);
    }

    setFeedback("Cartao excluido com sucesso.");
    loadData();
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
    setIsFormOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editId || !name.trim()) return;
    setSaving(true);
    setFeedback(null);
    const issuerToSave = resolveIssuerLabel(issuer, name);
    const { error } = await supabase
      .from("cards")
      .update({
        name: name.trim(),
        issuer: issuerToSave || null,
        limit_total: toNumber(limitTotal),
        closing_day: Number(closingDay),
        due_day: Number(dueDay),
        color: cardColor,
        note: cardNote.trim() ? cardNote.trim() : null,
      })
      .eq("id", editId);

    if (error) {
      setSaving(false);
      setFeedback(`Nao foi possivel salvar: ${error.message}`);
      return;
    }

    setSaving(false);
    setIsFormOpen(false);
    setFeedback("Cartao atualizado com sucesso.");
    resetForm();
    loadData();
  };

  const handleSetBank = async (card: Card) => {
    const current = resolveIssuerLabel(card.issuer, card.name) || "";
    const next = window.prompt(
      `Informe o banco (${BANK_ISSUER_OPTIONS.join(", ")}):`,
      current,
    );
    if (!next) return;

    const normalized = resolveIssuerLabel(next, card.name);
    if (!normalized) return;

    await supabase.from("cards").update({ issuer: normalized }).eq("id", card.id);
    loadData();
  };

  const handlePayment = async () => {
    if (!userId || !paymentCard || !paymentAccount || !paymentAmount) return;
    await supabase.from("transactions").insert({
      user_id: userId,
      type: "card_payment",
      description: "Pagamento de fatura",
      category: "Cartao",
      amount: toNumber(paymentAmount),
      account_id: paymentAccount,
      card_id: paymentCard,
      occurred_at: new Date().toISOString().slice(0, 10),
    });
    setPaymentAmount("");
    loadData();
  };

  const cardSummaries = useMemo(
    () =>
      cards
        .filter((card) => (tab === "archived" ? card.archived : !card.archived))
        .map((card) => ({ card, summary: computeCardSummary(card, transactions) })),
    [cards, transactions, tab],
  );

  return (
    <AppShell title="Cartoes" subtitle="Controle limites e faturas">
      {loading ? (
        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/50 p-6 text-slate-300">
          Carregando...
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {feedback ? (
            <div className="rounded-xl border border-white/10 bg-slate-900/60 px-4 py-3 text-sm text-slate-200">
              {feedback}
            </div>
          ) : null}
          <section className="glass rounded-2xl p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-lg font-semibold">Novo cartao</h2>
                <p className="mt-1 text-sm text-slate-400">
                  Abra o formulario completo para cadastrar ou editar seu cartao.
                </p>
              </div>
              <button
                className="rounded-xl bg-gradient-to-r from-sky-400 to-indigo-500 px-4 py-2 text-sm font-semibold text-slate-950"
                onClick={openCreateModal}
              >
                Criar cartao
              </button>
            </div>
          </section>

          {isFormOpen ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
              <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-[#10141f] p-5 shadow-2xl">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-semibold">
                    {editId ? "Editar cartao" : "Novo cartao"}
                  </h3>
                  <button
                    type="button"
                    className="rounded-lg border border-white/10 px-2 py-1 text-sm text-slate-300 hover:bg-white/5"
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
                    <p className="mb-1 text-sm text-slate-300">Nome do cartao</p>
                    <input
                      className="w-full rounded-xl border border-white/10 bg-[#1c1c1e] px-3 py-2 text-sm"
                      placeholder="Ex: Nubank Platinum"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                    />
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <p className="mb-1 text-sm text-slate-300">Banco</p>
                      <input
                        className="w-full rounded-xl border border-white/10 bg-[#1c1c1e] px-3 py-2 text-sm"
                        placeholder="Ex: Nubank, Itau"
                        value={issuer}
                        onChange={(event) => setIssuer(event.target.value)}
                      />
                    </div>
                    <div>
                      <p className="mb-1 text-sm text-slate-300">Selecionar banco rapido</p>
                      <select
                        className="w-full rounded-xl border border-white/10 bg-[#1c1c1e] px-3 py-2 text-sm"
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
                      <p className="mb-1 text-sm text-slate-300">Limite total (R$)</p>
                      <input
                        className="w-full rounded-xl border border-white/10 bg-[#1c1c1e] px-3 py-2 text-sm"
                        placeholder="0,00"
                        value={limitTotal}
                        onChange={(event) => setLimitTotal(event.target.value)}
                      />
                    </div>
                    <div>
                      <p className="mb-1 text-sm text-slate-300">Fechamento</p>
                      <input
                        className="w-full rounded-xl border border-white/10 bg-[#1c1c1e] px-3 py-2 text-sm"
                        placeholder="10"
                        value={closingDay}
                        onChange={(event) => setClosingDay(event.target.value)}
                      />
                    </div>
                    <div>
                      <p className="mb-1 text-sm text-slate-300">Vencimento</p>
                      <input
                        className="w-full rounded-xl border border-white/10 bg-[#1c1c1e] px-3 py-2 text-sm"
                        placeholder="17"
                        value={dueDay}
                        onChange={(event) => setDueDay(event.target.value)}
                      />
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 text-sm text-slate-300">Cor</p>
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
                    <p className="mb-1 text-sm text-slate-300">Observacoes</p>
                    <textarea
                      className="min-h-[92px] w-full rounded-xl border border-white/10 bg-[#1c1c1e] px-3 py-2 text-sm"
                      placeholder="Notas adicionais..."
                      value={cardNote}
                      onChange={(event) => setCardNote(event.target.value)}
                    />
                  </div>
                </div>

                <div className="mt-5 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    className="rounded-xl border border-white/10 px-4 py-2 text-sm"
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
                    className="rounded-xl bg-gradient-to-r from-sky-400 to-indigo-500 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-60"
                    onClick={editId ? handleSaveEdit : handleCreate}
                    disabled={saving || !name.trim()}
                  >
                    {saving ? "Salvando..." : editId ? "Salvar alteracoes" : "Criar cartao"}
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          <section className="glass rounded-2xl p-5">
            <div className="flex items-center gap-2">
              <button
                type="button"
                className={`rounded-full px-4 py-2 text-xs font-semibold ${
                  tab === "active"
                    ? "border-sky-400 bg-sky-500/20 text-sky-200"
                    : "border-white/10 bg-slate-900/60 text-slate-300"
                } border`}
                onClick={() => setTab("active")}
              >
                Meus cartoes
              </button>
              <button
                type="button"
                className={`rounded-full px-4 py-2 text-xs font-semibold ${
                  tab === "archived"
                    ? "border-sky-400 bg-sky-500/20 text-sky-200"
                    : "border-white/10 bg-slate-900/60 text-slate-300"
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
                const accentColor =
                  card.color && /^#([0-9a-fA-F]{6})$/.test(card.color)
                    ? card.color
                    : "#38bdf8";

                return (
                  <div
                    key={card.id}
                    className="rounded-2xl border border-white/10 bg-[#1c1c1e] p-5 shadow-[0_10px_25px_rgba(0,0,0,0.22)]"
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

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                      <Link
                        className="rounded-xl border border-white/10 bg-slate-900/50 px-4 py-2 text-xs font-semibold hover:bg-slate-900/70"
                        href={`/cards/${card.id}/invoice`}
                      >
                        Ver detalhes da fatura
                      </Link>
                      <div className="flex gap-2">
                        {!hasBankLogo ? (
                          <button
                            className="rounded-xl border border-white/10 bg-slate-900/50 px-3 py-2 text-xs font-semibold hover:bg-slate-900/70"
                            onClick={() => handleSetBank(card)}
                          >
                            Definir banco
                          </button>
                        ) : null}
                        <button
                          className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-slate-900/50 hover:bg-slate-900/70"
                          onClick={() => handleEdit(card)}
                          disabled={busyCardId === card.id}
                          aria-label="Editar cartao"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-slate-900/50 hover:bg-slate-900/70"
                          onClick={() => handleArchive(card)}
                          disabled={busyCardId === card.id}
                          aria-label="Arquivar cartao"
                        >
                          <Archive className="h-4 w-4" />
                        </button>
                        <button
                          className="flex h-9 w-9 items-center justify-center rounded-xl border border-rose-400/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 disabled:opacity-60"
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

          <section className="glass rounded-2xl p-6">
            <h2 className="text-lg font-semibold">Registrar pagamento de fatura</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <select
                className="rounded-xl border border-white/10 bg-[#1c1c1e] px-3 py-2 text-sm"
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
                className="rounded-xl border border-white/10 bg-[#1c1c1e] px-3 py-2 text-sm"
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
                className="rounded-xl border border-white/10 bg-[#1c1c1e] px-3 py-2 text-sm"
                placeholder="Valor pago"
                value={paymentAmount}
                onChange={(event) => setPaymentAmount(event.target.value)}
              />
            </div>
            <button
              className="mt-4 rounded-xl bg-gradient-to-r from-sky-400 to-indigo-500 px-4 py-2 text-sm font-semibold text-slate-950"
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
