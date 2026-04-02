"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { CheckCircle, ClipboardList, Clock3, Copy, Loader2, MapPin, MessageCircle, Printer, Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Package, Truck } from "lucide-react";

import { fetchMyOrders, fetchOrdersByIds, fetchStorefrontConfig } from "@/api/store";
import CardImage from "@/components/marketplace/CardImage";
import { useAuth } from "@/lib/auth";
import { formatPrice } from "@/utils/currency";
import { getTrackedOrderIds } from "@/lib/orderTracking";
import { getOrderProgress, getShippingCarrierLabel, getShippingOption, orderStatusLabel } from "@/lib/shipping";

const NON_RETRYABLE_PAYMENT_STATUSES = new Set(["approved", "pending", "in_process", "authorized", "in_mediation"]);
const PENDING_PAYMENT_FEEDBACK_KEY = "duelvault_pending_payment_feedback";

const SHIPMENT_STEPS = [
  { key: "created", label: "Preparando", Icon: Package },
  { key: "picked_up", label: "Retirado", Icon: ClipboardList },
  { key: "in_transit", label: "En tránsito", Icon: Truck },
  { key: "delivered", label: "Entregado", Icon: CheckCircle },
];

/** @param {{ status: string }} props */
function ShipmentTimeline({ status }) {
  const s = String(status || "").toLowerCase();
  const activeIndex = SHIPMENT_STEPS.findIndex((step) => step.key === s);
  const resolvedIndex = activeIndex >= 0 ? activeIndex : (s === "shipped" ? 2 : s === "completed" ? 3 : 0);

  return (
    <div className="flex items-center gap-1 pt-1">
      {SHIPMENT_STEPS.map((step, i) => {
        const done = i <= resolvedIndex;
        return (
          <div key={step.key} className="flex items-center gap-1">
            <div className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors ${done ? "bg-primary/20 text-primary" : "bg-secondary text-muted-foreground"}`}>
              <step.Icon className="h-3 w-3" />
              <span className="hidden sm:inline">{step.label}</span>
            </div>
            {i < SHIPMENT_STEPS.length - 1 ? (
              <div className={`h-px w-3 ${done ? "bg-primary/50" : "bg-border"}`} />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/** @param {*} order */
function getVisibleShippingLabel(order) {
  const carrierLabel = getShippingCarrierLabel(order?.carrier);
  if (carrierLabel) {
    return carrierLabel;
  }

  return order?.shipping_label || getShippingOption(order?.shipping_zone).label;
}

/** @param {*} order */
function hasProcessingPaymentAttempt(order) {
  return Boolean(String(order?.payment_id || "").trim());
}

function readPendingPaymentFeedback() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(PENDING_PAYMENT_FEEDBACK_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** @param {*} payload */
function writePendingPaymentFeedback(payload) {
  if (typeof window === "undefined") {
    return;
  }

  if (!payload) {
    window.sessionStorage.removeItem(PENDING_PAYMENT_FEEDBACK_KEY);
    return;
  }

  window.sessionStorage.setItem(PENDING_PAYMENT_FEEDBACK_KEY, JSON.stringify(payload));
}

/** @param {*} order */
function isWebhookConfirmationPending(order) {
  if (!order) {
    return false;
  }

  return String(order.status || "") === "pending_payment"
    && hasProcessingPaymentAttempt(order)
    && NON_RETRYABLE_PAYMENT_STATUSES.has(String(order.payment_status || "").toLowerCase());
}

/** @param {*} order */
function buildWhatsAppMessage(order) {
  const lines = order.items.map((/** @type {*} */ item) => `${item.quantity}x ${item.card?.name}${item.card?.set_code ? ` (${item.card.set_code})` : ""}`);

  return encodeURIComponent(
    `Hola, quisiera consultar sobre mi pedido #${order.id}:\n\n` +
      `Total: ${formatPrice(order.total)}\n\n` +
      `Artículos:\n${lines.join("\n")}`
  );
}

/** @param {*} order */
function canRetryDirectPayment(order) {
  if (!order) {
    return false;
  }

  if (!["pending_payment", "failed"].includes(String(order.status || ""))) {
    return false;
  }

  if (hasProcessingPaymentAttempt(order)
    && NON_RETRYABLE_PAYMENT_STATUSES.has(String(order.payment_status || "").toLowerCase())) {
    return false;
  }

  if (!order.expires_at) {
    return true;
  }

  return new Date(order.expires_at).getTime() > Date.now();
}

/** @param {string} value */
function normalizeWhatsappNumber(value) {
  return typeof value === "string" ? value.replace(/[^\d]/g, "") : "";
}

/** @param {*} item */
function getOrderItemDetailPath(item) {
  const detailId = item?.card?.detail_id ?? item?.card?.version_id;
  return detailId ? `/card/${detailId}` : null;
}

export default function OrdersPage() {
  const { isAuthenticated, isBootstrapping } = useAuth();
  const router = useRouter();
  const [payingOrderId, setPayingOrderId] = useState(null);
  const [pendingPaymentFeedback, setPendingPaymentFeedback] = useState(() => readPendingPaymentFeedback());
  const [page, setPage] = useState(1);
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
    refetchInterval: pendingPaymentFeedback ? 4000 : false,
    enabled: trackedOrderIds.length > 0,
  });
  const myOrdersQuery = useQuery({
    queryKey: ["my-orders", page],
    queryFn: () => fetchMyOrders({ page, limit: 10 }),
    staleTime: 1000 * 30,
    refetchInterval: pendingPaymentFeedback ? 4000 : false,
    enabled: !isBootstrapping && isAuthenticated,
    placeholderData: (prev) => prev,
  });

  const totalPages = myOrdersQuery.data?.totalPages ?? 1;

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

  const isLoading = isBootstrapping || trackedOrdersQuery.isLoading || myOrdersQuery.isLoading;
  const supportWhatsappNumber = normalizeWhatsappNumber(storefrontConfigQuery.data?.storefront?.support_whatsapp_number || "");

  useEffect(() => {
    writePendingPaymentFeedback(pendingPaymentFeedback);
  }, [pendingPaymentFeedback]);

  useEffect(() => {
    if (!pendingPaymentFeedback?.orderId) {
      return;
    }

    const watchedOrder = orders.find((entry) => Number(entry.id) === Number(pendingPaymentFeedback.orderId));
    if (!watchedOrder) {
      return;
    }

    if (!pendingPaymentFeedback.approvalNoticeShown) {
      const copy = pendingPaymentFeedback.paymentStatus === "approved"
        ? {
            title: "Pago aprobado",
            description: `La orden #${watchedOrder.id} está esperando la confirmación final del webhook.`,
          }
        : {
            title: "Pago en proceso",
            description: `La orden #${watchedOrder.id} se actualizará automáticamente cuando responda el webhook.`,
          };

      toast.info(copy.title, { description: copy.description, duration: 5000 });
      setPendingPaymentFeedback((/** @type {*} */ current) => (current ? { ...current, approvalNoticeShown: true } : current));
      return;
    }

    if (watchedOrder.status === "paid") {
      toast.success("Pedido pagado", {
        description: `La orden #${watchedOrder.id} fue confirmada y el aviso desaparecerá automáticamente.`,
        duration: 5000,
      });
      setPendingPaymentFeedback(null);
      return;
    }

    if (["failed", "expired", "cancelled"].includes(watchedOrder.status)) {
      toast.error("El pago no se confirmó", {
        description: `La orden #${watchedOrder.id} cambió a ${orderStatusLabel(watchedOrder.status)}.`,
        duration: 5000,
      });
      setPendingPaymentFeedback(null);
    }
  }, [orders, pendingPaymentFeedback]);

  /** @type {Record<string, string>} */
  const statusClasses = {
    pending_payment: "bg-slate-500/15 text-slate-200 border-slate-400/20",
    failed: "bg-rose-500/15 text-rose-300 border-rose-400/20",
    expired: "bg-amber-500/15 text-amber-300 border-amber-400/20",
    paid: "bg-sky-500/15 text-sky-300 border-sky-400/20",
    shipped: "bg-emerald-500/15 text-emerald-300 border-emerald-400/20",
    completed: "bg-amber-500/15 text-amber-300 border-amber-400/20",
    cancelled: "bg-rose-500/15 text-rose-300 border-rose-400/20",
  };

  /** @param {*} order */
  function handleCopy(order) {
    const lines = order.items.map((/** @type {*} */ item) => `${item.quantity}x ${item.card?.name} - ${formatPrice(item.price * item.quantity)}`);

    const text =
      `Pedido #${order.id}\n` +
      `Fecha: ${new Date(order.created_at).toLocaleString("es-AR")}\n\n` +
      `${lines.join("\n")}\n\n` +
      `Estado: ${orderStatusLabel(order.status)}\n` +
      `Envío: ${order.shipping_label || getShippingOption(order.shipping_zone).label}\n` +
      `Total: ${formatPrice(order.total)}`;

    navigator.clipboard.writeText(text);
    toast.success("Pedido copiado al portapapeles");
  }

  /** @param {*} order */
  function handleWhatsApp(order) {
    if (!supportWhatsappNumber) {
      toast.error("WhatsApp de soporte no configurado");
      return;
    }

    window.open(`https://wa.me/${supportWhatsappNumber}?text=${buildWhatsAppMessage(order)}`, "_blank");
  }

  /** @param {*} order */
  function handlePayOrder(order) {
    setPayingOrderId(/** @type {*} */ (String(order.id)));
    router.push(`/checkout/pay/${order.id}`);
  }

  /** @param {*} item */
  function handleOpenOrderItem(item) {
    const detailPath = getOrderItemDetailPath(item);
    if (detailPath) {
      router.push(detailPath);
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mx-auto max-w-[900px] px-4 py-6">
        <h1 className="mb-6 flex items-center gap-3 text-2xl font-black tracking-tight">
          <ClipboardList className="h-6 w-6 text-primary" />
          Historial de Pedidos
        </h1>

        {isLoading ? (
          <div className="flex min-h-[260px] items-center justify-center rounded-3xl border border-border bg-card/60">
            <div className="flex items-center gap-3 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Cargando pedidos...
            </div>
          </div>
        ) : !isAuthenticated && trackedOrderIds.length === 0 ? (
          <div className="py-20 text-center text-muted-foreground">
            <ClipboardList className="mx-auto mb-4 h-14 w-14 opacity-20" />
            <p className="text-base font-semibold text-foreground">Iniciá sesión para ver tu historial completo.</p>
            <p className="mt-2 text-sm">Si hiciste una compra en esta sesión, el pedido volverá a aparecer automáticamente cuando ingreses.</p>
          </div>
        ) : orders.length === 0 ? (
          <div className="py-20 text-center text-muted-foreground">
            <ClipboardList className="mx-auto mb-4 h-14 w-14 opacity-20" />
            <p className="text-base font-semibold text-foreground">Todavía no realizaste ningún pedido.</p>
            <p className="mt-2 text-sm">Cuando confirmes una compra, vas a poder seguir el estado desde esta vista.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map((order, idx) => {
              const isPaymentPendingConfirmation = order.processing_payment || isWebhookConfirmationPending(order);

              return (
                <motion.div key={order.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }} className="rounded-2xl border border-border bg-card p-5">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold">#{order.id}</p>
                      <p className="text-xs text-muted-foreground">{new Date(order.created_at).toLocaleString("es-AR")}</p>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClasses[order.status] || statusClasses.pending_payment}`}>
                        <CheckCircle className="h-3 w-3" />
                        {orderStatusLabel(order.status)}
                      </span>
                      <span className="text-lg font-black text-primary">{formatPrice(order.total)}</span>
                    </div>
                  </div>

                  <div className="mb-4 rounded-2xl border border-border bg-background/40 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Seguimiento</p>
                        <p className="mt-1 text-sm font-semibold">{getVisibleShippingLabel(order)}</p>
                        {order.shipping_label && getVisibleShippingLabel(order) !== order.shipping_label ? <p className="mt-2 text-xs text-muted-foreground">Servicio: {order.shipping_label}</p> : null}
                        {order.tracking_code ? (
                          <div className="mt-2 space-y-2">
                            <p className="text-sm text-primary">Tracking: {order.tracking_code}</p>
                            <ShipmentTimeline status={order.shipment_status || order.status} />
                          </div>
                        ) : null}
                        {order.total_ars ? <p className="mt-2 text-sm text-slate-400">Cobro Mercado Pago: {formatPrice(order.total_ars)} {order.currency || "ARS"}</p> : null}
                        {isPaymentPendingConfirmation ? (
                          <p className="mt-2 inline-flex items-center gap-2 text-sm text-amber-300">
                            <Clock3 className="h-4 w-4" />
                            Pago en conciliación. La confirmación final llega por webhook.
                          </p>
                        ) : null}
                        {!isPaymentPendingConfirmation && order.expires_at && ["pending_payment", "failed", "expired"].includes(order.status) ? (
                          <p className="mt-2 text-xs text-muted-foreground">Vence o venció: {new Date(order.expires_at).toLocaleString("es-AR")}</p>
                        ) : null}
                      </div>
                      {order.shipping_address ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <MapPin className="h-4 w-4" />
                          {order.shipping_address}
                        </div>
                      ) : null}
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-4">
                      {getOrderProgress(order.status).map((step) => (
                        <div key={step.key} className="space-y-2">
                          <div className="flex items-center gap-2">
                            <span className={`h-2.5 w-2.5 rounded-full ${step.state === "done" ? "bg-primary" : step.state === "current" ? "bg-yellow-400" : step.state === "cancelled" ? "bg-destructive" : "bg-border"}`} />
                            <span className={`text-xs font-semibold ${step.state === "upcoming" ? "text-muted-foreground" : "text-foreground"}`}>{step.label}</span>
                          </div>
                          <div className={`h-1 rounded-full ${step.state === "done" ? "bg-primary/70" : step.state === "current" ? "bg-yellow-400/70" : step.state === "cancelled" ? "bg-destructive/70" : "bg-border"}`} />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mb-4 space-y-2">
                    {order.items.map((/** @type {*} */ item) => (
                      <div
                        key={item.id}
                        onClick={() => handleOpenOrderItem(item)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            handleOpenOrderItem(item);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                        className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-background/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        <div className="h-14 w-10 shrink-0 overflow-hidden rounded-md bg-secondary">
                          {item.card?.image ? (
                            <CardImage id={item.card.ygopro_id} name={item.card.name} fallbackSrc={item.card.image} sizes="40px" className="h-full w-full object-cover" />
                          ) : (
                            <div className="h-full w-full bg-secondary" />
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{item.card?.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {item.card?.rarity}
                            {item.card?.set_code ? ` · ${item.card.set_code}` : ""}
                          </p>
                        </div>

                        <div className="shrink-0 text-right">
                          <p className="text-sm font-bold text-primary">{formatPrice(item.subtotal)}</p>
                          <p className="text-xs text-muted-foreground">x{item.quantity}</p>
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
                      <p className="mt-1 text-muted-foreground">Subtotal: {formatPrice(order.subtotal)}</p>
                      <p className="text-muted-foreground">Envío: {formatPrice(order.shipping_cost)}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 border-t border-border pt-4">
                    {isAuthenticated && canRetryDirectPayment(order) ? (
                      <button onClick={() => handlePayOrder(order)} disabled={payingOrderId === String(order.id)} className="flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-2 text-sm font-medium text-primary transition hover:bg-primary/20 disabled:opacity-50">
                        {payingOrderId === String(order.id) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wallet className="h-3.5 w-3.5" />}
                        {order.status === "pending_payment" ? "Continuar pago" : "Reintentar pago"}
                      </button>
                    ) : null}

                    {order.shipping_label_url ? (
                      <button
                        onClick={() => window.open(order.shipping_label_url, "_blank", "noopener,noreferrer")}
                        className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/10 px-3 py-2 text-sm font-medium text-primary transition hover:bg-primary/20"
                      >
                        <Printer className="h-3.5 w-3.5" />
                        Descargar etiqueta
                      </button>
                    ) : null}

                    <button onClick={() => handleCopy(order)} className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-2 text-sm text-muted-foreground transition hover:bg-secondary/80 hover:text-foreground">
                      <Copy className="h-3.5 w-3.5" />
                      Copiar pedido
                    </button>

                    <button onClick={() => handleWhatsApp(order)} className="flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-2 text-sm font-medium text-primary transition hover:bg-primary/20">
                      <MessageCircle className="h-3.5 w-3.5" />
                      Consultar por WhatsApp
                    </button>
                  </div>
                </motion.div>
              );
            })}

            {totalPages > 1 && (
              <div className="mt-6 flex items-center justify-center gap-3">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="inline-flex h-9 items-center justify-center rounded-xl border border-border px-4 text-sm font-semibold transition hover:bg-secondary disabled:pointer-events-none disabled:opacity-40"
                >
                  Anterior
                </button>
                <span className="text-sm text-muted-foreground">
                  Página {page} de {totalPages}
                </span>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="inline-flex h-9 items-center justify-center rounded-xl border border-border px-4 text-sm font-semibold transition hover:bg-secondary disabled:pointer-events-none disabled:opacity-40"
                >
                  Siguiente
                </button>
              </div>
            )}
          </div>
        )}
      </motion.div>
  );
}