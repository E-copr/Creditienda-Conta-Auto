import { assertRequiredEnv } from "../config.js";
import { cancelInvoice } from "../facturaCom/client.js";
import { getAllUuidToInvoiceUidMap } from "../tracking/sheetLog.js";

assertRequiredEnv(["FACTURACOM_API_KEY", "FACTURACOM_SECRET_KEY"]);

/**
 * Cancela CFDIs por UUID (motivo 02: con errores, sin relacion - no
 * requiere folio sustituto). Traduce cada UUID largo al "Invoice UID"
 * corto que pide la API (leyendo el sheet fuente), igual que la descarga.
 *
 * SEGURIDAD: por default es un DRY RUN (solo muestra que se haria, no
 * cancela nada de verdad). Para ejecutar la cancelacion real hay que
 * pasar explicitamente CONFIRM_CANCEL=si - esto es una accion fiscal real
 * ante el SAT, dificil de revertir, no debe correr por accidente.
 *
 * Uso:
 *   npm run cancel:facturas                  (dry run, no cancela nada)
 *   CONFIRM_CANCEL=si npm run cancel:facturas (cancela de verdad)
 */
const UUIDS_A_CANCELAR = [
  "a494c101-4906-45af-8dfd-4d88807c3aa2",
  "82334b73-8d0d-460d-b7a1-cd3d99b9ace9",
  "178286d6-67e6-45b2-95bd-1ed668da1d10",
  "be216a20-e7e1-4a13-a59f-453f78f57179",
  "297eeed7-399d-4bdd-a7a3-2277ba615aea",
  "9e340903-6a7e-40e4-bb16-439729dc9603",
  "1c960b2f-b3f2-487f-aaa7-18bc48602493",
  "b49b9a88-6ce7-48dd-96cf-5e3d287b652c",
  "e7f73ca4-418b-49a2-bf96-52a031e7620b",
  "d94ed73d-1f96-47fe-9963-e34bdd47e4c1",
  "40698fa7-617f-4965-b294-ba3fe23fa842",
  "7d9f63b0-978c-4e92-b8aa-c57bb842b248",
  "ee0aaa28-79f7-43b7-99b6-efe5bc4391a0",
];

const MOTIVO = "02";
const EJECUTAR = (process.env.CONFIRM_CANCEL ?? "").toLowerCase() === "si";

async function main() {
  const mapa = await getAllUuidToInvoiceUidMap();

  console.log(`${EJECUTAR ? "EJECUTANDO cancelacion real" : "DRY RUN (nada se cancela todavia)"} - motivo ${MOTIVO}\n`);

  const sinMapear: string[] = [];
  const resueltos: { uuid: string; invoiceUid: string }[] = [];

  for (const uuid of UUIDS_A_CANCELAR) {
    const invoiceUid = mapa.get(uuid);
    if (!invoiceUid) {
      sinMapear.push(uuid);
      continue;
    }
    resueltos.push({ uuid, invoiceUid });
  }

  console.log(`Resueltos: ${resueltos.length} de ${UUIDS_A_CANCELAR.length}`);
  for (const r of resueltos) console.log(`  ${r.uuid} -> Invoice UID ${r.invoiceUid}`);

  if (sinMapear.length > 0) {
    console.warn(`\nNO se encontro Invoice UID para ${sinMapear.length} UUID (no se van a tocar):`);
    for (const u of sinMapear) console.warn(`  ${u}`);
  }

  if (!EJECUTAR) {
    console.log("\nDry run terminado. Para ejecutar de verdad: CONFIRM_CANCEL=si npm run cancel:facturas");
    return;
  }

  console.log("\nCancelando...");
  let exitosas = 0;
  let fallidas = 0;
  for (const r of resueltos) {
    try {
      const resultado = await cancelInvoice(r.invoiceUid, MOTIVO);
      console.log(`  ${resultado.ok ? "OK" : "FALLO"} ${r.uuid}: ${resultado.mensaje}`);
      if (resultado.ok) exitosas++;
      else fallidas++;
    } catch (err) {
      console.error(`  ERROR ${r.uuid}: ${(err as Error).message}`);
      fallidas++;
    }
    // Pausa breve entre llamadas para no saturar la API.
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  console.log(`\nListo. Canceladas: ${exitosas} · Fallidas: ${fallidas} · Sin mapear: ${sinMapear.length}`);
}

main().catch((err) => {
  console.error("Fallo el script de cancelacion:", err.message);
  process.exitCode = 1;
});
