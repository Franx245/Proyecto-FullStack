function DetailSkeleton() {
  return (
    <div className="max-w-[1200px] mx-auto px-4 py-6 space-y-6">
      <div className="h-4 w-32 bg-secondary rounded animate-pulse" />
      <div className="bg-card border border-border rounded-2xl p-8">
        <div className="grid md:grid-cols-2 gap-8">
          <div className="aspect-[3/4] max-w-[320px] bg-secondary rounded-xl animate-pulse" />
          <div className="space-y-4">
            <div className="h-10 bg-secondary rounded animate-pulse w-3/4" />
            <div className="flex gap-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-7 w-20 bg-secondary rounded-full animate-pulse" />
              ))}
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-secondary rounded-xl animate-pulse" />
              ))}
            </div>
            <div className="h-32 bg-secondary rounded-xl animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Loading() {
  return <DetailSkeleton />;
}