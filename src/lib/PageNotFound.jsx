import { Link } from "react-router-dom";

export default function PageNotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6">
      <div className="text-center space-y-6 max-w-md w-full">
        
        {/* Código 404 */}
        <div>
          <h1 className="text-7xl font-bold text-muted-foreground/20">404</h1>
          <div className="h-0.5 w-16 bg-primary mx-auto mt-2"></div>
        </div>

        {/* Mensaje */}
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold text-foreground">
            Página no encontrada
          </h2>
          <p className="text-muted-foreground">
            La página que estás buscando no existe o fue movida.
          </p>
        </div>

        {/* Acciones */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
          
          <Link
            to="/"
            className="px-5 py-2 rounded-lg bg-primary text-black font-medium hover:opacity-90 transition"
          >
            Volver al inicio
          </Link>

          <Link
            to="/singles"
            className="px-5 py-2 rounded-lg border border-border text-foreground hover:bg-secondary transition"
          >
            Ver cartas
          </Link>

        </div>
      </div>
    </div>
  );
}