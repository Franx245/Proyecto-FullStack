import { useState } from 'react';
import { useCart } from '@/lib/cartStore';
import { motion } from 'framer-motion';
import { MessageCircle, Send, User, Mail, Tag, AlignLeft, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

/**
 * @param {{ quantity: number, name: string, price: number }[]} items
 * @param {number} totalPrice
 */
function buildWhatsAppCartMessage(items, totalPrice) {
  if (!items.length) return encodeURIComponent('¡Hola! Quisiera consultar sobre sus cartas.');
  const lines = items.map((i) => `• ${i.quantity}x ${i.name} — $${(i.price * i.quantity).toFixed(2)}`);
  return encodeURIComponent(
    `🎴 *DuelVault – Consulta de carrito*\n\n${lines.join('\n')}\n\n*Total: $${totalPrice.toFixed(2)}*\n\n¿Podés confirmar disponibilidad?`
  );
}

export default function Contact() {
  const { items, totalPrice } = useCart();
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' });
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  /** @type {{ key: "name" | "email" | "subject", label: string, placeholder: string, icon: typeof User, type: string }[]} */
  const formFields = [
    { key: 'name', label: 'Nombre', placeholder: 'Tu nombre', icon: User, type: 'text' },
    { key: 'email', label: 'Email', placeholder: 'tu@email.com', icon: Mail, type: 'email' },
    { key: 'subject', label: 'Asunto', placeholder: 'Consulta sobre pedido', icon: Tag, type: 'text' },
  ];

  const canSubmit = form.name && form.email && form.subject && form.message;

  /** @param {React.FormEvent<HTMLFormElement>} e */
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    await new Promise((r) => setTimeout(r, 1200));
    setSent(true);
    setLoading(false);
    toast.success('¡Mensaje enviado!', { description: 'Te responderemos a la brevedad.' });
  };

  const handleWhatsApp = () => {
    const msg = buildWhatsAppCartMessage(items, totalPrice);
    window.open(`https://wa.me/?text=${msg}`, '_blank');
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="max-w-[1000px] mx-auto px-4 py-10"
    >
      <h1 className="text-3xl font-black tracking-tight mb-2">Contacto</h1>
      <p className="text-sm text-muted-foreground mb-8">Estamos para ayudarte. Escribinos o envianos tu carrito por WhatsApp.</p>

      <div className="grid md:grid-cols-[300px_1fr] gap-6 items-start">
        {/* Left: QR + WhatsApp */}
        <div className="space-y-4">
          {/* QR Card */}
          <div className="bg-card border border-border rounded-2xl p-6 flex flex-col items-center gap-4">
            <div className="w-40 h-40 rounded-xl bg-white p-2 flex items-center justify-center">
              {/* QR placeholder — real QR for wa.me */}
              <svg viewBox="0 0 100 100" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
                <rect width="100" height="100" fill="white"/>
                {/* Finder patterns */}
                <rect x="5" y="5" width="30" height="30" fill="black"/>
                <rect x="8" y="8" width="24" height="24" fill="white"/>
                <rect x="12" y="12" width="16" height="16" fill="black"/>
                <rect x="65" y="5" width="30" height="30" fill="black"/>
                <rect x="68" y="8" width="24" height="24" fill="white"/>
                <rect x="72" y="12" width="16" height="16" fill="black"/>
                <rect x="5" y="65" width="30" height="30" fill="black"/>
                <rect x="8" y="68" width="24" height="24" fill="white"/>
                <rect x="12" y="72" width="16" height="16" fill="black"/>
                {/* Data dots */}
                {[40,45,50,55,60].map(x => [40,45,50,55,60].map(y => (
                  Math.random() > 0.5 && <rect key={`${x}-${y}`} x={x} y={y} width="4" height="4" fill="black"/>
                )))}
                <rect x="40" y="40" width="4" height="4" fill="black"/>
                <rect x="50" y="40" width="4" height="4" fill="black"/>
                <rect x="60" y="40" width="4" height="4" fill="black"/>
                <rect x="40" y="50" width="4" height="4" fill="black"/>
                <rect x="55" y="50" width="4" height="4" fill="black"/>
                <rect x="40" y="60" width="4" height="4" fill="black"/>
                <rect x="45" y="60" width="4" height="4" fill="black"/>
                <rect x="60" y="60" width="4" height="4" fill="black"/>
                <rect x="45" y="45" width="4" height="4" fill="black"/>
                <rect x="60" y="45" width="4" height="4" fill="black"/>
                <rect x="50" y="55" width="4" height="4" fill="black"/>
              </svg>
            </div>
            <p className="text-xs text-muted-foreground text-center">Escaneá para contactarnos por WhatsApp</p>
          </div>

          {/* WhatsApp button */}
          <button
            onClick={handleWhatsApp}
            className="w-full flex items-center justify-center gap-2 h-11 rounded-xl bg-[#25D366] text-white font-semibold text-sm hover:bg-[#1ebe5d] active:scale-[0.98] transition-all"
          >
            <MessageCircle className="w-4 h-4" />
            Enviar carrito por WhatsApp
          </button>

          {items.length > 0 && (
            <p className="text-xs text-muted-foreground text-center">{items.length} ítem{items.length !== 1 ? 's' : ''} · Total: <span className="text-primary font-semibold">${totalPrice.toFixed(2)}</span></p>
          )}
        </div>

        {/* Right: Contact Form */}
        <div className="bg-card border border-border rounded-2xl p-6">
          {sent ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center justify-center py-12 gap-4"
            >
              <div className="w-14 h-14 rounded-full bg-primary/15 flex items-center justify-center">
                <CheckCircle className="w-7 h-7 text-primary" />
              </div>
              <h3 className="font-bold text-lg">¡Mensaje enviado!</h3>
              <p className="text-sm text-muted-foreground text-center">Te responderemos lo antes posible.</p>
              <button
                onClick={() => { setSent(false); setForm({ name: '', email: '', subject: '', message: '' }); }}
                className="mt-2 text-sm text-primary hover:underline"
              >
                Enviar otro mensaje
              </button>
            </motion.div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <h2 className="font-bold text-lg mb-4">Envianos un mensaje</h2>

              {formFields.map(({ key, label, placeholder, icon: Icon, type }) => (
                <div key={key}>
                  <label className="text-xs text-muted-foreground mb-1.5 block">{label}</label>
                  <div className="relative">
                    <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                    <input
                      type={type}
                      placeholder={placeholder}
                      value={form[key]}
                      onChange={e => setForm(prev => ({ ...prev, [key]: e.target.value }))}
                      className="w-full h-10 pl-9 pr-3 rounded-lg bg-secondary border border-border text-sm focus:outline-none focus:ring-1 focus:ring-primary/50 transition-all"
                    />
                  </div>
                </div>
              ))}

              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Mensaje</label>
                <div className="relative">
                  <AlignLeft className="absolute left-3 top-3 w-4 h-4 text-muted-foreground/50" />
                  <textarea
                    placeholder="Escribí tu consulta..."
                    rows={4}
                    value={form.message}
                    onChange={e => setForm(prev => ({ ...prev, message: e.target.value }))}
                    className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-secondary border border-border text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary/50 transition-all"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={!canSubmit || loading}
                className="w-full h-11 rounded-xl bg-primary text-primary-foreground font-bold text-sm flex items-center justify-center gap-2 hover:bg-primary/85 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                    </svg>
                    Enviando...
                  </span>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Enviar mensaje
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </motion.div>
  );
}