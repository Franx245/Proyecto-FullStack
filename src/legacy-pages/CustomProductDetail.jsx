import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { fetchCustomProductDetail } from "@/api/store";
import { cloudinaryFetchUrl } from "@/lib/cardImage";

function currency(value) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value || 0);
}

export default function CustomProductDetail() {
  const { slug = "" } = useParams();
  const query = useQuery({
    queryKey: ["custom-product-detail", slug],
    queryFn: () => fetchCustomProductDetail(slug),
  });

  const product = query.data?.product ?? null;
  const images = useMemo(() => product?.images ?? [], [product]);
  const [activeIndex, setActiveIndex] = useState(0);
  const activeImage = images[activeIndex]?.url || product?.image || null;

  if (!product && query.isLoading) {
    return <div className="max-w-[1400px] mx-auto px-4 py-10 text-sm text-muted-foreground">Cargando publicación custom...</div>;
  }

  if (!product) {
    return <div className="max-w-[1400px] mx-auto px-4 py-10 text-sm text-muted-foreground">No se encontró la publicación custom.</div>;
  }

  return (
    <div className="max-w-[1400px] mx-auto px-4 py-8 space-y-8">
      <Link to={product.category ? `/custom/${product.category.slug}` : "/custom"} className="inline-flex text-sm font-medium text-primary hover:underline">
        Volver a {product.category?.name || "categorías custom"}
      </Link>

      <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-4">
          <div className="overflow-hidden rounded-[32px] border border-border bg-card/70">
            {activeImage ? (
              <img src={cloudinaryFetchUrl(activeImage, { width: 800 })} alt={product.title} className="h-full w-full object-cover" />
            ) : (
              <div className="flex min-h-[420px] items-center justify-center text-sm text-muted-foreground">Sin imagen</div>
            )}
          </div>

          {images.length > 1 ? (
            <div className="grid grid-cols-4 gap-3 md:grid-cols-6">
              {images.map((image, index) => (
                <button
                  key={image.id}
                  onClick={() => setActiveIndex(index)}
                  className={`overflow-hidden rounded-2xl border ${activeIndex === index ? "border-primary" : "border-border"}`}
                >
                  <img src={cloudinaryFetchUrl(image.url, { width: 160 })} alt={`${product.title} ${index + 1}`} className="aspect-square h-full w-full object-cover" />
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="rounded-[32px] border border-border bg-card/70 p-6 md:p-8">
          <p className="text-xs uppercase tracking-[0.24em] text-primary">Publicación custom</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight">{product.title}</h1>
          <p className="mt-3 text-sm text-muted-foreground">{product.description || "Sin descripción."}</p>

          <div className="mt-6 rounded-3xl border border-border bg-background/60 p-5">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Precio</p>
            <p className="mt-2 text-3xl font-black text-primary">{currency(product.price)}</p>
          </div>

          {product.category ? (
            <div className="mt-6 text-sm text-muted-foreground">
              Categoría: <span className="font-semibold text-foreground">{product.category.name}</span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}