"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { KeyRound, LogIn, ShieldCheck, ShieldEllipsis, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { fetchRuntimeConfig, loginAdminFromStorefront, requestPasswordReset, resetPassword } from "@/api/store";
import { useAuth } from "@/lib/auth";

const TABS = [
  {
    key: "login",
    label: "Ingresar",
    icon: LogIn,
    eyebrow: "Tu cuenta",
    title: "Entrá y seguí desde donde quedaste",
    description: "Revisá pedidos, guardá direcciones y continuá tu compra sin vueltas.",
    hint: "Pedidos y direcciones",
  },
  {
    key: "register",
    label: "Crear cuenta",
    icon: UserPlus,
    eyebrow: "Cuenta nueva",
    title: "Creá tu cuenta en un momento",
    description: "Dejá tus datos listos para comprar más rápido la próxima vez.",
    hint: "Alta simple",
  },
  {
    key: "recover",
    label: "Recuperar",
    icon: KeyRound,
    eyebrow: "Recuperar acceso",
    title: "Volvé a entrar sin complicarte",
    description: "Te ayudamos a cambiar tu contraseña en pocos pasos.",
    hint: "Nueva contraseña",
  },
  {
    key: "admin",
    label: "Admin",
    icon: ShieldEllipsis,
    eyebrow: "Acceso interno",
    title: "Entrá al panel administrativo",
    description: "Si tu cuenta tiene permisos, pasás directo al panel.",
    hint: "Solo para staff",
  },
];

const ACCOUNT_PILLARS = [
  {
    title: "Tus pedidos",
    description: "Consultá el estado cuando lo necesites.",
  },
  {
    title: "Tus datos",
    description: "Guardá dirección y contacto para no repetirlos.",
  },
  {
    title: "Acceso interno",
    description: "Si corresponde, también podés entrar al panel.",
  },
];

function inputClassName() {
  return "h-12 w-full rounded-[22px] border border-white/10 bg-secondary/80 px-4 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/80 focus:border-primary/35 focus:bg-secondary focus:ring-2 focus:ring-primary/15";
}

/** @param {string} value */
function normalizeMode(value) {
  return TABS.some((item) => item.key === value) ? value : "login";
}

/** @param {unknown} value */
function normalizeRedirectPath(value) {
  const normalizedValue = typeof value === "string" ? value.trim() : "";
  if (!normalizedValue.startsWith("/") || normalizedValue.startsWith("//")) {
    return "/orders";
  }

  return normalizedValue;
}

/** @param {unknown} value */
function isValidEmail(value) {
  return typeof value === "string" && value.includes("@");
}

/** @param {unknown} value */
function normalizeCredentials(value) {
  return typeof value === "string" ? value.trim() : "";
}

/** @param {unknown} value */
function normalizeAbsoluteUrl(value) {
  const normalizedValue = typeof value === "string" ? value.trim().replace(/\/$/, "") : "";
  if (!normalizedValue) {
    return "";
  }

  return /^https?:\/\//i.test(normalizedValue) ? normalizedValue : "";
}

/** @param {string} value */
function isLocalAdminUrl(value) {
  try {
    const parsed = new URL(value);
    return ["127.0.0.1", "localhost"].includes(parsed.hostname);
  } catch {
    return false;
  }
}

/** @param {string} value */
async function canReachAdminUrl(value) {
  if (!isLocalAdminUrl(value)) {
    return true;
  }

  try {
    const healthcheckUrl = new URL("/", value).toString();
    await fetch(healthcheckUrl, {
      method: "GET",
      mode: "no-cors",
      cache: "no-store",
    });
    return true;
  } catch {
    return false;
  }
}

/** @param {unknown} error
 * @param {string} fallbackMessage
 */
function getErrorMessage(error, fallbackMessage) {
  return error instanceof Error ? error.message : fallbackMessage;
}

