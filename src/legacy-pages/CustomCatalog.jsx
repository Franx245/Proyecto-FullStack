import { useMemo } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { fetchCustomCategoryByPath } from "@/api/store";
import CustomCategoryCard from "@/components/marketplace/CustomCategoryCard";
import CustomProductCard from "@/components/marketplace/CustomProductCard";

function CatalogSkeleton() {
  return (
    <div className="max-w-[1400px] mx-auto px-4 py-8 space-y-8 animate-pulse">
      <div className="rounded-[32px] border border-border bg-card/70 p-6 md:p-8">
        <div className="h-3 w-16 rounded bg-secondary" />
        <div className="mt-3 h-8 w-64 rounded bg-secondary" />
        <div className="mt-3 h-4 w-full max-w-xl rounded bg-secondary" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-48 rounded-3xl border border-border bg-card/60" />
        ))}
      </div>
    </div>
  );
}

export default function CustomCatalog() {
  const params = useParams();
  const slugPath = (params["*"] || "").trim();

  const query = useQuery({
    queryKey: ["custom-category-path", slugPath],
    queryFn: () => fetchCustomCategoryByPath(slugPath),
    placeholderData: keepPreviousData,
  });

  const category = query.data?.category ?? null;
  const children = useMemo(() => query.data?.children ?? [], [query.data]);
  const products = useMemo(() => query.data?.products ?? [], [query.data]);
  const basePath = slugPath ? `/custom/${slugPath}` : "/custom";

  if (query.isLoading && !query.isPlaceholderData) return <CatalogSkeleton />;

  return (
    <div className="max-w-[1400px] mx-auto px-4 py-8 space-y-8">
      <div className="rounded-[32px] border border-border bg-card/70 p-6 md:p-8">
        <p className="text-xs uppercase tracking-[0.24em] text-primary">Custom</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight">{category?.name || "Categorías custom"}</h1>
        <p className="mt-3 max-w-3xl text-sm text-muted-foreground">
          {category?.description || "Explorá publicaciones custom organizadas por categorías visibles desde el panel de admin."}
        </p>
        {slugPath ? (
          <Link to="/custom" className="mt-5 inline-flex text-sm font-medium text-primary hover:underline">
            Volver a categorías principales
          </Link>
        ) : null}
      </div>

      {children.length > 0 ? (
        <section className="space-y-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Subcategorías</p>
            <h2 className="mt-2 text-2xl font-black tracking-tight">Explorá por sección</h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {children.map((child) => (
              <CustomCategoryCard key={child.id} category={child} basePath={basePath} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="space-y-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Publicaciones</p>
          <h2 className="mt-2 text-2xl font-black tracking-tight">{products.length ? `${products.length} publicaciones` : "Sin publicaciones todavía"}</h2>
        </div>

        {products.length ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {products.map((product) => (
              <CustomProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <div className="rounded-3xl border border-dashed border-border bg-card/60 px-6 py-16 text-center text-sm text-muted-foreground">
            Esta categoría aún no tiene publicaciones visibles.
          </div>
        )}
      </section>
    </div>
  );
}