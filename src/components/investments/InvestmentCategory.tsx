"use client";

import { ChevronDown, Coins, Gem, Landmark, TrendingUp, Wallet } from "lucide-react";
import { InvestmentCard, type InvestmentCardItem } from "@/components/investments/InvestmentCard";
import { brl } from "@/lib/money";

type InvestmentCategoryProps = {
  category: string;
  items: InvestmentCardItem[];
  open: boolean;
  deletingId: string | null;
  editingId: string | null;
  onToggle: () => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
};

const CATEGORY_ICON_MAP = {
  Criptomoedas: Coins,
  "Tesouro Direto": Landmark,
  "Renda Fixa": Landmark,
  Acoes: TrendingUp,
  FIIs: TrendingUp,
  Commodities: Gem,
  Outros: Wallet,
} as const;

const CATEGORY_THEME_MAP = {
  Criptomoedas: {
    iconClass: "border-cyan-200/35 bg-cyan-300/18 text-cyan-100",
    tagClass: "border-cyan-200/35 bg-cyan-300/12 text-cyan-100",
  },
  "Tesouro Direto": {
    iconClass: "border-emerald-200/35 bg-emerald-300/18 text-emerald-100",
    tagClass: "border-emerald-200/35 bg-emerald-300/12 text-emerald-100",
  },
  "Renda Fixa": {
    iconClass: "border-emerald-200/35 bg-emerald-300/18 text-emerald-100",
    tagClass: "border-emerald-200/35 bg-emerald-300/12 text-emerald-100",
  },
  Acoes: {
    iconClass: "border-sky-200/35 bg-sky-300/18 text-sky-100",
    tagClass: "border-sky-200/35 bg-sky-300/12 text-sky-100",
  },
  FIIs: {
    iconClass: "border-sky-200/35 bg-sky-300/18 text-sky-100",
    tagClass: "border-sky-200/35 bg-sky-300/12 text-sky-100",
  },
  Commodities: {
    iconClass: "border-amber-200/35 bg-amber-300/18 text-amber-100",
    tagClass: "border-amber-200/35 bg-amber-300/12 text-amber-100",
  },
  Outros: {
    iconClass: "border-slate-300/35 bg-slate-300/12 text-slate-100",
    tagClass: "border-slate-300/35 bg-slate-300/12 text-slate-100",
  },
} as const;

export function InvestmentCategory({
  category,
  items,
  open,
  deletingId,
  editingId,
  onToggle,
  onEdit,
  onDelete,
}: InvestmentCategoryProps) {
  const categoryTotal = items.reduce(
    (sum, item) => sum + (item.operation === "venda" ? -item.current_amount : item.current_amount),
    0,
  );
  const Icon = CATEGORY_ICON_MAP[category as keyof typeof CATEGORY_ICON_MAP] || Wallet;
  const categoryTheme = CATEGORY_THEME_MAP[category as keyof typeof CATEGORY_THEME_MAP]
    || CATEGORY_THEME_MAP.Outros;

  return (
    <section className="rounded-3xl border border-slate-200/10 bg-slate-900/70 backdrop-blur-xl">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
        aria-expanded={open}
      >
        <div className="flex items-center gap-3">
          <span className={`grid h-10 w-10 place-items-center rounded-2xl border ${categoryTheme.iconClass}`}>
            <Icon className="h-4 w-4" />
          </span>
          <div>
            <h4 className="text-sm font-bold tracking-tight text-white">{category}</h4>
            <p className="text-xs text-slate-400">{items.length} ativo(s)</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${categoryTheme.tagClass}`}>
            {brl(categoryTotal)}
          </span>
        <ChevronDown
          className={`h-4 w-4 text-slate-300 transition-transform duration-300 ${open ? "rotate-180" : ""}`}
        />
        </div>
      </button>

      <div
        className={`overflow-hidden transition-all duration-300 ${open ? "max-h-[6000px] opacity-100" : "max-h-0 opacity-0"}`}
      >
        <div className="border-t border-slate-200/10 p-3">
          {items.length ? (
            <div className="grid gap-3 lg:grid-cols-2">
              {items.map((item) => (
                <InvestmentCard
                  key={item.id}
                  item={item}
                  deleting={deletingId === item.id}
                  editing={editingId === item.id}
                  onEdit={onEdit}
                  onDelete={onDelete}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200/10 bg-slate-950/45 p-3 text-sm text-slate-400">
              Nenhum investimento nesta categoria.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
