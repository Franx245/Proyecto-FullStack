import { useState, useCallback } from "react";
import { Minus, Plus, ShoppingCart } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

/**
 * @param {{
 *  onConfirm?: (qty: number) => void,
 *  maxStock?: number,
 *  disabled?: boolean
 * }} props
 */
export default function QuantitySelector({
  onConfirm,
  maxStock,
  disabled,
}) {
  const [isActive, setIsActive] = useState(false);
  const [quantity, setQuantity] = useState(1);

  const canIncrease = maxStock ? quantity < maxStock : true;
  const canDecrease = quantity > 1;

  const activate = useCallback((e) => {
    e.stopPropagation();
    if (!disabled) setIsActive(true);
  }, [disabled]);

  const increase = useCallback((e) => {
    e.stopPropagation();
    if (canIncrease) {
      setQuantity((q) => q + 1);
    }
  }, [canIncrease]);

  const decrease = useCallback((e) => {
    e.stopPropagation();
    if (canDecrease) {
      setQuantity((q) => q - 1);
    }
  }, [canDecrease]);

  const confirm = useCallback((e) => {
    e.stopPropagation();
    onConfirm?.(quantity);
    setQuantity(1);
    setIsActive(false);
  }, [onConfirm, quantity]);

  // 🧠 Estado inicial (botón simple)
  if (!isActive) {
    return (
      <button
        onClick={activate}
        disabled={disabled}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-400 via-lime-300 to-emerald-500 px-4 text-sm font-bold text-slate-950 shadow-[0_10px_24px_rgba(74,222,128,0.22)] transition-all hover:brightness-105 active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
      >
        <ShoppingCart className="w-3.5 h-3.5" />
        {disabled ? "Sin stock" : "Agregar"}
      </button>
    );
  }

  // 🚀 Selector activo
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key="qty"
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.92 }}
        transition={{ duration: 0.15 }}
        onClick={(e) => e.stopPropagation()}
        className="grid w-full grid-cols-[42px_minmax(0,1fr)_42px_auto] items-center gap-2"
      >
        <button
          onClick={decrease}
          disabled={!canDecrease}
          className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] text-slate-300 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>

        <span className="flex h-11 min-w-0 items-center justify-center rounded-2xl border border-white/10 bg-slate-950/60 px-3 text-sm font-bold text-white select-none">
          {quantity}
        </span>

        <button
          onClick={increase}
          disabled={!canIncrease}
          className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] text-slate-300 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={confirm}
          className="h-11 rounded-2xl bg-emerald-400 px-4 text-sm font-bold text-slate-950 transition hover:bg-emerald-300"
        >
          Añadir
        </button>
      </motion.div>
    </AnimatePresence>
  );
}