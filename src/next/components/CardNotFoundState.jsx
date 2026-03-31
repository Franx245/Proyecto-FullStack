import Link from "next/link";

export default function CardNotFoundState() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-[880px] flex-col items-center justify-center px-4 py-16 text-center">
      <div className="rounded-[32px] border border-white/10 bg-card/80 p-8 shadow-[0_24px_80px_rgba(0,0,0,0.24)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Card detail</p>
        <h1 className="mt-3 text-3xl font-black text-foreground">Carta no encontrada</h1>
        <p className="mt-3 max-w-md text-sm leading-7 text-muted-foreground">
          El identificador no es válido o la carta ya no está visible en el catálogo público.
        </p>
        <Link href="/singles" className="mt-6 inline-flex h-11 items-center justify-center rounded-2xl bg-primary px-5 text-sm font-bold text-primary-foreground">
          Volver al catálogo
        </Link>
      </div>
    </div>
  );
}