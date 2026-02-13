"use client";

import { AppShell } from "@/components/AppShell";

export default function TermsPage() {
  return (
    <AppShell title="Termos de uso" subtitle="Condicoes de uso da plataforma Finance Cloud">
      <div className="mx-auto max-w-4xl space-y-4">
        <section className="rounded-2xl border border-violet-300/15 bg-slate-900/40 p-6 text-slate-200">
          <h2 className="text-lg font-bold text-slate-100">Uso da plataforma</h2>
          <p className="mt-2 text-sm text-slate-300">
            O Finance Cloud e destinado ao controle financeiro pessoal. O usuario e responsavel
            pelas informacoes inseridas.
          </p>
        </section>
        <section className="rounded-2xl border border-violet-300/15 bg-slate-900/40 p-6 text-slate-200">
          <h2 className="text-lg font-bold text-slate-100">Conta e seguranca</h2>
          <p className="mt-2 text-sm text-slate-300">
            Mantenha credenciais seguras e atualizadas. Atividades realizadas na conta sao de
            responsabilidade do titular autenticado.
          </p>
        </section>
        <section className="rounded-2xl border border-violet-300/15 bg-slate-900/40 p-6 text-slate-200">
          <h2 className="text-lg font-bold text-slate-100">Encerramento</h2>
          <p className="mt-2 text-sm text-slate-300">
            O usuario pode encerrar a conta a qualquer momento em Configuracoes. A exclusao remove
            os dados associados conforme regras do banco configurado.
          </p>
        </section>
      </div>
    </AppShell>
  );
}
