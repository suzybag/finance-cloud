"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import DotGrid from "@/components/DotGrid";
import { getAuthStorageMode, setAuthStorageMode, supabase } from "@/lib/supabaseClient";
import { sanitizeEmail, sanitizeOtpCode, validateStrongPassword } from "@/lib/security/input";

type AuthMode = "login" | "signup";
type LoginStep = "credentials" | "otp";

type Ripple = {
  id: number;
  x: number;
  y: number;
};

const REMEMBER_LOGIN_KEY = "finance_remember_login";
const REMEMBER_EMAIL_KEY = "finance_remember_email";
const TERMS_VERSION = process.env.NEXT_PUBLIC_TERMS_VERSION || "2026-02-19";
const PRIVACY_VERSION = process.env.NEXT_PUBLIC_PRIVACY_VERSION || "2026-02-19";

const getInitialRememberLogin = () => {
  if (typeof window === "undefined") return true;
  const savedFlag = window.localStorage.getItem(REMEMBER_LOGIN_KEY);
  return savedFlag !== null ? savedFlag !== "0" : getAuthStorageMode() === "local";
};

const getInitialRememberedEmail = () => {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(REMEMBER_EMAIL_KEY) ?? "";
};

const parseLockUntil = (value: unknown) => {
  if (!value) return 0;
  const parsed = Date.parse(String(value));
  if (!Number.isFinite(parsed) || parsed <= Date.now()) return 0;
  return parsed;
};

