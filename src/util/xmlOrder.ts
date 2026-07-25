/**
 * Intenta extraer el numero de orden de CrediTienda directamente del XML
 * timbrado, siguiendo el formato de ejemplo que documenta SIMCO:
 *   Descripcion="Audifonosinalambricos/6250133881067"
 * (el numero de orden es lo que sigue a la ultima "/" dentro del atributo
 * Descripcion del nodo cfdi:Concepto, o dentro de una Addenda si existe).
 *
 * Si tu proceso de timbrado (el Make.com actual) no esta insertando el
 * numero de orden ahi, esta funcion regresara undefined y el job usara el
 * mapeo manual del Google Sheet como respaldo.
 */
export function extractOrderNumberFromXml(xml: string): string | undefined {
  const descripcionMatches = [...xml.matchAll(/Descripcion="([^"]*)"/gi)];
  for (const match of descripcionMatches) {
    const value = match[1];
    const afterSlash = value.split("/").pop();
    if (afterSlash && /^\d{5,}$/.test(afterSlash)) {
      return afterSlash;
    }
  }
  return undefined;
}
