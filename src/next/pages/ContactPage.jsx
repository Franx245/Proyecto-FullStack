"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { AlignLeft, CheckCircle, Mail, MessageCircle, Phone, QrCode, Send, Tag, User } from "lucide-react";
import QRCode from "qrcode";
import { toast } from "sonner";

import { fetchStorefrontConfig, submitContactRequest } from "@/api/store";
import { useCart } from "@/lib/cartStore";
import { formatPrice } from "@/utils/currency";

/**
 * @param {Array<{quantity: number, name: string, price: number}>} items
 * @param {number} totalPrice
 */
function buildWhatsAppCartMessage(items, totalPrice) {
  if (!items.length) {
    return encodeURIComponent("Hola, quisiera consultar sobre sus cartas.");
  }

  const lines = items.map((/** @type {*} */ item) => `• ${item.quantity}x ${item.name} - ${formatPrice(item.price * item.quantity)}`);
  return encodeURIComponent(
    `RareHunter - Consulta de carrito\n\n${lines.join("\n")}\n\nTotal: ${formatPrice(totalPrice)}\n\n¿Podés confirmar disponibilidad?`
  );
}

/** @param {string} value */
function formatPhoneDisplay(value) {
  const digits = String(value || "").replace(/[^\d]/g, "");

  if (!digits) {
    return "Sin configurar";
  }

  if (digits.length === 13 && digits.startsWith("549")) {
    return `+${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 9)}-${digits.slice(9)}`;
  }

  if (digits.length === 11) {
    return `${digits.slice(0, 3)} ${digits.slice(3, 7)}-${digits.slice(7)}`;
  }

  return value;
}

function contactInputClassName() {
  return "h-12 w-full rounded-[22px] border border-white/10 bg-secondary/70 pl-10 pr-4 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary/35 focus:bg-secondary/90 focus:ring-2 focus:ring-primary/15";
}

function contactTextareaClassName() {
  return "w-full resize-none rounded-[22px] border border-white/10 bg-secondary/70 py-3 pl-10 pr-4 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary/35 focus:bg-secondary/90 focus:ring-2 focus:ring-primary/15";
}

