# Creditienda — Conta Auto

Automatización que descarga las facturas timbradas en **factura.com** y las
sube automáticamente al portal de proveedores de **SIMCO**
(`Carga de facturas`), sin intervención manual diaria — usable tanto por ti
como por tus colaboradores.

## Qué hace

1. Consulta la API de factura.com y descarga PDF + XML de las facturas
   timbradas recientes que aún no se han subido a SIMCO.
2. Resuelve el número de orden de CrediTienda de cada factura (XML o mapeo
   en Google Sheets). Si no lo encuentra, **no la sube** — la marca como
   excepción para revisión humana, nunca inventa datos.
3. Inicia sesión en SIMCO (usuario/contraseña + código TOTP generado
   automáticamente con la llave de la cuenta de servicio) usando un
   navegador headless (Playwright).
4. Sube el lote de PDF/XML junto con el archivo auxiliar `.csv`
   (`UUID factura,Numero de orden`) y envía el formulario.
5. Lee el resultado (éxitos / errores), descarga el reporte de errores si
   aplica y lo traduce con el catálogo de errores de SIMCO.
6. Registra cada factura en una pestaña de Google Sheets (bitácora,
   visible para todo el equipo) y notifica el resumen por Slack.

## Qué NO hace (todavía)

- Notas de crédito y complementos de pago: usan otras pantallas de SIMCO
  no documentadas aún — ver `docs/SETUP.md` sección 8.

## Puesta en marcha

Ver [`docs/SETUP.md`](docs/SETUP.md) — incluye cómo obtener la llave TOTP
de la cuenta de servicio, configurar el Google Sheet compartido, Slack, y
desplegar en Railway con un cron job para que corra sola.

## Desarrollo local

```bash
npm install
npx playwright install --with-deps chromium
cp .env.example .env   # llena los valores, nunca lo subas a git
npm run dev:upload:facturas
```

## Estructura

```
src/
  config.ts              variables de entorno
  facturaCom/client.ts    descarga de facturas via API factura.com
  simco/
    totp.ts               genera el codigo de Google Authenticator
    browser.ts             login + subida en SIMCO (Playwright)
    errorCatalog.ts        catalogo de errores de SIMCO
  tracking/sheetLog.ts     bitacora y mapeo de ordenes (Google Sheets)
  notify/slack.ts          notificacion de resumen por Slack
  util/                    csv auxiliar, extraccion de orden desde XML, parseo de reporte de errores
  jobs/uploadFacturas.ts   orquestador end-to-end
```
