import { chromium, type Browser, type Page } from "playwright";
import { config } from "../config.js";
import { generateTotpCode } from "./totp.js";

/**
 * Textos/roles usados para ubicar elementos en el portal de SIMCO.
 * Se centralizan aqui para que, si SIMCO cambia el copy o el layout, solo
 * haya que tocar este objeto (o correr `npm run codegen:simco` para
 * regenerar los selectores) en vez de reescribir la logica del flujo.
 */
export const TEXT = {
  emailLabel: "Correo",
  passwordLabel: "Contraseña",
  loginButton: "INGRESAR",
  totpInputPlaceholder: "Ingresar código",
  totpHeading: "Segundo factor de autenticación",
  totpSubmitButton: "Ingresar",
  proveedoresCard: "Proveedores",
  sidebarCargaDeFacturas: "Carga de facturas",
  enviarFacturasButton: "Enviar facturas",
  reporteErroresButton: "Reporte de archivos con error",
};

export interface SimcoUploadResult {
  totalEnviadas: number;
  exitosas: number;
  conError: number;
  reporteErroresPath?: string;
}

function launchOptions() {
  return {
    headless: config.simco.headless,
    // Permite apuntar a un Chromium ya instalado (util en entornos donde no
    // se puede descargar el binario de Playwright, p.ej. sandboxes con red
    // restringida). En despliegue normal (Docker de Playwright) se deja sin
    // definir y usa el navegador que trae la imagen.
    ...(config.simco.chromiumExecutablePath
      ? { executablePath: config.simco.chromiumExecutablePath }
      : {}),
  };
}

export async function withSimcoSession<T>(
  fn: (page: Page) => Promise<T>,
): Promise<T> {
  const browser: Browser = await chromium.launch(launchOptions());
  try {
    const context = await browser.newContext({ acceptDownloads: true });
    const page = await context.newPage();
    await loginToSimco(page);
    return await fn(page);
  } finally {
    await browser.close();
  }
}

/**
 * Abre un navegador, hace login + navega hasta "Carga de facturas" y lo
 * deja abierto para que el llamador decida que hacer (usado por el script
 * de prueba `npm run test:login-simco`, que no sube ningun archivo).
 * Quien llama es responsable de cerrar el browser retornado.
 */
export async function openSimcoSessionForInspection(
  screenshotDir?: string,
): Promise<{ browser: Browser; page: Page }> {
  const browser = await chromium.launch(launchOptions());
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  await loginToSimco(page, screenshotDir);
  return { browser, page };
}

export async function loginToSimco(page: Page, screenshotDir?: string): Promise<void> {
  const shot = async (name: string) => {
    console.log(`[simco-login] ${name}`);
    if (screenshotDir) await page.screenshot({ path: `${screenshotDir}/${name}.png` }).catch(() => {});
  };

  try {
    await page.goto(config.simco.loginUrl, { waitUntil: "domcontentloaded" });
    await shot("1-login-page");

    // Paso 1: usuario y contrasena.
    await page.getByLabel(TEXT.emailLabel).fill(config.simco.username);
    await page.getByLabel(TEXT.passwordLabel).fill(config.simco.password);
    await shot("2-credenciales-llenas");
    await page.getByRole("button", { name: TEXT.loginButton }).click();
    await page.waitForTimeout(2000);
    await shot("2b-despues-de-click-ingresar");

    // Paso 2: segundo factor (TOTP). El campo no siempre expone un
    // placeholder HTML real, asi que se ubica por el titulo de la pantalla
    // y se toma el unico input de texto visible ahi.
    await page.getByText(TEXT.totpHeading, { exact: false }).waitFor({ state: "visible", timeout: 15_000 });
    const totpInput = page.locator('input:visible').first();
    await totpInput.waitFor({ state: "visible", timeout: 5_000 });
    const code = generateTotpCode(config.simco.totpSecret);
    await totpInput.fill(code);
    await shot("3-totp-lleno");
    await page.getByRole("button", { name: TEXT.totpSubmitButton }).click();
    await page.waitForTimeout(2000);
    await shot("4-despues-totp");

    // Paso 3: seleccion de modulo.
    await page.getByText(TEXT.proveedoresCard, { exact: true }).click();
    await page.waitForTimeout(1000);
    await shot("5-proveedores-home");

    // Paso 4: ir a "Carga de facturas" en el menu lateral. El elemento
    // queda fuera del viewport (el sidebar probablemente arranca
    // colapsado en la sesion automatizada) -> se dispara el click nativo
    // via JS en vez del click simulado de mouse de Playwright, para que
    // el manejador de React se ejecute sin depender de que este visible.
    const cargaFacturasLink = page.getByText(TEXT.sidebarCargaDeFacturas, { exact: true });
    await cargaFacturasLink.waitFor({ state: "attached", timeout: 10_000 });
    await cargaFacturasLink.evaluate((el) => (el as HTMLElement).click());
    await page.waitForLoadState("networkidle");
    await shot("6-carga-de-facturas");
  } catch (err) {
    console.error(`[simco-login] texto visible en la pagina al fallar: ${(await page.innerText("body").catch(() => "(no se pudo leer)")).slice(0, 500)}`);
    await shot("error-state");
    throw err;
  }
}

