import { config } from "../config.js";

/**
 * Cliente para la API v4 de factura.com.
 *
 * Endpoints de descarga (downloadPdf/downloadXml) confirmados letra por
 * letra contra la documentacion oficial (factura.com/apidocs, seccion
 * "Descargar CFDI"): host https://api.factura.com, rutas
 * /v4/cfdi40/{cfdi_uid}/pdf y /v4/cfdi40/{cfdi_uid}/xml, headers F-PLUGIN /
 * F-Api-Key / F-Secret-Key. El F-PLUGIN es un valor publico generico (viene
 * igual en los ejemplos de su documentacion), no es especifico de la
 * cuenta.
 *
 * Si estos endpoints regresan {"status":"error","message":"...plan
 * Empresa..."} es un tema de permisos/plan de la cuenta en el servidor de
 * factura.com, no de este codigo — confirmado contra la documentacion
 * oficial letra por letra.
 */

export type TipoDocumento = "factura" | "notaCredito" | "complementoPago";

// TipoDeComprobante SAT: I=Ingreso (factura), E=Egreso (nota de credito), P=Pago (complemento de pago)
const TIPO_COMPROBANTE: Record<TipoDocumento, string> = {
  factura: "I",
  notaCredito: "E",
  complementoPago: "P",
};

export interface FacturaComInvoice {
  uuid: string;
  folio: string;
  tipoDocumento: TipoDocumento;
  fechaTimbrado: string; // ISO date
  total: number;
  ordenRelacionada?: string; // si factura.com ya guarda el numero de orden en algun campo propio
}

function authHeaders(): Record<string, string> {
  return {
    "F-PLUGIN": config.facturaCom.pluginKey,
    "F-Api-Key": config.facturaCom.apiKey,
    "F-Secret-Key": config.facturaCom.secretKey,
    "Content-Type": "application/json",
  };
}

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${config.facturaCom.baseUrl}${path}`, {
    method: "GET",
    headers: authHeaders(),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`factura.com GET ${path} -> ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
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

function mmddyyyy(d: Date): string {
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
}

/**
 * Lista CFDI timbrados entre dos fechas (inclusive), filtrando por tipo de
 * documento en el cliente (no se confirmo un parametro de query para tipo,
 * asi que se filtra sobre el campo TipoDeComprobante de cada resultado).
 *
 * Endpoint y formato de fecha (dateStart/dateEnd MM/DD/YYYY) confirmados
 * contra la cuenta real. Requiere que la cuenta de factura.com tenga
 * habilitado el endpoint de listado (mensaje de error visto: "necesitas
 * adquirir un plan Empresa en el que esta incluido el plugin" - si sale
 * ese error, es un tema de plan/plugin de la cuenta, no de este codigo).
 */
export async function listInvoices(
  tipo: TipoDocumento,
  dateFrom: Date,
  dateTo: Date,
): Promise<FacturaComInvoice[]> {
  const tipoComprobante = TIPO_COMPROBANTE[tipo];
  const path = `/cfdi40/list?dateStart=${mmddyyyy(dateFrom)}&dateEnd=${mmddyyyy(dateTo)}`;

  const raw = await apiGet<{ data: any[] }>(path);
  return (raw.data ?? [])
    .filter((item) => (item.TipoDeComprobante ?? item.tipoDeComprobante) === tipoComprobante)
    .map((item) => ({
      uuid: item.UUID ?? item.uuid,
      folio: String(item.Folio ?? item.folio ?? ""),
      tipoDocumento: tipo,
      fechaTimbrado: item.FechaTimbrado ?? item.CreationDate ?? item.fecha ?? new Date().toISOString(),
      total: Number(item.Total ?? item.total ?? 0),
      ordenRelacionada: item.OrdenRelacionada ?? undefined,
    }));
}

export async function downloadPdf(uuid: string): Promise<Buffer> {
  return apiGetBinary(`/cfdi40/${uuid}/pdf`);
}

export async function downloadXml(uuid: string): Promise<Buffer> {
  return apiGetBinary(`/cfdi40/${uuid}/xml`);
}
