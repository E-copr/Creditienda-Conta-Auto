import { config } from "../config.js";
import type { TipoDocumento } from "../facturaCom/client.js";
import { getAccessToken } from "./googleAuth.js";

/**
 * Bitacora y mapeo de ordenes en un Google Sheet compartido con el equipo.
 * Cualquier colaborador con acceso al Sheet puede ver el estado de cada
 * factura sin tocar codigo; el robot solo lee/escribe filas.
 *
 * Usa la API REST de Google Sheets directamente (fetch + JWT propio en
 * googleAuth.ts) en vez de la libreria `googleapis`, que pesaba ~112MB en
 * disco solo para esto.
 *
 * Requiere una cuenta de servicio de Google Cloud con la Sheets API
 * habilitada y el Sheet compartido (permiso Editor) con el correo de esa
 * cuenta de servicio. Ver docs/SETUP.md.
 */

export interface BitacoraRow {
  uuid: string;
  tipoDocumento: TipoDocumento;
  numeroOrden: string | null;
  nombreDocumento: string;
  fechaTimbrado: string;
  estatus: "SUBIDA_OK" | "ERROR" | "SIN_ORDEN" | "PENDIENTE";
  codigoError?: string;
  detalleError?: string;
  fechaSubida?: string;
}

const SHEETS_API_BASE = "https://sheets.googleapis.com/v4/spreadsheets";

async function sheetsGet(spreadsheetId: string, range: string): Promise<string[][]> {
  const token = await getAccessToken();
  const url = `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Google Sheets GET ${range} -> ${res.status}: ${body}`);
  }
  const data = (await res.json()) as { values?: string[][] };
  return data.values ?? [];
}

async function sheetsAppend(spreadsheetId: string, range: string, values: unknown[][]): Promise<void> {
  const token = await getAccessToken();
  const url = `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ values }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Google Sheets APPEND ${range} -> ${res.status}: ${body}`);
  }
}

/** UUIDs que ya estan registrados en la bitacora (para no reprocesarlos). Columna C. */
export async function getExistingUuids(): Promise<Set<string>> {
  const rows = await sheetsGet(config.sheets.sheetId, `${config.sheets.tabBitacora}!C2:C`);
  return new Set(rows.map((r) => r[0]).filter(Boolean));
}

/**
 * Orden real de columnas en el Sheet de bitacora (confirmado con el
 * equipo): Fecha de subida, Tipo Documento, UUID, Numero Orden, Nombre
 * del documento, Fecha Timbrado, Estatus, Codigo Error, Detalle Error.
 */
export async function appendBitacoraRows(rows: BitacoraRow[]): Promise<void> {
  if (rows.length === 0) return;
  await sheetsAppend(
    config.sheets.sheetId,
    `${config.sheets.tabBitacora}!A:I`,
    rows.map((r) => [
      r.fechaSubida ?? "",
      r.tipoDocumento,
      r.uuid,
      r.numeroOrden ?? "",
      r.nombreDocumento,
      r.fechaTimbrado,
      r.estatus,
      r.codigoError ?? "",
      r.detalleError ?? "",
    ]),
  );
}

/**
 * Lee el mapeo UUID -> Numero de orden directamente del Sheet que YA llena
 * el Make.com existente al generar cada factura (no es un sheet nuevo).
 *
 * Busca las columnas por nombre de encabezado (no por posicion fija),
 * porque el equipo avisó que los titulos/orden de columnas de ese sheet
 * van a cambiar pronto — con esto un cambio de columnas no rompe el job,
 * solo hay que ajustar los headers esperados en config (SOURCE_*_HEADER)
 * si el nombre literal tambien cambia.
 *
 * Solo se consideran filas cuyo estatus empiece con "success" (se ignoran
 * filas con error de generacion de factura).
 */
export async function getOrderNumberMap(): Promise<Map<string, string>> {
  const [headerRow, ...rows] = await sheetsGet(config.sheets.sourceSheetId, `${config.sheets.sourceSheetTab}!A1:Z`);
  if (!headerRow) return new Map();

  const uuidIdx = headerRow.indexOf(config.sheets.sourceUuidHeader);
  const orderIdx = headerRow.indexOf(config.sheets.sourceOrderNumberHeader);
  const statusIdx = headerRow.indexOf(config.sheets.sourceStatusHeader);

  if (uuidIdx === -1 || orderIdx === -1) {
    throw new Error(
      `No se encontraron las columnas "${config.sheets.sourceUuidHeader}" / "${config.sheets.sourceOrderNumberHeader}" ` +
        `en la fila de encabezados del sheet fuente: [${headerRow.join(", ")}]. ` +
        `Ajusta SOURCE_UUID_HEADER / SOURCE_ORDER_NUMBER_HEADER en las variables de entorno.`,
    );
  }

  const map = new Map<string, string>();
  for (const row of rows) {
    const uuid = row[uuidIdx];
    const numeroOrden = row[orderIdx];
    const estatus = statusIdx >= 0 ? row[statusIdx] : "success";
    if (uuid && numeroOrden && String(estatus ?? "").startsWith("success")) {
      map.set(uuid, String(numeroOrden));
    }
  }
  return map;
}
