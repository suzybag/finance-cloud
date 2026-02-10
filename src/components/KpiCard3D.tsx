import Image from "next/image";

type KpiCard3DProps = {
  title: string;
  value: string;
  subtitle: string;
  iconSrc: string;
  tone?: "neutral" | "emerald" | "blue" | "violet";
};

const toneClassMap: Record<NonNullable<KpiCard3DProps["tone"]>, string> = {
  neutral: "from-slate-400/20 to-slate-300/5 text-slate-200",
  emerald: "from-emerald-400/25 to-emerald-300/10 text-emerald-200",
  blue: "from-blue-400/25 to-blue-300/10 text-blue-200",
  violet: "from-violet-400/25 to-violet-300/10 text-violet-200",
};

export function KpiCard3D({
  title,
  value,
  subtitle,
  iconSrc,
  tone = "neutral",
}: KpiCard3DProps) {
  return (
    <article className="glass-panel group relative overflow-hidden p-4">
      <div className={`pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-r ${toneClassMap[tone]} opacity-70`} />
      <div className="relative flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-300/90">{title}</p>
          <p className="mt-1 text-3xl font-extrabold tracking-tight text-slate-100">{value}</p>
          <p className="mt-1 text-xs text-slate-400">{subtitle}</p>
        </div>

        <div className="relative h-[52px] w-[52px] shrink-0 rounded-2xl border border-white/10 bg-slate-900/45 p-1 backdrop-blur-md">
          <Image
            src={iconSrc}
            alt={title}
            width={52}
            height={52}
            className="h-full w-full drop-shadow-[0_10px_25px_rgba(0,0,0,0.45)] opacity-95"
          />
        </div>
      </div>
    </article>
  );
}
