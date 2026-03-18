import { Suspense, lazy, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  BarChart3,
  Boxes,
  LogOut,
  PackageSearch,
  ReceiptText,
  ShieldAlert,
  Star,
  TrendingUp,
} from "lucide-react";
import {
  clearStoredSession,
  createCustomCategory,
  createCustomProduct,
  getCards,
  getCustomCategories,
  getCustomProducts,
  clearOrders,
  deleteOrder,
  getDashboard,
  getOrders,
  getStoredSession,
  loginAdmin,
  updateCustomCategory,
  updateCustomProduct,
  updateCard,
  updateCardsBulk,
  updateOrderStatus,
} from "./lib/api";

const DashboardView = lazy(() => import("./views/DashboardView"));
const InventoryView = lazy(() => import("./views/InventoryView"));
const AnalyticsView = lazy(() => import("./views/AnalyticsView"));
const HomeMerchandisingView = lazy(() => import("./views/HomeMerchandisingView"));
const CustomContentView = lazy(() => import("./views/CustomContentView"));
const OrdersView = lazy(() => import("./views/OrdersView"));

const sections = [
  { key: "dashboard", label: "Dashboard", icon: BarChart3 },
  { key: "inventory", label: "Inventario", icon: Boxes },
  { key: "home", label: "Home", icon: Star },
  { key: "custom", label: "Custom", icon: PackageSearch },
  { key: "analytics", label: "Analytics", icon: TrendingUp },
  { key: "orders", label: "Pedidos", icon: ReceiptText },
];

const SECTION_REQUIREMENTS = {
  dashboard: { dashboard: true },
  analytics: { dashboard: true },
  inventory: { dashboard: true, cards: true },
  home: { dashboard: true, cards: true },
  orders: { dashboard: true, orders: true },
  custom: { dashboard: true, custom: true },
};

function cn(...classes) {
  return classes.filter(Boolean).join(" ");
}

function SkeletonBlock({ className = "h-20" }) {
  return <div className={cn("animate-pulse rounded-3xl border border-white/5 bg-white/[0.04]", className)} />;
}

