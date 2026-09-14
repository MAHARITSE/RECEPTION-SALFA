import type { AppState } from '../store';

/**
 * Exporte l'état complet en fichier JSON téléchargé.
 * Utilisé par : sauvegarde manuelle (Administration), sauvegarde automatique
 * AVANT toute réinitialisation, rappel de sauvegarde (bandeau).
 * @returns le nom du fichier téléchargé.
 */
export function downloadJsonBackup(state: AppState): string {
  const data = {
    version: '2.0-LOGBARA-SALFA',
    exportedAt: new Date().toISOString(),
    exportedBy: state.currentUser?.id || 'ADM001',
    stats: {
      patientsCount: state.patients.length,
      invoicesCount: state.invoices.length,
      articlesCount: state.articles.length,
      usersCount: state.users.length,
    },
    state: { ...state, currentUser: null },
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `HIS-salfa-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return a.download;
}

/** Nombre de jours écoulés depuis la dernière sauvegarde (Infinity si jamais). */
export function daysSinceBackup(lastBackupAt?: string): number {
  if (!lastBackupAt) return Infinity;
  const t = new Date(lastBackupAt).getTime();
  if (!Number.isFinite(t)) return Infinity;
  return (Date.now() - t) / 86400000;
}
