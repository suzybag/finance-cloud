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

export function StatCard({
  title,
  value,
  icon: Icon,
  valueClassName,
  extra,
  index = 0,
}: StatCardProps) {
  return (
    <article
      className="investment-stat-enter rounded-2xl border border-violet-300/25 bg-[linear-gradient(160deg,rgba(24,14,45,0.92),rgba(12,10,30,0.95))] p-4 shadow-[0_12px_34px_rgba(11,8,28,0.55)] backdrop-blur-xl"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
        <span className="grid h-8 w-8 place-items-center rounded-lg border border-violet-300/25 bg-violet-900/25 text-violet-100">
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className={`mt-3 text-3xl font-extrabold tracking-tight text-white ${valueClassName ?? ""}`}>
        {value}
      </p>
      {extra ? <div className="mt-2">{extra}</div> : null}
    </article>
  );
}
