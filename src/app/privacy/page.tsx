"use client";

import { AppShell } from "@/components/AppShell";

export default function PrivacyPage() {
  return (
    <AppShell title="Politica de privacidade" subtitle="Como tratamos seus dados no Finance Cloud">
      <div className="mx-auto max-w-4xl space-y-4">
        <section className="rounded-2xl border border-violet-300/15 bg-slate-900/40 p-6 text-slate-200">
          <h2 className="text-lg font-bold text-slate-100">Dados coletados</h2>
          <p className="mt-2 text-sm text-slate-300">
            Coletamos apenas dados necessarios para autenticacao, operacao financeira e suporte do
            app. Os dados ficam vinculados ao seu usuario.
          </p>
        </section>
        <section className="rounded-2xl border border-violet-300/15 bg-slate-900/40 p-6 text-slate-200">
          <h2 className="text-lg font-bold text-slate-100">Uso e armazenamento</h2>
          <p className="mt-2 text-sm text-slate-300">
            Seus dados sao usados para exibir dashboards, registrar transacoes e sincronizar
            configuracoes. O armazenamento e feito na infraestrutura configurada do projeto.
          </p>
        </section>
        <section className="rounded-2xl border border-violet-300/15 bg-slate-900/40 p-6 text-slate-200">
          <h2 className="text-lg font-bold text-slate-100">Seus direitos</h2>
          <p className="mt-2 text-sm text-slate-300">
            Voce pode exportar seus dados e solicitar exclusao da conta diretamente na tela de
            configuracoes.
          </p>
        </section>
      </div>
    </AppShell>
  );
}
