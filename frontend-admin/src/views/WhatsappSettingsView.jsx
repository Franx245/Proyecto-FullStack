import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { ActionStatusButton } from "./shared";

export default function WhatsappSettingsView({ settings, canEditWhatsapp, settingsMutation, whatsappSavedToken }) {
  const [supportWhatsappNumber, setSupportWhatsappNumber] = useState("");

  useEffect(() => {
    setSupportWhatsappNumber(settings?.support_whatsapp_number || "");
  }, [settings?.support_whatsapp_number]);

  return (
    <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
      <section className="glass rounded-3xl border border-white/10 p-6">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Canal de soporte</p>
        <h2 className="mt-2 text-2xl font-black text-white">WhatsApp</h2>
        <p className="mt-3 text-sm text-slate-400">
          Este número se usa en las consultas de pedidos y en la pantalla de contacto de la tienda.
        </p>
        <div className="mt-6 inline-flex items-center gap-3 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
          <MessageCircle className="h-4 w-4" />
          Número activo: {settings?.support_whatsapp_number || "sin configurar"}
        </div>
      </section>

      <form
        className="glass rounded-3xl border border-white/10 p-6"
        onSubmit={(event) => {
          event.preventDefault();
          settingsMutation.mutate({ support_whatsapp_number: supportWhatsappNumber });
        }}
      >
        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Configuración editable</p>
        <h3 className="mt-2 text-xl font-black text-white">Número de recepción</h3>

        <label className="mt-6 block space-y-2 text-sm text-slate-300">
          <span>WhatsApp de soporte</span>
          <input
            value={supportWhatsappNumber}
            onChange={(event) => setSupportWhatsappNumber(event.target.value)}
            placeholder="5491122334455"
            className="h-11 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 outline-none transition focus:border-amber-400"
          />
        </label>

        <p className="mt-3 text-xs text-slate-500">
          Guardalo con código de país. Se normalizan automáticamente espacios, guiones y símbolos.
        </p>

        {settingsMutation.error ? (
          <p className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {settingsMutation.error.message}
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-3">
          <ActionStatusButton
            type="submit"
            disabled={!canEditWhatsapp}
            pending={settingsMutation.isPending}
            success={Boolean(whatsappSavedToken)}
            idleLabel="Guardar número"
            pendingLabel="Guardando..."
            successLabel="Número actualizado"
            className="bg-amber-500 font-bold text-slate-950 hover:bg-amber-400"
          />
          {!canEditWhatsapp ? <span className="self-center text-sm text-slate-500">Tu cuenta STAFF puede ver la configuración, pero no editarla.</span> : null}
        </div>
      </form>
    </div>
  );
}