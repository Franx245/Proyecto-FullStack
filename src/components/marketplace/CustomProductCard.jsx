import { Link } from "react-router-dom";
import { cloudinaryFetchUrl } from "@/lib/cardImage";

/** @param {number} value */
function currency(value) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value || 0);
}

/** @param {{ product: * }} props */
export default function CustomProductCard({ product }) {
  return (
    <Link
      to={`/custom/product/${product.slug}`}
      className="group overflow-hidden rounded-3xl border border-border bg-card/80 transition hover:border-primary/40 hover:shadow-lg"
    >
      <div className="aspect-[4/3] bg-secondary">
        {product.image ? (
          <img src={cloudinaryFetchUrl(product.image, { width: 480 })} alt={product.title} loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Sin imagen</div>
        )}
      </div>

      <div className="space-y-3 p-5">
        <div>
          <h3 className="text-lg font-black tracking-tight">{product.title}</h3>
          <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{product.description || "Publicación custom"}</p>
        </div>

        <div className="flex items-center justify-between gap-3">
          <span className="text-xl font-black text-primary">{currency(product.price)}</span>
          <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Custom</span>
        </div>
      </div>
    </Link>
  );
}