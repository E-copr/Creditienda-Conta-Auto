import "dotenv/config";

/**
 * Cada job valida al inicio (con assertRequiredEnv) solo las variables que
 * el REALMENTE usa. config no revienta al importarse por variables de otro
 * job que no se este corriendo (ej. test:login-simco no debe exigir las
 * variables de Google Sheets, que no toca).
 */
export function assertRequiredEnv(names: string[]): void {
  const missing = names.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(`Faltan variables de entorno requeridas: ${missing.join(", ")}`);
  }
}

export const config = {
  facturaCom: {
    baseUrl: process.env.FACTURACOM_API_BASE_URL ?? "https://api.factura.com/v4",
    apiKey: process.env.FACTURACOM_API_KEY ?? "",
    secretKey: process.env.FACTURACOM_SECRET_KEY ?? "",
    pluginKey: process.env.FACTURACOM_PLUGIN_KEY ?? "",
  },
  simco: {
    loginUrl: process.env.SIMCO_LOGIN_URL ?? "https://creditienda-proveedores.concredito.com.mx/login",
    username: process.env.SIMCO_USERNAME ?? "",
    password: process.env.SIMCO_PASSWORD ?? "",
    totpSecret: process.env.SIMCO_TOTP_SECRET ?? "",
    headless: (process.env.HEADLESS ?? "true") !== "false",
    chromiumExecutablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
  },
  sheets: {
    // Sheet propio para la bitacora de subidas a SIMCO (nuevo, creado para este proyecto).
    sheetId: process.env.GOOGLE_SHEET_ID ?? "1RT06W3OF25sj8KAUwoQAvVy9c2M24iEZ1vBltGEFRR4",
    serviceAccountJsonPath: process.env.GOOGLE_SERVICE_ACCOUNT_JSON_PATH ?? "./google-service-account.json",
    tabBitacora: process.env.SHEET_TAB_BITACORA ?? "Bitacora Carga SIMCO - Claude",

    // Sheet que YA llena el Make.com existente al generar cada factura
    // (UUID <-> Order number). Es de solo lectura para este job.
    sourceSheetId: process.env.SOURCE_SHEET_ID ?? "1E-UEacAMnJOItUERFv9rvQdI6Laa30ZUzA-tQ23krms",
    sourceSheetTab: process.env.SOURCE_SHEET_TAB ?? "",
    sourceUuidHeader: process.env.SOURCE_UUID_HEADER ?? "UUID",
    // "Invoice UID" (corto, ej. 6a3b053b2e88d) es el identificador que pide
    // la API de factura.com para descargar PDF/XML - NO es el UUID/folio
    // fiscal largo, son cosas distintas (confirmado con factura.com).
    sourceInvoiceUidHeader: process.env.SOURCE_INVOICE_UID_HEADER ?? "Invoice UID",
    // Confirmado con el equipo: SIMCO espera el valor de "Shopify Order ID"
    // (no "Order number") como Numero de orden en el CSV auxiliar.
    sourceOrderNumberHeader: process.env.SOURCE_ORDER_NUMBER_HEADER ?? "Shopify Order ID",
    sourceStatusHeader: process.env.SOURCE_STATUS_HEADER ?? "Estado",
    sourceFechaHeader: process.env.SOURCE_FECHA_HEADER ?? "Fecha",
  },
  slack: {
    webhookUrl: process.env.SLACK_WEBHOOK_URL ?? "",
  },
  job: {
    defaultLookbackDays: Number(process.env.DEFAULT_LOOKBACK_DAYS ?? "3"),
    downloadDir: process.env.DOWNLOAD_DIR ?? "./tmp/facturas",
  },
};
