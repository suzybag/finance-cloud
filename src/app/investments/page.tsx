"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  CircleDollarSign,
  Loader2,
  Plus,
  TrendingUp,
  Wallet,
} from "lucide-react";
import {
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppShell } from "@/components/AppShell";
import { AddInvestmentModal, type AddInvestmentPayload } from "@/components/investments/AddInvestmentModal";
import { InvestmentCard, type InvestmentCardItem } from "@/components/investments/InvestmentCard";
import { buildMonthlyEvolution, calculateCompound } from "@/lib/calculateInvestment";
import { brl, formatPercent, toNumber } from "@/lib/money";
import { supabase } from "@/lib/supabaseClient";

type InvestmentRow = InvestmentCardItem & {
  user_id: string;
  created_at: string;
};

type RawInvestmentRow = Partial<InvestmentRow> & {
  invested_amount?: number | string | null;
  current_amount?: number | string | null;
  annual_rate?: number | string | null;
};

type DistributionPoint = {
  name: string;
  value: number;
};

const SECTION_CLASS =
  "rounded-2xl border border-[#7C3AED40] bg-[linear-gradient(165deg,rgba(17,24,39,0.94),rgba(7,11,23,0.95))] shadow-[0_16px_42px_rgba(15,23,42,0.55)] backdrop-blur-xl";

const PRIMARY_BUTTON_CLASS =
  "inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 via-fuchsia-500 to-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(124,58,237,0.4)] transition hover:brightness-110";

const PIE_COLORS = ["#7C3AED", "#A855F7", "#22D3EE", "#38BDF8", "#6366F1", "#EC4899"];

const tooltipStyle = {
  background: "rgba(15, 23, 42, 0.95)",
  border: "1px solid rgba(124,58,237,0.35)",
  borderRadius: 12,
  color: "#e2e8f0",
};

const roundCurrency = (value: number) => Math.round(value * 100) / 100;

const normalizeInvestment = (row: RawInvestmentRow): InvestmentRow | null => {
  if (!row.id || !row.user_id || !row.start_date) return null;

  return {
    id: row.id,
    user_id: row.user_id,
    broker: row.broker || "Nao informado",
    investment_type: row.investment_type || "Nao informado",
    invested_amount: toNumber(row.invested_amount),
    current_amount: toNumber(row.current_amount),
    annual_rate: row.annual_rate === null || typeof row.annual_rate === "undefined"
      ? null
      : toNumber(row.annual_rate),
    start_date: row.start_date,
    created_at: row.created_at || new Date().toISOString(),
  };
};

