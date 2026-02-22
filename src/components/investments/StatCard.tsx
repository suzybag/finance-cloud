"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

type StatCardProps = {
  title: string;
  value: string;
  icon: LucideIcon;
  valueClassName?: string;
  extra?: ReactNode;
  index?: number;
};

const ACCENT_STYLES = [
  {
    cardShadow: "shadow-[0_20px_40px_rgba(34,211,238,0.14)]",
    iconClass: "border-cyan-200/30 bg-cyan-300/15 text-cyan-100",
    valueClass: "text-cyan-100",
  },
  {
    cardShadow: "shadow-[0_20px_40px_rgba(16,185,129,0.14)]",
    iconClass: "border-emerald-200/30 bg-emerald-300/15 text-emerald-100",
    valueClass: "text-emerald-100",
  },
  {
    cardShadow: "shadow-[0_20px_40px_rgba(251,146,60,0.14)]",
    iconClass: "border-orange-200/30 bg-orange-300/15 text-orange-100",
    valueClass: "text-orange-100",
  },
  {
    cardShadow: "shadow-[0_20px_40px_rgba(96,165,250,0.14)]",
    iconClass: "border-sky-200/30 bg-sky-300/15 text-sky-100",
    valueClass: "text-sky-100",
  },
] as const;

export function StatCard({
  title,
  value,
  icon: Icon,
  valueClassName,
  extra,
  index = 0,
}: StatCardProps) {
  const accent = ACCENT_STYLES[index % ACCENT_STYLES.length];

  return (
    <article
      className={`investment-stat-enter rounded-3xl border border-slate-200/10 bg-slate-900/72 p-4 backdrop-blur-xl ${accent.cardShadow}`}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold tracking-tight text-slate-200">{title}</h3>
        <span className={`grid h-9 w-9 place-items-center rounded-xl border ${accent.iconClass}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className={`mt-3 text-3xl font-extrabold tracking-tight ${valueClassName ?? accent.valueClass}`}>
        {value}
      </p>
      {extra ? <div className="mt-2">{extra}</div> : null}
    </article>
  );
}
