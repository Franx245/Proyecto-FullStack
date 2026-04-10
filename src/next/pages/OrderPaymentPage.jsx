"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, CheckCircle2, Clock3, Loader2, ShieldCheck, TriangleAlert, XCircle } from "lucide-react";
import { toast } from "sonner";

import { createDirectPayment, createStoreMutationId, fetchMyOrder, fetchStorefrontConfig } from "@/api/store";
import { ENV } from "@/config/env";
import { useAuth } from "@/lib/auth";
import {
  createMercadoPagoBrowserClient,
  createMercadoPagoCardForm,
  formatMercadoPagoTokenizationError,
  resolveMercadoPagoPayerEmail,
} from "@/lib/mercadopago";
import { orderStatusLabel } from "@/lib/shipping";
import { getUsableStoredUserSession } from "@/lib/userSession";
import { formatArgentinaDateTime } from "@/utils/dateTime";

/** @typedef {{ unmount?: () => void, getCardFormData?: () => CardFormDataLike }} MercadoPagoCardFormLike */
/** @typedef {{ token?: string, paymentMethodId?: string, issuerId?: string|number|null, installments?: string|number|null, identificationType?: string|null, identificationNumber?: string|null }} CardFormDataLike */
/** @typedef {{ status?: string, status_detail?: string, order_id?: string|number|null }} PaymentAttemptLike */
/** @typedef {{ id?: string|number|null }} PaymentOrderSummaryLike */
/** @typedef {{ orderId: number, token?: string, payment_method_id?: string, issuer_id?: string|number|null, installments?: number, identification?: { type: string, number: string }, test_card?: string }} DirectPaymentPayload */
/** @typedef {{ payment?: PaymentAttemptLike|null, order?: PaymentOrderSummaryLike|null }} DirectPaymentResult */
/** @typedef {Error & { provider?: { cause?: Array<{ description?: string }> } }} ProviderErrorLike */
/** @typedef {{ id: string|number, card_id?: string|number, quantity?: number, price?: number|string, subtotal?: number|string, card?: { name?: string|null }|null }} OrderItemLike */
/** @typedef {{ id: string|number, status?: string, total?: number|string, total_ars?: number|string, expires_at?: string|null, payment_id?: string|null, payment_status?: string|null, customer_email?: string|null, user?: { id?: string|number|null }|null, items?: OrderItemLike[] }} OrderLike */
/** @typedef {{ orderId: number, paymentStatus: string, createdAt: number, approvalNoticeShown: boolean }} PendingPaymentFeedbackLike */
/** @typedef {import("@tanstack/react-query").UseMutationResult<DirectPaymentResult, ProviderErrorLike, DirectPaymentPayload, unknown>} DirectPaymentMutation */

const NON_RETRYABLE_PAYMENT_STATUSES = new Set(["approved", "pending", "in_process", "authorized", "in_mediation"]);
const PENDING_PAYMENT_FEEDBACK_KEY = "duelvault_pending_payment_feedback";
const CARD_FORM_HOST_HEIGHT_PX = 48;
const CARD_FORM_IFRAME_FILTER = "invert(1) hue-rotate(180deg) brightness(1.08)";

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

/**
 * @param {OrderLike | null | undefined} order
 * @param {number} [referenceNowMs]
 */
function canRetryDirectPayment(order, referenceNowMs = 0) {
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

  if (!order.expires_at || referenceNowMs <= 0) {
    return true;
  }

  return new Date(order.expires_at).getTime() > referenceNowMs;
}

/**
 * @param {string} status
 * @returns {{ title: string, description: string, tone: string, Icon: import("lucide-react").LucideIcon }}
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

/** @param {string} targetPath */
function buildAuthRedirectPath(targetPath) {
  const params = new URLSearchParams({ redirect: targetPath });
  return `/auth?${params.toString()}`;
}

/** @param {number} orderId */
function createCardFormIds(orderId) {
  const suffix = orderId > 0 ? String(orderId) : "checkout";
  return {
    form: `mp-card-form-${suffix}`,
    cardNumber: `mp-card-number-${suffix}`,
    expirationDate: `mp-expiration-date-${suffix}`,
    securityCode: `mp-security-code-${suffix}`,
    cardholderName: `mp-cardholder-name-${suffix}`,
    issuer: `mp-issuer-${suffix}`,
    installments: `mp-installments-${suffix}`,
    identificationType: `mp-identification-type-${suffix}`,
    identificationNumber: `mp-identification-number-${suffix}`,
    cardholderEmail: `mp-cardholder-email-${suffix}`,
    submit: `mp-submit-${suffix}`,
  };
}

