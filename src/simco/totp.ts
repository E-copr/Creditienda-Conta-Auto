import { authenticator } from "otplib";

/**
 * Genera el codigo de 6 digitos de Google Authenticator a partir de la
 * llave secreta TOTP (base32) obtenida al vincular la cuenta de servicio
 * en SIMCO. NO es la contrasena de la cuenta.
 */
export function generateTotpCode(secret: string): string {
  return authenticator.generate(secret.replace(/\s+/g, ""));
}
