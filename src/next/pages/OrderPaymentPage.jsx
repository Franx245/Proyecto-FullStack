"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, CheckCircle2, Clock3, Loader2, ShieldCheck, TriangleAlert, XCircle } from "lucide-react";
import { toast } from "sonner";

import { createDirectPayment, createStoreMutationId, fetchMyOrders, fetchOrdersByIds } from "@/api/store";
import { ENV } from "@/config/env";
import { useAuth } from "@/lib/auth";
import {
  createMercadoPagoBrickBuilder,
  createMercadoPagoBrowserClient,
  createMercadoPagoBrickDarkStyle,
} from "@/lib/mercadopago";
import { getTrackedOrderIds } from "@/lib/orderTracking";
import { orderStatusLabel } from "@/lib/shipping";
import { getUsableStoredUserSession } from "@/lib/userSession";

/** @typedef {{ unmount?: () => void }} BrickControllerLike */
/** @typedef {{ type?: string, number?: string }} IdentificationLike */
/** @typedef {{ identification?: IdentificationLike }} PayerLike */
/** @typedef {{ token: string, payment_method_id: string, issuer_id?: string|number|null, installments?: string|number, payer?: PayerLike }} BrickSubmitLike */
/** @typedef {{ status?: string, status_detail?: string, order_id?: string|number|null }} PaymentAttemptLike */
/** @typedef {{ id?: string|number|null }} PaymentOrderSummaryLike */
/** @typedef {{ orderId: number, token: string, payment_method_id: string, issuer_id?: string|number|null, installments: number, identification?: { type: string, number: string } }} DirectPaymentPayload */
/** @typedef {{ payment?: PaymentAttemptLike|null, order?: PaymentOrderSummaryLike|null }} DirectPaymentResult */
/** @typedef {Error & { provider?: { cause?: Array<{ description?: string }> } }} ProviderErrorLike */
/** @typedef {{ id: string|number, card_id?: string|number, quantity?: number, price?: number|string, subtotal?: number|string, card?: { name?: string|null }|null }} OrderItemLike */
/** @typedef {{ id: string|number, status?: string, total?: number|string, total_ars?: number|string, expires_at?: string|null, payment_id?: string|null, payment_status?: string|null, customer_email?: string|null, user?: { id?: string|number|null }|null, items?: OrderItemLike[] }} OrderLike */
/** @typedef {{ orderId: number, paymentStatus: string, createdAt: number, approvalNoticeShown: boolean }} PendingPaymentFeedbackLike */
/** @typedef {import("@tanstack/react-query").UseMutationResult<DirectPaymentResult, ProviderErrorLike, DirectPaymentPayload, unknown>} DirectPaymentMutation */

const NON_RETRYABLE_PAYMENT_STATUSES = new Set(["approved", "pending", "in_process", "authorized", "in_mediation"]);
const PENDING_PAYMENT_FEEDBACK_KEY = "duelvault_pending_payment_feedback";

/** @param {OrderLike | null | undefined} order */
function hasProcessingPaymentAttempt(order) {
  return Boolean(String(order?.payment_id || "").trim());
}

/** @param {PendingPaymentFeedbackLike} payload */
function persistPendingPaymentFeedback(payload) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(PENDING_PAYMENT_FEEDBACK_KEY, JSON.stringify(payload));
}

/** @param {string | number | null | undefined} value */
function formatCurrency(value) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

/** @param {OrderLike | null | undefined} order */
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
 * @returns {{ title: string, description: string, tone: string, Icon: import("lucide-react").LucideIcon }}
 */
function getAttemptTone(status) {
  if (status === "approved") {
    return {
      title: "Pago enviado a conciliación",
      description: "Mercado Pago aprobó el intento, pero la orden se confirma cuando llegue el webhook al backend.",
      tone: "border-emerald-400/25 bg-emerald-400/10 text-emerald-100",
      Icon: CheckCircle2,
    };
  }

  if (["pending", "in_process", "authorized", "in_mediation"].includes(status)) {
    return {
      title: "Pago en proceso",
      description: "El pago se creó correctamente y estamos esperando la confirmación final del webhook.",
      tone: "border-amber-400/25 bg-amber-400/10 text-amber-100",
      Icon: Clock3,
    };
  }

  return {
    title: "Pago rechazado",
    description: "Mercado Pago rechazó este intento. Si la orden sigue vigente, podés corregir los datos y volver a intentarlo.",
    tone: "border-rose-400/25 bg-rose-400/10 text-rose-100",
    Icon: XCircle,
  };
}

