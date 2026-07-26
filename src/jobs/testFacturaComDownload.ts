import { assertRequiredEnv, config } from "../config.js";

assertRequiredEnv(["FACTURACOM_API_KEY", "FACTURACOM_SECRET_KEY"]);

/**
 * Prueba de solo lectura: intenta descargar el PDF/XML de un UUID real
 * (tomado del sheet de Make) para confirmar si la descarga por UUID esta
 * disponible en el plan actual, independientemente de si el endpoint de
 * listado masivo (/cfdi40/list) esta bloqueado por plan/plugin.
 */
const UUID_DE_PRUEBA = process.argv[2] ?? "9463fc3f-f616-4b8f-90aa-3ee33da8181b";

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
  console.log(`Probando descarga para UUID: ${UUID_DE_PRUEBA}`);
  await probar("PDF (patron cfdi40/{uid}/pdf)", `https://api.factura.com/v4/cfdi40/${UUID_DE_PRUEBA}/pdf`);
  await probar("XML (patron cfdi40/{uid}/xml)", `https://api.factura.com/v4/cfdi40/${UUID_DE_PRUEBA}/xml`);
  await probar("PDF (patron cfdi40/pdf/{uid})", `https://api.factura.com/v4/cfdi40/pdf/${UUID_DE_PRUEBA}`);
  await probar("XML (patron cfdi40/xml/{uid})", `https://api.factura.com/v4/cfdi40/xml/${UUID_DE_PRUEBA}`);
}

main();
