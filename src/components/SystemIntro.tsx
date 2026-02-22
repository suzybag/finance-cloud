import Image from "next/image";
import { Building2, CreditCard, ShieldCheck, TrendingUp } from "lucide-react";

export default function SystemIntro() {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-zinc-800/80 bg-gradient-to-br from-black via-zinc-950 to-zinc-900 p-6 text-white shadow-[0_35px_80px_-45px_rgba(0,0,0,0.95)] md:p-8">
      <div className="pointer-events-none absolute -left-20 -top-20 h-56 w-56 rounded-full bg-zinc-700/25 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 right-0 h-56 w-56 rounded-full bg-slate-800/35 blur-3xl" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-zinc-400/5 to-transparent" />

      <div className="relative z-10 grid items-center gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-zinc-700/70 bg-zinc-900/70 px-3 py-1 text-sm text-zinc-200">
            <Building2 className="h-4 w-4 text-slate-300" />
            Finance Cloud
          </div>

          <h1 className="mb-4 text-4xl font-bold leading-tight text-zinc-100 md:text-5xl">
            Bem-vindo ao <span className="text-zinc-300">Finance Cloud</span>
          </h1>

          <p className="max-w-xl text-base leading-relaxed text-zinc-400 md:text-lg">
            Organize seus gastos, acompanhe investimentos e tenha uma visao completa
            da sua vida financeira em um painel moderno, simples e seguro.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <div className="inline-flex items-center gap-2 rounded-xl border border-zinc-700/80 bg-zinc-900/70 px-4 py-2 text-sm text-zinc-200">
              <CreditCard className="h-4 w-4 text-slate-300" />
              Contas e cartoes
            </div>
            <div className="inline-flex items-center gap-2 rounded-xl border border-zinc-700/80 bg-zinc-900/70 px-4 py-2 text-sm text-zinc-200">
              <TrendingUp className="h-4 w-4 text-emerald-300" />
              Investimentos
            </div>
            <div className="inline-flex items-center gap-2 rounded-xl border border-zinc-700/80 bg-zinc-900/70 px-4 py-2 text-sm text-zinc-200">
              <ShieldCheck className="h-4 w-4 text-cyan-300" />
              Acesso seguro
            </div>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-md">
          <div className="absolute inset-2 rounded-2xl bg-cyan-500/15 blur-2xl" />
          <div className="relative overflow-hidden rounded-2xl border border-zinc-700/80 bg-zinc-950/90 p-2">
            <Image
              src="/assets/3d/building-night.svg"
              alt="Predio moderno com janelas iluminadas"
              width={1200}
              height={800}
              className="h-auto w-full rounded-xl object-cover"
              priority
            />
          </div>
        </div>
      </div>
    </div>
  );
}
