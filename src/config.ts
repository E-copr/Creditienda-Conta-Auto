import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta la variable de entorno requerida: ${name}`);
  }
  return value;
}

export const config = {
  facturaCom: {
    baseUrl: process.env.FACTURACOM_API_BASE_URL ?? "https://api.factura.com/v4",
    apiKey: required("FACTURACOM_API_KEY"),
    secretKey: required("FACTURACOM_SECRET_KEY"),
    pluginKey: process.env.FACTURACOM_PLUGIN_KEY ?? "",
  },
  simco: {
    loginUrl: process.env.SIMCO_LOGIN_URL ?? "https://creditienda-proveedores.concredito.com.mx/login",
    username: required("SIMCO_USERNAME"),
    password: required("SIMCO_PASSWORD"),
    totpSecret: required("SIMCO_TOTP_SECRET"),
    headless: (process.env.HEADLESS ?? "true") !== "false",
    chromiumExecutablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
  },
  sheets: {
    // Sheet propio para la bitacora de subidas a SIMCO (nuevo, creado para este proyecto).
    sheetId: required("GOOGLE_SHEET_ID"),
    serviceAccountJsonPath: process.env.GOOGLE_SERVICE_ACCOUNT_JSON_PATH ?? "./google-service-account.json",
    tabBitacora: process.env.SHEET_TAB_BITACORA ?? "Bitacora SIMCO",

    // Sheet que YA llena el Make.com existente al generar cada factura
    // (UUID <-> Order number). Es de solo lectura para este job.
    sourceSheetId: process.env.SOURCE_SHEET_ID ?? "1E-UEacAMnJOItUERFv9rvQdI6Laa30ZUzA-tQ23krms",
    sourceSheetTab: required("SOURCE_SHEET_TAB"),
    sourceUuidHeader: process.env.SOURCE_UUID_HEADER ?? "UUID",
    // Confirmado con el equipo: SIMCO espera el valor de "Shopify Order ID"
    // (no "Order number") como Numero de orden en el CSV auxiliar.
    sourceOrderNumberHeader: process.env.SOURCE_ORDER_NUMBER_HEADER ?? "Shopify Order ID",
    sourceStatusHeader: process.env.SOURCE_STATUS_HEADER ?? "Estado",
  },
  slack: {
    webhookUrl: process.env.SLACK_WEBHOOK_URL ?? "",
  },
  job: {
    defaultLookbackDays: Number(process.env.DEFAULT_LOOKBACK_DAYS ?? "3"),
    downloadDir: process.env.DOWNLOAD_DIR ?? "./tmp/facturas",
  },
};
