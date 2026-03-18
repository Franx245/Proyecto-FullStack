export { default as DashboardView } from "./views/DashboardView";
export { default as InventoryView } from "./views/InventoryView";
export { default as AnalyticsView } from "./views/AnalyticsView";
export { default as HomeMerchandisingView } from "./views/HomeMerchandisingView";
export { default as CustomContentView } from "./views/CustomContentView";
export { default as OrdersView } from "./views/OrdersView";              export { default as DashboardView } from "./views/DashboardView";
              export { default as InventoryView } from "./views/InventoryView";
              export { default as AnalyticsView } from "./views/AnalyticsView";
              export { default as HomeMerchandisingView } from "./views/HomeMerchandisingView";
              export { default as CustomContentView } from "./views/CustomContentView";
              export { default as OrdersView } from "./views/OrdersView";
              <option value="">Seleccioná una categoría</option>
              {categoryOptions.map((category) => (
                <option key={category.id} value={category.id}>{category.path}</option>
              ))}
            </select>
          </label>

          <label className="space-y-1.5 text-sm text-slate-300">
            <span>Precio</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={productForm.price}
              onChange={(event) => setProductForm((current) => ({ ...current, price: event.target.value }))}
              className="h-11 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 outline-none transition focus:border-amber-400"
              required
            />
          </label>
        </div>

        <label className="mt-4 block space-y-1.5 text-sm text-slate-300">
          <span>Descripción</span>
          <textarea
            rows={4}
            value={productForm.description}
            onChange={(event) => setProductForm((current) => ({ ...current, description: event.target.value }))}
            className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 outline-none transition focus:border-amber-400"
          />
        </label>

        <label className="mt-4 block space-y-1.5 text-sm text-slate-300">
          <span>Fotos</span>
          <textarea
            rows={5}
            value={productForm.images}
            onChange={(event) => setProductForm((current) => ({ ...current, images: event.target.value }))}
            placeholder={"https://...\nhttps://..."}
            className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 outline-none transition focus:border-amber-400"
          />
        </label>

        <label className="mt-4 flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={productForm.is_visible}
            onChange={(event) => setProductForm((current) => ({ ...current, is_visible: event.target.checked }))}
          />
          Publicación visible en la tienda
        </label>

        {productMutation.error ? (
          <p className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {productMutation.error.message}
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={!canEditCustom || productMutation.isPending || !categories.length}
            className="rounded-2xl bg-amber-500 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-amber-400 disabled:opacity-60"
          >
            {productMutation.isPending ? "Guardando..." : selectedProduct ? "Guardar publicación" : "Crear publicación"}
          </button>
        </div>
      </form>

      <div className="glass rounded-3xl border border-white/10 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Published items</p>
            <h3 className="mt-1 text-lg font-black text-white">Publicaciones cargadas</h3>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300">{products.length} total</span>
            <div className="relative w-full min-w-[220px] sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                value={productSearch}
                onChange={(event) => setProductSearch(event.target.value)}
                placeholder="Buscar publicación o categoría"
                className="h-10 w-full rounded-2xl border border-white/10 bg-slate-950/70 pl-10 pr-4 text-sm outline-none transition focus:border-amber-400"
              />
            </div>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {filteredProducts.length === 0 ? (
            <EmptyState icon={PackageSearch} title="Sin coincidencias" description="Ajustá la búsqueda o creá una publicación nueva." />
          ) : filteredProducts.map((product) => (
            <button
              key={product.id}
              type="button"
              onClick={() => {
                setSelectedProductId(product.id);
                setMobilePanel("products");
              }}
              className={cn(
                "flex w-full items-center gap-4 rounded-2xl border px-4 py-3 text-left transition",
                selectedProductId === product.id ? "border-amber-400/40 bg-amber-400/10" : "border-white/10 bg-slate-950/40 hover:bg-white/[0.05]"
              )}
            >
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-slate-900">
                {product.image ? <img src={product.image} alt={product.title} className="h-full w-full object-cover" /> : null}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate font-semibold text-white">{product.title}</p>
                  <span className={cn("rounded-full px-3 py-1 text-xs font-semibold", product.is_visible ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300")}>
                    {product.is_visible ? "Visible" : "Oculta"}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-400">{product.category ? buildCategoryPath(categoriesById.get(product.category.id), categoriesById) : "Sin categoría"}</p>
              </div>
              <div className="text-right">
                <p className="font-bold text-white">{currency(product.price)}</p>
                <p className="text-xs text-slate-400">{product.images?.length || 0} fotos</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="glass rounded-3xl border border-white/10 p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Custom storefront</p>
            <h2 className="mt-1 text-xl font-black text-white">Categorías y publicaciones custom</h2>
            <p className="mt-2 max-w-3xl text-sm text-slate-400">En mobile se separa por paneles para evitar formularios interminables; en desktop mantenés edición paralela.</p>
          </div>
          {!canEditCustom ? (
            <div className="rounded-2xl border border-sky-400/20 bg-sky-400/10 px-4 py-3 text-sm text-sky-200">
              Solo lectura para cuentas STAFF.
            </div>
          ) : null}
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <StatCard title="Categorías" value={categories.length} />
          <StatCard title="Raíz en header" value={rootCategoryCount} />
          <StatCard title="Visibles" value={visibleCategoryCount} />
          <StatCard title="Publicaciones visibles" value={visibleProductCount} />
        </div>
      </div>

      <div className="xl:hidden">
        <div className="glass rounded-3xl border border-white/10 p-3">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setMobilePanel("categories")}
              className={cn("rounded-2xl px-4 py-3 text-sm font-semibold transition", mobilePanel === "categories" ? "bg-amber-500 text-slate-950" : "bg-white/[0.03] text-slate-300 hover:bg-white/[0.08]")}
            >
              Categorías
            </button>
            <button
              type="button"
              onClick={() => setMobilePanel("products")}
              className={cn("rounded-2xl px-4 py-3 text-sm font-semibold transition", mobilePanel === "products" ? "bg-amber-500 text-slate-950" : "bg-white/[0.03] text-slate-300 hover:bg-white/[0.08]")}
            >
              Publicaciones
            </button>
          </div>
        </div>

        <div className="mt-4">{mobilePanel === "categories" ? categoryEditor : productEditor}</div>
      </div>

      <div className="hidden gap-6 xl:grid xl:grid-cols-2">
        <div>{categoryEditor}</div>
        <div>{productEditor}</div>
      </div>
    </div>
  );
}

export function OrdersView({ orders, onStatusChange, onDeleteOrder, onClearOrders, updatingOrderId, deletingOrderId, isClearingOrders, canCancelOrders, canDeleteOrders }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const deferredSearch = useDeferredValue(search);
  const pageSize = 10;

  const allowedStatuses = canCancelOrders
    ? ["pending", "paid", "shipped", "cancelled"]
    : ["pending", "paid", "shipped"];

  const filteredOrders = useMemo(() => {
    const needle = deferredSearch.trim().toLowerCase();
    return orders.filter((order) => {
      const statusMatches = statusFilter === "all" || order.status === statusFilter;
      return statusMatches && matchesOrderSearch(order, needle);
    });
  }, [deferredSearch, orders, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / pageSize));
  const paginatedOrders = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredOrders.slice(start, start + pageSize);
  }, [filteredOrders, page]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  useEffect(() => {
    setPage((currentPage) => Math.min(currentPage, totalPages));
  }, [totalPages]);

  const pendingCount = orders.filter((order) => order.status === "pending").length;
  const countedCount = orders.filter((order) => order.counts_for_dashboard).length;

  if (orders.length === 0) {
    return <EmptyState icon={ReceiptText} title="No hay pedidos cargados" description="Los pedidos confirmados desde la tienda aparecerán aquí con su estado actual." />;
  }

  return (
    <div className="space-y-4">
      <div className="glass rounded-3xl border border-white/10 p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Control de pedidos</p>
            <h2 className="mt-1 text-xl font-black text-white">Confirmación manual y limpieza</h2>
            <p className="mt-2 text-sm text-slate-400">Ahora podés filtrar, buscar por cliente o producto y trabajar mejor desde mobile con tarjetas de acción.</p>
          </div>
          {canDeleteOrders ? (
            <button
              onClick={() => {
                if (window.confirm("Esto eliminará todos los pedidos y devolverá stock/ventas a su estado anterior. ¿Continuar?")) {
                  onClearOrders();
                }
              }}
              disabled={isClearingOrders}
              className="rounded-2xl bg-rose-500 px-4 py-3 text-sm font-bold text-white transition hover:bg-rose-400 disabled:opacity-60"
            >
              {isClearingOrders ? "Limpiando..." : "Limpiar pedidos de prueba"}
            </button>
          ) : null}
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <StatCard title="Pedidos totales" value={orders.length} />
          <StatCard title="Pendientes" value={pendingCount} tone={pendingCount ? "warn" : "default"} />
          <StatCard title="Contabilizados" value={countedCount} />
          <StatCard title="Resultados" value={filteredOrders.length} />
        </div>

        <div className="mt-4 grid gap-3 rounded-2xl border border-white/10 bg-slate-950/40 p-4 md:grid-cols-[minmax(0,1fr)_220px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por pedido, teléfono o carta"
              className="h-11 w-full rounded-2xl border border-white/10 bg-slate-950/70 pl-10 pr-4 text-sm outline-none transition focus:border-amber-400"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="h-11 rounded-2xl border border-white/10 bg-slate-950/70 px-4 text-sm text-white outline-none transition focus:border-amber-400"
          >
            <option value="all">Todos los estados</option>
            {allowedStatuses.map((status) => (
              <option key={status} value={status}>{orderStatusLabel(status)}</option>
            ))}
          </select>
        </div>
      </div>

      {filteredOrders.length === 0 ? (
        <EmptyState icon={ReceiptText} title="Sin coincidencias" description="Ajustá la búsqueda o el filtro de estado para encontrar el pedido." />
      ) : (
        <div className="space-y-4">
          <div className="space-y-4 lg:hidden">
            {paginatedOrders.map((order) => (
              <div key={order.id} className="glass rounded-3xl border border-white/10 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">Pedido #{order.id}</p>
                    <p className="text-sm text-slate-400">{new Date(order.created_at).toLocaleString("es-AR")}</p>
                  </div>
                  <div className="text-right">
                    <StatusBadge status={order.status} />
                    <p className="mt-2 font-bold text-white">{currency(order.total)}</p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/40 px-3 py-3 text-xs text-slate-300">
                  <span className={cn("rounded-full px-3 py-1 font-semibold", order.counts_for_dashboard ? "bg-emerald-500/15 text-emerald-300" : "bg-slate-500/15 text-slate-300")}>
                    {order.counts_for_dashboard ? "Contabiliza ventas" : "No contabiliza"}
                  </span>
                  {order.customer_phone ? <span>Cliente: {order.customer_phone}</span> : null}
                  <span>{order.items.length} ítems</span>
                </div>

                <div className="mt-4 space-y-3">
                  <label className="space-y-1 text-sm text-slate-300">
                    <span className="block text-xs uppercase tracking-[0.18em] text-slate-500">Estado</span>
                    <select
                      value={order.status}
                      disabled={updatingOrderId === order.id || order.status === "cancelled"}
                      onChange={(event) => onStatusChange(order.id, event.target.value)}
                      className="h-11 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 text-sm font-semibold text-white outline-none transition focus:border-amber-400 disabled:opacity-60"
                    >
                      {allowedStatuses.map((status) => (
                        <option key={status} value={status}>{orderStatusLabel(status)}</option>
                      ))}
                    </select>
                  </label>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <button
                      onClick={() => onStatusChange(order.id, "paid")}
                      disabled={updatingOrderId === order.id || deletingOrderId === order.id || order.status === "paid" || order.status === "shipped" || order.status === "cancelled"}
                      className="rounded-xl bg-sky-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-400 disabled:opacity-50"
                    >
                      Confirmar pago
                    </button>
                    <button
                      onClick={() => onStatusChange(order.id, "shipped")}
                      disabled={updatingOrderId === order.id || deletingOrderId === order.id || order.status === "shipped" || order.status === "cancelled"}
                      className="rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50"
                    >
                      Marcar completado
                    </button>
                    {canCancelOrders ? (
                      <button
                        onClick={() => onStatusChange(order.id, "cancelled")}
                        disabled={updatingOrderId === order.id || deletingOrderId === order.id || order.status === "cancelled"}
                        className="rounded-xl border border-white/10 px-4 py-3 text-sm font-semibold transition hover:bg-white/[0.06] disabled:opacity-50"
                      >
                        Cancelar
                      </button>
                    ) : null}
                    {canDeleteOrders ? (
                      <button
                        onClick={() => {
                          if (window.confirm(`Eliminar el pedido #${order.id} y devolver stock/ventas?`)) {
                            onDeleteOrder(order.id);
                          }
                        }}
                        disabled={updatingOrderId === order.id || deletingOrderId === order.id}
                        className="rounded-xl bg-rose-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-rose-400 disabled:opacity-50"
                      >
                        {deletingOrderId === order.id ? "Eliminando..." : "Eliminar pedido"}
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
                  {order.items.map((item) => (
                    <div key={item.id} className="flex items-center gap-3 rounded-2xl bg-slate-950/50 px-3 py-3">
                      <img src={item.card?.image} alt={item.card?.name} className="h-16 w-12 rounded-lg object-cover" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-white">{item.card?.name || `Card ${item.card_id}`}</p>
                        <p className="text-sm text-slate-400">{item.quantity} x {currency(item.price)}</p>
                      </div>
                      <p className="font-bold text-white">{currency(item.subtotal)}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="hidden space-y-4 lg:block">
            {paginatedOrders.map((order) => (
              <details key={order.id} className="glass rounded-3xl border border-white/10 p-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
                  <div>
                    <p className="font-semibold text-white">Pedido #{order.id}</p>
                    <p className="text-sm text-slate-400">{new Date(order.created_at).toLocaleString("es-AR")}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <StatusBadge status={order.status} />
                    <span className="font-bold text-white">{currency(order.total)}</span>
                  </div>
                </summary>

                <div className="mt-5 space-y-4 border-t border-white/10 pt-5">
                  <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm">
                    <span className="text-slate-400">Dashboard:</span>
                    <span className={cn("rounded-full px-3 py-1 font-semibold", order.counts_for_dashboard ? "bg-emerald-500/15 text-emerald-300" : "bg-slate-500/15 text-slate-300")}>
                      {order.counts_for_dashboard ? "Contabiliza ventas" : "No contabiliza todavía"}
                    </span>
                    {order.customer_phone ? <span className="text-slate-400">Cliente: {order.customer_phone}</span> : null}
                  </div>

                  <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-slate-950/30 p-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Order status</p>
                      <p className="mt-1 text-sm text-slate-300">Actualizá el estado operativo y el sistema ajusta ventas y stock automáticamente cuando corresponde.</p>
                    </div>
                    <select
                      value={order.status}
                      disabled={updatingOrderId === order.id || order.status === "cancelled"}
                      onChange={(event) => onStatusChange(order.id, event.target.value)}
                      className="h-11 rounded-2xl border border-white/10 bg-slate-950/70 px-4 text-sm font-semibold text-white outline-none transition focus:border-amber-400 disabled:opacity-60"
                    >
                      {allowedStatuses.map((status) => (
                        <option key={status} value={status}>{orderStatusLabel(status)}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => onStatusChange(order.id, "paid")}
                      disabled={updatingOrderId === order.id || deletingOrderId === order.id || order.status === "paid" || order.status === "shipped" || order.status === "cancelled"}
                      className="rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-sky-400 disabled:opacity-50"
                    >
                      Confirmar pago
                    </button>
                    <button
                      onClick={() => onStatusChange(order.id, "shipped")}
                      disabled={updatingOrderId === order.id || deletingOrderId === order.id || order.status === "shipped" || order.status === "cancelled"}
                      className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50"
                    >
                      Marcar completado
                    </button>
                    {canCancelOrders ? (
                      <button
                        onClick={() => onStatusChange(order.id, "cancelled")}
                        disabled={updatingOrderId === order.id || deletingOrderId === order.id || order.status === "cancelled"}
                        className="rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold transition hover:bg-white/[0.06] disabled:opacity-50"
                      >
                        Cancelar
                      </button>
                    ) : null}
                    {canDeleteOrders ? (
                      <button
                        onClick={() => {
                          if (window.confirm(`Eliminar el pedido #${order.id} y devolver stock/ventas?`)) {
                            onDeleteOrder(order.id);
                          }
                        }}
                        disabled={updatingOrderId === order.id || deletingOrderId === order.id}
                        className="rounded-xl bg-rose-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-400 disabled:opacity-50"
                      >
                        {deletingOrderId === order.id ? "Eliminando..." : "Eliminar pedido"}
                      </button>
                    ) : null}
                  </div>

                  {order.items.map((item) => (
                    <div key={item.id} className="flex items-center gap-4 rounded-2xl bg-slate-950/50 px-4 py-3">
                      <img src={item.card?.image} alt={item.card?.name} className="h-16 w-12 rounded-lg object-cover" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-white">{item.card?.name || `Card ${item.card_id}`}</p>
                        <p className="text-sm text-slate-400">{item.quantity} x {currency(item.price)}</p>
                      </div>
                      <p className="font-bold text-white">{currency(item.subtotal)}</p>
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>

          <div className="glass overflow-hidden rounded-3xl border border-white/10">
            <PaginationControls page={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        </div>
      )}
    </div>
  );
}