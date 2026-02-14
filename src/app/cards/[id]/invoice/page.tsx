"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Calendar, CreditCard } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/lib/supabaseClient";
import { Account, Card, Transaction, computeCardSummary } from "@/lib/finance";
import { brl } from "@/lib/money";

type ParamsShape = {
  id?: string;
};

const CARD_CLASS =
  "rounded-2xl border border-violet-300/20 bg-[linear-gradient(160deg,rgba(34,18,61,0.84),rgba(12,9,31,0.9))] p-4 shadow-[0_12px_35px_rgba(30,12,58,0.45)]";

const formatDate = (value: string | Date) => {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "--/--/----";
  return date.toLocaleDateString("pt-BR");
};

const dateOnly = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toISOString().slice(0, 10);
};

const inRangeInclusive = (target: Date, start: Date, end: Date) =>
  target.getTime() >= start.getTime() && target.getTime() <= end.getTime();

export default function CardInvoicePage() {
  const params = useParams<ParamsShape>();
  const cardId = String(params?.id || "");

  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [card, setCard] = useState<Card | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);

  const ensureUserId = useCallback(async () => {
    if (userId) return userId;

    const sessionRes = await supabase.auth.getSession();
    const fromSession = sessionRes.data.session?.user?.id ?? null;
    if (fromSession) {
      setUserId(fromSession);
      return fromSession;
    }

    const { data, error } = await supabase.auth.getUser();
    if (error) {
      setFeedback(`Sessao nao encontrada: ${error.message}`);
      return null;
    }

    const resolvedUserId = data.user?.id ?? null;
    setUserId(resolvedUserId);
    if (!resolvedUserId) {
      setFeedback("Sessao nao encontrada. Entre novamente.");
      return null;
    }

    return resolvedUserId;
  }, [userId]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setFeedback(null);

    if (!cardId) {
      setFeedback("Cartao invalido.");
      setLoading(false);
      return;
    }

    const resolvedUserId = await ensureUserId();
    if (!resolvedUserId) {
      setLoading(false);
      return;
    }

    try {
      const [cardRes, txRes, accountsRes] = await Promise.all([
        supabase
          .from("cards")
          .select("*")
          .eq("id", cardId)
          .eq("user_id", resolvedUserId)
          .maybeSingle(),
        supabase
          .from("transactions")
          .select("*")
          .eq("user_id", resolvedUserId)
          .eq("card_id", cardId)
          .order("occurred_at", { ascending: false })
          .limit(1000),
        supabase
          .from("accounts")
          .select("*")
          .eq("user_id", resolvedUserId)
          .order("name"),
      ]);

      if (cardRes.error || txRes.error || accountsRes.error) {
        setFeedback(cardRes.error?.message || txRes.error?.message || accountsRes.error?.message || "Falha ao carregar fatura.");
        setLoading(false);
        return;
      }

      if (!cardRes.data) {
        setFeedback("Cartao nao encontrado.");
        setLoading(false);
        return;
      }

      setCard(cardRes.data as Card);
      setTransactions((txRes.data || []) as Transaction[]);
      setAccounts((accountsRes.data || []) as Account[]);
      setLoading(false);
    } catch (error) {
      setFeedback(`Falha inesperada ao carregar fatura: ${error instanceof Error ? error.message : "erro desconhecido"}`);
      setLoading(false);
    }
  }, [cardId, ensureUserId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const accountById = useMemo(
    () => new Map<string, Account>(accounts.map((item) => [item.id, item])),
    [accounts],
  );

  const summary = useMemo(() => {
    if (!card) return null;
    return computeCardSummary(card, transactions);
  }, [card, transactions]);

  const cycleItems = useMemo(() => {
    if (!summary) return [] as Transaction[];
    return transactions.filter((tx) => {
      if (tx.type === "card_payment") return false;
      const occurred = new Date(tx.occurred_at);
      if (Number.isNaN(occurred.getTime())) return false;
      return inRangeInclusive(occurred, summary.cycleStart, summary.cycleEnd);
    });
  }, [summary, transactions]);

  const cyclePayments = useMemo(() => {
    if (!summary) return [] as Transaction[];
    return transactions.filter((tx) => {
      if (tx.type !== "card_payment") return false;
      const occurred = new Date(tx.occurred_at);
      if (Number.isNaN(occurred.getTime())) return false;
      return inRangeInclusive(occurred, summary.cycleStart, summary.dueDate);
    });
  }, [summary, transactions]);

  const paidTotal = useMemo(
    () => cyclePayments.reduce((sum, tx) => sum + Math.abs(Number(tx.amount) || 0), 0),
    [cyclePayments],
  );

  const openAmount = useMemo(() => {
    if (!summary) return 0;
    const value = summary.currentTotal - paidTotal;
    return value > 0 ? value : 0;
  }, [summary, paidTotal]);

  const actions = (
    <Link
      href="/cards"
      className="inline-flex items-center gap-2 rounded-xl border border-violet-300/30 bg-violet-500/15 px-3 py-2 text-xs font-semibold text-violet-100 hover:bg-violet-500/25"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      Voltar
    </Link>
  );

  return (
    <AppShell
      title="Detalhes da fatura"
      subtitle="Resumo de compras, pagamentos e saldo em aberto"
      actions={actions}
      contentClassName="cards-ultra-bg"
    >
      {loading ? (
        <div className={CARD_CLASS}>Carregando fatura...</div>
      ) : (
        <div className="space-y-5">
          {feedback ? (
            <div className="rounded-xl border border-violet-300/30 bg-violet-950/35 px-4 py-3 text-sm text-violet-100">
              {feedback}
            </div>
          ) : null}

          {card && summary ? (
            <>
              <section className={`${CARD_CLASS} grid gap-3 md:grid-cols-4`}>
                <div>
                  <p className="text-xs text-slate-400">Cartao</p>
                  <p className="mt-1 inline-flex items-center gap-2 text-lg font-bold text-white">
                    <CreditCard className="h-4 w-4 text-violet-200" />
                    {card.name}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Fatura do ciclo</p>
                  <p className="mt-1 text-lg font-bold text-white">{brl(summary.currentTotal)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Pago no ciclo</p>
                  <p className="mt-1 text-lg font-bold text-emerald-300">{brl(paidTotal)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Em aberto</p>
                  <p className="mt-1 text-lg font-bold text-amber-200">{brl(openAmount)}</p>
                </div>
              </section>

              <section className={`${CARD_CLASS} grid gap-3 md:grid-cols-3`}>
                <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
                  <p className="text-xs text-slate-400">Fechamento</p>
                  <p className="mt-1 inline-flex items-center gap-2 font-semibold text-slate-100">
                    <Calendar className="h-4 w-4 text-slate-400" />
                    {formatDate(summary.closingDate)}
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
                  <p className="text-xs text-slate-400">Vencimento</p>
                  <p className="mt-1 inline-flex items-center gap-2 font-semibold text-slate-100">
                    <Calendar className="h-4 w-4 text-slate-400" />
                    {formatDate(summary.dueDate)}
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
                  <p className="text-xs text-slate-400">Limite disponivel</p>
                  <p className="mt-1 font-semibold text-emerald-300">{brl(summary.limitAvailable)}</p>
                </div>
              </section>

              <section className={CARD_CLASS}>
                <h2 className="text-sm font-bold text-white">Compras no ciclo atual</h2>
                {cycleItems.length ? (
                  <div className="mt-3 overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                      <thead className="text-xs text-slate-400">
                        <tr>
                          <th className="py-2 pr-4">Data</th>
                          <th className="py-2 pr-4">Descricao</th>
                          <th className="py-2 pr-4">Categoria</th>
                          <th className="py-2 pr-4">Valor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cycleItems.map((tx) => (
                          <tr key={tx.id} className="border-t border-white/10 text-slate-200">
                            <td className="py-2 pr-4">{formatDate(tx.occurred_at)}</td>
                            <td className="py-2 pr-4">{tx.description || "-"}</td>
                            <td className="py-2 pr-4">{tx.category || "-"}</td>
                            <td className="py-2 pr-4 font-semibold">{brl(Number(tx.amount) || 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-slate-400">Sem compras no ciclo atual.</p>
                )}
              </section>

              <section className={CARD_CLASS}>
                <h2 className="text-sm font-bold text-white">Pagamentos registrados</h2>
                {cyclePayments.length ? (
                  <div className="mt-3 overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                      <thead className="text-xs text-slate-400">
                        <tr>
                          <th className="py-2 pr-4">Data</th>
                          <th className="py-2 pr-4">Conta</th>
                          <th className="py-2 pr-4">Descricao</th>
                          <th className="py-2 pr-4">Valor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cyclePayments.map((tx) => (
                          <tr key={tx.id} className="border-t border-white/10 text-slate-200">
                            <td className="py-2 pr-4">{formatDate(dateOnly(tx.occurred_at))}</td>
                            <td className="py-2 pr-4">{accountById.get(tx.account_id || "")?.name || "-"}</td>
                            <td className="py-2 pr-4">{tx.description || "-"}</td>
                            <td className="py-2 pr-4 font-semibold text-emerald-300">
                              {brl(Math.abs(Number(tx.amount) || 0))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-slate-400">Sem pagamentos registrados para este ciclo.</p>
                )}
              </section>
            </>
          ) : null}
        </div>
      )}
    </AppShell>
  );
}
