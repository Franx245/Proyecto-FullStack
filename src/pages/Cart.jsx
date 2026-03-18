import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
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
} from "lucide-react";

import { useCart } from "@/lib/cartStore";
import { checkoutCart, fetchMyAddresses } from "@/api/store";
import { trackOrderId } from "@/lib/orderTracking";
import { useAuth } from "@/lib/auth";
import { SHIPPING_OPTIONS, getShippingOption } from "@/lib/shipping";
import { toast } from "sonner";
import CardImage from "@/components/marketplace/CardImage";

/**
 * @typedef {{
 *  version_id: string | number,
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
 *  addressId?: number,
 *  address?: CheckoutAddress,
 *  save_address?: boolean
 * }} CheckoutPayload
 *
 * @typedef {{ id: string | number }} CheckoutOrderSummary
 *
 * @typedef {{ orders?: CheckoutOrderSummary[] }} OrdersCacheShape
 */

// 🧩 Row
/** @param {{ item: CartItem }} props */
function CartRow({ item }) {
  const { updateQuantity, removeItem } = useCart();

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex gap-4 p-4 bg-card border border-border rounded-xl hover:border-border/80 transition"
    >
      {/* Image */}
      <div className="w-16 h-[84px] rounded-lg bg-secondary overflow-hidden shrink-0">
        {item.image ? (
          <CardImage
            id={item.ygopro_id}
            name={item.name}
            fallbackSrc={item.image}
            sizes="64px"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ShoppingCart className="w-5 h-5 text-muted-foreground/30" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-sm">{item.name}</h3>
        <p className="text-xs text-muted-foreground">
          {item.rarity}
          {item.set_name ? ` · ${item.set_name}` : ""}
        </p>

        <p className="text-base font-bold text-primary mt-2">
          ${(item.price * item.quantity).toFixed(2)}
        </p>
        <p className="text-[11px] text-muted-foreground">
          ${item.price.toFixed(2)} c/u
        </p>
      </div>

      {/* Controls */}
      <div className="flex flex-col items-end justify-between">
        <button
          onClick={() => removeItem(String(item.version_id))}
          className="p-1 text-muted-foreground hover:text-destructive transition"
        >
          <Trash2 className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2 bg-secondary rounded-lg px-2 py-1">
          <button
            onClick={() =>
              updateQuantity(String(item.version_id), item.quantity - 1)
            }
          >
            <Minus className="w-3.5 h-3.5" />
          </button>

          <span className="text-sm font-bold w-5 text-center">
            {item.quantity}
          </span>

          <button
            onClick={() =>
              updateQuantity(String(item.version_id), item.quantity + 1)
            }
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
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

// 🛒 Page
export default function CartPage() {
  const { items, totalPrice, totalItems, clearCart } = useCart();
  const { user, isAuthenticated, isBootstrapping } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

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

  useEffect(() => {
    if (user) {
      setPhone((current) => current || user.phone || "");
      setCustomerName((current) => current || user.full_name || "");
    }
  }, [user]);

  useEffect(() => {
    const defaultAddress = addresses.find(
      /** @param {CheckoutAddress} address */
      (address) => address.is_default
    ) || addresses[0];
    if (!defaultAddress) {
      setDeliveryMode("new");
      return;
    }

    setDeliveryMode("saved");
    setSelectedAddressId(String(defaultAddress.id));
    setShippingZone(defaultAddress.zone);
  }, [addresses]);

  useEffect(() => {
    setNewAddress((current) => ({
      ...current,
      zone: shippingZone,
    }));
  }, [shippingZone]);

  const selectedAddress = /** @type {CheckoutAddress | null} */ (useMemo(
    () => addresses.find(
      /** @param {CheckoutAddress} address */
      (address) => String(address.id) === selectedAddressId
    ) || null,
    [addresses, selectedAddressId]
  ));

  const effectiveZone = selectedAddress?.zone || shippingZone;
  const shippingOption = getShippingOption(effectiveZone);
  const totalWithShipping = totalPrice + shippingOption.cost;
  const requiresManualAddress = isAuthenticated && effectiveZone !== "pickup" && (deliveryMode === "new" || !selectedAddress);

  const checkoutMutation = useMutation({
    mutationFn: checkoutCart,
    onSuccess: ({ order }) => {
      trackOrderId(order.id);
      queryClient.setQueryData(["my-orders"], (current) => {
        const currentData = /** @type {OrdersCacheShape | undefined} */ (current);
        const currentOrders = Array.isArray(currentData?.orders) ? currentData.orders : [];
        return {
          ...(currentData && typeof currentData === "object" ? currentData : {}),
          orders: [order, ...currentOrders.filter((existing) => String(existing.id) !== String(order.id))],
        };
      });
      queryClient.invalidateQueries({ queryKey: ["my-orders"] });
      clearCart();

      toast.success("¡Pedido confirmado!", {
        description: `Orden ${order.id}`,
      });

      navigate("/orders", { replace: true });
    },
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
      nextErrors.addressId = "Elegí una dirección guardada o cargá una nueva";
    }
    if (requiresManualAddress) {
      if (!newAddress.recipient_name.trim()) nextErrors.recipient_name = "Ingresá quién recibe";
      if (!newAddress.line1.trim()) nextErrors.line1 = "Ingresá calle y altura";
      if (!newAddress.city.trim()) nextErrors.city = "Ingresá la ciudad";
      if (!newAddress.state.trim()) nextErrors.state = "Ingresá la provincia";
    }
    if (!accepted) nextErrors.accepted = "Debés aceptar la política de privacidad";
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleConfirm = async () => {
    if (!validate()) return;

    /** @type {CheckoutPayload} */
    const payload = {
      items: items.map((item) => ({
        cardId: Number(item.version_id),
        quantity: item.quantity,
      })),
      customer_name: customerName.trim(),
      phone,
      shipping_zone: effectiveZone,
      notes: notes.trim(),
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

    checkoutMutation.mutate(payload);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-[1100px] mx-auto px-4 py-6"
    >
      <Link
        to="/singles"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Seguir comprando
      </Link>

      <h1 className="text-2xl font-black mb-6 flex items-center gap-3">
        <ShoppingCart className="w-6 h-6 text-primary" />
        Tu Carrito
        <span className="text-sm text-muted-foreground">
          ({totalItems} items)
        </span>
      </h1>

      {items.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <ShoppingCart className="w-14 h-14 mx-auto mb-4 opacity-20" />
          <p>Tu carrito está vacío.</p>
          <Link to="/singles" className="text-primary hover:underline">
            Ver cartas →
          </Link>
        </div>
      ) : (
        <div className="grid lg:grid-cols-[1fr_360px] gap-6">
          <div className="space-y-3">
            <AnimatePresence>
              {items.map((item) => (
                <CartRow key={item.version_id} item={item} />
              ))}
            </AnimatePresence>

            <div className="rounded-3xl border border-border bg-card p-5 space-y-4">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  Checkout autenticado
                </p>
                <h2 className="mt-2 text-lg font-black">
                  Datos de entrega
                </h2>
              </div>

              {!isAuthenticated ? (
                <div className="rounded-2xl border border-border bg-secondary/50 p-4">
                  <p className="text-sm font-semibold">Necesitás una cuenta para confirmar el pedido.</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    El checkout ahora vincula stock, historial, direcciones y seguimiento con tu usuario.
                  </p>
                  <Link
                    to="/auth?redirect=/cart"
                    className="mt-4 inline-flex h-11 items-center justify-center rounded-2xl bg-primary px-5 text-sm font-bold text-primary-foreground"
                  >
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

                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="space-y-2 text-sm">
                      <span className="font-semibold">Modalidad</span>
                      <select
                        value={shippingZone}
                        onChange={(e) => {
                          const nextZone = e.target.value;
                          setShippingZone(nextZone);
                          if (nextZone === "pickup") {
                            setSelectedAddressId("");
                          }
                        }}
                        className="w-full h-11 rounded-xl border border-border bg-secondary px-3 outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/20"
                      >
                        {Object.entries(SHIPPING_OPTIONS).map(([zone, option]) => (
                          <option key={zone} value={zone}>{option.label} · {option.eta}</option>
                        ))}
                      </select>
                    </label>

                    <div className="rounded-2xl border border-border bg-secondary/60 px-4 py-3 text-sm">
                      <p className="font-semibold">Costo estimado</p>
                      <p className="mt-1 text-muted-foreground">{shippingOption.label}</p>
                      <p className="mt-2 text-lg font-black text-primary">${shippingOption.cost.toFixed(2)}</p>
                    </div>
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
                            onClick={() => setDeliveryMode("saved")}
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
                              const nextAddress = addresses.find(
                                /** @param {CheckoutAddress} address */
                                (address) => String(address.id) === nextAddressId
                              );
                              setSelectedAddressId(nextAddressId);
                              if (nextAddress?.zone) {
                                setShippingZone(nextAddress.zone);
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
                      ) : (
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <input
                              type="text"
                              placeholder="Etiqueta"
                              value={newAddress.label}
                              onChange={(e) => setNewAddress((current) => ({ ...current, label: e.target.value }))}
                              className="w-full h-11 px-3 rounded-xl border border-border bg-background outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/20"
                            />
                          </div>
                          <div>
                            <input
                              type="text"
                              placeholder="Recibe"
                              value={newAddress.recipient_name}
                              onChange={(e) => {
                                setNewAddress((current) => ({ ...current, recipient_name: e.target.value }));
                                setErrors((prev) => ({ ...prev, recipient_name: "" }));
                              }}
                              className="w-full h-11 px-3 rounded-xl border border-border bg-background outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/20"
                            />
                            {errors.recipient_name ? <p className="mt-1 text-xs text-destructive">{errors.recipient_name}</p> : null}
                          </div>
                          <div>
                            <input
                              type="text"
                              placeholder="Calle y altura"
                              value={newAddress.line1}
                              onChange={(e) => {
                                setNewAddress((current) => ({ ...current, line1: e.target.value }));
                                setErrors((prev) => ({ ...prev, line1: "" }));
                              }}
                              className="w-full h-11 px-3 rounded-xl border border-border bg-background outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/20"
                            />
                            {errors.line1 ? <p className="mt-1 text-xs text-destructive">{errors.line1}</p> : null}
                          </div>
                          <div>
                            <input
                              type="text"
                              placeholder="Depto / piso"
                              value={newAddress.line2}
                              onChange={(e) => setNewAddress((current) => ({ ...current, line2: e.target.value }))}
                              className="w-full h-11 px-3 rounded-xl border border-border bg-background outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/20"
                            />
                          </div>
                          <div>
                            <input
                              type="text"
                              placeholder="Ciudad"
                              value={newAddress.city}
                              onChange={(e) => {
                                setNewAddress((current) => ({ ...current, city: e.target.value }));
                                setErrors((prev) => ({ ...prev, city: "" }));
                              }}
                              className="w-full h-11 px-3 rounded-xl border border-border bg-background outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/20"
                            />
                            {errors.city ? <p className="mt-1 text-xs text-destructive">{errors.city}</p> : null}
                          </div>
                          <div>
                            <input
                              type="text"
                              placeholder="Provincia"
                              value={newAddress.state}
                              onChange={(e) => {
                                setNewAddress((current) => ({ ...current, state: e.target.value }));
                                setErrors((prev) => ({ ...prev, state: "" }));
                              }}
                              className="w-full h-11 px-3 rounded-xl border border-border bg-background outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/20"
                            />
                            {errors.state ? <p className="mt-1 text-xs text-destructive">{errors.state}</p> : null}
                          </div>
                          <div>
                            <input
                              type="text"
                              placeholder="Código postal"
                              value={newAddress.postal_code}
                              onChange={(e) => setNewAddress((current) => ({ ...current, postal_code: e.target.value }))}
                              className="w-full h-11 px-3 rounded-xl border border-border bg-background outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/20"
                            />
                          </div>
                          <div>
                            <input
                              type="tel"
                              placeholder="Teléfono alternativo"
                              value={newAddress.phone}
                              onChange={(e) => setNewAddress((current) => ({ ...current, phone: e.target.value }))}
                              className="w-full h-11 px-3 rounded-xl border border-border bg-background outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/20"
                            />
                          </div>
                          <label className="sm:col-span-2 flex items-center gap-2 text-sm text-muted-foreground">
                            <input
                              type="checkbox"
                              checked={saveAddress}
                              onChange={(e) => setSaveAddress(e.target.checked)}
                            />
                            Guardar esta dirección en mi cuenta
                          </label>
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

          <div className="bg-card border border-border rounded-3xl p-6 space-y-4 sticky top-20 shadow-[0_20px_40px_rgba(0,0,0,0.18)]">
            <h2 className="font-bold text-lg">Resumen</h2>

            <div className="text-sm space-y-1">
              {items.map((item) => (
                <div
                  key={item.version_id}
                  className="flex justify-between text-muted-foreground"
                >
                  <span>
                    {item.name} x{item.quantity}
                  </span>
                  <span>
                    ${(item.price * item.quantity).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>

            <div className="border-t pt-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>${totalPrice.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-yellow-400">
                <span>Envío</span>
                <span>${shippingOption.cost.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-bold text-base">
                <span>Total</span>
                <span className="text-primary">
                  ${totalWithShipping.toFixed(2)}
                </span>
              </div>
            </div>

            <div className="space-y-3 border-t pt-4">
              {errors.auth ? <p className="text-xs text-destructive">{errors.auth}</p> : null}

              <label className="flex gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={accepted}
                  onChange={(e) => {
                    setAccepted(e.target.checked);
                    setErrors((prev) => ({ ...prev, accepted: "" }));
                  }}
                />
                Acepto la{" "}
                <Link to="/privacy" className="text-primary underline">
                  política
                </Link>
              </label>
              {errors.accepted ? <p className="text-xs text-destructive">{errors.accepted}</p> : null}

              <button
                onClick={handleConfirm}
                disabled={
                  checkoutMutation.isPending ||
                  isBootstrapping ||
                  !isAuthenticated ||
                  !phone ||
                  !accepted ||
                  addressesQuery.isLoading
                }
                className="w-full h-11 rounded-xl bg-primary font-bold text-primary-foreground flex items-center justify-center gap-2 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {checkoutMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Procesando...
                  </>
                ) : (
                  "Confirmar Pedido"
                )}
              </button>
              <p className="text-[11px] text-muted-foreground">
                El pedido se crea como pendiente de pago y el stock queda reservado inmediatamente.
              </p>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}