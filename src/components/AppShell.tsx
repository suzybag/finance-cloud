/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRequireAuth } from "@/lib/useAuth";
import { supabase } from "@/lib/supabaseClient";
import {
  ArrowLeftRight,
  BarChart3,
  BellRing,
  Bot,
  CalendarClock,
  CalendarCheck2,
  CreditCard,
  FileText,
  HandCoins,
  Home,
  Landmark,
  Layers,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Repeat2,
  Receipt,
  Settings,
  TrendingUp,
  Upload,
} from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/accounts", label: "Contas", icon: Landmark },
  { href: "/cards", label: "Cartoes", icon: CreditCard },
  { href: "/investments", label: "Investimentos", icon: TrendingUp },
  { href: "/planning", label: "Planejamento", icon: CalendarCheck2 },
  { href: "/parcelas", label: "Parcelas", icon: Layers },
  { href: "/assinaturas", label: "Assinaturas", icon: Repeat2 },
  { href: "/alerts", label: "Alertas Inteligentes", icon: BellRing },
  { href: "/transactions", label: "Transacoes", icon: ArrowLeftRight },
  { href: "/receber", label: "Receber", icon: HandCoins },
  { href: "/gastos", label: "Gastos", icon: Receipt },
  { href: "/ai", label: "Assistente IA", icon: Bot },
  { href: "/import", label: "Importacao", icon: Upload },
  { href: "/relatorio", label: "Relatorio", icon: BarChart3 },
  { href: "/agenda", label: "Agenda", icon: CalendarClock },
  { href: "/notes", label: "Notas", icon: FileText },
  { href: "/profile", label: "Configuracoes", icon: Settings },
];

const mobilePrimaryHrefs = new Set(["/dashboard", "/accounts", "/cards", "/transactions", "/ai"]);
const mobilePrimaryItems = navItems.filter((item) => mobilePrimaryHrefs.has(item.href));
const mobileSecondaryItems = navItems.filter((item) => !mobilePrimaryHrefs.has(item.href));
const DESKTOP_NAV_COLLAPSED_KEY = "finance_desktop_nav_collapsed";

type AppShellProps = {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  hideHeader?: boolean;
  contentClassName?: string;
  children: React.ReactNode;
};

