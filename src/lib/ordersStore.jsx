import { createContext, useContext, useState, useCallback, useEffect } from "react";

/**
 * @typedef {{
 *  version_id: string | number,
 *  name: string,
 *  quantity: number,
 *  price: number,
 *  rarity?: string,
 *  image?: string,
 *  set_code?: string,
 *  set_name?: string
 * }} OrderItem
 */

/**
 * @typedef {{
 *  id: string,
 *  createdAt: string,
 *  status: string,
 *  total: number,
 *  phone?: string,
 *  items: OrderItem[]
 * }} Order
 */

/**
 * @typedef {{
 *  orders: Order[],
 *  addOrder: (orderData: Omit<Order, "id" | "createdAt" | "status">) => Order,
 *  getOrderById: (orderId: string) => Order | undefined,
 *  clearOrders: () => void,
 *  updateOrderStatus: (orderId: string, status: string) => void
 * }} OrdersContextValue
 */

const OrdersContext = createContext(/** @type {OrdersContextValue | null} */ (null));
const STORAGE_KEY = "duelvault_orders";

// 🧠 Carga segura
function loadOrders() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? /** @type {Order[]} */ (JSON.parse(stored)) : [];
  } catch {
    return [];
  }
}

// 💾 Guardado
/** @param {Order[]} orders */
function saveOrders(orders) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
}

// 🆔 Generador simple de ID
function generateOrderId() {
  return `ORD-${Date.now()}`;
}

/** @param {{ children: import("react").ReactNode }} props */
export function OrdersProvider({ children }) {
  const [orders, setOrders] = useState(loadOrders);

  // Persistencia automática
  useEffect(() => {
    saveOrders(orders);
  }, [orders]);

  // ➕ Crear orden
  /** @param {Omit<Order, "id" | "createdAt" | "status">} orderData */
  const addOrder = useCallback(
    /** @param {Omit<Order, "id" | "createdAt" | "status">} orderData */
    (orderData) => {
    const newOrder = {
      id: generateOrderId(),
      createdAt: new Date().toISOString(),
      status: "pending", // pending | sent | completed
      ...orderData,
    };

    setOrders((prev) => [newOrder, ...prev]);
    return newOrder;
    },
    []
  );

  // 🔍 Obtener orden por ID
  const getOrderById = useCallback(
    /** @param {string} orderId */
    (orderId) => {
      return orders.find((o) => o.id === orderId);
    },
    [orders]
  );

  // 🧹 Limpiar historial (opcional)
  const clearOrders = useCallback(() => {
    setOrders([]);
  }, []);

  // 🔄 Cambiar estado (para futuro backend)
  /** @param {string} orderId @param {string} status */
  const updateOrderStatus = useCallback(
    /** @param {string} orderId @param {string} status */
    (orderId, status) => {
      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId ? { ...o, status } : o
        )
      );
    },
    []
  );

  return (
    <OrdersContext.Provider
      value={{
        orders,
        addOrder,
        getOrderById,
        clearOrders,
        updateOrderStatus,
      }}
    >
      {children}
    </OrdersContext.Provider>
  );
}

// Hook
export function useOrders() {
  const ctx = useContext(OrdersContext);
  if (!ctx) throw new Error("useOrders must be used within OrdersProvider");
  return ctx;
}