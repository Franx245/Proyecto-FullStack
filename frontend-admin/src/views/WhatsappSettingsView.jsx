import { useEffect, useMemo, useState } from "react";
import { Clock3, Mail, Phone, Reply, UserRound } from "lucide-react";
import { ActionStatusButton } from "./shared";

function formatDateTime(value) {
  if (!value) {
    return "Sin fecha";
  }

  return new Date(value).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusLabel(status) {
  const labels = {
    new: "Nueva",
    in_progress: "En proceso",
    responded: "Respondida",
    archived: "Archivada",
  };

  return labels[status] || status;
}

function statusClassName(status) {
  const styles = {
    new: "border-emerald-400/25 bg-emerald-400/10 text-emerald-200",
    in_progress: "border-sky-400/25 bg-sky-400/10 text-sky-200",
    responded: "border-amber-400/25 bg-amber-400/10 text-amber-200",
    archived: "border-slate-400/20 bg-slate-400/10 text-slate-300",
  };

  return styles[status] || styles.new;
}

export default function WhatsappSettingsView({ settings, contactRequests, contactRequestsSummary, canEditWhatsapp, settingsMutation, updateContactRequestStatusMutation, whatsappSavedToken }) {
  const [supportWhatsappNumber, setSupportWhatsappNumber] = useState("");
  const [supportEmail, setSupportEmail] = useState("");
  const [contactDrafts, setContactDrafts] = useState({});
  const [copyFeedback, setCopyFeedback] = useState("");
  const orderedContactRequests = useMemo(() => Array.isArray(contactRequests) ? contactRequests : [], [contactRequests]);

  useEffect(() => {
    setSupportWhatsappNumber(settings?.support_whatsapp_number || "");
    setSupportEmail(settings?.support_email || "");
  }, [settings?.support_whatsapp_number, settings?.support_email]);

  useEffect(() => {
    setContactDrafts((currentDrafts) => {
      const nextDrafts = {};

      for (const contactRequest of orderedContactRequests) {
        nextDrafts[contactRequest.id] = currentDrafts[contactRequest.id] || {
          admin_notes: contactRequest.admin_notes || "",
          response_message: contactRequest.response_message || "",
        };
      }

      return nextDrafts;
    });
  }, [orderedContactRequests]);

  const handleContactDraftChange = (contactRequestId, field, value) => {
    setContactDrafts((currentDrafts) => ({
      ...currentDrafts,
      [contactRequestId]: {
        ...(currentDrafts[contactRequestId] || { admin_notes: "", response_message: "" }),
        [field]: value,
      },
    }));
  };

  const handleCopy = async (value, successLabel) => {
    if (!value) {
      return;
    }

    try {
      await window.navigator.clipboard?.writeText(value);
      setCopyFeedback(successLabel);
    } catch {
      setCopyFeedback("No se pudo copiar al portapapeles");
    }
  };

  useEffect(() => {
    if (!copyFeedback) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setCopyFeedback("");
    }, 1800);

    return () => window.clearTimeout(timeoutId);
  }, [copyFeedback]);

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <section className="glass rounded-3xl border border-white/10 p-6">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Canal de soporte</p>
          <h2 className="mt-2 text-2xl font-black text-white">Contacto de tienda</h2>
          <p className="mt-3 text-sm text-slate-400">
            Estos datos se usan en el footer de la tienda y en los flujos de contacto públicos.
          </p>
          <div className="mt-6 grid gap-3">
            <div className="inline-flex items-center gap-3 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
              <Phone className="h-4 w-4" />
              Número activo: {settings?.support_whatsapp_number || "sin configurar"}
            </div>
            <div className="inline-flex items-center gap-3 rounded-2xl border border-sky-400/20 bg-sky-400/10 px-4 py-3 text-sm text-sky-200">
              <Mail className="h-4 w-4" />
              Email activo: {settings?.support_email || "sin configurar"}
            </div>
          </div>
          <div className="mt-6 grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Consultas nuevas</p>
              <p className="mt-2 text-3xl font-black text-white">{contactRequestsSummary?.new || 0}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Respondidas</p>
              <p className="mt-2 text-3xl font-black text-white">{contactRequestsSummary?.responded || 0}</p>
            </div>
          </div>
        </section>

        <form
          className="glass rounded-3xl border border-white/10 p-6"
          onSubmit={(event) => {
            event.preventDefault();
            settingsMutation.mutate({
              support_whatsapp_number: supportWhatsappNumber,
              support_email: supportEmail,
            });
          }}
        >
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Configuración editable</p>
          <h3 className="mt-2 text-xl font-black text-white">Datos de recepción</h3>

          <label className="mt-6 block space-y-2 text-sm text-slate-300">
            <span>WhatsApp de soporte</span>
            <input
              value={supportWhatsappNumber}
              onChange={(event) => setSupportWhatsappNumber(event.target.value)}
              placeholder="5491122334455"
              className="h-11 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 outline-none transition focus:border-amber-400"
            />
          </label>

          <label className="mt-4 block space-y-2 text-sm text-slate-300">
            <span>Email de soporte</span>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                type="email"
                value={supportEmail}
                onChange={(event) => setSupportEmail(event.target.value)}
                placeholder="soporte@duelvault.com"
                className="h-11 w-full rounded-2xl border border-white/10 bg-slate-950/70 pl-11 pr-4 outline-none transition focus:border-amber-400"
              />
            </div>
          </label>

          <p className="mt-3 text-xs text-slate-500">
            Guardá el número con código de país. Este email también se usará como referencia del canal de respuesta en las consultas guardadas.
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
              idleLabel="Guardar contacto"
              pendingLabel="Guardando..."
              successLabel="Contacto actualizado"
              className="bg-amber-500 font-bold text-slate-950 hover:bg-amber-400"
            />
            {!canEditWhatsapp ? <span className="self-center text-sm text-slate-500">Tu cuenta STAFF puede ver la configuración, pero no editarla.</span> : null}
          </div>
        </form>
      </div>

      <section className="glass rounded-3xl border border-white/10 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Inbox</p>
            <h3 className="mt-2 text-2xl font-black text-white">Consultas recibidas</h3>
            <p className="mt-2 text-sm text-slate-400">Cada envío del formulario público queda guardado acá para seguimiento real.</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-300">
            Total: <span className="font-bold text-white">{contactRequestsSummary?.total || 0}</span>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          {updateContactRequestStatusMutation.error ? (
            <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {updateContactRequestStatusMutation.error.message}
            </div>
          ) : null}
          {copyFeedback ? (
            <div className="rounded-2xl border border-sky-400/20 bg-sky-400/10 px-4 py-3 text-sm text-sky-200">
              {copyFeedback}
            </div>
          ) : null}
          {orderedContactRequests.length ? orderedContactRequests.map((contactRequest) => {
            const isMutating = updateContactRequestStatusMutation.isPending && updateContactRequestStatusMutation.variables?.contactRequestId === contactRequest.id;
            const contactDraft = contactDrafts[contactRequest.id] || {
              admin_notes: contactRequest.admin_notes || "",
              response_message: contactRequest.response_message || "",
            };
            return (
              <article key={contactRequest.id} className="admin-list-card admin-content-auto rounded-3xl border border-white/10 bg-slate-950/35 p-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <h4 className="text-lg font-bold text-white">{contactRequest.subject}</h4>
                      <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] ${statusClassName(contactRequest.status)}`}>
                        {statusLabel(contactRequest.status)}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-4 text-sm text-slate-300">
                      <span className="inline-flex items-center gap-2"><UserRound className="h-4 w-4 text-slate-500" />{contactRequest.name}</span>
                      <span className="inline-flex items-center gap-2"><Mail className="h-4 w-4 text-slate-500" />{contactRequest.email}</span>
                      <span className="inline-flex items-center gap-2"><Clock3 className="h-4 w-4 text-slate-500" />{formatDateTime(contactRequest.created_at)}</span>
                    </div>

                    <p className="max-w-4xl whitespace-pre-wrap text-sm leading-6 text-slate-300">{contactRequest.message}</p>

                    <div className="grid gap-3 xl:grid-cols-2">
                      <label className="block">
                        <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Notas internas</span>
                        <textarea
                          value={contactDraft.admin_notes}
                          onChange={(event) => handleContactDraftChange(contactRequest.id, "admin_notes", event.target.value)}
                          rows={4}
                          placeholder="Contexto interno, prioridad, siguiente paso..."
                          className="w-full resize-none rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-200 outline-none transition focus:border-sky-400/35"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Respuesta preparada</span>
                        <textarea
                          value={contactDraft.response_message}
                          onChange={(event) => handleContactDraftChange(contactRequest.id, "response_message", event.target.value)}
                          rows={4}
                          placeholder="Respuesta lista para enviar por email o WhatsApp..."
                          className="w-full resize-none rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-200 outline-none transition focus:border-amber-400/35"
                        />
                      </label>
                    </div>

                    {contactRequest.responded_by ? (
                      <p className="text-xs text-slate-500">
                        Respondida por {contactRequest.responded_by.full_name || contactRequest.responded_by.email} el {formatDateTime(contactRequest.responded_at)}.
                      </p>
                    ) : null}
                  </div>

                  <div className="grid w-full gap-2 sm:grid-cols-2 xl:flex xl:w-auto xl:max-w-[260px] xl:flex-wrap xl:justify-end">
                    <ActionStatusButton
                      onClick={() => updateContactRequestStatusMutation.mutate({
                        contactRequestId: contactRequest.id,
                        expectedUpdatedAt: contactRequest.updated_at,
                        admin_notes: contactDraft.admin_notes,
                        response_message: contactDraft.response_message,
                      })}
                      pending={isMutating}
                      disabled={updateContactRequestStatusMutation.isPending}
                      idleLabel="Guardar seguimiento"
                      pendingLabel="Guardando..."
                      className="border border-white/10 bg-white/[0.03] text-slate-200 hover:bg-white/[0.08]"
                    />
                    <ActionStatusButton
                      onClick={() => updateContactRequestStatusMutation.mutate({
                        contactRequestId: contactRequest.id,
                        expectedUpdatedAt: contactRequest.updated_at,
                        status: "IN_PROGRESS",
                        admin_notes: contactDraft.admin_notes,
                        response_message: contactDraft.response_message,
                      })}
                      pending={isMutating}
                      disabled={updateContactRequestStatusMutation.isPending || contactRequest.status === "in_progress"}
                      idleLabel="Tomar"
                      pendingLabel="Actualizando..."
                      className="border border-sky-400/25 bg-sky-400/10 text-sky-200 hover:bg-sky-400/20"
                    />
                    <ActionStatusButton
                      onClick={() => updateContactRequestStatusMutation.mutate({
                        contactRequestId: contactRequest.id,
                        expectedUpdatedAt: contactRequest.updated_at,
                        status: "RESPONDED",
                        admin_notes: contactDraft.admin_notes,
                        response_message: contactDraft.response_message,
                      })}
                      pending={isMutating}
                      disabled={updateContactRequestStatusMutation.isPending || contactRequest.status === "responded"}
                      idleLabel="Marcar respondida"
                      pendingLabel="Actualizando..."
                      successLabel="Respondida"
                      className="border border-amber-400/25 bg-amber-400/12 text-amber-200 hover:bg-amber-400/20"
                    />
                    <ActionStatusButton
                      onClick={() => updateContactRequestStatusMutation.mutate({
                        contactRequestId: contactRequest.id,
                        expectedUpdatedAt: contactRequest.updated_at,
                        status: "ARCHIVED",
                        admin_notes: contactDraft.admin_notes,
                        response_message: contactDraft.response_message,
                      })}
                      pending={isMutating}
                      disabled={updateContactRequestStatusMutation.isPending || contactRequest.status === "archived"}
                      idleLabel="Archivar"
                      pendingLabel="Actualizando..."
                      className="border border-slate-400/20 bg-slate-400/10 text-slate-300 hover:bg-slate-400/20"
                    />
                    <button
                      type="button"
                      onClick={() => void handleCopy(contactRequest.email, "Email copiado")}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.06]"
                    >
                      <Reply className="h-4 w-4" />
                      Copiar email
                    </button>
                    {contactDraft.response_message ? (
                      <button
                        type="button"
                        onClick={() => void handleCopy(contactDraft.response_message, "Respuesta copiada")}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.06]"
                      >
                        <Reply className="h-4 w-4" />
                        Copiar respuesta
                      </button>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          }) : (
            <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.03] px-6 py-12 text-center text-sm text-slate-400">
              Todavía no hay consultas guardadas.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
