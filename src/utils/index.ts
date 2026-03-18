export function createPageUrl(pageName: string): string {
  return (
    "/" +
    pageName
      .toLowerCase()
      .normalize("NFD") // elimina tildes
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s-]/g, "") // limpia caracteres raros
      .trim()
      .replace(/\s+/g, "-") // espacios → guiones
  );
}