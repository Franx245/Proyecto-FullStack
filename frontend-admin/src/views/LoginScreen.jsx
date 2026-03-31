import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ShieldAlert } from "lucide-react";
import { loginAdmin } from "../lib/api";

export default function LoginScreen({ onLoggedIn }) {
  const [email, setEmail] = useState("admin@test.com");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState("");

  const loginMutation = useMutation({
    mutationFn: loginAdmin,
    onSuccess: (session) => {
      setError("");
      onLoggedIn(session);
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="glass w-full max-w-md rounded-3xl border border-white/10 p-8 shadow-glow">
        <div className="mb-8">
          <p className="inline-flex items-center gap-2 rounded-full border border-ember/30 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">
            <ShieldAlert className="h-3.5 w-3.5" />
            DuelVault Admin 🐉
          </p>
          <h1 className="mt-5 text-3xl font-black text-white">Panel del duelista</h1>
          <p className="mt-2 text-sm text-slate-300">Acceso por roles, sesión persistente y control táctico de la tienda.</p>
        </div>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            loginMutation.mutate({ email, password });
          }}
        >
          <div>
            <label className="mb-1.5 block text-sm text-slate-300">Usuario o email</label>
            <input
              className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm text-slate-300">Contraseña</label>
            <input
              type="password"
              className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-xs text-slate-400">
            <p>👑 Admin por defecto: admin / admin</p>
            <p className="mt-1">👑 Admin alternativo: admin@test.com / admin123</p>
            <p className="mt-1">🛡️ Staff: staff@test.com / staff123</p>
          </div>

          {error ? (
            <p className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={loginMutation.isPending}
            className="w-full rounded-2xl bg-amber-500 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-amber-400 disabled:opacity-60"
          >
            {loginMutation.isPending ? "Ingresando..." : "Ingresar"}
          </button>
        </form>
      </div>
    </div>
  );
}