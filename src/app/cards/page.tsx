"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Archive, Calendar, CreditCard, Pencil } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { BankLogo } from "@/components/BankLogo";
import { supabase } from "@/lib/supabaseClient";
import { getBankIconPath } from "@/lib/bankIcons";
import { brl, toNumber } from "@/lib/money";
import { Account, Card, Transaction, computeCardSummary } from "@/lib/finance";

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

  const [editId, setEditId] = useState<string | null>(null);
  const [tab, setTab] = useState<"active" | "archived">("active");

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

  const handleCreate = async () => {
    if (!userId || !name) return;
    await supabase.from("cards").insert({
      user_id: userId,
      name,
      issuer,
      limit_total: toNumber(limitTotal),
      closing_day: Number(closingDay),
      due_day: Number(dueDay),
    });
    setName("");
    setIssuer("");
    setLimitTotal("");
    loadData();
  };

  const handleArchive = async (card: Card) => {
    await supabase.from("cards").update({ archived: !card.archived }).eq("id", card.id);
    loadData();
  };

  const handleEdit = (card: Card) => {
    setEditId(card.id);
    setName(card.name);
    setIssuer(card.issuer ?? "");
    setLimitTotal(String(card.limit_total));
    setClosingDay(String(card.closing_day));
    setDueDay(String(card.due_day));
  };

  const handleSaveEdit = async () => {
    if (!editId) return;
    await supabase
      .from("cards")
      .update({
        name,
        issuer,
        limit_total: toNumber(limitTotal),
        closing_day: Number(closingDay),
        due_day: Number(dueDay),
      })
      .eq("id", editId);
    setEditId(null);
    setName("");
    setIssuer("");
    setLimitTotal("");
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
          <section className="glass rounded-2xl p-6">
            <h2 className="text-lg font-semibold">Novo cartao</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <input
                className="rounded-xl border border-white/10 bg-[#1c1c1e] px-3 py-2 text-sm"
                placeholder="Nome do cartao"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
              <input
                className="rounded-xl border border-white/10 bg-[#1c1c1e] px-3 py-2 text-sm"
                placeholder="Emissor"
                value={issuer}
                onChange={(event) => setIssuer(event.target.value)}
              />
              <input
                className="rounded-xl border border-white/10 bg-[#1c1c1e] px-3 py-2 text-sm"
                placeholder="Limite total"
                value={limitTotal}
                onChange={(event) => setLimitTotal(event.target.value)}
              />
              <input
                className="rounded-xl border border-white/10 bg-[#1c1c1e] px-3 py-2 text-sm"
                placeholder="Dia de fechamento"
                value={closingDay}
                onChange={(event) => setClosingDay(event.target.value)}
              />
              <input
                className="rounded-xl border border-white/10 bg-[#1c1c1e] px-3 py-2 text-sm"
                placeholder="Dia de vencimento"
                value={dueDay}
                onChange={(event) => setDueDay(event.target.value)}
              />
            </div>
            <div className="mt-4 flex gap-2">
              {editId ? (
                <>
                  <button
                    className="rounded-xl bg-gradient-to-r from-sky-400 to-indigo-500 px-4 py-2 text-sm font-semibold text-slate-950"
                    onClick={handleSaveEdit}
                  >
                    Salvar alteracoes
                  </button>
                  <button
                    className="rounded-xl border border-slate-700 px-3 py-2 text-sm"
                    onClick={() => setEditId(null)}
                  >
                    Cancelar
                  </button>
                </>
              ) : (
                <button
                  className="rounded-xl bg-gradient-to-r from-sky-400 to-indigo-500 px-4 py-2 text-sm font-semibold text-slate-950"
                  onClick={handleCreate}
                >
                  Criar cartao
                </button>
              )}
            </div>
          </section>

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
                const bankName = card.issuer || "";
                const hasBankLogo = !!getBankIconPath(bankName);

                return (
                  <div
                    key={card.id}
                    className="rounded-2xl border border-white/10 bg-[#1c1c1e] p-5 shadow-[0_10px_25px_rgba(0,0,0,0.22)]"
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
                            <p className="text-xs text-slate-400">{card.issuer || "Titular"}</p>
                          </div>
                          <p className="text-2xl font-extrabold text-slate-100">{card.name}</p>
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
                        <div className="h-full bg-sky-400" style={{ width: `${usedPct}%` }} />
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
                        <button
                          className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-slate-900/50 hover:bg-slate-900/70"
                          onClick={() => handleEdit(card)}
                          aria-label="Editar cartao"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-slate-900/50 hover:bg-slate-900/70"
                          onClick={() => handleArchive(card)}
                          aria-label="Arquivar cartao"
                        >
                          <Archive className="h-4 w-4" />
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
