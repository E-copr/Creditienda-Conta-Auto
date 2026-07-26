import { assertRequiredEnv, config } from "../config.js";

assertRequiredEnv(["FACTURACOM_API_KEY", "FACTURACOM_SECRET_KEY"]);

/**
 * Prueba de solo lectura: llama al endpoint de listado de factura.com tal
 * cual y muestra la respuesta CRUDA (sin el mapeo de src/facturaCom/client.ts).
 * El endpoint/parametros/nombres de campo de ese cliente son un supuesto
 * basado en la API v4 publica de factura.com — esta prueba sirve para
 * confirmar o corregir esos supuestos contra la cuenta real antes de
 * conectar la descarga real de facturas.
 */
async function main() {
  const dateTo = new Date();
  const dateFrom = new Date(dateTo.getTime() - 30 * 24 * 60 * 60 * 1000);
  const from = dateFrom.toISOString().slice(0, 10);
  const to = dateTo.toISOString().slice(0, 10);

  const path = `/cfdi40?date_start=${from}&date_end=${to}&type=I`;
  const url = `${config.facturaCom.baseUrl}${path}`;
  console.log(`GET ${url}`);

  const res = await fetch(url, {
    headers: {
      "F-PLUGIN": config.facturaCom.pluginKey,
      "F-Api-Key": config.facturaCom.apiKey,
      "F-Secret-Key": config.facturaCom.secretKey,
      "Content-Type": "application/json",
    },
  });

  console.log(`Status: ${res.status} ${res.statusText}`);
  const text = await res.text();
  console.log("Respuesta cruda (primeros 2000 caracteres):");
  console.log(text.slice(0, 2000));
}

main().catch((err) => {
  console.error("Fallo la prueba de factura.com:", err.message);
  process.exitCode = 1;
});
