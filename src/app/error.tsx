"use client";

type RouteErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function RouteError({ error, reset }: RouteErrorProps) {
  return (
    <div className="mx-auto mt-10 w-full max-w-lg rounded-2xl border border-rose-300/30 bg-rose-500/10 p-5 text-slate-100">
      <h2 className="text-lg font-semibold">Erro nesta tela</h2>
      <p className="mt-2 text-sm text-slate-200/90">
        {error?.message || "Falha inesperada ao renderizar a pagina."}
      </p>
      {error?.digest ? (
        <p className="mt-1 text-xs text-slate-300/80">Ref: {error.digest}</p>
      ) : null}
      <button
        type="button"
        onClick={reset}
        className="mt-4 rounded-lg border border-rose-300/40 bg-rose-500/20 px-3 py-1.5 text-sm font-semibold text-rose-100 hover:bg-rose-500/30"
      >
        Tentar novamente
      </button>
    </div>
  );
}
