"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/lib/supabaseClient";

type ConsentPayload = {
  terms_accepted: boolean;
  terms_version: string | null;
  terms_accepted_at: string | null;
  privacy_accepted: boolean;
  privacy_version: string | null;
  privacy_accepted_at: string | null;
  marketing_opt_in: boolean;
  open_finance_accepted: boolean;
  open_finance_accepted_at: string | null;
};

const defaultConsent: ConsentPayload = {
  terms_accepted: true,
  terms_version: null,
  terms_accepted_at: null,
  privacy_accepted: true,
  privacy_version: null,
  privacy_accepted_at: null,
  marketing_opt_in: false,
  open_finance_accepted: false,
  open_finance_accepted_at: null,
};

const sectionClass = "rounded-2xl border border-violet-300/15 bg-slate-900/40 p-6 text-slate-200";

const formatDateTime = (value: string | null) => {
  if (!value) return "Nao registrado";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Nao registrado";
  return parsed.toLocaleString("pt-BR");
};

export default function PrivacyPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [consent, setConsent] = useState<ConsentPayload>(defaultConsent);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadConsent = async (resetState = true) => {
    if (resetState) {
      setLoading(true);
      setError(null);
      setMessage(null);
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setLoading(false);
      setError("Sessao nao encontrada.");
      return;
    }

    const response = await fetch("/api/privacy/consent", {
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      setLoading(false);
      setError(data?.message || "Falha ao carregar consentimentos.");
      return;
    }

    setConsent({
      terms_accepted: true,
      terms_version: data?.consent?.terms_version || data?.terms_version || null,
      terms_accepted_at: data?.consent?.terms_accepted_at || null,
      privacy_accepted: true,
      privacy_version: data?.consent?.privacy_version || data?.privacy_version || null,
      privacy_accepted_at: data?.consent?.privacy_accepted_at || null,
      marketing_opt_in: Boolean(data?.consent?.marketing_opt_in),
      open_finance_accepted: Boolean(data?.consent?.open_finance_accepted),
      open_finance_accepted_at: data?.consent?.open_finance_accepted_at || null,
    });
    setLoading(false);
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadConsent(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const handleSaveConsent = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setSaving(false);
      setError("Sessao nao encontrada.");
      return;
    }

    const response = await fetch("/api/privacy/consent", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        terms_accepted: true,
        privacy_accepted: true,
        marketing_opt_in: consent.marketing_opt_in,
        open_finance_accepted: consent.open_finance_accepted,
      }),
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      setSaving(false);
      setError(data?.message || "Falha ao salvar consentimentos.");
      return;
    }

    setMessage("Consentimentos atualizados com sucesso.");
    setConsent((prev) => ({
      ...prev,
      terms_version: data?.consent?.terms_version || prev.terms_version,
      terms_accepted_at: data?.consent?.terms_accepted_at || prev.terms_accepted_at,
      privacy_version: data?.consent?.privacy_version || prev.privacy_version,
      privacy_accepted_at: data?.consent?.privacy_accepted_at || prev.privacy_accepted_at,
      open_finance_accepted_at: data?.consent?.open_finance_accepted_at || prev.open_finance_accepted_at,
    }));
    setSaving(false);
  };

  return (
    <AppShell title="Politica de privacidade" subtitle="LGPD, consentimentos e governanca de dados">
      <div className="mx-auto max-w-4xl space-y-4">
        <section className={sectionClass}>
          <h2 className="text-lg font-bold text-slate-100">Dados coletados</h2>
          <p className="mt-2 text-sm text-slate-300">
            Coletamos dados estritamente necessarios para autenticacao, operacao financeira,
            monitoramento de seguranca e notificacoes.
          </p>
        </section>

        <section className={sectionClass}>
          <h2 className="text-lg font-bold text-slate-100">Protecao de dados</h2>
          <p className="mt-2 text-sm text-slate-300">
            Aplicamos criptografia em tokens sensiveis, auditoria de eventos de seguranca e
            controles de acesso com RLS no banco.
          </p>
        </section>

        <section className={sectionClass}>
          <h2 className="text-lg font-bold text-slate-100">Consentimentos LGPD</h2>
          {loading ? (
            <p className="mt-2 text-sm text-slate-300">Carregando consentimentos...</p>
          ) : (
            <div className="mt-3 space-y-4 text-sm">
              <label className="flex items-center gap-3">
                <input type="checkbox" checked disabled />
                <span>
                  Termos de uso aceitos (versao {consent.terms_version || "n/d"}) em{" "}
                  {formatDateTime(consent.terms_accepted_at)}
                </span>
              </label>
              <label className="flex items-center gap-3">
                <input type="checkbox" checked disabled />
                <span>
                  Politica de privacidade aceita (versao {consent.privacy_version || "n/d"}) em{" "}
                  {formatDateTime(consent.privacy_accepted_at)}
                </span>
              </label>
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={consent.marketing_opt_in}
                  onChange={(event) =>
                    setConsent((prev) => ({ ...prev, marketing_opt_in: event.target.checked }))}
                />
                <span>Autorizo comunicacoes de produto (opcional)</span>
              </label>
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={consent.open_finance_accepted}
                  onChange={(event) =>
                    setConsent((prev) => ({ ...prev, open_finance_accepted: event.target.checked }))}
                />
                <span>
                  Autorizo uso de dados Open Finance (opcional). Ultimo aceite:{" "}
                  {formatDateTime(consent.open_finance_accepted_at)}
                </span>
              </label>

              {error ? (
                <p className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-rose-200">
                  {error}
                </p>
              ) : null}
              {message ? (
                <p className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-emerald-200">
                  {message}
                </p>
              ) : null}

              <button
                type="button"
                onClick={handleSaveConsent}
                disabled={saving || loading}
                className="rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 py-2 font-semibold text-white disabled:opacity-60"
              >
                {saving ? "Salvando..." : "Salvar consentimentos"}
              </button>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
