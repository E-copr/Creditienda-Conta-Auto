import { connect, type TLSSocket } from "node:tls";
import { config } from "../config.js";
import type { RunSummary } from "./types.js";

/**
 * Notificacion por correo via SMTP implicito de Gmail (puerto 465), con un
 * cliente SMTP minimo hecho a mano en vez de una libreria como nodemailer -
 * mismo criterio que se siguio con Google Sheets (menos peso en disco, solo
 * se implementa lo que realmente se usa).
 *
 * Requiere una "contrasena de aplicacion" de Gmail (no la contrasena normal
 * de la cuenta), generada en https://myaccount.google.com/apppasswords con
 * verificacion en dos pasos activada en la cuenta que envia.
 */

function readSmtpResponse(socket: TLSSocket): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = "";
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString("utf-8");
      const lines = buffer.split("\r\n").filter(Boolean);
      const last = lines[lines.length - 1];
      // Las respuestas SMTP multilinea usan "250-" en las lineas intermedias
      // y "250 " (con espacio) solo en la ultima - hasta que no llega esa
      // ultima linea no se considera completa la respuesta.
      if (last && /^\d{3} /.test(last)) {
        cleanup();
        resolve(buffer);
      }
    };
    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };
    const cleanup = () => {
      socket.off("data", onData);
      socket.off("error", onError);
    };
    socket.on("data", onData);
    socket.on("error", onError);
  });
}

async function sendCommand(socket: TLSSocket, command: string): Promise<string> {
  socket.write(`${command}\r\n`);
  return readSmtpResponse(socket);
}

function lastResponseLine(response: string): string {
  const lines = response.split("\r\n").filter(Boolean);
  return lines[lines.length - 1] ?? "";
}

function buildEmailBody(summary: RunSummary): string {
  const lines = [
    `Carga de facturas SIMCO - ${new Date().toLocaleString("es-MX")}`,
    `Procesadas: ${summary.totalProcesadas} | Exitosas: ${summary.exitosas} | Con error: ${summary.conError} | Sin numero de orden: ${summary.sinNumeroOrden}`,
  ];
  if (summary.detalleErrores.length > 0) {
    lines.push("", "Detalle:", ...summary.detalleErrores.map((e) => `- ${e}`));
  }
  // Dot-stuffing: una linea que empiece con "." se confunde con el
  // terminador de datos SMTP si no se duplica ese punto inicial.
  return lines.map((l) => (l.startsWith(".") ? `.${l}` : l)).join("\r\n");
}

export async function notifyEmail(summary: RunSummary): Promise<void> {
  if (!config.notify.emailUser || !config.notify.emailAppPassword || !config.notify.emailTo) return;

  const socket = connect({ host: "smtp.gmail.com", port: 465 });
  try {
    await new Promise<void>((resolve, reject) => {
      socket.once("secureConnect", () => resolve());
      socket.once("error", reject);
    });

    await readSmtpResponse(socket); // 220 saludo inicial
    await sendCommand(socket, "EHLO localhost");
    await sendCommand(socket, "AUTH LOGIN");
    await sendCommand(socket, Buffer.from(config.notify.emailUser).toString("base64"));
    const authResp = await sendCommand(socket, Buffer.from(config.notify.emailAppPassword).toString("base64"));
    if (!lastResponseLine(authResp).startsWith("235")) {
      throw new Error(`Fallo autenticacion SMTP: ${authResp.trim()}`);
    }

    await sendCommand(socket, `MAIL FROM:<${config.notify.emailUser}>`);
    await sendCommand(socket, `RCPT TO:<${config.notify.emailTo}>`);
    await sendCommand(socket, "DATA");

    const subject = `Carga de facturas SIMCO - ${summary.exitosas} exitosas / ${summary.conError} con error`;
    const message = [
      `From: ${config.notify.emailUser}`,
      `To: ${config.notify.emailTo}`,
      `Subject: ${subject}`,
      "Content-Type: text/plain; charset=utf-8",
      "",
      buildEmailBody(summary),
      ".",
    ].join("\r\n");
    const dataResp = await sendCommand(socket, message);
    if (!lastResponseLine(dataResp).startsWith("250")) {
      throw new Error(`Fallo el envio del correo: ${dataResp.trim()}`);
    }

    await sendCommand(socket, "QUIT");
  } finally {
    socket.end();
  }
}