export default function InvestmentsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [investments, setInvestments] = useState<InvestmentRow[]>([]);

  const loadInvestments = useCallback(async () => {
    setLoading(true);
    setFeedback(null);

    const { data: userData, error: userError } = await supabase.auth.getUser();
    const resolvedUserId = userData.user?.id ?? null;

    if (userError || !resolvedUserId) {
      setFeedback("Sessao nao encontrada. Entre novamente.");
      setLoading(false);
      return;
    }

    setUserId(resolvedUserId);

    const { data, error } = await supabase
      .from("investments")
      .select("*")
      .eq("user_id", resolvedUserId)
      .order("created_at", { ascending: false });

    if (error) {
      const baseMessage = /relation .*investments/i.test(error.message)
        ? "Tabela investments nao encontrada. Rode o supabase.sql atualizado."
        : error.message;
      setFeedback(`Falha ao carregar investimentos: ${baseMessage}`);
      setLoading(false);
      return;
    }

    const normalized = ((data || []) as RawInvestmentRow[])
      .map(normalizeInvestment)
      .filter((item): item is InvestmentRow => !!item);

    const recalculated = normalized.map((item) => {
      const currentAmount = calculateCompound({
        principal: item.invested_amount,
        annualRate: item.annual_rate ?? 0,
        startDate: item.start_date,
      });

      return {
        ...item,
        current_amount: roundCurrency(currentAmount),
      };
    });

    setInvestments(recalculated);
    setLoading(false);

    const updates = recalculated.filter(
      (item, index) => Math.abs(item.current_amount - normalized[index].current_amount) >= 0.01,
    );

    if (!updates.length) return;

    await Promise.allSettled(
      updates.map((item) =>
        supabase
          .from("investments")
          .update({ current_amount: item.current_amount })
          .eq("id", item.id),
      ),
    );
  }, []);

  useEffect(() => {
    void loadInvestments();
  }, [loadInvestments]);

  const handleAddInvestment = async (payload: AddInvestmentPayload) => {
    setSaving(true);
    setFeedback(null);

    const resolvedUserId = userId || (await supabase.auth.getUser()).data.user?.id || null;
    if (!resolvedUserId) {
      setSaving(false);
      setFeedback("Sessao nao carregada. Faca login novamente.");
      return;
    }

    const calculatedAmount = calculateCompound({
      principal: payload.investedAmount,
      annualRate: payload.annualRate,
      startDate: payload.startDate,
    });

    const { error } = await supabase.from("investments").insert({
      user_id: resolvedUserId,
      broker: payload.broker,
      investment_type: payload.investmentType,
      invested_amount: payload.investedAmount,
      current_amount: roundCurrency(calculatedAmount),
      annual_rate: payload.annualRate,
      start_date: payload.startDate,
    });

    if (error) {
      setSaving(false);
      setFeedback(`Nao foi possivel salvar investimento: ${error.message}`);
      return;
    }

    setSaving(false);
    setShowModal(false);
    setFeedback("Investimento salvo com sucesso.");
    await loadInvestments();
  };

  const handleDelete = async (investmentId: string) => {
    const confirmed = window.confirm("Excluir este investimento?");
    if (!confirmed) return;

    setDeletingId(investmentId);
    setFeedback(null);

    const { error } = await supabase.from("investments").delete().eq("id", investmentId);
    setDeletingId(null);

    if (error) {
      setFeedback(`Nao foi possivel excluir: ${error.message}`);
      return;
    }

    setFeedback("Investimento excluido.");
    await loadInvestments();
  };

  const summary = useMemo(() => {
    const totalInvested = investments.reduce((sum, item) => sum + item.invested_amount, 0);
    const totalCurrent = investments.reduce((sum, item) => sum + item.current_amount, 0);
    const profit = totalCurrent - totalInvested;
    const profitability = totalInvested > 0 ? (profit / totalInvested) * 100 : 0;

    return {
      totalInvested,
      totalCurrent,
      profit,
      profitability,
    };
  }, [investments]);

  const distributionData = useMemo(() => {
    const grouped = new Map<string, number>();
    investments.forEach((item) => {
      const prev = grouped.get(item.investment_type) ?? 0;
      grouped.set(item.investment_type, prev + item.current_amount);
    });
    return Array.from(grouped.entries())
      .map(([name, value]) => ({ name, value: roundCurrency(value) } satisfies DistributionPoint))
      .sort((a, b) => b.value - a.value);
  }, [investments]);

  const monthlySeries = useMemo(
    () =>
      buildMonthlyEvolution(
        investments.map((item) => ({
          principal: item.invested_amount,
          annualRate: item.annual_rate ?? 0,
          startDate: item.start_date,
        })),
      ),
    [investments],
  );

  return (
    <AppShell
      title="Investimentos"
      subtitle="Rendimento automatico com juros compostos mensais"
      contentClassName="investments-ultra-bg"
    >
      <AddInvestmentModal
        open={showModal}
        saving={saving}
        onClose={() => setShowModal(false)}
        onSave={handleAddInvestment}
      />

      {loading ? (
        <div className={`${SECTION_CLASS} p-6 text-slate-200`}>
          <span className="inline-flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando investimentos...
          </span>
        </div>
      ) : (
        <div className="space-y-6">
          {feedback ? (
            <div className="rounded-xl border border-violet-300/30 bg-violet-950/35 px-4 py-3 text-sm text-violet-100">
              {feedback}
            </div>
          ) : null}

          <section className={`${SECTION_CLASS} p-5`}>
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-xl font-extrabold tracking-tight text-white">Carteira de investimentos</h2>
                <p className="mt-1 text-sm text-slate-300">
                  Visao consolidada com rendimento recalculado automaticamente.
                </p>
              </div>
              <button
                type="button"
                className={PRIMARY_BUTTON_CLASS}
                onClick={() => setShowModal(true)}
              >
                <Plus className="h-4 w-4" />
                Adicionar investimento
              </button>
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className={`${SECTION_CLASS} p-4`}>
              <p className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.08em] text-slate-400">
                <Wallet className="h-4 w-4 text-violet-300" />
                Total investido
              </p>
              <p className="mt-2 text-2xl font-extrabold text-white">{brl(summary.totalInvested)}</p>
            </div>
            <div className={`${SECTION_CLASS} p-4`}>
              <p className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.08em] text-slate-400">
                <CircleDollarSign className="h-4 w-4 text-cyan-300" />
                Total atual
              </p>
              <p className="mt-2 text-2xl font-extrabold text-cyan-200">{brl(summary.totalCurrent)}</p>
            </div>
            <div className={`${SECTION_CLASS} p-4`}>
              <p className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.08em] text-slate-400">
                <TrendingUp className="h-4 w-4 text-emerald-300" />
                Rentabilidade total
              </p>
              <p className={`mt-2 text-2xl font-extrabold ${summary.profitability >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                {formatPercent(summary.profitability)}
              </p>
            </div>
            <div className={`${SECTION_CLASS} p-4`}>
              <p className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.08em] text-slate-400">
                <Activity className="h-4 w-4 text-violet-300" />
                Lucro / prejuizo
              </p>
              <p className={`mt-2 text-2xl font-extrabold ${summary.profit >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                {brl(summary.profit)}
              </p>
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
            <div className={`${SECTION_CLASS} p-5`}>
              <h3 className="text-lg font-bold text-white">Distribuicao por tipo</h3>
              <p className="text-sm text-slate-400">Participacao atual da carteira por classe.</p>
              <div className="mt-3 h-[300px] w-full">
                {distributionData.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={distributionData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={72}
                        outerRadius={105}
                        paddingAngle={2}
                        stroke="rgba(255,255,255,0.14)"
                      >
                        {distributionData.map((entry, index) => (
                          <Cell
                            key={`${entry.name}-${index}`}
                            fill={PIE_COLORS[index % PIE_COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: number | string | undefined) => [brl(Number(value) || 0), "Valor atual"]}
                        contentStyle={tooltipStyle}
                      />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="grid h-full place-items-center rounded-xl border border-violet-300/20 bg-slate-950/45 text-sm text-slate-400">
                    Sem dados para distribuicao.
                  </div>
                )}
              </div>
            </div>

            <div className={`${SECTION_CLASS} p-5`}>
              <h3 className="text-lg font-bold text-white">Evolucao mensal</h3>
              <p className="text-sm text-slate-400">
                Curva de crescimento com base em juros compostos mensais.
              </p>
              <div className="mt-3 h-[300px] w-full">
                {monthlySeries.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={monthlySeries}>
                      <CartesianGrid strokeDasharray="4 4" stroke="rgba(124,58,237,0.18)" />
                      <XAxis dataKey="month" tick={{ fill: "#94a3b8", fontSize: 12 }} />
                      <YAxis
                        tick={{ fill: "#94a3b8", fontSize: 12 }}
                        tickFormatter={(value: number) => `R$${Math.round(value / 1000)}k`}
                      />
                      <Tooltip
                        formatter={(value: number | string | undefined, name: string | undefined) => [
                          brl(Number(value) || 0),
                          name === "invested" ? "Total investido" : "Total atual",
                        ]}
                        contentStyle={tooltipStyle}
                      />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="invested"
                        name="Total investido"
                        stroke="#A78BFA"
                        strokeWidth={2}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="totalValue"
                        name="Total atual"
                        stroke="#22D3EE"
                        strokeWidth={3}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="grid h-full place-items-center rounded-xl border border-violet-300/20 bg-slate-950/45 text-sm text-slate-400">
                    Adicione investimentos para ver a evolucao.
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className={`${SECTION_CLASS} p-5`}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">Lista de investimentos</h3>
              <span className="text-xs text-slate-400">{investments.length} item(ns)</span>
            </div>
            {investments.length ? (
              <div className="grid gap-4 xl:grid-cols-2">
                {investments.map((item) => (
                  <InvestmentCard
                    key={item.id}
                    item={item}
                    deleting={deletingId === item.id}
                    onDelete={(id) => void handleDelete(id)}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-violet-300/20 bg-slate-950/45 p-4 text-sm text-slate-400">
                Nenhum investimento cadastrado.
              </div>
            )}
          </section>
        </div>
      )}
    </AppShell>
  );
}
