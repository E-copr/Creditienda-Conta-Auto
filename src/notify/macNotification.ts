import { execFile } from "node:child_process";
import { config } from "../config.js";
import type { RunSummary } from "./types.js";

/**
 * Notificacion nativa del Centro de notificaciones de macOS via osascript.
 * Solo aparece si la Mac esta prendida con una sesion de usuario activa en
 * ese momento - el mismo requisito que ya tiene el cron para poder correr.
 * Se ignora silenciosamente en cualquier otro sistema operativo.
 */
export async function notifyMacOs(summary: RunSummary): Promise<void> {
  if (process.platform !== "darwin" || !config.notify.macNotifications) return;

  const title = "Carga de facturas SIMCO";
  const message =
    summary.totalProcesadas === 0
      ? "Sin facturas nuevas hoy."
      : `Exitosas: ${summary.exitosas} / Con error: ${summary.conError} de ${summary.totalProcesadas}`;

  await new Promise<void>((resolve) => {
    execFile(
      "osascript",
      ["-e", `display notification ${JSON.stringify(message)} with title ${JSON.stringify(title)}`],
      (err) => {
        if (err) console.error(`No se pudo mostrar la notificacion de macOS: ${err.message}`);
        resolve();
      },
    );
  });
}
