import { CreditCard, ShieldCheck, TrendingUp } from "lucide-react";

export default function SystemIntro() {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#160f2c] via-[#1c123a] to-[#2a1542] p-8 text-white shadow-2xl">
      <div className="pointer-events-none absolute -left-16 -top-16 h-40 w-40 rounded-full bg-fuchsia-500/30 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-52 w-52 rounded-full bg-orange-400/20 blur-3xl" />
      <div className="pointer-events-none absolute right-10 top-1/3 h-24 w-24 rotate-12 rounded-2xl bg-fuchsia-400/20 blur-sm" />

      <div className="relative z-10">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-zinc-200">
          <span className="h-2 w-2 rounded-full bg-pink-400" />
          Finance Cloud
        </div>

        <h1 className="mb-4 text-4xl font-bold leading-tight md:text-5xl">
          Bem-vindo ao <span className="text-fuchsia-300">Finance Cloud</span>
        </h1>

        <p className="max-w-xl text-base leading-relaxed text-zinc-300 md:text-lg">
          Organize seus gastos, acompanhe investimentos e tenha uma visao completa
          da sua vida financeira em um painel moderno, simples e seguro.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <div className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-zinc-200">
            <CreditCard className="h-4 w-4 text-fuchsia-300" />
            Contas e cartoes
          </div>
          <div className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-zinc-200">
            <TrendingUp className="h-4 w-4 text-emerald-300" />
            Investimentos
          </div>
          <div className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-zinc-200">
            <ShieldCheck className="h-4 w-4 text-cyan-300" />
            Acesso seguro
          </div>
        </div>
      </div>
    </div>
  );
}
