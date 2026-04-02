"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check,
  Minus,
  MapPin,
  Plus,
  Trash2,
  ShoppingCart,
  ArrowLeft,
  Loader2,
  Package,
  Store,
  Truck,
  CreditCard,
  Shield,
} from "lucide-react";
import { toast } from "sonner";

import { useCart } from "@/lib/cartStore";
import { checkoutCart, createStoreMutationId, fetchMyAddresses, fetchShippingRates } from "@/api/store";
import { useDebounce } from "@/lib/useDebounce";
import { trackOrderId } from "@/lib/orderTracking";
import { useAuth } from "@/lib/auth";
import { getShippingCarrierLabel, normalizeShippingCarrier } from "@/lib/shipping";
import { refreshCards } from "@/lib/query-client";
import CardImage from "@/components/marketplace/CardImage";
import { formatPrice } from "@/utils/currency";

/**
 * @typedef {{
 *  version_id: string | number,
 *  detail_id?: string | number,
 *  name: string,
 *  ygopro_id?: string | number,
 *  image?: string,
 *  rarity?: string,
 *  set_name?: string,
 *  price: number,
 *  quantity: number
 * }} CartItem
 *
 * @typedef {{
 *  id?: number,
 *  label: string,
 *  recipient_name: string,
 *  phone: string,
 *  line1: string,
 *  line2: string,
 *  city: string,
 *  state: string,
 *  postal_code: string,
 *  zone: string,
 *  notes: string,
 *  is_default: boolean
 * }} CheckoutAddress
 *
 * @typedef {{
 *  auth?: string,
 *  customer_name?: string,
 *  phone?: string,
 *  addressId?: string,
 *  shipping?: string,
 *  recipient_name?: string,
 *  line1?: string,
 *  city?: string,
 *  state?: string,
 *  accepted?: string
 * }} CheckoutErrors
 *
 * @typedef {{
 *  items: Array<{ cardId: number, quantity: number }>,
 *  customer_name: string,
 *  phone: string,
 *  shipping_zone: string,
 *  notes: string,
 *  mutation_id?: string,
 *  accepted: boolean,
 *  addressId?: number,
 *  address?: CheckoutAddress,
 *  save_address?: boolean
 * }} CheckoutPayload
 *
 * @typedef {Error & { unavailableCardIds?: Array<string | number> }} CheckoutMutationError
 */

/** @param {CartItem} item */
function getCartItemDetailPath(item) {
  const detailId = item?.detail_id ?? item?.version_id;
  return detailId ? `/card/${detailId}` : null;
}

/** @param {{ item: CartItem, onOpenDetail: (item: CartItem) => void }} props */
function CartRow({ item, onOpenDetail }) {
  const { updateQuantity, removeItem } = useCart();

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      onClick={() => onOpenDetail(item)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpenDetail(item);
        }
      }}
      role="button"
      tabIndex={0}
      className="group flex cursor-pointer gap-3 sm:gap-4 rounded-2xl border border-border/60 bg-card/80 backdrop-blur-sm p-3 sm:p-4 transition-all duration-200 hover:border-primary/30 hover:shadow-[0_0_20px_rgba(16,185,129,0.06)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <div className="w-14 h-[74px] sm:w-16 sm:h-[84px] rounded-xl bg-secondary/80 overflow-hidden shrink-0 ring-1 ring-border/40">
        {item.image ? (
          <CardImage
            id={item.ygopro_id}
            name={item.name}
            fallbackSrc={item.image}
            sizes="64px"
            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ShoppingCart className="w-5 h-5 text-muted-foreground/30" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <h3 className="font-bold text-sm leading-tight line-clamp-2">{item.name}</h3>
        <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
          {item.rarity}
          {item.set_name ? ` · ${item.set_name}` : ""}
        </p>

        <div className="flex items-end justify-between mt-2">
          <div>
            <p className="text-base font-black text-primary">
              {formatPrice(item.price * item.quantity)}
            </p>
            {item.quantity > 1 && (
              <p className="text-[10px] text-muted-foreground">
                {formatPrice(item.price)} c/u
              </p>
            )}
          </div>

          <div className="flex items-center gap-1">
            <div className="flex items-center gap-1.5 bg-secondary/80 rounded-xl px-2 py-1 ring-1 ring-border/30">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  updateQuantity(String(item.version_id), item.quantity - 1);
                }}
                className="p-0.5 rounded-md hover:bg-background/60 transition"
              >
                <Minus className="w-3 h-3" />
              </button>

              <span className="text-sm font-bold w-5 text-center tabular-nums">{item.quantity}</span>

              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  updateQuantity(String(item.version_id), item.quantity + 1);
                }}
                className="p-0.5 rounded-md hover:bg-background/60 transition"
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>

            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                removeItem(String(item.version_id));
              }}
              className="p-1.5 rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/** @returns {CheckoutAddress} */
function emptyCheckoutAddress() {
  return {
    label: "Casa",
    recipient_name: "",
    phone: "",
    line1: "",
    line2: "",
    city: "",
    state: "Buenos Aires",
    postal_code: "",
    zone: "gba",
    notes: "",
    is_default: false,
  };
}

/** @param {CheckoutAddress[]} addresses */
function getPreferredAddress(addresses) {
  return addresses.find((address) => address.is_default) || addresses[0] || null;
}

const DEFAULT_DELIVERY_CARRIER = "correo-argentino";

