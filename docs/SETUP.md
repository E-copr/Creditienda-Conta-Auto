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

## 3. Google Sheets: bitácora nueva + sheet fuente existente

Se usan **dos** Sheets distintos:

**A. Bitácora (ya creada)**

Sheet: "Creditienda — Bitácora Cargas SIMCO Claude"
(`GOOGLE_SHEET_ID=1RT06W3OF25sj8KAUwoQAvVy9c2M24iEZ1vBltGEFRR4`, ya es el
default en `.env.example`).

Columnas reales, en este orden (A→J):
`Fecha de subida | Tipo Documento | UUID | Tipo Documento | Numero Orden | Nombre del documento | Fecha Timbrado | Estatus | Codigo Error | Detalle Error`

> ⚠️ Pendiente de aclarar: la columna "Tipo Documento" aparece dos veces
> (posición B y D). El código por ahora escribe el tipo de documento en la
> columna B y deja la D vacía — avisen si la segunda debía ser otra cosa
> (ej. canal, o un duplicado a eliminar) para ajustar.

Pasos:
1. Confirma el **nombre literal de la pestaña** dentro del Sheet (por
   default Google Sheets la crea como "Hoja 1") y ponlo en
   `SHEET_TAB_BITACORA`.
2. Compártela como **Editor** con el correo de la cuenta de servicio (ver
   punto C) y también con tus colaboradores.

**B. Sheet fuente (ya existe, lo llena el Make.com actual)**

El job lee de ahí el `UUID -> Numero de orden` — **no** hay que crear nada
nuevo, es el mismo sheet donde Make ya registra cada factura generada
(columnas actuales: `Fecha, Shopify Order ID, Order number, Estado, UUID,
Invoice UID, Monto, Error`).

1. Comparte ese Sheet como **Lector** (Viewer) con el correo de la cuenta
   de servicio (punto C) — no necesita permiso de edición, el job solo lee.
2. En las variables de entorno define:
   - `SOURCE_SHEET_ID` (ya trae como default el ID que compartiste:
     `1E-UEacAMnJOItUERFv9rvQdI6Laa30ZUzA-tQ23krms`)
   - `SOURCE_SHEET_TAB`: el **nombre literal de la pestaña** (no el `gid`
     de la URL — la Sheets API direcciona por nombre de pestaña, no por
     gid; ábrela y copia el texto de la pestaña tal cual).
3. Como nos avisaste que los títulos de columna van a cambiar pronto, el
   job los busca **por nombre de encabezado**, no por posición. Si cambian
   el texto exacto de una columna, solo hay que actualizar la variable de
   entorno correspondiente (`SOURCE_UUID_HEADER`, `SOURCE_ORDER_NUMBER_HEADER`,
   `SOURCE_STATUS_HEADER`), sin tocar código.

**Confirmado con el equipo:** la columna `Shopify Order ID` del sheet es la
que corresponde al "Numero de orden" del CSV auxiliar de SIMCO (no
`Order number`). Así quedó configurado por default
(`SOURCE_ORDER_NUMBER_HEADER=Shopify Order ID`).

**C. Cuenta de servicio de Google (ya creada)**

Corriendo en local (ver `docs/SETUP_LOCAL_MAC.md`): descarga el JSON de la
llave desde Google Cloud Console y guárdalo como `google-service-account.json`
en la raíz del repo — es el path que ya espera `GOOGLE_SERVICE_ACCOUNT_JSON_PATH`
por default. No hace falta nada más (esto reemplaza la nota vieja sobre
subirlo como variable de entorno en Railway/Vercel, que solo aplica si
migran a hosting en la nube más adelante).

No olvides compartir **ambos** Sheets (A y B) con el correo de esa cuenta
de servicio (termina en `...iam.gserviceaccount.com`), o el job no podrá
leer/escribir aunque el JSON esté bien puesto.

Si no encuentra número de orden para una factura, el job **no la sube** —
la marca como `SIN_ORDEN` en la bitácora y la reporta en Slack, para que
alguien la complete a mano (igual que las "excepciones" del flujo de
conciliación manual). Esto evita que el CSV auxiliar llegue con datos
inventados.

## 3.5 Probar el login antes de confiarle una subida real

Antes de correr el job completo, valida que las credenciales + TOTP + los
selectores de SIMCO funcionan, sin subir ni enviar ningún archivo:

```bash
npm run test:login-simco
```

Esto hace login, pasa el 2FA y navega hasta "Carga de facturas", guardando
una captura de pantalla de cada paso en `./tmp/simco-login-test/` (esa
carpeta está en `.gitignore`, revísalas localmente). Si algún paso falla,
la captura del último estado te dice justo qué pantalla no coincidió con
lo esperado — probablemente un texto o layout que cambió en SIMCO.

En un entorno con acceso a internet restringido (no puede descargar el
Chromium de Playwright) define `PLAYWRIGHT_CHROMIUM_PATH` apuntando a un
binario de Chromium ya instalado.

## 4. Slack (notificaciones al equipo)

1. Crea un Incoming Webhook en el canal donde quieras los avisos
   (Slack → Apps → Incoming Webhooks → Add to Slack).
2. Copia la URL como `SLACK_WEBHOOK_URL`.

## 5. Desplegar en Railway

1. Crea un proyecto nuevo en Railway → **Deploy from GitHub repo** → elige
   `E-copr/Creditienda-Conta-Auto` → rama `claude/factura-simco-automation-js1i4r`
   (o la que definan como estable más adelante).
2. Railway detecta el `Dockerfile` automáticamente — no hay que instalar
   nada en tu computadora, todo corre dentro del contenedor en Railway.
3. Ve a **Variables** y agrega, una por una, todas las de la sección 2 y
   3 de esta guía (`FACTURACOM_API_KEY`, `SIMCO_USERNAME`, `SIMCO_PASSWORD`,
   `SIMCO_TOTP_SECRET`, `GOOGLE_SHEET_ID`, `SOURCE_SHEET_TAB`, etc.).

### 5.1 Primero: correr SOLO la prueba de login (recomendado)

Antes de dejarlo en automático, valida el login sin arriesgar ninguna
subida real:

1. En el servicio de Railway, ve a **Settings → Deploy → Custom Start
   Command** y ponlo temporalmente en:
   ```
   npm run test:login-simco
   ```
2. Dispara un deploy ("Deploy" / "Redeploy").
3. Abre la pestaña **Logs/Deployments** del servicio — vas a ver líneas
   como `[simco-login] 1-login-page`, `[simco-login] 2-credenciales-llenas`,
   etc. En qué línea se detiene o truena te dice exactamente qué paso
   falló (usuario/contraseña, el código TOTP, o el nombre de un botón/menú
   que ya no coincide).
4. Una vez que veas los 6 pasos completos sin error en los logs, regresa a
   **Custom Start Command** y bórralo (para que vuelva al default del
   `Dockerfile`: `npm run upload:facturas`).

Con esto confirmas todo (credenciales, TOTP, selectores) sin instalar nada
en tu máquina y sin tocar el flujo real de subida.

### 5.2 Programar la corrida automática

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
