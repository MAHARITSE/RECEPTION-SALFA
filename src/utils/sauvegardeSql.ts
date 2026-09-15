import type { AppState } from '../store';

/**
 * SAUVEGARDE SQL — format IDENTIQUE au schéma WAMP (`wamp_deploy/database/schema.sql`)
 * -------------------------------------------------------------------------------
 * L'export produit un fichier `.sql` **réimportable dans la base de travail**
 * (`reception_salfa`) : mêmes noms de tables (français), mêmes colonnes
 * (`id`, `donnees` JSON, `numero_ref`, `dossier_ref`), même moteur/charset.
 *
 * C'est ce qui manquait à l'ancien export (tables `invoices`, `stockEntries`,
 * colonne `LONGTEXT`) : importé, il créait un jeu de tables parallèles que
 * l'API ne lit pas — une sauvegarde que l'on ne peut pas restaurer n'est pas
 * une sauvegarde (constat S12 de `docs/AUDIT_WAMP_100_PAR_JOUR.md`).
 *
 * Choix volontaires :
 *  - `CREATE TABLE IF NOT EXISTS` + `INSERT … ON DUPLICATE KEY UPDATE` :
 *    réimportable à l'infini, ne DÉTRUIT rien, n'efface pas les lignes absentes
 *    du fichier (une restauration n'est pas un vidage).
 *  - statements limités en octets : importable même avec le
 *    `max_allowed_packet` minimal de WAMP.
 *  - mots de passe : jamais en clair, et un import ne remplace pas le hachage
 *    d'un compte existant (une importation ne « déconnecte » donc personne).
 *  - `sequences` / `sessions` non incluses : elles n'existent que côté MySQL.
 */

/** Collection applicative → table MySQL (miroir de `salfa_tables()` côté API). */
export const SAUVEGARDE_TABLES: { key: keyof AppState & string; table: string; label: string }[] = [
  { key: 'patients', table: 'patients', label: 'Dossiers patients' },
  { key: 'consultations', table: 'consultations', label: 'Consultations' },
  { key: 'invoices', table: 'factures', label: 'Factures (caisse & historiques)' },
  { key: 'ventes', table: 'ventes', label: 'Ventes (table unifiée)' },
  { key: 'venteLines', table: 'lignes_vente', label: 'Lignes de vente' },
  { key: 'ventePayments', table: 'paiements_vente', label: 'Paiements des ventes' },
  { key: 'cashClosings', table: 'clotures_caisse', label: 'Clôtures de caisse' },
  { key: 'articles', table: 'articles', label: "Catalogue d'articles" },
  { key: 'familles', table: 'familles', label: "Familles d'articles" },
  { key: 'fournisseurs', table: 'fournisseurs', label: 'Fournisseurs' },
  { key: 'companies', table: 'societes', label: 'Sociétés partenaires' },
  { key: 'companyBillingAccounts', table: 'comptes_facturation', label: 'Comptes de facturation société' },
  { key: 'etablissements', table: 'etablissements', label: 'Identification établissement' },
  { key: 'users', table: 'utilisateurs', label: 'Comptes utilisateurs' },
  { key: 'hbRecords', table: 'dossiers_hospit_bloc', label: 'Dossiers hospitalisation / bloc' },
  { key: 'labRequests', table: 'demandes_laboratoire', label: "Demandes d'analyse" },
  { key: 'labCatalog', table: 'catalogue_laboratoire', label: "Catalogue d'examens" },
  { key: 'stockEntries', table: 'entrees_stock', label: 'Entrées de stock' },
  { key: 'stockTransfers', table: 'transferts_stock', label: 'Transferts de stock' },
  { key: 'stockMovements', table: 'mouvements_stock', label: 'Mouvements de stock (legacy)' },
  { key: 'movementHeaders', table: 'mouvements_entetes', label: 'En-têtes de mouvement' },
  { key: 'movementLines', table: 'mouvements_lignes', label: 'Lignes de mouvement' },
  { key: 'inventorySessions', table: 'inventaires', label: 'Inventaires' },
  { key: 'warehouseServices', table: 'services_depot', label: 'Services destinataires du dépôt' },
  { key: 'pharmaDeliveryItems', table: 'livraisons_pharmacie', label: 'Livraisons pharmacie' },
  { key: 'pharmaDeliveryClosings', table: 'clotures_pharmacie', label: 'Clôtures de garde pharmacie' },
  { key: 'assuranceSocietes', table: 'assurance_societes', label: 'Sociétés (assurance)' },
  { key: 'assurancePersonnes', table: 'assurance_personnes', label: 'Assurés (assurance)' },
  { key: 'assuranceFamilles', table: 'assurance_familles', label: 'Familles (assurance)' },
  { key: 'assurancePrestations', table: 'assurance_prestations', label: 'Prestations (assurance)' },
  { key: 'assurancePaiements', table: 'assurance_paiements', label: 'Paiements (assurance)' },
  { key: 'journey', table: 'parcours_patient', label: 'Parcours patients' },
  { key: 'auditLogs', table: 'journal_audit', label: "Journal d'audit" },
  { key: 'notifications', table: 'notifications', label: 'Notifications' },
  { key: 'messages', table: 'messages', label: 'Messages' },
];

