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
  "Renda Fixa": Landmark,
  Acoes: TrendingUp,
  Commodities: Gem,
  Outros: Wallet,
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

  return (
    <section className="rounded-2xl border border-violet-300/30 bg-[linear-gradient(160deg,rgba(31,18,56,0.9),rgba(12,10,30,0.95))]">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        aria-expanded={open}
      >
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-full border border-violet-300/35 bg-violet-500/15 text-violet-100 shadow-[0_8px_18px_rgba(124,58,237,0.28)]">
            <Icon className="h-4 w-4" />
          </span>
          <div>
            <h4 className="text-sm font-bold text-white">{category}</h4>
            <p className="text-xs text-slate-400">
              {items.length} ativo(s) - {brl(categoryTotal)}
            </p>
          </div>
        </div>
        <ChevronDown
          className={`h-4 w-4 text-violet-200 transition-transform duration-300 ${open ? "rotate-180" : ""}`}
        />
      </button>

      <div
        className={`overflow-hidden transition-all duration-300 ${open ? "max-h-[6000px] opacity-100" : "max-h-0 opacity-0"}`}
      >
        <div className="border-t border-violet-300/15 p-3">
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
            <div className="rounded-xl border border-violet-300/15 bg-[#0b1020]/65 p-3 text-sm text-slate-400">
              Nenhum investimento nesta categoria.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
