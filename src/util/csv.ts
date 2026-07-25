import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export interface AuxiliarRow {
  uuid: string;
  numeroOrden: string;
}

/** Genera el archivo auxiliar.csv con el formato exacto que exige SIMCO. */
export async function writeAuxiliarCsv(rows: AuxiliarRow[], outDir: string): Promise<string> {
  await mkdir(outDir, { recursive: true });
  const filePath = path.join(outDir, `auxiliar-${Date.now()}.csv`);
  const header = "UUID factura,Numero de orden";
  const lines = rows.map((r) => `${r.uuid},${r.numeroOrden}`);
  await writeFile(filePath, [header, ...lines].join("\n"), "utf-8");
  return filePath;
}