/** Réglages stockés dans `parametres` (valeurs JSON). */
const PARAM_KEYS = ['ticketSettings', 'monthlyInvoices', 'issuedFactureNumbers', 'prescripteursExternes'] as const;
/** Compteurs stockés dans `compteurs` (entiers, jamais décrémentés à l'import). */
const CPT_KEYS = ['factureCounter', 'pharmaClosingCounter'] as const;

/** Budget d'octets par instruction INSERT (reste sous le `max_allowed_packet`
 *  le plus bas rencontré sur WAMP : 1 Mo). */
const MAX_STATEMENT_OCTETS = 600_000;

/** Plafond de prudence : au-delà, l'onglet n'a plus assez de mémoire pour
 *  construire le fichier — il faut `outils/sauvegarder.bat` (mysqldump). */
export const LIMITE_SAUVEGARDE_NAVIGATEUR = 150 * 1024 * 1024;

/** Échappe une valeur pour un littéral chaîne MySQL entre quotes simples. */
const escSql = (value: string): string =>
  value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\x1a/g, '\\Z');

/** Une valeur de mot de passe peut-elle voyager dans un fichier ? Seulement si
 *  c'est déjà un hachage serveur (bcrypt ou empreinte `sha256:` du client) :
 *  un mot de passe en clair (mode navigateur, seed historique) est écarté. */
const HASH_SERVEUR = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$|^\$argon2[a-z]?\$.+$/;

/** Clés à ne JAMAIS écrire dans un fichier de sauvegarde : le fichier quitte le
 *  poste (clé USB, serveur de secours). En mode MySQL, l'API ne les renvoie pas ;
 *  ce filtre protège aussi le mode navigateur, où l'objet compte porte `password`. */
const CLE_SECRETES = /^(password|motdepasse|mot_de_passe|motdepassehash|hashedpassword|passwordhash|password_hash|token|session_?token|session_?id|refresh_?token)$/i;
const sansSecret = (row: Record<string, unknown>): Record<string, unknown> => {
  let trouve = false;
  for (const k of Object.keys(row)) {
    if (CLE_SECRETES.test(k)) { trouve = true; break; }
  }
  if (!trouve) return row;
  const copie: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (CLE_SECRETES.test(k)) continue;
    copie[k] = v;
  }
  return copie;
};

/** Clause de mise à jour standard (identique à celle de l'API). */
const MAJ_STANDARD = "`donnees` = VALUES(`donnees`), `numero_ref` = VALUES(`numero_ref`), `dossier_ref` = VALUES(`dossier_ref`)";
/** Comptes : le mot de passe DÉJÀ en base n'est jamais écrasé par une sauvegarde
 *  (une lecture WAMP n'en contient pas — sinon tout le monde serait déconnecté).
 *  Un compte inédit est créé sans mot de passe, à définir via Administration. */
const MAJ_UTILISATEURS = "`donnees` = JSON_SET(VALUES(`donnees`), '$.password',"
  + " COALESCE(JSON_EXTRACT(`utilisateurs`.`donnees`, '$.password'),"
  + " JSON_EXTRACT(VALUES(`donnees`), '$.password'))),"
  + " `numero_ref` = VALUES(`numero_ref`), `dossier_ref` = VALUES(`dossier_ref`)";

