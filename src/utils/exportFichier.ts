import * as XLSX from 'xlsx';
import type { jsPDF } from 'jspdf';

/**
 * Téléchargements de fichiers (Excel, PDF, CSV) produits par le poste.
 *
 * Pourquoi ce fichier existe : les bibliothèques offrent chacune un « save »
 * pratique en Node mais silencieux dans une page web.
 *  - `XLSX.writeFile(classeur, 'fichier.xlsx')` cherche d'abord le module Node
 *    `fs` ; sans DOM, ou dans un contexte qui n'est pas une page, il finit par
 *    `Error: cannot save file …`. Pire : quand l'écriture échoue pour une autre
 *    raison (mémoire, contenu refusé), l'exception partait dans la console et
 *    l'utilisateur ne voyait **aucun** fichier arriver — sans explication ;
 *  - `jsPDF.doc.save()` passe par un FileSaver embarqué qui se réduit à une
 *    fonction vide dès que le contexte n'est pas une fenêtre « simple »
 *    (aperçu intégré, iframe sandboxée) : aucun fichier, aucun message.
 * Les deux sont remplacés par le seul chemin fiable en navigateur :
 * octets → `Blob` → `<a download>`, **avec un vrai message** en cas d'échec et
 * un indice quand le cadre affiché interdit les téléchargements.
 */

/** Types MIME écrits par l'application (le nom de fichier reste la référence). */
const MIME: Record<string, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  csv: 'text/csv;charset=utf-8',
  pdf: 'application/pdf',
  sql: 'application/sql;charset=utf-8',
  json: 'application/json;charset=utf-8',
  txt: 'text/plain;charset=utf-8',
  html: 'text/html;charset=utf-8',
};

export interface ResultatTelechargement {
  ok: boolean;
  nom: string;
  octets: number;
  /** Message prêt à afficher (ligne unique, en français). */
  message: string;
}

/** L'application tourne-t-elle dans un cadre intégré (aperçu d'éditeur, iframe
 *  d'un portail, onglet incorporé) ? Beaucoup de ces cadres interdisent
 *  l'enregistrement de fichier : le fichier est bien produit, mais le
 *  navigateur le jette sans rien dire. Autant le dire tout de suite. */
export function estDansUnCadre(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.top && window.self !== window.top;
  } catch {
    return true; // `window.top` inaccessible : cadre cross-origin, donc restrictif
  }
}

const INDICE_CADRE = ' Si rien n\u2019arrive dans la barre de téléchargements, ouvrez l\u2019application dans un onglet normal du navigateur : les cadres intégrés bloquent souvent l\u2019enregistrement des fichiers.';

