import { createSign } from "node:crypto";
import { readFile } from "node:fs/promises";
import { config } from "../config.js";

/**
 * Autenticacion a la API de Google Sheets sin la libreria `googleapis`
 * (pesaba ~112MB solo para usar Sheets). Se firma un JWT a mano con la
 * llave privada de la cuenta de servicio (RS256, via node:crypto) y se
 * intercambia por un access token OAuth2, siguiendo el flujo estandar de
 * "Service Account" de Google: https://developers.google.com/identity/protocols/oauth2/service-account
 */

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
}

let cachedToken: { accessToken: string; expiresAt: number } | null = null;
let cachedKey: ServiceAccountKey | null = null;

function base64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function loadServiceAccountKey(): Promise<ServiceAccountKey> {
  if (cachedKey) return cachedKey;
  const raw = await readFile(config.sheets.serviceAccountJsonPath, "utf-8");
  const parsed = JSON.parse(raw);
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error(
      `El archivo de cuenta de servicio (${config.sheets.serviceAccountJsonPath}) no tiene client_email/private_key.`,
    );
  }
  cachedKey = parsed;
  return parsed;
}

async function fetchAccessToken(): Promise<string> {
  const key = await loadServiceAccountKey();
  const now = Math.floor(Date.now() / 1000);

  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iss: key.client_email,
      scope: "https://www.googleapis.com/auth/spreadsheets",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const signInput = `${header}.${claims}`;
  const signature = createSign("RSA-SHA256").update(signInput).sign(key.private_key);
  const jwt = `${signInput}.${base64url(signature)}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`No se pudo obtener token de Google (${res.status}): ${body}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  return data.access_token;
}

export async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.accessToken;
  }
  const accessToken = await fetchAccessToken();
  cachedToken = { accessToken, expiresAt: Date.now() + 55 * 60 * 1000 };
  return accessToken;
}
