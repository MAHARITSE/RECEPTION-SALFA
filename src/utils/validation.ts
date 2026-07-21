/**
 * Helpers de validation partagés pour toute l'application.
 *
 * Règle métier : « Pour toute l'application, ne pas valider les saisies
 * à lignes multiples si au moins une ligne n'a pas été saisie. »
 *
 * Les éditeurs de lignes de type « Sage » (barre de saisie en haut + bouton
 * « Enregistrer » + tableau de lignes validées + bouton « Valider ») partagent
 * tous le même risque : l'utilisateur saisit une ligne dans la barre du haut,
 * oublie de cliquer sur « Enregistrer », puis clique sur « Valider ».
 * La ligne en cours de saisie est alors silencieusement perdue.
 *
 * `hasUnsavedDraftLine` détecte ce cas (brouillon non encore committé dans la
 * liste) afin de bloquer la validation et prévenir la perte de données.
 */

export interface DraftLine {
  id: string;
  articleName?: string;
}

/**
 * Renvoie `true` si une ligne est en cours de saisie (brouillon non vide) qui
 * n'a pas encore été enregistrée dans la liste des lignes validées.
 *
 * Une ligne déjà enregistrée (dont l'id figure dans `lines`) n'est pas
 * considérée comme « non saisie » même si elle est en cours de réédition :
 * on bloque uniquement les brouillons jamais committés, ce qui correspond à
 * « au moins une ligne n'a pas été saisie ».
 */


export function hasUnsavedDraftLine<T extends DraftLine>(
  draft: T | null | undefined,
  lines: readonly T[],
): boolean {
  if (!draft) return false;
  const name = draft.articleName;
  if (!name || !String(name).trim()) return false;
  return !lines.some((l) => l.id === draft.id);
}

/**
 * Blocage prêt à l'emploi pour les validateurs : si une ligne n'est pas saisie,
 * affiche une alerte explicite et renvoie `true` (la validation doit être
 * interrompue). Sinon renvoie `false` (la validation peut continuer).
 */
export function blockIfUnsavedDraftLine<T extends DraftLine>(
  draft: T | null | undefined,
  lines: readonly T[],
  options?: { entityLabel?: string },
): boolean {
  if (!hasUnsavedDraftLine(draft, lines)) return false;
  const entity = options?.entityLabel ?? 'cette ligne';
  const name = draft && draft.articleName ? `« ${draft.articleName} »` : '';
  alert(
    `⚠️ Une ligne est en cours de saisie mais n'a pas été enregistrée${name ? ` : ${name}` : ''}.\n\n` +
    `Cliquez sur « Enregistrer » pour ajouter ${entity} à la liste, ` +
    `ou effacez-la (bouton « Nouveau » / « Effacer ») avant de valider.`,
  );
  return true;
}