/** Nom de fichier horodaté à la mode SALFA : `Base_2026-09-14.xlsx`. */
export function nomHorodate(base: string, extension: string, date: Date = new Date()): string {
  const propre = base.replace(/[\\/:*?"<>|]+/g, '_').replace(/\.([a-z0-9]+)$/i, '');
  return `${propre}_${date.toISOString().split('T')[0]}.${extension.replace(/^\./, '')}`;
}

function formatOctets(n: number): string {
  const ko = Math.max(0, Math.round(n / 1024));
  return ko >= 1024 ? `${(ko / 1024).toFixed(1)} Mo` : `${ko} Ko`;
}

/**
 * Écrit `contenu` dans un fichier téléchargé. Ne LANCE pas d'exception :
 * un export raté doit être annoncé (message + `signaler`), jamais silencieux.
 */
export function telechargerFichier(
  contenu: BlobPart,
  nom: string,
  options: { mime?: string; signaler?: (message: string) => void } = {},
): ResultatTelechargement {
  const extension = (nom.split('.').pop() || '').toLowerCase();
  const mime = options.mime || MIME[extension] || 'application/octet-stream';
  const echec = (raison: string): ResultatTelechargement => {
    const message = `Export impossible : ${raison}.${estDansUnCadre() ? INDICE_CADRE : ''}`;
    if (options.signaler) options.signaler(message);
    else {
      console.warn('[Export]', message);
      // Personne ne surveille la console au guichet : sans cette fenêtre, un
      // export raté ressemble à un export qui n'a pas été demandé.
      if (typeof window !== 'undefined' && typeof window.alert === 'function') window.alert(message);
    }
    return { ok: false, nom, octets: 0, message };
  };

  try {
    if (typeof document === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined' || !URL.createObjectURL) {
      return echec("le contexte d'affichage ne permet pas d'écrire un fichier");
    }
    const blob = contenu instanceof Blob ? contenu : new Blob([contenu], { type: mime });
    if (!blob.size) return echec('le fichier produit est vide');
    const a = document.createElement('a');
    if (!('download' in a)) return echec('le navigateur de ce cadre refuse lenregistrement de fichier');
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = nom;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Un fichier de plusieurs mégaoctets a besoin de temps avant que l'URL
    // puisse être libérée : 60 s couvrent un poste lent ou un disque occupé.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return {
      ok: true, nom, octets: blob.size,
      message: `${nom} téléchargé (${formatOctets(blob.size)})${estDansUnCadre() ? INDICE_CADRE : ''}`,
    };
  } catch (cause) {
    return echec(cause instanceof Error ? cause.message : String(cause));
  }
}

/**
 * Classeur Excel → fichier `.xlsx` téléchargé. `XLSX.write(..., { type: 'array' })`
 * ne dépend d'aucun module Node, et `cellStyles` conserve les largeurs de
 * colonnes (sinon le fichier arrive illisible dans Excel).
 */
export function telechargerClasseur(
  classeur: XLSX.WorkBook,
  nom: string,
  options: { bookType?: 'xlsx' | 'csv'; signaler?: (message: string) => void } = {},
): ResultatTelechargement {
  const bookType = options.bookType || 'xlsx';
  const nomFichier = new RegExp(`\\.${bookType}$`, 'i').test(nom) ? nom : `${nom}.${bookType}`;
  try {
    const octets = XLSX.write(classeur, { bookType, type: 'array', cellStyles: true }) as ArrayBuffer;
    if (!octets || !octets.byteLength) return telechargerFichier(new Uint8Array(0), nomFichier, { signaler: options.signaler });
    return telechargerFichier(octets, nomFichier, { signaler: options.signaler });
  } catch (cause) {
    const message = `Export Excel impossible : ${cause instanceof Error ? cause.message : String(cause)}.${estDansUnCadre() ? INDICE_CADRE : ''}`;
    if (options.signaler) options.signaler(message);
    else {
      console.warn('[Export]', message);
      if (typeof window !== 'undefined' && typeof window.alert === 'function') window.alert(message);
    }
    return { ok: false, nom: nomFichier, octets: 0, message };
  }
}

/** Document jsPDF → fichier `.pdf` téléchargé (sans passer par `doc.save()`). */
export function telechargerPdf(
  doc: jsPDF,
  nom: string,
  options: { signaler?: (message: string) => void } = {},
): ResultatTelechargement {
  const nomFichier = /\.pdf$/i.test(nom) ? nom : `${nom}.pdf`;
  try {
    const blob = doc.output('blob') as Blob;
    return telechargerFichier(blob, nomFichier, { mime: MIME.pdf, signaler: options.signaler });
  } catch (cause) {
    const message = `Export PDF impossible : ${cause instanceof Error ? cause.message : String(cause)}.${estDansUnCadre() ? INDICE_CADRE : ''}`;
    if (options.signaler) options.signaler(message);
    else {
      console.warn('[Export]', message);
      if (typeof window !== 'undefined' && typeof window.alert === 'function') window.alert(message);
    }
    return { ok: false, nom: nomFichier, octets: 0, message };
  }
}

/**
 * Classeur construit à partir de lignes d'objets (en-têtes = clés), avec des
 * largeurs de colonnes calculées sur le contenu : gabarit commun des exports.
 * Une liste vide produit quand même un fichier avec les en-têtes, pour que
 * « exporter » ne soit jamais un bouton mort.
 */
export function classeurDepuisLignes(
  lignes: Record<string, unknown>[],
  nomFeuille: string,
  entetesVides: string[] = [],
  largeurMini = 10,
): XLSX.WorkBook {
  const entetes = lignes.length ? Object.keys(lignes[0]) : entetesVides;
  // Sans lignes, `json_to_sheet` ne produit aucun en-tête : on écrit la ligne de
  // titre seule, pour que le fichier reste exploitable (et compréhensible).
  const ws = lignes.length
    ? XLSX.utils.json_to_sheet(lignes)
    : XLSX.utils.aoa_to_sheet(entetes.length ? [entetes] : []);
  ws['!cols'] = entetes.map((entete) => {
    const plusGrand = lignes.reduce((max, ligne) => Math.max(max, String(ligne[entete] ?? '').length), entete.length);
    return { wch: Math.min(60, Math.max(largeurMini, plusGrand + 2)) };
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, nomFeuille.slice(0, 31).replace(/[[\]:*?/\\]/g, '_'));
  return wb;
}