/** Identifiant SQL de la ligne (id applicatif, sinon `ligne-N`). */
const idOf = (row: unknown, index: number): string => {
  const id = (row as { id?: unknown } | null)?.id;
  if (typeof id === 'string' && id) return id;
  if (typeof id === 'number' && Number.isFinite(id)) return String(id);
  return `ligne-${index + 1}`;
};

/** Références extraites, comme le fait l'API (`numero_ref`, `dossier_ref`). */
const refsOf = (row: Record<string, unknown>): { numero: string | null; dossier: string | null } => {
  const numero = typeof row.numeroFacture === 'string' && row.numeroFacture !== ''
    ? row.numeroFacture.slice(0, 64) : null;
  const dossier = typeof row.dossier === 'string' && row.dossier !== ''
    ? row.dossier.slice(0, 64) : null;
  return { numero, dossier };
};

/** DDL des deux tables de service (`parametres`, `compteurs`) : clé + valeur. */
const DDL_SERVICE = (table: string, colonneValeur: string): string[] => [
  `CREATE TABLE IF NOT EXISTS \`${table}\` (`,
  "  `cle` VARCHAR(64) NOT NULL,",
  colonneValeur,
  "  `mis_a_jour` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,",
  '  PRIMARY KEY (`cle`)',
  ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;',
];

const sqlTexte = (v: string | null): string => (v === null ? 'NULL' : `'${escSql(v)}'`);

const aQuoiServir = (): string[] => [
  '-- ----------------------------------------------------------------------------',
  '-- Import :',
  '--   C:\\wamp64\\bin\\mysql\\mysql8.0.xx\\bin\\mysql.exe -h 127.0.0.1 -u salfa -p reception_salfa < ce_fichier.sql',
  '--   (ou phpMyAdmin → base reception_salfa → Importer)',
  '-- Ce fichier NE SUPPRIME AUCUNE ligne et n’écrase que les enregistrements',
  '-- qu’il contient : il peut être importé plusieurs fois, sur une base existante.',
  '-- Pour une restauration à zéro : créer une base vide, importer schema.sql PUIS',
  '-- ce fichier (ne pas restaurer un fichier ancien sur une base plus récente :',
  '--  les lignes supprimées entre-temps réapparaîtraient).',
  '-- Mots de passe : jamais en clair dans ce fichier. Les hachages serveur ($2y$',
  "-- sha256:..) sont conservés quand le poste les connait, et l'import ne remplace",
  '-- PAS le mot de passe d\u2019un compte existant. Apr\u00e8s une restauration sur un',
  '-- serveur neuf : définir les mots de passe dans Administration > Utilisateurs',
  '-- (ou importer un mysqldump, via outils\\sauvegarder.bat, qui contient les hashes).',
  '-- ----------------------------------------------------------------------------',
];

/** DDL d'une table d'entité (colonnes et index identiques à schema.sql). */
const ddlTable = (table: string): string[] => [
  `CREATE TABLE IF NOT EXISTS \`${table}\` (`,
  "  `id` VARCHAR(64) NOT NULL,",
  "  `donnees` JSON NOT NULL,",
  "  `numero_ref` VARCHAR(64) NULL DEFAULT NULL,",
  "  `dossier_ref` VARCHAR(64) NULL DEFAULT NULL,",
  "  `mis_a_jour` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,",
  "  PRIMARY KEY (`id`),",
  "  KEY `idx_numero` (`numero_ref`),",
  "  KEY `idx_dossier` (`dossier_ref`),",
  "  KEY `idx_maj` (`mis_a_jour`)",
  ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;',
];

/** Estimation rapide du volume de la sauvegarde (échantillonnage : on ne veut
 *  pas sérialiser deux fois 300 Mo pour savoir si on peut les sérialiser). */
export function estimerTailleSauvegardeSql(state: AppState): { octets: number; lignes: number } {
  let octets = 0;
  let lignes = 0;
  for (const { key } of SAUVEGARDE_TABLES) {
    const rows = Array.isArray(state[key]) ? (state[key] as unknown[]) : [];
    lignes += rows.length;
    if (rows.length === 0) continue;
    const echantillon = rows.slice(0, 120);
    let taille = 0;
    for (const r of echantillon) taille += JSON.stringify(r)?.length ?? 0;
    // ×1,6 : l'échappement SQL double les guillemets du JSON ; + 60 : tuple,
    // id, références et séparateurs.
    octets += (taille / echantillon.length) * rows.length * 1.6 + rows.length * 60;
  }
  for (const cle of PARAM_KEYS) {
    const v = (state as unknown as Record<string, unknown>)[cle];
    if (v !== undefined) octets += (JSON.stringify(v)?.length ?? 0) * 1.6;
  }
  lignes += 1 + CPT_KEYS.length; // la ligne `parametres` + les compteurs
  // Le DDL (une table = ~580 octets de CREATE) pèse lourd sur une petite base.
  octets += SAUVEGARDE_TABLES.length * 580 + 4096;
  return { octets: Math.round(octets), lignes };
}