/**
 * @param {MercadoPagoCardFormLike | null | undefined} cardForm
 * @param {CardFormDataLike | null | undefined} cardFormData
 */
async function resolveCardFormToken(cardForm, cardFormData) {
  void cardForm;
  return String(cardFormData?.token || "").trim();
}

/** @param {{ cardNumber: string, expirationDate: string, securityCode: string }} formIds */
function syncCardFormHostFields(formIds) {
  if (typeof document === "undefined") {
    return;
  }

  for (const fieldId of [formIds.cardNumber, formIds.expirationDate, formIds.securityCode]) {
    const host = document.getElementById(fieldId);
    if (!(host instanceof HTMLElement)) {
      continue;
    }

    host.style.height = `${CARD_FORM_HOST_HEIGHT_PX}px`;
    host.style.minHeight = `${CARD_FORM_HOST_HEIGHT_PX}px`;
    host.style.maxHeight = `${CARD_FORM_HOST_HEIGHT_PX}px`;
    host.style.padding = "0 0.875rem";
    host.style.overflow = "hidden";
    host.style.display = "flex";
    host.style.alignItems = "center";
    host.style.color = "#f8fafc";

    const iframe = host.querySelector("iframe");
    if (!(iframe instanceof HTMLIFrameElement)) {
      continue;
    }

    iframe.style.display = "block";
    iframe.style.width = "100%";
    iframe.style.height = "100%";
    iframe.style.minHeight = "100%";
    iframe.style.maxHeight = "100%";
    iframe.style.border = "0";
    iframe.style.background = "transparent";
    iframe.style.filter = CARD_FORM_IFRAME_FILTER;
  }
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
  const [hasPersistedSession, setHasPersistedSession] = useState(/** @type {boolean | null} */ (null));
  const [referenceNowMs, setReferenceNowMs] = useState(0);
  const cardFormRef = useRef(/** @type {MercadoPagoCardFormLike | null} */ (null));
  const orderRef = useRef(/** @type {OrderLike | null} */ (null));
  const paymentMutationRef = useRef(/** @type {DirectPaymentMutation | null} */ (null));

  useEffect(() => {
    setHasPersistedSession(Boolean(getUsableStoredUserSession()?.accessToken));
    setReferenceNowMs(Date.now());
  }, []);

  const authRedirectHref = isValidOrderId ? buildAuthRedirectPath(`/checkout/pay/${numericOrderId}`) : buildAuthRedirectPath("/orders");
  const isRestoringSession = !isBootstrapping && !isAuthenticated && hasPersistedSession === true && isValidOrderId;
  const shouldRedirectToAuth = !isBootstrapping && !isAuthenticated && hasPersistedSession === false && isValidOrderId;
  const storefrontConfigQuery = useQuery({
    queryKey: ["storefront-config"],
    queryFn: fetchStorefrontConfig,
    staleTime: 1000 * 60,
  });
  const orderQuery = useQuery({
    queryKey: ["my-order", numericOrderId],
    queryFn: () => fetchMyOrder(numericOrderId),
    enabled: !isBootstrapping && isAuthenticated && isValidOrderId,
    staleTime: 1000 * 30,
  });

  const order = useMemo(
    /** @returns {OrderLike | null} */
    () => /** @type {OrderLike | null} */ (orderQuery.data?.order || null),
    [orderQuery.data?.order]
  );

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
  const currentOrderId = Number(order?.id || 0);
  const runtimePaymentMode = String(storefrontConfigQuery.data?.storefront?.payment_mode || "")
    .trim()
    .toLowerCase();
  const isFakePaymentMode = runtimePaymentMode === "fake";
  const payerEmail = resolveMercadoPagoPayerEmail({
    publicKey: ENV.MP_PUBLIC_KEY,
    preferredEmail: String(order?.customer_email || user?.email || "").trim(),
    orderId: currentOrderId,
  });
  const paymentFormIds = useMemo(() => createCardFormIds(currentOrderId), [currentOrderId]);
  const canPay = ownsOrder && canRetryDirectPayment(order, referenceNowMs);
  const shouldPollOrder = Boolean(lastAttempt && order?.status === "pending_payment");
  const shouldShowOrderPlaceholder = !order && (isBootstrapping || isRestoringSession || orderQuery.isLoading || orderQuery.isFetching);

  /** @param {DirectPaymentPayload} payload */
  const createPaymentMutation = (payload) => createDirectPayment(payload, {
    mutationId: createStoreMutationId(`payment-${payload.orderId}`),
  });

  /** @param {DirectPaymentResult} payload */
  const handlePaymentSuccess = async (payload) => {
    setLastAttempt(payload?.payment || null);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["my-orders"] }),
      queryClient.invalidateQueries({ queryKey: ["my-order", Number(payload?.order?.id || orderId)] }),
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
      description: payload?.payment?.status_detail || "Revisa los datos y volve a intentarlo.",
    });
  };

  /** @param {ProviderErrorLike} error */
  const handlePaymentError = (error) => {
    const providerError = error?.provider?.cause?.[0]?.description;
    toast.error("No se pudo crear el pago", {
      description: providerError || error.message || "Mercado Pago rechazo la solicitud.",
    });
  };

  const paymentMutation = /** @type {DirectPaymentMutation} */ (useMutation({
    mutationFn: createPaymentMutation,
    onSuccess: handlePaymentSuccess,
    onError: handlePaymentError,
  }));

  const submitFakePayment = async (requestedStatus) => {
    if (!order) {
      return;
    }

    setSdkError("");
    setLastAttempt(null);

    await paymentMutation.mutateAsync({
      orderId: Number(order.id),
      payment_method_id: "visa",
      installments: 1,
      test_card: requestedStatus,
    });
  };

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
      void orderQuery.refetch();
    }, 4000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [orderQuery, shouldPollOrder]);

  useEffect(() => {
    if (isFakePaymentMode) {
      setSdkReady(false);
      setSdkError("");
      try {
        cardFormRef.current?.unmount?.();
      } catch {
        // noop
      }
      cardFormRef.current = null;
      return undefined;
    }

    if (!isAuthenticated || !currentOrderId || !canPay || !ENV.MP_PUBLIC_KEY) {
      setSdkReady(false);
      return undefined;
    }

    let cancelled = false;
    let cardFormReady = false;
    let hostFieldSyncTimeout = 0;
    /** @type {MercadoPagoCardFormLike | null} */
    let localCardForm = null;

    setSdkError("");
    setSdkReady(false);

    try {
      cardFormRef.current?.unmount?.();
    } catch {
      // noop
    }
    cardFormRef.current = null;

    void (async () => {
      try {
        const cardholderNameElement = document.getElementById(paymentFormIds.cardholderName);
        if (cardholderNameElement instanceof HTMLInputElement && !cardholderNameElement.value) {
          cardholderNameElement.value = String(user?.full_name || user?.username || "").trim();
        }

        const emailElement = document.getElementById(paymentFormIds.cardholderEmail);
        if (emailElement instanceof HTMLInputElement) {
          emailElement.value = payerEmail;
        }

        const mp = await createMercadoPagoBrowserClient(/** @type {string} */ (ENV.MP_PUBLIC_KEY));
        if (cancelled) {
          return;
        }

        localCardForm = createMercadoPagoCardForm(mp, {
          amount,
          iframe: true,
          form: {
            id: paymentFormIds.form,
            cardNumber: {
              id: paymentFormIds.cardNumber,
              placeholder: "Numero de tarjeta",
            },
            expirationDate: {
              id: paymentFormIds.expirationDate,
              placeholder: "MM/YY",
            },
            securityCode: {
              id: paymentFormIds.securityCode,
              placeholder: "CVV",
            },
            cardholderName: {
              id: paymentFormIds.cardholderName,
              placeholder: "Titular de la tarjeta",
            },
            issuer: {
              id: paymentFormIds.issuer,
              placeholder: "Banco emisor",
            },
            installments: {
              id: paymentFormIds.installments,
              placeholder: "Cuotas",
            },
            identificationType: {
              id: paymentFormIds.identificationType,
              placeholder: "Tipo de documento",
            },
            identificationNumber: {
              id: paymentFormIds.identificationNumber,
              placeholder: "Numero del documento",
            },
            cardholderEmail: {
              id: paymentFormIds.cardholderEmail,
              placeholder: "E-mail",
            },
          },
          callbacks: {
            onFormMounted: (error) => {
              if (cancelled) {
                return;
              }

              if (error) {
                setSdkError(error.message || "No se pudo inicializar el formulario seguro de Mercado Pago.");
                return;
              }

              cardFormReady = true;
              syncCardFormHostFields(paymentFormIds);
              setSdkError("");
              setSdkReady(true);
            },
            onSubmit: async (event) => {
              event.preventDefault();

              const activeOrder = orderRef.current;
              if (!activeOrder || !ownsOrder || !canRetryDirectPayment(activeOrder, Date.now())) {
                throw new Error("La orden ya no admite cobro directo.");
              }

              const activePaymentMutation = paymentMutationRef.current;
              if (!activePaymentMutation) {
                throw new Error("El formulario de pago no esta listo todavia.");
              }

              setLastAttempt(null);

              const cardFormData = localCardForm?.getCardFormData?.() || {};
              let token = "";
              try {
                token = await resolveCardFormToken(localCardForm, cardFormData);
              } catch (error) {
                const message = formatMercadoPagoTokenizationError(error, {
                  publicKey: ENV.MP_PUBLIC_KEY,
                  origin: typeof window !== "undefined" ? window.location.origin : "",
                });
                setSdkError(message);
                toast.error("No se pudo tokenizar la tarjeta", {
                  description: message,
                });
                return;
              }

              if (!token) {
                const message = formatMercadoPagoTokenizationError("Mercado Pago no genero un token de tarjeta valido.", {
                  publicKey: ENV.MP_PUBLIC_KEY,
                  origin: typeof window !== "undefined" ? window.location.origin : "",
                });
                setSdkError(message);
                toast.error("No se pudo tokenizar la tarjeta", {
                  description: message,
                });
                return;
              }

              setSdkError("");

              const paymentMethodId = String(cardFormData.paymentMethodId || "").trim();
              if (!paymentMethodId) {
                throw new Error("Mercado Pago no informo el medio de pago.");
              }

              const identificationType = String(cardFormData.identificationType || "").trim();
              const identificationNumber = String(cardFormData.identificationNumber || "").trim();
              const payload = await activePaymentMutation.mutateAsync({
                orderId: Number(activeOrder.id),
                token,
                payment_method_id: paymentMethodId,
                issuer_id: cardFormData.issuerId || null,
                installments: Math.max(1, Number(cardFormData.installments || 1) || 1),
                identification: identificationType && identificationNumber
                  ? {
                      type: identificationType,
                      number: identificationNumber,
                    }
                  : undefined,
              });

              setLastAttempt(payload?.payment || null);
            },
            onFetching: () => undefined,
          },
        });

        cardFormRef.current = localCardForm;
        hostFieldSyncTimeout = window.setTimeout(() => {
          if (!cancelled) {
            syncCardFormHostFields(paymentFormIds);
          }
        }, 180);
      } catch (error) {
        if (!cancelled) {
          setSdkError(error instanceof Error ? error.message : "No se pudo cargar Mercado Pago.");
        }
      }
    })();

    const sdkTimeout = window.setTimeout(() => {
      if (!cancelled && !cardFormReady) {
        setSdkError("El formulario de pago tardo demasiado en cargar. Recarga la pagina para reintentar.");
      }
    }, 30000);

    return () => {
      cancelled = true;
      if (hostFieldSyncTimeout) {
        window.clearTimeout(hostFieldSyncTimeout);
      }
      window.clearTimeout(sdkTimeout);
      setSdkReady(false);
      cardFormRef.current = null;
      try {
        localCardForm?.unmount?.();
      } catch {
        // noop
      }
    };
  }, [amount, canPay, currentOrderId, isAuthenticated, isFakePaymentMode, ownsOrder, payerEmail, paymentFormIds, user?.full_name, user?.username]);

  if (!isValidOrderId) {
    return (
      <div className="mx-auto max-w-[760px] px-4 py-10 text-sm text-muted-foreground">ID de orden invalido.</div>
    );
  }

  if (shouldRedirectToAuth) {
    return (
      <section className="mx-auto max-w-[760px] px-4 py-10">
        <div className="rounded-[32px] border border-border bg-card/80 p-8 shadow-[0_24px_80px_rgba(0,0,0,0.24)]">
          <h1 className="text-2xl font-black text-foreground">Redirigiendo al acceso seguro...</h1>
          <p className="mt-3 text-sm text-muted-foreground">Necesitas iniciar sesion para abrir el pago directo de esta orden.</p>
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
    <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="relative mx-auto max-w-[1180px] px-4 py-8">
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
          <div className="group rounded-[32px] border border-violet-500/20 bg-card/60 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.24),0_0_40px_rgba(139,92,246,0.08)] backdrop-blur-xl transition-all duration-300 hover:border-violet-500/35 hover:shadow-[0_24px_80px_rgba(0,0,0,0.24),0_0_60px_rgba(139,92,246,0.12)]">
            <div className="inline-flex items-center gap-2 rounded-full border border-violet-400/25 bg-violet-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-violet-300">
              <ShieldCheck className="h-4 w-4" />
              Checkout API
            </div>

            <h1 className="mt-5 text-3xl font-black text-foreground">CardForm oficial de Mercado Pago</h1>
            <p className="mt-3 text-sm text-muted-foreground">La tarjeta se tokeniza con MercadoPago.js v2 en el navegador. El frontend envia solo token, issuer, cuotas e identificacion al endpoint actual.</p>
          </div>

          <div className="group rounded-[32px] border border-violet-500/20 bg-card/60 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.24),0_0_40px_rgba(139,92,246,0.08)] backdrop-blur-xl transition-all duration-300 hover:border-violet-500/35 hover:shadow-[0_24px_80px_rgba(0,0,0,0.24),0_0_60px_rgba(139,92,246,0.12)]">
            <h2 className="text-lg font-black text-foreground">Resumen de la orden</h2>

            {shouldShowOrderPlaceholder ? (
              <div className="mt-5 space-y-4">
                <div className="rounded-3xl border border-border bg-background/50 p-5">
                  <div className="grid gap-4 sm:grid-cols-2">
                    {Array.from({ length: 4 }).map((_, index) => (
                      <div key={index} className="space-y-2">
                        <div className="h-3 w-24 animate-pulse rounded bg-secondary/70" />
                        <div className="h-6 w-32 animate-pulse rounded bg-secondary/90" />
                      </div>
                    ))}
                  </div>
                </div>
                <div className="space-y-3">
                  {Array.from({ length: 2 }).map((_, index) => (
                    <div key={index} className="h-16 animate-pulse rounded-2xl border border-border bg-background/50" />
                  ))}
                </div>
              </div>
            ) : !order ? (
              <div className="mt-5 space-y-3">
                <div className="rounded-2xl border border-amber-400/25 bg-amber-400/10 p-4 text-sm text-amber-100">
                  {orderQuery.isFetching
                    ? "Buscando tu orden..."
                    : "No encontramos la orden solicitada en tu historial. Si acabas de comprar, puede tardar unos segundos."}
                </div>
                {!orderQuery.isFetching ? (
                  <button
                    type="button"
                    onClick={() => { void orderQuery.refetch(); }}
                    className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-medium transition hover:bg-secondary"
                  >
                    <Loader2 className={`h-3.5 w-3.5 ${orderQuery.isFetching ? "animate-spin" : ""}`} />
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
                    <p className="mt-1 font-medium text-foreground">{formatArgentinaDateTime(order.expires_at, "Sin vencimiento")}</p>
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

          <div className="rounded-[32px] border border-violet-500/20 bg-card/60 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.24),0_0_40px_rgba(139,92,246,0.08)] backdrop-blur-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black text-foreground">Formulario de pago</h2>
                <p className="mt-2 text-sm text-muted-foreground">Monto validado por servidor: {order ? formatCurrency(amount) : shouldShowOrderPlaceholder ? "Cargando..." : "No disponible"}</p>
              </div>
              <div className="rounded-2xl border border-border bg-background/60 px-4 py-3 text-xs text-muted-foreground">Orden #{numericOrderId}</div>
            </div>

            {!ENV.MP_PUBLIC_KEY && !isFakePaymentMode ? (
              <div className="mt-6 rounded-2xl border border-rose-400/25 bg-rose-400/10 p-4 text-sm text-rose-200">Falta configurar NEXT_PUBLIC_MP_PUBLIC_KEY en el storefront.</div>
            ) : null}

            {sdkError ? <div className="mt-6 rounded-2xl border border-rose-400/25 bg-rose-400/10 p-4 text-sm text-rose-200">{sdkError}</div> : null}

            {shouldShowOrderPlaceholder ? (
              <div className="mt-6 space-y-4">
                <div className="flex items-center gap-2 rounded-2xl border border-border bg-background/50 px-4 py-3 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {isRestoringSession ? "Restaurando sesion..." : isBootstrapping ? "Validando sesion..." : "Cargando datos de la orden..."}
                </div>
                <div className="overflow-hidden rounded-[28px] border border-violet-500/20 bg-slate-950/90 p-3 shadow-[0_24px_60px_rgba(15,23,42,0.18),0_0_40px_rgba(139,92,246,0.12)] backdrop-blur-xl">
                  <div className="min-h-[420px] rounded-[24px] bg-slate-900/80 p-5">
                    <div className="space-y-4">
                      <div className="h-10 w-40 animate-pulse rounded-xl bg-slate-800" />
                      <div className="grid gap-3 sm:grid-cols-2">
                        {Array.from({ length: 6 }).map((_, index) => (
                          <div key={index} className="h-12 animate-pulse rounded-xl bg-slate-800/90" />
                        ))}
                      </div>
                      <div className="h-28 animate-pulse rounded-2xl bg-slate-800/80" />
                    </div>
                  </div>
                </div>
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
                {isFakePaymentMode ? (
                  <>
                    <div className="rounded-2xl border border-amber-400/25 bg-amber-400/10 p-4 text-sm text-amber-100">
                      El backend está en PAYMENT_MODE=fake. Este flujo de prueba evita la tokenización de Mercado Pago y crea intentos simulados directo contra tu API.
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                      <button
                        type="button"
                        onClick={() => { void submitFakePayment("approved"); }}
                        disabled={paymentMutation.isPending}
                        className="inline-flex h-12 items-center justify-center rounded-2xl bg-emerald-400 px-5 text-sm font-bold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {paymentMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Aprobar fake"}
                      </button>
                      <button
                        type="button"
                        onClick={() => { void submitFakePayment("pending"); }}
                        disabled={paymentMutation.isPending}
                        className="inline-flex h-12 items-center justify-center rounded-2xl bg-amber-300 px-5 text-sm font-bold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {paymentMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Pendiente fake"}
                      </button>
                      <button
                        type="button"
                        onClick={() => { void submitFakePayment("rejected"); }}
                        disabled={paymentMutation.isPending}
                        className="inline-flex h-12 items-center justify-center rounded-2xl bg-rose-400 px-5 text-sm font-bold text-white transition hover:bg-rose-300 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {paymentMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Rechazar fake"}
                      </button>
                    </div>
                  </>
                ) : !sdkReady ? (
                  <div className="flex items-center gap-2 rounded-2xl border border-border bg-background/50 px-4 py-3 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Cargando formulario seguro de Mercado Pago...
                  </div>
                ) : null}

                {!isFakePaymentMode ? (
                <div className="overflow-hidden rounded-[28px] border border-violet-500/20 bg-slate-950/90 p-3 shadow-[0_24px_60px_rgba(15,23,42,0.18),0_0_40px_rgba(139,92,246,0.12)] backdrop-blur-xl">
                  <form id={paymentFormIds.form} onSubmit={(event) => event.preventDefault()} className="grid gap-3 rounded-[24px] bg-slate-950/95 p-4 sm:grid-cols-2">
                    <div className="space-y-2 sm:col-span-2">
                      <label htmlFor={paymentFormIds.cardNumber} className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">Numero de tarjeta</label>
                      <div id={paymentFormIds.cardNumber} data-mp-host-field className="mp-cardform-host h-12 rounded-2xl border border-slate-700 bg-slate-900/80 px-3 text-slate-100" />
                    </div>

                    <div className="space-y-2">
                      <label htmlFor={paymentFormIds.expirationDate} className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">Vencimiento</label>
                      <div id={paymentFormIds.expirationDate} data-mp-host-field className="mp-cardform-host h-12 rounded-2xl border border-slate-700 bg-slate-900/80 px-3 text-slate-100" />
                    </div>

                    <div className="space-y-2">
                      <label htmlFor={paymentFormIds.securityCode} className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">Codigo de seguridad</label>
                      <div id={paymentFormIds.securityCode} data-mp-host-field className="mp-cardform-host h-12 rounded-2xl border border-slate-700 bg-slate-900/80 px-3 text-slate-100" />
                    </div>

                    <div className="space-y-2 sm:col-span-2">
                      <label htmlFor={paymentFormIds.cardholderName} className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">Titular</label>
                      <input id={paymentFormIds.cardholderName} type="text" autoComplete="cc-name" className="h-12 w-full rounded-2xl border border-slate-700 bg-slate-900/80 px-4 text-sm text-slate-100 outline-none transition focus:border-violet-400/50" placeholder="Titular de la tarjeta" />
                    </div>

                    <div className="space-y-2">
                      <label htmlFor={paymentFormIds.issuer} className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">Banco emisor</label>
                      <select id={paymentFormIds.issuer} defaultValue="" className="h-12 w-full rounded-2xl border border-slate-700 bg-slate-900/80 px-4 text-sm text-slate-100 outline-none transition focus:border-violet-400/50">
                        <option value="" disabled hidden>Banco emisor</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label htmlFor={paymentFormIds.installments} className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">Cuotas</label>
                      <select id={paymentFormIds.installments} defaultValue="" className="h-12 w-full rounded-2xl border border-slate-700 bg-slate-900/80 px-4 text-sm text-slate-100 outline-none transition focus:border-violet-400/50">
                        <option value="" disabled hidden>Cuotas</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label htmlFor={paymentFormIds.identificationType} className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">Tipo de documento</label>
                      <select id={paymentFormIds.identificationType} defaultValue="" className="h-12 w-full rounded-2xl border border-slate-700 bg-slate-900/80 px-4 text-sm text-slate-100 outline-none transition focus:border-violet-400/50">
                        <option value="" disabled hidden>Tipo de documento</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label htmlFor={paymentFormIds.identificationNumber} className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">Numero de documento</label>
                      <input id={paymentFormIds.identificationNumber} type="text" inputMode="numeric" autoComplete="off" className="h-12 w-full rounded-2xl border border-slate-700 bg-slate-900/80 px-4 text-sm text-slate-100 outline-none transition focus:border-violet-400/50" placeholder="Numero del documento" />
                    </div>

                    <div className="space-y-2 sm:col-span-2">
                      <label htmlFor={paymentFormIds.cardholderEmail} className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">Email</label>
                      <input id={paymentFormIds.cardholderEmail} type="email" defaultValue={payerEmail} autoComplete="email" className="h-12 w-full rounded-2xl border border-slate-700 bg-slate-900/80 px-4 text-sm text-slate-100 outline-none transition focus:border-violet-400/50" placeholder="E-mail" />
                    </div>

                    <button id={paymentFormIds.submit} type="submit" disabled={paymentMutation.isPending || !canPay} className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-emerald-400 px-5 text-sm font-bold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-40 sm:col-span-2">
                      {paymentMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                      Pagar {formatCurrency(amount)}
                    </button>
                  </form>
                </div>
                ) : null}

                <div className="rounded-2xl border border-violet-500/15 bg-violet-500/5 p-4 text-sm text-muted-foreground backdrop-blur-sm">
                  <div className="flex items-start gap-3">
                    <ShieldCheck className="mt-0.5 h-4 w-4 text-violet-400" />
                    <div>
                      <p className="font-semibold text-violet-300">{isFakePaymentMode ? "Prueba fake de pagos" : "Pago seguro con Mercado Pago"}</p>
                      <p className="mt-1 text-muted-foreground">{isFakePaymentMode ? "Este modo usa tu backend para simular aprobaciones, pendientes o rechazos sin pasar por Mercado Pago." : "Este checkout usa MercadoPago.js v2 con CardForm oficial. No se envian numero de tarjeta ni CVV al backend."}</p>
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
                  <p className="mt-2 text-sm opacity-90">El webhook ya marco esta orden como pagada. Podes volver al historial para seguir su avance.</p>
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
                  <h2 className="text-lg font-black">La orden vencio</h2>
                  <p className="mt-2 text-sm opacity-90">La reserva de stock ya no puede reutilizarse. Si todavia queres comprar, volve al catalogo y genera una orden nueva.</p>
                  <Link href="/singles" className="mt-4 inline-flex h-10 items-center justify-center rounded-2xl bg-amber-50 px-4 text-sm font-bold text-amber-950">Volver al catalogo</Link>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </motion.section>
  );
}