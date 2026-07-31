import { notifySlack } from "./slack.js";
import { notifyEmail } from "./email.js";
import { notifyMacOs } from "./macNotification.js";
import type { RunSummary } from "./types.js";

export type { RunSummary } from "./types.js";

/**
 * Dispara todos los canales de notificacion configurados. Cada canal ya
 * decide por su cuenta si esta configurado o no (variables vacias = no-op).
 * Un canal que falle no debe tumbar a los demas ni al job principal - por
 * eso se usa allSettled y solo se registra el error en consola.
 */
export async function notifyAll(summary: RunSummary): Promise<void> {
  const resultados = await Promise.allSettled([notifySlack(summary), notifyEmail(summary), notifyMacOs(summary)]);
  for (const r of resultados) {
    if (r.status === "rejected") console.error(`Fallo un canal de notificacion: ${r.reason}`);
  }
}
