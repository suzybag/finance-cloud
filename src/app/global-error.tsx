"use client";

type GlobalErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  const message = error?.message || "Falha inesperada ao carregar o app.";

  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-[#080412] text-slate-100">
        <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col items-center justify-center px-6 text-center">
          <h1 className="text-2xl font-bold">Erro ao carregar o sistema</h1>
          <p className="mt-3 text-sm text-slate-300">
            {message}
          </p>
          {error?.digest ? (
            <p className="mt-2 text-xs text-slate-400">Ref: {error.digest}</p>
          ) : null}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={reset}
              className="rounded-lg border border-violet-300/30 bg-violet-500/15 px-4 py-2 text-sm font-semibold text-violet-100 hover:bg-violet-500/25"
            >
              Tentar novamente
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-lg border border-slate-400/25 bg-slate-700/25 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-700/40"
            >
              Recarregar pagina
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
