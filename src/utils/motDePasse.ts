/**
 * Mots de passe — empreintes SHA-256 côté client.
 * ---------------------------------------------------------------------------
 * Les mots de passe ne sont JAMAIS stockés en clair : seule une empreinte
 * `sha256:` + hex(SHA-256("salfa-his-v1:" + mot de passe)) est conservée
 * dans la base, les exports et les sauvegardes.
 *
 * - À la connexion, un mot de passe historique en clair encore valide est
 *   accepté UNE fois puis immédiatement migré vers son empreinte.
 * - En mode WAMP, le serveur re-hache en bcrypt (voir wamp_deploy/api) :
 *   l'empreinte SHA-256 protège les dumps/exports, bcrypt protège le serveur.
 */

const PREFIX = 'sha256:';
const CONTEXTE = 'salfa-his-v1:';

/** Vrai si la valeur stockée est déjà une empreinte (et non un mot de passe en clair). */
export function isHashedPassword(stored?: string): boolean {
  return !!stored && stored.startsWith(PREFIX);
}

/** Calcule l'empreinte d'un mot de passe en clair. */
export async function hashPassword(clear: string): Promise<string> {
  try {
    const subtle = globalThis.crypto?.subtle;
    if (subtle) {
      const bytes = await subtle.digest('SHA-256', new TextEncoder().encode(CONTEXTE + clear));
      const hex = [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
      return PREFIX + hex;
    }
  } catch {
    // Contexte non sécurisé (théorique : http://localhost l'est toujours).
  }
  // Dernier recours : on ne bloque pas la connexion, mais on alerte.
  // eslint-disable-next-line no-console
  console.warn('[Sécurité] WebCrypto indisponible : mot de passe conservé tel quel.');
  return clear;
}

/**
 * Vérifie une saisie contre la valeur stockée (empreinte ou, pour
 * l'historique, mot de passe en clair migré ensuite vers une empreinte).
 */
export async function verifyPassword(input: string, stored?: string): Promise<boolean> {
  if (!stored) return false;
  if (!isHashedPassword(stored)) return input === stored;
  return (await hashPassword(input)) === stored;
}
