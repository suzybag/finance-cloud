"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRequireAuth } from "@/lib/useAuth";
import { supabase } from "@/lib/supabaseClient";

const navItems = [
  { href: "/dashboard", label: "Painel" },
  { href: "/accounts", label: "Contas" },
  { href: "/transactions", label: "Transacoes" },
  { href: "/cards", label: "Cartoes" },
  { href: "/import", label: "Importacao" },
];

type AppShellProps = {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
};

export const AppShell = ({ title, subtitle, actions, children }: AppShellProps) => {
  const { user, loading } = useRequireAuth();
  const pathname = usePathname();
  const displayName = user?.email?.split("@")[0] ?? "Usuario";

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-950 text-slate-100">
        Carregando...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="flex min-h-screen">
        <aside className="w-64 hidden lg:flex flex-col gap-6 border-r border-slate-800/80 bg-slate-950/80 p-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-sky-400 to-indigo-500 grid place-items-center font-bold">
              FC
            </div>
            <div>
              <div className="text-sm text-slate-400">Finance Cloud</div>
              <div className="font-semibold">Painel pessoal</div>
            </div>
          </div>

          <nav className="flex flex-col gap-2">
            {navItems.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
                    active
                      ? "bg-slate-800 text-white"
                      : "text-slate-300 hover:bg-slate-800/60"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto rounded-2xl border border-slate-800/80 bg-slate-900/50 p-4 text-sm text-slate-300">
            <div className="font-semibold text-white">Alertas prontos</div>
            <p className="mt-1 text-xs text-slate-400">
              Jobs/cron podem ser ligados depois. Hoje os alertas sao gerados no
              login.
            </p>
          </div>

          <button
            className="mt-2 w-full rounded-xl border border-slate-800 px-3 py-2 text-sm text-slate-200 hover:border-slate-600"
            onClick={() => supabase.auth.signOut()}
          >
            Sair
          </button>
        </aside>

        <main className="flex-1 p-6 lg:p-10">
          <div className="mb-6 flex gap-2 overflow-x-auto lg:hidden">
            {navItems.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={`mobile-${item.href}`}
                  href={item.href}
                  className={`whitespace-nowrap rounded-full px-4 py-2 text-xs font-semibold ${
                    active ? "bg-slate-800 text-white" : "bg-slate-900 text-slate-300"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
          <header className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                Finance Cloud
              </div>
              <h1 className="text-2xl font-semibold text-white">{title}</h1>
              {subtitle && <p className="text-sm text-slate-400">{subtitle}</p>}
            </div>

            <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
              {actions}
              <div className="rounded-2xl border border-slate-800/80 bg-slate-900/50 px-4 py-2 text-sm">
                <div className="text-xs text-slate-400">Logado como</div>
                <div className="font-semibold text-white">{displayName}</div>
              </div>
            </div>
          </header>

          <div className="mt-8">{children}</div>
        </main>
      </div>
    </div>
  );
};
