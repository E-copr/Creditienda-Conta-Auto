import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import { downloadPdf, downloadXml, listInvoices, type FacturaComInvoice } from "../facturaCom/client.js";
import { describeSimcoError } from "../simco/errorCatalog.js";
import { uploadFacturasConCsv, withSimcoSession, type FacturaFilePair } from "../simco/browser.js";
import { appendBitacoraRows, getExistingUuids, getOrderNumberMap, type BitacoraRow } from "../tracking/sheetLog.js";
import { extractOrderNumberFromXml } from "../util/xmlOrder.js";
import { writeAuxiliarCsv } from "../util/csv.js";
import { parseSimcoErrorReport } from "../util/parseErrorReport.js";
import { notifySlack } from "../notify/slack.js";

/**
 * Job principal: factura.com -> descarga -> resuelve numero de orden ->
 * sube a SIMCO -> registra bitacora -> notifica al equipo.
 *
 * Cubre por ahora solo "facturas" (Carga de facturas). Notas de credito y
 * complementos de pago usan otras pantallas de SIMCO (ver sidebar:
 * "Notas de credito" / "Cargar complementos de pago") que aun no se han
 * mapeado; se agregan como su propio job siguiendo este mismo patron en
 * cuanto se documente ese flujo (Fase 2, igual que en el blueprint
 * original de conciliacion).
 */
async function main() {
  const lookbackDays = config.job.defaultLookbackDays;
  const dateTo = new Date();
  const dateFrom = new Date(dateTo.getTime() - lookbackDays * 24 * 60 * 60 * 1000);

  console.log(`Buscando facturas timbradas entre ${dateFrom.toISOString()} y ${dateTo.toISOString()}`);
  const invoices = await listInvoices("factura", dateFrom, dateTo);

  const yaRegistradas = await getExistingUuids();
  const pendientes = invoices.filter((inv) => !yaRegistradas.has(inv.uuid));

  if (pendientes.length === 0) {
    console.log("No hay facturas nuevas por procesar.");
    await notifySlack({ totalProcesadas: 0, exitosas: 0, conError: 0, sinNumeroOrden: 0, detalleErrores: [] });
    return;
  }

  const orderMap = await getOrderNumberMap();
  const downloadDir = path.resolve(config.job.downloadDir, `run-${Date.now()}`);
  await mkdir(downloadDir, { recursive: true });

  const listas: { invoice: FacturaComInvoice; files: FacturaFilePair; numeroOrden: string }[] = [];
  const sinOrden: FacturaComInvoice[] = [];

  for (const inv of pendientes) {
    const pdfBuffer = await downloadPdf(inv.uuid);
    const xmlBuffer = await downloadXml(inv.uuid);

    const pdfPath = path.join(downloadDir, `${inv.folio || inv.uuid}.pdf`);
    const xmlPath = path.join(downloadDir, `${inv.folio || inv.uuid}.xml`);
    await writeFile(pdfPath, pdfBuffer);
    await writeFile(xmlPath, xmlBuffer);

    const numeroOrden =
      inv.ordenRelacionada ??
      extractOrderNumberFromXml(xmlBuffer.toString("utf-8")) ??
      orderMap.get(inv.uuid);

    if (!numeroOrden) {
      sinOrden.push(inv);
      continue;
    }

    listas.push({ invoice: inv, files: { pdfPath, xmlPath }, numeroOrden });
  }

  const bitacoraRows: BitacoraRow[] = sinOrden.map((inv) => ({
    uuid: inv.uuid,
    tipoDocumento: inv.tipoDocumento,
    numeroOrden: null,
    fechaTimbrado: inv.fechaTimbrado,
    estatus: "SIN_ORDEN",
  }));

  if (listas.length === 0) {
    console.log("Ninguna factura pendiente tiene numero de orden resoluble; nada que subir a SIMCO.");
    await appendBitacoraRows(bitacoraRows);
    await notifySlack({
      totalProcesadas: pendientes.length,
      exitosas: 0,
      conError: 0,
      sinNumeroOrden: sinOrden.length,
      detalleErrores: sinOrden.map((i) => `Sin numero de orden: ${i.uuid} (folio ${i.folio})`),
    });
    return;
  }

  const csvPath = await writeAuxiliarCsv(
    listas.map((l) => ({ uuid: l.invoice.uuid, numeroOrden: l.numeroOrden })),
    downloadDir,
  );

  const resultado = await withSimcoSession((page) =>
    uploadFacturasConCsv(page, listas.map((l) => l.files), csvPath, downloadDir),
  );

  const detalleErrores: string[] = [];
  const erroresPorUuid = new Map<string, string>();
  if (resultado.reporteErroresPath) {
    const errores = await parseSimcoErrorReport(resultado.reporteErroresPath);
    for (const err of errores) {
      const mensaje = err.codigoError ? describeSimcoError(err.codigoError) : err.mensaje;
      if (err.uuid) erroresPorUuid.set(err.uuid, mensaje);
      detalleErrores.push(`${err.uuid || "(uuid no identificado)"}: ${mensaje}`);
    }
  }

  for (const l of listas) {
    const error = erroresPorUuid.get(l.invoice.uuid);
    bitacoraRows.push({
      uuid: l.invoice.uuid,
      tipoDocumento: l.invoice.tipoDocumento,
      numeroOrden: l.numeroOrden,
      fechaTimbrado: l.invoice.fechaTimbrado,
      estatus: error ? "ERROR" : "SUBIDA_OK",
      detalleError: error,
      fechaSubida: new Date().toISOString(),
    });
  }

  await appendBitacoraRows(bitacoraRows);

  await notifySlack({
    totalProcesadas: pendientes.length,
    exitosas: resultado.exitosas,
    conError: resultado.conError,
    sinNumeroOrden: sinOrden.length,
    detalleErrores: [
      ...sinOrden.map((i) => `Sin numero de orden: ${i.uuid} (folio ${i.folio})`),
      ...detalleErrores,
    ],
  });

  console.log(
    `Listo. Enviadas: ${resultado.totalEnviadas} · Exitosas: ${resultado.exitosas} · Con error: ${resultado.conError} · Sin orden: ${sinOrden.length}`,
  );

  if (resultado.conError > 0) {
    process.exitCode = 1; // marca el run como fallido para alertas de Railway
  }
}

main().catch((err) => {
  console.error("Fallo el job de carga de facturas:", err);
  process.exitCode = 1;
});
