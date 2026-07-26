import { config } from "../config.js";
import { getExistingUuids, getOrderNumberMap } from "../tracking/sheetLog.js";

/**
 * Prueba de solo lectura: valida la conexion a ambos Sheets (credenciales
 * de la cuenta de servicio, IDs, nombres de pestana y encabezados) sin
 * escribir nada en la bitacora real.
 */
async function main() {
  console.log(`Bitacora: ${config.sheets.sheetId} / pestana "${config.sheets.tabBitacora}"`);
  const existentes = await getExistingUuids();
  console.log(`OK. UUIDs ya registrados en la bitacora: ${existentes.size}`);

  console.log(
    `\nSheet fuente (Make): ${config.sheets.sourceSheetId} / pestana "${config.sheets.sourceSheetTab}"`,
  );
  const orderMap = await getOrderNumberMap();
  console.log(`OK. Filas con "success" y numero de orden resoluble: ${orderMap.size}`);
  console.log("Primeros 5 ejemplos (UUID -> Numero de orden):");
  let i = 0;
  for (const [uuid, numeroOrden] of orderMap) {
    if (i++ >= 5) break;
    console.log(`  ${uuid} -> ${numeroOrden}`);
  }
}

main().catch((err) => {
  console.error("Fallo la prueba de Sheets:", err.message);
  process.exitCode = 1;
});
