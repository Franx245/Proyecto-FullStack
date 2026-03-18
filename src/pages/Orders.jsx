import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  ClipboardList,
  Loader2,
  Copy,
  MapPin,
  MessageCircle,
  CheckCircle,
} from "lucide-react";
import { fetchMyOrders, fetchOrdersByIds, fetchStorefrontConfig } from "@/api/store";
import { useAuth } from "@/lib/auth";
import { getOrderProgress, getShippingOption, orderStatusLabel } from "@/lib/shipping";
import { getTrackedOrderIds } from "@/lib/orderTracking";
import { toast } from "sonner";

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
 *  created_at: string,
 *  status: string,
 *  total: number,
 *  customer_phone?: string,
 *  items: Array<{
 *    id: string | number,
 *    quantity: number,
 *    price: number,
 *    subtotal: number,
 *    card: OrderItem
 *  }>
 * }} Order
 */

// 🧠 WhatsApp message
/** @param {Order} order */
function buildWhatsAppMessage(order) {
  const lines = order.items.map(
    /** @param {{ quantity: number, card: OrderItem }} i */
    (i) =>
      `${i.quantity}x ${i.card?.name}${
        i.card?.set_code ? ` (${i.card.set_code})` : ""
      }`
  );

  return encodeURIComponent(
    `¡Hola! Quisiera consultar sobre mi pedido #${order.id}:\n\n` +
      `Total: $${order.total.toFixed(2)}\n\n` +
      `Artículos:\n${lines.join("\n")}`
  );
}

function normalizeWhatsappNumber(value) {
  return typeof value === "string" ? value.replace(/[^\d]/g, "") : "";
}

