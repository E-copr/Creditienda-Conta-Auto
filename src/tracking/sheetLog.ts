import { google } from "googleapis";
import { config } from "../config.js";
import type { TipoDocumento } from "../facturaCom/client.js";

/**
 * Bitacora y mapeo de ordenes en un Google Sheet compartido con el equipo.
 * Cualquier colaborador con acceso al Sheet puede ver el estado de cada
 * factura sin tocar codigo; el robot solo lee/escribe filas.
 *
 * Requiere una cuenta de servicio de Google Cloud con la Sheets API
 * habilitada y el Sheet compartido (permiso Editor) con el correo de esa
 * cuenta de servicio. Ver docs/SETUP.md.
 */

export interface BitacoraRow {
  uuid: string;
  tipoDocumento: TipoDocumento;
  numeroOrden: string | null;
  fechaTimbrado: string;
  estatus: "SUBIDA_OK" | "ERROR" | "SIN_ORDEN" | "PENDIENTE";
  codigoError?: string;
  detalleError?: string;
  fechaSubida?: string;
}

async function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    keyFile: config.sheets.serviceAccountJsonPath,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

/** UUIDs que ya estan registrados en la bitacora (para no reprocesarlos). */
export async function getExistingUuids(): Promise<Set<string>> {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.sheets.sheetId,
    range: `${config.sheets.tabBitacora}!A2:A`,
  });
  const rows = res.data.values ?? [];
  return new Set(rows.map((r) => r[0]).filter(Boolean));
}

export async function appendBitacoraRows(rows: BitacoraRow[]): Promise<void> {
  if (rows.length === 0) return;
  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: config.sheets.sheetId,
    range: `${config.sheets.tabBitacora}!A:H`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: rows.map((r) => [
        r.uuid,
        r.tipoDocumento,
        r.numeroOrden ?? "",
        r.fechaTimbrado,
        r.estatus,
        r.codigoError ?? "",
        r.detalleError ?? "",
        r.fechaSubida ?? "",
      ]),
    },
  });
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
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.sheets.sourceSheetId,
    range: `${config.sheets.sourceSheetTab}!A1:Z`,
  });
  const [headerRow, ...rows] = res.data.values ?? [];
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
