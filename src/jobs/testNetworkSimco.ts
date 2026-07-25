import dns from "node:dns/promises";
import { config } from "../config.js";

/**
 * Diagnostico de red puro (sin navegador): primero resuelve el DNS del
 * dominio de SIMCO, luego intenta un fetch HTTP directo. Sirve para
 * distinguir entre:
 * - El dominio no resuelve fuera de la red/VPN del usuario (DNS privado o
 *   restringido) -> incluso el DNS fallaria.
 * - El dominio resuelve pero el trafico se bloquea (firewall/IP no
 *   permitida) -> DNS ok, fetch falla/cuelga.
 * - Algo especifico del navegador headless (WAF que reta con JS) -> este
 *   fetch respondería bien aunque Playwright se quede colgado.
 */
async function main() {
  const url = new URL(config.simco.loginUrl);

  console.log(`1) Resolviendo DNS de: ${url.hostname}`);
  try {
    const addresses = await dns.lookup(url.hostname, { all: true });
    console.log("   DNS OK:", JSON.stringify(addresses));
  } catch (err) {
    console.error("   FALLO el DNS:", (err as Error).message);
    console.error("   Esto sugiere que el dominio solo resuelve dentro de una red/VPN privada, no en internet publico.");
    return;
  }

  console.log(`2) Probando fetch directo a: ${url.href}`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    const start = Date.now();
    const res = await fetch(url.href, { signal: controller.signal });
    const elapsed = Date.now() - start;
    const body = await res.text();
    console.log(`   Respuesta en ${elapsed}ms. Status: ${res.status} ${res.statusText}`);
    console.log("   Headers:", JSON.stringify(Object.fromEntries(res.headers.entries()), null, 2));
    console.log(`   Primeros 300 caracteres del body:\n${body.slice(0, 300)}`);
  } catch (err) {
    const error = err as Error & { cause?: unknown };
    console.error("   FALLO el fetch:", error.message);
    if (error.cause) console.error("   Causa:", JSON.stringify(error.cause, Object.getOwnPropertyNames(error.cause)));
    console.error("   Esto sugiere un bloqueo de red/firewall (IP del hosting no permitida), no un tema de DNS.");
  } finally {
    clearTimeout(timeout);
  }
}

main();
