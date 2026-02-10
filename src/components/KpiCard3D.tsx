import Image from "next/image";
import type { LucideIcon } from "lucide-react";

type KpiCard3DProps = {
  title: string;
  value: string;
  subtitle: string;
  iconSrc: string;
  icon?: LucideIcon;
  iconBgClassName?: string;
  iconColorClassName?: string;
  tone?: "neutral" | "emerald" | "blue" | "violet";
};

const toneClassMap: Record<NonNullable<KpiCard3DProps["tone"]>, string> = {
  neutral: "bg-white/12",
  emerald: "bg-[#22c55e]/45",
  blue: "bg-[#ef4444]/42",
  violet: "bg-[#7c3aed]/44",
};

export function KpiCard3D({
  title,
  value,
  subtitle,
  iconSrc,
  icon: Icon,
  iconBgClassName = "bg-slate-800/70",
  iconColorClassName = "text-white",
  tone = "neutral",
}: KpiCard3DProps) {
  return (
    <article className="group relative overflow-hidden rounded-[18px] border border-white/6 bg-[#1c1c1e] p-4 shadow-[0_4px_14px_rgba(0,0,0,0.22)]">
      <div className={`pointer-events-none absolute inset-x-0 top-0 h-px ${toneClassMap[tone]}`} />
      <div className="relative flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-normal text-[#9ca3af]">{title}</p>
          <p className="mt-1 text-[2rem] font-bold leading-tight tracking-tight text-slate-100">{value}</p>
          <p className="mt-1 text-xs font-normal text-[#9ca3af]">{subtitle}</p>
        </div>

        <div className={`relative grid h-12 w-12 shrink-0 place-items-center rounded-full border border-white/10 ${iconBgClassName} shadow-[0_3px_10px_rgba(0,0,0,0.25)]`}>
          {Icon ? (
            <Icon className={`h-6 w-6 ${iconColorClassName}`} strokeWidth={2.2} />
          ) : (
            <Image
              src={iconSrc}
              alt={title}
              width={52}
              height={52}
              className="h-8 w-8 object-contain drop-shadow-[0_5px_12px_rgba(0,0,0,0.35)] opacity-95"
            />
          )}
        </div>
      </div>
    </article>
  );
}
