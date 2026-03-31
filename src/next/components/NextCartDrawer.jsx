"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Minus, Plus, ShoppingCart, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";

import CardImage from "@/components/marketplace/CardImage";
import { useCart } from "@/lib/cartStore";

function getCartItemDetailPath(item) {
  const detailId = item?.detail_id ?? item?.version_id;
  return detailId ? `/card/${detailId}` : null;
}

const useSafeCart = () => useCart();

function DrawerItem({ item, onOpenDetail }) {
  const cart = useSafeCart();

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      onClick={() => onOpenDetail(item)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpenDetail(item);
        }
      }}
      role="button"
      tabIndex={0}
      className="flex cursor-pointer gap-3 rounded-lg bg-secondary/50 p-3 transition-colors hover:bg-secondary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <div className="h-[72px] w-14 shrink-0 overflow-hidden rounded-md bg-secondary">
        {item.image ? (
          <CardImage
            id={item.ygopro_id}
            name={item.name}
            fallbackSrc={item.image}
            sizes="56px"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground/30">
            <ShoppingCart className="h-5 w-5" />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <h4 className="truncate text-sm font-medium">{item.name}</h4>
        <p className="text-xs text-muted-foreground">{item.rarity}</p>
        <p className="mt-1 text-sm font-bold text-primary">${(item.price * item.quantity).toFixed(2)}</p>
      </div>

      <div className="flex flex-col items-end justify-between">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            cart.removeItem(item.version_id);
          }}
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              if (item.quantity > 1) {
                cart.updateQuantity(item.version_id, item.quantity - 1);
              }
            }}
            className="flex h-6 w-6 items-center justify-center rounded bg-secondary"
          >
            <Minus className="h-3 w-3" />
          </button>

          <span className="w-6 text-center text-xs font-semibold">{item.quantity}</span>

          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              cart.updateQuantity(item.version_id, item.quantity + 1);
            }}
            className="flex h-6 w-6 items-center justify-center rounded bg-secondary"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

export default function NextCartDrawer() {
  const cart = useSafeCart();
  const router = useRouter();

  const handleOpenDetail = (item) => {
    const detailPath = getCartItemDetailPath(item);
    if (!detailPath) {
      return;
    }

    cart.setIsOpen(false);
    router.push(detailPath);
  };

  return (
    <AnimatePresence>
      {cart.isOpen ? (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => cart.setIsOpen(false)}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
          />

          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed bottom-0 right-0 top-0 z-50 flex w-full max-w-md flex-col border-l border-border bg-background"
          >
            <div className="flex items-center justify-between border-b border-border p-4">
              <h2 className="text-lg font-bold">Carrito ({cart.totalItems})</h2>
              <button type="button" onClick={() => cart.setIsOpen(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto p-4">
              <AnimatePresence>
                {cart.items.length > 0 ? (
                  cart.items.map((item) => <DrawerItem key={item.version_id} item={item} onOpenDetail={handleOpenDetail} />)
                ) : (
                  <div className="py-20 text-center text-muted-foreground">Carrito vacío</div>
                )}
              </AnimatePresence>
            </div>

            {cart.items.length > 0 ? (
              <div className="space-y-3 border-t border-border p-4">
                <div className="flex justify-between">
                  <span>Total</span>
                  <span className="font-bold text-primary">${cart.totalPrice.toFixed(2)}</span>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    cart.setIsOpen(false);
                    router.push("/cart");
                  }}
                  className="h-11 w-full rounded-xl bg-primary font-bold text-primary-foreground"
                >
                  Finalizar compra
                </button>
              </div>
            ) : null}
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}