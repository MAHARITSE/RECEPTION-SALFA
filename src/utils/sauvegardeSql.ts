import type { AppState } from '../store';

/**
 * SAUVEGARDE SQL (MySQL / MariaDB — importable dans phpMyAdmin)
 * ------------------------------------------------------------
 * Exporte l'intégralité des données applicatives dans un fichier `.sql`
 * (CREATE TABLE + INSERT). Chaque collection de l'état devient une table :
 *
 *   `id` VARCHAR(191) PRIMARY KEY, `donnees` LONGTEXT (ligne au format JSON)
 *
 * Structure volontairement souple : aucun changement de schéma applicatif
 * ne casse la sauvegarde. Sauvegarde uniquement (aucune restauration auto).
 */

/** Échappe une valeur pour un littéral chaîne MySQL entre quotes. */
const escSql = (value: string): string =>
  value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\0/g, '');

/** Identifiant SQL de la ligne (id applicatif, sinon `ligne-N`). */
const idOf = (row: unknown, index: number): string => {
  const id = (row as { id?: unknown } | null)?.id;
  if (typeof id === 'string' && id) return id;
  if (typeof id === 'number' && Number.isFinite(id)) return String(id);
  return `ligne-${index + 1}`;
};

/** Collections (tableaux) de l'état sauvegardées, dans l'ordre du dump. */
const TABLES: { key: string; label: string }[] = [
  { key: 'patients', label: 'Dossiers patients' },
  { key: 'consultations', label: 'Consultations' },
  { key: 'invoices', label: 'Factures' },
  { key: 'cashClosings', label: 'Clôtures de caisse' },
  { key: 'articles', label: "Catalogue d'articles" },
  { key: 'familles', label: "Familles d'articles" },
  { key: 'fournisseurs', label: 'Fournisseurs' },
  { key: 'companies', label: 'Sociétés partenaires' },
  { key: 'companyBillingAccounts', label: 'Comptes de facturation société' },
  { key: 'etablissements', label: "Identification société / hôpital" },
  { key: 'users', label: 'Comptes utilisateurs' },
  { key: 'hbRecords', label: 'Dossiers hospitalisation / bloc' },
  { key: 'ventes', label: 'Ventes (table unifiée)' },
  { key: 'venteLines', label: 'Lignes de vente' },
  { key: 'ventePayments', label: 'Paiements des ventes' },
  { key: 'labRequests', label: "Demandes d'analyse" },
  { key: 'labCatalog', label: "Catalogue d'examens" },
  { key: 'stockEntries', label: 'Entrées de stock' },
  { key: 'stockTransfers', label: 'Transferts de stock' },
  { key: 'stockMovements', label: 'Mouvements de stock (legacy)' },
  { key: 'movementHeaders', label: 'En-têtes de mouvement' },
  { key: 'movementLines', label: 'Lignes de mouvement' },
  { key: 'inventorySessions', label: 'Inventaires' },
  { key: 'warehouseServices', label: 'Services destinataires du dépôt' },
  { key: 'pharmaDeliveryItems', label: 'Livraisons pharmacie' },
  { key: 'pharmaDeliveryClosings', label: 'Clôtures de garde pharmacie' },
  { key: 'monthlyInvoices', label: 'Factures mensuelles assurance' },
  { key: 'assuranceSocietes', label: 'Sociétés (assurance)' },
  { key: 'assurancePersonnes', label: 'Assurés (assurance)' },
  { key: 'assuranceFamilles', label: 'Familles (assurance)' },
  { key: 'assurancePrestations', label: 'Prestations (assurance)' },
  { key: 'assurancePaiements', label: 'Paiements (assurance)' },
  { key: 'journey', label: 'Parcours patients' },
  { key: 'auditLogs', label: "Journal d'audit" },
  { key: 'notifications', label: 'Notifications' },
  { key: 'messages', label: 'Messages' },
];

/** Réglages scalaires archivés dans la table `app_config`. */
const CONFIG_KEYS = [
  'ticketSettings',
  'factureCounter',
  'pharmaClosingCounter',
  'issuedFactureNumbers',
  'prescripteursExternes',
  'assuranceStorageSupported',
  'lastBackupAt',
  'lastBackupBy',
] as const;

