/** Fecha/hora legible en la zona horaria de Ciudad de Mexico, para columnas de la bitacora que lee gente. */
export function formatFechaMexico(date: Date): string {
  return date.toLocaleString("es-MX", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}
