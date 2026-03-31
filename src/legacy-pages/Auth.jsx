import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { KeyRound, LogIn, ShieldCheck, ShieldEllipsis, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { fetchRuntimeConfig, loginAdminFromStorefront, requestPasswordReset, resetPassword } from "@/api/store";
import { useAuth } from "@/lib/auth";

const TABS = [
  { key: "login", label: "Ingresar", icon: LogIn },
  { key: "register", label: "Crear cuenta", icon: UserPlus },
  { key: "recover", label: "Recuperar", icon: KeyRound },
  { key: "admin", label: "Admin", icon: ShieldEllipsis },
];

function inputClassName() {
  return "h-11 w-full rounded-2xl border border-border bg-secondary/90 px-4 text-sm outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/20";
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

/** @param {unknown} error
 * @param {string} fallbackMessage
 */
function getErrorMessage(error, fallbackMessage) {
  return error instanceof Error ? error.message : fallbackMessage;
}

export default function AuthPage() {
  const { login, register, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get("redirect") || "/orders";
  const [tab, setTab] = useState(searchParams.get("mode") || "login");
  const [busy, setBusy] = useState(false);
  const [loginForm, setLoginForm] = useState({ identifier: "user@test.com", password: "user123" });
  const [adminForm, setAdminForm] = useState({ identifier: "admin@test.com", password: "admin123" });
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

  /** @param {{ admin_url?: string | null, admin_port?: number | string | null } | null | undefined} runtime */
  function buildAdminUrl(runtime) {
    const configuredAdminUrl = normalizeAbsoluteUrl(runtime?.admin_url);
    if (configuredAdminUrl) {
      return configuredAdminUrl;
    }

    if (["localhost", "127.0.0.1"].includes(window.location.hostname)) {
      return `${window.location.protocol}//${window.location.hostname}:${runtime?.admin_port || 5174}`;
    }

    return "https://duelvault-admin.vercel.app";
  }

  if (isAuthenticated && activeTab.key !== "admin") {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="rounded-[32px] border border-border bg-card/70 p-8 text-center shadow-[0_24px_80px_rgba(0,0,0,0.24)]">
          <ShieldCheck className="mx-auto h-12 w-12 text-primary" />
          <h1 className="mt-4 text-3xl font-black">Ya tenés una sesión activa</h1>
          <p className="mt-3 text-sm text-muted-foreground">Entraste como {user?.full_name || user?.username}. Podés seguir a tu cuenta o revisar tus pedidos.</p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button onClick={() => navigate("/account")} className="btn-primary rounded-2xl px-5 py-3">Ir a mi cuenta</button>
            <button onClick={() => navigate(redirectTo)} className="rounded-2xl border border-border px-5 py-3 text-sm font-semibold transition hover:bg-secondary">Continuar</button>
            <button onClick={() => setTab("admin")} className="rounded-2xl border border-border px-5 py-3 text-sm font-semibold transition hover:bg-secondary">Ingresar como admin</button>
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
      navigate(redirectTo);
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
      navigate(redirectTo);
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
        setTab("login");
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

      const session = {
        accessToken: payload.accessToken,
        refreshToken: payload.refreshToken,
        admin: payload.admin,
      };
      const bootstrap = window.btoa(JSON.stringify(session));
      const returnTo = window.location.origin;
      setBusy(false);
      window.location.assign(`${buildAdminUrl(runtime.runtime)}?bootstrap=${encodeURIComponent(bootstrap)}&return_to=${encodeURIComponent(returnTo)}`);
    } catch (error) {
      toast.error("No pudimos ingresar al panel admin", { description: getErrorMessage(error, "Verificá las credenciales e intentá nuevamente") });
      setBusy(false);
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mx-auto grid max-w-6xl gap-6 px-4 py-8 lg:grid-cols-[1.1fr_0.9fr]">
      <section className="overflow-hidden rounded-[36px] border border-border bg-card/80 p-6 shadow-[0_30px_90px_rgba(0,0,0,0.28)] sm:p-8">
        <div className="inline-flex rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-primary">
          Access Hub
        </div>
        <h1 className="mt-5 text-4xl font-black leading-none">Comprá, seguí pedidos y administrá tus direcciones desde una sola cuenta.</h1>
        <p className="mt-4 max-w-xl text-sm text-muted-foreground">La cuenta unifica storefront, checkout, CRM y seguimiento. En local ya tenés usuarios de prueba para validar el flujo completo.</p>
        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`rounded-3xl border px-4 py-4 text-left transition ${tab === key ? "border-primary/40 bg-primary/10" : "border-border bg-secondary/40 hover:bg-secondary/70"}`}
            >
              <Icon className="h-5 w-5 text-primary" />
              <p className="mt-4 font-semibold">{label}</p>
            </button>
          ))}
        </div>
        <div className="mt-8 rounded-[28px] border border-border bg-background/60 p-5 text-sm text-muted-foreground">
          <p className="font-semibold text-foreground">Credenciales locales</p>
          <p className="mt-2">Cliente: user@test.com / user123</p>
          <p>Admin: admin@test.com / admin123</p>
          <p>Staff: staff@test.com / staff123</p>
        </div>
      </section>

      <section className="rounded-[36px] border border-border bg-card/75 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.22)] sm:p-8">
        <div className="mb-6 flex flex-wrap gap-2">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${tab === key ? "bg-primary text-primary-foreground" : "bg-secondary/70 text-muted-foreground hover:text-foreground"}`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        {activeTab.key === "login" ? (
          <form className="space-y-4" onSubmit={handleLogin}>
            <input className={inputClassName()} value={loginForm.identifier} onChange={(event) => setLoginForm((current) => ({ ...current, identifier: event.target.value }))} placeholder="Email o usuario" />
            <input type="password" className={inputClassName()} value={loginForm.password} onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))} placeholder="Contraseña" />
            <button disabled={busy} className="btn-primary h-11 w-full rounded-2xl">{busy ? "Ingresando..." : "Entrar a mi cuenta"}</button>
          </form>
        ) : null}

        {activeTab.key === "register" ? (
          <form className="space-y-4" onSubmit={handleRegister}>
            <div className="grid gap-4 sm:grid-cols-2">
              <input required className={inputClassName()} value={registerForm.full_name} onChange={(event) => setRegisterForm((current) => ({ ...current, full_name: event.target.value }))} placeholder="Nombre completo" />
              <input required className={inputClassName()} value={registerForm.username} onChange={(event) => setRegisterForm((current) => ({ ...current, username: event.target.value }))} placeholder="Usuario" />
            </div>
            <input required type="email" className={inputClassName()} value={registerForm.email} onChange={(event) => setRegisterForm((current) => ({ ...current, email: event.target.value }))} placeholder="Email" />
            <input required type="tel" className={inputClassName()} value={registerForm.phone} onChange={(event) => setRegisterForm((current) => ({ ...current, phone: event.target.value }))} placeholder="Número de WhatsApp" />
            <div className="grid gap-4 sm:grid-cols-2">
              <input required type="password" minLength={6} className={inputClassName()} value={registerForm.password} onChange={(event) => setRegisterForm((current) => ({ ...current, password: event.target.value }))} placeholder="Contraseña" />
              <input required type="password" minLength={6} className={inputClassName()} value={registerForm.confirm_password} onChange={(event) => setRegisterForm((current) => ({ ...current, confirm_password: event.target.value }))} placeholder="Repetir contraseña" />
            </div>
            <button disabled={busy} className="btn-primary h-11 w-full rounded-2xl">{busy ? "Creando..." : "Crear cuenta"}</button>
          </form>
        ) : null}

        {activeTab.key === "recover" ? (
          <form className="space-y-4" onSubmit={handleRecovery}>
            <input className={inputClassName()} value={recoveryForm.email} onChange={(event) => setRecoveryForm((current) => ({ ...current, email: event.target.value }))} placeholder="Email registrado" />
            <input className={inputClassName()} value={recoveryForm.token} onChange={(event) => setRecoveryForm((current) => ({ ...current, token: event.target.value }))} placeholder="Token de recuperación (local)" />
            <input type="password" className={inputClassName()} value={recoveryForm.password} onChange={(event) => setRecoveryForm((current) => ({ ...current, password: event.target.value }))} placeholder="Nueva contraseña" />
            <button disabled={busy} className="btn-primary h-11 w-full rounded-2xl">{busy ? "Procesando..." : recoveryForm.token ? "Actualizar contraseña" : "Solicitar token"}</button>
          </form>
        ) : null}

        {activeTab.key === "admin" ? (
          <form className="space-y-4" onSubmit={handleAdminLogin}>
            <input className={inputClassName()} value={adminForm.identifier} onChange={(event) => setAdminForm((current) => ({ ...current, identifier: event.target.value }))} placeholder="Email o usuario admin" />
            <input type="password" className={inputClassName()} value={adminForm.password} onChange={(event) => setAdminForm((current) => ({ ...current, password: event.target.value }))} placeholder="Contraseña admin" />
            <button disabled={busy} className="btn-primary h-11 w-full rounded-2xl">{busy ? "Ingresando..." : "Entrar al panel admin"}</button>
            <p className="text-xs text-muted-foreground">Se abrirá el panel admin con la sesión ya iniciada.</p>
          </form>
        ) : null}

        <p className="mt-6 text-sm text-muted-foreground">
          Al continuar aceptás la <Link to="/privacy" className="text-primary underline">política de privacidad</Link>.
        </p>
      </section>
    </motion.div>
  );
}