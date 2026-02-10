/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/lib/supabaseClient";

type Profile = {
  display_name: string | null;
  avatar_url: string | null;
};

const MAX_SIZE_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

const normalizeDisplayName = (value: string) => value.replace(/\s+/g, " ").trim();
const validateDisplayName = (value: string) => {
  if (!value) return "Nome obrigatorio.";
  if (value.length < 2 || value.length > 40) return "Nome precisa ter entre 2 e 40 caracteres.";
  if (!/\p{L}/u.test(value)) return "Use pelo menos uma letra.";
  if (/[^0-9\p{L}\s.'-]/u.test(value)) return "Use apenas letras, numeros, espacos, ponto, apostrofo ou hifen.";
  return null;
};

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  const loadProfile = async () => {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user) return;

    const { data } = await supabase
      .from("profiles")
      .select("display_name, avatar_url")
      .eq("id", user.id)
      .maybeSingle();
    const nextProfile = (data as Profile) ?? null;
    setProfile(nextProfile);
    setDisplayName(nextProfile?.display_name ?? "");
  };

  useEffect(() => {
    loadProfile();
  }, []);

  const initials = useMemo(() => {
    const base = profile?.display_name?.trim() || "Usuario";
    return base
      .split(" ")
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || "")
      .join("");
  }, [profile]);

  const normalizedDisplayName = useMemo(() => normalizeDisplayName(displayName), [displayName]);
  const baseDisplayName = useMemo(
    () => normalizeDisplayName(profile?.display_name ?? ""),
    [profile?.display_name],
  );
  const canSaveProfile = !!normalizedDisplayName && normalizedDisplayName !== baseDisplayName && !savingProfile;

  const handleSaveProfile = async () => {
    setProfileError(null);
    setProfileMessage(null);

    const normalized = normalizeDisplayName(displayName);
    const validationError = validateDisplayName(normalized);
    if (validationError) {
      setProfileError(validationError);
      return;
    }

    setSavingProfile(true);

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setSavingProfile(false);
      setProfileError("Sessao nao encontrada.");
      return;
    }

    const response = await fetch("/api/profile", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ display_name: normalized }),
    });

    const data = await response.json();
    if (!response.ok) {
      setProfileError(data.message || "Falha ao salvar perfil.");
      setSavingProfile(false);
      return;
    }

    const savedName = data.display_name ?? normalized;
    setProfile((prev) => ({ display_name: savedName, avatar_url: prev?.avatar_url ?? null }));
    setDisplayName(savedName);
    setProfileMessage("Salvo com sucesso.");
    window.dispatchEvent(new CustomEvent("profile_updated", { detail: { display_name: savedName } }));
    setSavingProfile(false);
  };

  const handleFileChange = (next: File | null) => {
    setError(null);
    setMessage(null);
    if (!next) return;

    if (!ALLOWED_TYPES.includes(next.type)) {
      setError("Formato invalido. Use JPG, PNG ou WebP.");
      return;
    }

    if (next.size > MAX_SIZE_BYTES) {
      setError("Arquivo acima de 2MB.");
      return;
    }

    setFile(next);
    setPreview(URL.createObjectURL(next));
  };

  const handleUpload = async () => {
    if (!file) {
      setError("Selecione um arquivo antes de enviar.");
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setLoading(false);
      setError("Sessao nao encontrada.");
      return;
    }

    const form = new FormData();
    form.append("file", file);

    const response = await fetch("/api/profile/avatar", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });

    const data = await response.json();
    if (!response.ok) {
      setError(data.message || "Falha ao enviar foto.");
      setLoading(false);
      return;
    }

    setProfile((prev) => ({ display_name: prev?.display_name ?? null, avatar_url: data.avatar_url }));
    setFile(null);
    setPreview(null);
    setMessage("Foto atualizada com sucesso.");
    window.dispatchEvent(new CustomEvent("profile_updated", { detail: { avatar_url: data.avatar_url } }));
    setLoading(false);
  };

  const handleRemove = async () => {
    setLoading(true);
    setError(null);
    setMessage(null);

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setLoading(false);
      setError("Sessao nao encontrada.");
      return;
    }

    const response = await fetch("/api/profile/avatar", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = await response.json();
    if (!response.ok) {
      setError(data.message || "Falha ao remover foto.");
      setLoading(false);
      return;
    }

    setProfile((prev) => ({ display_name: prev?.display_name ?? null, avatar_url: null }));
    setPreview(null);
    setFile(null);
    setMessage("Foto removida.");
    window.dispatchEvent(new CustomEvent("profile_updated", { detail: { avatar_url: null } }));
    setLoading(false);
  };

  return (
    <AppShell title="Perfil" subtitle="Configurar nome e foto de perfil">
      <div className="max-w-2xl space-y-6">
        <section className="rounded-xl2 bg-card border border-stroke shadow-soft p-6">
          <h2 className="text-lg font-extrabold">Perfil</h2>
          <p className="text-sm text-muted mt-1">Atualize seu nome de exibicao.</p>

          <div className="mt-4 grid gap-4">
            <label className="text-sm font-semibold">
              Nome
              <input
                type="text"
                value={displayName}
                onChange={(event) => {
                  setProfileError(null);
                  setProfileMessage(null);
                  setDisplayName(event.target.value);
                }}
                onBlur={() => setDisplayName((prev) => normalizeDisplayName(prev))}
                className="mt-2 w-full rounded-xl border border-stroke bg-appbg px-3 py-2 text-sm outline-none"
                placeholder="Digite seu nome"
                maxLength={40}
              />
            </label>
            <p className="text-xs text-muted">De 2 a 40 caracteres. Use letras, numeros e espacos.</p>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-xl bg-greenbar px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                onClick={handleSaveProfile}
                disabled={!canSaveProfile}
              >
                {savingProfile ? "Salvando..." : "Salvar alteracoes"}
              </button>
            </div>
          </div>

          {profileError ? (
            <div className="mt-4 rounded-xl border border-rose-500/40 bg-rose-950/40 px-4 py-3 text-sm text-rose-200">
              {profileError}
            </div>
          ) : null}
          {profileMessage ? (
            <div className="mt-4 rounded-xl border border-emerald-500/40 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-200">
              {profileMessage}
            </div>
          ) : null}
        </section>

        <section className="rounded-xl2 bg-card border border-stroke shadow-soft p-6">
          <h2 className="text-lg font-extrabold">Foto de perfil</h2>
          <p className="text-sm text-muted mt-1">
            JPG, PNG ou WebP. Tamanho maximo 2MB.
          </p>

          <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="h-28 w-28 rounded-full border border-stroke bg-appbg flex items-center justify-center overflow-hidden">
              {preview || profile?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={preview || profile?.avatar_url || ""}
                  alt="Avatar"
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-2xl font-extrabold text-slate-300">{initials}</span>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) => handleFileChange(event.target.files?.[0] ?? null)}
                className="text-sm"
              />

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-xl bg-greenbar px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  onClick={handleUpload}
                  disabled={loading || !file}
                >
                  {loading ? "Enviando..." : "Enviar foto"}
                </button>
                <button
                  type="button"
                  className="rounded-xl border border-stroke bg-card px-4 py-2 text-sm font-semibold"
                  onClick={handleRemove}
                  disabled={loading}
                >
                  Remover
                </button>
              </div>
            </div>
          </div>

          {error ? (
            <div className="mt-4 rounded-xl border border-rose-500/40 bg-rose-950/40 px-4 py-3 text-sm text-rose-200">
              {error}
            </div>
          ) : null}
          {message ? (
            <div className="mt-4 rounded-xl border border-emerald-500/40 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-200">
              {message}
            </div>
          ) : null}
        </section>
      </div>
    </AppShell>
  );
}
