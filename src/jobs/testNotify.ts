import { notifyAll } from "../notify/index.js";

/** Prueba rapida de los canales de notificacion (correo + macOS), sin tocar SIMCO ni factura.com. */
async function main() {
  console.log("Enviando notificacion de prueba por todos los canales configurados...");
  await notifyAll({
    totalProcesadas: 2,
    exitosas: 1,
    conError: 1,
    sinNumeroOrden: 0,
    detalleErrores: ["6a000000000: [1010] Archivo cargado anteriormente, pendiente de conciliar — prueba, no es un error real"],
  });
  console.log("Listo. Revisa tu correo y/o el Centro de notificaciones de macOS.");
}

main().catch((err) => {
  console.error("Fallo la prueba de notificaciones:", err);
  process.exitCode = 1;
});
