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
  },
  sheets: {
    sheetId: required("GOOGLE_SHEET_ID"),
    serviceAccountJsonPath: process.env.GOOGLE_SERVICE_ACCOUNT_JSON_PATH ?? "./google-service-account.json",
    tabBitacora: process.env.SHEET_TAB_BITACORA ?? "Bitacora SIMCO",
    tabMapeoOrdenes: process.env.SHEET_TAB_MAPEO_ORDENES ?? "Mapeo Ordenes",
  },
  slack: {
    webhookUrl: process.env.SLACK_WEBHOOK_URL ?? "",
  },
  job: {
    defaultLookbackDays: Number(process.env.DEFAULT_LOOKBACK_DAYS ?? "3"),
    downloadDir: process.env.DOWNLOAD_DIR ?? "./tmp/facturas",
  },
};
