import Image from "next/image";
import { CreditCard, ShieldCheck, TrendingUp } from "lucide-react";

export default function SystemIntro() {
  return (
    <div className="relative min-h-[360px] overflow-hidden rounded-3xl border border-white/10 bg-[#111315] text-white shadow-2xl">
      <div className="absolute inset-0">
        <Image
          src="/images/predio-financeiro.jpg"
          alt="Predio corporativo"
          fill
          className="object-cover brightness-[0.46] contrast-110 saturate-[0.85]"
          priority
        />
      </div>

      <div className="absolute inset-0 bg-gradient-to-r from-black/92 via-black/80 to-black/58" />
      <div className="absolute inset-y-0 left-0 w-[72%] bg-black/28" />

      <div className="pointer-events-none absolute -left-16 -top-16 h-40 w-40 rounded-full bg-white/5 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-48 w-48 rounded-full bg-zinc-400/10 blur-3xl" />

      <div className="relative z-10 p-8 [text-shadow:0_2px_18px_rgba(0,0,0,0.75)] md:p-10">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/45 px-3 py-1 text-sm font-medium text-zinc-100">
            <span className="h-2 w-2 rounded-full bg-zinc-300" />
            Finance Cloud
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/45 px-3 py-1">
            <div className="loader" aria-hidden="true" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-200">
              Intro
            </span>
          </div>
        </div>

        <h1 className="mb-4 text-4xl font-extrabold leading-tight text-zinc-50 md:text-5xl">
          Bem-vindo ao <span className="text-white">Finance Cloud</span>
        </h1>

        <p className="max-w-xl text-base leading-relaxed text-zinc-100/90 md:text-lg">
          Organize seus gastos, acompanhe investimentos e tenha uma visao completa
          da sua vida financeira em um painel moderno, seguro e profissional.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <div className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-black/55 px-4 py-2 text-sm font-medium text-zinc-100 backdrop-blur-sm">
            <CreditCard className="h-4 w-4 text-zinc-200" />
            Contas e cartoes
          </div>
          <div className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-black/55 px-4 py-2 text-sm font-medium text-zinc-100 backdrop-blur-sm">
            <TrendingUp className="h-4 w-4 text-emerald-300" />
            Investimentos
          </div>
          <div className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-black/55 px-4 py-2 text-sm font-medium text-zinc-100 backdrop-blur-sm">
            <ShieldCheck className="h-4 w-4 text-cyan-300" />
            Acesso seguro
          </div>
        </div>
      </div>

      <style jsx>{`
        .loader {
          width: 45px;
          height: 40px;
          background:
            linear-gradient(#0000 calc(1 * 100% / 6), #fff 0 calc(3 * 100% / 6), #0000 0),
            linear-gradient(#0000 calc(2 * 100% / 6), #fff 0 calc(4 * 100% / 6), #0000 0),
            linear-gradient(#0000 calc(3 * 100% / 6), #fff 0 calc(5 * 100% / 6), #0000 0);
          background-size: 10px 400%;
          background-repeat: no-repeat;
          background-position: 0% 100%, 50% 100%, 100% 100%;
          animation: matrix 1s infinite linear;
          transform: scale(0.52);
          transform-origin: center;
          opacity: 0.95;
        }

        @keyframes matrix {
          0% {
            background-position: 0% 100%, 50% 100%, 100% 100%;
          }
          100% {
            background-position: 0% 0%, 50% 0%, 100% 0%;
          }
        }
      `}</style>
    </div>
  );
}
