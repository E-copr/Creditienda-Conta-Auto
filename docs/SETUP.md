# Puesta en marcha

Esta automatización descarga facturas timbradas de factura.com y las sube al
portal de proveedores de SIMCO (`Carga de facturas`), de forma no
supervisada, dejando registro en un Google Sheet compartido y avisando por
Slack al equipo.

## 1. Cuenta de servicio en SIMCO (importante — hacer primero)

No uses tu cuenta personal para el robot. Crea o designa una cuenta de
**servicio** dedicada en SIMCO (puede ser la misma `Ecorps.usa@gmail.com` si
ya es una cuenta compartida del equipo, no personal de un colaborador
específico):

1. Entra a SIMCO con esa cuenta y activa/re-vincula el segundo factor.
2. Cuando el QR de Google Authenticator aparezca, **no lo escanees
   directamente** — la mayoría de portales muestran también un enlace
   "¿No puedes escanear el código?" o similar que revela la llave en texto
   (formato tipo `JBSWY3DPEHPK3PXP`). Copia esa llave.
3. Guarda esa llave como el secreto `SIMCO_TOTP_SECRET` (nunca la subas al
   repo — solo como variable de entorno en Railway).
4. Si SIMCO no ofrece esa opción de texto, se puede usar temporalmente una
   app como `oathtool` o cualquier lector de QR que decodifique el
   `otpauth://` y extraiga el parámetro `secret=`.

Sin esta llave, el robot no puede pasar el segundo factor y el flujo no
puede ser 100% desatendido.

## 2. Variables de entorno / secretos

Copia `.env.example` como referencia. En Railway, estas se configuran en
**Project → Variables** (no se suben al repo):

- `FACTURACOM_API_KEY`, `FACTURACOM_SECRET_KEY`, `FACTURACOM_PLUGIN_KEY`
- `SIMCO_USERNAME`, `SIMCO_PASSWORD`, `SIMCO_TOTP_SECRET`
- `GOOGLE_SHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_JSON_PATH` (o el contenido del
  JSON como variable y un pequeño script de arranque que lo escriba a
  disco — ver sección 3)
- `SLACK_WEBHOOK_URL`

## 3. Google Sheet (bitácora + mapeo de órdenes, visible para el equipo)

1. Crea un Sheet nuevo, por ejemplo "Creditienda — Bitácora SIMCO".
2. Crea dos pestañas:
   - **`Bitacora SIMCO`** con encabezados en la fila 1:
     `UUID | Tipo Documento | Numero Orden | Fecha Timbrado | Estatus | Codigo Error | Detalle Error | Fecha Subida`
   - **`Mapeo Ordenes`** con encabezados:
     `UUID factura | Numero de orden`
3. Crea una cuenta de servicio en Google Cloud Console (proyecto nuevo o
   existente) con la **Google Sheets API** habilitada, y genera una llave
   JSON.
4. Comparte el Sheet (botón "Compartir") con el correo de esa cuenta de
   servicio (`...@...iam.gserviceaccount.com`) como **Editor**.
5. Sube el JSON de la cuenta de servicio como variable de entorno en
   Railway (Railway permite montar "Files"/volumes, o puedes pegar el JSON
   completo en una variable `GOOGLE_SERVICE_ACCOUNT_JSON` y ajustar
   `src/tracking/sheetLog.ts` para leerlo desde ahí en vez de un archivo —
   dímelo si prefieres esta variante y la implemento).
6. Comparte el Sheet también con tus colaboradores (Editor o Lector, según
   si necesitan corregir el mapeo de órdenes a mano).

Este Sheet es la fuente de verdad que tú y tus colaboradores pueden revisar
sin tocar código: qué se subió, qué falló y por qué.

### Sobre el "Numero de orden"

El robot intenta resolverlo en este orden:
1. Si factura.com ya guarda el número de orden en algún campo propio de la
   factura (`ordenRelacionada` en `src/facturaCom/client.ts` — hay que
   confirmar si tu cuenta lo soporta).
