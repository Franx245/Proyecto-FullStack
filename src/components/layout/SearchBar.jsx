"use client";

import { Search } from "lucide-react";

/**
 * @param {{
 *   value: string,
 *   onChange: import("react").ChangeEventHandler<HTMLInputElement>,
 *   mobile?: boolean,
 * }} props
 */
export default function SearchBar({ value, onChange, mobile = false }) {
  // 🔹 El mismo input vive en desktop y mobile con el mismo comportamiento.
  // 🔸 Solo cambia la carcasa visual para respetar el diseño original.
  // ⚠️ No cambiar name, placeholder ni aria-label: la búsqueda depende de esa UX estable.
  if (mobile) {
    return (
      <div className="relative overflow-hidden rounded-[22px] border border-white/10 bg-white/[0.04] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_left,rgba(74,222,128,0.08),transparent_40%)]" />
        <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input
          type="text"
          placeholder="Buscar cartas..."
          value={value}
          onChange={onChange}
          aria-label="Buscar cartas por nombre, tipo o rareza"
          className="relative h-11 w-full bg-transparent pl-11 pr-4 text-sm text-slate-100 transition placeholder:text-slate-500 focus:outline-none"
        />
      </div>
    );
  }

  return (
    <div className="group relative">
      <div className="pointer-events-none absolute inset-0 rounded-full bg-emerald-400/0 blur-xl transition duration-300 group-focus-within:bg-emerald-400/15" />
      <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 transition group-focus-within:text-emerald-300" />
      <input
        type="text"
        placeholder="Buscar cartas..."
        value={value}
        onChange={onChange}
        aria-label="Buscar cartas por nombre, tipo o rareza"
        className="h-12 w-full rounded-full border border-white/10 bg-white/[0.04] pl-11 pr-4 text-sm text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition placeholder:text-slate-500 focus:border-emerald-400/35 focus:outline-none focus:ring-4 focus:ring-emerald-400/10"
      />
    </div>
  );
}