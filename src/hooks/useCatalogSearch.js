import { startTransition, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { readLastCatalogHref } from "@/lib/catalog-url-state";

/**
 * @param {{
 *   pathname: string,
 *   onResolve: (state: { currentSearch: string, catalogHref: string }) => void,
 * }} props
 */
export function CatalogSearchBridge({ pathname, onResolve }) {
  const searchParams = useSearchParams();

  // 🔹 Lee los search params reales del App Router.
  // 🔸 Lo hacemos en un componente aparte porque useSearchParams necesita Suspense.
  // ⚠️ No mover esta lógica directo al shell sin mantener ese Suspense.
  useEffect(() => {
    const currentSearch = pathname.startsWith("/singles") ? searchParams.get("q") || "" : "";
    const catalogHref = pathname.startsWith("/singles")
      ? `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`
      : readLastCatalogHref("/singles");

    onResolve({ currentSearch, catalogHref });
  }, [onResolve, pathname, searchParams]);

  return null;
}

/**
 * @param {{
 *   pathname: string,
 *   router: {
 *     replace: (href: string, options?: { scroll?: boolean }) => void,
 *   },
 * }} options
 */
export function useCatalogSearch({ pathname, router }) {
  const fallbackCatalogHref = pathname.startsWith("/singles") ? pathname : "/singles";
  const [catalogLocationState, setCatalogLocationState] = useState({
    currentSearch: "",
    catalogHref: fallbackCatalogHref,
  });
  const [searchQuery, setSearchQuery] = useState("");

  const handleResolveCatalogLocation = useCallback(
    /** @type {(nextState: { currentSearch: string, catalogHref: string }) => void} */
    ((nextState) => {
      setCatalogLocationState((currentState) => {
        if (
          currentState.currentSearch === nextState.currentSearch
          && currentState.catalogHref === nextState.catalogHref
        ) {
          return currentState;
        }

        return nextState;
      });
    }),
    []
  );

  // 🔹 Mantiene una referencia útil al catálogo aunque el usuario salga de /singles.
  // 🔸 Así el botón "Cartas" siempre vuelve al último estado conocido del catálogo.
  // ⚠️ No reemplazar por una constante fija porque se pierde el retorno al filtro actual.
  useEffect(() => {
    setCatalogLocationState((currentState) => {
      const nextCatalogHref = pathname.startsWith("/singles") ? pathname : readLastCatalogHref("/singles");
      if (currentState.catalogHref === nextCatalogHref && (!pathname.startsWith("/singles") || currentState.currentSearch === "")) {
        return currentState;
      }

      return {
        currentSearch: pathname.startsWith("/singles") ? currentState.currentSearch : "",
        catalogHref: nextCatalogHref,
      };
    });
  }, [pathname]);

  // 🔹 Sincroniza el input visual con el valor real de la URL.
  // 🔸 Esto evita que el campo quede desfasado cuando el usuario navega con back/forward.
  // ⚠️ No eliminar este efecto: la búsqueda deja de reflejar el estado real del catálogo.
  useEffect(() => {
    setSearchQuery(catalogLocationState.currentSearch);
  }, [catalogLocationState.currentSearch]);

  const handleSearchChange = useCallback(
    /** @type {import("react").ChangeEventHandler<HTMLInputElement>} */
    ((event) => {
      const value = event.target.value;
      setSearchQuery(value);

      // 🔹 Actualiza la URL sin recargar ni cambiar de pantalla.
      // 🔸 Usamos replace para que escribir no ensucie el historial del navegador.
      // ⚠️ No cambiar a push porque rompe la UX del catálogo al navegar hacia atrás.
      startTransition(() => {
        const targetPath = pathname.startsWith("/singles") ? pathname : "/singles";
        const currentQuery = pathname.startsWith("/singles") ? (catalogLocationState.catalogHref.split("?")[1] || "") : "";
        const nextParams = new URLSearchParams(currentQuery);

        if (!value.trim()) {
          nextParams.delete("q");
        } else {
          nextParams.set("q", value.trim());
        }

        nextParams.delete("page");

        const nextQuery = nextParams.toString();
        router.replace(nextQuery ? `${targetPath}?${nextQuery}` : targetPath, { scroll: false });
      });
    }),
    [catalogLocationState.catalogHref, pathname, router]
  );

  return {
    catalogHref: catalogLocationState.catalogHref,
    handleResolveCatalogLocation,
    handleSearchChange,
    searchQuery,
    shouldRenderSearchBridge: pathname.startsWith("/singles"),
  };
}