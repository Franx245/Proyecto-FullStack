import { motion, AnimatePresence } from "framer-motion";
import { X, Minus, Plus, Trash2, ShoppingCart } from "lucide-react";
import { useCart } from "@/lib/cartStore";
import { useNavigate } from "react-router-dom";

/**
 * @typedef {{
 *  version_id: string | number,
 *  name: string,
 *  image?: string,
 *  price: number,
 *  quantity: number,
 *  rarity?: string
 * }} CartItemType
 */

/**
 * @typedef {{
 *  items: CartItemType[],
 *  totalItems: number,
 *  totalPrice: number,
 *  isOpen: boolean,
 *  setIsOpen: (v: boolean) => void,
 *  updateQuantity: (id: string | number, qty: number) => void,
 *  removeItem: (id: string | number) => void
 * }} CartStore
 */

/**
 * 🔥 FIX GLOBAL: casteamos el store UNA vez
 */
const useSafeCart = () => /** @type {CartStore} */ (useCart());

/**
 * @param {{ item: CartItemType }} props
 */
function CartItem({ item }) {
  const cart = useSafeCart();

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="flex gap-3 p-3 rounded-lg bg-secondary/50"
    >
      {/* IMAGE */}
      <div className="w-14 h-[72px] rounded-md bg-secondary overflow-hidden shrink-0">
        {item.image ? (
          <img
            src={item.image}
            alt={item.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground/30">
            <ShoppingCart className="w-5 h-5" />
          </div>
        )}
      </div>

      {/* INFO */}
      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-medium truncate">{item.name}</h4>
        <p className="text-xs text-muted-foreground">{item.rarity}</p>

        <p className="text-sm font-bold text-primary mt-1">
          ${(item.price * item.quantity).toFixed(2)}
        </p>
      </div>

      {/* CONTROLS */}
      <div className="flex flex-col items-end justify-between">
        <button
          onClick={() => cart.removeItem(item.version_id)}
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>

        <div className="flex items-center gap-1">
          <button
            onClick={() =>
              item.quantity > 1 &&
              cart.updateQuantity(item.version_id, item.quantity - 1)
            }
            className="w-6 h-6 rounded bg-secondary flex items-center justify-center"
          >
            <Minus className="w-3 h-3" />
          </button>

          <span className="text-xs font-semibold w-6 text-center">
            {item.quantity}
          </span>

          <button
            onClick={() =>
              cart.updateQuantity(item.version_id, item.quantity + 1)
            }
            className="w-6 h-6 rounded bg-secondary flex items-center justify-center"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

export default function CartDrawer() {
  const cart = useSafeCart();
  const navigate = useNavigate();

  return (
    <AnimatePresence>
      {cart.isOpen && (
        <>
          {/* BACKDROP */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => cart.setIsOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          />

          {/* DRAWER */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed top-0 right-0 bottom-0 w-full max-w-md bg-background border-l border-border z-50 flex flex-col"
          >
            {/* HEADER */}
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="font-bold text-lg">
                Carrito ({cart.totalItems})
              </h2>

              <button onClick={() => cart.setIsOpen(false)}>
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* ITEMS */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              <AnimatePresence>
                {cart.items.length > 0 ? (
                  cart.items.map((item) => (
                    <CartItem key={item.version_id} item={item} />
                  ))
                ) : (
                  <div className="text-center text-muted-foreground py-20">
                    Carrito vacío
                  </div>
                )}
              </AnimatePresence>
            </div>

            {/* FOOTER */}
            {cart.items.length > 0 && (
              <div className="border-t border-border p-4 space-y-3">
                <div className="flex justify-between">
                  <span>Total</span>
                  <span className="font-bold text-primary">
                    ${cart.totalPrice.toFixed(2)}
                  </span>
                </div>

                <button
                  onClick={() => {
                    cart.setIsOpen(false);
                    navigate("/cart");
                  }}
                  className="w-full h-11 bg-primary text-primary-foreground rounded-xl font-bold"
                >
                  Finalizar compra
                </button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}