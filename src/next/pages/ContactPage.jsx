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
    `DuelVault - Consulta de carrito\n\n${lines.join("\n")}\n\nTotal: ${formatPrice(totalPrice)}\n\n¿Podés confirmar disponibilidad?`
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
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="mx-auto max-w-[1120px] px-4 py-6 sm:px-5 sm:py-8 lg:px-6 lg:py-9">
        <div className="mb-5 sm:mb-6">
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-200">
            Soporte DuelVault
          </span>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-[2.2rem]">Contacto</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400 sm:text-[15px]">Elegí el canal más rápido para cerrar tu compra o enviarnos una consulta.</p>
        </div>

        <div className="overflow-hidden rounded-[28px] border border-emerald-500/15 bg-[linear-gradient(135deg,rgba(3,14,12,0.98),rgba(8,25,20,0.99))] shadow-[0_24px_80px_rgba(16,185,129,0.14),0_0_70px_rgba(16,185,129,0.08)]">
          <div className="grid lg:grid-cols-[0.94fr_1.06fr]">
            <div className="border-b border-emerald-500/10 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.24),transparent_48%),linear-gradient(180deg,rgba(3,14,12,0.96),rgba(5,18,15,1))] p-4 sm:p-6 lg:border-b-0 lg:border-r lg:border-emerald-500/10">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-400/10 text-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.2)]">
                  <Phone className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-[1.7rem] font-bold text-white sm:text-2xl">Contacto Rápido</h2>
                  <p className="mt-1 text-sm leading-6 text-slate-400">Escaneá el código QR o abrí WhatsApp con tu carrito actual.</p>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:mt-5 sm:gap-4">
                <div className="rounded-3xl border border-emerald-400/10 bg-emerald-950/20 p-4 backdrop-blur-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300/80">WhatsApp activo</p>
                      <p className="mt-2 text-[15px] font-semibold text-white sm:text-base">{formatPhoneDisplay(supportWhatsappNumber)}</p>
                    </div>
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-400/10 text-emerald-300">
                      <QrCode className="h-5 w-5" />
                    </div>
                  </div>
                </div>

                <div className="mx-auto flex h-44 w-44 items-center justify-center overflow-hidden rounded-[28px] border border-emerald-100/40 bg-white shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_0_34px_rgba(16,185,129,0.16)] sm:h-[220px] sm:w-[220px]">
                  {qrCodeUrl ? (
                    <img src={qrCodeUrl} alt="QR para enviar el carrito por WhatsApp" className="h-full w-full object-contain" loading="lazy" />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center border border-slate-200 bg-slate-100 px-4 text-center text-sm text-slate-500">
                      <QrCode className="mb-3 h-8 w-8" />
                      {supportWhatsappNumber ? (qrCodeError ? "No pudimos generar el QR. Probá abrir WhatsApp desde el botón." : "Generando QR...") : "Configurá el número desde admin para generar el QR."}
                    </div>
                  )}
                </div>

                <button onClick={handleWhatsApp} className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#08b23f] px-4 text-sm font-bold text-white shadow-[0_16px_35px_rgba(8,178,63,0.28)] transition hover:bg-[#079739] hover:shadow-[0_16px_45px_rgba(8,178,63,0.35)] active:scale-[0.99]">
                  <MessageCircle className="h-4 w-4" />
                  Enviar carrito por WhatsApp
                </button>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-emerald-400/10 bg-white/[0.03] p-4 backdrop-blur-sm">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-300/80">Email soporte</p>
                    <p className="mt-2 break-all text-sm text-slate-200">{supportEmail || "Sin email configurado"}</p>
                  </div>
                  <div className="rounded-2xl border border-emerald-400/10 bg-white/[0.03] p-4 backdrop-blur-sm">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-300/80">Carrito actual</p>
                    <p className="mt-2 text-sm text-slate-200">{items.length} ítem{items.length !== 1 ? "s" : ""} · {formatPrice(totalPrice)}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-[radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.16),transparent_56%),linear-gradient(180deg,rgba(7,20,17,0.99),rgba(6,16,14,1))] p-4 sm:p-6">
              {sent ? (
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center justify-center gap-4 py-10">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-400/15 shadow-[0_0_30px_rgba(16,185,129,0.25)]">
                    <CheckCircle className="h-7 w-7 text-emerald-300" />
                  </div>
                  <h3 className="text-lg font-bold text-white">Consulta recibida</h3>
                  <p className="text-center text-sm text-slate-400">Ya guardamos tu mensaje y el equipo podrá responderlo desde el panel administrativo.</p>
                  <button onClick={() => {
                    setSent(false);
                    setSubmitFeedback({ type: "", message: "" });
                    setForm({ name: "", email: "", subject: "", message: "" });
                  }} className="mt-2 text-sm font-medium text-emerald-300 transition hover:text-emerald-200">
                    Enviar otro mensaje
                  </button>
                </motion.div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="mb-3 sm:mb-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-emerald-300/25 bg-emerald-300/12 text-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.2)]">
                        <Mail className="h-5 w-5" />
                      </div>
                      <div>
                        <h2 className="text-[1.7rem] font-bold text-white sm:text-2xl">Envíanos un Correo</h2>
                        <p className="mt-1 text-sm text-slate-400">Completá el formulario y guardaremos tu consulta para que el equipo la responda.</p>
                      </div>
                    </div>
                  </div>

                  {formFields.map(({ key, label, placeholder, icon: Icon, type }) => (
                    <div key={key}>
                      <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-emerald-100/85">{label}</label>
                      <div className="relative">
                        <Icon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-400/50" />
                        <input type={type} placeholder={placeholder} value={form[/** @type {keyof typeof form} */ (key)]} onChange={(event) => setForm((prev) => ({ ...prev, [key]: event.target.value }))} className="h-11 w-full rounded-2xl border border-emerald-500/20 bg-emerald-950/30 pl-10 pr-4 text-sm text-slate-100 placeholder:text-slate-500 transition focus:border-emerald-400/45 focus:outline-none focus:ring-4 focus:ring-emerald-400/10 focus:shadow-[0_0_20px_rgba(16,185,129,0.14)]" />
                      </div>
                    </div>
                  ))}

                  <div>
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-emerald-100/85">Mensaje</label>
                    <div className="relative">
                      <AlignLeft className="absolute left-3 top-3 h-4 w-4 text-emerald-400/50" />
                      <textarea placeholder="Escribe tu mensaje aquí..." rows={4} value={form.message} onChange={(event) => setForm((prev) => ({ ...prev, message: event.target.value }))} className="w-full resize-none rounded-2xl border border-emerald-500/20 bg-emerald-950/30 py-3 pl-10 pr-4 text-sm text-slate-100 placeholder:text-slate-500 transition focus:border-emerald-400/45 focus:outline-none focus:ring-4 focus:ring-emerald-400/10 focus:shadow-[0_0_20px_rgba(16,185,129,0.14)]" />
                    </div>
                  </div>

                  {submitFeedback.message ? (
                    <div className={`rounded-2xl border px-4 py-3 text-sm ${submitFeedback.type === "success" ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-100" : "border-rose-400/25 bg-rose-400/10 text-rose-100"}`}>{submitFeedback.message}</div>
                  ) : (
                    <p className="text-xs text-slate-500">Al enviar, guardamos tu consulta en nuestro panel para darte seguimiento.</p>
                  )}

                  <button type="submit" disabled={loading} className="group flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 text-sm font-bold text-slate-950 shadow-[0_16px_40px_rgba(16,185,129,0.28)] transition hover:bg-emerald-400 hover:shadow-[0_16px_50px_rgba(16,185,129,0.38)] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40">
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