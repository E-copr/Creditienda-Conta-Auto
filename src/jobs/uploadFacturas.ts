import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { assertRequiredEnv, config } from "../config.js";
import { downloadPdf, downloadXml } from "../facturaCom/client.js";
import { describeSimcoError } from "../simco/errorCatalog.js";
import { uploadFacturasConCsv, withSimcoSession, type FacturaFilePair } from "../simco/browser.js";
import {
  appendBitacoraRows,
  getExistingUuids,
  getPendingSourceInvoices,
  type BitacoraRow,
  type SourceInvoiceRow,
} from "../tracking/sheetLog.js";
import { writeAuxiliarCsv } from "../util/csv.js";
import { parseSimcoErrorReport } from "../util/parseErrorReport.js";
import { notifySlack } from "../notify/slack.js";

assertRequiredEnv([
  "FACTURACOM_API_KEY",
  "FACTURACOM_SECRET_KEY",
  "SIMCO_USERNAME",
  "SIMCO_PASSWORD",
  "SIMCO_TOTP_SECRET",
  "SOURCE_SHEET_TAB",
]);

/**
 * Job principal: sheet de Make (fuente de facturas ya generadas) ->
 * descarga PDF/XML de factura.com por Invoice UID -> sube a SIMCO ->
 * registra bitacora -> notifica al equipo.
 *
 * Cubre por ahora solo "facturas" (Carga de facturas). Notas de credito y
 * complementos de pago usan otras pantallas de SIMCO (ver sidebar:
 * "Notas de credito" / "Cargar complementos de pago") que aun no se han
 * mapeado; se agregan como su propio job siguiendo este mismo patron mas
 * adelante (Fase 2).
 */
async function main() {
  const lookbackDays = config.job.defaultLookbackDays;
  const dateTo = new Date();
  const dateFrom = new Date(dateTo.getTime() - lookbackDays * 24 * 60 * 60 * 1000);

  console.log(`Buscando facturas del sheet fuente entre ${dateFrom.toISOString()} y ${dateTo.toISOString()}`);
  const candidatas = await getPendingSourceInvoices(dateFrom, dateTo);

  const yaRegistradas = await getExistingUuids();
  const pendientes = candidatas.filter((inv) => !yaRegistradas.has(inv.uuid));

  if (pendientes.length === 0) {
    console.log("No hay facturas nuevas por procesar.");
    await notifySlack({ totalProcesadas: 0, exitosas: 0, conError: 0, sinNumeroOrden: 0, detalleErrores: [] });
    return;
  }

  const downloadDir = path.resolve(config.job.downloadDir, `run-${Date.now()}`);
  await mkdir(downloadDir, { recursive: true });

  const listas: { invoice: SourceInvoiceRow; files: FacturaFilePair }[] = [];

  for (const inv of pendientes) {
    const pdfBuffer = await downloadPdf(inv.invoiceUid);
    const xmlBuffer = await downloadXml(inv.invoiceUid);

    const pdfPath = path.join(downloadDir, `${inv.invoiceUid}.pdf`);
    const xmlPath = path.join(downloadDir, `${inv.invoiceUid}.xml`);
    await writeFile(pdfPath, pdfBuffer);
    await writeFile(xmlPath, xmlBuffer);

    listas.push({ invoice: inv, files: { pdfPath, xmlPath } });
  }

  const csvPath = await writeAuxiliarCsv(
    listas.map((l) => ({ uuid: l.invoice.uuid, numeroOrden: l.invoice.numeroOrden })),
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

  const bitacoraRows: BitacoraRow[] = listas.map((l) => {
    const error = erroresPorUuid.get(l.invoice.uuid);
    return {
      uuid: l.invoice.uuid,
      tipoDocumento: "factura",
      numeroOrden: l.invoice.numeroOrden,
      nombreDocumento: l.invoice.numeroOrden,
      fechaTimbrado: l.invoice.fecha,
      estatus: error ? "ERROR" : "SUBIDA_OK",
      detalleError: error,
      fechaSubida: new Date().toISOString(),
    };
  });

  await appendBitacoraRows(bitacoraRows);

  await notifySlack({
    totalProcesadas: pendientes.length,
    exitosas: resultado.exitosas,
    conError: resultado.conError,
    sinNumeroOrden: 0,
    detalleErrores,
  });

  console.log(
    `Listo. Enviadas: ${resultado.totalEnviadas} · Exitosas: ${resultado.exitosas} · Con error: ${resultado.conError}`,
  );

  if (resultado.conError > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("Fallo el job de carga de facturas:", err);
  process.exitCode = 1;
});
