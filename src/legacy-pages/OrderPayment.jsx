import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  CreditCard,
  Loader2,
  ShieldCheck,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import { createDirectPayment, createStoreMutationId, fetchMyOrders, fetchOrdersByIds } from "@/api/store";
import { ENV } from "@/config/env";
import { useAuth } from "@/lib/auth";
import { createMercadoPagoBrowserClient } from "@/lib/mercadopago";
import { getTrackedOrderIds } from "@/lib/orderTracking";
import { orderStatusLabel } from "@/lib/shipping";
import { toast } from "sonner";

/**
 * @typedef {{ id?: number | string, card?: { name?: string | null } | null, card_id?: number | string | null, quantity?: number, price?: number | string | null, subtotal?: number | string | null }} OrderItem
 * @typedef {{ id?: number | string | null }} OrderOwner
 * @typedef {{ id?: number | string, status?: string | null, payment_id?: string | number | null, payment_status?: string | null, expires_at?: string | null, total_ars?: number | string | null, total?: number | string | null, customer_email?: string | null, customer_name?: string | null, items?: OrderItem[], user?: OrderOwner | null }} StoreOrder
 * @typedef {{ status?: string | null, status_detail?: string | null, order_id?: number | string | null }} PaymentAttempt
 * @typedef {{ id?: number | string | null }} PaymentOrder
 * @typedef {{ payment?: PaymentAttempt | null, order?: PaymentOrder | null }} DirectPaymentResponse
 * @typedef {{ type: string, number: string }} PaymentIdentification
 * @typedef {{ orderId: number, token: string, payment_method_id: string, issuer_id?: string | number | null, installments: number, identification?: PaymentIdentification }} DirectPaymentPayload
 * @typedef {{ token: string, payment_method_id: string, issuer_id?: string | number | null, installments?: number | string | null, payer?: { identification?: { type?: string | null, number?: string | null } | null } | null }} CardPaymentBrickData
 * @typedef {{ description?: string | null }} ProviderCause
 * @typedef {Error & { provider?: { cause?: ProviderCause[] } | null, cause?: unknown }} PaymentError
 * @typedef {{ unmount?: (() => void) | null }} BrickController
 * @typedef {{ title: string, description: string, tone: string, Icon: typeof CheckCircle2 | typeof Clock3 | typeof XCircle }} AttemptTone
 * @typedef {import("@tanstack/react-query").UseMutationResult<DirectPaymentResponse, PaymentError, DirectPaymentPayload, unknown>} PaymentMutation
 */

const NON_RETRYABLE_PAYMENT_STATUSES = new Set(["approved", "pending", "in_process", "authorized", "in_mediation"]);
const PENDING_PAYMENT_FEEDBACK_KEY = "duelvault_pending_payment_feedback";

/** @param {StoreOrder | null | undefined} order */
function hasProcessingPaymentAttempt(order) {
  return Boolean(String(order?.payment_id || "").trim());
}

/** @param {Record<string, unknown>} payload */
function persistPendingPaymentFeedback(payload) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(PENDING_PAYMENT_FEEDBACK_KEY, JSON.stringify(payload));
}

/** @param {number | string | null | undefined} value */
function formatCurrency(value) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

/** @param {StoreOrder | null | undefined} order */
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

/**
 * @param {string} status
 * @returns {AttemptTone}
 */
function getAttemptTone(status) {
  if (status === "approved") {
    return {
      title: "Pago enviado a conciliacion",
      description: "Mercado Pago aprobo el intento, pero la orden se confirma cuando llegue el webhook al backend.",
      tone: "border-emerald-400/25 bg-emerald-400/10 text-emerald-100",
      Icon: CheckCircle2,
    };
  }

  if (["pending", "in_process", "authorized", "in_mediation"].includes(status)) {
    return {
      title: "Pago en proceso",
      description: "El pago se creo correctamente y estamos esperando la confirmacion final del webhook.",
      tone: "border-amber-400/25 bg-amber-400/10 text-amber-100",
      Icon: Clock3,
    };
  }

  return {
    title: "Pago rechazado",
    description: "Mercado Pago rechazo este intento. Si la orden sigue vigente, podes corregir los datos y volver a intentarlo.",
    tone: "border-rose-400/25 bg-rose-400/10 text-rose-100",
    Icon: XCircle,
  };
}

