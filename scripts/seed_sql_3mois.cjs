#!/usr/bin/env node
/**
 * Génère la « SECTION DONNÉES DE DÉMONSTRATION (3 mois) » dans
 * wamp_deploy/database/reception_salfa_complete.sql à partir de
 * src/data/localData.json (régénéré par scripts/regen_3mois.cjs).
 *
 * Format IDENTIQUE à la sauvegarde SQL applicative (src/utils/sauvegardeSql.ts) :
 *   INSERT INTO t (id, donnees, numero_ref, dossier_ref) VALUES (…)
 *   ON DUPLICATE KEY UPDATE donnees = VALUES(donnees), …
 * Précédée d'un DELETE FROM des tables transactionnelles (l'utilisateur a
 * demandé la suppression de toutes les données avant régénération).
 */
const fs = require('fs');
const path = require('path');

const DATA = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'data', 'localData.json'), 'utf-8'));
const SQL_FILE = path.join(__dirname, '..', 'wamp_deploy', 'database', 'reception_salfa_complete.sql');

const TABLES = [
  ['patients', 'patients'],
  ['consultations', 'consultations'],
  ['invoices', 'factures'],
  ['ventes', 'ventes'],
  ['venteLines', 'lignes_vente'],
  ['ventePayments', 'paiements_vente'],
  ['cashClosings', 'clotures_caisse'],
  ['companyBillingAccounts', 'comptes_facturation'],
  ['hbRecords', 'dossiers_hospit_bloc'],
  ['labRequests', 'demandes_laboratoire'],
  ['stockEntries', 'entrees_stock'],
  ['stockTransfers', 'transferts_stock'],
  ['stockMovements', 'mouvements_stock'],
  ['movementHeaders', 'mouvements_entetes'],
  ['movementLines', 'mouvements_lignes'],
  ['inventorySessions', 'inventaires'],
  ['pharmaDeliveryItems', 'livraisons_pharmacie'],
  ['pharmaDeliveryClosings', 'clotures_pharmacie'],
  ['journey', 'parcours_patient'],
  ['auditLogs', 'journal_audit'],
  ['notifications', 'notifications'],
  ['messages', 'messages'],
  ['assuranceSocietes', 'assurance_societes'],
  ['assurancePersonnes', 'assurance_personnes'],
  ['assuranceFamilles', 'assurance_familles'],
  ['assurancePrestations', 'assurance_prestations'],
  ['assurancePaiements', 'assurance_paiements'],
];