export interface ResultatSauvegardeSql {
  sql: string;
  tables: number;
  rows: number;
  octets: number;
  /** Comptes sans hachage connu côté poste (mot de passe à définir après import). */
  comptesSansMotDePasse: number;
}

/** Construit le script SQL complet (pur, testable sans DOM).
 *  @throws Error si le volume dépasse `maxOctets` (message prêt à afficher). */
export function buildSqlBackup(state: AppState, options: { maxOctets?: number } = {}): ResultatSauvegardeSql {
  const maxOctets = options.maxOctets ?? LIMITE_SAUVEGARDE_NAVIGATEUR;
  const estime = estimerTailleSauvegardeSql(state);
  if (estime.octets > maxOctets) {
    throw new Error(
      `Sauvegarde estimée à ${(estime.octets / 1048576).toFixed(0)} Mo : un fichier de cette taille ne peut pas être fabriqué par le navigateur. `
      + 'Utilisez la sauvegarde du serveur : wamp_deploy\\outils\\sauvegarder.bat (mysqldump), qui écrit le même'
      + ' fichier .sql sans saturer la mémoire de l’onglet.',
    );
  }

  const now = new Date().toISOString();
  const lignes: string[] = [
    '-- ============================================================',
    '--  RECEPTION SALFA — Sauvegarde SQL (schéma WAMP v3 : une table',
    '--  par entité, colonne `donnees` JSON, références extraites)',
    `--  Exporté le : ${now}`,
    `--  Exporté par : ${state.currentUser?.id || 'ADM001'}`,
    '--  Base cible : reception_salfa (InnoDB, utf8mb4)',
    '-- ============================================================',
    ...aQuoiServir(),
    '',
    'SET NAMES utf8mb4;',
    'SET FOREIGN_KEY_CHECKS = 0;',
    '',
  ];

  let tables = 0;
  let rows = 0;
  let comptesSansMotDePasse = 0;

  for (const { key, table, label } of SAUVEGARDE_TABLES) {
    const brutes = Array.isArray(state[key]) ? (state[key] as unknown[]) : [];
    // Une ligne = un objet JSON, exactement comme le fait l'API. Les secrets sont
    // filtrés, SAUF le hachage serveur d'un compte : c'est lui qui rend la base
    // réutilisable après restauration, et il n'est pas réversible.
    const lignesTable: Record<string, unknown>[] = [];
    let sansMdp = 0;
    for (const brute of brutes) {
      const r = (brute ?? {}) as Record<string, unknown>;
      const nette = sansSecret(r);
      if (key === 'users') {
        const h = typeof r.password === 'string' && HASH_SERVEUR.test(r.password);
        if (h) nette.password = r.password; else sansMdp += 1;
      }
      lignesTable.push(nette);
    }
    if (key === 'users') comptesSansMotDePasse = sansMdp;

    lignes.push('-- ------------------------------------------------------------');
    lignes.push(`--  \`${table}\` — ${label} — ${lignesTable.length} ligne(s)`);
    lignes.push(...ddlTable(table));
    if (key === 'users' && sansMdp > 0) {
      lignes.push(`--  ${sansMdp} compte(s) sans hachage connu côté poste : mot de passe à définir après import.`);
    }

    let chunk: string[] = [];
    let poids = 0;
    const vider = () => {
      if (chunk.length === 0) return;
      // Journal d'audit : append-only, comme côté serveur — un fichier de
      // sauvegarde ne peut ni réécrire ni effacer une ligne d'historique.
      const greffe = table === 'journal_audit' ? 'INSERT IGNORE INTO' : 'INSERT INTO';
      lignes.push(`${greffe} \`${table}\` (\`id\`, \`donnees\`, \`numero_ref\`, \`dossier_ref\`) VALUES`);
      lignes.push(chunk.join(',\n'));
      lignes.push(table === 'journal_audit'
        ? ';'
        : `ON DUPLICATE KEY UPDATE ${table === 'utilisateurs' ? MAJ_UTILISATEURS : MAJ_STANDARD};`);
      lignes.push('');
      chunk = [];
      poids = 0;
    };
    lignesTable.forEach((rec, index) => {
      const json = JSON.stringify(rec);
      if (json === undefined) return;
      const { numero, dossier } = refsOf(rec);
      const valeur = `(${sqlTexte(idOf(rec, index))}, '${escSql(json)}', ${sqlTexte(numero)}, ${sqlTexte(dossier)})`;
      if (poids + valeur.length > MAX_STATEMENT_OCTETS) vider();
      chunk.push(valeur);
      poids += valeur.length + 2;
      rows += 1;
    });
    vider();
    lignes.push('');
    tables += 1;
  }

  // ---- Réglages (table `parametres`) ----
  lignes.push('-- ------------------------------------------------------------');
  lignes.push('--  `parametres` — réglages et listes JSON');
  lignes.push(...DDL_SERVICE('parametres', "  `valeur` JSON NOT NULL,"));
  const params: string[] = [];
  for (const cle of PARAM_KEYS) {
    const valeur = (state as unknown as Record<string, unknown>)[cle];
    if (valeur === undefined) continue;
    const json = JSON.stringify(valeur);
    if (json === undefined) continue;
    params.push(`('${escSql(cle)}', '${escSql(json)}')`);
    rows += 1;
  }
  if (params.length > 0) {
    lignes.push('INSERT INTO `parametres` (`cle`, `valeur`) VALUES');
    lignes.push(`${params.join(',\n')}`);
    lignes.push('ON DUPLICATE KEY UPDATE `valeur` = VALUES(`valeur`);');
  }
  lignes.push('');
  tables += 1;

  // ---- Compteurs (jamais décrémentés : pas de réutilisation de n° de facture) ----
  lignes.push('-- ------------------------------------------------------------');
  lignes.push('--  `compteurs` — séquences numériques (MAX uniquement)');
  lignes.push(...DDL_SERVICE('compteurs', "  `valeur` BIGINT NOT NULL DEFAULT 0,"));
  const compteurs: string[] = [];
  for (const cle of CPT_KEYS) {
    const valeur = (state as unknown as Record<string, unknown>)[cle];
    const n = typeof valeur === 'number' && Number.isFinite(valeur) ? Math.trunc(valeur) : 0;
    compteurs.push(`('${escSql(cle)}', ${n})`);
    rows += 1;
  }
  lignes.push('INSERT INTO `compteurs` (`cle`, `valeur`) VALUES');
  lignes.push(`${compteurs.join(',\n')}`);
  lignes.push('ON DUPLICATE KEY UPDATE `valeur` = GREATEST(`valeur`, VALUES(`valeur`));');
  lignes.push('');
  tables += 1;

  lignes.push('SET FOREIGN_KEY_CHECKS = 1;');
  lignes.push(`-- Fin de sauvegarde : ${tables} table(s), ${rows} ligne(s).`);
  lignes.push('');

  const sql = lignes.join('\n');
  return { sql, tables, rows, octets: sql.length, comptesSansMotDePasse };
}

/** Nom de fichier de sauvegarde (horodaté, triable). */
export function nomFichierSauvegardeSql(date: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp = `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}`;
  return `reception_salfa_sauvegarde_${stamp}.sql`;
}

export interface ResultatTelechargement {
  fileName: string;
  tables: number;
  rows: number;
  octets: number;
  comptesSansMotDePasse: number;
}

/** Construit la sauvegarde et déclenche son téléchargement.
 *  @throws Error avec un message compréhensible par un non-technicien. */
export function downloadSqlBackup(state: AppState): ResultatTelechargement {
  const { sql, tables, rows, octets, comptesSansMotDePasse } = buildSqlBackup(state);
  const fileName = nomFichierSauvegardeSql();
  const blob = new Blob([sql], { type: 'application/sql;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Le fichier peut peser plusieurs Mo : le laisser vivre le temps du transfert.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return { fileName, tables, rows, octets, comptesSansMotDePasse };
}