function findRateByCarrier(rates, carrier) {
  const normalizedCarrier = normalizeShippingCarrier(carrier);
  if (!normalizedCarrier) {
    return null;
  }

  return rates.find((rate) => normalizeShippingCarrier(rate.carrier) === normalizedCarrier) || null;
}

function buildShippingQuoteKey({ zone, deliveryMode, addressId, postalCode, city, state, itemCount, weight }) {
  return JSON.stringify({
    zone: String(zone || ""),
    deliveryMode: String(deliveryMode || ""),
    addressId: deliveryMode === "saved" ? String(addressId || "") : "",
    postalCode: String(postalCode || "").trim(),
    city: String(city || "").trim().toLowerCase(),
    state: String(state || "").trim().toLowerCase(),
    itemCount: Number(itemCount || 0),
    weight: Number(weight || 0).toFixed(2),
  });
}

export default function CartPage() {
  const { items, totalPrice, totalItems, clearCart, removeItem, isHydrated } = useCart();
  const { user, isAuthenticated, isBootstrapping } = useAuth();
  const router = useRouter();

  const [phone, setPhone] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [shippingZone, setShippingZone] = useState("pickup");
  const [deliveryMode, setDeliveryMode] = useState("saved");
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [newAddress, setNewAddress] = useState(/** @type {CheckoutAddress} */ (emptyCheckoutAddress()));
  const [saveAddress, setSaveAddress] = useState(true);
  const [notes, setNotes] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [errors, setErrors] = useState(/** @type {CheckoutErrors} */ ({}));
  const [shippingPostalCode, setShippingPostalCode] = useState("");
  const [selectedCarrier, setSelectedCarrier] = useState(/** @type {string | null} */ (null));
  const [selectedCarrierQuoteKey, setSelectedCarrierQuoteKey] = useState(/** @type {string | null} */ (null));

  const debouncedPostalCode = useDebounce(shippingPostalCode, 400);
  const totalWeight = items.reduce((acc, item) => acc + 0.6 * item.quantity, 0);

  /** @param {CartItem} item */
  const handleOpenDetail = (item) => {
    const detailPath = getCartItemDetailPath(item);
    if (detailPath) {
      router.push(detailPath);
    }
  };

  const addressesQuery = useQuery({
    queryKey: ["my-addresses", "checkout"],
    queryFn: fetchMyAddresses,
    enabled: isAuthenticated,
    staleTime: 1000 * 30,
  });

  const addresses = /** @type {CheckoutAddress[]} */ (useMemo(
    () => addressesQuery.data?.addresses ?? [],
    [addressesQuery.data?.addresses]
  ));

  const selectedAddress = /** @type {CheckoutAddress | null} */ (useMemo(
    () => addresses.find((address) => String(address.id) === selectedAddressId) || null,
    [addresses, selectedAddressId]
  ));

  const effectiveZone = selectedAddress?.zone || shippingZone;
  const quotedAddress = deliveryMode === "saved" ? selectedAddress : newAddress;
  const isPickup = effectiveZone === "pickup";
  const normalizedQuotedCity = String(quotedAddress?.city || "").trim().toLowerCase();
  const normalizedQuotedState = String(quotedAddress?.state || "").trim().toLowerCase();
  const visibleShippingQuoteKey = useMemo(
    () => buildShippingQuoteKey({
      zone: effectiveZone,
      deliveryMode,
      addressId: selectedAddressId,
      postalCode: shippingPostalCode,
      city: quotedAddress?.city,
      state: quotedAddress?.state,
      itemCount: items.length,
      weight: totalWeight,
    }),
    [deliveryMode, effectiveZone, items.length, quotedAddress?.city, quotedAddress?.state, selectedAddressId, shippingPostalCode, totalWeight]
  );
  const resolvedShippingQuoteKey = useMemo(
    () => buildShippingQuoteKey({
      zone: effectiveZone,
      deliveryMode,
      addressId: selectedAddressId,
      postalCode: debouncedPostalCode,
      city: quotedAddress?.city,
      state: quotedAddress?.state,
      itemCount: items.length,
      weight: totalWeight,
    }),
    [debouncedPostalCode, deliveryMode, effectiveZone, items.length, quotedAddress?.city, quotedAddress?.state, selectedAddressId, totalWeight]
  );
  const waitingForFreshShippingQuote = !isPickup && visibleShippingQuoteKey !== resolvedShippingQuoteKey;

  const shippingRatesQuery = useQuery({
    queryKey: ["shipping", debouncedPostalCode, normalizedQuotedCity, normalizedQuotedState, items.length, totalWeight],
    queryFn: () => fetchShippingRates({
      postalCode: debouncedPostalCode,
      city: quotedAddress?.city,
      state: quotedAddress?.state,
      itemCount: items.length,
      weight: totalWeight,
    }),
    enabled: isAuthenticated && debouncedPostalCode.length >= 4 && !isPickup,
    staleTime: 1000 * 60 * 5,
    placeholderData: (prev) => prev,
    retry: 1,
  });

  const shippingRates = useMemo(
    () => /** @type {Array<{ carrier: string, carrierLabel: string, service: string, price: number, estimatedDays: string }>} */ (
      shippingRatesQuery.data?.rates ?? []
    ),
    [shippingRatesQuery.data?.rates]
  );

  const selectedRate = findRateByCarrier(shippingRates, selectedCarrier);
  const correoRate = findRateByCarrier(shippingRates, "correo-argentino");
  const andreaniRate = findRateByCarrier(shippingRates, "andreani");

  useEffect(() => {
    if (user) {
      setPhone((current) => current || user.phone || "");
      setCustomerName((current) => current || user.full_name || "");
    }
  }, [user]);

  useEffect(() => {
    if (addressesQuery.isLoading) {
      return;
    }

    const defaultAddress = getPreferredAddress(addresses);
    if (!defaultAddress) {
      setDeliveryMode("new");
      return;
    }

    setDeliveryMode("saved");
    setSelectedAddressId(String(defaultAddress.id));
    setShippingZone(defaultAddress.zone);
  }, [addresses, addressesQuery.isLoading]);

  useEffect(() => {
    if (isPickup) {
      setShippingPostalCode("");
      setSelectedCarrier("showroom");
      setSelectedCarrierQuoteKey("pickup");
      return;
    }

    if (deliveryMode === "saved") {
      setShippingPostalCode(selectedAddress?.postal_code || "");
      return;
    }

    setShippingPostalCode(newAddress.postal_code?.trim() || "");
  }, [deliveryMode, isPickup, newAddress.postal_code, selectedAddress?.postal_code]);

  useEffect(() => {
    if (isPickup) {
      return;
    }

    setSelectedCarrierQuoteKey(null);
  }, [deliveryMode, effectiveZone, isPickup, items.length, normalizedQuotedCity, normalizedQuotedState, selectedAddressId, shippingPostalCode, totalWeight]);

  useEffect(() => {
    if (isPickup) {
      return;
    }

    if (waitingForFreshShippingQuote || shippingRatesQuery.isFetching || !shippingRates.length) {
      return;
    }

    setSelectedCarrier((current) => {
      const currentRate = findRateByCarrier(shippingRates, current);
      if (currentRate) {
        return normalizeShippingCarrier(currentRate.carrier);
      }

      const preferredRate = findRateByCarrier(shippingRates, DEFAULT_DELIVERY_CARRIER);
      return normalizeShippingCarrier(preferredRate?.carrier || shippingRates[0]?.carrier);
    });
  }, [shippingRates, shippingRatesQuery.isFetching, isPickup, waitingForFreshShippingQuote]);

  useEffect(() => {
    if (isPickup) {
      return;
    }

    if (waitingForFreshShippingQuote || shippingRatesQuery.isFetching || !selectedRate || !normalizeShippingCarrier(selectedCarrier)) {
      return;
    }

    setSelectedCarrierQuoteKey((current) => (
      current === resolvedShippingQuoteKey ? current : resolvedShippingQuoteKey
    ));
  }, [isPickup, resolvedShippingQuoteKey, selectedCarrier, selectedRate, shippingRatesQuery.isFetching, waitingForFreshShippingQuote]);

  useEffect(() => {
    if (addressesQuery.isLoading || !isAuthenticated || deliveryMode !== "saved" || isPickup) {
      return;
    }

    if (selectedAddress) {
      return;
    }

    const fallbackAddress = getPreferredAddress(addresses);
    if (!fallbackAddress) {
      setDeliveryMode("new");
      return;
    }

    setSelectedAddressId(String(fallbackAddress.id));
    setShippingZone(fallbackAddress.zone);
  }, [addresses, addressesQuery.isLoading, deliveryMode, isAuthenticated, isPickup, selectedAddress]);

  useEffect(() => {
    setErrors((current) => (current.shipping ? { ...current, shipping: "" } : current));
  }, [selectedCarrier, shippingPostalCode, shippingZone, deliveryMode, selectedAddressId]);

  useEffect(() => {
    setNewAddress((current) => ({ ...current, zone: shippingZone }));
  }, [shippingZone]);

  const hasValidSelectedCarrier = !isPickup
    && Boolean(
      selectedRate
      && normalizeShippingCarrier(selectedCarrier)
      && selectedCarrierQuoteKey === visibleShippingQuoteKey
      && !shippingRatesQuery.isError
      && !waitingForFreshShippingQuote
      && !shippingRatesQuery.isFetching
    );
  const hasStaleShippingSelection = !isPickup
    && Boolean(selectedCarrier)
    && selectedCarrierQuoteKey !== null
    && selectedCarrierQuoteKey !== visibleShippingQuoteKey;
  const shippingLoading = !isPickup && (shippingRatesQuery.isFetching || waitingForFreshShippingQuote);
  const hasResolvedShippingRates = !isPickup && !shippingLoading && !shippingRatesQuery.isError && shippingRates.length > 0;

  /** @type {number | null} */
  let effectiveShippingCost = null;
  if (isPickup) {
    effectiveShippingCost = 0;
  } else if (normalizeShippingCarrier(selectedCarrier) === "showroom") {
    effectiveShippingCost = 0;
  } else if (hasValidSelectedCarrier && Number(selectedRate?.price) > 0) {
    effectiveShippingCost = selectedRate.price;
  }

  const effectiveCarrierLabel = isPickup
    ? "Retiro en showroom"
    : hasValidSelectedCarrier
      ? (selectedRate?.carrierLabel || getShippingCarrierLabel(selectedCarrier) || "Seleccioná envío")
      : "Seleccioná envío";
  const totalWithShipping = effectiveShippingCost === null ? null : totalPrice + effectiveShippingCost;
  const requiresManualAddress = isAuthenticated && effectiveZone !== "pickup" && (deliveryMode === "new" || !selectedAddress);
  const checkoutBlockedByShipping = isAuthenticated && !isPickup && (shippingLoading || shippingRatesQuery.isError || !hasValidSelectedCarrier);

  const checkoutMutation = useMutation({
    mutationFn: checkoutCart,
    onError: (error) => {
      toast.error("No se pudo completar el checkout", {
        description: error.message,
      });
    },
  });

  const validate = () => {
    /** @type {Record<string, string>} */
    const nextErrors = {};
    if (!isAuthenticated) nextErrors.auth = "Necesitás iniciar sesión para confirmar la compra";
    if (!phone.trim()) nextErrors.phone = "Ingresá tu número de WhatsApp";
    if (!customerName.trim()) nextErrors.customer_name = "Ingresá el nombre de quien recibe";
    if (effectiveZone !== "pickup" && deliveryMode === "saved" && !selectedAddressId) {
      nextErrors.addressId = addressesQuery.isLoading
        ? "Esperá a que carguemos tus direcciones o cargá una nueva"
        : "Elegí una dirección guardada o cargá una nueva";
    }
    if (requiresManualAddress) {
      if (!newAddress.recipient_name.trim()) nextErrors.recipient_name = "Ingresá quién recibe";
      if (!newAddress.line1.trim()) nextErrors.line1 = "Ingresá calle y altura";
      if (!newAddress.city.trim()) nextErrors.city = "Ingresá la ciudad";
      if (!newAddress.state.trim()) nextErrors.state = "Ingresá la provincia";
    }
    if (effectiveZone !== "pickup") {
      if (shippingPostalCode.trim().length < 4) {
        nextErrors.shipping = "Completá el código postal para calcular el envío";
      } else if (shippingLoading) {
        nextErrors.shipping = "Esperá a que terminemos de calcular el envío";
      } else if (shippingRatesQuery.isError) {
        nextErrors.shipping = "No pudimos calcular el envío para esa dirección";
      } else if (hasStaleShippingSelection) {
        nextErrors.shipping = "Volvé a elegir el envío para la dirección actual";
      } else if (!hasValidSelectedCarrier) {
        nextErrors.shipping = "Seleccioná un método de envío para continuar";
      }
    }
    if (!accepted) nextErrors.accepted = "Debés aceptar la política de privacidad";
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleConfirm = async () => {
    if (!validate()) return;

    const checkoutMutationId = createStoreMutationId("checkout");

    /** @type {CheckoutPayload} */
    const payload = {
      items: items.map((item) => ({
        cardId: Number(item.version_id),
        quantity: item.quantity,
      })),
      customer_name: customerName.trim(),
      phone,
      shipping_zone: effectiveZone,
      shipping_carrier: selectedRate?.carrier || normalizeShippingCarrier(selectedCarrier),
      notes: notes.trim(),
      accepted,
      mutation_id: checkoutMutationId,
    };

    if (effectiveZone !== "pickup") {
      if (deliveryMode === "saved" && selectedAddressId) {
        payload.addressId = Number(selectedAddressId);
      } else {
        payload.address = {
          ...newAddress,
          zone: effectiveZone,
        };
        payload.save_address = saveAddress;
      }
    }

    try {
      const response = await checkoutMutation.mutateAsync(payload);
      const order = response?.order;

      if (!order?.id) {
        throw new Error("La orden se creó pero la respuesta fue inválida");
      }

      trackOrderId(order.id);
      clearCart();
      if (typeof window !== "undefined" && typeof window.localStorage !== "undefined") {
        window.localStorage.setItem("yugioh_cart", "[]");
      }
      await refreshCards();

      toast.success("Pedido listo para pagar", {
        description: `Orden ${order.id}`,
      });
      router.push(`/checkout/pay/${order.id}`);
    } catch (error) {
      const checkoutError = /** @type {CheckoutMutationError | null} */ (
        error instanceof Error ? error : null
      );
      const message = checkoutError?.message || "No se pudo completar el checkout";
      const unavailableCardIds = Array.isArray(checkoutError?.unavailableCardIds)
        ? checkoutError.unavailableCardIds.map((value) => String(value))
        : [];

      if (unavailableCardIds.length > 0) {
        unavailableCardIds.forEach((cardId) => removeItem(cardId));
        toast.error("Actualizamos tu carrito", {
          description: message,
        });
        return;
      }

      toast.error("No se pudo completar el checkout", {
        description: message,
      });
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="max-w-[1100px] mx-auto px-3 sm:px-4 py-4 sm:py-6">
        <Link href="/singles" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 sm:mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Seguir comprando
        </Link>

        <div className="flex items-center gap-3 mb-5 sm:mb-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/20">
            <ShoppingCart className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black leading-tight">Tu Carrito</h1>
            <p className="text-xs text-muted-foreground">{totalItems} {totalItems === 1 ? "carta" : "cartas"}</p>
          </div>
        </div>

        {!isHydrated ? (
          <div className="grid lg:grid-cols-[1fr_380px] gap-5 sm:gap-6">
            <div className="space-y-3">
              {Array.from({ length: 2 }).map((_, index) => (
                <div key={index} className="h-24 sm:h-28 rounded-2xl border border-border/60 bg-card/60 animate-pulse" />
              ))}
            </div>
            <div className="h-80 rounded-3xl border border-border/60 bg-card/60 animate-pulse" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-16 sm:py-20">
            <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-secondary/60 ring-1 ring-border/40">
              <ShoppingCart className="w-10 h-10 text-muted-foreground/20" />
            </div>
            <p className="text-lg font-semibold text-muted-foreground">Tu carrito está vacío</p>
            <p className="mt-1 text-sm text-muted-foreground/70">Explorá el catálogo y sumá cartas</p>
            <Link href="/singles" className="mt-5 inline-flex h-11 items-center gap-2 rounded-2xl bg-primary px-6 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 transition hover:brightness-110">
              Ver cartas <ArrowLeft className="w-4 h-4 rotate-180" />
            </Link>
          </div>
        ) : (
          <div className="grid lg:grid-cols-[1fr_380px] gap-5 sm:gap-6">
            <div className="space-y-3">
              <AnimatePresence>
                {items.map((item) => (
                  <CartRow key={item.version_id} item={item} onOpenDetail={handleOpenDetail} />
                ))}
              </AnimatePresence>

              <div className="rounded-3xl border border-border/60 bg-card/80 backdrop-blur-sm p-4 sm:p-5 space-y-4">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-xl bg-primary/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] font-semibold text-primary">
                    <Shield className="w-3 h-3" /> Checkout seguro
                  </div>
                  <h2 className="mt-2 text-lg font-black">Datos de entrega</h2>
                </div>

                {!isAuthenticated ? (
                  <div className="rounded-2xl border border-border bg-secondary/50 p-4">
                    <p className="text-sm font-semibold">Necesitás una cuenta para confirmar el pedido.</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      El checkout ahora vincula stock, historial, direcciones y seguimiento con tu usuario.
                    </p>
                    <Link href="/auth?redirect=/cart" className="mt-4 inline-flex h-11 items-center justify-center rounded-2xl bg-primary px-5 text-sm font-bold text-primary-foreground">
                      Ingresar para comprar
                    </Link>
                  </div>
                ) : (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <input
                          type="text"
                          placeholder="Nombre completo"
                          value={customerName}
                          onChange={(e) => {
                            setCustomerName(e.target.value);
                            setErrors((prev) => ({ ...prev, customer_name: "" }));
                          }}
                          className="w-full h-11 px-3 rounded-xl border border-border bg-secondary outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/20"
                        />
                        {errors.customer_name ? <p className="mt-1 text-xs text-destructive">{errors.customer_name}</p> : null}
                      </div>

                      <div>
                        <input
                          type="tel"
                          placeholder="+54 9 11..."
                          value={phone}
                          onChange={(e) => {
                            setPhone(e.target.value);
                            setErrors((prev) => ({ ...prev, phone: "" }));
                          }}
                          className="w-full h-11 px-3 rounded-xl border border-border bg-secondary outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/20"
                        />
                        {errors.phone ? <p className="mt-1 text-xs text-destructive">{errors.phone}</p> : null}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <p className="flex items-center gap-2 text-sm font-bold">
                        <Truck className="w-4 h-4 text-primary" /> Elegí cómo recibir tu pedido
                      </p>

                      <div className="grid gap-2.5 sm:gap-3 grid-cols-3">
                        {/* Retiro en showroom */}
                        <button
                          type="button"
                          onClick={() => {
                            setShippingZone("pickup");
                            setSelectedCarrier("showroom");
                            setSelectedCarrierQuoteKey("pickup");
                            setSelectedAddressId("");
                          }}
                          className={`group relative flex flex-col items-center gap-1 sm:gap-2 rounded-2xl border-2 px-2 sm:px-4 py-3 sm:py-5 text-center transition-all duration-200 ${
                            effectiveZone === "pickup"
                              ? "border-emerald-400 bg-emerald-400/10 shadow-[0_0_24px_rgba(52,211,153,0.12)]"
                              : "border-border/60 hover:border-emerald-400/40 hover:bg-emerald-400/5"
                          }`}
                        >
                          {effectiveZone === "pickup" ? (
                            <div className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-400 shadow-lg shadow-emerald-400/30">
                              <Check className="h-3 w-3 text-background" />
                            </div>
                          ) : null}
                          <Store className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-400" />
                          <p className="text-[11px] sm:text-sm font-bold text-foreground leading-tight">Showroom</p>
                          <p className="text-sm sm:text-lg font-black text-emerald-400">GRATIS</p>
                          <p className="text-[10px] sm:text-[11px] text-muted-foreground">A coordinar</p>
                        </button>

                        {/* Correo Argentino */}
                        <button
                          type="button"
                          disabled={!isPickup && (shippingLoading || !correoRate)}
                          onClick={() => {
                            setSelectedCarrier("correo-argentino");
                            if (effectiveZone === "pickup") {
                              const fallbackAddress = getPreferredAddress(addresses);
                              if (fallbackAddress) {
                                setSelectedAddressId(String(fallbackAddress.id));
                                setShippingZone(fallbackAddress.zone);
                              }
                            }
                            if (deliveryMode === "saved") {
                              const fallbackAddress = getPreferredAddress(addresses);
                              if (fallbackAddress) {
                                setSelectedAddressId(String(fallbackAddress.id));
                              }
                            }
                          }}
                          className={`group relative flex flex-col items-center gap-1 sm:gap-2 rounded-2xl border-2 px-2 sm:px-4 py-3 sm:py-5 text-center transition-all duration-200 ${
                            normalizeShippingCarrier(selectedCarrier) === "correo-argentino" && !isPickup && selectedCarrierQuoteKey === visibleShippingQuoteKey
                              ? "border-sky-400 bg-sky-400/10 shadow-[0_0_24px_rgba(56,189,248,0.12)]"
                              : !isPickup && !shippingLoading && !correoRate
                                ? "border-border/40 opacity-50"
                                : "border-border/60 hover:border-sky-400/40 hover:bg-sky-400/5"
                          } disabled:cursor-not-allowed`}
                        >
                          {normalizeShippingCarrier(selectedCarrier) === "correo-argentino" && !isPickup && selectedCarrierQuoteKey === visibleShippingQuoteKey ? (
                            <div className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-sky-400 shadow-lg shadow-sky-400/30">
                              <Check className="h-3 w-3 text-background" />
                            </div>
                          ) : null}
                          <Package className="w-5 h-5 sm:w-6 sm:h-6 text-sky-400" />
                          <p className="text-[11px] sm:text-sm font-bold text-foreground leading-tight">Correo Arg.</p>
                          {correoRate ? (
                            <>
                              <p className="text-sm sm:text-lg font-black text-sky-400">{formatPrice(correoRate.price)}</p>
                              <p className="text-[10px] sm:text-[11px] text-muted-foreground">{correoRate.estimatedDays}</p>
                            </>
                          ) : (
                            <>
                              <p className="text-sm sm:text-lg font-black text-sky-400">{shippingLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : "—"}</p>
                              <p className="text-[10px] sm:text-[11px] text-muted-foreground">{shippingLoading ? "Cotizando..." : "No disponible para esta dirección"}</p>
                            </>
                          )}
                        </button>

                        {/* Andreani */}
                        <button
                          type="button"
                          disabled={!isPickup && (shippingLoading || !andreaniRate)}
                          onClick={() => {
                            setSelectedCarrier("andreani");
                            if (effectiveZone === "pickup") {
                              const fallbackAddress = getPreferredAddress(addresses);
                              if (fallbackAddress) {
                                setSelectedAddressId(String(fallbackAddress.id));
                                setShippingZone(fallbackAddress.zone);
                              }
                            }
                            if (deliveryMode === "saved") {
                              const fallbackAddress = getPreferredAddress(addresses);
                              if (fallbackAddress) {
                                setSelectedAddressId(String(fallbackAddress.id));
                              }
                            }
                          }}
                          className={`group relative flex flex-col items-center gap-1 sm:gap-2 rounded-2xl border-2 px-2 sm:px-4 py-3 sm:py-5 text-center transition-all duration-200 ${
                            normalizeShippingCarrier(selectedCarrier) === "andreani" && !isPickup && selectedCarrierQuoteKey === visibleShippingQuoteKey
                              ? "border-violet-400 bg-violet-400/10 shadow-[0_0_24px_rgba(167,139,250,0.12)]"
                              : !isPickup && !shippingLoading && !andreaniRate
                                ? "border-border/40 opacity-50"
                                : "border-border/60 hover:border-violet-400/40 hover:bg-violet-400/5"
                          } disabled:cursor-not-allowed`}
                        >
                          {normalizeShippingCarrier(selectedCarrier) === "andreani" && !isPickup && selectedCarrierQuoteKey === visibleShippingQuoteKey ? (
                            <div className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-violet-400 shadow-lg shadow-violet-400/30">
                              <Check className="h-3 w-3 text-background" />
                            </div>
                          ) : null}
                          <Truck className="w-5 h-5 sm:w-6 sm:h-6 text-violet-400" />
                          <p className="text-[11px] sm:text-sm font-bold text-foreground leading-tight">Andreani</p>
                          {andreaniRate ? (
                            <>
                              <p className="text-sm sm:text-lg font-black text-violet-400">{formatPrice(andreaniRate.price)}</p>
                              <p className="text-[10px] sm:text-[11px] text-muted-foreground">{andreaniRate.estimatedDays}</p>
                            </>
                          ) : (
                            <>
                              <p className="text-sm sm:text-lg font-black text-violet-400">{shippingLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : "—"}</p>
                              <p className="text-[10px] sm:text-[11px] text-muted-foreground">{shippingLoading ? "Cotizando..." : "No disponible para esta dirección"}</p>
                            </>
                          )}
                        </button>
                      </div>

                      {!isPickup && shippingRatesQuery.isError ? (
                        <div className="rounded-xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
                          ⚠️ No pudimos calcular el envío para ese código postal.
                        </div>
                      ) : !isPickup && shippingPostalCode.length >= 4 && shippingLoading ? (
                        <div className="flex items-center gap-2 rounded-xl border border-border bg-secondary/60 px-4 py-3 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" /> Actualizando envío real para CP {shippingPostalCode.trim()}...
                        </div>
                      ) : hasResolvedShippingRates ? (
                        <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 px-4 py-2 text-xs text-emerald-300">
                          ✓ Tarifa actualizada por Envia.com para CP {shippingPostalCode.trim()}
                        </div>
                      ) : !isPickup ? (
                        <div className="rounded-xl border border-border bg-secondary/40 px-4 py-2 text-xs text-muted-foreground">
                          {shippingPostalCode.length >= 4 ? "Seleccioná un carrier para continuar." : "Completá el código postal para calcular el envío automáticamente."}
                        </div>
                      ) : null}
                    </div>

                    {effectiveZone !== "pickup" ? (
                      <div className="space-y-4 rounded-2xl border border-border bg-secondary/40 p-4">
                        <div className="flex items-center gap-2 text-sm font-semibold">
                          <MapPin className="w-4 h-4 text-primary" />
                          Dirección de entrega
                        </div>

                        {addresses.length ? (
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setDeliveryMode("saved");
                                const fallbackAddress = getPreferredAddress(addresses);
                                if (fallbackAddress) {
                                  setSelectedAddressId(String(fallbackAddress.id));
                                  setShippingZone(fallbackAddress.zone);
                                }
                              }}
                              className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${deliveryMode === "saved" ? "bg-primary text-primary-foreground" : "border border-border hover:bg-background"}`}
                            >
                              Usar guardada
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setDeliveryMode("new");
                                setSelectedAddressId("");
                              }}
                              className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${deliveryMode === "new" ? "bg-primary text-primary-foreground" : "border border-border hover:bg-background"}`}
                            >
                              Cargar nueva
                            </button>
                          </div>
                        ) : null}

                        {deliveryMode === "saved" && addresses.length ? (
                          <div>
                            <select
                              value={selectedAddressId}
                              onChange={(e) => {
                                const nextAddressId = e.target.value;
                                const nextAddress = addresses.find((address) => String(address.id) === nextAddressId);
                                setSelectedAddressId(nextAddressId);
                                if (nextAddress?.zone) {
                                  setShippingZone(nextAddress.zone);
                                }
                                if (nextAddress?.postal_code) {
                                  setShippingPostalCode(nextAddress.postal_code);
                                }
                                setErrors((prev) => ({ ...prev, addressId: "" }));
                              }}
                              className="w-full h-11 rounded-xl border border-border bg-background px-3 outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/20"
                            >
                              <option value="">Seleccioná una dirección</option>
                              {addresses.map((address) => (
                                <option key={address.id} value={address.id}>
                                  {address.label} · {address.line1}, {address.city}
                                </option>
                              ))}
                            </select>
                            {errors.addressId ? <p className="mt-1 text-xs text-destructive">{errors.addressId}</p> : null}

                            {selectedAddress ? (
                              <div className="mt-3 rounded-2xl border border-border bg-background/70 p-3 text-sm">
                                <div className="flex items-center gap-2 font-semibold">
                                  <Check className="w-4 h-4 text-primary" />
                                  {selectedAddress.label}
                                </div>
                                <p className="mt-2 text-muted-foreground">
                                  {[selectedAddress.line1, selectedAddress.line2, selectedAddress.city, selectedAddress.state].filter(Boolean).join(", ")}
                                </p>
                              </div>
                            ) : null}
                          </div>
                        ) : deliveryMode === "saved" && addressesQuery.isLoading ? (
                          <div className="space-y-3 rounded-2xl border border-border bg-background/50 p-4">
                            <div className="h-11 animate-pulse rounded-xl bg-secondary/80" />
                            <div className="h-20 animate-pulse rounded-2xl bg-secondary/60" />
                          </div>
                        ) : (
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div>
                              <input type="text" placeholder="Etiqueta" value={newAddress.label} onChange={(e) => setNewAddress((current) => ({ ...current, label: e.target.value }))} className="w-full h-11 px-3 rounded-xl border border-border bg-background outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/20" />
                            </div>
                            <div>
                              <input type="text" placeholder="Recibe" value={newAddress.recipient_name} onChange={(e) => {
                                setNewAddress((current) => ({ ...current, recipient_name: e.target.value }));
                                setErrors((prev) => ({ ...prev, recipient_name: "" }));
                              }} className="w-full h-11 px-3 rounded-xl border border-border bg-background outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/20" />
                              {errors.recipient_name ? <p className="mt-1 text-xs text-destructive">{errors.recipient_name}</p> : null}
                            </div>
                            <div>
                              <input type="text" placeholder="Calle y altura" value={newAddress.line1} onChange={(e) => {
                                setNewAddress((current) => ({ ...current, line1: e.target.value }));
                                setErrors((prev) => ({ ...prev, line1: "" }));
                              }} className="w-full h-11 px-3 rounded-xl border border-border bg-background outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/20" />
                              {errors.line1 ? <p className="mt-1 text-xs text-destructive">{errors.line1}</p> : null}
                            </div>
                            <div>
                              <input type="text" placeholder="Depto / piso" value={newAddress.line2} onChange={(e) => setNewAddress((current) => ({ ...current, line2: e.target.value }))} className="w-full h-11 px-3 rounded-xl border border-border bg-background outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/20" />
                            </div>
                            <div>
                              <input type="text" placeholder="Ciudad" value={newAddress.city} onChange={(e) => {
                                setNewAddress((current) => ({ ...current, city: e.target.value }));
                                setErrors((prev) => ({ ...prev, city: "" }));
                              }} className="w-full h-11 px-3 rounded-xl border border-border bg-background outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/20" />
                              {errors.city ? <p className="mt-1 text-xs text-destructive">{errors.city}</p> : null}
                            </div>
                            <div>
                              <input type="text" placeholder="Provincia" value={newAddress.state} onChange={(e) => {
                                setNewAddress((current) => ({ ...current, state: e.target.value }));
                                setErrors((prev) => ({ ...prev, state: "" }));
                              }} className="w-full h-11 px-3 rounded-xl border border-border bg-background outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/20" />
                              {errors.state ? <p className="mt-1 text-xs text-destructive">{errors.state}</p> : null}
                            </div>
                            <div>
                              <input type="text" placeholder="Código postal" value={newAddress.postal_code} onChange={(e) => setNewAddress((current) => ({ ...current, postal_code: e.target.value }))} className="w-full h-11 px-3 rounded-xl border border-border bg-background outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/20" />
                            </div>
                            <div>
                              <input type="tel" placeholder="Teléfono alternativo" value={newAddress.phone} onChange={(e) => setNewAddress((current) => ({ ...current, phone: e.target.value }))} className="w-full h-11 px-3 rounded-xl border border-border bg-background outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/20" />
                            </div>
                            <label className="sm:col-span-2 flex items-center gap-2 text-sm text-muted-foreground">
                              <input type="checkbox" checked={saveAddress} onChange={(e) => setSaveAddress(e.target.checked)} />
                              Guardar esta dirección en mi cuenta
                            </label>

                            <div className="sm:col-span-2 rounded-xl border border-border bg-background/60 px-4 py-3 text-sm text-muted-foreground">
                              {newAddress.postal_code?.trim().length >= 4
                                ? "El envío se recalcula automáticamente cuando cambiás el código postal o los ítems del carrito."
                                : "Completá el código postal para calcular el envío automáticamente."}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-border bg-secondary/40 p-4 text-sm text-muted-foreground">
                        Elegiste retiro por showroom. No hace falta cargar dirección.
                      </div>
                    )}

                    <textarea
                      rows={3}
                      placeholder="Notas para el pedido o la entrega"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="w-full rounded-2xl border border-border bg-secondary px-3 py-3 outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/20"
                    />
                  </>
                )}
              </div>
            </div>

            <div className="bg-card/80 backdrop-blur-sm border border-border/60 rounded-3xl p-5 sm:p-6 space-y-4 lg:sticky lg:top-20 shadow-[0_20px_50px_rgba(0,0,0,0.2)]">
              <h2 className="font-black text-lg flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-primary" />
                Resumen
              </h2>

              <div className="text-sm space-y-1.5 max-h-40 overflow-y-auto pr-1 scrollbar-thin">
                {items.map((item) => (
                  <div key={item.version_id} className="flex justify-between gap-2 text-muted-foreground">
                    <span className="truncate">{item.name} <span className="text-foreground/50">×{item.quantity}</span></span>
                    <span className="shrink-0 tabular-nums">{formatPrice(item.price * item.quantity)}</span>
                  </div>
                ))}
              </div>

              <div className="border-t border-border/50 pt-3 text-sm space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="tabular-nums">{formatPrice(totalPrice)}</span>
                </div>
                <div className="flex justify-between text-yellow-400">
                  <span className="flex items-center gap-1.5">
                    <Truck className="w-3 h-3" />
                    {effectiveCarrierLabel}
                  </span>
                  <span className="tabular-nums font-semibold">
                    {shippingLoading
                      ? <Loader2 className="w-3 h-3 animate-spin inline" />
                      : effectiveShippingCost === null
                        ? <span className="text-muted-foreground text-xs">Seleccioná envío</span>
                        : effectiveShippingCost === 0 ? "GRATIS" : formatPrice(effectiveShippingCost)}
                  </span>
                </div>
                <div className="flex justify-between items-baseline font-black text-base pt-1">
                  <span>Total</span>
                  <span className="text-lg text-primary">
                    {shippingLoading
                      ? <Loader2 className="w-3 h-3 animate-spin inline" />
                      : totalWithShipping === null
                        ? <span className="text-muted-foreground text-sm font-medium">Calculando...</span>
                        : formatPrice(totalWithShipping)}
                  </span>
                </div>
              </div>

              <div className="space-y-3 border-t border-border/50 pt-4">
                {errors.auth ? <p className="text-xs text-destructive">{errors.auth}</p> : null}

                <label className="flex gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={accepted}
                    onChange={(e) => {
                      setAccepted(e.target.checked);
                      setErrors((prev) => ({ ...prev, accepted: "" }));
                    }}
                    className="mt-0.5 accent-primary"
                  />
                  <span>
                    Acepto la <Link href="/privacy" className="text-primary underline">política</Link> y los <Link href="/terms" className="text-primary underline">términos</Link>
                  </span>
                </label>
                {errors.accepted ? <p className="text-xs text-destructive">{errors.accepted}</p> : null}

                {errors.shipping ? <p className="text-xs text-amber-400 text-center">{errors.shipping}</p> : null}

                <button
                  onClick={handleConfirm}
                  disabled={checkoutMutation.isPending || isBootstrapping || items.length === 0 || checkoutBlockedByShipping}
                  className="w-full h-12 rounded-2xl bg-primary font-bold text-primary-foreground flex items-center justify-center gap-2 transition-all duration-200 hover:brightness-110 hover:shadow-lg hover:shadow-primary/20 disabled:cursor-not-allowed disabled:opacity-40 active:scale-[0.98]"
                >
                  {checkoutMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Procesando...
                    </>
                  ) : (
                    <>
                      <CreditCard className="w-4 h-4" />
                      Pagar con Mercado Pago
                    </>
                  )}
                </button>
                <p className="text-[10px] text-center text-muted-foreground/70 leading-relaxed">
                  Stock reservado al confirmar · Pago seguro vía Mercado Pago
                </p>
              </div>
            </div>
          </div>
        )}
      </motion.div>
  );
}