import { ShieldAlert, LogIn, Mail } from "lucide-react";

export default function UserNotRegisteredError() {

  const handleLogin = () => {
    window.location.href = "/login";
  };

  const handleLogout = () => {
    // Limpia storage básico (ajustalo si usás otra cosa)
    localStorage.clear();
    sessionStorage.clear();

    // Redirige
    window.location.href = "/";
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">

      <div className="max-w-md w-full bg-card border border-border rounded-2xl p-8 text-center shadow-xl">

        {/* Icon */}
        <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20">
          <ShieldAlert className="w-8 h-8 text-primary" />
        </div>

        {/* Title */}
        <h1 className="text-2xl font-black tracking-tight mb-3">
          Acceso restringido
        </h1>

        {/* Description */}
        <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
          Tu cuenta no está registrada para usar esta aplicación.
          <br />
          Contactá al administrador para solicitar acceso.
        </p>

        {/* Actions */}
        <div className="space-y-2">

          <button
            onClick={handleLogin}
            className="w-full h-10 rounded-lg bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 hover:bg-primary/85 transition"
          >
            <LogIn className="w-4 h-4" />
            Iniciar sesión con otra cuenta
          </button>

          <button
            onClick={handleLogout}
            className="w-full h-10 rounded-lg bg-secondary text-muted-foreground text-sm hover:text-foreground hover:bg-secondary/80 transition"
          >
            Cerrar sesión
          </button>
        </div>

        {/* Info box */}
        <div className="mt-6 text-left bg-secondary/40 border border-border rounded-xl p-4 text-xs text-muted-foreground space-y-2">
          <p className="font-semibold text-foreground text-sm mb-1">
            ¿Qué podés hacer?
          </p>

          <ul className="space-y-1 list-disc list-inside">
            <li>Verificá que usás la cuenta correcta</li>
            <li>Contactá al administrador del sistema</li>
            <li>Intentá cerrar sesión y volver a entrar</li>
          </ul>
        </div>

        {/* Contact */}
        <button
          onClick={() => window.location.href = "/contact"}
          className="mt-5 inline-flex items-center gap-2 text-xs text-primary hover:underline"
        >
          <Mail className="w-3.5 h-3.5" />
          Contactar soporte
        </button>

      </div>
    </div>
  );
}