function SectionNav({ section, onSectionChange, className = "" }) {
  return (
    <nav className={className}>
      {sections.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          onClick={() => onSectionChange(key)}
          className={cn(
            "flex items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold transition",
            section === key ? "bg-amber-500 text-slate-950" : "bg-white/[0.03] text-slate-300 hover:bg-white/[0.08]"
          )}
        >
          <Icon className="h-4 w-4 shrink-0" />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}

function LoginScreen({ onLoggedIn }) {
  const [email, setEmail] = useState("admin");
  const [password, setPassword] = useState("admin");
  const [error, setError] = useState("");

  const loginMutation = useMutation({
    mutationFn: loginAdmin,
    onSuccess: (session) => {
      setError("");
      onLoggedIn(session);
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="glass w-full max-w-md rounded-3xl border border-white/10 p-8 shadow-glow">
        <div className="mb-8">
          <p className="inline-flex items-center gap-2 rounded-full border border-ember/30 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">
            <ShieldAlert className="h-3.5 w-3.5" />
            DuelVault Admin
          </p>
          <h1 className="mt-5 text-3xl font-black text-white">Panel de control</h1>
          <p className="mt-2 text-sm text-slate-300">Acceso con roles y refresh automático de sesión.</p>
        </div>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            loginMutation.mutate({ email, password });
          }}
        >
          <div>
            <label className="mb-1.5 block text-sm text-slate-300">Usuario o email</label>
            <input
              className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm text-slate-300">Password</label>
            <input
              type="password"
              className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-xs text-slate-400">
            <p>ADMIN por defecto: admin / admin</p>
            <p className="mt-1">ADMIN alternativo: admin@test.com / admin123</p>
            <p className="mt-1">STAFF: staff@test.com / staff123</p>
          </div>

          {error ? (
            <p className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={loginMutation.isPending}
            className="w-full rounded-2xl bg-amber-500 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-amber-400 disabled:opacity-60"
          >
            {loginMutation.isPending ? "Ingresando..." : "Ingresar"}
          </button>
        </form>
      </div>
    </div>
  );
}

function AdminLoadingShell() {
  return (
    <div className="min-h-screen px-4 py-4 md:px-6">
      <div className="mx-auto grid max-w-[1600px] gap-6 lg:grid-cols-[260px_1fr]">
        <SkeletonBlock className="h-[720px] rounded-[32px]" />
        <div className="space-y-6">
          <SkeletonBlock className="h-32 rounded-[32px]" />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {Array.from({ length: 5 }).map((_, index) => <SkeletonBlock key={index} className="h-32" />)}
          </div>
          <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <SkeletonBlock className="h-[420px]" />
            <SkeletonBlock className="h-[420px]" />
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, tone = "default" }) {
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

function AdminShell({ session, onLogout }) {
  const [section, setSection] = useState("dashboard");
  const queryClient = useQueryClient();
  const [savingCardId, setSavingCardId] = useState(null);
  const [isBulkSaving, setIsBulkSaving] = useState(false);
  const [updatingOrderId, setUpdatingOrderId] = useState(null);
  const [deletingOrderId, setDeletingOrderId] = useState(null);
  const [isClearingOrders, setIsClearingOrders] = useState(false);

  const sectionRequirements = SECTION_REQUIREMENTS[section] || SECTION_REQUIREMENTS.dashboard;

  const dashboardQuery = useQuery({ queryKey: ["dashboard", session.admin.id], queryFn: getDashboard, staleTime: 1000 * 30, enabled: Boolean(sectionRequirements.dashboard) });
  const cardsQuery = useQuery({ queryKey: ["cards", session.admin.id], queryFn: getCards, staleTime: 1000 * 30, enabled: Boolean(sectionRequirements.cards) });
  const ordersQuery = useQuery({ queryKey: ["orders", session.admin.id], queryFn: getOrders, staleTime: 1000 * 15, enabled: Boolean(sectionRequirements.orders) });
  const customCategoriesQuery = useQuery({ queryKey: ["custom-categories", session.admin.id], queryFn: getCustomCategories, staleTime: 1000 * 30, enabled: Boolean(sectionRequirements.custom) });
  const customProductsQuery = useQuery({ queryKey: ["custom-products", session.admin.id], queryFn: getCustomProducts, staleTime: 1000 * 30, enabled: Boolean(sectionRequirements.custom) });

  const updateCardMutation = useMutation({
    mutationFn: ({ cardId, updates }) => updateCard(cardId, updates),
    onMutate: ({ cardId }) => setSavingCardId(cardId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["cards", session.admin.id] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard", session.admin.id] }),
      ]);
    },
    onSettled: () => setSavingCardId(null),
  });

  const bulkUpdateCardsMutation = useMutation({
    mutationFn: ({ ids, updates }) => updateCardsBulk(ids, updates),
    onMutate: () => setIsBulkSaving(true),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["cards", session.admin.id] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard", session.admin.id] }),
      ]);
    },
    onSettled: () => setIsBulkSaving(false),
  });

  const updateOrderMutation = useMutation({
    mutationFn: ({ orderId, status }) => updateOrderStatus(orderId, status),
    onMutate: ({ orderId }) => setUpdatingOrderId(orderId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["orders", session.admin.id] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard", session.admin.id] }),
        queryClient.invalidateQueries({ queryKey: ["cards", session.admin.id] }),
      ]);
    },
    onSettled: () => setUpdatingOrderId(null),
  });

  const deleteOrderMutation = useMutation({
    mutationFn: deleteOrder,
    onMutate: (orderId) => setDeletingOrderId(orderId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["orders", session.admin.id] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard", session.admin.id] }),
        queryClient.invalidateQueries({ queryKey: ["cards", session.admin.id] }),
      ]);
    },
    onSettled: () => setDeletingOrderId(null),
  });

  const clearOrdersMutation = useMutation({
    mutationFn: clearOrders,
    onMutate: () => setIsClearingOrders(true),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["orders", session.admin.id] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard", session.admin.id] }),
        queryClient.invalidateQueries({ queryKey: ["cards", session.admin.id] }),
      ]);
    },
    onSettled: () => setIsClearingOrders(false),
  });

  const categoryMutation = useMutation({
    mutationFn: ({ mode, categoryId, payload }) => (mode === "update" ? updateCustomCategory(categoryId, payload) : createCustomCategory(payload)),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["custom-categories", session.admin.id] }),
        queryClient.invalidateQueries({ queryKey: ["custom-products", session.admin.id] }),
      ]);
    },
  });

  const productMutation = useMutation({
    mutationFn: ({ mode, productId, payload }) => (mode === "update" ? updateCustomProduct(productId, payload) : createCustomProduct(payload)),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["custom-products", session.admin.id] }),
        queryClient.invalidateQueries({ queryKey: ["custom-categories", session.admin.id] }),
      ]);
    },
  });

  const loading = dashboardQuery.isLoading || cardsQuery.isLoading || ordersQuery.isLoading || customCategoriesQuery.isLoading || customProductsQuery.isLoading;
  const error = dashboardQuery.error || cardsQuery.error || ordersQuery.error || customCategoriesQuery.error || customProductsQuery.error;

  if (loading) {
    return <AdminLoadingShell />;
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="glass rounded-3xl border border-red-500/30 p-8 text-center">
          <p className="text-lg font-semibold text-red-200">{error.message}</p>
        </div>
      </div>
    );
  }

  const dashboard = dashboardQuery.data;
  const cards = cardsQuery.data?.cards || [];
  const orders = ordersQuery.data?.orders || [];
  const customCategories = customCategoriesQuery.data?.categories || [];
  const customCategoryTree = customCategoriesQuery.data?.tree || [];
  const customProducts = customProductsQuery.data?.products || [];
  const isAdmin = session.admin.role === "ADMIN";
  const renderSection = () => {
    if (section === "dashboard") {
      return <DashboardView dashboard={dashboard} />;
    }

    if (section === "inventory") {
      return (
        <InventoryView
          cards={cards}
          savingCardId={savingCardId}
          isBulkSaving={isBulkSaving}
          canEditInventory={isAdmin}
          onBulkUpdate={(ids, updates) => bulkUpdateCardsMutation.mutate({ ids, updates })}
          onSave={(cardId, draft) => updateCardMutation.mutate({
            cardId,
            updates: {
              price: Number(draft.price),
              stock: Number(draft.stock),
              low_stock_threshold: Number(draft.low_stock_threshold),
              is_visible: Boolean(draft.is_visible),
              is_featured: Boolean(draft.is_featured),
            },
          })}
        />
      );
    }

    if (section === "home") {
      return (
        <HomeMerchandisingView
          cards={cards}
          savingCardId={savingCardId}
          isBulkSaving={isBulkSaving}
          canEditHome={isAdmin}
          onBulkUpdate={(ids, updates) => bulkUpdateCardsMutation.mutate({ ids, updates })}
          onSave={(cardId, draft) => updateCardMutation.mutate({
            cardId,
            updates: {
              is_featured: Boolean(draft.is_featured),
              is_new_arrival: Boolean(draft.is_new_arrival),
            },
          })}
        />
      );
    }

    if (section === "custom") {
      return (
        <CustomContentView
          categories={customCategories}
          categoryTree={customCategoryTree}
          products={customProducts}
          categoryMutation={categoryMutation}
          productMutation={productMutation}
          canEditCustom={isAdmin}
        />
      );
    }

    if (section === "analytics") {
      return <AnalyticsView analytics={dashboard.analytics} topSellingCards={dashboard.topSellingCards} />;
    }

    if (section === "orders") {
      return (
        <OrdersView
          orders={orders}
          updatingOrderId={updatingOrderId}
          deletingOrderId={deletingOrderId}
          isClearingOrders={isClearingOrders}
          canCancelOrders={isAdmin}
          canDeleteOrders={isAdmin}
          onClearOrders={() => clearOrdersMutation.mutate()}
          onDeleteOrder={(orderId) => deleteOrderMutation.mutate(orderId)}
          onStatusChange={(orderId, status) => updateOrderMutation.mutate({ orderId, status })}
        />
      );
    }

    return null;
  };

  return (
    <div className="min-h-screen px-4 py-4 md:px-6">
      <div className="mx-auto grid max-w-[1600px] gap-6 lg:grid-cols-[260px_1fr]">
        <aside className="hidden glass rounded-[32px] border border-white/10 p-5 lg:block">
          <div className="mb-8">
            <p className="text-xs uppercase tracking-[0.24em] text-amber-300">DuelVault</p>
            <h1 className="mt-3 text-2xl font-black text-white">Admin Suite</h1>
            <p className="mt-2 text-sm text-slate-400">Inventario, alertas y métricas con sesión renovable.</p>
          </div>

          <div className="mb-6 rounded-3xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-300">
            <p className="font-semibold text-white">{session.admin.email}</p>
            <p className="mt-1 inline-flex rounded-full border border-white/10 px-3 py-1 text-[11px] font-bold tracking-[0.2em] text-amber-300">{session.admin.role}</p>
          </div>

          <SectionNav section={section} onSectionChange={setSection} className="space-y-2" />

          <div className="mt-8 rounded-3xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm text-amber-100">
            <p className="font-semibold">Alertas</p>
            <p className="mt-2">Low stock: {dashboard.metrics.lowStockCount}</p>
            <p>Out of stock: {dashboard.metrics.outOfStockCount}</p>
          </div>

          <button
            onClick={onLogout}
            className="mt-8 flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.06]"
          >
            <LogOut className="h-4 w-4" />
            Cerrar sesión
          </button>
        </aside>

        <main className="space-y-6">
          <div className="glass rounded-[28px] border border-white/10 p-4 lg:hidden">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-amber-300">DuelVault</p>
                <h1 className="mt-2 text-2xl font-black text-white">Admin Suite</h1>
                <p className="mt-1 text-sm text-slate-400">{session.admin.email}</p>
              </div>
              <button
                onClick={onLogout}
                className="flex items-center gap-2 rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.06]"
              >
                <LogOut className="h-4 w-4" />
                Salir
              </button>
            </div>
            <div className="mt-4 flex gap-3 overflow-x-auto pb-1 admin-scroll-row">
              <SectionNav section={section} onSectionChange={setSection} className="flex min-w-max gap-2" />
            </div>
          </div>

          <header className="glass rounded-[32px] border border-white/10 p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Local system</p>
                <h2 className="mt-2 text-3xl font-black text-white">Marketplace operativo</h2>
              </div>
              <div className="flex items-center gap-3 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-sm font-semibold text-emerald-300">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                API + SQLite activos
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:hidden">
              <StatCard title="Low stock" value={dashboard.metrics.lowStockCount} tone="warn" />
              <StatCard title="Out of stock" value={dashboard.metrics.outOfStockCount} tone="danger" />
            </div>
            {!isAdmin ? (
              <div className="mt-4 flex items-start gap-3 rounded-2xl border border-sky-400/20 bg-sky-400/10 px-4 py-3 text-sm text-sky-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                Tu cuenta STAFF tiene acceso de consulta y actualización operativa de pedidos, pero no puede hacer ediciones críticas de inventario ni cancelaciones.
              </div>
            ) : null}
          </header>

          <Suspense fallback={<AdminLoadingShell />}>
            {renderSection()}
          </Suspense>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(() => getStoredSession());

  if (!session) {
    return <LoginScreen onLoggedIn={setSession} />;
  }

  return (
    <AdminShell
      session={session}
      onLogout={() => {
        clearStoredSession();
        setSession(null);
      }}
    />
  );
}
