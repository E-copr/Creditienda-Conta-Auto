# Correrlo en local (Mac) — sin Railway ni hosting

Para el alcance actual (tu computadora + una más), esto corre directo en
esas máquinas con una tarea programada, sin nube ni costos. La sección 3
("Google Sheets: bitácora + sheet fuente") y la 4 ("Slack") de
[`SETUP.md`](./SETUP.md) siguen aplicando igual — solo cambia dónde corre
el proceso.

## 1. Instalar en cada Mac

```bash
cd ~
git clone https://github.com/E-copr/Creditienda-Conta-Auto.git
cd Creditienda-Conta-Auto
git checkout claude/factura-simco-automation-js1i4r
npm install
npx playwright install chromium
```

## 2. Configurar `.env`

```bash
cp .env.example .env
```

Abre `.env` con un editor de texto y llena, como mínimo:

```
FACTURACOM_API_KEY=...
FACTURACOM_SECRET_KEY=...
SIMCO_USERNAME=Ecorps.usa@gmail.com
SIMCO_PASSWORD=...
SIMCO_TOTP_SECRET=...
GOOGLE_SHEET_ID=...            # el sheet nuevo de bitacora (seccion 3 de SETUP.md)
GOOGLE_SERVICE_ACCOUNT_JSON_PATH=./google-service-account.json
SOURCE_SHEET_TAB=...           # nombre literal de la pestana del sheet de Make
SLACK_WEBHOOK_URL=...
```

Guarda también el archivo JSON de la cuenta de servicio de Google como
`google-service-account.json` en la raíz del repo (mismo nombre que
`GOOGLE_SERVICE_ACCOUNT_JSON_PATH`). Ni `.env` ni ese `.json` se suben al
repo — ya están en `.gitignore`.

## 3. Probar antes de programarlo

```bash
npm run test:login-simco       # solo login, no sube nada
npm run dev:upload:facturas    # corrida real completa (una vez, a mano)
```

## 4. Programarlo (solo en UNA de las dos Macs — la "oficial")

Elige la máquina que se quede prendida/conectada con más consistencia (por
ejemplo, la que se queda en la oficina). En esa, agrega un cron job:

```bash
crontab -e
```

Agrega una línea (ejemplo: todos los días a las 8am — ajusta la frecuencia
que quieras):

```
0 8 * * * cd /Users/TU_USUARIO/Creditienda-Conta-Auto && /usr/local/bin/node dist/jobs/uploadFacturas.js >> /Users/TU_USUARIO/Creditienda-Conta-Auto/cron.log 2>&1
```

Antes de que el cron corra necesitas compilar una vez:
```bash
npm run build
```
(y volver a correr `npm run build` cada vez que actualices el código con `git pull`).

Nota: `crontab` en macOS moderno a veces pide darle permiso de
"Acceso completo al disco" a `cron`/`Terminal` en
Ajustes del Sistema → Privacidad y Seguridad. Si el cron nunca corre,
revisa eso primero.

La Mac necesita estar **prendida y despierta** (no en suspensión) a esa
hora — si normalmente la cierras, puedes ajustar la hora del cron a un
momento en que sepas que estará abierta, o revisar `pmset` para programar
que despierte sola.

## 5. La otra Mac (respaldo / manual)

No hace falta que también tenga un cron. Con tener el repo instalado y el
mismo `.env`, cualquiera puede correr `npm run dev:upload:facturas` a mano
ese día si la máquina "oficial" no corrió. El Sheet de bitácora evita que
se suba una factura duplicada aunque las dos corran el mismo día.

## 6. Actualizar cuando yo suba cambios al código

```bash
cd ~/Creditienda-Conta-Auto
git pull origin claude/factura-simco-automation-js1i4r
npm install
npm run build
```
