import { useState, useCallback } from "react";
import { Minus, Plus, ShoppingCart } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface QuantitySelectorProps {
  onConfirm: (qty: number) => void;
  maxStock: number;
  disabled: boolean;
}

export default function QuantitySelector({
  onConfirm,
  maxStock,
  disabled,
}: QuantitySelectorProps) {
  const [isActive, setIsActive] = useState(false);
  const [quantity, setQuantity] = useState(1);

  const canIncrease = maxStock ? quantity < maxStock : true;
  const canDecrease = quantity > 1;

  const activate = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!disabled) setIsActive(true);
  }, [disabled]);

  const increase = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (canIncrease) {
      setQuantity((q) => q + 1);
    }
  }, [canIncrease]);

  const decrease = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (canDecrease) {
      setQuantity((q) => q - 1);
    }
  }, [canDecrease]);

  const confirm = useCallback((e: React.MouseEvent) => {
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
        className="flex items-center justify-center gap-2 w-full px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/85 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
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
        className="flex items-center gap-1.5 w-full"
      >
        {/* - */}
        <button
          onClick={decrease}
          disabled={!canDecrease}
          className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>

        {/* qty */}
        <span className="text-sm font-bold w-6 text-center select-none">
          {quantity}
        </span>

        {/* + */}
        <button
          onClick={increase}
          disabled={!canIncrease}
          className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>

        {/* confirm */}
        <button
          onClick={confirm}
          className="flex-1 h-8 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/85 transition"
        >
          Añadir
        </button>
      </motion.div>
    </AnimatePresence>
  );
}