export default function Orders() {
  const { isAuthenticated } = useAuth();
  const trackedOrderIds = useMemo(() => (isAuthenticated ? getTrackedOrderIds() : []), [isAuthenticated]);
  const storefrontConfigQuery = useQuery({
    queryKey: ["storefront-config"],
    queryFn: fetchStorefrontConfig,
    staleTime: 1000 * 60,
  });
  const trackedOrdersQuery = useQuery({
    queryKey: ["public-orders", trackedOrderIds],
    queryFn: () => fetchOrdersByIds(trackedOrderIds),
    staleTime: 1000 * 30,
    enabled: trackedOrderIds.length > 0,
  });

  const myOrdersQuery = useQuery({
    queryKey: ["my-orders"],
    queryFn: fetchMyOrders,
    staleTime: 1000 * 30,
    enabled: isAuthenticated,
  });

  const orders = useMemo(() => {
    const merged = new Map();
    const publicOrders = isAuthenticated ? trackedOrdersQuery.data?.orders ?? [] : [];
    const myOrders = isAuthenticated ? myOrdersQuery.data?.orders ?? [] : [];

    for (const order of publicOrders) {
      merged.set(String(order.id), order);
    }

    for (const order of myOrders) {
      merged.set(String(order.id), order);
    }

    return Array.from(merged.values()).sort(
      (left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
    );
  }, [isAuthenticated, myOrdersQuery.data?.orders, trackedOrdersQuery.data?.orders]);

  const isLoading = trackedOrdersQuery.isLoading || myOrdersQuery.isLoading;
  const supportWhatsappNumber = normalizeWhatsappNumber(storefrontConfigQuery.data?.storefront?.support_whatsapp_number || "");

  const statusClasses = {
    pending_payment: "bg-slate-500/15 text-slate-200 border-slate-400/20",
    paid: "bg-sky-500/15 text-sky-300 border-sky-400/20",
    shipped: "bg-emerald-500/15 text-emerald-300 border-emerald-400/20",
    completed: "bg-amber-500/15 text-amber-300 border-amber-400/20",
    cancelled: "bg-rose-500/15 text-rose-300 border-rose-400/20",
  };

  /** @param {Order} order */
  const handleCopy = (order) => {
    const lines = order.items.map(
      /** @param {{ quantity: number, price: number, card: OrderItem }} i */
      (i) =>
        `${i.quantity}x ${i.card?.name} — $${(
          i.price * i.quantity
        ).toFixed(2)}`
    );

    const text =
      `Pedido #${order.id}\n` +
      `Fecha: ${new Date(order.created_at).toLocaleString("es-AR")}\n\n` +
      `${lines.join("\n")}\n\n` +
      `Estado: ${orderStatusLabel(order.status)}\n` +
      `Envío: ${order.shipping_label || getShippingOption(order.shipping_zone).label}\n` +
      `Total: $${order.total.toFixed(2)}`;

    navigator.clipboard.writeText(text);
    toast.success("Pedido copiado al portapapeles");
  };

  /** @param {Order} order */
  const handleWhatsApp = (order) => {
    if (!supportWhatsappNumber) {
      toast.error("WhatsApp de soporte no configurado");
      return;
    }

    window.open(
      `https://wa.me/${supportWhatsappNumber}?text=${buildWhatsAppMessage(order)}`,
      "_blank"
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-[900px] mx-auto px-4 py-6"
    >
      {/* Header */}
      <h1 className="text-2xl font-black tracking-tight mb-6 flex items-center gap-3">
        <ClipboardList className="w-6 h-6 text-primary" />
        Historial de Pedidos
      </h1>

      {isLoading ? (
        <div className="flex min-h-[260px] items-center justify-center rounded-3xl border border-border bg-card/60">
          <div className="flex items-center gap-3 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Cargando pedidos...
          </div>
        </div>
      ) : orders.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <ClipboardList className="w-14 h-14 mx-auto mb-4 opacity-20" />
          <p className="text-base font-semibold text-foreground">
            Todavía no realizaste ningún pedido.
          </p>
          <p className="mt-2 text-sm">
            Cuando confirmes una compra, vas a poder seguir el estado desde esta vista.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order, idx) => (
            <motion.div
              key={order.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="bg-card border border-border rounded-2xl p-5"
            >
              {/* Header */}
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                  <p className="font-bold text-sm">
                    #{order.id}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(order.created_at).toLocaleString("es-AR")}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold ${statusClasses[order.status] || statusClasses.pending_payment}`}>
                    <CheckCircle className="w-3 h-3" />
                    {orderStatusLabel(order.status)}
                  </span>

                  <span className="text-lg font-black text-primary">
                    ${order.total.toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="mb-4 rounded-2xl border border-border bg-background/40 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Seguimiento</p>
                    <p className="mt-1 text-sm font-semibold">{order.shipping_label || getShippingOption(order.shipping_zone).label}</p>
                    {order.tracking_code ? <p className="mt-2 text-sm text-primary">Tracking: {order.tracking_code}</p> : null}
                  </div>
                  {order.shipping_address ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <MapPin className="w-4 h-4" />
                      {order.shipping_address}
                    </div>
                  ) : null}
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-4">
                  {getOrderProgress(order.status).map((step) => (
                    <div key={step.key} className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 rounded-full ${step.state === "done" ? "bg-primary" : step.state === "current" ? "bg-yellow-400" : step.state === "cancelled" ? "bg-destructive" : "bg-border"}`} />
                        <span className={`text-xs font-semibold ${step.state === "upcoming" ? "text-muted-foreground" : "text-foreground"}`}>
                          {step.label}
                        </span>
                      </div>
                      <div className={`h-1 rounded-full ${step.state === "done" ? "bg-primary/70" : step.state === "current" ? "bg-yellow-400/70" : step.state === "cancelled" ? "bg-destructive/70" : "bg-border"}`} />
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2 mb-4">
                {order.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3"
                  >
                    <div className="w-10 h-14 rounded-md bg-secondary overflow-hidden shrink-0">
                      {item.card?.image ? (
                        <img
                          src={item.card.image}
                          alt={item.card.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-secondary" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {item.card?.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {item.card?.rarity}
                        {item.card?.set_code
                          ? ` · ${item.card.set_code}`
                          : ""}
                      </p>
                    </div>

                    {/* Price */}
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-primary">
                        ${item.subtotal.toFixed(2)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        x{item.quantity}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mb-4 grid gap-2 rounded-2xl border border-border bg-background/40 p-4 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Cliente</p>
                  <p className="mt-1 font-medium">{order.customer_name || "Sin nombre"}</p>
                  <p className="text-muted-foreground">{order.customer_email || order.customer_phone || "Sin contacto"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Montos</p>
                  <p className="mt-1 text-muted-foreground">Subtotal: ${order.subtotal.toFixed(2)}</p>
                  <p className="text-muted-foreground">Envío: ${order.shipping_cost.toFixed(2)}</p>
                </div>
              </div>

              <div className="flex gap-2 border-t border-border pt-4">
                <button
                  onClick={() => handleCopy(order)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Copiar pedido
                </button>

                <button
                  onClick={() => handleWhatsApp(order)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 transition"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  Consultar por WhatsApp
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
}