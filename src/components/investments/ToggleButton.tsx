"use client";

import { ArrowDownRight, ArrowUpRight } from "lucide-react";

type ToggleVariant = "buy" | "sell";

type ToggleButtonProps = {
  variant: ToggleVariant;
  active: boolean;
  onClick: () => void;
};

const contentByVariant = {
  buy: {
    label: "Compra",
    Icon: ArrowUpRight,
    activeClass: "bg-emerald-300 text-slate-950 border-emerald-100/60 shadow-[0_10px_24px_rgba(16,185,129,0.36)]",
    idleClass: "bg-transparent text-slate-300 border-transparent hover:bg-emerald-400/12",
  },
  sell: {
    label: "Venda",
    Icon: ArrowDownRight,
    activeClass: "bg-rose-300 text-slate-950 border-rose-100/60 shadow-[0_10px_24px_rgba(244,63,94,0.36)]",
    idleClass: "bg-transparent text-slate-300 border-transparent hover:bg-rose-400/12",
  },
} as const;

export function ToggleButton({ variant, active, onClick }: ToggleButtonProps) {
  const config = contentByVariant[variant];
  const Icon = config.Icon;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-center gap-2 rounded-2xl border px-3 py-2 text-sm font-semibold transition-all duration-200 ${
        active ? config.activeClass : config.idleClass
      }`}
      aria-pressed={active}
    >
      <Icon className="h-4 w-4" />
      {config.label}
    </button>
  );
}
