"use client";

import { useState } from "react";
import { ArrowDownRight, ArrowUpRight, Building2, Minus, Pencil } from "lucide-react";
import { MiniChart } from "@/components/investments/MiniChart";
import { DeleteActionButton } from "@/components/DeleteActionButton";
import { calculateReturn } from "@/lib/calculateInvestment";
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
  if (key.includes("cdb")) {
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
    return "/investments/fixed.svg";
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

const getTrendAppearance = (value: number) => {
  if (value > 0) {
    return {
      className: "text-emerald-200",
      Icon: ArrowUpRight,
      label: "No lucro",
    };
  }
  if (value < 0) {
    return {
      className: "text-rose-200",
      Icon: ArrowDownRight,
      label: "Abaixo do aporte",
    };
  }
  return {
    className: "text-slate-200",
    Icon: Minus,
    label: "No zero",
  };
};

type InvestmentAssetLogoProps = {
  assetName: string;
  preferredLogo: string | null;
  fallbackLogo: string;
};

function InvestmentAssetLogo({
  assetName,
  preferredLogo,
  fallbackLogo,
}: InvestmentAssetLogoProps) {
  const [imageSource, setImageSource] = useState<"preferred" | "fallback" | "none">(
    preferredLogo ? "preferred" : "fallback",
  );
  const assetInitials = toAssetInitials(assetName);
  const logoUrl = imageSource === "preferred"
    ? preferredLogo
    : imageSource === "fallback"
      ? fallbackLogo
      : null;

  return (
    <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-2xl border border-slate-200/15 bg-slate-900/85">
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt={assetName}
          className="h-full w-full object-contain p-2.5"
          loading="lazy"
          onError={() => {
            if (imageSource === "preferred" && preferredLogo && preferredLogo !== fallbackLogo) {
              setImageSource("fallback");
              return;
            }
            setImageSource("none");
          }}
        />
      ) : (
        <span className="text-sm font-bold tracking-wide text-slate-100">{assetInitials}</span>
      )}
    </div>
  );
}

export function InvestmentCard({ item, deleting, editing, onEdit, onDelete }: InvestmentCardProps) {
  const { difference, percent } = calculateReturn(item.invested_amount, item.current_amount);
  const isBuy = item.operation === "compra";
  const preferredLogo = item.asset_logo_url?.trim() || null;
  const fallbackLogo = resolveFallbackLogo(item);
  const resultTrend = getTrendAppearance(difference);

  return (
    <article className="group rounded-3xl border border-slate-200/10 bg-slate-950/68 p-4 shadow-[0_22px_44px_rgba(2,6,23,0.42)] transition-all duration-300 hover:-translate-y-0.5 hover:border-slate-200/20 hover:shadow-[0_28px_52px_rgba(2,6,23,0.54)] sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <InvestmentAssetLogo
            key={`${item.id}-${preferredLogo || "none"}-${fallbackLogo}`}
            assetName={item.asset_name}
            preferredLogo={preferredLogo}
            fallbackLogo={fallbackLogo}
          />

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
              <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${resultTrend.className} ${
                difference > 0
                  ? "border-emerald-200/28 bg-emerald-400/10"
                  : difference < 0
                    ? "border-rose-200/28 bg-rose-400/10"
                    : "border-slate-300/22 bg-slate-700/35"
              }`}>
                <resultTrend.Icon className="h-3 w-3" />
                {resultTrend.label}
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
          <p className="text-[11px] uppercase tracking-[0.08em] text-slate-400">Aporte total</p>
          <p className="mt-1 text-sm font-bold text-slate-100">{brl(item.invested_amount)}</p>
        </div>
        <div className="rounded-2xl border border-slate-200/10 bg-slate-900/85 p-3">
          <p className="text-[11px] uppercase tracking-[0.08em] text-slate-400">Valor hoje</p>
          <p className="mt-1 text-sm font-bold text-slate-100">{brl(item.current_amount)}</p>
        </div>
        <div className="rounded-2xl border border-slate-200/10 bg-slate-900/85 p-3">
          <p className="text-[11px] uppercase tracking-[0.08em] text-slate-400">Resultado</p>
          <p className={`mt-1 text-sm font-bold ${resultTrend.className}`}>{brl(difference)}</p>
          <p className={`text-xs font-semibold ${resultTrend.className}`}>{formatPercent(percent)}</p>
        </div>
      </div>

      <div className="mt-3 rounded-2xl border border-slate-200/10 bg-slate-900/78 p-3">
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-400">
          <span>
            Quantidade: <span className="font-semibold text-slate-100">{formatQty(Math.abs(item.quantity))}</span>
          </span>
          <span>
            Preco medio: <span className="font-semibold text-slate-100">{brl(item.average_price)}</span>
          </span>
          <span>
            Preco atual: <span className="font-semibold text-slate-100">{brl(item.current_price)}</span>
          </span>
          <span>
            Custos: <span className="font-semibold text-slate-100">{brl(item.costs)}</span>
          </span>
        </div>
      </div>

      <div className="mt-3">
        <MiniChart prices={item.price_history} />
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <Building2 className="h-3 w-3" />
          Categoria: {item.category}
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
