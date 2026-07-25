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
 * Lee el mapeo manual UUID -> Numero de orden (pestana "Mapeo Ordenes").
 * Se usa como respaldo cuando la factura no trae el numero de orden en el
 * XML (Addenda/Descripcion). Se espera que la automatizacion de generacion
 * de facturas (el Make.com existente) registre aqui cada UUID + orden al
 * momento de timbrar, o que un colaborador lo llene a mano.
 */
export async function getOrderNumberMap(): Promise<Map<string, string>> {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.sheets.sheetId,
    range: `${config.sheets.tabMapeoOrdenes}!A2:B`,
  });
  const rows = res.data.values ?? [];
  const map = new Map<string, string>();
  for (const row of rows) {
    const [uuid, numeroOrden] = row;
    if (uuid && numeroOrden) map.set(uuid, String(numeroOrden));
  }
  return map;
}
