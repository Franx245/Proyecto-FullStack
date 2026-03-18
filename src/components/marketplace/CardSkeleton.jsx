export default function CardSkeleton() {
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden animate-pulse">
      
      {/* Image */}
      <div className="aspect-[3/4] bg-secondary" />

      {/* Content */}
      <div className="p-3 space-y-2">
        
        {/* Title */}
        <div className="h-4 bg-secondary rounded w-4/5" />
        <div className="h-4 bg-secondary rounded w-3/5" />

        {/* Rarity */}
        <div className="h-3 bg-secondary rounded w-1/3" />

        {/* Set */}
        <div className="h-3 bg-secondary rounded w-2/3" />

        {/* Price + Button */}
        <div className="flex items-center justify-between pt-2">
          <div className="h-5 bg-secondary rounded w-16" />
          <div className="h-8 w-10 bg-secondary rounded-lg" />
        </div>
      </div>
    </div>
  );
}