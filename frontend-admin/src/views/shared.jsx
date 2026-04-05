import { Check, LoaderCircle } from "lucide-react";

export function cn(...classes) {
  return classes.filter(Boolean).join(" ");
}

const ADMIN_CARD_IMAGE_VARIANTS = {
  thumb: {
    width: 120,
    sizes: "(max-width: 1024px) 56px, 48px",
  },
  detail: {
    width: 240,
    sizes: "80px",
  },
};

const DEFAULT_CLOUDINARY_CLOUD_NAME = "dafftkonl";

function normalizeCloudinaryCloudName(value) {
  return String(value || "").trim().replace(/^['\"]|['\"]$/g, "");
}

function getCloudinaryCloudName() {
  return normalizeCloudinaryCloudName(import.meta.env.VITE_CLOUDINARY_CLOUD_NAME) || DEFAULT_CLOUDINARY_CLOUD_NAME;
}

export function buildAdminCloudinaryUrl(sourceUrl, variant = "thumb") {
  const normalizedSource = typeof sourceUrl === "string" ? sourceUrl.trim() : "";
  const cloudName = getCloudinaryCloudName();

  if (!normalizedSource || !cloudName || normalizedSource.includes("res.cloudinary.com/")) {
    return normalizedSource;
  }

  const selectedVariant = ADMIN_CARD_IMAGE_VARIANTS[variant] || ADMIN_CARD_IMAGE_VARIANTS.thumb;
  const transformations = [`w_${selectedVariant.width}`, "q_auto", "f_auto", "dpr_auto"].join(",");
  return `https://res.cloudinary.com/${cloudName}/image/fetch/${transformations}/${normalizedSource}`;
}

export function getAdminCardImageProps(imageUrl, options = {}) {
  const rawSrc = imageUrl || "";
  const variant = options.variant === "detail" ? "detail" : "thumb";

  if (!rawSrc) {
    return {
      src: rawSrc,
      loading: "lazy",
      decoding: "async",
    };
  }

  const smallSrc = rawSrc.includes("/images/cards/")
    ? rawSrc.replace("/images/cards/", "/images/cards_small/")
    : rawSrc;
  const highResSrc = smallSrc.includes("/images/cards_small/")
    ? smallSrc.replace("/images/cards_small/", "/images/cards/")
    : rawSrc;
  const selectedVariant = ADMIN_CARD_IMAGE_VARIANTS[variant] || ADMIN_CARD_IMAGE_VARIANTS.thumb;
  const sourceUrl = variant === "detail" ? highResSrc : smallSrc;
  const optimizedSrc = buildAdminCloudinaryUrl(sourceUrl, variant);

  return {
    src: optimizedSrc || sourceUrl,
    sizes: selectedVariant.sizes,
    loading: "lazy",
    decoding: "async",
  };
}

export function currency(value, currencyCode = "ARS") {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) {
    return "-";
  }

  try {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: String(currencyCode || "ARS").toUpperCase(),
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${String(currencyCode || "ARS").toUpperCase()}`;
  }
}

export function formatDay(value) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
  });
}

export function orderStatusLabel(status) {
  const labels = {
    pending_payment: "Pendiente de pago",
    failed: "Pago rechazado",
    expired: "Pago expirado",
    paid: "Pagado",
    shipped: "Enviado",
    completed: "Completado",
    cancelled: "Cancelado",
  };

  return labels[status] || String(status || "").toUpperCase();
}

export function cardStatusLabel(card) {
  if (card.status === "out_of_stock") return "Agotada";
  if (card.status === "low_stock") return "Stock bajo";
  return "Disponible";
}

export function userRoleLabel(role) {
  const labels = {
    USER: "Cliente",
    STAFF: "Equipo",
    ADMIN: "Administrador",
  };

  return labels[role] || String(role || "").toUpperCase();
}

export function createEmptyCategoryForm() {
  return {
    name: "",
    slug: "",
    description: "",
    image: "",
    sort_order: "0",
    parent_id: "",
    is_visible: true,
  };
}

export function createEmptyProductForm() {
  return {
    title: "",
    slug: "",
    description: "",
    price: "",
    category_id: "",
    images: "",
    is_visible: true,
  };
}

export function buildCategoryPath(category, categoriesById) {
  const segments = [];
  const visited = new Set();
  let current = category;

  while (current && !visited.has(current.id)) {
    segments.unshift(current.name);
    visited.add(current.id);
    current = current.parent_id ? categoriesById.get(current.parent_id) : null;
  }

  return segments.join(" / ");
}

export function canUseAsParent(candidateId, selectedCategoryId, categoriesById) {
  if (!selectedCategoryId) {
    return true;
  }

  if (candidateId === selectedCategoryId) {
    return false;
  }

  let current = categoriesById.get(candidateId);
  const visited = new Set();

  while (current && current.parent_id && !visited.has(current.id)) {
    if (current.parent_id === selectedCategoryId) {
      return false;
    }

    visited.add(current.id);
    current = categoriesById.get(current.parent_id);
  }

  return true;
}

const STATUS_STYLES = {
  pending_payment: "border-slate-400/20 bg-slate-400/10 text-slate-200",
  failed: "border-rose-400/20 bg-rose-500/10 text-rose-300",
  expired: "border-amber-400/20 bg-amber-500/10 text-amber-300",
  paid: "border-sky-400/20 bg-sky-400/10 text-sky-300",
  shipped: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300",
  completed: "border-amber-400/20 bg-amber-400/10 text-amber-300",
  cancelled: "border-rose-400/20 bg-rose-400/10 text-rose-300",
};

export function EmptyState({ icon: Icon, title, description }) {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center rounded-3xl border border-dashed border-white/10 bg-white/[0.03] px-6 py-10 text-center">
      <div className="mb-4 rounded-2xl bg-white/[0.06] p-4 text-slate-300">
        <Icon className="h-7 w-7" />
      </div>
      <p className="text-lg font-bold text-white">{title}</p>
      <p className="mt-2 max-w-md text-sm text-slate-400">{description}</p>
    </div>
  );
}

export function StatCard({ title, value, tone = "default" }) {
  const toneClass = {
    default: "border-amber-200/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.9),rgba(10,14,32,0.94))]",
    warn: "border-amber-400/40 bg-[linear-gradient(180deg,rgba(84,45,8,0.5),rgba(20,15,11,0.95))]",
    danger: "border-rose-500/35 bg-[linear-gradient(180deg,rgba(74,16,35,0.52),rgba(21,10,22,0.95))]",
  }[tone];

  return (
    <div className={cn("min-h-[172px] rounded-[30px] border p-5 transition shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]", toneClass)}>
      <p className="max-w-[18ch] text-[11px] uppercase tracking-[0.34em] text-slate-300 whitespace-normal break-words leading-snug">{title}</p>
      <p className="mt-4 break-words text-[clamp(2rem,2vw,3.15rem)] font-black leading-[0.95] text-white [text-wrap:balance] [font-variant-numeric:tabular-nums]">{value}</p>
    </div>
  );
}

export function StatusBadge({ status }) {
  return (
    <span className={cn("inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em]", STATUS_STYLES[status] || STATUS_STYLES.pending_payment)}>
      {orderStatusLabel(status)}
    </span>
  );
}

export function PaginationControls({ page, totalPages, onPageChange }) {
  if (totalPages <= 1) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-2 border-t border-white/5 px-4 py-4">
      <button
        onClick={() => onPageChange(Math.max(1, page - 1))}
        disabled={page === 1}
        className="rounded-xl border border-white/10 px-3 py-2 text-sm transition hover:bg-white/[0.06] disabled:opacity-40"
      >
        ←
      </button>
      <span className="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-300">Página {page} / {totalPages}</span>
      <button
        onClick={() => onPageChange(Math.min(totalPages, page + 1))}
        disabled={page >= totalPages}
        className="rounded-xl border border-white/10 px-3 py-2 text-sm transition hover:bg-white/[0.06] disabled:opacity-40"
      >
        →
      </button>
    </div>
  );
}

export function filterCategoryTree(nodes, needle, categoriesById) {
  if (!needle) {
    return nodes;
  }

  return nodes.reduce((accumulator, node) => {
    const path = buildCategoryPath(categoriesById.get(node.id) || node, categoriesById).toLowerCase();
    const children = filterCategoryTree(node.children || [], needle, categoriesById);
    const matches = [node.name, node.slug, node.description || "", path]
      .some((value) => value.toLowerCase().includes(needle));

    if (matches || children.length) {
      accumulator.push({ ...node, children });
    }

    return accumulator;
  }, []);
}

export function matchesOrderSearch(order, needle) {
  if (!needle) {
    return true;
  }

  const haystack = [
    String(order.id),
    order.customer_name || "",
    order.customer_email || "",
    order.customer_phone || "",
    order.shipping_address || "",
    order.shipping_city || "",
    order.status || "",
    ...(order.items || []).flatMap((item) => [item.card?.name || "", String(item.card_id || "")]),
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(needle);
}

export function ActionStatusButton({
  idleLabel,
  pendingLabel,
  successLabel = "Completado",
  pending = false,
  success = false,
  disabled = false,
  className = "",
  type = "button",
  onClick,
}) {
  const isDisabled = disabled || pending;
  const content = pending
    ? { label: pendingLabel, icon: <LoaderCircle className="h-4 w-4 animate-spin" /> }
    : success
      ? { label: successLabel, icon: <Check className="h-4 w-4" /> }
      : { label: idleLabel, icon: null };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={isDisabled}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition duration-200",
        success && !pending ? "scale-[1.02] ring-2 ring-emerald-300/25" : "",
        className,
        isDisabled ? "opacity-60" : ""
      )}
    >
      {content.icon}
      <span>{content.label}</span>
    </button>
  );
}

export function ConfirmActionDialog({
  open,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  tone = "danger",
  pending = false,
  onConfirm,
  onCancel,
}) {
  if (!open) {
    return null;
  }

  const confirmClassName = tone === "danger"
    ? "bg-rose-500 text-white hover:bg-rose-400"
    : "bg-amber-500 text-slate-950 hover:bg-amber-400";

  return (
    <>
      <button
        type="button"
        aria-label="Cerrar diálogo"
        onClick={pending ? undefined : onCancel}
        className="fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-sm"
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
        <div className="glass w-full max-w-md rounded-[30px] border border-white/10 p-6 shadow-2xl">
          <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Confirmación</p>
          <h3 className="mt-2 text-xl font-black text-white">{title}</h3>
          <p className="mt-3 text-sm leading-6 text-slate-300">{description}</p>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onCancel}
              disabled={pending}
              className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.06] disabled:opacity-50"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={pending}
              className={cn("rounded-2xl px-4 py-3 text-sm font-bold transition disabled:opacity-50", confirmClassName)}
            >
              {pending ? "Procesando..." : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}