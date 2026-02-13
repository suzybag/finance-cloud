"use client";

import { ChevronDown } from "lucide-react";
import { InvestmentCard, type InvestmentCardItem } from "@/components/investments/InvestmentCard";
import { brl } from "@/lib/money";

type InvestmentCategoryProps = {
  category: string;
  items: InvestmentCardItem[];
  open: boolean;
  deletingId: string | null;
  onToggle: () => void;
  onDelete: (id: string) => void;
};

export function InvestmentCategory({
  category,
  items,
  open,
  deletingId,
  onToggle,
  onDelete,
}: InvestmentCategoryProps) {
  const categoryTotal = items.reduce(
    (sum, item) => sum + (item.operation === "venda" ? -item.current_amount : item.current_amount),
    0,
  );

  return (
    <section className="rounded-2xl border border-violet-300/25 bg-[linear-gradient(160deg,rgba(17,24,39,0.92),rgba(8,12,24,0.95))]">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        aria-expanded={open}
      >
        <div>
          <h4 className="text-sm font-bold text-white">{category}</h4>
          <p className="text-xs text-slate-400">
            {items.length} ativo(s) • {brl(categoryTotal)}
          </p>
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