export default function ContactPage() {
  const { items, totalPrice } = useCart();
  const storefrontConfigQuery = useQuery({
    queryKey: ["storefront-config"],
    queryFn: fetchStorefrontConfig,
    staleTime: 1000 * 60,
  });
  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "" });
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [qrCodeError, setQrCodeError] = useState(false);
  const [submitFeedback, setSubmitFeedback] = useState({ type: "", message: "" });
  const supportWhatsappNumber = String(storefrontConfigQuery.data?.storefront?.support_whatsapp_number || "").replace(/[^\d]/g, "");
  const supportEmail = String(storefrontConfigQuery.data?.storefront?.support_email || "").trim();
  const whatsappLink = useMemo(() => {
    if (!supportWhatsappNumber) {
      return "";
    }

    return `https://wa.me/${supportWhatsappNumber}?text=${buildWhatsAppCartMessage(items, totalPrice)}`;
  }, [items, supportWhatsappNumber, totalPrice]);

  useEffect(() => {
    let cancelled = false;

    if (!whatsappLink) {
      setQrCodeUrl("");
      setQrCodeError(false);
      return undefined;
    }

    setQrCodeError(false);

    QRCode.toDataURL(whatsappLink, {
      width: 320,
      margin: 1,
      errorCorrectionLevel: "M",
      color: {
        dark: "#0f172a",
        light: "#ffffff",
      },
    }).then((nextQrCodeUrl) => {
      if (!cancelled) {
        setQrCodeUrl(nextQrCodeUrl);
      }
    }).catch(() => {
      if (!cancelled) {
        setQrCodeUrl("");
        setQrCodeError(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [whatsappLink]);

  const formFields = [
    { key: "name", label: "Nombre", placeholder: "Tu nombre", icon: User, type: "text" },
    { key: "email", label: "Email", placeholder: "tu@email.com", icon: Mail, type: "email" },
    { key: "subject", label: "Asunto", placeholder: "Consulta sobre...", icon: Tag, type: "text" },
  ];

  const canSubmit = form.name && form.email && form.subject && form.message;

  /** @param {import('react').FormEvent} event */
  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitFeedback({ type: "", message: "" });

    if (!canSubmit) {
      setSubmitFeedback({
        type: "error",
        message: "Completa nombre, email, asunto y mensaje antes de enviar.",
      });
      toast.error("Completa todos los campos");
      return;
    }

    setLoading(true);
    try {
      await submitContactRequest(form);
      setSent(true);
      setForm({ name: "", email: "", subject: "", message: "" });
      setSubmitFeedback({
        type: "success",
        message: "Tu consulta fue enviada correctamente. Te responderemos a la brevedad.",
      });
      toast.success("Consulta enviada", { description: "La recibimos correctamente y la verás reflejada en el panel admin." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "No pudimos enviar tu consulta";
      setSubmitFeedback({ type: "error", message });
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  function handleWhatsApp() {
    if (!supportWhatsappNumber) {
      toast.error("WhatsApp de soporte no configurado");
      return;
    }

    window.open(whatsappLink, "_blank");
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="mx-auto max-w-[1120px] px-4 py-6 sm:px-5 sm:py-8 lg:px-6 lg:py-10">
        <div className="mb-6 sm:mb-7">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">
            Soporte RareHunter
          </span>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-foreground sm:text-[2.2rem]">Contacto</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-[15px]">Elegí el canal que te quede más cómodo para consultar por tu compra o escribirnos.</p>
        </div>

        <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[linear-gradient(160deg,rgba(8,12,20,0.98),rgba(10,16,24,0.94))] shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
          <div className="absolute inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_top_left,rgba(52,211,153,0.12),transparent_60%)]" />
          <div className="absolute bottom-0 right-0 h-56 w-56 rounded-full bg-cyan-400/5 blur-3xl" />

          <div className="relative grid lg:grid-cols-[0.9fr_1.1fr]">
            <div className="border-b border-white/10 bg-[linear-gradient(180deg,rgba(9,14,20,0.82),rgba(9,14,20,0.58))] p-4 sm:p-6 lg:border-b-0 lg:border-r lg:border-white/10">
              <div className="flex h-full flex-col">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
                    <Phone className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-[1.7rem] font-bold text-foreground sm:text-2xl">Contacto rápido</h2>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">Abrí WhatsApp con tu carrito actual o usá el formulario para enviarnos una consulta.</p>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:mt-5 sm:gap-4">
                  <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4 backdrop-blur-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary/85">WhatsApp</p>
                        <p className="mt-2 text-[15px] font-semibold text-foreground sm:text-base">{formatPhoneDisplay(supportWhatsappNumber)}</p>
                      </div>
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/[0.05] text-primary">
                        <QrCode className="h-5 w-5" />
                      </div>
                    </div>
                  </div>

                  <div className="mx-auto hidden h-[220px] w-[220px] items-center justify-center overflow-hidden rounded-[28px] border border-white/10 bg-white p-2 shadow-[0_20px_60px_rgba(0,0,0,0.18)] sm:flex">
                    {qrCodeUrl ? (
                      <img src={qrCodeUrl} alt="QR para enviar el carrito por WhatsApp" className="h-full w-full object-contain" loading="lazy" />
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center rounded-[20px] border border-slate-200 bg-slate-100 px-4 text-center text-sm text-slate-500">
                        <QrCode className="mb-3 h-8 w-8" />
                        {supportWhatsappNumber ? (qrCodeError ? "No pudimos generar el QR. Probá abrir WhatsApp desde el botón." : "Generando QR...") : "Configurá el número desde admin para generar el QR."}
                      </div>
                    )}
                  </div>

                  <p className="sm:hidden text-sm leading-6 text-muted-foreground">En mobile podés abrir WhatsApp directo desde el botón de abajo.</p>

                  <button onClick={handleWhatsApp} className="flex h-12 w-full items-center justify-center gap-2 rounded-[22px] bg-primary px-4 text-sm font-bold text-primary-foreground shadow-[0_16px_38px_rgba(34,197,94,0.24)] transition hover:bg-primary/90 active:scale-[0.99]">
                    <MessageCircle className="h-4 w-4" />
                    Enviar carrito por WhatsApp
                  </button>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4 backdrop-blur-sm">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary/85">Email soporte</p>
                      <p className="mt-2 break-all text-sm text-foreground">{supportEmail || "Sin email configurado"}</p>
                    </div>
                    <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4 backdrop-blur-sm">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary/85">Carrito actual</p>
                      <p className="mt-2 text-sm text-foreground">{items.length} ítem{items.length !== 1 ? "s" : ""} · {formatPrice(totalPrice)}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-[linear-gradient(180deg,rgba(10,14,22,0.72),rgba(10,14,22,0.52))] p-4 sm:p-6">
              {sent ? (
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center justify-center gap-4 py-10 sm:py-14">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/12">
                    <CheckCircle className="h-7 w-7 text-primary" />
                  </div>
                  <h3 className="text-lg font-bold text-foreground">Consulta recibida</h3>
                  <p className="text-center text-sm text-muted-foreground">Ya guardamos tu mensaje y el equipo podrá responderlo desde el panel administrativo.</p>
                  <button onClick={() => {
                    setSent(false);
                    setSubmitFeedback({ type: "", message: "" });
                    setForm({ name: "", email: "", subject: "", message: "" });
                  }} className="mt-2 text-sm font-medium text-primary transition hover:text-primary/85">
                    Enviar otro mensaje
                  </button>
                </motion.div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="mb-3 rounded-[24px] border border-white/10 bg-white/[0.03] p-4 sm:mb-4 sm:p-5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
                        <Mail className="h-5 w-5" />
                      </div>
                      <div>
                        <h2 className="text-[1.7rem] font-bold text-foreground sm:text-2xl">Envíanos un correo</h2>
                        <p className="mt-1 text-sm text-muted-foreground">Completá el formulario y guardaremos tu consulta para responderte.</p>
                      </div>
                    </div>
                  </div>

                  {formFields.map(({ key, label, placeholder, icon: Icon, type }) => (
                    <div key={key}>
                      <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">{label}</label>
                      <div className="relative">
                        <Icon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary/55" />
                        <input type={type} placeholder={placeholder} value={form[/** @type {keyof typeof form} */ (key)]} onChange={(event) => setForm((prev) => ({ ...prev, [key]: event.target.value }))} className={contactInputClassName()} />
                      </div>
                    </div>
                  ))}

                  <div>
                    <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Mensaje</label>
                    <div className="relative">
                      <AlignLeft className="absolute left-3 top-3 h-4 w-4 text-primary/55" />
                      <textarea placeholder="Escribe tu mensaje aquí..." rows={5} value={form.message} onChange={(event) => setForm((prev) => ({ ...prev, message: event.target.value }))} className={contactTextareaClassName()} />
                    </div>
                  </div>

                  {submitFeedback.message ? (
                    <div className={`rounded-[22px] border px-4 py-3 text-sm ${submitFeedback.type === "success" ? "border-primary/20 bg-primary/10 text-foreground" : "border-rose-400/25 bg-rose-400/10 text-rose-100"}`}>{submitFeedback.message}</div>
                  ) : (
                    <p className="text-xs leading-5 text-muted-foreground">Al enviar, guardamos tu consulta en nuestro panel para darte seguimiento.</p>
                  )}

                  <button type="submit" disabled={loading} className="group flex h-12 w-full items-center justify-center gap-2 rounded-[22px] bg-primary text-sm font-bold text-primary-foreground shadow-[0_16px_38px_rgba(34,197,94,0.24)] transition hover:bg-primary/90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40">
                    <Send className="h-4 w-4 transition group-hover:translate-x-0.5" />
                    {loading ? "Enviando..." : "Enviar consulta"}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </motion.div>
  );
}