export default function OrderPayment() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { orderId } = useParams();
  const numericOrderId = Number(orderId);
  const { isAuthenticated, isBootstrapping, user } = useAuth();
  const [sdkError, setSdkError] = useState("");
  const [sdkReady, setSdkReady] = useState(false);
  const [lastAttempt, setLastAttempt] = useState(/** @type {PaymentAttempt | null} */ (null));
  const brickControllerRef = useRef(/** @type {BrickController | null} */ (null));
  const paymentMutationRef = useRef(/** @type {PaymentMutation | null} */ (null));
  const trackedOrderIds = useMemo(() => {
    if (!isAuthenticated || !Number.isFinite(numericOrderId)) {
      return [];
    }

    return [numericOrderId, ...getTrackedOrderIds().filter(
      /** @param {number | string} id */
      (id) => Number(id) !== numericOrderId,
    )];
  }, [isAuthenticated, numericOrderId]);

  const trackedOrdersQuery = useQuery({
    queryKey: ["public-orders", trackedOrderIds],
    queryFn: () => fetchOrdersByIds(trackedOrderIds),
    enabled: trackedOrderIds.length > 0,
    staleTime: 1000 * 30,
  });

  const ordersQuery = useQuery({
    queryKey: ["my-orders"],
    queryFn: fetchMyOrders,
    enabled: !isBootstrapping && isAuthenticated,
  });

  const order = useMemo(() => {
    const merged = new Map();
    /** @type {StoreOrder[]} */
    const trackedOrders = Array.isArray(trackedOrdersQuery.data?.orders) ? trackedOrdersQuery.data.orders : [];
    /** @type {StoreOrder[]} */
    const myOrders = Array.isArray(ordersQuery.data?.orders) ? ordersQuery.data.orders : [];

    for (const entry of trackedOrders) {
      merged.set(String(entry.id), entry);
    }

    for (const entry of myOrders) {
      merged.set(String(entry.id), entry);
    }

    return merged.get(String(numericOrderId)) || null;
  }, [numericOrderId, ordersQuery.data?.orders, trackedOrdersQuery.data?.orders]);

  const ownsOrder = useMemo(() => {
    if (!order || !user) {
      return false;
    }

    const orderUserId = Number(order?.user?.id);
    const currentUserId = Number(user.id);
    return Number.isFinite(orderUserId) && Number.isFinite(currentUserId) && orderUserId === currentUserId;
  }, [order, user]);

  const amount = useMemo(() => {
    const rawValue = Number(order?.total_ars ?? order?.total ?? 0);
    return Number.isFinite(rawValue) ? rawValue.toFixed(2) : "0.00";
  }, [order?.total, order?.total_ars]);

  const canPay = ownsOrder && canRetryDirectPayment(order);
  const shouldPollOrder = Boolean(lastAttempt && order?.status === "pending_payment");

  /** @type {PaymentMutation} */
  const paymentMutation = useMutation({
    mutationFn: (
      /** @param {DirectPaymentPayload} payload */
      payload,
    ) => createDirectPayment(payload, {
      mutationId: createStoreMutationId(`payment-${payload.orderId}`),
    }),
    onSuccess: async (
      /** @param {DirectPaymentResponse} payload */
      payload,
    ) => {
      setLastAttempt(payload?.payment || null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["my-orders"] }),
        queryClient.invalidateQueries({ queryKey: ["public-orders"] }),
      ]);

      const paymentStatus = String(payload?.payment?.status || "").toLowerCase();
      if (paymentStatus === "approved") {
        persistPendingPaymentFeedback({
          orderId: Number(payload?.order?.id || payload?.payment?.order_id || 0) || Number(orderId),
          paymentStatus,
          createdAt: Date.now(),
          approvalNoticeShown: false,
        });
        navigate("/orders", { replace: true });
        return;
      }

      if (["pending", "in_process", "authorized", "in_mediation"].includes(paymentStatus)) {
        persistPendingPaymentFeedback({
          orderId: Number(payload?.order?.id || payload?.payment?.order_id || 0) || Number(orderId),
          paymentStatus,
          createdAt: Date.now(),
          approvalNoticeShown: false,
        });
        navigate("/orders", { replace: true });
        return;
      }

      toast.error("Pago rechazado", {
        description: payload?.payment?.status_detail || "Revisa los datos y volve a intentarlo.",
      });
    },
    onError: (
      /** @param {PaymentError} error */
      error,
    ) => {
      const providerError = error?.provider?.cause?.[0]?.description;
      toast.error("No se pudo crear el pago", {
        description: providerError || error.message || "Mercado Pago rechazo la solicitud.",
      });
    },
  });

  useEffect(() => {
    paymentMutationRef.current = paymentMutation;
  }, [paymentMutation]);

  useEffect(() => {
    if (!shouldPollOrder) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      void ordersQuery.refetch();
    }, 4000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [ordersQuery, shouldPollOrder]);

  useEffect(() => {
    if (!isAuthenticated || !order || !canPay || !ENV.MP_PUBLIC_KEY) {
      setSdkReady(false);
      return undefined;
    }

    let cancelled = false;
    /** @type {BrickController | null} */
    let localBrickController = null;
    setSdkError("");
    setSdkReady(false);

    try {
      brickControllerRef.current?.unmount?.();
    } catch {
      // noop
    }
    brickControllerRef.current = null;

    /** @param {CardPaymentBrickData} cardData */
    const handleBrickSubmit = async (cardData) => {
      if (!order || !ownsOrder || !canRetryDirectPayment(order)) {
        throw new Error("La orden ya no admite cobro directo.");
      }

      setLastAttempt(null);

      const activePaymentMutation = paymentMutationRef.current;
      if (!activePaymentMutation) {
        throw new Error("El formulario de pago no esta listo todavia.");
      }

      const payload = await activePaymentMutation.mutateAsync({
        orderId: Number(order.id),
        token: cardData.token,
        payment_method_id: cardData.payment_method_id,
        issuer_id: cardData.issuer_id || null,
        installments: Number(cardData.installments || 1),
        identification: cardData.payer?.identification?.type && cardData.payer?.identification?.number
          ? {
              type: cardData.payer.identification.type,
              number: cardData.payer.identification.number,
            }
          : undefined,
      });

      setLastAttempt(payload?.payment || null);
    };

    /** @param {PaymentError} error */
    const handleBrickError = (error) => {
      if (cancelled) {
        return;
      }

      const errorMessage = error?.message || "No se pudo inicializar el checkout seguro de Mercado Pago.";
      const errorCause = error?.cause ? ` (${String(error.cause)})` : "";
      setSdkError(`${errorMessage}${errorCause}`);
    };

    void (async () => {
      try {
        const mp = await createMercadoPagoBrowserClient(ENV.MP_PUBLIC_KEY);
        if (cancelled) {
          return;
        }

        localBrickController = await mp.bricks().create("cardPayment", "cardPaymentBrick_container", {
          initialization: {
            amount: Number(amount),
            payer: {
              email: String(order.customer_email || user?.email || ""),
            },
          },
          customization: {
            visual: {
              hideFormTitle: true,
            },
            paymentMethods: {
              minInstallments: 1,
              maxInstallments: 12,
            },
          },
          callbacks: {
            onReady: () => {
              if (cancelled) {
                return;
              }

              setSdkReady(true);
            },
            onSubmit: handleBrickSubmit,
            onError: handleBrickError,
          },
        });

        brickControllerRef.current = localBrickController;
      } catch (error) {
        if (!cancelled) {
          setSdkError(error instanceof Error ? error.message : "No se pudo cargar Mercado Pago.");
        }
      }
    })();

    return () => {
      cancelled = true;
      setSdkReady(false);
      brickControllerRef.current = null;
      try {
        localBrickController?.unmount?.();
      } catch {
        // noop
      }
    };
  }, [amount, canPay, isAuthenticated, order?.id, order?.customer_email, order?.customer_name, ownsOrder, ENV.MP_PUBLIC_KEY]);

  if (isBootstrapping) {
    return (
      <div className="mx-auto flex min-h-[40vh] max-w-[900px] items-center justify-center px-4 py-10 text-sm text-muted-foreground">
        Cargando sesion...
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <section className="mx-auto max-w-[760px] px-4 py-10">
        <div className="rounded-[32px] border border-border bg-card/80 p-8 shadow-[0_24px_80px_rgba(0,0,0,0.24)]">
          <h1 className="text-2xl font-black text-foreground">Inicia sesion para pagar</h1>
          <p className="mt-3 text-sm text-muted-foreground">El pago directo solo se habilita para el duenio de la orden autenticada.</p>
          <div className="mt-6 flex gap-3">
            <Link to="/auth" className="inline-flex h-11 items-center justify-center rounded-2xl bg-primary px-5 text-sm font-bold text-primary-foreground">
              Ir a login
            </Link>
            <Link to="/orders" className="inline-flex h-11 items-center justify-center rounded-2xl border border-border px-5 text-sm font-semibold transition hover:bg-secondary">
              Volver a Mis Pedidos
            </Link>
          </div>
        </div>
      </section>
    );
  }

  if (!Number.isFinite(numericOrderId)) {
    return (
      <div className="mx-auto max-w-[760px] px-4 py-10 text-sm text-muted-foreground">
        ID de orden invalido.
      </div>
    );
  }

  /** @type {AttemptTone | null} */
  const attemptTone = lastAttempt?.status ? getAttemptTone(String(lastAttempt.status).toLowerCase()) : null;

  return (
    <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mx-auto max-w-[1180px] px-4 py-8">
      <Link to="/orders" className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        Volver a Mis Pedidos
      </Link>

      <div className="mt-6 grid gap-6 lg:grid-cols-[0.95fr_1.25fr]">
        <div className="space-y-6">
          <div className="rounded-[32px] border border-border bg-card/80 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.24)]">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-primary">
              <ShieldCheck className="h-4 w-4" />
              Checkout API
            </div>

            <h1 className="mt-5 text-3xl font-black text-foreground">Pago tokenizado y validado por backend</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              La tarjeta se tokeniza en Mercado Pago desde tu navegador. El backend solo recibe el token, recalcula el monto y espera el webhook para cerrar la orden.
            </p>
          </div>

          <div className="rounded-[32px] border border-border bg-card/80 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.24)]">
            <h2 className="text-lg font-black text-foreground">Resumen de la orden</h2>

            {ordersQuery.isLoading || trackedOrdersQuery.isLoading ? (
              <div className="mt-5 flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Cargando orden...
              </div>
            ) : !order ? (
              <div className="mt-5 rounded-2xl border border-amber-400/25 bg-amber-400/10 p-4 text-sm text-amber-100">
                No encontramos la orden solicitada en tu historial.
              </div>
            ) : (
              <>
                <div className="mt-5 grid gap-4 rounded-3xl border border-border bg-background/50 p-5 text-sm sm:grid-cols-2">
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Orden</p>
                    <p className="mt-1 text-lg font-bold text-foreground">#{order.id}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Estado</p>
                    <p className="mt-1 font-semibold text-foreground">{orderStatusLabel(order.status)}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Total a cobrar</p>
                    <p className="mt-1 text-lg font-bold text-foreground">{formatCurrency(order.total_ars ?? order.total)}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Vigencia</p>
                    <p className="mt-1 font-medium text-foreground">
                      {order.expires_at ? new Date(order.expires_at).toLocaleString("es-AR") : "Sin vencimiento"}
                    </p>
                  </div>
                </div>

                <div className="mt-5 space-y-3">
                  {order.items?.map(
                    /** @param {OrderItem} item */
                    (item) => (
                    <div key={item.id} className="flex items-center justify-between rounded-2xl border border-border bg-background/50 px-4 py-3 text-sm">
                      <div>
                        <p className="font-semibold text-foreground">{item.card?.name || `Carta #${item.card_id}`}</p>
                        <p className="text-muted-foreground">{item.quantity} x {formatCurrency(item.price)}</p>
                      </div>
                      <p className="font-semibold text-foreground">{formatCurrency(item.subtotal)}</p>
                    </div>
                    ),
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="space-y-6">
          {attemptTone ? (
            <div className={`rounded-[32px] border p-6 ${attemptTone.tone}`}>
              <div className="flex items-start gap-3">
                <attemptTone.Icon className="mt-0.5 h-5 w-5" />
                <div>
                  <h2 className="text-lg font-black">{attemptTone.title}</h2>
                  <p className="mt-2 text-sm opacity-90">{attemptTone.description}</p>
                  {lastAttempt?.status_detail ? (
                    <p className="mt-3 text-xs uppercase tracking-[0.18em] opacity-80">Detalle: {lastAttempt.status_detail}</p>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          <div className="rounded-[32px] border border-border bg-card/80 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.24)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black text-foreground">Formulario de pago</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Monto validado por servidor: {order ? formatCurrency(amount) : "No disponible"}
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-background/60 px-4 py-3 text-xs text-muted-foreground">
                Orden #{numericOrderId}
              </div>
            </div>

            {!ENV.MP_PUBLIC_KEY ? (
              <div className="mt-6 rounded-2xl border border-rose-400/25 bg-rose-400/10 p-4 text-sm text-rose-200">
                Falta configurar VITE_MP_PUBLIC_KEY en el storefront.
              </div>
            ) : null}

            {sdkError ? (
              <div className="mt-6 rounded-2xl border border-rose-400/25 bg-rose-400/10 p-4 text-sm text-rose-200">
                {sdkError}
              </div>
            ) : null}

            {order && !canPay ? (
              <div className="mt-6 rounded-2xl border border-amber-400/25 bg-amber-400/10 p-4 text-sm text-amber-100">
                {ownsOrder
                  ? "Esta orden ya no admite cobro directo. Si vencio o ya fue pagada, revisa el historial antes de generar un nuevo pedido."
                  : "Esta orden no pertenece a tu sesion autenticada. Inicia sesion con la cuenta correcta para continuar."}
              </div>
            ) : null}

            {order && canPay ? (
              <div className="mt-6 space-y-4">
                {!sdkReady ? (
                  <div className="flex items-center gap-2 rounded-2xl border border-border bg-background/50 px-4 py-3 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Cargando formulario seguro de Mercado Pago...
                  </div>
                ) : null}

                <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white p-3 shadow-[0_24px_60px_rgba(15,23,42,0.18)]">
                  <div id="cardPaymentBrick_container" />
                </div>

                <div className="rounded-2xl border border-border bg-background/50 p-4 text-sm text-muted-foreground">
                  <div className="flex items-start gap-3">
                    <CreditCard className="mt-0.5 h-4 w-4 text-primary" />
                    <p>Los datos sensibles se tokenizan en Mercado Pago desde el Brick oficial. El backend solo recibe el token y valida orden, monto e idempotencia antes de crear el pago.</p>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          {order?.status === "paid" ? (
            <div className="rounded-[32px] border border-emerald-400/25 bg-emerald-400/10 p-6 text-emerald-100">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5" />
                <div>
                  <h2 className="text-lg font-black">La orden ya fue confirmada</h2>
                  <p className="mt-2 text-sm opacity-90">El webhook ya marco esta orden como pagada. Puedes volver al historial para seguir su avance.</p>
                  <button onClick={() => navigate("/orders")} className="mt-4 inline-flex h-10 items-center justify-center rounded-2xl bg-emerald-50 px-4 text-sm font-bold text-emerald-950">
                    Volver a Mis Pedidos
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {order?.status === "expired" ? (
            <div className="rounded-[32px] border border-amber-400/25 bg-amber-400/10 p-6 text-amber-100">
              <div className="flex items-start gap-3">
                <TriangleAlert className="mt-0.5 h-5 w-5" />
                <div>
                  <h2 className="text-lg font-black">La orden vencio</h2>
                  <p className="mt-2 text-sm opacity-90">La reserva de stock ya no puede reutilizarse. Si todavia quieres comprar, vuelve al catalogo y genera una orden nueva.</p>
                  <Link to="/singles" className="mt-4 inline-flex h-10 items-center justify-center rounded-2xl bg-amber-50 px-4 text-sm font-bold text-amber-950">
                    Volver al catalogo
                  </Link>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </motion.section>
  );
}