/** @param {string} targetPath */
function buildAuthRedirectPath(targetPath) {
  const params = new URLSearchParams({ redirect: targetPath });
  return `/auth?${params.toString()}`;
}

/** @param {{ orderId: string | number }} props */
export default function OrderPaymentPage({ orderId }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const numericOrderId = Number(orderId);
  const isValidOrderId = Number.isInteger(numericOrderId) && numericOrderId > 0;
  const { isAuthenticated, isBootstrapping, user } = useAuth();
  const [sdkError, setSdkError] = useState("");
  const [sdkReady, setSdkReady] = useState(false);
  const [lastAttempt, setLastAttempt] = useState(/** @type {PaymentAttemptLike | null} */ (null));
  const brickControllerRef = useRef(/** @type {BrickControllerLike | null} */ (null));
  const orderRef = useRef(/** @type {OrderLike | null} */ (null));
  const paymentMutationRef = useRef(/** @type {DirectPaymentMutation | null} */ (null));
  const hasPersistedSession = Boolean(getUsableStoredUserSession()?.accessToken);
  const authRedirectHref = isValidOrderId ? buildAuthRedirectPath(`/checkout/pay/${numericOrderId}`) : buildAuthRedirectPath("/orders");
  const isRestoringSession = !isBootstrapping && !isAuthenticated && hasPersistedSession && isValidOrderId;
  const shouldRedirectToAuth = !isBootstrapping && !isAuthenticated && !hasPersistedSession && isValidOrderId;
  const trackedOrderIds = useMemo(() => {
    if (!isValidOrderId) {
      return [];
    }

    const rawTrackedIds = /** @type {Array<string | number>} */ (getTrackedOrderIds());
    const normalizedTrackedIds = rawTrackedIds
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0);

    return normalizedTrackedIds.includes(numericOrderId) ? [numericOrderId] : [];
  }, [isValidOrderId, numericOrderId]);

  const trackedOrdersQuery = useQuery({
    queryKey: ["public-orders", trackedOrderIds],
    queryFn: () => fetchOrdersByIds(trackedOrderIds),
    enabled: isAuthenticated && trackedOrderIds.length > 0,
    staleTime: 1000 * 30,
  });

  const ordersQuery = useQuery({
    queryKey: ["my-orders"],
    queryFn: () => fetchMyOrders({ page: 1, limit: 100 }),
    enabled: !isBootstrapping && isAuthenticated,
  });

  const order = useMemo(
    /** @returns {OrderLike | null} */
    () => {
    const merged = new Map();
    const trackedOrders = /** @type {OrderLike[]} */ (Array.isArray(trackedOrdersQuery.data?.orders) ? trackedOrdersQuery.data.orders : []);
    const myOrders = /** @type {OrderLike[]} */ (Array.isArray(ordersQuery.data?.orders) ? ordersQuery.data.orders : []);

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
  const orderCustomerEmail = String(order?.customer_email || user?.email || "");
  const currentOrderId = Number(order?.id || 0);
  const brickContainerId = currentOrderId ? `cardPaymentBrick_container_${currentOrderId}` : "cardPaymentBrick_container";

  const canPay = ownsOrder && canRetryDirectPayment(order);
  const shouldPollOrder = Boolean(lastAttempt && order?.status === "pending_payment");

  /** @param {DirectPaymentPayload} payload */
  const createPaymentMutation = (payload) => createDirectPayment(payload, {
    mutationId: createStoreMutationId(`payment-${payload.orderId}`),
  });

  /** @param {DirectPaymentResult} payload */
  const handlePaymentSuccess = async (payload) => {
    setLastAttempt(payload?.payment || null);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["my-orders"] }),
      queryClient.invalidateQueries({ queryKey: ["public-orders"] }),
    ]);

    const paymentStatus = String(payload?.payment?.status || "").toLowerCase();
    if (paymentStatus === "approved" || ["pending", "in_process", "authorized", "in_mediation"].includes(paymentStatus)) {
      persistPendingPaymentFeedback({
        orderId: Number(payload?.order?.id || payload?.payment?.order_id || 0) || Number(orderId),
        paymentStatus,
        createdAt: Date.now(),
        approvalNoticeShown: false,
      });
      router.replace("/orders");
      return;
    }

    toast.error("Pago rechazado", {
      description: payload?.payment?.status_detail || "Revisá los datos y volvé a intentarlo.",
    });
  };

  /** @param {ProviderErrorLike} error */
  const handlePaymentError = (error) => {
    const providerError = error?.provider?.cause?.[0]?.description;
    toast.error("No se pudo crear el pago", {
      description: providerError || error.message || "Mercado Pago rechazó la solicitud.",
    });
  };

  const paymentMutation = /** @type {DirectPaymentMutation} */ (useMutation({
    mutationFn: createPaymentMutation,
    onSuccess: handlePaymentSuccess,
    onError: handlePaymentError,
  }));

  useEffect(() => {
    paymentMutationRef.current = paymentMutation;
  }, [paymentMutation]);

  useEffect(() => {
    orderRef.current = order;
  }, [order]);

  useEffect(() => {
    if (!shouldRedirectToAuth) {
      return;
    }

    router.replace(authRedirectHref);
  }, [authRedirectHref, router, shouldRedirectToAuth]);

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
    if (!isAuthenticated || !currentOrderId || !canPay || !ENV.MP_PUBLIC_KEY) {
      setSdkReady(false);
      return undefined;
    }

    let cancelled = false;
    /** @type {BrickControllerLike | null} */
    let localBrickController = null;
    setSdkError("");
    setSdkReady(false);

    try {
      brickControllerRef.current?.unmount?.();
    } catch {
      // noop
    }
    brickControllerRef.current = null;

    /** @param {BrickSubmitLike} cardData */
    const handleBrickSubmit = async (cardData) => {
      const activeOrder = orderRef.current;
      if (!activeOrder || !ownsOrder || !canRetryDirectPayment(activeOrder)) {
        throw new Error("La orden ya no admite cobro directo.");
      }

      setLastAttempt(null);

      const activePaymentMutation = paymentMutationRef.current;
      if (!activePaymentMutation) {
        throw new Error("El formulario de pago no está listo todavía.");
      }

      const payload = await activePaymentMutation.mutateAsync({
        orderId: Number(activeOrder.id),
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

    /** @param {{ message?: string, cause?: unknown } | Error | null | undefined} error */
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
        const container = document.getElementById(brickContainerId);
        if (container) {
          container.innerHTML = "";
        }

        const mp = await createMercadoPagoBrowserClient(/** @type {string} */ (ENV.MP_PUBLIC_KEY));
        if (cancelled) {
          return;
        }

        localBrickController = await createMercadoPagoBrickBuilder(mp).create("cardPayment", brickContainerId, {
          initialization: {
            amount: Number(amount),
            payer: {
              email: orderCustomerEmail,
            },
          },
          customization: {
            visual: {
              hideFormTitle: true,
              style: createMercadoPagoBrickDarkStyle(),
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

    // Safety timeout: if the Brick never fires onReady/onError after 15s, show error
    const sdkTimeout = setTimeout(() => {
      if (!cancelled) {
        setSdkReady((prev) => {
          if (!prev) {
            setSdkError("El formulario de pago tardó demasiado en cargar. Recargá la página para reintentar.");
          }
          return prev;
        });
      }
    }, 15_000);

    return () => {
      cancelled = true;
      clearTimeout(sdkTimeout);
      setSdkReady(false);
      brickControllerRef.current = null;
      try {
        localBrickController?.unmount?.();
      } catch {
        // noop
      }
    };
  }, [amount, brickContainerId, canPay, currentOrderId, isAuthenticated, orderCustomerEmail, ownsOrder]);

  if (isBootstrapping || isRestoringSession) {
    return (
      <div className="mx-auto flex min-h-[40vh] max-w-[900px] items-center justify-center px-4 py-10 text-sm text-muted-foreground">{isRestoringSession ? "Restaurando sesión..." : "Cargando sesión..."}</div>
    );
  }

  if (!isValidOrderId) {
    return (
      <div className="mx-auto max-w-[760px] px-4 py-10 text-sm text-muted-foreground">ID de orden inválido.</div>
    );
  }

  if (shouldRedirectToAuth) {
    return (
      <section className="mx-auto max-w-[760px] px-4 py-10">
          <div className="rounded-[32px] border border-border bg-card/80 p-8 shadow-[0_24px_80px_rgba(0,0,0,0.24)]">
            <h1 className="text-2xl font-black text-foreground">Redirigiendo al acceso seguro...</h1>
            <p className="mt-3 text-sm text-muted-foreground">Necesitás iniciar sesión para abrir el pago directo de esta orden.</p>
            <div className="mt-6 flex gap-3">
              <Link href={authRedirectHref} className="inline-flex h-11 items-center justify-center rounded-2xl bg-primary px-5 text-sm font-bold text-primary-foreground">
                Ir a login
              </Link>
              <Link href="/orders" className="inline-flex h-11 items-center justify-center rounded-2xl border border-border px-5 text-sm font-semibold transition hover:bg-secondary">
                Volver a Mis Pedidos
              </Link>
            </div>
          </div>
        </section>
    );
  }

  const attemptTone = lastAttempt?.status ? getAttemptTone(String(lastAttempt.status).toLowerCase()) : null;

  return (
    <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mx-auto max-w-[1180px] px-4 py-8 relative">
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -top-40 left-1/2 h-[600px] w-[600px] -translate-x-1/2 rounded-full bg-violet-600/10 blur-[120px]" />
          <div className="absolute -bottom-20 right-0 h-[400px] w-[400px] rounded-full bg-indigo-600/8 blur-[100px]" />
        </div>
        <Link href="/orders" className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Volver a Mis Pedidos
        </Link>

        <div className="mt-6 grid gap-6 lg:grid-cols-[0.95fr_1.25fr]">
          <div className="space-y-6">
            <div className="group rounded-[32px] border border-violet-500/20 bg-card/60 backdrop-blur-xl p-6 shadow-[0_24px_80px_rgba(0,0,0,0.24),0_0_40px_rgba(139,92,246,0.08)] transition-all duration-300 hover:border-violet-500/35 hover:shadow-[0_24px_80px_rgba(0,0,0,0.24),0_0_60px_rgba(139,92,246,0.12)]">
              <div className="inline-flex items-center gap-2 rounded-full border border-violet-400/25 bg-violet-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-violet-300">
                <ShieldCheck className="h-4 w-4" />
                Checkout API
              </div>

              <h1 className="mt-5 text-3xl font-black text-foreground">Pago tokenizado y validado por backend</h1>
              <p className="mt-3 text-sm text-muted-foreground">La tarjeta se tokeniza en Mercado Pago desde tu navegador. El backend solo recibe el token, recalcula el monto y espera el webhook para cerrar la orden.</p>
            </div>

            <div className="group rounded-[32px] border border-violet-500/20 bg-card/60 backdrop-blur-xl p-6 shadow-[0_24px_80px_rgba(0,0,0,0.24),0_0_40px_rgba(139,92,246,0.08)] transition-all duration-300 hover:border-violet-500/35 hover:shadow-[0_24px_80px_rgba(0,0,0,0.24),0_0_60px_rgba(139,92,246,0.12)]">
              <h2 className="text-lg font-black text-foreground">Resumen de la orden</h2>

              {ordersQuery.isLoading || trackedOrdersQuery.isLoading ? (
                <div className="mt-5 flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Cargando orden...
                </div>
              ) : !order ? (
                <div className="mt-5 space-y-3">
                  <div className="rounded-2xl border border-amber-400/25 bg-amber-400/10 p-4 text-sm text-amber-100">
                    {ordersQuery.isFetching
                      ? "Buscando tu orden…"
                      : "No encontramos la orden solicitada en tu historial. Si acabás de comprar, puede tardar unos segundos."}
                  </div>
                  {!ordersQuery.isFetching ? (
                    <button
                      type="button"
                      onClick={() => { void ordersQuery.refetch(); void trackedOrdersQuery.refetch(); }}
                      className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-medium transition hover:bg-secondary"
                    >
                      <Loader2 className={`h-3.5 w-3.5 ${ordersQuery.isFetching ? "animate-spin" : ""}`} />
                      Reintentar
                    </button>
                  ) : null}
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
                      <p className="mt-1 font-semibold text-foreground">{orderStatusLabel(/** @type {string} */ (order.status))}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Total a cobrar</p>
                      <p className="mt-1 text-lg font-bold text-foreground">{formatCurrency(order.total_ars ?? order.total)}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Vigencia</p>
                      <p className="mt-1 font-medium text-foreground">{order.expires_at ? new Date(order.expires_at).toLocaleString("es-AR") : "Sin vencimiento"}</p>
                    </div>
                  </div>

                  <div className="mt-5 space-y-3">
                    {order.items?.map((item) => (
                      <div key={item.id} className="flex items-center justify-between rounded-2xl border border-border bg-background/50 px-4 py-3 text-sm">
                        <div>
                          <p className="font-semibold text-foreground">{item.card?.name || `Carta #${item.card_id}`}</p>
                          <p className="text-muted-foreground">{item.quantity} x {formatCurrency(item.price)}</p>
                        </div>
                        <p className="font-semibold text-foreground">{formatCurrency(item.subtotal)}</p>
                      </div>
                    ))}
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
                    {lastAttempt?.status_detail ? <p className="mt-3 text-xs uppercase tracking-[0.18em] opacity-80">Detalle: {lastAttempt.status_detail}</p> : null}
                  </div>
                </div>
              </div>
            ) : null}

            <div className="rounded-[32px] border border-violet-500/20 bg-card/60 backdrop-blur-xl p-6 shadow-[0_24px_80px_rgba(0,0,0,0.24),0_0_40px_rgba(139,92,246,0.08)]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-black text-foreground">Formulario de pago</h2>
                  <p className="mt-2 text-sm text-muted-foreground">Monto validado por servidor: {order ? formatCurrency(amount) : "No disponible"}</p>
                </div>
                <div className="rounded-2xl border border-border bg-background/60 px-4 py-3 text-xs text-muted-foreground">Orden #{numericOrderId}</div>
              </div>

              {!ENV.MP_PUBLIC_KEY ? (
                <div className="mt-6 rounded-2xl border border-rose-400/25 bg-rose-400/10 p-4 text-sm text-rose-200">Falta configurar NEXT_PUBLIC_MP_PUBLIC_KEY en el storefront.</div>
              ) : null}

              {sdkError ? <div className="mt-6 rounded-2xl border border-rose-400/25 bg-rose-400/10 p-4 text-sm text-rose-200">{sdkError}</div> : null}

              {order && !canPay ? (
                <div className="mt-6 rounded-2xl border border-amber-400/25 bg-amber-400/10 p-4 text-sm text-amber-100">
                  {ownsOrder
                    ? "Esta orden ya no admite cobro directo. Si venció o ya fue pagada, revisá el historial antes de generar un nuevo pedido."
                    : "Esta orden no pertenece a tu sesión autenticada. Iniciá sesión con la cuenta correcta para continuar."}
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

                  <div key={order?.id} className="overflow-hidden rounded-[28px] border border-violet-500/20 bg-slate-950/90 p-3 shadow-[0_24px_60px_rgba(15,23,42,0.18),0_0_40px_rgba(139,92,246,0.12)] backdrop-blur-xl">
                    <div id={brickContainerId} className="min-h-[420px] rounded-[24px] bg-slate-950" />
                  </div>

                  <div className="rounded-2xl border border-violet-500/15 bg-violet-500/5 backdrop-blur-sm p-4 text-sm text-muted-foreground">
                    <div className="flex items-start gap-3">
                      <ShieldCheck className="mt-0.5 h-4 w-4 text-violet-400" />
                      <div>
                        <p className="font-semibold text-violet-300">Pago seguro con MercadoPago</p>
                        <p className="mt-1 text-muted-foreground">Los datos sensibles se tokenizan en Mercado Pago desde el Brick oficial. El backend solo recibe el token y valida orden, monto e idempotencia antes de crear el pago.</p>
                      </div>
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
                    <p className="mt-2 text-sm opacity-90">El webhook ya marcó esta orden como pagada. Podés volver al historial para seguir su avance.</p>
                    <button onClick={() => router.push("/orders")} className="mt-4 inline-flex h-10 items-center justify-center rounded-2xl bg-emerald-50 px-4 text-sm font-bold text-emerald-950">Volver a Mis Pedidos</button>
                  </div>
                </div>
              </div>
            ) : null}

            {order?.status === "expired" ? (
              <div className="rounded-[32px] border border-amber-400/25 bg-amber-400/10 p-6 text-amber-100">
                <div className="flex items-start gap-3">
                  <TriangleAlert className="mt-0.5 h-5 w-5" />
                  <div>
                    <h2 className="text-lg font-black">La orden venció</h2>
                    <p className="mt-2 text-sm opacity-90">La reserva de stock ya no puede reutilizarse. Si todavía querés comprar, volvé al catálogo y generá una orden nueva.</p>
                    <Link href="/singles" className="mt-4 inline-flex h-10 items-center justify-center rounded-2xl bg-amber-50 px-4 text-sm font-bold text-amber-950">Volver al catálogo</Link>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </motion.section>
  );
}