import { readFile } from "node:fs/promises";

export interface SimcoErrorRow {
  uuid: string;
  codigoError: string;
  mensaje: string;
}

/**
 * Parsea el "Reporte de archivos con error" que descarga SIMCO tras un
 * envio parcial. No tenemos todavia una muestra real de este archivo, asi
 * que el parseo es best-effort: busca columnas cuyo encabezado contenga
 * "uuid" y "error"/"codigo". Ajusta los nombres de columna aqui en cuanto
 * tengan un reporte real descargado (guarda uno de ejemplo en
 * docs/ejemplos/ para referencia del equipo).
 */
export async function parseSimcoErrorReport(filePath: string): Promise<SimcoErrorRow[]> {
  const content = await readFile(filePath, "utf-8");
  const [headerLine, ...lines] = content.trim().split(/\r?\n/);
  if (!headerLine) return [];

  const headers = headerLine.split(",").map((h) => h.trim().toLowerCase());
  const uuidIdx = headers.findIndex((h) => h.includes("uuid"));
  const codeIdx = headers.findIndex((h) => h.includes("codigo") || h.includes("code"));
  const msgIdx = headers.findIndex((h) => h.includes("error") || h.includes("mensaje") || h.includes("descripcion"));

  return lines
    .filter(Boolean)
    .map((line) => {
      const cols = line.split(",");
      return {
        uuid: uuidIdx >= 0 ? (cols[uuidIdx] ?? "").trim() : "",
        codigoError: codeIdx >= 0 ? (cols[codeIdx] ?? "").trim() : "",
        mensaje: msgIdx >= 0 ? (cols[msgIdx] ?? "").trim() : line,
      };
    });
}