export const AppShell = ({
  title,
  subtitle,
  actions,
  hideHeader = false,
  contentClassName,
  children,
}: AppShellProps) => {
  const { user, loading } = useRequireAuth();
  const pathname = usePathname();

  const [profileName, setProfileName] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [desktopNavCollapsed, setDesktopNavCollapsed] = useState(false);
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

  const loadProfile = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("profiles")
      .select("display_name, avatar_url")
      .eq("id", user.id)
      .maybeSingle();

    setProfileName(data?.display_name ?? null);
    setAvatarUrl(data?.avatar_url ?? null);
  }, [user]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

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

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(DESKTOP_NAV_COLLAPSED_KEY);
    if (saved === "1") setDesktopNavCollapsed(true);
    if (saved === "0") setDesktopNavCollapsed(false);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(DESKTOP_NAV_COLLAPSED_KEY, desktopNavCollapsed ? "1" : "0");
  }, [desktopNavCollapsed]);

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
      className="h-10 w-10 rounded-full border border-violet-300/20 bg-violet-950/45 overflow-hidden flex items-center justify-center backdrop-blur-md"
      aria-label="Menu do perfil"
    >
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
      ) : (
        <span className="text-xs font-semibold text-violet-100">{initials}</span>
      )}
    </button>
  );

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center text-slate-100">
        Carregando...
      </div>
    );
  }

  return (
    <div className="min-h-screen text-slate-100">
      <div className="flex min-h-screen">
        <aside className={`hidden border-r border-violet-300/20 bg-[linear-gradient(180deg,rgba(20,12,42,0.94),rgba(11,9,29,0.94))] backdrop-blur-2xl transition-all duration-300 lg:flex lg:flex-col ${desktopNavCollapsed ? "w-[92px] gap-4 px-3 py-4" : "w-64 gap-6 p-6"}`}>
          <div className={`flex items-center ${desktopNavCollapsed ? "justify-center" : "justify-between"} gap-3`}>
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 overflow-hidden rounded-xl border border-violet-300/20 bg-violet-950/45 shadow-[0_12px_28px_rgba(109,40,217,0.4)]">
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl} alt="Foto de perfil" className="h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full w-full place-items-center text-sm font-bold text-violet-100">
                    {initials}
                  </div>
                )}
              </div>
              {!desktopNavCollapsed ? (
                <div>
                  <div className="text-sm text-violet-100/80">Finance Cloud</div>
                  <div className="text-sm font-semibold">{displayName}</div>
                </div>
              ) : null}
            </div>
            {!desktopNavCollapsed ? (
              <button
                type="button"
                className="rounded-xl border border-violet-300/20 bg-violet-950/40 p-2 text-violet-100 transition hover:border-violet-200/35 hover:bg-violet-900/45"
                onClick={() => setDesktopNavCollapsed(true)}
                aria-label="Recolher menu lateral"
                title="Recolher menu"
              >
                <PanelLeftClose className="h-4 w-4" />
              </button>
            ) : null}
          </div>

          {desktopNavCollapsed ? (
            <button
              type="button"
              className="mx-auto rounded-xl border border-violet-300/20 bg-violet-950/40 p-2 text-violet-100 transition hover:border-violet-200/35 hover:bg-violet-900/45"
              onClick={() => setDesktopNavCollapsed(false)}
              aria-label="Expandir menu lateral"
              title="Expandir menu"
            >
              <PanelLeftOpen className="h-4 w-4" />
            </button>
          ) : null}

          <nav className={`flex flex-col ${desktopNavCollapsed ? "gap-1.5" : "gap-2"}`}>
            {navItems.map((item) => {
              const active = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={desktopNavCollapsed ? item.label : undefined}
                  className={`rounded-xl text-sm font-medium transition ${
                    active
                      ? "border border-violet-300/40 bg-violet-500/25 text-violet-50"
                      : "text-violet-100/85 hover:bg-violet-500/12"
                  } ${
                    desktopNavCollapsed
                      ? "flex h-11 w-full items-center justify-center px-0 py-0"
                      : "px-3 py-2"
                  }`}
                >
                  <span className={`inline-flex items-center ${desktopNavCollapsed ? "gap-0" : "gap-3"}`}>
                    <Icon className={`${desktopNavCollapsed ? "h-5 w-5" : "h-4 w-4"}`} />
                    {!desktopNavCollapsed ? item.label : null}
                  </span>
                </Link>
              );
            })}
          </nav>

          {!desktopNavCollapsed ? (
            <div className="mt-auto rounded-2xl border border-violet-300/20 bg-violet-950/35 p-4 text-sm text-violet-100/85 backdrop-blur-lg">
              <div className="font-semibold text-white">Alertas prontos</div>
              <p className="mt-1 text-xs text-violet-100/60">
                Jobs/cron podem ser ligados depois. Hoje os alertas sao gerados no
                login.
              </p>
            </div>
          ) : (
            <div className="mt-auto" />
          )}

          <button
            className={`mt-2 rounded-xl border border-violet-300/20 bg-violet-950/35 text-violet-100 hover:border-violet-200/35 ${
              desktopNavCollapsed
                ? "mx-auto inline-flex h-10 w-10 items-center justify-center px-0 py-0"
                : "w-full px-3 py-2 text-sm"
            }`}
            onClick={() => supabase.auth.signOut()}
            title={desktopNavCollapsed ? "Sair" : undefined}
            aria-label="Sair"
          >
            {desktopNavCollapsed ? <LogOut className="h-4 w-4" /> : "Sair"}
          </button>
        </aside>

        <main className={`ultra-shell-bg flex-1 p-4 pb-28 sm:p-6 sm:pb-28 lg:p-10 lg:pb-10 ${contentClassName ?? ""}`}>
          <div className="mb-4 flex gap-2 overflow-x-auto lg:hidden">
            {mobileSecondaryItems.map((item) => {
              const active = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={`mobile-${item.href}`}
                  href={item.href}
                  className={`whitespace-nowrap rounded-full border px-3 py-2 text-[11px] font-semibold ${
                    active
                      ? "border-violet-300/50 bg-violet-500/25 text-violet-100"
                      : "border-violet-300/20 bg-violet-950/35 text-violet-100/80"
                  }`}
                >
                  <span className="inline-flex items-center gap-2">
                    <Icon className="h-3.5 w-3.5" />
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </div>
          {!hideHeader ? (
            <header className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-violet-200/45">
                  Finance Cloud
                </div>
                <h1 className="text-3xl font-extrabold tracking-tight text-white">{title}</h1>
                {subtitle && <p className="text-sm text-violet-100/75">{subtitle}</p>}
              </div>

              <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
                {actions}
                <div className="relative" ref={menuRef}>
                  {renderAvatarButton()}
                  {menuOpen && (
                    <div className="absolute right-0 mt-2 w-44 rounded-xl border border-violet-300/20 bg-violet-950/95 backdrop-blur-xl shadow-lg p-2 text-sm">
                      <Link
                        href="/profile"
                        className="block rounded-lg px-3 py-2 text-violet-100 hover:bg-violet-500/15"
                      >
                        Perfil
                      </Link>
                      <button
                        type="button"
                        className="w-full text-left rounded-lg px-3 py-2 text-violet-100 hover:bg-violet-500/15"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        Trocar foto
                      </button>
                      <button
                        type="button"
                        className="w-full text-left rounded-lg px-3 py-2 text-violet-100 hover:bg-violet-500/15"
                        onClick={() => supabase.auth.signOut()}
                      >
                        Sair
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </header>
          ) : (
            <div className="flex items-center justify-end">
              <div className="relative" ref={menuRef}>
                {renderAvatarButton()}
                {menuOpen && (
                  <div className="absolute right-0 mt-2 w-44 rounded-xl border border-violet-300/20 bg-violet-950/95 backdrop-blur-xl shadow-lg p-2 text-sm">
                    <Link
                      href="/profile"
                      className="block rounded-lg px-3 py-2 text-violet-100 hover:bg-violet-500/15"
                    >
                      Perfil
                    </Link>
                    <button
                      type="button"
                      className="w-full text-left rounded-lg px-3 py-2 text-violet-100 hover:bg-violet-500/15"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      Trocar foto
                    </button>
                    <button
                      type="button"
                      className="w-full text-left rounded-lg px-3 py-2 text-violet-100 hover:bg-violet-500/15"
                      onClick={() => supabase.auth.signOut()}
                    >
                      Sair
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(event) => handleAvatarFile(event.target.files?.[0] ?? null)}
            className="hidden"
          />

          <div className={hideHeader ? "mt-4" : "mt-8"}>{children}</div>
        </main>
      </div>

      <nav className="fixed inset-x-3 bottom-3 z-40 rounded-2xl border border-violet-300/20 bg-violet-950/90 p-1.5 backdrop-blur-xl lg:hidden">
        <div className="grid grid-cols-5 gap-1">
          {mobilePrimaryItems.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={`bottom-${item.href}`}
                href={item.href}
                className={`flex min-h-12 flex-col items-center justify-center rounded-xl px-1 py-1.5 text-[10px] font-semibold transition ${
                  active
                    ? "bg-violet-500/25 text-violet-100"
                    : "text-violet-100/78 hover:bg-violet-500/12"
                }`}
              >
                <Icon className="mb-1 h-4 w-4" />
                <span className="truncate">{item.label.replace("Assistente ", "")}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
};
