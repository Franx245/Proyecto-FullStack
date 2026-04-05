import { createContext, useContext, useState, useCallback, useEffect } from "react";

interface CartItem {
  version_id: string;
  detail_id?: string;
  name: string;
  quantity: number;
  price: number;
  rarity?: string;
  image?: string;
  set_name?: string;
  ygopro_id?: string | number;
  stock?: number;
}

interface CartContextType {
  items: CartItem[];
  isOpen: boolean;
  isHydrated: boolean;
  addItem: (version: Omit<CartItem, "quantity">, qty: number) => void;
  removeItem: (versionId: string) => void;
  updateQuantity: (versionId: string, quantity: number) => void;
  patchItemsByCardId: (cardId: number, patch: { stock?: number; price?: number; isVisible?: boolean }) => void;
  clearCart: () => void;
  totalItems: number;
  totalPrice: number;
  setIsOpen: (open: boolean) => void;
}

const CartContext = createContext<CartContextType | null>(null);
const STORAGE_KEY = "yugioh_cart";

function getSafeStorage() {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") {
    return null;
  }

  return window.localStorage;
}

function clampQuantity(quantity: number, stock?: number) {
  if (typeof stock !== "number") {
    return quantity;
  }

  return Math.max(1, Math.min(quantity, stock));
}

// 🧠 Carga segura
function loadCart(): CartItem[] {
  try {
    const storage = getSafeStorage();
    if (!storage) {
      return [];
    }

    const stored = storage.getItem(STORAGE_KEY);
    return stored ? (JSON.parse(stored) as CartItem[]) : [];
  } catch {
    return [];
  }
}

// 💾 Guardado
function saveCart(items: CartItem[]) {
  const storage = getSafeStorage();
  if (!storage) {
    return;
  }

  storage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setItems(loadCart());
    setIsHydrated(true);
  }, []);

  // Persistencia automática
  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    saveCart(items);
  }, [isHydrated, items]);

  // 🛒 Agregar item (por versión)
  const addItem = useCallback((version: Omit<CartItem, "quantity">, qty: number) => {
    const item = { ...version, quantity: qty };
    setItems((prev) => {
      const existing = prev.find(
        (i) => i.version_id === item.version_id
      );

      if (existing) {
        return prev.map((i) =>
          i.version_id === item.version_id
            ? { ...i, quantity: clampQuantity(i.quantity + item.quantity, i.stock ?? item.stock) }
            : i
        );
      }

      return [
        ...prev,
        { ...item, quantity: clampQuantity(item.quantity, item.stock) },
      ];
    });
  }, []);

  // ❌ Remover item
  const removeItem = useCallback((versionId: string) => {
    setItems((prev) => prev.filter((i) => i.version_id !== versionId));
  }, []);

  // 🔄 Actualizar cantidad
  const updateQuantity = useCallback((versionId: string, quantity: number) => {
    if (quantity <= 0) {
      setItems((prev) => prev.filter((i) => i.version_id !== versionId));
      return;
    }

    setItems((prev) =>
      prev.map((i) =>
        i.version_id === versionId ? { ...i, quantity: clampQuantity(quantity, i.stock) } : i
      )
    );
  }, []);

  // 🔄 Patch stock/price de items por cardId (realtime SSE)
  const patchItemsByCardId = useCallback((cardId: number, patch: { stock?: number; price?: number; isVisible?: boolean }) => {
    const versionId = String(cardId);
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.version_id === versionId);
      if (idx === -1) return prev;

      const item = prev[idx];
      const nextStock = typeof patch.stock === "number" ? patch.stock : item.stock;
      const nextPrice = typeof patch.price === "number" ? patch.price : item.price;
      const isVisible = typeof patch.isVisible === "boolean" ? patch.isVisible : true;

      // Remove item if stock drops to 0 or the card becomes hidden.
      if (!isVisible || (typeof nextStock === "number" && nextStock <= 0)) {
        return prev.filter((i) => i.version_id !== versionId);
      }

      const nextQty = clampQuantity(item.quantity, nextStock);

      if (nextStock === item.stock && nextPrice === item.price && nextQty === item.quantity) {
        return prev;
      }

      return prev.map((i) =>
        i.version_id === versionId
          ? { ...i, stock: nextStock, price: nextPrice, quantity: nextQty }
          : i
      );
    });
  }, []);

  // 🧹 Limpiar carrito
  const clearCart = useCallback(() => {
    saveCart([]);
    setItems([]);
  }, []);

  // 📊 Totales
  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);
  const totalPrice = items.reduce(
    (sum, i) => sum + (i.price ?? 0) * i.quantity,
    0
  );

  return (
    <CartContext.Provider
      value={{
        items,
        addItem,
        removeItem,
        updateQuantity,
        patchItemsByCardId,
        clearCart,
        totalItems,
        totalPrice,
        isOpen,
        isHydrated,
        setIsOpen,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

// Hook
export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}