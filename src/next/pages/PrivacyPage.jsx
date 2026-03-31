"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, Ban, Lock, MessageCircle, Phone, Shield } from "lucide-react";

const sections = [
  {
    icon: Phone,
    title: "Uso del número de teléfono",
    content: "Tu número de WhatsApp se utiliza exclusivamente para coordinar y confirmar tu pedido. No se comparte con terceros ni se usa para fines ajenos a la compra.",
  },
  {
    icon: Ban,
    title: "Compromiso de cero spam",
    content: "Solo enviamos comunicaciones relacionadas con el estado del pedido, confirmación de compra o consultas que vos hayas iniciado. Podés pedir que dejemos de contactarte en cualquier momento.",
  },
  {
    icon: Lock,
    title: "Seguridad de datos",
    content: "La información que nos proporcionás se almacena de forma segura y con acceso restringido. Podés solicitar la eliminación de tus datos personales cuando quieras.",
  },
];

export default function PrivacyPage() {
  const router = useRouter();

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="mx-auto max-w-[720px] px-4 py-10">
        <Link href="/cart" className="group mb-8 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
          Volver al carrito
        </Link>

        <div className="mb-10 flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/25 bg-primary/15">
            <Shield className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight">Política de Privacidad</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">Última actualización: marzo 2026</p>
          </div>
        </div>

        <div className="space-y-6">
          {sections.map((section, index) => {
            const Icon = section.icon;
            return (
              <motion.div key={section.title} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.08 }} className="rounded-2xl border border-border bg-card p-6">
                <div className="mb-3 flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10">
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                  <h2 className="text-base font-bold">{section.title}</h2>
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">{section.content}</p>
              </motion.div>
            );
          })}
        </div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }} className="mt-8 text-center">
          <p className="mb-4 text-sm text-muted-foreground">¿Tenés alguna consulta sobre tu privacidad?</p>
          <button onClick={() => router.push("/contact")} className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/85 active:scale-[0.98]">
            <MessageCircle className="h-4 w-4" />
            Contactar Soporte
          </button>
        </motion.div>
      </motion.div>
  );
}