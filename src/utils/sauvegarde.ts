import type { AppState } from '../store';
import { downloadSqlBackup, estimerTailleSauvegardeSql } from './sauvegardeSql';

/**
 * Point d'entrée de la sauvegarde « métier » : le fichier produit est un `.sql`
 * importable dans la base MySQL du serveur (voir `utils/sauvegardeSql.ts`).
 * L'ancien export `.json` a été supprimé : il n'avait plus d'écran de
 * restauration et donnait l'illusion d'une sauvegarde sans être réimportable.
 */
export interface RetourSauvegardeUi {
  ok: boolean;
  /** Message prêt à afficher (nom du fichier + volume, ou motif du refus). */
  message: string;
}

/** 24 Ko / 1,3 Mo : lisible pour un non-technicien. */
export function formatOctets(n: number): string {
  const ko = Math.max(0, Math.round((n || 0) / 1024));
  return ko >= 1024 ? `${(ko / 1024).toFixed(1)} Mo` : `${ko} Ko`;
}

/** Nombre de jours écoulés depuis la dernière sauvegarde (Infinity si jamais). */
export function daysSinceBackup(lastBackupAt?: string): number {
  if (!lastBackupAt) return Infinity;
  const t = new Date(lastBackupAt).getTime();
  if (!Number.isFinite(t)) return Infinity;
  return (Date.now() - t) / 86400000;
}

/** Vrai si une sauvegarde SQL a déjà été exportée aujourd'hui.
 *  `lastBackupAt` n'est pas persisté côté MySQL (il vit dans l'état du poste) :
 *  on garde aussi une trace par session de navigateur pour ne pas redemander
 *  un fichier après chaque rechargement de page. */
const MARQUEUR_SAUVEGARDE_JOUR = 'salfa_sql_backup_day';

export function sauvegardeDejaFaiteAujourdhui(lastBackupAt?: string): boolean {
  const aujourdhui = new Date().toISOString().slice(0, 10);
  if (lastBackupAt && lastBackupAt.slice(0, 10) === aujourdhui) return true;
  try {
    return window.sessionStorage.getItem(MARQUEUR_SAUVEGARDE_JOUR) === aujourdhui;
  } catch {
    return false;
  }
}

export function marquerSauvegardeDuJour(): void {
  try {
    window.sessionStorage.setItem(MARQUEUR_SAUVEGARDE_JOUR, new Date().toISOString().slice(0, 10));
  } catch { /* stockage privé : la marque est un confort, pas une garantie */ }
}

export interface ResultatExportSql extends RetourSauvegardeUi {
  fileName?: string;
  rows?: number;
  octets?: number;
  comptesSansMotDePasse?: number;
  /** Motif du refus (volume trop lourd pour l'onglet, mémoire, etc.). */
  erreur?: string;
}

/**
 * Point d'entrée unique de la « sauvegarde » : produit et télécharge le fichier
 * `.sql` (importable dans `reception_salfa`). Utilisé par le bouton de la barre
 * supérieure, par le module Administration, par le rappel de sauvegarde et par
 * la déconnexion (une sauvegarde du jour est due à chaque poste).
 */
export function exporterSauvegardeSql(state: AppState): ResultatExportSql {
  try {
    const res = downloadSqlBackup(state);
    marquerSauvegardeDuJour();
    const message = `${res.fileName} téléchargé (${res.rows} ligne(s), ${formatOctets(res.octets)})`
      + (res.comptesSansMotDePasse
        ? ` — ${res.comptesSansMotDePasse} compte(s) sans hachage connu côté poste, à redéfinir après restauration complète`
        : '');
    return { ok: true, message, fileName: res.fileName, rows: res.rows, octets: res.octets, comptesSansMotDePasse: res.comptesSansMotDePasse };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Export SQL impossible.';
    // Le refus pour volume trop lourd porte déjà son estimation et la marche à suivre
    // (message ci-dessus) ; on n’ajoute un complément que pour les autres pannes
    // (mémoire du poste, objet sérialisable impossible, navigateur qui bloque le
    // téléchargement…).
    if (!/estimée/.test(message)) {
      const estime = (() => { try { return estimerTailleSauvegardeSql(state).octets; } catch { return 0; } })();
      if (estime > 0) {
        const detail = `${message} (volume estimé : ${(estime / 1048576).toFixed(0)} Mo)`;
        return { ok: false, erreur: detail, message: detail };
      }
    }
    return { ok: false, erreur: message, message };
  }
}
