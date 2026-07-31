/**
 * Extrae el folio visible del CFDI (ej. "F-144") directamente del XML ya
 * descargado, sin llamar a ningun endpoint adicional de factura.com - los
 * atributos Serie/Folio viven en la raiz <cfdi:Comprobante ...>.
 */
export function extractFolio(xmlContent: string): string {
  const serieMatch = xmlContent.match(/\bSerie="([^"]*)"/);
  const folioMatch = xmlContent.match(/\bFolio="([^"]*)"/);
  const serie = serieMatch?.[1]?.trim() ?? "";
  const folio = folioMatch?.[1]?.trim() ?? "";
  if (!serie && !folio) return "";
  return serie && folio ? `${serie}-${folio}` : serie || folio;
}