export interface FacturaFilePair {
  pdfPath: string;
  xmlPath: string;
}

/**
 * Sube el lote de PDF+XML de facturas y el archivo auxiliar .csv, envia el
 * formulario y regresa el resultado (exitosas / con error), descargando el
 * reporte de errores si aplica.
 */
export async function uploadFacturasConCsv(
  page: Page,
  files: FacturaFilePair[],
  csvPath: string,
  downloadDir: string,
): Promise<SimcoUploadResult> {
  const allFilePaths = files.flatMap((f) => [f.pdfPath, f.xmlPath]);

  // Selectores grabados con npm run debug:simco-inspect (Playwright
  // Inspector) contra la pantalla real de "Carga de facturas". El input
  // real puede estar mas anidado de lo que grabo el Inspector, asi que se
  // busca el <input type="file"> descendiente en vez del hijo directo.
  await page.locator(".No-Files-Preview").click();
  await page.locator(".Dropzone input[type='file']").setInputFiles(allFilePaths);

  // Radio "Archivo auxiliar (.csv)" es el segundo radio de la pantalla (indice 1).
  await page.getByRole("radio").nth(1).check();

  await page.getByText("Carga o arrastra el archivo .").click();
  await page.locator(".mc-dropzone-three input[type='file']").setInputFiles(csvPath);

  const enviarButton = page.getByRole("button", { name: TEXT.enviarFacturasButton });
  await enviarButton.waitFor({ state: "visible" });
  await enviarButton.click();

  // Aparece un modal de PROGRESO ("Enviando facturas... / X de Y factura
  // enviada. / Aceptar") que NO es el resultado final - hay que darle
  // click a su "Aceptar" para que se cierre y aparezca el resultado real.
  const aceptarProgreso = page.getByRole("button", { name: "Aceptar" });
  await aceptarProgreso.waitFor({ state: "visible", timeout: 60_000 }).catch(() => {});
  await page.screenshot({ path: `${downloadDir}/modal-progreso.png` }).catch(() => {});
  if (await aceptarProgreso.isVisible().catch(() => false)) {
    await aceptarProgreso.click();
  }

  // Ahora si esperar el resultado final (exito o envio parcial con errores).
  await page.waitForTimeout(1500);

  // Se guarda SIEMPRE una captura del resultado final, exista o no un
  // patron de texto reconocido - es la evidencia visual de que paso
  // realmente, para no depender ciegamente del parseo de texto.
  await page.screenshot({ path: `${downloadDir}/resultado-final.png` }).catch(() => {});

  const resultadoTexto = await page.innerText("body").catch(() => "");
  console.log(`[simco-upload] texto del resultado: ${resultadoTexto.slice(0, 800)}`);

  const reporteButton = page.getByRole("button", { name: TEXT.reporteErroresButton });
  const hasErrorReport = await reporteButton.isVisible().catch(() => false);

  let reporteErroresPath: string | undefined;
  if (hasErrorReport) {
    const [download] = await Promise.all([page.waitForEvent("download"), reporteButton.click()]);
    reporteErroresPath = `${downloadDir}/${download.suggestedFilename()}`;
    await download.saveAs(reporteErroresPath);
  }

  const totalEnviadas = files.length;

  // Se busca el patron real que muestra SIMCO: "N de M facturas se enviaron
  // con exito". Si no se encuentra ESTE texto explicito, NO se asume exito
  // -> se marca todo como con error/sin confirmar, para no arriesgar un
  // falso "SUBIDA_OK" en la bitacora (mas seguro para un sistema financiero
  // fallar-cerrado que fallar-abierto).
  const matchExito = resultadoTexto.match(/(\d+)\s*de\s*(\d+)\s*facturas?\s*se\s*enviaron\s*con\s*[ée]xito/i);

  let exitosas: number;
  let conError: number;
  if (matchExito) {
    exitosas = Number(matchExito[1]);
    conError = Number(matchExito[2]) - exitosas;
  } else {
    console.warn(
      "[simco-upload] No se encontro el texto de confirmacion de exito en la pantalla. " +
        "Se marca todo el lote como NO confirmado (revisar tmp/.../resultado-final.png).",
    );
    exitosas = 0;
    conError = totalEnviadas;
  }

  return { totalEnviadas, exitosas, conError, reporteErroresPath };
}
