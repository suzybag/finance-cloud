/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  CalendarDays,
  Camera,
  Download,
  Eye,
  FileText,
  Info,
  LifeBuoy,
  Lock,
  LogOut,
  Mail,
  Moon,
  Shield,
  Star,
  Trash2,
  User,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useVisualMode } from "@/contexts/VisualModeContext";
import { supabase } from "@/lib/supabaseClient";

type Profile = {
  display_name: string | null;
  avatar_url: string | null;
};

type PreferencesState = {
  notifications: boolean;
  currency: "BRL";
  monthStartDay: number;
};

type SecurityModalMode = "password" | "email";

const MAX_SIZE_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const PREFERENCES_KEY = "finance_cloud_preferences";

const normalizeDisplayName = (value: string) => value.replace(/\s+/g, " ").trim();
const validateDisplayName = (value: string) => {
  if (!value) return "Nome obrigatorio.";
  if (value.length < 2 || value.length > 40) return "Nome precisa ter entre 2 e 40 caracteres.";
  if (!/\p{L}/u.test(value)) return "Use pelo menos uma letra.";
  if (/[^0-9\p{L}\s.'-]/u.test(value)) return "Use apenas letras, numeros, espacos, ponto, apostrofo ou hifen.";
  return null;
};

const baseInputClass =
  "mt-2 w-full rounded-xl border border-violet-300/15 bg-slate-900/45 px-3 py-2 text-sm text-slate-100 outline-none focus:border-violet-400/60";
const sectionClass =
  "rounded-2xl border border-violet-300/10 bg-[#1f1744]/70 p-6 shadow-[0_12px_35px_rgba(8,3,25,0.45)] backdrop-blur-xl";
const lineClass = "flex items-center justify-between gap-3 border-t border-violet-200/10 py-4 first:border-t-0 first:pt-0";

const defaultPreferences: PreferencesState = {
  notifications: true,
  currency: "BRL",
  monthStartDay: 1,
};

const Toggle = ({
  checked,
  onToggle,
  disabled,
}: {
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) => (
  <button
    type="button"
    onClick={onToggle}
    disabled={disabled}
    className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
      checked ? "bg-violet-500" : "bg-slate-600"
    } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
    aria-pressed={checked}
  >
    <span
      className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
        checked ? "translate-x-6" : "translate-x-1"
      }`}
    />
  </button>
);

export default function ProfilePage() {
  const { visualMode, setVisualMode } = useVisualMode();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userId, setUserId] = useState<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const [loadingAvatar, setLoadingAvatar] = useState(false);
  const [avatarMessage, setAvatarMessage] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [securityMessage, setSecurityMessage] = useState<string | null>(null);
  const [securityError, setSecurityError] = useState<string | null>(null);
  const [securityModalMode, setSecurityModalMode] = useState<SecurityModalMode | null>(null);
  const [securityModalValue, setSecurityModalValue] = useState("");
  const [securityModalConfirm, setSecurityModalConfirm] = useState("");
  const [securityModalSaving, setSecurityModalSaving] = useState(false);

  const [privacyMessage, setPrivacyMessage] = useState<string | null>(null);
  const [privacyError, setPrivacyError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const [preferences, setPreferences] = useState<PreferencesState>(defaultPreferences);

  const loadProfile = async () => {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user) return;

    setUserEmail(user.email ?? "");
    setUserId(user.id);

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

  useEffect(() => {
    const raw = localStorage.getItem(PREFERENCES_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Partial<PreferencesState>;
      setPreferences((prev) => ({
        ...prev,
        ...parsed,
        currency: "BRL",
      }));
    } catch {
      // ignore parse errors and keep defaults
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
  }, [preferences]);

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  const initials = useMemo(() => {
    const base = (displayName || profile?.display_name || userEmail.split("@")[0] || "Usuario").trim();
    return base
      .split(" ")
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || "")
      .join("");
  }, [displayName, profile?.display_name, userEmail]);

  const normalizedDisplayName = useMemo(() => normalizeDisplayName(displayName), [displayName]);
  const baseDisplayName = useMemo(
    () => normalizeDisplayName(profile?.display_name ?? ""),
    [profile?.display_name],
  );
  const canSaveProfile =
    !!normalizedDisplayName && normalizedDisplayName !== baseDisplayName && !savingProfile;

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
    setAvatarError(null);
    setAvatarMessage(null);
    if (!next) return;

    if (!ALLOWED_TYPES.includes(next.type)) {
      setAvatarError("Formato invalido. Use JPG, PNG ou WebP.");
      return;
    }

    if (next.size > MAX_SIZE_BYTES) {
      setAvatarError("Arquivo acima de 2MB.");
      return;
    }

    setFile(next);
    setPreview(URL.createObjectURL(next));
  };

  const handleUpload = async () => {
    if (!file) {
      setAvatarError("Selecione um arquivo antes de enviar.");
      return;
    }

    setLoadingAvatar(true);
    setAvatarError(null);
    setAvatarMessage(null);

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setLoadingAvatar(false);
      setAvatarError("Sessao nao encontrada.");
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
      setAvatarError(data.message || "Falha ao enviar foto.");
      setLoadingAvatar(false);
      return;
    }

    setProfile((prev) => ({ display_name: prev?.display_name ?? null, avatar_url: data.avatar_url }));
    setFile(null);
    setPreview(null);
    setAvatarMessage("Foto atualizada com sucesso.");
    window.dispatchEvent(new CustomEvent("profile_updated", { detail: { avatar_url: data.avatar_url } }));
    setLoadingAvatar(false);
  };

  const handleRemoveAvatar = async () => {
    setLoadingAvatar(true);
    setAvatarError(null);
    setAvatarMessage(null);

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setLoadingAvatar(false);
      setAvatarError("Sessao nao encontrada.");
      return;
    }

    const response = await fetch("/api/profile/avatar", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = await response.json();
    if (!response.ok) {
      setAvatarError(data.message || "Falha ao remover foto.");
      setLoadingAvatar(false);
      return;
    }

    setProfile((prev) => ({ display_name: prev?.display_name ?? null, avatar_url: null }));
    setPreview(null);
    setFile(null);
    setAvatarMessage("Foto removida.");
    window.dispatchEvent(new CustomEvent("profile_updated", { detail: { avatar_url: null } }));
    setLoadingAvatar(false);
  };

  const closeSecurityModal = () => {
    setSecurityModalMode(null);
    setSecurityModalValue("");
    setSecurityModalConfirm("");
    setSecurityModalSaving(false);
  };

  const openSecurityModal = (mode: SecurityModalMode) => {
    setSecurityError(null);
    setSecurityMessage(null);
    setSecurityModalMode(mode);
    setSecurityModalValue(mode === "email" ? userEmail : "");
    setSecurityModalConfirm("");
    setSecurityModalSaving(false);
  };

  const handleSaveSecurityModal = async () => {
    if (!securityModalMode) return;

    setSecurityError(null);
    setSecurityMessage(null);
    setSecurityModalSaving(true);

    if (securityModalMode === "password") {
      const nextPassword = securityModalValue;
      if (!nextPassword || nextPassword.length < 6) {
        setSecurityModalSaving(false);
        setSecurityError("A senha precisa ter pelo menos 6 caracteres.");
        return;
      }
      if (nextPassword !== securityModalConfirm) {
        setSecurityModalSaving(false);
        setSecurityError("As senhas nao conferem.");
        return;
      }

      const { error } = await supabase.auth.updateUser({ password: nextPassword });
      if (error) {
        setSecurityModalSaving(false);
        setSecurityError(error.message);
        return;
      }

      closeSecurityModal();
      setSecurityMessage("Senha alterada com sucesso.");
      return;
    }

    const nextEmail = securityModalValue.trim();
    if (!nextEmail) {
      setSecurityModalSaving(false);
      setSecurityError("Digite um email valido.");
      return;
    }

    const { error } = await supabase.auth.updateUser({ email: nextEmail });
    if (error) {
      setSecurityModalSaving(false);
      setSecurityError(error.message);
      return;
    }

    closeSecurityModal();
    setUserEmail(nextEmail);
    setSecurityMessage("Pedido de alteracao enviado. Confirme no email.");
  };

  const handleSignOutSessions = async () => {
    await supabase.auth.signOut();
  };

  const handleExportData = async () => {
    if (!userId) {
      setPrivacyError("Usuario nao encontrado.");
      return;
    }

    setExporting(true);
    setPrivacyError(null);
    setPrivacyMessage(null);

    const [accountsRes, cardsRes, transactionsRes] = await Promise.all([
      supabase.from("accounts").select("*").eq("user_id", userId),
      supabase.from("cards").select("*").eq("user_id", userId),
      supabase.from("transactions").select("*").eq("user_id", userId).order("occurred_at"),
    ]);

    if (accountsRes.error || cardsRes.error || transactionsRes.error) {
      setPrivacyError("Falha ao exportar dados. Tente novamente.");
      setExporting(false);
      return;
    }

    const payload = {
      exported_at: new Date().toISOString(),
      profile: {
        display_name: profile?.display_name ?? null,
        email: userEmail || null,
      },
      accounts: accountsRes.data ?? [],
      cards: cardsRes.data ?? [],
      transactions: transactionsRes.data ?? [],
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `finance-cloud-export-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);

    setPrivacyMessage("Exportacao concluida.");
    setExporting(false);
  };

  const handleDeleteAccount = () => {
    const confirmed = window.confirm(
      "Tem certeza? Essa acao e irreversivel e remove todos os seus dados.",
    );
    if (!confirmed) return;
    setPrivacyError(
      "Exclusao definitiva ainda nao esta habilitada no app. Entre em contato com o suporte.",
    );
  };

  return (
    <AppShell title="Configuracoes" subtitle="Gerencie suas preferencias e dados">
      <div className="mx-auto max-w-4xl space-y-5">
        {securityModalMode ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#06040dcc]/80 p-4 backdrop-blur-sm">
            <div className="w-full max-w-lg rounded-2xl border border-violet-300/20 bg-[linear-gradient(170deg,rgba(31,17,56,0.96),rgba(14,10,31,0.97))] p-5 shadow-[0_20px_60px_rgba(76,29,149,0.45)]">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-extrabold tracking-tight text-violet-100">
                  {securityModalMode === "password" ? "Alterar senha" : "Alterar email"}
                </h3>
                <button
                  type="button"
                  className="rounded-lg border border-violet-300/20 px-2 py-1 text-sm text-violet-100 hover:bg-violet-500/15"
                  onClick={closeSecurityModal}
                  disabled={securityModalSaving}
                >
                  X
                </button>
              </div>

              {securityModalMode === "password" ? (
                <div className="mt-4 grid gap-3">
                  <label className="text-sm font-semibold text-violet-100">
                    Nova senha
                    <input
                      type="password"
                      className={`${baseInputClass} mt-1`}
                      placeholder="Minimo 6 caracteres"
                      value={securityModalValue}
                      onChange={(event) => setSecurityModalValue(event.target.value)}
                    />
                  </label>
                  <label className="text-sm font-semibold text-violet-100">
                    Confirmar senha
                    <input
                      type="password"
                      className={`${baseInputClass} mt-1`}
                      placeholder="Repita a nova senha"
                      value={securityModalConfirm}
                      onChange={(event) => setSecurityModalConfirm(event.target.value)}
                    />
                  </label>
                </div>
              ) : (
                <div className="mt-4 grid gap-3">
                  <label className="text-sm font-semibold text-violet-100">
                    Novo email
                    <input
                      type="email"
                      className={`${baseInputClass} mt-1`}
                      placeholder="email@dominio.com"
                      value={securityModalValue}
                      onChange={(event) => setSecurityModalValue(event.target.value)}
                    />
                  </label>
                  <p className="text-xs text-slate-300">
                    Voce vai receber um email de confirmacao para concluir a troca.
                  </p>
                </div>
              )}

              <div className="mt-5 flex items-center justify-end gap-2">
                <button
                  type="button"
                  className="rounded-xl border border-violet-300/20 bg-violet-950/35 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-violet-900/35 disabled:opacity-60"
                  onClick={closeSecurityModal}
                  disabled={securityModalSaving}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 py-2 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(139,92,246,0.35)] transition hover:brightness-110 disabled:opacity-60"
                  onClick={handleSaveSecurityModal}
                  disabled={
                    securityModalSaving ||
                    !securityModalValue.trim() ||
                    (securityModalMode === "password" && !securityModalConfirm.trim())
                  }
                >
                  {securityModalSaving ? "Salvando..." : "Salvar"}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <section className={sectionClass}>
          <div className="mb-4 flex items-center gap-2 text-slate-100">
            <User className="h-4 w-4 text-violet-300" />
            <h2 className="text-lg font-bold">Perfil</h2>
          </div>

          <div className="flex flex-col gap-4 border-b border-violet-200/10 pb-5 sm:flex-row sm:items-center">
            <div className="h-16 w-16 overflow-hidden rounded-full border border-violet-300/20 bg-slate-900/55">
              {preview || profile?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={preview || profile?.avatar_url || ""}
                  alt="Avatar"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="grid h-full place-items-center text-lg font-bold text-slate-200">
                  {initials}
                </div>
              )}
            </div>
            <div>
              <p className="text-lg font-bold text-slate-100">{displayName || "Usuario"}</p>
              <p className="text-sm text-slate-400">{userEmail || "email@exemplo.com"}</p>
            </div>
          </div>

          <div className="mt-5 grid gap-4">
            <label className="text-sm font-semibold text-slate-200">
              Nome completo
              <input
                type="text"
                value={displayName}
                onChange={(event) => {
                  setProfileError(null);
                  setProfileMessage(null);
                  setDisplayName(event.target.value);
                }}
                onBlur={() => setDisplayName((prev) => normalizeDisplayName(prev))}
                className={baseInputClass}
                placeholder="Digite seu nome"
                maxLength={40}
              />
            </label>

            <label className="text-sm font-semibold text-slate-200">
              Email
              <input
                type="email"
                value={userEmail}
                disabled
                className={`${baseInputClass} cursor-not-allowed opacity-80`}
              />
            </label>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-xl bg-violet-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-400 disabled:opacity-60"
                onClick={handleSaveProfile}
                disabled={!canSaveProfile}
              >
                {savingProfile ? "Salvando..." : "Salvar alteracoes"}
              </button>

              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-violet-300/20 bg-slate-900/45 px-3 py-2 text-sm text-slate-200">
                <Camera className="h-4 w-4" />
                Trocar foto
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(event) => handleFileChange(event.target.files?.[0] ?? null)}
                  className="hidden"
                />
              </label>

              <button
                type="button"
                className="rounded-xl border border-violet-300/20 bg-slate-900/45 px-4 py-2 text-sm font-semibold text-slate-200 disabled:opacity-60"
                onClick={handleUpload}
                disabled={loadingAvatar || !file}
              >
                {loadingAvatar ? "Enviando..." : "Enviar foto"}
              </button>

              <button
                type="button"
                className="rounded-xl border border-violet-300/20 bg-slate-900/45 px-4 py-2 text-sm font-semibold text-slate-200 disabled:opacity-60"
                onClick={handleRemoveAvatar}
                disabled={loadingAvatar}
              >
                Remover foto
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
          {avatarError ? (
            <div className="mt-4 rounded-xl border border-rose-500/40 bg-rose-950/40 px-4 py-3 text-sm text-rose-200">
              {avatarError}
            </div>
          ) : null}
          {avatarMessage ? (
            <div className="mt-4 rounded-xl border border-emerald-500/40 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-200">
              {avatarMessage}
            </div>
          ) : null}
        </section>

        <section className={sectionClass}>
          <div className="mb-2 flex items-center gap-2 text-slate-100">
            <Shield className="h-4 w-4 text-violet-300" />
            <h2 className="text-lg font-bold">Seguranca</h2>
          </div>

          <div className={lineClass}>
            <div className="flex items-center gap-3">
              <Lock className="h-4 w-4 text-slate-300" />
              <div>
                <p className="text-sm font-semibold text-slate-100">Alterar senha</p>
                <p className="text-xs text-slate-400">Atualize sua senha de acesso</p>
              </div>
            </div>
            <button
              type="button"
              className="rounded-lg bg-slate-100/95 px-4 py-1.5 text-xs font-semibold text-slate-900"
              onClick={() => openSecurityModal("password")}
            >
              Alterar
            </button>
          </div>

          <div className={lineClass}>
            <div className="flex items-center gap-3">
              <Mail className="h-4 w-4 text-slate-300" />
              <div>
                <p className="text-sm font-semibold text-slate-100">Alterar email</p>
                <p className="text-xs text-slate-400">Mude o endereco principal da conta</p>
              </div>
            </div>
            <button
              type="button"
              className="rounded-lg bg-slate-100/95 px-4 py-1.5 text-xs font-semibold text-slate-900"
              onClick={() => openSecurityModal("email")}
            >
              Alterar
            </button>
          </div>

          <div className={lineClass}>
            <div className="flex items-center gap-3">
              <LogOut className="h-4 w-4 text-slate-300" />
              <div>
                <p className="text-sm font-semibold text-slate-100">Encerrar sessoes</p>
                <p className="text-xs text-slate-400">Finalize a sessao atual no dispositivo</p>
              </div>
            </div>
            <button
              type="button"
              className="rounded-lg border border-violet-300/20 bg-slate-900/45 px-4 py-1.5 text-xs font-semibold text-slate-100"
              onClick={handleSignOutSessions}
            >
              Sair
            </button>
          </div>

          <div className={lineClass}>
            <div className="flex items-center gap-3">
              <Shield className="h-4 w-4 text-slate-300" />
              <div>
                <p className="text-sm font-semibold text-slate-100">Biometria / 2FA</p>
                <p className="text-xs text-slate-400">Camada extra de seguranca (em breve)</p>
              </div>
            </div>
            <button
              type="button"
              className="rounded-lg border border-white/10 bg-slate-800/50 px-4 py-1.5 text-xs font-semibold text-slate-400"
              disabled
            >
              Em breve
            </button>
          </div>

          {securityError ? (
            <div className="mt-4 rounded-xl border border-rose-500/40 bg-rose-950/40 px-4 py-3 text-sm text-rose-200">
              {securityError}
            </div>
          ) : null}
          {securityMessage ? (
            <div className="mt-4 rounded-xl border border-emerald-500/40 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-200">
              {securityMessage}
            </div>
          ) : null}
        </section>

        <section className={sectionClass}>
          <div className="mb-2 flex items-center gap-2 text-slate-100">
            <Bell className="h-4 w-4 text-violet-300" />
            <h2 className="text-lg font-bold">Preferencias</h2>
          </div>

          <div className={lineClass}>
            <div className="flex items-center gap-3">
              <Eye className="h-4 w-4 text-slate-300" />
              <div>
                <p className="text-sm font-semibold text-slate-100">Relaxamento da visao</p>
                <p className="text-xs text-slate-400">Menos contraste, menos saturacao e brilho suave</p>
              </div>
            </div>
            <Toggle
              checked={visualMode === "relax"}
              onToggle={() =>
                setVisualMode(visualMode === "relax" ? "default" : "relax")
              }
            />
          </div>

          <div className={lineClass}>
            <div className="flex items-center gap-3">
              <Moon className="h-4 w-4 text-slate-300" />
              <div>
                <p className="text-sm font-semibold text-slate-100">Preto minimalista</p>
                <p className="text-xs text-slate-400">Visual ultra clean com fundo preto total</p>
              </div>
            </div>
            <Toggle
              checked={visualMode === "black"}
              onToggle={() =>
                setVisualMode(visualMode === "black" ? "default" : "black")
              }
            />
          </div>

          <div className={lineClass}>
            <div className="flex items-center gap-3">
              <Bell className="h-4 w-4 text-slate-300" />
              <div>
                <p className="text-sm font-semibold text-slate-100">Notificacoes</p>
                <p className="text-xs text-slate-400">Alertas e lembretes</p>
              </div>
            </div>
            <Toggle
              checked={preferences.notifications}
              onToggle={() =>
                setPreferences((prev) => ({
                  ...prev,
                  notifications: !prev.notifications,
                }))
              }
            />
          </div>

          <div className={lineClass}>
            <div className="flex items-center gap-3">
              <Info className="h-4 w-4 text-slate-300" />
              <div>
                <p className="text-sm font-semibold text-slate-100">Moeda</p>
                <p className="text-xs text-slate-400">Real brasileiro (BRL)</p>
              </div>
            </div>
            <div className="rounded-lg bg-slate-100/95 px-3 py-1.5 text-xs font-semibold text-slate-900">
              {preferences.currency}
            </div>
          </div>

          <div className={lineClass}>
            <div className="flex items-center gap-3">
              <CalendarDays className="h-4 w-4 text-slate-300" />
              <div>
                <p className="text-sm font-semibold text-slate-100">Primeiro dia do mes</p>
                <p className="text-xs text-slate-400">Data de inicio do ciclo</p>
              </div>
            </div>
            <select
              value={preferences.monthStartDay}
              onChange={(event) =>
                setPreferences((prev) => ({
                  ...prev,
                  monthStartDay: Number(event.target.value),
                }))
              }
              className="rounded-lg border border-violet-300/20 bg-slate-900/45 px-3 py-1.5 text-xs font-semibold text-slate-100"
            >
              {Array.from({ length: 28 }).map((_, idx) => (
                <option key={idx + 1} value={idx + 1}>
                  Dia {idx + 1}
                </option>
              ))}
            </select>
          </div>
        </section>

        <section className={sectionClass}>
          <div className="mb-2 flex items-center gap-2 text-slate-100">
            <Download className="h-4 w-4 text-violet-300" />
            <h2 className="text-lg font-bold">Dados e Privacidade</h2>
          </div>

          <div className={lineClass}>
            <div className="flex items-center gap-3">
              <Download className="h-4 w-4 text-slate-300" />
              <div>
                <p className="text-sm font-semibold text-slate-100">Exportar dados</p>
                <p className="text-xs text-slate-400">Baixe todas as suas informacoes</p>
              </div>
            </div>
            <button
              type="button"
              className="rounded-lg bg-slate-100/95 px-4 py-1.5 text-xs font-semibold text-slate-900"
              onClick={handleExportData}
              disabled={exporting}
            >
              {exporting ? "Exportando..." : "Exportar"}
            </button>
          </div>

          <div className={lineClass}>
            <div className="flex items-center gap-3">
              <FileText className="h-4 w-4 text-slate-300" />
              <div>
                <p className="text-sm font-semibold text-slate-100">Politica de privacidade</p>
                <p className="text-xs text-slate-400">Saiba como usamos seus dados</p>
              </div>
            </div>
            <button
              type="button"
              className="rounded-lg bg-slate-100/95 px-4 py-1.5 text-xs font-semibold text-slate-900"
              onClick={() => window.alert("Pagina de politica de privacidade em breve.")}
            >
              Ver
            </button>
          </div>

          <div className="mt-4 rounded-xl border border-rose-500/35 bg-rose-950/25 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Trash2 className="h-4 w-4 text-rose-300" />
                <div>
                  <p className="text-sm font-semibold text-rose-200">Apagar conta</p>
                  <p className="text-xs text-rose-200/80">Acao irreversivel</p>
                </div>
              </div>
              <button
                type="button"
                className="rounded-lg border border-rose-400/40 bg-rose-500/15 px-4 py-1.5 text-xs font-semibold text-rose-100"
                onClick={handleDeleteAccount}
              >
                Excluir
              </button>
            </div>
          </div>

          {privacyError ? (
            <div className="mt-4 rounded-xl border border-rose-500/40 bg-rose-950/40 px-4 py-3 text-sm text-rose-200">
              {privacyError}
            </div>
          ) : null}
          {privacyMessage ? (
            <div className="mt-4 rounded-xl border border-emerald-500/40 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-200">
              {privacyMessage}
            </div>
          ) : null}
        </section>

        <section className={sectionClass}>
          <div className="mb-2 flex items-center gap-2 text-slate-100">
            <Info className="h-4 w-4 text-violet-300" />
            <h2 className="text-lg font-bold">Sobre</h2>
          </div>

          <div className={lineClass}>
            <div className="flex items-center gap-3">
              <Info className="h-4 w-4 text-slate-300" />
              <p className="text-sm font-semibold text-slate-100">Versao do app</p>
            </div>
            <span className="text-sm font-semibold text-slate-300">
              {process.env.NEXT_PUBLIC_APP_VERSION ?? "1.0.0"}
            </span>
          </div>

          <div className={lineClass}>
            <div className="flex items-center gap-3">
              <FileText className="h-4 w-4 text-slate-300" />
              <p className="text-sm font-semibold text-slate-100">Termos de uso</p>
            </div>
            <button
              type="button"
              className="rounded-lg border border-violet-300/20 bg-slate-900/45 px-4 py-1.5 text-xs font-semibold text-slate-100"
              onClick={() => window.alert("Termos de uso em breve.")}
            >
              Ver
            </button>
          </div>

          <div className={lineClass}>
            <div className="flex items-center gap-3">
              <LifeBuoy className="h-4 w-4 text-slate-300" />
              <p className="text-sm font-semibold text-slate-100">Suporte</p>
            </div>
            <a
              href="mailto:suporte@financecloud.app"
              className="rounded-lg border border-violet-300/20 bg-slate-900/45 px-4 py-1.5 text-xs font-semibold text-slate-100"
            >
              Contato
            </a>
          </div>

          <div className={lineClass}>
            <div className="flex items-center gap-3">
              <Star className="h-4 w-4 text-slate-300" />
              <p className="text-sm font-semibold text-slate-100">Avaliar app</p>
            </div>
            <button
              type="button"
              className="rounded-lg border border-violet-300/20 bg-slate-900/45 px-4 py-1.5 text-xs font-semibold text-slate-100"
              onClick={() => window.alert("Obrigado! Integracao de avaliacao em breve.")}
            >
              Avaliar
            </button>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
