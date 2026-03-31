import { motion } from 'framer-motion';
import { Shield, Phone, Ban, Lock, ArrowLeft, MessageCircle } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

const sections = [
  {
    icon: Phone,
    title: 'Uso del número de teléfono',
    content: 'Tu número de WhatsApp es utilizado exclusivamente para coordinar y confirmar tu pedido. Nunca será compartido con terceros, vendido a empresas publicitarias ni utilizado para ningún fin que no sea la comunicación directa relacionada con tu compra en DuelVault.',
  },
  {
    icon: Ban,
    title: 'Compromiso de cero spam',
    content: 'Nos comprometemos a no enviarte mensajes no solicitados. Solo recibirás comunicaciones relacionadas con el estado de tu pedido, confirmación de compra o consultas que vos hayas iniciado. Podés solicitar que dejemos de contactarte en cualquier momento.',
  },
  {
    icon: Lock,
    title: 'Seguridad de datos',
    content: 'Toda la información que nos proporcionás se almacena de forma segura y con acceso restringido. Utilizamos las mejores prácticas de la industria para proteger tus datos personales. Podés solicitar la eliminación de tus datos en cualquier momento contactándonos.',
  },
];

export default function Privacy() {
  const navigate = useNavigate();

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="max-w-[720px] mx-auto px-4 py-10"
    >
      <Link to="/cart" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors group">
        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
        Volver al carrito
      </Link>

      {/* Header */}
      <div className="flex items-center gap-4 mb-10">
        <div className="w-12 h-12 rounded-2xl bg-primary/15 border border-primary/25 flex items-center justify-center">
          <Shield className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-black tracking-tight">Política de Privacidad</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Última actualización: marzo 2026</p>
        </div>
      </div>

      {/* Sections */}
      <div className="space-y-6">
        {sections.map((s, i) => {
          const Icon = s.icon;
          return (
            <motion.div
              key={s.title}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              className="bg-card border border-border rounded-2xl p-6"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Icon className="w-4 h-4 text-primary" />
                </div>
                <h2 className="font-bold text-base">{s.title}</h2>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">{s.content}</p>
            </motion.div>
          );
        })}
      </div>

      {/* CTA */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.35 }}
        className="mt-8 text-center"
      >
        <p className="text-sm text-muted-foreground mb-4">¿Tenés alguna consulta sobre tu privacidad?</p>
        <button
          onClick={() => navigate('/contact')}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/85 active:scale-[0.98] transition-all"
        >
          <MessageCircle className="w-4 h-4" />
          Contactar Soporte
        </button>
      </motion.div>
    </motion.div>
  );
}