import { assertRequiredEnv } from "../config.js";
import { openSimcoSessionForInspection } from "../simco/browser.js";

assertRequiredEnv(["SIMCO_USERNAME", "SIMCO_PASSWORD", "SIMCO_TOTP_SECRET"]);

/**
 * Hace login automatico (reusa el flujo ya probado) y deja el navegador
 * pausado con el Playwright Inspector abierto, justo en "Carga de
 * facturas". Desde ahi se puede interactuar a mano (arrastrar archivos,
 * marcar el radio, etc.) y el Inspector graba el codigo real con los
 * selectores correctos - sin tener que escribir usuario/contraseña/TOTP
 * a mano como en `codegen:simco`.
 *
 * Uso: npm run debug:simco-inspect
 * Requiere HEADLESS=false (si no, no hay ventana que ver).
 */
async function main() {
  const { page } = await openSimcoSessionForInspection();
  console.log("Login OK. Ventana pausada en 'Carga de facturas' - interactua y usa el Inspector para grabar.");
  await page.pause();
}

main().catch((err) => {
  console.error("Fallo:", err.message);
  process.exitCode = 1;
});