export default function AuthPage() {
  const { login, register, isAuthenticated, user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = useMemo(() => normalizeRedirectPath(searchParams.get("redirect")), [searchParams]);
  const modeFromQuery = useMemo(() => normalizeMode(searchParams.get("mode") || ""), [searchParams]);
  const [tab, setTab] = useState(modeFromQuery);
  const [busy, setBusy] = useState(false);
  const [loginForm, setLoginForm] = useState({ identifier: "", password: "" });
  const [adminForm, setAdminForm] = useState({ identifier: "", password: "" });
  const [registerForm, setRegisterForm] = useState({
    full_name: "",
    email: "",
    username: "",
    phone: "",
    password: "",
    confirm_password: "",
  });
  const [recoveryForm, setRecoveryForm] = useState({ email: "", token: "", password: "" });
  const activeTab = useMemo(() => TABS.find((item) => item.key === tab) || TABS[0], [tab]);

  useEffect(() => {
    setTab(modeFromQuery);
  }, [modeFromQuery]);

  /** @param {{ admin_url?: string | null, admin_port?: number | string | null } | null | undefined} runtime */
  function buildAdminUrl(runtime) {
    const configuredAdminUrl = normalizeAbsoluteUrl(runtime?.admin_url);
    if (configuredAdminUrl) {
      return configuredAdminUrl;
    }

    if (typeof window !== "undefined" && ["localhost", "127.0.0.1"].includes(window.location.hostname)) {
      return `${window.location.protocol}//${window.location.hostname}:${runtime?.admin_port || 5198}`;
    }

    return "https://duelvault-admin.vercel.app";
  }

  const switchTab = (/** @type {string} */ nextTab) => {
    setTab(nextTab);
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("mode", nextTab);
    router.replace(`/auth?${nextParams.toString()}`, { scroll: false });
  };

  if (isAuthenticated && activeTab.key !== "admin") {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[linear-gradient(160deg,rgba(10,14,22,0.96),rgba(12,17,28,0.9))] p-6 text-center shadow-[0_28px_90px_rgba(0,0,0,0.3)] sm:p-8">
          <div className="absolute inset-x-0 top-0 h-36 bg-[radial-gradient(circle_at_top_left,rgba(52,211,153,0.16),transparent_60%)]" />
          <div className="absolute -right-10 top-10 h-32 w-32 rounded-full bg-cyan-400/10 blur-3xl" />
          <div className="relative">
            <div className="inline-flex rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-primary">
              Sesión activa
            </div>
            <ShieldCheck className="mx-auto mt-6 h-12 w-12 text-primary" />
            <h1 className="mt-4 text-3xl font-black leading-tight text-foreground sm:text-4xl">Ya tenés una sesión activa</h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">Entraste como {user?.full_name || user?.username}. Podés seguir a tu cuenta, revisar pedidos o pasar al panel admin.</p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <button onClick={() => router.push("/account")} className="btn-primary rounded-[22px] px-5 py-3">Ir a mi cuenta</button>
              <button onClick={() => router.push(redirectTo)} className="rounded-[22px] border border-white/10 px-5 py-3 text-sm font-semibold text-foreground transition hover:bg-secondary/70">Continuar</button>
              <button onClick={() => switchTab("admin")} className="rounded-[22px] border border-white/10 px-5 py-3 text-sm font-semibold text-foreground transition hover:bg-secondary/70">Ingresar como admin</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /** @param {import("react").FormEvent<HTMLFormElement>} event */
  async function handleLogin(event) {
    event.preventDefault();

    if (!normalizeCredentials(loginForm.identifier) || !normalizeCredentials(loginForm.password)) {
      toast.error("Ingresá usuario y contraseña");
      return;
    }

    setBusy(true);
    try {
      await login({
        identifier: normalizeCredentials(loginForm.identifier),
        password: normalizeCredentials(loginForm.password),
      });
      toast.success("Sesión iniciada");
      router.replace(redirectTo);
    } catch (error) {
      toast.error("No pudimos iniciar sesión", { description: getErrorMessage(error, "Reintentá en unos segundos") });
    } finally {
      setBusy(false);
    }
  }

  /** @param {import("react").FormEvent<HTMLFormElement>} event */
  async function handleRegister(event) {
    event.preventDefault();

    if (!registerForm.full_name.trim() || !registerForm.username.trim() || !registerForm.email.trim() || !registerForm.phone.trim() || !registerForm.password) {
      toast.error("Completá todos los campos obligatorios");
      return;
    }

    if (!isValidEmail(registerForm.email)) {
      toast.error("Ingresá un email válido");
      return;
    }

    if (registerForm.password !== registerForm.confirm_password) {
      toast.error("Las contraseñas no coinciden");
      return;
    }

    if (registerForm.password.trim().length < 6) {
      toast.error("La contraseña debe tener al menos 6 caracteres");
      return;
    }

    setBusy(true);
    try {
      await register({
        ...registerForm,
        full_name: normalizeCredentials(registerForm.full_name),
        email: normalizeCredentials(registerForm.email),
        username: normalizeCredentials(registerForm.username),
        phone: normalizeCredentials(registerForm.phone),
      });
      toast.success("Cuenta creada", { description: "Tu perfil quedó listo para comprar." });
      router.replace(redirectTo);
    } catch (error) {
      toast.error("No pudimos crear la cuenta", { description: getErrorMessage(error, "Revisá tus datos e intentá nuevamente") });
    } finally {
      setBusy(false);
    }
  }

  /** @param {import("react").FormEvent<HTMLFormElement>} event */
  async function handleRecovery(event) {
    event.preventDefault();

    const normalizedEmail = normalizeCredentials(recoveryForm.email);
    const normalizedToken = normalizeCredentials(recoveryForm.token);
    const normalizedPassword = normalizeCredentials(recoveryForm.password);

    if (!normalizedToken) {
      if (!isValidEmail(normalizedEmail)) {
        toast.error("Ingresá un email válido");
        return;
      }
    } else if (normalizedPassword.length < 6) {
      toast.error("La nueva contraseña debe tener al menos 6 caracteres");
      return;
    }

    setBusy(true);
    try {
      if (!normalizedToken) {
        const payload = await requestPasswordReset(normalizedEmail);
        toast.success("Solicitud enviada", { description: payload.resetToken ? `Token local: ${payload.resetToken}` : payload.message });
      } else {
        await resetPassword(normalizedToken, normalizedPassword);
        toast.success("Contraseña actualizada", { description: "Ya podés volver a ingresar." });
        setRecoveryForm({ email: normalizedEmail, token: "", password: "" });
        switchTab("login");
      }
    } catch (error) {
      toast.error("No pudimos procesar la solicitud", { description: getErrorMessage(error, "Reintentá en unos segundos") });
    } finally {
      setBusy(false);
    }
  }

  /** @param {import("react").FormEvent<HTMLFormElement>} event */
  async function handleAdminLogin(event) {
    event.preventDefault();

    const identifier = normalizeCredentials(adminForm.identifier);
    const password = normalizeCredentials(adminForm.password);

    if (!identifier || !password) {
      toast.error("Ingresá credenciales admin válidas");
      return;
    }

    setBusy(true);
    try {
      const payload = await loginAdminFromStorefront({ identifier, password });
      const runtime = await fetchRuntimeConfig().catch(() => ({ runtime: null }));
      const adminUrl = buildAdminUrl(runtime.runtime);

      if (!(await canReachAdminUrl(adminUrl))) {
        toast.error("El panel admin local no está levantado", {
          description: "Ejecutá npm run dev:admin o levantá el stack completo antes de ingresar.",
        });
        setBusy(false);
        return;
      }

      const session = {
        accessToken: payload.accessToken,
        refreshToken: payload.refreshToken,
        admin: payload.admin,
      };
      const bootstrap = typeof window !== "undefined" ? window.btoa(JSON.stringify(session)) : "";
      const returnTo = typeof window !== "undefined" ? window.location.origin : "";
      setBusy(false);
      if (typeof window !== "undefined") {
        window.location.assign(`${adminUrl}?bootstrap=${encodeURIComponent(bootstrap)}&return_to=${encodeURIComponent(returnTo)}`);
      }
    } catch (error) {
      toast.error("No pudimos ingresar al panel admin", { description: getErrorMessage(error, "Verificá las credenciales e intentá nuevamente") });
      setBusy(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: "easeOut" }}
      className="mx-auto grid max-w-6xl gap-5 px-4 py-6 sm:px-5 lg:grid-cols-[1.08fr_0.92fr] lg:py-8"
    >
      <section className="order-2 relative overflow-hidden rounded-[32px] border border-white/10 bg-[linear-gradient(160deg,rgba(10,14,22,0.96),rgba(12,17,28,0.9))] p-5 shadow-[0_30px_90px_rgba(0,0,0,0.32)] sm:p-7 lg:order-1">
        <div className="absolute inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_top_left,rgba(52,211,153,0.16),transparent_60%)]" />
        <div className="absolute -left-12 top-24 h-40 w-40 rounded-full bg-emerald-400/10 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-52 w-52 rounded-full bg-cyan-400/10 blur-3xl" />

        <div className="relative">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-primary">
              RareHunter
            </span>
            <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
              Acceso a tu cuenta
            </span>
          </div>

          <h1 className="mt-6 max-w-3xl text-[2.4rem] font-black leading-[0.95] text-foreground sm:text-5xl lg:text-[3.35rem]">
            Tu cuenta para entrar, comprar y seguir tus pedidos.
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
            Desde acá podés entrar, crear tu cuenta o recuperar el acceso sin dar vueltas.
          </p>

          <div className="mt-8 space-y-3">
            {ACCOUNT_PILLARS.map((item) => (
              <div key={item.title} className="flex items-start gap-3 rounded-[22px] border border-white/10 bg-white/[0.03] px-4 py-4">
                <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-primary" />
                <div>
                  <p className="text-sm font-semibold text-foreground">{item.title}</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.description}</p>
                </div>
              </div>
            ))}
          </div>

          <p className="mt-6 max-w-xl text-sm leading-6 text-muted-foreground">
            Elegí una opción y seguí.
          </p>
        </div>
      </section>

      <section className="order-1 relative overflow-hidden rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(16,20,30,0.96),rgba(10,13,20,0.92))] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)] sm:p-7 lg:order-2">
        <div className="absolute inset-x-0 top-0 h-32 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.14),transparent_60%)]" />
        <div className="absolute -right-12 bottom-0 h-44 w-44 rounded-full bg-primary/10 blur-3xl" />

        <div className="relative">
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            {TABS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                aria-pressed={tab === key}
                onClick={() => switchTab(key)}
                className={`inline-flex items-center justify-center gap-2 rounded-[18px] px-4 py-3 text-sm font-semibold transition sm:justify-start ${tab === key ? "bg-primary text-primary-foreground shadow-[0_16px_38px_rgba(34,197,94,0.26)]" : "bg-white/[0.05] text-muted-foreground hover:bg-white/[0.08] hover:text-foreground"}`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>

          <div className="mt-5 rounded-[28px] border border-white/10 bg-background/45 p-4 backdrop-blur-sm sm:p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary/90">{activeTab.eyebrow}</p>
            <h2 className="mt-3 text-2xl font-black leading-tight text-foreground sm:text-[2rem]">{activeTab.title}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{activeTab.description}</p>
          </div>

          <div className="mt-5 rounded-[28px] border border-white/10 bg-black/10 p-4 sm:p-5">
            {activeTab.key === "login" ? (
              <form className="space-y-4" onSubmit={handleLogin}>
                <label className="block space-y-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">Email o usuario</span>
                  <input autoComplete="username" className={inputClassName()} value={loginForm.identifier} onChange={(event) => setLoginForm((current) => ({ ...current, identifier: event.target.value }))} placeholder="Email o usuario" />
                </label>
                <label className="block space-y-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">Contraseña</span>
                  <input type="password" autoComplete="current-password" className={inputClassName()} value={loginForm.password} onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))} placeholder="Contraseña" />
                </label>
                <button disabled={busy} className="btn-primary h-12 w-full rounded-[22px] text-sm font-semibold">{busy ? "Ingresando..." : "Entrar a mi cuenta"}</button>
              </form>
            ) : null}

            {activeTab.key === "register" ? (
              <form className="space-y-4" onSubmit={handleRegister}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block space-y-2">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">Nombre completo</span>
                    <input required autoComplete="name" className={inputClassName()} value={registerForm.full_name} onChange={(event) => setRegisterForm((current) => ({ ...current, full_name: event.target.value }))} placeholder="Nombre completo" />
                  </label>
                  <label className="block space-y-2">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">Usuario</span>
                    <input required autoComplete="username" className={inputClassName()} value={registerForm.username} onChange={(event) => setRegisterForm((current) => ({ ...current, username: event.target.value }))} placeholder="Usuario" />
                  </label>
                </div>
                <label className="block space-y-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">Email</span>
                  <input required type="email" autoComplete="email" className={inputClassName()} value={registerForm.email} onChange={(event) => setRegisterForm((current) => ({ ...current, email: event.target.value }))} placeholder="Email" />
                </label>
                <label className="block space-y-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">WhatsApp</span>
                  <input required type="tel" autoComplete="tel" className={inputClassName()} value={registerForm.phone} onChange={(event) => setRegisterForm((current) => ({ ...current, phone: event.target.value }))} placeholder="Número de WhatsApp" />
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block space-y-2">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">Contraseña</span>
                    <input required type="password" minLength={6} autoComplete="new-password" className={inputClassName()} value={registerForm.password} onChange={(event) => setRegisterForm((current) => ({ ...current, password: event.target.value }))} placeholder="Contraseña" />
                  </label>
                  <label className="block space-y-2">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">Confirmar contraseña</span>
                    <input required type="password" minLength={6} autoComplete="new-password" className={inputClassName()} value={registerForm.confirm_password} onChange={(event) => setRegisterForm((current) => ({ ...current, confirm_password: event.target.value }))} placeholder="Repetir contraseña" />
                  </label>
                </div>
                <button disabled={busy} className="btn-primary h-12 w-full rounded-[22px] text-sm font-semibold">{busy ? "Creando..." : "Crear cuenta"}</button>
              </form>
            ) : null}

            {activeTab.key === "recover" ? (
              <form className="space-y-4" onSubmit={handleRecovery}>
                <label className="block space-y-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">Email registrado</span>
                  <input autoComplete="email" className={inputClassName()} value={recoveryForm.email} onChange={(event) => setRecoveryForm((current) => ({ ...current, email: event.target.value }))} placeholder="Email registrado" />
                </label>
                <label className="block space-y-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">Token</span>
                  <input className={inputClassName()} value={recoveryForm.token} onChange={(event) => setRecoveryForm((current) => ({ ...current, token: event.target.value }))} placeholder="Token de recuperación" />
                </label>
                <label className="block space-y-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">Nueva contraseña</span>
                  <input type="password" autoComplete="new-password" className={inputClassName()} value={recoveryForm.password} onChange={(event) => setRecoveryForm((current) => ({ ...current, password: event.target.value }))} placeholder="Nueva contraseña" />
                </label>
                <button disabled={busy} className="btn-primary h-12 w-full rounded-[22px] text-sm font-semibold">{busy ? "Procesando..." : recoveryForm.token ? "Actualizar contraseña" : "Solicitar token"}</button>
              </form>
            ) : null}

            {activeTab.key === "admin" ? (
              <form className="space-y-4" onSubmit={handleAdminLogin}>
                <label className="block space-y-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">Email o usuario admin</span>
                  <input autoComplete="username" className={inputClassName()} value={adminForm.identifier} onChange={(event) => setAdminForm((current) => ({ ...current, identifier: event.target.value }))} placeholder="Email o usuario admin" />
                </label>
                <label className="block space-y-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">Contraseña admin</span>
                  <input type="password" autoComplete="current-password" className={inputClassName()} value={adminForm.password} onChange={(event) => setAdminForm((current) => ({ ...current, password: event.target.value }))} placeholder="Contraseña admin" />
                </label>
                <button disabled={busy} className="btn-primary h-12 w-full rounded-[22px] text-sm font-semibold">{busy ? "Ingresando..." : "Entrar al panel admin"}</button>
                <p className="text-xs leading-5 text-muted-foreground">Se abrirá el panel admin con la sesión ya iniciada.</p>
              </form>
            ) : null}
          </div>

          <p className="mt-5 text-sm leading-6 text-muted-foreground">
            Al continuar aceptás la <Link href="/privacy" className="text-primary underline">política de privacidad</Link> y los <Link href="/terms" className="text-primary underline">términos y condiciones</Link>.
          </p>
        </div>
      </section>
    </motion.div>
  );
}