"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/lib/supabaseClient";
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
    () => cards.map((card) => ({ card, summary: computeCardSummary(card, transactions) })),
    [cards, transactions],
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
                className="rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm"
                placeholder="Nome do cartao"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
              <input
                className="rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm"
                placeholder="Emissor"
                value={issuer}
                onChange={(event) => setIssuer(event.target.value)}
              />
              <input
                className="rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm"
                placeholder="Limite total"
                value={limitTotal}
                onChange={(event) => setLimitTotal(event.target.value)}
              />
              <input
                className="rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm"
                placeholder="Dia de fechamento"
                value={closingDay}
                onChange={(event) => setClosingDay(event.target.value)}
              />
              <input
                className="rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm"
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

          <section className="grid gap-4 lg:grid-cols-2">
            {cardSummaries.map(({ card, summary }) => (
              <div key={card.id} className="glass rounded-2xl p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-lg font-semibold text-white">{card.name}</p>
                    <p className="text-xs text-slate-400">{card.issuer ?? ""}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-400">Limite total</p>
                    <p className="text-lg font-semibold text-white">{brl(card.limit_total)}</p>
                  </div>
                </div>
                <div className="mt-3 space-y-1 text-sm text-slate-300">
                  <div className="flex justify-between">
                    <span>Limite usado</span>
                    <span>{brl(summary.limitUsed)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Limite disponivel</span>
                    <span>{brl(summary.limitAvailable)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Fatura atual</span>
                    <span>{brl(summary.currentTotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Fatura prevista</span>
                    <span>{brl(summary.forecastTotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Fecha dia</span>
                    <span>{card.closing_day}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Vence dia</span>
                    <span>{card.due_day}</span>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    className="rounded-xl border border-slate-700 px-3 py-2 text-xs"
                    onClick={() => handleEdit(card)}
                  >
                    Editar
                  </button>
                  <button
                    className="rounded-xl border border-slate-700 px-3 py-2 text-xs"
                    onClick={() => handleArchive(card)}
                  >
                    {card.archived ? "Desarquivar" : "Arquivar"}
                  </button>
                </div>
              </div>
            ))}
            {!cards.length && (
              <div className="text-sm text-slate-500">Nenhum cartao cadastrado.</div>
            )}
          </section>

          <section className="glass rounded-2xl p-6">
            <h2 className="text-lg font-semibold">Registrar pagamento de fatura</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <select
                className="rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm"
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
                className="rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm"
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
                className="rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm"
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
