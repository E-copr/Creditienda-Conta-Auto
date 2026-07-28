import { config } from "../config.js";
import { getExistingUuids, getPendingSourceInvoices } from "../tracking/sheetLog.js";

/**
 * Prueba de solo lectura: valida la conexion a ambos Sheets (credenciales
 * de la cuenta de servicio, IDs, nombres de pestana y encabezados) sin
 * escribir nada en la bitacora real.
 */
async function main() {
  console.log(`Bitacora: ${config.sheets.sheetId} / pestana "${config.sheets.tabBitacora}"`);
  const existentes = await getExistingUuids();
  console.log(`OK. UUIDs ya registrados en la bitacora: ${existentes.size}`);

  console.log(`\nSheet fuente (Make): ${config.sheets.sourceSheetId} / pestana "${config.sheets.sourceSheetTab}"`);
  const dateTo = new Date();
  const dateFrom = new Date(dateTo.getTime() - config.job.defaultLookbackDays * 24 * 60 * 60 * 1000);
  const pendientes = await getPendingSourceInvoices(dateFrom, dateTo);
  console.log(`OK. Facturas "success" en los ultimos ${config.job.defaultLookbackDays} dias: ${pendientes.length}`);
  console.log("Primeros 5 ejemplos (UUID / Invoice UID / Numero de orden):");
  for (const inv of pendientes.slice(0, 5)) {
    console.log(`  ${inv.uuid} / ${inv.invoiceUid} / ${inv.numeroOrden}`);
  }
}

main().catch((err) => {
  console.error("Fallo la prueba de Sheets:", err.message);
  process.exitCode = 1;
});
