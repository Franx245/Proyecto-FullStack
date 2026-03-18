import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Minus,
  Plus,
  Trash2,
  ShoppingCart,
  ArrowLeft,
  Loader2,
} from "lucide-react";

import { useCart } from "@/lib/cartStore";
import { checkoutCart } from "@/api/store";
import { trackOrderId } from "@/lib/orderTracking";
import { toast } from "sonner";

/**
 * @typedef {{
 *  version_id: string | number,
 *  name: string,
 *  image?: string,
 *  rarity?: string,
 *  set_name?: string,
 *  price: number,
 *  quantity: number
 * }} CartItem
 */

// 🧩 Row
/** @param {{ item: CartItem }} props */
function CartRow({ item }) {
  const { updateQuantity, removeItem } = useCart();

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex gap-4 p-4 bg-card border border-border rounded-xl hover:border-border/80 transition"
    >
      {/* Image */}
      <div className="w-16 h-[84px] rounded-lg bg-secondary overflow-hidden shrink-0">
        {item.image ? (
          <img
            src={item.image}
            alt={item.name}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ShoppingCart className="w-5 h-5 text-muted-foreground/30" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-sm">{item.name}</h3>
        <p className="text-xs text-muted-foreground">
          {item.rarity}
          {item.set_name ? ` · ${item.set_name}` : ""}
        </p>

        <p className="text-base font-bold text-primary mt-2">
          ${(item.price * item.quantity).toFixed(2)}
        </p>
        <p className="text-[11px] text-muted-foreground">
          ${item.price.toFixed(2)} c/u
        </p>
      </div>

      {/* Controls */}
      <div className="flex flex-col items-end justify-between">
        <button
          onClick={() => removeItem(String(item.version_id))}
          className="p-1 text-muted-foreground hover:text-destructive transition"
        >
          <Trash2 className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2 bg-secondary rounded-lg px-2 py-1">
          <button
            onClick={() =>
              updateQuantity(String(item.version_id), item.quantity - 1)
            }
          >
            <Minus className="w-3.5 h-3.5" />
          </button>

          <span className="text-sm font-bold w-5 text-center">
            {item.quantity}
          </span>

          <button
            onClick={() =>
              updateQuantity(String(item.version_id), item.quantity + 1)
            }
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// 🛒 Page
export default function CartPage() {
  const { items, totalPrice, totalItems, clearCart } = useCart();
  const navigate = useNavigate();

  const [phone, setPhone] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [errors, setErrors] = useState({});

  const checkoutMutation = useMutation({
    mutationFn: checkoutCart,
    onSuccess: ({ order }) => {
      trackOrderId(order.id);
      clearCart();

      toast.success("¡Pedido confirmado!", {
        description: `Orden ${order.id}`,
      });

      navigate("/orders");
    },
    onError: (error) => {
      toast.error("No se pudo completar el checkout", {
        description: error.message,
      });
    },
  });

  const validate = () => {
    /** @type {Record<string, string>} */
    const nextErrors = {};
    if (!phone.trim()) nextErrors.phone = "Ingresá tu número de WhatsApp";
    if (!accepted) nextErrors.accepted = "Debés aceptar la política de privacidad";
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleConfirm = async () => {
    if (!validate()) return;

    checkoutMutation.mutate({
      items: items.map((item) => ({
        cardId: Number(item.version_id),
        quantity: item.quantity,
      })),
      phone,
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-[1100px] mx-auto px-4 py-6"
    >
      <Link
        to="/singles"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Seguir comprando
      </Link>

      <h1 className="text-2xl font-black mb-6 flex items-center gap-3">
        <ShoppingCart className="w-6 h-6 text-primary" />
        Tu Carrito
        <span className="text-sm text-muted-foreground">
          ({totalItems} items)
        </span>
      </h1>

      {items.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <ShoppingCart className="w-14 h-14 mx-auto mb-4 opacity-20" />
          <p>Tu carrito está vacío.</p>
          <Link to="/singles" className="text-primary hover:underline">
            Ver cartas →
          </Link>
        </div>
      ) : (
        <div className="grid lg:grid-cols-[1fr_360px] gap-6">
          {/* Items */}
          <div className="space-y-3">
            <AnimatePresence>
              {items.map((item) => (
                <CartRow key={item.version_id} item={item} />
              ))}
            </AnimatePresence>
          </div>

          {/* Summary */}
          <div className="bg-card border border-border rounded-3xl p-6 space-y-4 sticky top-20 shadow-[0_20px_40px_rgba(0,0,0,0.18)]">
            <h2 className="font-bold text-lg">Resumen</h2>

            <div className="text-sm space-y-1">
              {items.map((item) => (
                <div
                  key={item.version_id}
                  className="flex justify-between text-muted-foreground"
                >
                  <span>
                    {item.name} x{item.quantity}
                  </span>
                  <span>
                    ${(item.price * item.quantity).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>

            <div className="border-t pt-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>${totalPrice.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-yellow-400">
                <span>Envío</span>
                <span>A coordinar</span>
              </div>
              <div className="flex justify-between font-bold text-base">
                <span>Total</span>
                <span className="text-primary">
                  ${totalPrice.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Form */}
            <div className="space-y-3 border-t pt-4">
              <input
                type="tel"
                placeholder="+54 9 11..."
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  setErrors((prev) => ({ ...prev, phone: "" }));
                }}
                className="w-full h-11 px-3 rounded-xl border border-border bg-secondary outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/20"
              />
              {errors.phone ? <p className="text-xs text-destructive">{errors.phone}</p> : null}

              <label className="flex gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={accepted}
                  onChange={(e) => {
                    setAccepted(e.target.checked);
                    setErrors((prev) => ({ ...prev, accepted: "" }));
                  }}
                />
                Acepto la{" "}
                <Link to="/privacy" className="text-primary underline">
                  política
                </Link>
              </label>
              {errors.accepted ? <p className="text-xs text-destructive">{errors.accepted}</p> : null}

              <button
                onClick={handleConfirm}
                disabled={checkoutMutation.isPending || !phone || !accepted}
                className="w-full h-11 rounded-xl bg-primary font-bold text-primary-foreground flex items-center justify-center gap-2 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {checkoutMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Procesando...
                  </>
                ) : (
                  "Confirmar Pedido"
                )}
              </button>
              <p className="text-[11px] text-muted-foreground">
                El pedido se crea como pendiente y el stock queda reservado inmediatamente.
              </p>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}