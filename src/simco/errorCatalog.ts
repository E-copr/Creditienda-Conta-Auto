/**
 * Catalogo de errores de "Carga de facturas" en SIMCO, tal como lo
 * documenta CrediTienda (Catalogo de Errores compartido por el proveedor).
 * Se usa para traducir los codigos del reporte de errores a un mensaje
 * legible en las notificaciones y en la bitacora.
 */
export const SIMCO_ERROR_CATALOG: Record<string, { descripcion: string; solucion: string }> = {
  "1000": {
    descripcion: "Factura sin numero de orden",
    solucion: "Ligar con Addenda, Descripcion en XML o Archivo auxiliar.",
  },
  "1001": {
    descripcion: "Metodo de pago deberia ser PUE o PPD",
    solucion: "Emitir la factura solo con PUE o PPD.",
  },
  "1002": {
    descripcion: "Combinacion invalida de metodo de pago y forma de pago",
    solucion: "Revisar la regla fiscal y emitir con una combinacion valida.",
  },
  "1003": {
    descripcion: "Solo se permiten facturas del ano en curso",
    solucion: "Solo se permiten facturas emitidas en el ano actual.",
  },
  "1004": {
    descripcion: "XML con campo incorrecto: TasaOCuota (IVA 0 mal declarado)",
    solucion: "Corregir el campo en el sistema de facturacion.",
  },
  "1005": {
    descripcion: "XML con campo incorrecto",
    solucion: "Verificar la informacion y volver a timbrar la factura.",
  },
  "1006": {
    descripcion: "XML con campo faltante",
    solucion: "Completar la informacion y volver a timbrar la factura.",
  },
  "1007": {
    descripcion: "La orden vinculada a la factura esta cancelada",
    solucion: "No cargar facturas en ordenes canceladas.",
  },
  "1008": {
    descripcion: "No se encontraron datos de la orden",
    solucion: "Verificar que el numero de orden exista en SIMCO.",
  },
  "1009": {
    descripcion: "Esta factura ya se encuentra conciliada",
    solucion: "No volver a cargarla; marcar como ya procesada en la bitacora.",
  },
  "1010": {
    descripcion: "Archivo cargado anteriormente, pendiente de conciliar",
    solucion: "Esperar a que termine la conciliacion antes de reintentar.",
  },
  "1011": {
    descripcion: "El monto de la factura no coincide con el de la transaccion",
    solucion: "Verificar que el total de la factura sea igual al de la orden.",
  },
};

export function describeSimcoError(code: string): string {
  const entry = SIMCO_ERROR_CATALOG[code];
  if (!entry) return `Error ${code} (codigo no documentado en el catalogo actual)`;
  return `[${code}] ${entry.descripcion} — ${entry.solucion}`;
}
