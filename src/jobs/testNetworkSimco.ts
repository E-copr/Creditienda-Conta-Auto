import { config } from "../config.js";

/**
 * Diagnostico de red puro (sin navegador): intenta un fetch HTTP directo al
 * login de SIMCO. Sirve para distinguir entre:
 * - Bloqueo de red/firewall a nivel del hosting (IP de datacenter no
 *   permitida) -> este fetch tambien fallaria/tardaria.
 * - Algo especifico del navegador headless (ej. un WAF que reta con
 *   JavaScript a navegadores "sospechosos") -> este fetch respondería bien
 *   aunque Playwright se quede colgado.
 */
async function main() {
  const url = config.simco.loginUrl;
  console.log(`Probando fetch directo a: ${url}`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    const start = Date.now();
    const res = await fetch(url, { signal: controller.signal });
    const elapsed = Date.now() - start;
    const body = await res.text();
    console.log(`Respuesta en ${elapsed}ms. Status: ${res.status} ${res.statusText}`);
    console.log("Headers:", JSON.stringify(Object.fromEntries(res.headers.entries()), null, 2));
    console.log(`Primeros 300 caracteres del body:\n${body.slice(0, 300)}`);
  } catch (err) {
    console.error("FALLO el fetch directo:", (err as Error).message);
  } finally {
    clearTimeout(timeout);
  }
}

main();