/** Nombre de lignes par instruction INSERT (les lignes JSON sont volumineuses). */
const INSERT_CHUNK = 50;

/** Construit le script SQL complet + compteurs (testable sans DOM). */
export function buildSqlBackup(state: AppState): { sql: string; tables: number; rows: number } {
  const bag = state as unknown as Record<string, unknown>;
  const exportedAt = new Date().toISOString();
  const exportedBy = state.currentUser?.id || 'ADM001';
  const lines: string[] = [
    '-- ============================================================',
    '--  Sauvegarde SALFA / MediCare HIS — format SQL (MySQL/MariaDB)',
    `--  Exporté le : ${exportedAt}`,
    `--  Exporté par : ${exportedBy}`,
    '--  Version du format : 1.0-SQL',
    '--  Import : phpMyAdmin > Importer, ou `mysql < ce_fichier.sql`',
    '-- ============================================================',
    '',
    'SET NAMES utf8mb4;',
    'SET FOREIGN_KEY_CHECKS = 0;',
    '',
  ];
  let tables = 0;
  let rows = 0;

  // ---- Table de configuration ----
  lines.push(
    '-- ------------------------------------------------------------',
    "--  Table `app_config` : réglages et compteurs (valeurs JSON)",
    '-- ------------------------------------------------------------',
    'DROP TABLE IF EXISTS `app_config`;',
    'CREATE TABLE `app_config` (',
    '  `cle` VARCHAR(191) NOT NULL PRIMARY KEY,',
    "  `valeur` LONGTEXT NULL COMMENT 'JSON',",
    ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;',
  );
  const configValues = CONFIG_KEYS
    .filter((k) => bag[k] !== undefined)
    .map((k) => `('${escSql(k)}', '${escSql(JSON.stringify(bag[k]))}')`);
  if (configValues.length) {
    lines.push(`INSERT INTO \`app_config\` (\`cle\`, \`valeur\`) VALUES\n  ${configValues.join(',\n  ')};`);
    rows += configValues.length;
  }
  lines.push('');
  tables += 1;

  // ---- Une table par collection ----
  for (const { key, label } of TABLES) {
    const arr = Array.isArray(bag[key]) ? (bag[key] as unknown[]) : [];
    lines.push(
      '-- ------------------------------------------------------------',
      `--  Table \`${key}\` : ${label} — ${arr.length} ligne(s)`,
      '-- ------------------------------------------------------------',
      `DROP TABLE IF EXISTS \`${key}\`;`,
      `CREATE TABLE \`${key}\` (`,
      '  `id` VARCHAR(191) NOT NULL PRIMARY KEY,',
      "  `donnees` LONGTEXT NULL COMMENT 'Ligne au format JSON',",
      ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;',
    );
    for (let i = 0; i < arr.length; i += INSERT_CHUNK) {
      const chunk = arr.slice(i, i + INSERT_CHUNK).map(
        (row, j) => `('${escSql(idOf(row, i + j))}', '${escSql(JSON.stringify(row))}')`,
      );
      lines.push(`INSERT INTO \`${key}\` (\`id\`, \`donnees\`) VALUES\n  ${chunk.join(',\n  ')};`);
    }
    lines.push('');
    tables += 1;
    rows += arr.length;
  }

  lines.push(
    'SET FOREIGN_KEY_CHECKS = 1;',
    `-- Fin de sauvegarde : ${tables} table(s), ${rows} ligne(s).`,
    '',
  );
  return { sql: lines.join('\n'), tables, rows };
}

/**
 * Télécharge la sauvegarde SQL complète de l'état.
 * @returns le nom du fichier téléchargé.
 */
export function downloadSqlBackup(state: AppState): string {
  const { sql } = buildSqlBackup(state);
  const stamp = new Date().toISOString().slice(0, 16).replace('T', '-').replace(':', '');
  const fileName = `HIS-salfa-backup-${stamp}.sql`;
  const blob = new Blob([sql], { type: 'application/sql;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return fileName;
}
