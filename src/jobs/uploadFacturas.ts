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
import { extractFolio } from "../util/cfdi.js";
import { parseSimcoErrorReport } from "../util/parseErrorReport.js";
import { formatFechaMexico } from "../util/date.js";
import { notifyAll } from "../notify/index.js";

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
  let pendientes = candidatas.filter((inv) => !yaRegistradas.has(inv.uuid));

  if (config.job.onlyInvoiceUids.length > 0) {
    const filtro = new Set(config.job.onlyInvoiceUids);
    pendientes = pendientes.filter((inv) => filtro.has(inv.invoiceUid));
    console.log(`Filtrando por ONLY_INVOICE_UIDS: ${pendientes.length} de las candidatas coinciden.`);
  }

  if (config.job.maxInvoicesPerRun > 0 && pendientes.length > config.job.maxInvoicesPerRun) {
    console.log(
      `Limitando esta corrida a ${config.job.maxInvoicesPerRun} de ${pendientes.length} facturas pendientes (MAX_INVOICES_PER_RUN).`,
    );
    pendientes = pendientes.slice(0, config.job.maxInvoicesPerRun);
  }

  if (pendientes.length === 0) {
    console.log("No hay facturas nuevas por procesar.");
    await notifyAll({ totalProcesadas: 0, exitosas: 0, conError: 0, sinNumeroOrden: 0, detalleErrores: [] });
    return;
  }

  const downloadDir = path.resolve(config.job.downloadDir, `run-${Date.now()}`);
  await mkdir(downloadDir, { recursive: true });

  const listas: { invoice: SourceInvoiceRow; files: FacturaFilePair; folio: string }[] = [];

  for (const inv of pendientes) {
    const pdfBuffer = await downloadPdf(inv.invoiceUid);
    const xmlBuffer = await downloadXml(inv.invoiceUid);

    const pdfPath = path.join(downloadDir, `${inv.invoiceUid}.pdf`);
    const xmlPath = path.join(downloadDir, `${inv.invoiceUid}.xml`);
    await writeFile(pdfPath, pdfBuffer);
    await writeFile(xmlPath, xmlBuffer);

    const folio = extractFolio(xmlBuffer.toString("utf-8"));
    listas.push({ invoice: inv, files: { pdfPath, xmlPath }, folio });
  }

  const csvPath = await writeAuxiliarCsv(
    listas.map((l) => ({ uuid: l.invoice.uuid, numeroOrden: l.invoice.numeroOrden })),
    downloadDir,
  );

  const resultado = await withSimcoSession((page) =>
    uploadFacturasConCsv(page, listas.map((l) => l.files), csvPath, downloadDir),
  );

  const detalleErrores: string[] = [];
  const erroresPorInvoiceUid = new Map<string, string>();
  if (resultado.reporteErroresPath) {
    const errores = await parseSimcoErrorReport(resultado.reporteErroresPath);
    for (const err of errores) {
      const mensaje = err.codigoError ? describeSimcoError(err.codigoError) : err.mensaje;
      if (err.invoiceUid) erroresPorInvoiceUid.set(err.invoiceUid, mensaje);
      detalleErrores.push(`${err.invoiceUid || "(invoice uid no identificado)"}: ${mensaje}`);
    }
  }

  const MENSAJE_NO_CONFIRMADO =
    "Resultado no confirmado por SIMCO en pantalla - revisar manualmente (ver captura resultado-final.png de esta corrida)";
  const MENSAJE_ERROR_SIN_DETALLE =
    "SIMCO reporto error en el lote pero no se pudo identificar el detalle por factura - revisar manualmente";

  // Como se sabe el conteo agregado real (exitosas/conError, confirmado
  // contra el texto de SIMCO), los casos sin ambiguedad NO dependen del
  // reporte de errores por Invoice UID: si todo el lote fue exitoso o todo
  // fallo, ya se sabe el resultado de cada factura sin necesidad de ese
  // reporte. Solo en un resultado PARCIAL (algunas si, algunas no, con mas
  // de 1 factura) hace falta el detalle por Invoice UID - y si ese detalle
  // no cuadra, se falla cerrado (todo sin confirmar) en vez de arriesgar
  // una atribucion incorrecta.
  let bitacoraRows: BitacoraRow[];
  if (!resultado.confirmado) {
    bitacoraRows = listas.map((l) => bitacoraRow(l, MENSAJE_NO_CONFIRMADO));
  } else if (resultado.conError === 0) {
    bitacoraRows = listas.map((l) => bitacoraRow(l, undefined));
  } else if (resultado.exitosas === 0) {
    bitacoraRows = listas.map((l) =>
      bitacoraRow(l, erroresPorInvoiceUid.get(l.invoice.invoiceUid) ?? MENSAJE_ERROR_SIN_DETALLE),
    );
  } else if (erroresPorInvoiceUid.size === resultado.conError) {
    bitacoraRows = listas.map((l) => bitacoraRow(l, erroresPorInvoiceUid.get(l.invoice.invoiceUid)));
  } else {
    console.warn(
      `[uploadFacturas] Resultado parcial (${resultado.exitosas}/${resultado.totalEnviadas}) pero el reporte de errores ` +
        `solo identifico ${erroresPorInvoiceUid.size} de ${resultado.conError} - no se puede atribuir con certeza, se marca todo sin confirmar.`,
    );
    bitacoraRows = listas.map((l) => bitacoraRow(l, MENSAJE_NO_CONFIRMADO));
  }

  function bitacoraRow(l: (typeof listas)[number], error: string | undefined): BitacoraRow {
    return {
      uuid: l.invoice.uuid,
      tipoDocumento: "factura",
      numeroOrden: l.invoice.numeroOrden,
      nombreDocumento: l.folio || l.invoice.numeroOrden,
      fechaTimbrado: l.invoice.fecha,
      estatus: error ? "ERROR" : "SUBIDA_OK",
      detalleError: error,
      fechaSubida: formatFechaMexico(new Date()),
    };
  }

  await appendBitacoraRows(bitacoraRows);

  await notifyAll({
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
