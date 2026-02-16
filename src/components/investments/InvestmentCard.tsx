"use client";

import { BarChart3, Building2, Pencil, Trash2 } from "lucide-react";
import { MiniChart } from "@/components/investments/MiniChart";
import {
  calculateInvestmentStatus,
  calculateReturn,
} from "@/lib/calculateInvestment";
import { brl, formatPercent } from "@/lib/money";

export type InvestmentCardItem = {
  id: string;
  broker: string;
  investment_type: string;
  category: string;
  operation: "compra" | "venda";
  costs: number;
  dividends_received: number;
  asset_name: string;
  asset_logo_url: string | null;
  quantity: number;
  average_price: number;
  current_price: number;
  invested_amount: number;
  current_amount: number;
  price_history: number[];
};

type InvestmentCardProps = {
  item: InvestmentCardItem;
  deleting: boolean;
  editing: boolean;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
};

const formatQty = (value: number) =>
  value.toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  });

const statusStyles: Record<ReturnType<typeof calculateInvestmentStatus>, string> = {
  CARO: "border-rose-300/35 bg-rose-500/15 text-rose-200",
  NORMAL: "border-amber-300/35 bg-amber-500/15 text-amber-200",
  BARATO: "border-emerald-300/35 bg-emerald-500/15 text-emerald-200",
};

const resolveFallbackLogo = (item: InvestmentCardItem) => {
  const key = `${item.category} ${item.investment_type} ${item.asset_name}`.toLowerCase();

  if (key.includes("cripto") || key.includes("bitcoin") || key.includes("btc") || key.includes("eth")) {
    return "/custom/icons/bitcoin.png";
  }
  if (
    key.includes("acao") ||
    key.includes("ações") ||
    key.includes("renda_variavel") ||
    key.includes("fii") ||
    key.includes("etf")
  ) {
    return "/investments/equity.svg";
  }
  if (
    key.includes("renda_fixa") ||
    key.includes("cdb") ||
    key.includes("lci") ||
    key.includes("lca") ||
    key.includes("tesouro") ||
    key.includes("selic") ||
    key.includes("ipca") ||
    key.includes("poup") ||
    key.includes("caixinha")
  ) {
    return "/custom/icons/tesouro-direto.png";
  }
  if (key.includes("ouro") || key.includes("commodities")) {
    return "/custom/icons/barras-de-ouro.png";
  }

  return "/investments/other.svg";
};

export function InvestmentCard({ item, deleting, editing, onEdit, onDelete }: InvestmentCardProps) {
  const status = calculateInvestmentStatus(item.average_price, item.current_price);
  const { difference, percent } = calculateReturn(item.invested_amount, item.current_amount);
  const positive = difference >= 0;
  const isBuy = item.operation === "compra";
  const logoUrl = item.asset_logo_url || resolveFallbackLogo(item);

  return (
    <article className="group rounded-2xl border border-violet-300/25 bg-[linear-gradient(165deg,rgba(17,24,39,0.98),rgba(7,11,23,0.96))] p-4 shadow-[0_12px_34px_rgba(15,23,42,0.55)] transition-all duration-300 hover:-translate-y-0.5 hover:border-violet-300/45 hover:shadow-[0_18px_44px_rgba(124,58,237,0.28)]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-violet-300/25 bg-[#0a0f1d]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={logoUrl}
              alt={item.asset_name}
              className="h-full w-full object-contain"
              loading="lazy"
            />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="truncate text-lg font-bold text-white">{item.asset_name}</h4>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${isBuy ? "border-emerald-300/35 bg-emerald-500/15 text-emerald-200" : "border-rose-300/35 bg-rose-500/15 text-rose-200"}`}>
                {isBuy ? "COMPRA" : "VENDA"}
              </span>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusStyles[status]}`}>
                {status}
              </span>
            </div>
            <p className="line-clamp-1 text-xs text-slate-400">
              {item.broker} • {item.investment_type}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-lg border border-violet-300/35 bg-violet-500/10 p-1.5 text-violet-100 hover:bg-violet-500/20 disabled:opacity-60"
            onClick={() => onEdit(item.id)}
            disabled={deleting || editing}
            aria-label="Editar investimento"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="rounded-lg border border-rose-300/35 bg-rose-500/10 p-1.5 text-rose-200 hover:bg-rose-500/20 disabled:opacity-60"
            onClick={() => onDelete(item.id)}
            disabled={deleting || editing}
            aria-label="Excluir investimento"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <div className="rounded-xl border border-violet-300/20 bg-violet-950/20 p-3">
          <p className="text-[11px] text-slate-400">Quantidade</p>
          <p className="mt-1 text-sm font-bold text-slate-100">{formatQty(Math.abs(item.quantity))}</p>
        </div>
        <div className="rounded-xl border border-violet-300/20 bg-violet-950/20 p-3">
          <p className="text-[11px] text-slate-400">Preco medio</p>
          <p className="mt-1 text-sm font-bold text-slate-100">{brl(item.average_price)}</p>
        </div>
        <div className="rounded-xl border border-violet-300/20 bg-violet-950/20 p-3">
          <p className="text-[11px] text-slate-400">Preco atual</p>
          <p className="mt-1 text-sm font-bold text-cyan-200">{brl(item.current_price)}</p>
        </div>
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-700/60 bg-slate-900/70 p-3">
          <p className="text-[11px] text-slate-400">Total investido</p>
          <p className="mt-1 text-sm font-bold text-slate-100">{brl(item.invested_amount)}</p>
        </div>
        <div className="rounded-xl border border-slate-700/60 bg-slate-900/70 p-3">
          <p className="text-[11px] text-slate-400">Valor atual</p>
          <p className="mt-1 text-sm font-bold text-cyan-200">{brl(item.current_amount)}</p>
        </div>
      </div>

      <div className="mt-2 rounded-xl border border-slate-700/60 bg-slate-900/70 p-3">
        <p className="inline-flex items-center gap-1.5 text-[11px] text-slate-400">
          <BarChart3 className="h-3.5 w-3.5 text-violet-300" />
          Rentabilidade
        </p>
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className={`text-sm font-bold ${positive ? "text-emerald-300" : "text-rose-300"}`}>
            {formatPercent(percent)}
          </span>
          <span className={`text-sm font-bold ${positive ? "text-emerald-300" : "text-rose-300"}`}>
            {brl(difference)}
          </span>
        </div>
      </div>

      <div className="mt-3">
        <MiniChart prices={item.price_history} />
      </div>

      <div className="mt-2 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-1">
          <Building2 className="h-3 w-3" />
          Categoria: {item.category} • Custos: {brl(item.costs)}
        </span>
      </div>
    </article>
  );
}
