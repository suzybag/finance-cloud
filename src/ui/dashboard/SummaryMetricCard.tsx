type SummaryMetricCardProps = {
  label: string;
  value: string;
  caption: string;
  tone: "income" | "expense";
};

const toneStyles: Record<SummaryMetricCardProps["tone"], string> = {
  income: "bg-emerald-500/18 text-emerald-300 border-emerald-400/25",
  expense: "bg-rose-500/18 text-rose-300 border-rose-400/25",
};

export const SummaryMetricCard = ({
  label,
  value,
  caption,
  tone,
}: SummaryMetricCardProps) => {
  return (
    <article className="rounded-[18px] border border-white/10 bg-[#1c1c1e] p-5 shadow-[0_8px_20px_rgba(0,0,0,0.18)]">
      <div className="flex items-center gap-3">
        <span
          className={`inline-flex h-8 w-8 items-center justify-center rounded-full border text-sm font-bold ${toneStyles[tone]}`}
        >
          {tone === "income" ? "+" : "-"}
        </span>
        <p className="text-sm font-medium text-slate-300">{label}</p>
      </div>

      <p className="mt-3 text-3xl font-bold tracking-tight text-slate-100">{value}</p>
      <p className="mt-1 text-sm text-slate-400">{caption}</p>
    </article>
  );
};