2. Si el XML trae el patrón `Descripcion="...concepto/NUMERO_ORDEN"` (el
   mismo formato que usa la opción "Addenda o descripción en XML" de
   SIMCO).
3. Si ninguna de las anteriores aplica, busca el UUID en la pestaña
   `Mapeo Ordenes` del Sheet.

Si no encuentra nada, **no sube esa factura** — la marca como `SIN_ORDEN`
en la bitácora y la reporta en Slack, para que alguien la complete a mano
(igual que las "excepciones" del flujo de conciliación manual). Esto evita
que el CSV auxiliar llegue con datos inventados.

Lo ideal a mediano plazo: que el Make.com que ya genera las facturas
escriba directamente en la pestaña `Mapeo Ordenes` (o en el XML) el número
de orden al momento de timbrar — así este paso deja de depender de
mapeo manual.

## 4. Slack (notificaciones al equipo)

1. Crea un Incoming Webhook en el canal donde quieras los avisos
   (Slack → Apps → Incoming Webhooks → Add to Slack).
2. Copia la URL como `SLACK_WEBHOOK_URL`.

## 5. Desplegar en Railway

1. Crea un proyecto nuevo en Railway y conéctalo a este repositorio
   (rama principal desplegada, o la rama que definan como estable).
2. Railway detecta el `Dockerfile` automáticamente.
3. Agrega las variables de entorno de la sección 2.
4. Configura un **Cron Job** (Railway → tu servicio → Settings → Cron
   Schedule) con la frecuencia deseada, por ejemplo cada 2 días a las 8am:
   `0 8 */2 * *`.
5. Invita a tus colaboradores al proyecto de Railway (Project → Settings →
   Members) con rol que les permita ver logs y **disparar manualmente**
   una corrida ("Run now" / redeploy), sin necesidad de que dependan de ti.

Con esto: cualquier colaborador con acceso al proyecto de Railway puede
lanzar o reintentar la carga, y cualquiera con acceso al Sheet puede ver el
estado — sin compartir la contraseña de SIMCO ni el código con nadie.

## 6. Ajustar selectores reales de SIMCO

Los selectores en `src/simco/browser.ts` están basados en las capturas de
pantalla que compartiste, pero un cambio de texto/diseño en SIMCO los puede
romper. Para regenerarlos con precisión:

```bash
npm run codegen:simco
```

Esto abre un navegador controlado por Playwright; repite el flujo manual
una vez y copia los selectores exactos que genera hacia
`src/simco/browser.ts` (objeto `TEXT` y los `locator(...)`).

## 7. Primeras corridas — validar en paralelo

Antes de confiar el proceso al 100%, corre el job manualmente 2-3 veces
(`npm run dev:upload:facturas` en local, con `HEADLESS=false` para ver el
navegador) y compara contra lo que tú subirías a mano. Revisa:

- Que el conteo de "exitosas" en Slack coincida con lo que ves en SIMCO.
- Que ninguna factura sin número de orden se haya subido con datos
  inventados (debe aparecer como `SIN_ORDEN`, no como `SUBIDA_OK`).
- Que las facturas ya subidas no se vuelvan a intentar en la siguiente
  corrida (columna `UUID` de la bitácora).

## 8. Pendiente para Fase 2

- **Notas de crédito** y **Complementos de pago**: SIMCO los maneja en
  pantallas separadas (`Notas de crédito` / `Cargar complementos de pago`
  en el menú lateral). Aún no se documentó ese flujo — compárteme capturas
  igual que hiciste con "Carga de facturas" y se agrega como
  `src/jobs/uploadNotasCredito.ts` / `uploadComplementosPago.ts`,
  reusando el mismo patrón (login, bitácora, notificación).
- Verificar los endpoints reales de la API de factura.com contra tu cuenta
  (`src/facturaCom/client.ts` tiene TODOs marcados).
