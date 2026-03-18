export default function CardSkeleton() {
  return (
    <div className="overflow-hidden rounded-[1.35rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.015))] animate-pulse">
      <div className="aspect-[3/4] bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(15,23,42,0.4))]" />

      <div className="space-y-3 p-4">
        <div className="h-4 w-4/5 rounded bg-secondary" />
        <div className="h-4 w-3/5 rounded bg-secondary" />
        <div className="flex items-center justify-between gap-3 pt-2">
          <div className="h-10 w-24 rounded-2xl bg-secondary" />
          <div className="h-10 w-20 rounded-2xl bg-secondary" />
        </div>
        <div className="h-9 rounded-2xl bg-secondary" />
      </div>
    </div>
  );
}