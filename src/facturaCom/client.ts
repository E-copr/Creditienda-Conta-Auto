import { config } from "../config.js";

/**
 * Cliente para la API v4 de factura.com.
 *
 * IMPORTANTE: los nombres de endpoint/parametros de abajo siguen el patron
 * publico documentado de la API v4 de factura.com (headers F-PLUGIN /
 * F-Api-Key / F-Secret-Key, recurso /cfdi40). Verifica cada endpoint contra
 * el panel de API de tu cuenta (Configuracion > API en factura.com) antes de
 * usarlo en produccion: si tu cuenta usa una version distinta (v3/v4) o
 * nombres de parametro distintos, ajusta BASE_PATHS aqui, no en el resto del
 * codigo.
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

/** Lista CFDI timbrados entre dos fechas (inclusive) para un tipo de documento. */
export async function listInvoices(
  tipo: TipoDocumento,
  dateFrom: Date,
  dateTo: Date,
): Promise<FacturaComInvoice[]> {
  const from = dateFrom.toISOString().slice(0, 10);
  const to = dateTo.toISOString().slice(0, 10);
  const tipoComprobante = TIPO_COMPROBANTE[tipo];

  // TODO: confirma el nombre real de estos query params contra tus API docs.
  const path = `/cfdi40?date_start=${from}&date_end=${to}&type=${tipoComprobante}`;

  const raw = await apiGet<{ data: any[] }>(path);
  return (raw.data ?? []).map((item) => ({
    uuid: item.UUID ?? item.uuid,
    folio: String(item.Folio ?? item.folio ?? ""),
    tipoDocumento: tipo,
    fechaTimbrado: item.CreationDate ?? item.fecha ?? new Date().toISOString(),
    total: Number(item.Total ?? item.total ?? 0),
    ordenRelacionada: item.OrdenRelacionada ?? undefined,
  }));
}

export async function downloadPdf(uuid: string): Promise<Buffer> {
  return apiGetBinary(`/cfdi40/pdf/${uuid}`);
}

export async function downloadXml(uuid: string): Promise<Buffer> {
  return apiGetBinary(`/cfdi40/xml/${uuid}`);
}
