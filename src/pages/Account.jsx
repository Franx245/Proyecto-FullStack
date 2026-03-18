import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { MapPin, Save, Trash2, UserCircle2 } from "lucide-react";
import { toast } from "sonner";
import {
  createMyAddress,
  deleteMyAddress,
  fetchMyAddresses,
  updateMyAddress,
  updateMyProfile,
} from "@/api/store";
import { useAuth } from "@/lib/auth";

function emptyAddress() {
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

function fieldClassName() {
  return "h-11 w-full rounded-2xl border border-border bg-secondary/90 px-4 text-sm outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/20";
}

export default function Account() {
  const queryClient = useQueryClient();
  const { user, isAuthenticated, isBootstrapping, refreshProfile } = useAuth();
  const [profileForm, setProfileForm] = useState({
    full_name: "",
    username: "",
    email: "",
    phone: "",
    avatar_url: "",
  });
  const [addressForm, setAddressForm] = useState(emptyAddress());
  const [editingAddressId, setEditingAddressId] = useState(null);

  useEffect(() => {
    if (user) {
      setProfileForm({
        full_name: user.full_name || "",
        username: user.username || "",
        email: user.email || "",
        phone: user.phone || "",
        avatar_url: user.avatar_url || "",
      });
    }
  }, [user]);

  const addressesQuery = useQuery({
    queryKey: ["my-addresses"],
    queryFn: fetchMyAddresses,
    enabled: isAuthenticated,
  });

  const profileMutation = useMutation({
    mutationFn: updateMyProfile,
    onSuccess: async () => {
      await refreshProfile();
      toast.success("Perfil actualizado");
    },
    onError: (error) => {
      toast.error("No pudimos guardar el perfil", { description: error.message });
    },
  });

  const addressMutation = useMutation({
    mutationFn: ({ addressId, payload }) => (addressId ? updateMyAddress(addressId, payload) : createMyAddress(payload)),
    onSuccess: async () => {
      setAddressForm(emptyAddress());
      setEditingAddressId(null);
      await queryClient.invalidateQueries({ queryKey: ["my-addresses"] });
      toast.success("Dirección guardada");
    },
    onError: (error) => {
      toast.error("No pudimos guardar la dirección", { description: error.message });
    },
  });

  const deleteAddressMutation = useMutation({
    mutationFn: deleteMyAddress,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["my-addresses"] });
      toast.success("Dirección eliminada");
    },
    onError: (error) => {
      toast.error("No pudimos eliminar la dirección", { description: error.message });
    },
  });

  if (isBootstrapping) {
    return (
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        <div className="h-40 animate-pulse rounded-[32px] border border-border bg-card/50" />
        <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="h-[420px] animate-pulse rounded-[32px] border border-border bg-card/50" />
          <div className="h-[420px] animate-pulse rounded-[32px] border border-border bg-card/50" />
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="rounded-[32px] border border-border bg-card/70 p-8 text-center">
          <UserCircle2 className="mx-auto h-12 w-12 text-primary" />
          <h1 className="mt-4 text-3xl font-black">Tu cuenta todavía no está activa</h1>
          <p className="mt-3 text-sm text-muted-foreground">Necesitás iniciar sesión para editar perfil y direcciones de entrega.</p>
          <Link to="/auth?redirect=/account" className="btn-primary mt-6 inline-flex rounded-2xl px-5 py-3">Ingresar ahora</Link>
        </div>
      </div>
    );
  }

  const addresses = addressesQuery.data?.addresses ?? [];
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <section className="rounded-[32px] border border-border bg-card/75 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.2)]">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-center gap-4">
            {user?.avatar_url ? <img src={user.avatar_url} alt={user.full_name} className="h-16 w-16 rounded-3xl object-cover" /> : <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-primary/15 text-xl font-black text-primary">{(user?.full_name || user?.username || "U").charAt(0)}</div>}
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-primary">Mi cuenta</p>
              <h1 className="mt-2 text-3xl font-black">{user?.full_name || user?.username}</h1>
              <p className="text-sm text-muted-foreground">{user?.email} · {user?.role}</p>
            </div>
          </div>
          <div className="rounded-3xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-muted-foreground lg:max-w-sm">
            Desde acá podés actualizar tus datos y administrar tus direcciones de entrega.
          </div>
        </div>

        <form
          className="mt-6 grid gap-4 lg:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            profileMutation.mutate(profileForm);
          }}
        >
          <input required className={fieldClassName()} value={profileForm.full_name} onChange={(event) => setProfileForm((current) => ({ ...current, full_name: event.target.value }))} placeholder="Nombre completo" />
          <input required className={fieldClassName()} value={profileForm.username} onChange={(event) => setProfileForm((current) => ({ ...current, username: event.target.value }))} placeholder="Usuario" />
          <input required type="email" className={fieldClassName()} value={profileForm.email} onChange={(event) => setProfileForm((current) => ({ ...current, email: event.target.value }))} placeholder="Email" />
          <input type="tel" className={fieldClassName()} value={profileForm.phone} onChange={(event) => setProfileForm((current) => ({ ...current, phone: event.target.value }))} placeholder="WhatsApp" />
          <input className="lg:col-span-2 h-11 w-full rounded-2xl border border-border bg-secondary/90 px-4 text-sm outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/20" value={profileForm.avatar_url} onChange={(event) => setProfileForm((current) => ({ ...current, avatar_url: event.target.value }))} placeholder="URL de avatar opcional" />
          <div className="lg:col-span-2 flex flex-wrap gap-3">
            <button disabled={profileMutation.isPending} className="btn-primary inline-flex h-11 items-center gap-2 rounded-2xl px-5">
              <Save className="h-4 w-4" />
              {profileMutation.isPending ? "Guardando perfil..." : "Guardar perfil"}
            </button>
          </div>
        </form>
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-[32px] border border-border bg-card/75 p-6">
          <div className="flex items-center gap-3">
            <MapPin className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-black">Guardar dirección</h2>
          </div>
          <form
            className="mt-5 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              addressMutation.mutate({ addressId: editingAddressId, payload: addressForm });
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <input className={fieldClassName()} value={addressForm.label} onChange={(event) => setAddressForm((current) => ({ ...current, label: event.target.value }))} placeholder="Etiqueta" />
              <input className={fieldClassName()} value={addressForm.recipient_name} onChange={(event) => setAddressForm((current) => ({ ...current, recipient_name: event.target.value }))} placeholder="Recibe" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <input className={fieldClassName()} value={addressForm.phone} onChange={(event) => setAddressForm((current) => ({ ...current, phone: event.target.value }))} placeholder="Teléfono" />
              <select className={fieldClassName()} value={addressForm.zone} onChange={(event) => setAddressForm((current) => ({ ...current, zone: event.target.value }))}>
                <option value="caba">CABA</option>
                <option value="gba">GBA</option>
                <option value="interior">Interior</option>
                <option value="pickup">Retiro</option>
              </select>
            </div>
            <input className={fieldClassName()} value={addressForm.line1} onChange={(event) => setAddressForm((current) => ({ ...current, line1: event.target.value }))} placeholder="Calle y altura" />
            <input className={fieldClassName()} value={addressForm.line2} onChange={(event) => setAddressForm((current) => ({ ...current, line2: event.target.value }))} placeholder="Departamento / piso" />
            <div className="grid gap-4 sm:grid-cols-3">
              <input className={fieldClassName()} value={addressForm.city} onChange={(event) => setAddressForm((current) => ({ ...current, city: event.target.value }))} placeholder="Ciudad" />
              <input className={fieldClassName()} value={addressForm.state} onChange={(event) => setAddressForm((current) => ({ ...current, state: event.target.value }))} placeholder="Provincia" />
              <input className={fieldClassName()} value={addressForm.postal_code} onChange={(event) => setAddressForm((current) => ({ ...current, postal_code: event.target.value }))} placeholder="Código postal" />
            </div>
            <input className={fieldClassName()} value={addressForm.notes} onChange={(event) => setAddressForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Notas de entrega" />
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" checked={addressForm.is_default} onChange={(event) => setAddressForm((current) => ({ ...current, is_default: event.target.checked }))} />
              Usar como dirección predeterminada
            </label>
            <div className="flex flex-wrap gap-3">
              <button disabled={addressMutation.isPending} className="btn-primary h-11 rounded-2xl px-5">{addressMutation.isPending ? "Guardando..." : editingAddressId ? "Actualizar dirección" : "Guardar dirección"}</button>
              {editingAddressId ? <button type="button" onClick={() => { setEditingAddressId(null); setAddressForm(emptyAddress()); }} className="rounded-2xl border border-border px-5 py-3 text-sm font-semibold transition hover:bg-secondary">Cancelar edición</button> : null}
            </div>
          </form>
        </div>

        <div className="rounded-[32px] border border-border bg-card/75 p-6">
          <h2 className="text-xl font-black">Direcciones guardadas</h2>
          <div className="mt-5 space-y-3">
            {addresses.length === 0 ? <p className="text-sm text-muted-foreground">No guardaste direcciones todavía.</p> : addresses.map((address) => (
              <div key={address.id} className="rounded-3xl border border-border bg-background/50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold">{address.label}</p>
                      {address.is_default ? <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Default</span> : null}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{address.recipient_name}</p>
                    <p className="mt-2 text-sm">{[address.line1, address.line2, address.city, address.state].filter(Boolean).join(", ")}</p>
                    <p className="text-xs text-muted-foreground">{address.zone.toUpperCase()} · {address.phone || "sin teléfono"}</p>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => { setEditingAddressId(address.id); setAddressForm({ ...address }); }} className="rounded-xl border border-border px-3 py-2 text-sm font-semibold transition hover:bg-secondary">Editar</button>
                    <button type="button" onClick={() => deleteAddressMutation.mutate(address.id)} className="rounded-xl border border-destructive/30 px-3 py-2 text-sm font-semibold text-destructive transition hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </motion.div>
  );
}