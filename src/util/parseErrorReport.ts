import { readFile } from "node:fs/promises";

export interface SimcoErrorRow {
  invoiceUid: string;
  codigoError: string;
  mensaje: string;
}

/**
 * Split minimo de una linea CSV respetando comillas (el "Mensaje" del
 * reporte real trae comas dentro de comillas, ej. "Archivo cargado
 * anteriormente, pendiente de conciliar" - un split(",") ingenuo corta esa
 * celda a la mitad y desalinea las columnas siguientes).
 */
function splitCsvLine(line: string): string[] {
  const cols: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      cols.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  cols.push(current);
  return cols;
}

/**
 * Parsea el "Reporte de archivos con error" que descarga SIMCO tras un
 * envio parcial. Formato real confirmado (columna a columna, coincide con
 * un reporte descargado de verdad):
 *   Nombre del archivo,"Mensaje",Nomenclatura del error
 *   6a695c98df00c,"Archivo cargado anteriormente, pendiente de conciliar",1010
 *
 * "Nombre del archivo" es el Invoice UID corto (los PDF/XML se nombran
 * `{invoiceUid}.pdf`/`.xml` al subirlos), NO el UUID/folio fiscal largo -
 * asi se empareja de vuelta con SourceInvoiceRow.invoiceUid en
 * uploadFacturas.ts.
 */
export async function parseSimcoErrorReport(filePath: string): Promise<SimcoErrorRow[]> {
  const content = await readFile(filePath, "utf-8");
  const [headerLine, ...lines] = content.trim().split(/\r?\n/);
  if (!headerLine) return [];

  const headers = splitCsvLine(headerLine).map((h) => h.trim().toLowerCase().replace(/^"|"$/g, ""));
  const fileIdx = headers.findIndex((h) => h.includes("archivo"));
  const codeIdx = headers.findIndex((h) => h.includes("nomenclatura") || h.includes("codigo") || h.includes("code"));
  const msgIdx = headers.findIndex((h) => h.includes("mensaje") || h.includes("descripcion"));

  return lines
    .filter(Boolean)
    .map((line) => {
      const cols = splitCsvLine(line);
      return {
        invoiceUid: fileIdx >= 0 ? (cols[fileIdx] ?? "").trim().replace(/\.(pdf|xml)$/i, "") : "",
        codigoError: codeIdx >= 0 ? (cols[codeIdx] ?? "").trim() : "",
        mensaje: msgIdx >= 0 ? (cols[msgIdx] ?? "").trim() : line,
      };
    });
}
