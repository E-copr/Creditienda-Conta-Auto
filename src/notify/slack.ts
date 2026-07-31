import { config } from "../config.js";
import type { RunSummary } from "./types.js";

export type { RunSummary } from "./types.js";

export async function notifySlack(summary: RunSummary): Promise<void> {
  if (!config.slack.webhookUrl) return; // notificaciones opcionales

  const lines = [
    `*Carga de facturas SIMCO — ${new Date().toLocaleString("es-MX")}*`,
    `Procesadas: ${summary.totalProcesadas} · Exitosas: ${summary.exitosas} · Con error: ${summary.conError} · Sin numero de orden: ${summary.sinNumeroOrden}`,
  ];
  if (summary.detalleErrores.length > 0) {
    lines.push("", "*Detalle:*", ...summary.detalleErrores.map((e) => `• ${e}`));
  }

  const res = await fetch(config.slack.webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: lines.join("\n") }),
  });
  if (!res.ok) {
    console.error(`No se pudo enviar la notificacion a Slack: ${res.status}`);
  }
}
