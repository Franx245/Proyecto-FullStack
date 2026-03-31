"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { CheckCircle2, Clock3, XCircle } from "lucide-react";

const RESULT_COPY = {
  success: {
    title: "Pago enviado a validación",
    description: "Mercado Pago terminó el checkout, pero el estado final de la orden siempre lo define el webhook del backend.",
    tone: "border-emerald-400/25 bg-emerald-400/10 text-emerald-100",
    icon: CheckCircle2,
  },
  pending: {
    title: "Pago en procesamiento",
    description: "Mercado Pago informó un estado pendiente o en proceso. Revisá Mis Pedidos para ver cuándo el backend lo confirme, falle o expire.",
    tone: "border-amber-400/25 bg-amber-400/10 text-amber-100",
    icon: Clock3,
  },
  failure: {
    title: "Pago no aprobado",
    description: "El checkout no se aprobó. Si la orden sigue pendiente, podés relanzar el pago desde Mis Pedidos.",
    tone: "border-rose-400/25 bg-rose-400/10 text-rose-100",
    icon: XCircle,
  },
};

export default function CheckoutResultPage({ statusKey, orderId }) {
  const copy = RESULT_COPY[statusKey] || RESULT_COPY.pending;
  const Icon = copy.icon;

  return (
    <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mx-auto max-w-[760px] px-4 py-10">
        <div className="overflow-hidden rounded-[32px] border border-border bg-card/80 p-8 shadow-[0_24px_80px_rgba(0,0,0,0.24)]">
          <div className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] ${copy.tone}`}>
            <Icon className="h-4 w-4" />
            Checkout API
          </div>

          <h1 className="mt-6 text-3xl font-black text-foreground">{copy.title}</h1>
          <p className="mt-4 max-w-2xl text-sm text-muted-foreground">{copy.description}</p>

          {orderId ? (
            <div className="mt-6 rounded-2xl border border-border bg-background/60 p-4 text-sm text-muted-foreground">
              Orden vinculada: <span className="font-semibold text-foreground">#{orderId}</span>
            </div>
          ) : null}

          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/orders" className="inline-flex h-11 items-center justify-center rounded-2xl bg-primary px-5 text-sm font-bold text-primary-foreground">
              Ir a Mis Pedidos
            </Link>
            <Link href="/cart" className="inline-flex h-11 items-center justify-center rounded-2xl border border-border px-5 text-sm font-semibold transition hover:bg-secondary">
              Volver al carrito
            </Link>
          </div>
        </div>
      </motion.section>
  );
}