export function cn(...classes) {
  return classes.filter(Boolean).join(" ");
}

export function currency(value) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value || 0);
}

export function formatDay(value) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
  });
}

export function orderStatusLabel(status) {
  return status.toUpperCase();
}

export function cardStatusLabel(card) {
  if (card.status === "out_of_stock") return "Out of stock";
  if (card.status === "low_stock") return "Low stock";
  return "In stock";
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
  pending: "border-slate-400/20 bg-slate-400/10 text-slate-200",
  paid: "border-sky-400/20 bg-sky-400/10 text-sky-300",
  shipped: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300",
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
    default: "border-white/10 bg-white/[0.04]",
    warn: "border-amber-400/30 bg-amber-400/10",
    danger: "border-rose-500/30 bg-rose-500/10",
  }[tone];

  return (
    <div className={cn("rounded-3xl border p-5 transition hover:-translate-y-0.5", toneClass)}>
      <p className="text-xs uppercase tracking-[0.24em] text-slate-400">{title}</p>
      <p className="mt-3 text-3xl font-black text-white">{value}</p>
    </div>
  );
}

export function StatusBadge({ status }) {
  return (
    <span className={cn("inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em]", STATUS_STYLES[status] || STATUS_STYLES.pending)}>
      {orderStatusLabel(status)}
    </span>
  );
}

export function PaginationControls({ page, totalPages, onPageChange }) {
  if (totalPages <= 1) {
    return null;
  }

  return (
    <div className="flex items-center justify-center gap-2 border-t border-white/5 px-4 py-4">
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
    order.customer_phone || "",
    order.status || "",
    ...(order.items || []).flatMap((item) => [item.card?.name || "", String(item.card_id || "")]),
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(needle);
}