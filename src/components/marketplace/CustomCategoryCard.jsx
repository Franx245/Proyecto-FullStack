import { Link } from "react-router-dom";

export default function CustomCategoryCard({ category, basePath = "/custom" }) {
  const targetPath = `${basePath}/${category.slug}`.replace(/\/+/g, "/");

  return (
    <Link
      to={targetPath}
      className="group overflow-hidden rounded-3xl border border-border bg-card/80 transition hover:border-primary/40 hover:shadow-lg"
    >
      <div className="aspect-[16/9] bg-secondary">
        {category.image ? (
          <img src={category.image} alt={category.name} className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Sin imagen</div>
        )}
      </div>
      <div className="space-y-2 p-5">
        <h3 className="text-lg font-black tracking-tight">{category.name}</h3>
        <p className="line-clamp-3 text-sm text-muted-foreground">{category.description || "Explorá esta categoría custom."}</p>
      </div>
    </Link>
  );
}