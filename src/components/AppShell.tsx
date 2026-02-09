"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

  const [profileName, setProfileName] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const displayName = profileName || user?.email?.split("@")[0] || "Usuario";
  const initials = useMemo(() => {
    const base = displayName.trim() || "U";
    return base
      .split(" ")
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || "")
      .join("");
  }, [displayName]);

  const loadProfile = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("profiles")
      .select("display_name, avatar_url")
      .eq("id", user.id)
      .maybeSingle();

    setProfileName(data?.display_name ?? null);
    setAvatarUrl(data?.avatar_url ?? null);
  };

  useEffect(() => {
    loadProfile();
  }, [user?.id]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      if (typeof detail.avatar_url !== "undefined") {
        setAvatarUrl(detail.avatar_url);
      }
      if (typeof detail.display_name !== "undefined") {
        setProfileName(detail.display_name);
      }
    };

    window.addEventListener("profile_updated", handler as EventListener);
    return () => window.removeEventListener("profile_updated", handler as EventListener);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (event: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

  const handleAvatarFile = async (file: File | null) => {
    if (!file) return;
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) return;

    const form = new FormData();
    form.append("file", file);

    const response = await fetch("/api/profile/avatar", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });

    const data = await response.json();
    if (response.ok && data.avatar_url) {
      setAvatarUrl(data.avatar_url);
      window.dispatchEvent(
        new CustomEvent("profile_updated", { detail: { avatar_url: data.avatar_url } }),
      );
    }
  };

  const renderAvatarButton = () => (
    <button
      type="button"
      onClick={() => setMenuOpen((prev) => !prev)}
      className="h-10 w-10 rounded-full border border-slate-800 bg-slate-900/60 overflow-hidden flex items-center justify-center"
      aria-label="Menu do perfil"
    >
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
      ) : (
        <span className="text-xs font-semibold text-slate-200">{initials}</span>
      )}
    </button>
  );

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

          <div className="flex items-center gap-3">
            {renderAvatarButton()}
            <div>
              <div className="text-xs text-slate-400">Perfil</div>
              <div className="text-sm font-semibold">{displayName}</div>
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
              <div className="relative" ref={menuRef}>
                {renderAvatarButton()}
                {menuOpen && (
                  <div className="absolute right-0 mt-2 w-44 rounded-xl border border-slate-800 bg-slate-950 shadow-lg p-2 text-sm">
                    <Link
                      href="/profile"
                      className="block rounded-lg px-3 py-2 text-slate-200 hover:bg-slate-900"
                    >
                      Perfil
                    </Link>
                    <button
                      type="button"
                      className="w-full text-left rounded-lg px-3 py-2 text-slate-200 hover:bg-slate-900"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      Trocar foto
                    </button>
                    <button
                      type="button"
                      className="w-full text-left rounded-lg px-3 py-2 text-slate-200 hover:bg-slate-900"
                      onClick={() => supabase.auth.signOut()}
                    >
                      Sair
                    </button>
                  </div>
                )}
              </div>
            </div>
          </header>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(event) => handleAvatarFile(event.target.files?.[0] ?? null)}
            className="hidden"
          />

          <div className="mt-8">{children}</div>
        </main>
      </div>
    </div>
  );
};
