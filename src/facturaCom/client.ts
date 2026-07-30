import { config } from "../config.js";

/**
 * Cliente para la API v4 de factura.com.
 *
 * Endpoints de descarga confirmados letra por letra contra la
 * documentacion oficial (factura.com/apidocs, seccion "Descargar CFDI") Y
 * probados con exito contra la cuenta real: host https://api.factura.com,
 * rutas /v4/cfdi40/{invoiceUid}/pdf y /v4/cfdi40/{invoiceUid}/xml, headers
 * F-PLUGIN / F-Api-Key / F-Secret-Key.
 *
 * IMPORTANTE: el parametro es el "Invoice UID" corto que genera
 * factura.com (ej. 6a3b053b2e88d, columna "Invoice UID" del sheet de
 * Make), NO el UUID/folio fiscal largo del CFDI. Son dos identificadores
 * distintos — usar el UUID largo aqui produce el mismo error generico que
 * un permiso de cuenta bloqueado, asi que si vuelve a fallar, primero
 * confirma que se esta mandando el Invoice UID correcto.
 *
 * El endpoint de listado masivo (/cfdi40/list) esta bloqueado por el plan
 * de la cuenta y no se usa: las facturas a procesar se leen del sheet de
 * Make (ver src/tracking/sheetLog.ts), que ya tiene UUID + Invoice UID +
 * Numero de orden de cada factura generada.
 */

export type TipoDocumento = "factura" | "notaCredito" | "complementoPago";

function authHeaders(): Record<string, string> {
  return {
    "F-PLUGIN": config.facturaCom.pluginKey,
    "F-Api-Key": config.facturaCom.apiKey,
    "F-Secret-Key": config.facturaCom.secretKey,
    "Content-Type": "application/json",
  };
}

async function apiGetBinary(path: string): Promise<Buffer> {
  const res = await fetch(`${config.facturaCom.baseUrl}${path}`, {
    method: "GET",
    headers: authHeaders(),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`factura.com GET ${path} -> ${res.status}: ${body}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function downloadPdf(invoiceUid: string): Promise<Buffer> {
  return apiGetBinary(`/cfdi40/${invoiceUid}/pdf`);
}

export async function downloadXml(invoiceUid: string): Promise<Buffer> {
  return apiGetBinary(`/cfdi40/${invoiceUid}/xml`);
}

export interface CancelacionResultado {
  ok: boolean;
  mensaje: string;
}

/**
 * Cancela un CFDI 4.0. Endpoint confirmado letra por letra contra la
 * documentacion oficial (factura.com/apidocs/cancelar-cfdi-40.html):
 * POST /v4/cfdi40/{invoiceUid}/cancel con body {motivo, folioSustituto?}.
 *
 * motivo: "01" (con errores, requiere folioSustituto con el UID/UUID del
 * CFDI que sustituye al cancelado), "02" (con errores, sin relacion, no
 * requiere folioSustituto), "03" (operacion no realizada), "04" (operacion
 * nominativa de factura global).
 */
export async function cancelInvoice(
  invoiceUid: string,
  motivo: "01" | "02" | "03" | "04",
  folioSustituto?: string,
): Promise<CancelacionResultado> {
  const body: Record<string, string> = { motivo };
  if (folioSustituto) body.folioSustituto = folioSustituto;

  const res = await fetch(`${config.facturaCom.baseUrl}/cfdi40/${invoiceUid}/cancel`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { response?: string; message?: string };
  return {
    ok: res.ok && data.response === "success",
    mensaje: data.message ?? `HTTP ${res.status}`,
  };
}
