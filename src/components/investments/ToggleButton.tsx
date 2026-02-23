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
    activeClass: "bg-slate-100 text-slate-950 border-slate-100/70 shadow-[0_10px_24px_rgba(15,23,42,0.32)]",
    idleClass: "bg-transparent text-slate-300 border-transparent hover:bg-slate-700/35",
  },
  sell: {
    label: "Venda",
    Icon: ArrowDownRight,
    activeClass: "bg-slate-100 text-slate-950 border-slate-100/70 shadow-[0_10px_24px_rgba(15,23,42,0.32)]",
    idleClass: "bg-transparent text-slate-300 border-transparent hover:bg-slate-700/35",
  },
} as const;

export function ToggleButton({ variant, active, onClick }: ToggleButtonProps) {
  const config = contentByVariant[variant];
  const Icon = config.Icon;
  const iconTone = active
    ? variant === "buy"
      ? "text-emerald-600"
      : "text-rose-600"
    : "text-slate-400";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-center gap-2 rounded-2xl border px-3 py-2 text-sm font-semibold transition-all duration-200 ${
        active ? config.activeClass : config.idleClass
      }`}
      aria-pressed={active}
    >
      <Icon className={`h-4 w-4 ${iconTone}`} />
      {config.label}
    </button>
  );
}
