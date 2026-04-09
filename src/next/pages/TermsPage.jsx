"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, BadgeCheck, CreditCard, FileText, PackageCheck, Scale } from "lucide-react";

const sections = [
  {
    icon: FileText,
    title: "Aceptación del servicio",
    content: "Al navegar, registrarte o confirmar una compra aceptás estas condiciones y las políticas publicadas en RareHunter. Si no estás de acuerdo, no completes el checkout.",
  },
  {
    icon: CreditCard,
    title: "Pagos y validación",
    content: "Los pagos se validan contra el backend y la confirmación final depende del webhook de Mercado Pago. Un intento aprobado por el checkout puede quedar pendiente hasta que llegue la confirmación definitiva.",
  },
  {
    icon: PackageCheck,
    title: "Stock y reservas",
    content: "El stock se reserva al crear la orden. Si el pago vence, falla o la orden expira, la reserva puede liberarse automáticamente según el estado interno del pedido.",
  },
  {
    icon: Scale,
    title: "Uso correcto de la cuenta",
    content: "Cada usuario es responsable por la veracidad de sus datos, el uso de sus credenciales y el seguimiento de sus pedidos. Nos reservamos el derecho de bloquear cuentas ante abuso, fraude o comportamiento malicioso.",
  },
];

export default function TermsPage() {
  return (
    <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mx-auto max-w-[860px] px-4 py-10">
        <Link href="/cart" className="group mb-8 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
          Volver al carrito
        </Link>

        <div className="rounded-[32px] border border-border bg-card/80 p-8 shadow-[0_24px_80px_rgba(0,0,0,0.24)]">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-primary">
            <BadgeCheck className="h-4 w-4" />
            Términos vigentes
          </div>

          <h1 className="mt-5 text-3xl font-black">Términos y Condiciones</h1>
          <p className="mt-3 max-w-2xl text-sm text-muted-foreground">Estas reglas ordenan el uso de la tienda, las reservas de stock y la confirmación de pagos dentro del flujo actual de RareHunter.</p>

          <div className="mt-8 space-y-5">
            {sections.map((section) => {
              const Icon = section.icon;
              return (
                <div key={section.title} className="rounded-2xl border border-border bg-background/60 p-5">
                  <div className="mb-3 flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <h2 className="font-bold text-foreground">{section.title}</h2>
                  </div>
                  <p className="text-sm leading-6 text-muted-foreground">{section.content}</p>
                </div>
              );
            })}
          </div>
        </div>
      </motion.section>
  );
}