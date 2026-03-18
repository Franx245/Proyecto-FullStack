import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { Boxes, PackageSearch, Search } from "lucide-react";
import {
  EmptyState,
  StatCard,
  buildCategoryPath,
  canUseAsParent,
  cn,
  createEmptyCategoryForm,
  createEmptyProductForm,
  currency,
  filterCategoryTree,
} from "./shared";

export default function CustomContentView({
  categories,
  categoryTree,
  products,
  categoryMutation,
  productMutation,
  canEditCustom,
}) {
  const [selectedCategoryId, setSelectedCategoryId] = useState(null);
  const [selectedProductId, setSelectedProductId] = useState(null);
  const [mobilePanel, setMobilePanel] = useState("categories");
  const [categorySearch, setCategorySearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [categoryForm, setCategoryForm] = useState(() => createEmptyCategoryForm());
  const [productForm, setProductForm] = useState(() => createEmptyProductForm());

  const deferredCategorySearch = useDeferredValue(categorySearch);
  const deferredProductSearch = useDeferredValue(productSearch);

  const categoriesById = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories]);

  const selectedCategory = useMemo(
    () => categories.find((category) => category.id === selectedCategoryId) || null,
    [categories, selectedCategoryId]
  );

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === selectedProductId) || null,
    [products, selectedProductId]
  );

  const categoryOptions = useMemo(() => {
    return categories.map((category) => ({
      ...category,
      path: buildCategoryPath(category, categoriesById),
    }));
  }, [categories, categoriesById]);

  const filteredCategoryTree = useMemo(() => {
    const needle = deferredCategorySearch.trim().toLowerCase();
    return filterCategoryTree(categoryTree, needle, categoriesById);
  }, [categoriesById, categoryTree, deferredCategorySearch]);

  const filteredProducts = useMemo(() => {
    const needle = deferredProductSearch.trim().toLowerCase();
    if (!needle) {
      return products;
    }

    return products.filter((product) => {
      const categoryPath = product.category ? buildCategoryPath(categoriesById.get(product.category.id), categoriesById) : "";
      return [product.title, product.slug, product.description || "", categoryPath]
        .some((value) => value.toLowerCase().includes(needle));
    });
  }, [categoriesById, deferredProductSearch, products]);

  const categoryProductCount = useMemo(() => {
    return products.reduce((accumulator, product) => {
      const categoryId = product.category?.id;
      if (!categoryId) {
        return accumulator;
      }

      accumulator.set(categoryId, (accumulator.get(categoryId) || 0) + 1);
      return accumulator;
    }, new Map());
  }, [products]);

  const visibleCategoryCount = categories.filter((category) => category.is_visible).length;
  const visibleProductCount = products.filter((product) => product.is_visible).length;
  const rootCategoryCount = categories.filter((category) => !category.parent_id).length;

  useEffect(() => {
    if (!selectedCategory) {
      setCategoryForm(createEmptyCategoryForm());
      return;
    }

    setCategoryForm({
      name: selectedCategory.name,
      slug: selectedCategory.slug,
      description: selectedCategory.description || "",
      image: selectedCategory.image || "",
      sort_order: String(selectedCategory.sort_order ?? 0),
      parent_id: selectedCategory.parent_id ? String(selectedCategory.parent_id) : "",
      is_visible: Boolean(selectedCategory.is_visible),
    });
  }, [selectedCategory]);

  useEffect(() => {
    if (!selectedProduct) {
      setProductForm(createEmptyProductForm());
      return;
    }

    setProductForm({
      title: selectedProduct.title,
      slug: selectedProduct.slug,
      description: selectedProduct.description || "",
      price: String(selectedProduct.price ?? ""),
      category_id: selectedProduct.category?.id ? String(selectedProduct.category.id) : "",
      images: (selectedProduct.images || []).map((image) => image.url).join("\n"),
      is_visible: Boolean(selectedProduct.is_visible),
    });
  }, [selectedProduct]);

  const submitCategory = useCallback((event) => {
    event.preventDefault();

    const payload = {
      name: categoryForm.name,
      slug: categoryForm.slug,
      description: categoryForm.description,
      image: categoryForm.image,
      sort_order: Number(categoryForm.sort_order || 0),
      parent_id: categoryForm.parent_id ? Number(categoryForm.parent_id) : null,
      is_visible: Boolean(categoryForm.is_visible),
    };

    categoryMutation.mutate(
      selectedCategory
        ? { mode: "update", categoryId: selectedCategory.id, payload }
        : { mode: "create", payload },
      {
        onSuccess: () => {
          if (!selectedCategory) {
            setCategoryForm(createEmptyCategoryForm());
          }
        },
      }
    );
  }, [categoryForm, categoryMutation, selectedCategory]);

  const submitProduct = useCallback((event) => {
    event.preventDefault();

    const payload = {
      title: productForm.title,
      slug: productForm.slug,
      description: productForm.description,
      price: Number(productForm.price || 0),
      category_id: Number(productForm.category_id),
      images: productForm.images
        .split(/\r?\n/)
        .map((image) => image.trim())
        .filter(Boolean),
      is_visible: Boolean(productForm.is_visible),
    };

    productMutation.mutate(
      selectedProduct
        ? { mode: "update", productId: selectedProduct.id, payload }
        : { mode: "create", payload },
      {
        onSuccess: () => {
          if (!selectedProduct) {
            setProductForm(createEmptyProductForm());
          }
        },
      }
    );
  }, [productForm, productMutation, selectedProduct]);

  const renderCategoryTree = useCallback((nodes, depth = 0) => {
    return nodes.map((node) => (
      <div key={node.id} className="space-y-3">
        <button
          type="button"
          onClick={() => {
            setSelectedCategoryId(node.id);
            setMobilePanel("categories");
          }}
          className={cn(
            "flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition",
            selectedCategoryId === node.id ? "border-amber-400/40 bg-amber-400/10" : "border-white/10 bg-slate-950/40 hover:bg-white/[0.05]"
          )}
          style={{ marginLeft: depth * 16 }}
        >
          <div className="min-w-0">
            <p className="font-semibold text-white">{node.name}</p>
            <p className="text-xs text-slate-400">/{node.slug}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2 text-xs">
            <span className={cn("rounded-full px-3 py-1 font-semibold", node.is_visible ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300")}>
              {node.is_visible ? "Visible" : "Oculta"}
            </span>
            <span className="rounded-full bg-white/[0.06] px-3 py-1 text-slate-300">
              {categoryProductCount.get(node.id) || 0} prod.
            </span>
          </div>
        </button>
        {node.children?.length ? renderCategoryTree(node.children, depth + 1) : null}
      </div>
    ));
  }, [categoryProductCount, selectedCategoryId]);

  const categoryEditor = (
    <div className="space-y-4">
      <form onSubmit={submitCategory} className="glass rounded-3xl border border-white/10 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Category form</p>
            <h3 className="mt-1 text-lg font-black text-white">{selectedCategory ? "Editar categoría" : "Nueva categoría"}</h3>
          </div>
          <button
            type="button"
            onClick={() => {
              setSelectedCategoryId(null);
              setCategoryForm(createEmptyCategoryForm());
            }}
            className="rounded-xl border border-white/10 px-3 py-2 text-sm transition hover:bg-white/[0.06]"
          >
            Nueva
          </button>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="space-y-1.5 text-sm text-slate-300">
            <span>Nombre</span>
            <input
              value={categoryForm.name}
              onChange={(event) => setCategoryForm((current) => ({ ...current, name: event.target.value }))}
              className="h-11 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 outline-none transition focus:border-amber-400"
              required
            />
          </label>

          <label className="space-y-1.5 text-sm text-slate-300">
            <span>Slug</span>
            <input
              value={categoryForm.slug}
              onChange={(event) => setCategoryForm((current) => ({ ...current, slug: event.target.value }))}
              placeholder="Se autogenera si lo dejás vacío"
              className="h-11 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 outline-none transition focus:border-amber-400"
            />
          </label>

          <label className="space-y-1.5 text-sm text-slate-300">
            <span>Categoría padre</span>
            <select
              value={categoryForm.parent_id}
              onChange={(event) => setCategoryForm((current) => ({ ...current, parent_id: event.target.value }))}
              className="h-11 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 outline-none transition focus:border-amber-400"
            >
              <option value="">Sin padre</option>
              {categoryOptions
                .filter((category) => canUseAsParent(category.id, selectedCategory?.id, categoriesById))
                .map((category) => (
                  <option key={category.id} value={category.id}>{category.path}</option>
                ))}
            </select>
          </label>

          <label className="space-y-1.5 text-sm text-slate-300">
            <span>Orden</span>
            <input
              type="number"
              value={categoryForm.sort_order}
              onChange={(event) => setCategoryForm((current) => ({ ...current, sort_order: event.target.value }))}
              className="h-11 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 outline-none transition focus:border-amber-400"
            />
          </label>
        </div>

        <label className="mt-4 block space-y-1.5 text-sm text-slate-300">
          <span>Descripción</span>
          <textarea
            rows={4}
            value={categoryForm.description}
            onChange={(event) => setCategoryForm((current) => ({ ...current, description: event.target.value }))}
            className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 outline-none transition focus:border-amber-400"
          />
        </label>

        <label className="mt-4 block space-y-1.5 text-sm text-slate-300">
          <span>Imagen / banner</span>
          <input
            value={categoryForm.image}
            onChange={(event) => setCategoryForm((current) => ({ ...current, image: event.target.value }))}
            placeholder="https://..."
            className="h-11 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 outline-none transition focus:border-amber-400"
          />
        </label>

        <label className="mt-4 flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={categoryForm.is_visible}
            onChange={(event) => setCategoryForm((current) => ({ ...current, is_visible: event.target.checked }))}
          />
          Visible en storefront y encabezado si es de primer nivel
        </label>

        {categoryMutation.error ? (
          <p className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {categoryMutation.error.message}
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={!canEditCustom || categoryMutation.isPending}
            className="rounded-2xl bg-amber-500 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-amber-400 disabled:opacity-60"
          >
            {categoryMutation.isPending ? "Guardando..." : selectedCategory ? "Guardar categoría" : "Crear categoría"}
          </button>
        </div>
      </form>

      <div className="glass rounded-3xl border border-white/10 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Category tree</p>
            <h3 className="mt-1 text-lg font-black text-white">Jerarquía actual</h3>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300">{categories.length} total</span>
            <div className="relative w-full min-w-[220px] sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                value={categorySearch}
                onChange={(event) => setCategorySearch(event.target.value)}
                placeholder="Buscar categoría o ruta"
                className="h-10 w-full rounded-2xl border border-white/10 bg-slate-950/70 pl-10 pr-4 text-sm outline-none transition focus:border-amber-400"
              />
            </div>
          </div>
        </div>
        <div className="mt-4 space-y-3">
          {filteredCategoryTree.length ? renderCategoryTree(filteredCategoryTree) : <EmptyState icon={Boxes} title="Sin coincidencias" description="Probá con otro nombre o navegá el árbol completo." />}
        </div>
      </div>
    </div>
  );

  const productEditor = (
    <div className="space-y-4">
      <form onSubmit={submitProduct} className="glass rounded-3xl border border-white/10 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Product form</p>
            <h3 className="mt-1 text-lg font-black text-white">{selectedProduct ? "Editar publicación" : "Nueva publicación"}</h3>
          </div>
          <button
            type="button"
            onClick={() => {
              setSelectedProductId(null);
              setProductForm(createEmptyProductForm());
            }}
            className="rounded-xl border border-white/10 px-3 py-2 text-sm transition hover:bg-white/[0.06]"
          >
            Nueva
          </button>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="space-y-1.5 text-sm text-slate-300">
            <span>Título</span>
            <input
              value={productForm.title}
              onChange={(event) => setProductForm((current) => ({ ...current, title: event.target.value }))}
              className="h-11 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 outline-none transition focus:border-amber-400"
              required
            />
          </label>

          <label className="space-y-1.5 text-sm text-slate-300">
            <span>Slug</span>
            <input
              value={productForm.slug}
              onChange={(event) => setProductForm((current) => ({ ...current, slug: event.target.value }))}
              placeholder="Se autogenera si lo dejás vacío"
              className="h-11 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 outline-none transition focus:border-amber-400"
            />
          </label>

          <label className="space-y-1.5 text-sm text-slate-300">
            <span>Categoría</span>
            <select
              value={productForm.category_id}
              onChange={(event) => setProductForm((current) => ({ ...current, category_id: event.target.value }))}
              className="h-11 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 outline-none transition focus:border-amber-400"
              required
            >
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