const escSql = (v) => String(v)
  .replace(/\\/g, '\\\\')
  .replace(/'/g, "\\'")
  .replace(/\n/g, '\\n')
  .replace(/\r/g, '\\r')
  .replace(/\x1a/g, '\\Z');
const sqlTexte = (v) => (v === null || v === undefined ? 'NULL' : `'${escSql(v)}'`);
const idOf = (row, i) => (typeof row?.id === 'string' && row.id) || (typeof row?.id === 'number' && String(row.id)) || `ligne-${i + 1}`;
const refsOf = (row) => ({
  numero: typeof row.numeroFacture === 'string' && row.numeroFacture ? row.numeroFacture.slice(0, 64) : null,
  dossier: typeof row.dossier === 'string' && row.dossier ? row.dossier.slice(0, 64) : null,
});

const DEBUT = '-- ==================== DONNÉES DE DÉMONSTRATION (3 MOIS) — DÉBUT ====================';
const FIN = '-- ==================== DONNÉES DE DÉMONSTRATION (3 MOIS) — FIN ======================';
const MAX_OCTETS = 600000;

const lignes = [
  DEBUT,
  '-- Données de démonstration régénérées : fenêtre 23/06/2026 → 22/09/2026 (~3 mois)',
  `-- Générées le ${new Date().toISOString().slice(0, 10)} par scripts/regen_3mois.cjs + scripts/seed_sql_3mois.cjs`,
  '-- ATTENTION : cette section SUPPRIME les lignes existantes des tables',
  '-- transactionnelles puis insère le nouveau jeu de données (demande utilisateur :',
  '-- « supprime toutes les données et régénère 3 mois »).',
  '-- Les autres tables de référence (utilisateurs, sociétés, fournisseurs…) ne sont',
  '-- PAS touchées ; `familles` et `articles` sont mises à jour par UPSERT (sans',
  '-- suppression) : familles Consultation et Autres ajoutées, seuls les Médicaments',
  '-- gérés en stock, chaque article rattaché à une famille.',
  '',
  'SET FOREIGN_KEY_CHECKS = 0;',
  '',
];

// 1) Vidage des tables transactionnelles
for (const [, table] of TABLES) {
  lignes.push(`DELETE FROM \`${table}\`;`);
}
lignes.push('');

// 2) INSERT par table (chunks < 600 Ko), format identique à la sauvegarde
let totalLignes = 0;
const inserer = (key, table, commentaire) => {
  const rows = Array.isArray(DATA[key]) ? DATA[key] : [];
  totalLignes += rows.length;
  if (commentaire) lignes.push(commentaire);
  lignes.push(`-- \`${table}\` : ${rows.length} ligne(s)`);
  let chunk = [];
  let poids = 0;
  const flush = () => {
    if (!chunk.length) return;
    lignes.push(`INSERT INTO \`${table}\` (\`id\`, \`donnees\`, \`numero_ref\`, \`dossier_ref\`) VALUES`);
    lignes.push(chunk.join(',\n') + '\nON DUPLICATE KEY UPDATE `donnees` = VALUES(`donnees`), `numero_ref` = VALUES(`numero_ref`), `dossier_ref` = VALUES(`dossier_ref`);');
    chunk = []; poids = 0;
  };
  rows.forEach((r, i) => {
    const { numero, dossier } = refsOf(r || {});
    const tuple = `(${sqlTexte(idOf(r, i))}, ${sqlTexte(JSON.stringify(r ?? {}))}, ${sqlTexte(numero)}, ${sqlTexte(dossier)})`;
    poids += tuple.length;
    chunk.push(tuple);
    if (poids > MAX_OCTETS) flush();
  });
  flush();
  lignes.push('');
};
for (const [key, table] of TABLES) inserer(key, table);

// 2bis) Tables de référence concernées par l'évolution « familles » : UPSERT seul
// (aucune suppression) pour qu'une base WAMP existante reçoive le nouveau
// catalogue de familles et la famille / le stock de chaque article.
inserer('familles', 'familles',
  '-- Référence : catalogue des familles (Consultation + Autres ; seuls les Médicaments sont gérés en stock)');
inserer('articles', 'articles',
  '-- Référence : articles (famille obligatoire, stock recalculé pour les médicaments)');

// 3) Compteurs
lignes.push('-- Compteurs (factures, clôtures pharmacie)');
lignes.push('CREATE TABLE IF NOT EXISTS `compteurs` (');
lignes.push('  `cle` VARCHAR(64) NOT NULL,');
lignes.push('  `valeur` BIGINT NOT NULL DEFAULT 0,');
lignes.push('  `mis_a_jour` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,');
lignes.push('  PRIMARY KEY (`cle`)');
lignes.push(') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;');
lignes.push(`INSERT INTO \`compteurs\` (\`cle\`, \`valeur\`) VALUES ('factureCounter', ${DATA.factureCounter || 0}), ('pharmaClosingCounter', ${DATA.pharmaClosingCounter || 0})`);
lignes.push('ON DUPLICATE KEY UPDATE `valeur` = VALUES(`valeur`);');
lignes.push('');
lignes.push('SET FOREIGN_KEY_CHECKS = 1;');
lignes.push(FIN);

// 4) Injection idempotente dans le fichier SQL complet
let sql = fs.readFileSync(SQL_FILE, 'utf-8');
const debut = sql.indexOf(DEBUT);
if (debut !== -1) {
  const fin = sql.indexOf(FIN);
  sql = sql.slice(0, debut) + (fin !== -1 ? sql.slice(fin + FIN.length) : '');
}
sql = sql.replace(/\s+$/, '') + '\n\n' + lignes.join('\n') + '\n';
fs.writeFileSync(SQL_FILE, sql);
console.log(`✅ Section données écrite dans ${path.relative(process.cwd(), SQL_FILE)} — ${totalLignes} lignes`);
console.log('   taille fichier :', (fs.statSync(SQL_FILE).size / 1048576).toFixed(2), 'Mo');
