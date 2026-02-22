import Image from "next/image";

export default function SystemIntro() {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#111315] text-white shadow-2xl min-h-[360px]">
      <div className="absolute inset-0">
        <Image
          src="/images/predio-financeiro.jpg"
          alt="Prédio corporativo"
          fill
          className="object-cover"
          priority
        />
      </div>

      <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/65 to-black/40" />

      <div className="pointer-events-none absolute -top-16 -left-16 h-40 w-40 rounded-full bg-white/5 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-48 w-48 rounded-full bg-zinc-400/10 blur-3xl" />

      <div className="relative z-10 p-8 md:p-10">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-sm text-zinc-200">
          <span className="h-2 w-2 rounded-full bg-zinc-300" />
          Finance Cloud
        </div>

        <h1 className="mb-4 text-4xl font-bold leading-tight md:text-5xl">
          Bem-vindo ao <span className="text-zinc-200">Finance Cloud</span>
        </h1>

        <p className="max-w-xl text-base leading-relaxed text-zinc-300 md:text-lg">
          Organize seus gastos, acompanhe investimentos e tenha uma visão completa
          da sua vida financeira em um painel moderno, seguro e profissional.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-2 text-sm text-zinc-200 backdrop-blur-sm">
            💳 Contas e cartões
          </div>
          <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-2 text-sm text-zinc-200 backdrop-blur-sm">
            📈 Investimentos
          </div>
          <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-2 text-sm text-zinc-200 backdrop-blur-sm">
            🔒 Acesso seguro
          </div>
        </div>
      </div>
    </div>
  );
}
