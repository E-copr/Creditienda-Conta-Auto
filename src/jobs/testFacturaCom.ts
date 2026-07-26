import { assertRequiredEnv, config } from "../config.js";

assertRequiredEnv(["FACTURACOM_API_KEY", "FACTURACOM_SECRET_KEY"]);

/**
 * Prueba de solo lectura: la documentacion publica de factura.com no es
 * accesible por herramientas automatizadas (bloquea con 403), y las fuentes
 * indirectas se contradicen sobre el host/version exactos. Esta prueba
 * intenta varias combinaciones plausibles contra la cuenta real para
 * confirmar empiricamente cual funciona, en vez de seguir adivinando.
 */
const dateTo = new Date();
const dateFrom = new Date(dateTo.getTime() - 30 * 24 * 60 * 60 * 1000);
const mmddyyyy = (d: Date) =>
  `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;

const candidates = [
  `https://api.factura.com/api/v4/cfdi40/list?dateStart=${mmddyyyy(dateFrom)}&dateEnd=${mmddyyyy(dateTo)}`,
  `https://api.factura.com/v4/cfdi40/list?dateStart=${mmddyyyy(dateFrom)}&dateEnd=${mmddyyyy(dateTo)}`,
  `https://factura.com/api/v4/cfdi40/list?dateStart=${mmddyyyy(dateFrom)}&dateEnd=${mmddyyyy(dateTo)}`,
  `https://api.factura.com/api/v4/cfdi40?date_start=${dateFrom.toISOString().slice(0, 10)}&date_end=${dateTo.toISOString().slice(0, 10)}`,
];

const headers = {
  "F-PLUGIN": config.facturaCom.pluginKey,
  "F-Api-Key": config.facturaCom.apiKey,
  "F-Secret-Key": config.facturaCom.secretKey,
  "Content-Type": "application/json",
};

async function main() {
  for (const url of candidates) {
    console.log(`\n=== GET ${url} ===`);
    try {
      const res = await fetch(url, { headers });
      const text = await res.text();
      const looksLikeJson = text.trim().startsWith("{") || text.trim().startsWith("[");
      console.log(`Status: ${res.status} ${res.statusText} — ${looksLikeJson ? "JSON" : "no-JSON (probablemente HTML de error)"}`);
      console.log(text.slice(0, 500));
    } catch (err) {
      console.error("Error de red:", (err as Error).message);
    }
  }
}

main();
