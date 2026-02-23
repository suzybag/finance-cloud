"use client";

import { useMemo, useState } from "react";
import { BarChart3, Building2, Pencil } from "lucide-react";
import { MiniChart } from "@/components/investments/MiniChart";
import { DeleteActionButton } from "@/components/DeleteActionButton";
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
  CARO: "border-rose-200/26 bg-rose-400/10 text-rose-100",
  NORMAL: "border-slate-300/22 bg-slate-700/35 text-slate-100",
  BARATO: "border-emerald-200/26 bg-emerald-400/10 text-emerald-100",
};

const resolveFallbackLogo = (item: InvestmentCardItem) => {
  const key = `${item.category} ${item.investment_type} ${item.asset_name}`.toLowerCase();

  if (key.includes("ethereum") || key.includes("(eth)") || /\beth\b/.test(key)) {
    return "https://assets.coincap.io/assets/icons/eth@2x.png";
  }
  if (key.includes("xrp")) {
    return "https://assets.coincap.io/assets/icons/xrp@2x.png";
  }
  if (key.includes("usdc")) {
    return "https://assets.coincap.io/assets/icons/usdc@2x.png";
  }
  if (key.includes("caixinha")) {
    return "/custom/icons/CDB-Caixinha.webp";
  }
  if (key.includes("cripto") || key.includes("bitcoin") || key.includes("btc") || key.includes("eth")) {
    return "/custom/icons/bitcoin.png";
  }
  if (
    key.includes("acao")
    || key.includes("acoes")
    || key.includes("renda_variavel")
    || key.includes("fii")
    || key.includes("etf")
  ) {
    return "/investments/equity.svg";
  }
  if (
    key.includes("renda_fixa")
    || key.includes("cdb")
    || key.includes("lci")
    || key.includes("lca")
    || key.includes("tesouro")
    || key.includes("selic")
    || key.includes("ipca")
    || key.includes("poup")
  ) {
    return "/custom/icons/barras-de-ouro.png";
  }
  if (key.includes("ouro") || key.includes("commodities")) {
    return "/custom/icons/barras-de-ouro.png";
  }

  return "/investments/other.svg";
};

const toAssetInitials = (name: string) =>
  name
    .split(" ")
    .map((word) => word.trim()[0] || "")
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()
    || "AT";

export function InvestmentCard({ item, deleting, editing, onEdit, onDelete }: InvestmentCardProps) {
  const status = calculateInvestmentStatus(item.average_price, item.current_price);
  const { difference, percent } = calculateReturn(item.invested_amount, item.current_amount);
  const positive = difference >= 0;
  const isBuy = item.operation === "compra";
  const [logoFailed, setLogoFailed] = useState(false);
  const logoUrl = !logoFailed ? (item.asset_logo_url || resolveFallbackLogo(item)) : null;
  const assetInitials = useMemo(() => toAssetInitials(item.asset_name), [item.asset_name]);

  return (
    <article className="group rounded-3xl border border-slate-200/10 bg-slate-950/68 p-4 shadow-[0_22px_44px_rgba(2,6,23,0.42)] transition-all duration-300 hover:-translate-y-0.5 hover:border-slate-200/20 hover:shadow-[0_28px_52px_rgba(2,6,23,0.54)] sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-2xl border border-slate-200/15 bg-slate-900/85">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt={item.asset_name}
                className="h-full w-full object-contain p-2.5"
                loading="lazy"
                onError={() => setLogoFailed(true)}
              />
            ) : (
              <span className="text-sm font-bold tracking-wide text-slate-100">{assetInitials}</span>
            )}
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="truncate text-lg font-bold tracking-tight text-white">{item.asset_name}</h4>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${
                isBuy
                  ? "border-emerald-200/28 bg-emerald-400/10 text-emerald-100"
                  : "border-rose-200/28 bg-rose-400/10 text-rose-100"
              }`}>
                {isBuy ? "Compra" : "Venda"}
              </span>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusStyles[status]}`}>
                {status}
              </span>
            </div>
            <p className="line-clamp-1 text-xs text-slate-400">
              {item.broker} - {item.investment_type}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-xl border border-slate-200/20 bg-slate-800/50 p-1.5 text-slate-100 transition hover:border-slate-200/35 hover:bg-slate-700/55 disabled:opacity-60"
            onClick={() => onEdit(item.id)}
            disabled={deleting || editing}
            aria-label="Editar investimento"
          >
            <Pencil className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200/10 bg-slate-900/85 p-3">
          <p className="text-[11px] uppercase tracking-[0.08em] text-slate-400">Quantidade</p>
          <p className="mt-1 text-sm font-bold text-slate-100">{formatQty(Math.abs(item.quantity))}</p>
        </div>
        <div className="rounded-2xl border border-slate-200/10 bg-slate-900/85 p-3">
          <p className="text-[11px] uppercase tracking-[0.08em] text-slate-400">Preco medio</p>
          <p className="mt-1 text-sm font-bold text-slate-100">{brl(item.average_price)}</p>
        </div>
        <div className="rounded-2xl border border-slate-200/10 bg-slate-900/85 p-3">
          <p className="text-[11px] uppercase tracking-[0.08em] text-slate-400">Preco atual</p>
          <p className="mt-1 text-sm font-bold text-slate-100">{brl(item.current_price)}</p>
        </div>
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200/10 bg-slate-900/78 p-3">
          <p className="text-[11px] uppercase tracking-[0.08em] text-slate-400">Total investido</p>
          <p className="mt-1 text-sm font-bold text-slate-100">{brl(item.invested_amount)}</p>
        </div>
        <div className="rounded-2xl border border-slate-200/10 bg-slate-900/78 p-3">
          <p className="text-[11px] uppercase tracking-[0.08em] text-slate-400">Valor atual</p>
          <p className="mt-1 text-sm font-bold text-slate-100">{brl(item.current_amount)}</p>
        </div>
      </div>

      <div className="mt-2 rounded-2xl border border-slate-200/10 bg-slate-900/78 p-3">
        <p className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.08em] text-slate-400">
          <BarChart3 className="h-3.5 w-3.5 text-slate-300" />
          Rentabilidade
        </p>
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className={`text-sm font-bold ${positive ? "text-emerald-200" : "text-rose-200"}`}>
            {formatPercent(percent)}
          </span>
          <span className={`text-sm font-bold ${positive ? "text-emerald-200" : "text-rose-200"}`}>
            {brl(difference)}
          </span>
        </div>
      </div>

      <div className="mt-3">
        <MiniChart prices={item.price_history} />
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <Building2 className="h-3 w-3" />
          Categoria: {item.category} - Custos: {brl(item.costs)}
        </span>
        <DeleteActionButton
          onClick={() => onDelete(item.id)}
          disabled={deleting || editing}
          label="Excluir"
          ariaLabel={`Excluir investimento ${item.asset_name}`}
          size="sm"
        />
      </div>
    </article>
  );
}
