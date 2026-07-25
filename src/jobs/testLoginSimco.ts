import { mkdir } from "node:fs/promises";
import path from "node:path";
import { assertRequiredEnv } from "../config.js";
import { openSimcoSessionForInspection } from "../simco/browser.js";

assertRequiredEnv(["SIMCO_USERNAME", "SIMCO_PASSWORD", "SIMCO_TOTP_SECRET"]);

/**
 * Prueba de solo-lectura: hace login + navega hasta "Carga de facturas" y
 * toma capturas de cada paso. NO sube ni envia ningun archivo. Sirve para
 * validar que las credenciales/TOTP funcionan y que los selectores de
 * src/simco/browser.ts siguen coincidiendo con la pantalla real de SIMCO
 * antes de confiarle una corrida completa.
 *
 * Uso: npm run test:login-simco
 * (usa las mismas variables de entorno que el job principal; ver .env.example)
 */
async function main() {
  const shotDir = path.resolve("./tmp/simco-login-test");
  await mkdir(shotDir, { recursive: true });

  console.log(`Capturas de pantalla en: ${shotDir}`);
  const { browser } = await openSimcoSessionForInspection(shotDir);

  try {
    console.log("Login + navegacion hasta 'Carga de facturas' exitosos. No se subio nada.");
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("Fallo la prueba de login:", err.message);
  process.exitCode = 1;
});
