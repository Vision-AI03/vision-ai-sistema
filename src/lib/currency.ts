/** Parse a pt-BR currency string ("7.500,00" or "7500" or "7500.50") to a JS number. */
export function parseBRL(v: string): number {
  if (!v) return 0;
  // If contains comma: pt-BR decimal format → strip dots, swap comma→dot
  if (v.includes(",")) {
    const n = parseFloat(v.replace(/\./g, "").replace(",", "."));
    return isNaN(n) ? 0 : n;
  }
  // No comma: plain number or US decimal — use parseFloat directly
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

/** Format a number as pt-BR decimal without currency symbol, e.g. 7500 → "7.500,00" */
export function formatDecimal(v: number): string {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v);
}

/** Format a number as pt-BR currency, e.g. 7500 → "R$ 7.500,00" */
export function formatBRL(v: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}
