import { createContext, useContext, useState, useCallback, useEffect } from "react";

interface CartItem {
  version_id: string;
  name: string;
  quantity: number;
  price: number;
  rarity?: string;
  image?: string;
  set_name?: string;
  stock?: number;
}

interface CartContextType {
  items: CartItem[];
  isOpen: boolean;
  addItem: (version: Omit<CartItem, "quantity">, qty: number) => void;
  removeItem: (versionId: string) => void;
  updateQuantity: (versionId: string, quantity: number) => void;
  clearCart: () => void;
  totalItems: number;
  totalPrice: number;
  setIsOpen: (open: boolean) => void;
}

const CartContext = createContext<CartContextType | null>(null);
const STORAGE_KEY = "yugioh_cart";

function clampQuantity(quantity: number, stock?: number) {
  if (typeof stock !== "number") {
    return quantity;
  }

  return Math.max(1, Math.min(quantity, stock));
}

// 🧠 Carga segura
function loadCart(): CartItem[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? (JSON.parse(stored) as CartItem[]) : [];
  } catch {
    return [];
  }
}

// 💾 Guardado
function saveCart(items: CartItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState(loadCart);
  const [isOpen, setIsOpen] = useState(false);

  // Persistencia automática
  useEffect(() => {
    saveCart(items);
  }, [items]);

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

  // 🧹 Limpiar carrito
  const clearCart = useCallback(() => {
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
        clearCart,
        totalItems,
        totalPrice,
        isOpen,
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