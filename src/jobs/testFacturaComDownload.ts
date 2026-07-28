import { assertRequiredEnv, config } from "../config.js";

assertRequiredEnv(["FACTURACOM_API_KEY", "FACTURACOM_SECRET_KEY"]);

/**
 * Prueba de solo lectura: intenta descargar el PDF/XML usando el "Invoice
 * UID" corto de factura.com (columna "Invoice UID" del sheet de Make, NO
 * la columna "UUID" larga/folio fiscal) — factura.com confirmo que el
 * endpoint de descarga requiere el UID corto, no el UUID.
 */
const UID_DE_PRUEBA = process.argv[2] ?? "6a3b053b2e88d";

const headers = {
  "F-PLUGIN": config.facturaCom.pluginKey,
  "F-Api-Key": config.facturaCom.apiKey,
  "F-Secret-Key": config.facturaCom.secretKey,
};

async function probar(nombre: string, url: string) {
  console.log(`\n=== ${nombre}: GET ${url} ===`);
  try {
    const res = await fetch(url, { headers });
    const contentType = res.headers.get("content-type") ?? "";
    console.log(`Status: ${res.status} ${res.statusText} — Content-Type: ${contentType}`);
    if (contentType.includes("json") || contentType.includes("text")) {
      console.log((await res.text()).slice(0, 500));
    } else {
      const buf = Buffer.from(await res.arrayBuffer());
      console.log(`Body binario recibido: ${buf.length} bytes`);
    }
  } catch (err) {
    console.error("Error de red:", (err as Error).message);
  }
}

async function main() {
  console.log(`Probando descarga para Invoice UID: ${UID_DE_PRUEBA}`);
  await probar("PDF", `https://api.factura.com/v4/cfdi40/${UID_DE_PRUEBA}/pdf`);
  await probar("XML", `https://api.factura.com/v4/cfdi40/${UID_DE_PRUEBA}/xml`);
}

main();