export default function LoginPage() {
  const router = useRouter();
  const panelRef = useRef<HTMLElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  const [mode, setMode] = useState<AuthMode>("login");
  const [loginStep, setLoginStep] = useState<LoginStep>("credentials");
  const [email, setEmail] = useState(getInitialRememberedEmail);
  const [password, setPassword] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpChallengeId, setOtpChallengeId] = useState("");
  const [otpMaskedEmail, setOtpMaskedEmail] = useState<string | null>(null);
  const [otpExpiresAt, setOtpExpiresAt] = useState<string | null>(null);
  const [rememberLogin, setRememberLogin] = useState(getInitialRememberLogin);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [openFinanceConsent, setOpenFinanceConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const reason = new URLSearchParams(window.location.search).get("reason");
    return reason === "idle" ? "Sessao encerrada automaticamente por inatividade." : null;
  });
  const [ripple, setRipple] = useState<Ripple | null>(null);
  const [lockUntil, setLockUntil] = useState<number>(0);
  const [nowTs, setNowTs] = useState(0);

  useEffect(() => {
    setAuthStorageMode(rememberLogin);

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace("/dashboard");
    });
  }, [rememberLogin, router]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = Date.now();
      setNowTs(now);
      if (lockUntil && now >= lockUntil) {
        setLockUntil(0);
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [lockUntil]);

  const resetOtpFlow = () => {
    setLoginStep("credentials");
    setOtpCode("");
    setOtpChallengeId("");
    setOtpMaskedEmail(null);
    setOtpExpiresAt(null);
  };

  const otpSecondsRemaining = otpExpiresAt && nowTs
    ? Math.max(Math.ceil((Date.parse(otpExpiresAt) - nowTs) / 1000), 0)
    : 0;

  const handlePanelMove = (event: React.MouseEvent<HTMLElement>) => {
    const panel = panelRef.current;
    if (!panel) return;

    const rect = panel.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const px = x / rect.width;
    const py = y / rect.height;

    const rotY = (px - 0.5) * 10;
    const rotX = (0.5 - py) * 8;

    panel.style.transform = `rotateX(${rotX}deg) rotateY(${rotY}deg)`;
    panel.style.borderColor = "rgba(255,255,255,.16)";
    panel.style.setProperty("--gx", `${px * 100}%`);
    panel.style.setProperty("--gy", `${py * 100}%`);
  };

  const handlePanelLeave = () => {
    const panel = panelRef.current;
    if (!panel) return;
    panel.style.transform = "rotateX(0deg) rotateY(0deg)";
    panel.style.borderColor = "rgba(255,255,255,.10)";
    panel.style.setProperty("--gx", "50%");
    panel.style.setProperty("--gy", "50%");
  };

  const triggerRipple = (event: React.MouseEvent<HTMLButtonElement>) => {
    const button = buttonRef.current;
    if (!button) return;

    const rect = button.getBoundingClientRect();
    const nextRipple = {
      id: Date.now(),
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };

    setRipple(nextRipple);
    setTimeout(() => {
      setRipple((current) => (current?.id === nextRipple.id ? null : current));
    }, 700);
  };

  const persistRememberChoice = (sanitizedEmail: string) => {
    setAuthStorageMode(rememberLogin);
    window.localStorage.setItem(REMEMBER_LOGIN_KEY, rememberLogin ? "1" : "0");
    if (rememberLogin) {
      window.localStorage.setItem(REMEMBER_EMAIL_KEY, sanitizedEmail);
    } else {
      window.localStorage.removeItem(REMEMBER_EMAIL_KEY);
    }
  };

  const syncConsentIfAuthenticated = async (accessToken: string) => {
    await fetch("/api/privacy/consent", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        terms_accepted: true,
        privacy_accepted: true,
        marketing_opt_in: marketingOptIn,
        open_finance_accepted: openFinanceConsent,
      }),
    }).catch(() => null);
  };

  const finalizeLoginSession = async (
    sanitizedEmail: string,
    session: { access_token?: string; refresh_token?: string } | undefined,
  ) => {
    if (!session?.access_token || !session.refresh_token) {
      setError("Sessao de login invalida. Tente novamente.");
      return false;
    }

    persistRememberChoice(sanitizedEmail);
    const { error: sessionError } = await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });

    if (sessionError) {
      setError(sessionError.message);
      return false;
    }

    resetOtpFlow();
    setPassword("");
    setLockUntil(0);
    router.push("/dashboard");
    return true;
  };

  const startLoginWithOtp = async (sanitizedEmail: string) => {
    const response = await fetch("/api/auth/login/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: sanitizedEmail,
        password,
      }),
    });

    const data = await response.json().catch(() => ({} as Record<string, unknown>));
    if (!response.ok) {
      const nextLock = parseLockUntil(data?.lock_until);
      if (nextLock) setLockUntil(nextLock);

      const baseMessage = String(data?.message || "Falha ao iniciar login seguro.");
      const attempts = Number(data?.attempts_remaining);
      if (Number.isFinite(attempts) && attempts >= 0) {
        setError(`${baseMessage} Tentativas restantes: ${attempts}.`);
      } else {
        setError(baseMessage);
      }
      return false;
    }

    if (data?.requires_otp === false) {
      const completed = await finalizeLoginSession(
        sanitizedEmail,
        data?.session as { access_token?: string; refresh_token?: string } | undefined,
      );
      if (!completed) return false;

      if (data?.security_mode === "degraded") {
        setMessage("Login concluido em modo degradado. Configure APP_ENCRYPTION_KEY e SUPABASE_SERVICE_ROLE_KEY para reativar OTP.");
      } else {
        setMessage("Login concluido.");
      }
      return true;
    }

    setLoginStep("otp");
    setOtpChallengeId(String(data?.challenge_id || ""));
    setOtpExpiresAt(String(data?.expires_at || ""));
    setOtpMaskedEmail(String(data?.masked_email || sanitizedEmail));
    setOtpCode("");
    setMessage(`Codigo enviado para ${String(data?.masked_email || sanitizedEmail)}.`);
    return true;
  };

  const verifyOtpAndLogin = async (sanitizedEmail: string) => {
    const normalizedOtp = sanitizeOtpCode(otpCode);
    if (!otpChallengeId || normalizedOtp.length !== 6) {
      setError("Informe o codigo de 6 digitos enviado por email.");
      return false;
    }

    const response = await fetch("/api/auth/login/verify-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        challenge_id: otpChallengeId,
        otp: normalizedOtp,
      }),
    });

    const data = await response.json().catch(() => ({} as Record<string, unknown>));
    if (!response.ok) {
      const baseMessage = String(data?.message || "Falha ao validar OTP.");
      const attempts = Number(data?.attempts_remaining);
      if (Number.isFinite(attempts) && attempts >= 0) {
        setError(`${baseMessage} Tentativas restantes: ${attempts}.`);
      } else {
        setError(baseMessage);
      }
      return false;
    }

    const session = data?.session as { access_token?: string; refresh_token?: string } | undefined;
    return finalizeLoginSession(sanitizedEmail, session);
  };

  const handleForgotPassword = async (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    setError(null);
    setMessage(null);

    const sanitizedEmail = sanitizeEmail(email);
    if (!sanitizedEmail) {
      setError("Informe seu email para recuperar a senha.");
      return;
    }

    const redirectTo = typeof window !== "undefined" ? `${window.location.origin}/` : undefined;
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(sanitizedEmail, { redirectTo });
    if (resetError) {
      setError(resetError.message);
      return;
    }

    setMessage("Email de recuperacao enviado.");
  };

  const handleResendOtp = async (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    if (loading) return;

    const sanitizedEmail = sanitizeEmail(email);
    if (!sanitizedEmail || !password) {
      setError("Para reenviar o codigo, informe email e senha novamente.");
      setLoginStep("credentials");
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);
    await startLoginWithOtp(sanitizedEmail);
    setLoading(false);
  };

  const handleSubmit = async (event: React.MouseEvent<HTMLButtonElement>) => {
    triggerRipple(event);

    setLoading(true);
    setError(null);
    setMessage(null);

    const sanitizedEmail = sanitizeEmail(email);
    if (!sanitizedEmail) {
      setError("Informe um email valido.");
      setLoading(false);
      return;
    }

    if (mode === "login") {
      if (loginStep === "credentials" && !password) {
        setError("Informe email e senha.");
        setLoading(false);
        return;
      }

      if (loginStep === "credentials" && lockUntil && Date.now() < lockUntil) {
        const seconds = Math.max(Math.ceil((lockUntil - Date.now()) / 1000), 1);
        const minutes = Math.ceil(seconds / 60);
        setError(`Login temporariamente bloqueado. Tente novamente em ${minutes} minuto(s).`);
        setLoading(false);
        return;
      }

      if (loginStep === "credentials") {
        await startLoginWithOtp(sanitizedEmail);
      } else {
        await verifyOtpAndLogin(sanitizedEmail);
      }

      setLoading(false);
      return;
    }

    const passwordError = validateStrongPassword(password);
    if (passwordError) {
      setError(passwordError);
      setLoading(false);
      return;
    }
    if (!acceptTerms || !acceptPrivacy) {
      setError("Voce precisa aceitar os Termos e a Politica de Privacidade.");
      setLoading(false);
      return;
    }

    const nowIso = new Date().toISOString();
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: sanitizedEmail,
      password,
      options: {
        data: {
          terms_accepted: true,
          terms_version: TERMS_VERSION,
          terms_accepted_at: nowIso,
          privacy_accepted: true,
          privacy_version: PRIVACY_VERSION,
          privacy_accepted_at: nowIso,
          marketing_opt_in: marketingOptIn,
          open_finance_accepted: openFinanceConsent,
        },
      },
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    if (signUpData.session?.access_token) {
      await syncConsentIfAuthenticated(signUpData.session.access_token);
    }

    setMessage("Cadastro criado. Verifique seu email para confirmar.");
    setPassword("");
    setLoading(false);
  };

  return (
    <div className="login-root">
      <div className="dot-grid-bg" aria-hidden="true">
        <DotGrid
          dotSize={5}
          gap={15}
          baseColor="#271E37"
          activeColor="#5227FF"
          proximity={120}
          shockRadius={250}
          shockStrength={5}
          resistance={750}
          returnDuration={1.5}
        />
      </div>
      <div className="stars" aria-hidden="true" />

      <div className="wrap">
        <div className="scene">
          <section
            className="panel"
            ref={panelRef}
            onMouseMove={handlePanelMove}
            onMouseLeave={handlePanelLeave}
          >
            <div className="glow" />

            <div className="shape s1" aria-hidden="true" />
            <div className="shape s2" aria-hidden="true" />
            <div className="shape s3" aria-hidden="true" />

            <div className="inner">
              <aside className="side">
                <div className="logo" title="Logo" />
                <small>LOGIN</small>
              </aside>

              <main className="main">
                <div className="hero">
                  <div className="chip">
                    <span className="dot" /> Interface Dark - 3D - Glass
                  </div>
                  <h1>Bem-vindo</h1>
                  <p>
                    Uma capa de login no mesmo estilo roxo/magenta + laranja,
                    com efeito 3D, glow e animacoes suaves.
                  </p>
                </div>

                <div className="login-card">
                  <h2>
                    {mode === "signup"
                      ? "Criar conta"
                      : loginStep === "otp"
                        ? "Verificacao em duas etapas"
                        : "Entrar"}
                  </h2>
                  <p className="sub">
                    {mode === "signup"
                      ? "Crie sua conta com senha forte e consentimento LGPD."
                      : loginStep === "otp"
                        ? `Digite o codigo OTP enviado para ${otpMaskedEmail || "seu email"}.`
                        : "Digite email e senha para receber seu codigo OTP."}
                  </p>

                  <div className="auth-switch">
                    <button
                      type="button"
                      className={`switch-btn ${mode === "login" ? "active" : ""}`}
                      onClick={() => {
                        setMode("login");
                        setError(null);
                        setMessage(null);
                        resetOtpFlow();
                      }}
                      disabled={loading}
                    >
                      Entrar
                    </button>
                    <button
                      type="button"
                      className={`switch-btn ${mode === "signup" ? "active" : ""}`}
                      onClick={() => {
                        setMode("signup");
                        setError(null);
                        setMessage(null);
                        resetOtpFlow();
                      }}
                      disabled={loading}
                    >
                      Criar conta
                    </button>
                  </div>

                  <div className="field">
                    <label htmlFor="email">E-mail</label>
                    <input
                      id="email"
                      type="email"
                      placeholder="voce@exemplo.com"
                      autoComplete="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                    />
                  </div>

                  {mode === "login" && loginStep === "otp" ? (
                    <div className="field">
                      <label htmlFor="otp-code">Codigo OTP</label>
                      <input
                        id="otp-code"
                        type="text"
                        placeholder="000000"
                        autoComplete="one-time-code"
                        inputMode="numeric"
                        maxLength={6}
                        value={otpCode}
                        onChange={(event) => setOtpCode(sanitizeOtpCode(event.target.value))}
                      />
                    </div>
                  ) : (
                    <div className="field">
                      <label htmlFor="password">Senha</label>
                      <input
                        id="password"
                        type="password"
                        placeholder="••••••••"
                        autoComplete={mode === "signup" ? "new-password" : "current-password"}
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                      />
                    </div>
                  )}

                  {mode === "login" && loginStep === "credentials" ? (
                    <label className="remember-row" htmlFor="remember-login">
                      <input
                        id="remember-login"
                        type="checkbox"
                        checked={rememberLogin}
                        onChange={(event) => setRememberLogin(event.target.checked)}
                      />
                      <span>Salvar login neste dispositivo</span>
                    </label>
                  ) : null}

                  {mode === "signup" ? (
                    <>
                      <label className="remember-row" htmlFor="accept-terms">
                        <input
                          id="accept-terms"
                          type="checkbox"
                          checked={acceptTerms}
                          onChange={(event) => setAcceptTerms(event.target.checked)}
                        />
                        <span>Aceito os Termos de Uso ({TERMS_VERSION})</span>
                      </label>
                      <label className="remember-row" htmlFor="accept-privacy">
                        <input
                          id="accept-privacy"
                          type="checkbox"
                          checked={acceptPrivacy}
                          onChange={(event) => setAcceptPrivacy(event.target.checked)}
                        />
                        <span>Aceito a Politica de Privacidade ({PRIVACY_VERSION})</span>
                      </label>
                      <label className="remember-row" htmlFor="marketing-opt-in">
                        <input
                          id="marketing-opt-in"
                          type="checkbox"
                          checked={marketingOptIn}
                          onChange={(event) => setMarketingOptIn(event.target.checked)}
                        />
                        <span>Aceito receber comunicacoes (opcional)</span>
                      </label>
                      <label className="remember-row" htmlFor="open-finance-consent">
                        <input
                          id="open-finance-consent"
                          type="checkbox"
                          checked={openFinanceConsent}
                          onChange={(event) => setOpenFinanceConsent(event.target.checked)}
                        />
                        <span>Autorizo uso de dados Open Finance (opcional)</span>
                      </label>
                    </>
                  ) : null}

                  {error ? <p className="feedback error">{error}</p> : null}
                  {!error && lockUntil ? (
                    <p className="feedback error">
                      Login bloqueado temporariamente por seguranca.
                    </p>
                  ) : null}
                  {mode === "login" && loginStep === "otp" && otpSecondsRemaining > 0 ? (
                    <p className="feedback success">
                      Codigo expira em {Math.ceil(otpSecondsRemaining / 60)} minuto(s).
                    </p>
                  ) : null}
                  {message ? <p className="feedback success">{message}</p> : null}

                  <div className="row">
                    {mode === "signup" ? (
                      <span className="link">Cadastro com seguranca bancaria</span>
                    ) : (
                      <a
                        className="link"
                        href="#"
                        onClick={loginStep === "otp" ? handleResendOtp : handleForgotPassword}
                      >
                        {loginStep === "otp" ? "Reenviar codigo" : "Esqueci minha senha"}
                      </a>
                    )}
                    <button
                      ref={buttonRef}
                      className="btn"
                      id="btn"
                      type="button"
                      onClick={handleSubmit}
                      disabled={loading}
                    >
                      {loading
                        ? "Processando..."
                        : mode === "signup"
                          ? "Cadastrar"
                          : loginStep === "otp"
                            ? "Validar codigo"
                            : "Enviar codigo OTP"}
                      {ripple ? (
                        <span
                          className="ripple"
                          style={{ left: `${ripple.x}px`, top: `${ripple.y}px` }}
                        />
                      ) : null}
                    </button>
                  </div>
                </div>
              </main>
            </div>
          </section>
        </div>
      </div>

      <style jsx>{`
        .login-root {
          --bg-tl: #ac28a3;
          --bg-tr: #c9995b;
          --bg-bl: #562e87;
          --bg-br: #ad32ba;
          --deep1: #101020;
          --deep2: #201030;
          --accent: #ff4fd8;
          --accent2: #ffd08a;
          --shadow: 0 40px 120px rgba(0, 0, 0, 0.55);
          --r: 22px;

          min-height: 100vh;
          color: rgba(255, 255, 255, 0.92);
          overflow: hidden;
          background:
            radial-gradient(900px 650px at 10% 8%, rgba(172, 40, 163, 0.95) 0%, rgba(172, 40, 163, 0) 60%),
            radial-gradient(900px 650px at 92% 10%, rgba(201, 153, 91, 0.92) 0%, rgba(201, 153, 91, 0) 62%),
            radial-gradient(900px 650px at 15% 92%, rgba(86, 46, 135, 0.92) 0%, rgba(86, 46, 135, 0) 60%),
            radial-gradient(900px 650px at 92% 92%, rgba(173, 50, 186, 0.95) 0%, rgba(173, 50, 186, 0) 62%),
            linear-gradient(180deg, var(--deep1), var(--deep2));
        }

        .stars {
          position: fixed;
          inset: 0;
          pointer-events: none;
          background-image:
            radial-gradient(1px 1px at 10% 20%, rgba(255, 255, 255, 0.22) 50%, transparent 52%),
            radial-gradient(1px 1px at 30% 70%, rgba(255, 255, 255, 0.18) 50%, transparent 52%),
            radial-gradient(1px 1px at 70% 30%, rgba(255, 255, 255, 0.16) 50%, transparent 52%),
            radial-gradient(1px 1px at 85% 60%, rgba(255, 255, 255, 0.14) 50%, transparent 52%),
            radial-gradient(1px 1px at 50% 45%, rgba(255, 255, 255, 0.1) 50%, transparent 52%);
          opacity: 0.9;
          mix-blend-mode: screen;
        }

        .wrap {
          height: 100%;
          min-height: 100vh;
          display: grid;
          place-items: center;
          padding: 26px;
        }

        .scene {
          perspective: 1200px;
          width: min(1080px, 96vw);
        }

        .panel {
          position: relative;
          border-radius: var(--r);
          background:
            radial-gradient(1200px 500px at 30% 20%, rgba(255, 255, 255, 0.06) 0%, transparent 55%),
            linear-gradient(180deg, rgba(16, 16, 32, 0.78), rgba(32, 16, 48, 0.78));
          border: 1px solid rgba(255, 255, 255, 0.1);
          box-shadow: var(--shadow);
          overflow: hidden;
          transform-style: preserve-3d;
          transform: rotateX(0deg) rotateY(0deg);
          transition: transform 260ms ease, border-color 260ms ease;
          min-height: 520px;
        }

        .glow {
          position: absolute;
          inset: -2px;
          background:
            radial-gradient(520px 360px at var(--gx, 50%) var(--gy, 50%), rgba(255, 79, 216, 0.35) 0%, transparent 62%),
            radial-gradient(560px 380px at calc(var(--gx, 50%) + 18%) calc(var(--gy, 50%) - 10%), rgba(255, 208, 138, 0.22) 0%, transparent 62%);
          opacity: 0.9;
          pointer-events: none;
          transform: translateZ(2px);
          mix-blend-mode: screen;
        }

        .inner {
          position: relative;
          display: grid;
          grid-template-columns: 86px 1fr;
          min-height: 520px;
          transform: translateZ(20px);
        }

        .side {
          padding: 16px 10px;
          border-right: 1px solid rgba(255, 255, 255, 0.08);
          background: linear-gradient(180deg, rgba(0, 0, 0, 0.12), rgba(0, 0, 0, 0.02));
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 14px;
        }

        .logo {
          width: 44px;
          height: 44px;
          border-radius: 999px;
          background:
            radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.35), transparent 52%),
            linear-gradient(135deg, rgba(255, 79, 216, 0.75), rgba(124, 92, 255, 0.55));
          border: 1px solid rgba(255, 255, 255, 0.18);
          box-shadow: 0 18px 40px rgba(0, 0, 0, 0.35);
        }

        .side small {
          writing-mode: vertical-rl;
          transform: rotate(180deg);
          letter-spacing: 0.18em;
          color: rgba(255, 255, 255, 0.45);
          font-weight: 800;
          font-size: 10px;
          margin-top: 4px;
          user-select: none;
        }

        .main {
          padding: 34px 34px 26px;
          display: grid;
          grid-template-columns: 1.2fr 1fr;
          gap: 26px;
          align-items: center;
        }

        .hero h1 {
          margin: 0 0 8px;
          font-size: clamp(26px, 3.2vw, 44px);
          letter-spacing: 0.02em;
          font-weight: 950;
        }

        .hero p {
          margin: 0;
          color: rgba(255, 255, 255, 0.62);
          max-width: 46ch;
          line-height: 1.55;
        }

        .chip {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 10px 12px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(0, 0, 0, 0.18);
          color: rgba(255, 255, 255, 0.78);
          font-weight: 850;
          font-size: 12px;
          margin-bottom: 14px;
          backdrop-filter: blur(10px);
        }

        .dot {
          width: 10px;
          height: 10px;
          border-radius: 999px;
          background: linear-gradient(135deg, var(--accent), var(--accent2));
          box-shadow: 0 0 0 6px rgba(255, 79, 216, 0.14);
        }

        .login-card {
          border-radius: 18px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(0, 0, 0, 0.18);
          backdrop-filter: blur(12px);
          padding: 18px;
          box-shadow: 0 18px 50px rgba(0, 0, 0, 0.35);
          transform: translateZ(40px);
        }

        .login-card h2 {
          margin: 0 0 6px;
          font-size: 18px;
          font-weight: 950;
        }

        .sub {
          margin: 0 0 14px;
          font-size: 12px;
          color: rgba(255, 255, 255, 0.62);
          line-height: 1.4;
        }

        .auth-switch {
          display: flex;
          gap: 8px;
          margin-bottom: 12px;
        }

        .switch-btn {
          border: 1px solid rgba(255, 255, 255, 0.2);
          background: rgba(0, 0, 0, 0.2);
          color: rgba(255, 255, 255, 0.8);
          border-radius: 999px;
          padding: 6px 10px;
          font-size: 11px;
          font-weight: 800;
          cursor: pointer;
        }

        .switch-btn.active {
          border-color: rgba(255, 79, 216, 0.55);
          background: rgba(255, 79, 216, 0.18);
          color: rgba(255, 255, 255, 0.95);
        }

        .field {
          display: grid;
          gap: 8px;
          margin: 10px 0;
        }

        .remember-row {
          margin-top: 8px;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          font-weight: 700;
          color: rgba(255, 255, 255, 0.78);
          user-select: none;
        }

        .remember-row input {
          width: 15px;
          height: 15px;
          padding: 0;
          margin: 0;
          accent-color: #a855f7;
          border-radius: 4px;
          border: 1px solid rgba(255, 255, 255, 0.25);
          background: rgba(16, 16, 32, 0.38);
          box-shadow: none;
          transform: none;
        }

        label {
          font-size: 12px;
          color: rgba(255, 255, 255, 0.7);
          font-weight: 800;
        }

        input {
          width: 100%;
          padding: 12px 12px;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(16, 16, 32, 0.38);
          color: rgba(255, 255, 255, 0.92);
          outline: none;
          transition: transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
        }

        input:focus {
          border-color: rgba(255, 79, 216, 0.45);
          box-shadow: 0 0 0 3px rgba(255, 79, 216, 0.16);
          transform: translateY(-1px);
        }

        .feedback {
          margin: 8px 0;
          border-radius: 10px;
          padding: 10px;
          font-size: 12px;
          font-weight: 700;
        }

        .feedback.error {
          background: rgba(239, 68, 68, 0.16);
          border: 1px solid rgba(239, 68, 68, 0.36);
          color: rgba(254, 226, 226, 0.95);
        }

        .feedback.success {
          background: rgba(34, 197, 94, 0.16);
          border: 1px solid rgba(34, 197, 94, 0.36);
          color: rgba(220, 252, 231, 0.95);
        }

        .row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-top: 12px;
        }

        .btn {
          position: relative;
          border: none;
          cursor: pointer;
          padding: 12px 14px;
          border-radius: 14px;
          font-weight: 950;
          background: linear-gradient(135deg, rgba(255, 79, 216, 0.95), rgba(255, 208, 138, 0.9));
          color: rgba(16, 16, 32, 0.92);
          box-shadow: 0 16px 45px rgba(255, 79, 216, 0.16), 0 18px 50px rgba(0, 0, 0, 0.35);
          min-width: 140px;
          overflow: hidden;
          transition: transform 160ms ease, filter 160ms ease;
        }

        .btn:hover {
          filter: brightness(1.02);
          transform: translateY(-1px);
        }

        .btn:active {
          transform: translateY(0px) scale(0.99);
        }

        .btn:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .link {
          color: rgba(255, 255, 255, 0.75);
          font-size: 12px;
          font-weight: 850;
          text-decoration: none;
          opacity: 0.9;
        }

        .link:hover {
          opacity: 1;
          text-decoration: underline;
        }

        .shape {
          position: absolute;
          width: 110px;
          height: 70px;
          border-radius: 14px;
          background: linear-gradient(135deg, rgba(255, 79, 216, 0.55), rgba(124, 92, 255, 0.3));
          border: 1px solid rgba(255, 255, 255, 0.12);
          opacity: 0.85;
          transform-style: preserve-3d;
          box-shadow: 0 18px 60px rgba(0, 0, 0, 0.35);
          animation: float 8s ease-in-out infinite;
        }

        .shape.s1 {
          left: 44%;
          top: 22%;
          transform: translateZ(60px) rotate(12deg);
        }

        .shape.s2 {
          left: 62%;
          top: 34%;
          width: 90px;
          height: 90px;
          border-radius: 18px;
          animation-duration: 10s;
        }

        .shape.s3 {
          left: 52%;
          top: 46%;
          width: 70px;
          height: 70px;
          border-radius: 999px;
          animation-duration: 9s;
          background: linear-gradient(135deg, rgba(255, 208, 138, 0.55), rgba(255, 79, 216, 0.28));
        }

        .ripple {
          position: absolute;
          border-radius: 999px;
          transform: translate(-50%, -50%);
          pointer-events: none;
          background: radial-gradient(circle, rgba(255, 255, 255, 0.85) 0%, rgba(255, 255, 255, 0.35) 30%, transparent 60%);
          width: 10px;
          height: 10px;
          animation: ripple 650ms ease-out forwards;
          mix-blend-mode: soft-light;
        }

        @keyframes float {
          0%,
          100% {
            transform: translateY(0px) translateZ(50px) rotate(12deg);
          }
          50% {
            transform: translateY(-16px) translateZ(80px) rotate(14deg);
          }
        }

        @keyframes ripple {
          0% {
            opacity: 0.85;
            width: 10px;
            height: 10px;
          }
          100% {
            opacity: 0;
            width: 520px;
            height: 520px;
          }
        }

        @media (max-width: 920px) {
          .inner {
            grid-template-columns: 1fr;
          }

          .side {
            display: none;
          }

          .main {
            grid-template-columns: 1fr;
          }

          .panel {
            min-height: unset;
          }

          .shape {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}
