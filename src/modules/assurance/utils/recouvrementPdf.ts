import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Prestation, Paiement, Societe, Personne, EnteteConfig, Famille } from '../types';
import { formatMoney, formatDate } from './formatters';
import { getStoredEnteteConfig } from './enteteStorage';
import { initialFamilles } from '../data/initialData';

export interface RecouvrementItem {
  prestationId: string;
  numeroFacture: string;
  dateFacture: string;
  societeNom: string;
  sousSociete?: string;
  patientNom: string;
  matricule: string;
  montantBrut: number;
  ticketModerateur: number;
  montantARembourser: number;
  totalPaye: number;
  resteARecouvrer: number;
  retardJours: number;
  retardMois: number;
  statut: string;
}

export interface RecouvrementSummary {
  items: RecouvrementItem[];
  totalARecouvrer: number;
  totalBrut: number;
  totalTicketModerateur: number;
  totalARembourser: number;
  totalPaye: number;
  dossiersCount: number;
  parSociete: Array<{
    societeNom: string;
    dossiersCount: number;
    totalBrut: number;
    totalARembourser: number;
    totalPaye: number;
    resteARecouvrer: number;
    maxRetardJours: number;
  }>;
  parMois: Array<{
    moisKey: string;
    moisLibelle: string;
    dossiersCount: number;
    totalBrut: number;
    totalARembourser: number;
    totalPaye: number;
    resteARecouvrer: number;
  }>;
}

/**
 * Convert hex color string to RGB tuple
 */
function hexToRgb(hex: string, defaultRgb: [number, number, number] = [30, 41, 59]): [number, number, number] {
  try {
    let c = (hex || '').replace('#', '').trim();
    if (c.length === 3) c = c.split('').map(x => x + x).join('');
    if (c.length !== 6) return defaultRgb;
    const num = parseInt(c, 16);
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
  } catch {
    return defaultRgb;
  }
}

/**
 * Palette resolution based on EnteteConfig
 */
function getThemePalette(config: EnteteConfig): {
  primary: [number, number, number];
  accent: [number, number, number];
  emerald: [number, number, number];
} {
  const emerald: [number, number, number] = [4, 120, 87];
  switch (config.themeCouleur) {
    case 'rouge':
      return { primary: [153, 27, 27], accent: [30, 41, 59], emerald };
    case 'emeraude':
      return { primary: [6, 95, 70], accent: [4, 120, 87], emerald };
    case 'indigo':
      return { primary: [55, 48, 163], accent: [67, 56, 202], emerald };
    case 'sombre':
      return { primary: [15, 23, 42], accent: [71, 85, 105], emerald };
    case 'custom':
      return {
        primary: hexToRgb(config.couleurPrimaire, [30, 41, 59]),
        accent: hexToRgb(config.couleurAccent, [185, 28, 28]),
        emerald
      };
    case 'slate':
    default:
      return { primary: [30, 41, 59], accent: [185, 28, 28], emerald };
  }
}

/**
 * Render custom professional header on the PDF
 */
function renderCustomHeader(
  doc: jsPDF,
  config: EnteteConfig,
  pageWidth: number,
  titleDoc: string,
  subDoc: string
): number {
  const palette = getThemePalette(config);
  const fontFam = config.fontFamily || 'helvetica';
  const fontStyle = config.formePolice || 'bold';
  const titleText = config.majusculesTitre ? (config.etablissement || 'SALFA').toUpperCase() : (config.etablissement || 'SALFA');
  const dateStr = new Date().toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });

  let currentY = 10;

  // 1. Bandeau supérieur ou séparateur
  if (config.styleSeparateur === 'bandeau') {
    doc.setFillColor(palette.primary[0], palette.primary[1], palette.primary[2]);
    doc.rect(0, 0, pageWidth, 16, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont(fontFam, fontStyle);
    doc.setFontSize(Math.min(config.titreTaille, 13));
    doc.text(titleText, 12, 10.5);

    if (config.afficherDateGeneration) {
      doc.setFont(fontFam, 'normal');
      doc.setFontSize(8);
      doc.text(`Édité le : ${dateStr}`, pageWidth - 12, 10.5, { align: 'right' });
    }

    currentY = 22;
  } else {
    // Top text header (sans bandeau plein)
    doc.setFont(fontFam, fontStyle);
    doc.setFontSize(config.titreTaille);
    doc.setTextColor(palette.primary[0], palette.primary[1], palette.primary[2]);

    if (config.alignement === 'center') {
      doc.text(titleText, pageWidth / 2, currentY, { align: 'center' });
      currentY += 5;
      if (config.sousTitre) {
        doc.setFont(fontFam, 'normal');
        doc.setFontSize(config.sousTitreTaille);
        doc.setTextColor(71, 85, 105);
        doc.text(config.sousTitre, pageWidth / 2, currentY, { align: 'center' });
        currentY += 4.5;
      }
    } else if (config.alignement === 'between') {
      doc.text(titleText, 12, currentY);
      if (config.afficherDateGeneration) {
        doc.setFont(fontFam, 'normal');
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.text(`Édité le : ${dateStr}`, pageWidth - 12, currentY, { align: 'right' });
      }
      currentY += 5;
      if (config.sousTitre) {
        doc.setFont(fontFam, 'normal');
        doc.setFontSize(config.sousTitreTaille);
        doc.setTextColor(71, 85, 105);
        doc.text(config.sousTitre, 12, currentY);
        currentY += 4.5;
      }
    } else {
      // Left aligned
      doc.text(titleText, 12, currentY);
      currentY += 5;
      if (config.sousTitre) {
        doc.setFont(fontFam, 'normal');
        doc.setFontSize(config.sousTitreTaille);
        doc.setTextColor(71, 85, 105);
        doc.text(config.sousTitre, 12, currentY);
        currentY += 4.5;
      }
    }

    // Coordonnées & Mentions légales
    const contactLine1 = [config.adresse, config.villePays].filter(Boolean).join(' • ');
    const contactLine2 = [config.telephone ? `Tél: ${config.telephone}` : '', config.email ? `Email: ${config.email}` : '', config.nifStat].filter(Boolean).join(' | ');

    if (contactLine1 || contactLine2) {
      doc.setFont(fontFam, 'normal');
      doc.setFontSize(config.corpsTaille);
      doc.setTextColor(100, 116, 139);

      if (config.alignement === 'center') {
        if (contactLine1) { doc.text(contactLine1, pageWidth / 2, currentY, { align: 'center' }); currentY += 3.8; }
        if (contactLine2) { doc.text(contactLine2, pageWidth / 2, currentY, { align: 'center' }); currentY += 3.8; }
      } else {
        if (contactLine1) { doc.text(contactLine1, 12, currentY); currentY += 3.8; }
        if (contactLine2) { doc.text(contactLine2, 12, currentY); currentY += 3.8; }
      }
    }

    if (config.styleSeparateur === 'ligne_simple') {
      currentY += 1;
      doc.setDrawColor(palette.primary[0], palette.primary[1], palette.primary[2]);
      doc.setLineWidth(0.6);
      doc.line(12, currentY, pageWidth - 12, currentY);
      currentY += 5;
    } else if (config.styleSeparateur === 'double_ligne') {
      currentY += 1;
      doc.setDrawColor(palette.primary[0], palette.primary[1], palette.primary[2]);
      doc.setLineWidth(0.7);
      doc.line(12, currentY, pageWidth - 12, currentY);
      doc.setDrawColor(palette.accent[0], palette.accent[1], palette.accent[2]);
      doc.setLineWidth(0.3);
      doc.line(12, currentY + 1.2, pageWidth - 12, currentY + 1.2);
      currentY += 6;
    } else {
      currentY += 3;
    }
  }

  // Document Title
  doc.setTextColor(palette.accent[0], palette.accent[1], palette.accent[2]);
  doc.setFont(fontFam, 'bold');
  doc.setFontSize(13);
  doc.text(titleDoc, 12, currentY);
  currentY += 5;

  // Subtitle
  if (subDoc && subDoc.trim().length > 0) {
    doc.setFont(fontFam, 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text(subDoc, 12, currentY);
    currentY += 6;
  } else {
    currentY += 2;
  }

  return currentY;
}

/**
 * Calcule la liste et les synthèses des créances de recouvrement avec un seuil de retard
 */
export function calculateRecouvrementData(
  prestations: Prestation[],
  paiements: Paiement[] = [],
  societes: Societe[] = [],
  personnes: Personne[] = [],
  seuilMois: number = 3,
  filtreSocieteId?: string
): RecouvrementSummary {
  const now = new Date();
  const seuilJours = seuilMois * 30;

  const paiementsParPrestation: Record<string, number> = {};
  const paiementsParLigne: Record<string, number> = {};

  paiements.forEach(p => {
    p.lignes.forEach(l => {
      const paye = Number(l.totalPaye || l.montantPaye || 0);
      const exclu = Number(l.montantExclu || 0);
      if (paye > 0 || exclu > 0) {
        if (l.prestationId) {
          paiementsParPrestation[l.prestationId] = (paiementsParPrestation[l.prestationId] || 0) + paye;
        }
        if (l.lignePrestationId) {
          paiementsParLigne[l.lignePrestationId] = (paiementsParLigne[l.lignePrestationId] || 0) + paye;
        }
      }
    });
  });

  const items: RecouvrementItem[] = [];
  const socMap: Record<string, {
    societeNom: string;
    dossiersCount: number;
    totalBrut: number;
    totalARembourser: number;
    totalPaye: number;
    resteARecouvrer: number;
    maxRetardJours: number;
  }> = {};

  const moisMap: Record<string, {
    moisKey: string;
    moisLibelle: string;
    dossiersCount: number;
    totalBrut: number;
    totalARembourser: number;
    totalPaye: number;
    resteARecouvrer: number;
  }> = {};

  const MOIS_FR = [
    'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
  ];

  function formatMoisFR(key: string): string {
    if (!key || key === 'Inconnu') return 'Non spécifié';
    const parts = key.split('-');
    if (parts.length >= 2) {
      const year = parts[0];
      const monthIdx = parseInt(parts[1], 10) - 1;
      if (monthIdx >= 0 && monthIdx < 12) {
        return `${MOIS_FR[monthIdx]} ${year}`;
      }
    }
    return key;
  }

  let totalARecouvrer = 0;
  let totalBrut = 0;
  let totalTicketModerateur = 0;
  let totalARembourser = 0;
  let totalPaye = 0;

  prestations.forEach(p => {
    if (filtreSocieteId && filtreSocieteId !== 'ALL' && p.societeId !== filtreSocieteId) {
      return;
    }

    const soc = societes.find(s => s.id === p.societeId);
    const socNom = p.societeNom || soc?.nom || 'Assurance non spécifiée';
    const pers = personnes.find(pe => pe.id === p.personneId);
    const patientNom = p.nomAgent || pers?.nomPrenom || 'Agent / Assuré inconnu';
    const matricule = p.matricule || pers?.matricule || '-';

    const pTotal = Number(p.totalPrestation ?? p.montantTotal ?? 0);
    const pTicket = Number(p.participation ?? p.ticketModerateur ?? 0);
    const pARemb = Number(p.montantARembourser ?? Math.max(0, pTotal - pTicket));

    let pPaye = Math.max(Number(p.totalPaye || 0), paiementsParPrestation[p.id] || 0);
    let linesPaye = 0;
    p.lignes.forEach(l => {
      const lp = Math.max(l.totalPaye || 0, paiementsParLigne[l.id] || 0);
      linesPaye += lp;
    });
    pPaye = Math.max(pPaye, linesPaye);

    const reste = Math.max(0, pARemb - pPaye);

    if (reste <= 50) return;

    let retardJours = 0;
    if (p.date) {
      const pDate = new Date(p.date);
      const diffTime = now.getTime() - pDate.getTime();
      retardJours = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));
    }

    if (retardJours < seuilJours) return;

    const retardMois = Math.round(retardJours / 30);

    totalARecouvrer += reste;
    totalBrut += pTotal;
    totalTicketModerateur += pTicket;
    totalARembourser += pARemb;
    totalPaye += pPaye;

    items.push({
      prestationId: p.id,
      numeroFacture: p.numeroFacture,
      dateFacture: p.date,
      societeNom: socNom,
      sousSociete: p.sousSociete,
      patientNom,
      matricule,
      montantBrut: pTotal,
      ticketModerateur: pTicket,
      montantARembourser: pARemb,
      totalPaye: pPaye,
      resteARecouvrer: reste,
      retardJours,
      retardMois,
      statut: p.statut || (pPaye > 0 ? 'Partiellement payé' : 'Non payé'),
    });

    if (!socMap[socNom]) {
      socMap[socNom] = {
        societeNom: socNom,
        dossiersCount: 0,
        totalBrut: 0,
        totalARembourser: 0,
        totalPaye: 0,
        resteARecouvrer: 0,
        maxRetardJours: 0,
      };
    }
    const sm = socMap[socNom];
    sm.dossiersCount += 1;
    sm.totalBrut += pTotal;
    sm.totalARembourser += pARemb;
    sm.totalPaye += pPaye;
    sm.resteARecouvrer += reste;
    if (retardJours > sm.maxRetardJours) sm.maxRetardJours = retardJours;

    const mKey = p.date ? p.date.substring(0, 7) : 'Inconnu';
    if (!moisMap[mKey]) {
      moisMap[mKey] = {
        moisKey: mKey,
        moisLibelle: formatMoisFR(mKey),
        dossiersCount: 0,
        totalBrut: 0,
        totalARembourser: 0,
        totalPaye: 0,
        resteARecouvrer: 0,
      };
    }
    const mm = moisMap[mKey];
    mm.dossiersCount += 1;
    mm.totalBrut += pTotal;
    mm.totalARembourser += pARemb;
    mm.totalPaye += pPaye;
    mm.resteARecouvrer += reste;
  });

  items.sort((a, b) => b.retardJours - a.retardJours);

  const parSociete = Object.values(socMap).sort((a, b) => b.resteARecouvrer - a.resteARecouvrer);
  const parMois = Object.values(moisMap).sort((a, b) => b.moisKey.localeCompare(a.moisKey));

  return {
    items,
    totalARecouvrer,
    totalBrut,
    totalTicketModerateur,
    totalARembourser,
    totalPaye,
    dossiersCount: items.length,
    parSociete,
    parMois
  };
}

/**
 * Génère et télécharge le rapport PDF de l'état de recouvrement global (> 3 mois de retard)
 */
export function generateRecouvrementPdf(
  data: RecouvrementSummary,
  options?: {
    titreEtablissement?: string;
    seuilMois?: number;
    nomFiltreSociete?: string;
    enteteConfig?: EnteteConfig;
  }
) {
  const config = options?.enteteConfig || getStoredEnteteConfig();
  const palette = getThemePalette(config);
  const fontFam = config.fontFamily || 'helvetica';

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const seuil = options?.seuilMois ?? 3;
  const filtreSoc = options?.nomFiltreSociete || 'Toutes les assurances';
  const pageWidth = 297;

  let currentY = renderCustomHeader(
    doc,
    config,
    pageWidth,
    'ÉTAT DE RECOUVREMENT DES CRÉANCES EN RETARD',
    `Factures non soldées échues avec retard supérieur à ${seuil} mois (> ${seuil * 30} jours) • Périmètre : ${filtreSoc}`
  );

  // Bloc de synthèse (KPIs Cards)
  const cardY = currentY;
  const cardH = 17;
  const cardW = 64;

  doc.setFillColor(254, 242, 242);
  doc.setDrawColor(254, 202, 202);
  doc.roundedRect(12, cardY, cardW, cardH, 2, 2, 'FD');
  doc.setTextColor(153, 27, 27);
  doc.setFontSize(7.5);
  doc.setFont(fontFam, 'bold');
  doc.text(`TOTAL À RECOUVRER (> ${seuil} MOIS)`, 16, cardY + 5.5);
  doc.setFontSize(12.5);
  doc.text(formatMoney(data.totalARecouvrer), 16, cardY + 12.5);

  doc.setFillColor(241, 245, 249);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(80, cardY, cardW, cardH, 2, 2, 'FD');
  doc.setTextColor(51, 65, 85);
  doc.setFontSize(7.5);
  doc.setFont(fontFam, 'bold');
  doc.text('TOTAL FACTURÉ BRUT', 84, cardY + 5.5);
  doc.setFontSize(11.5);
  doc.text(formatMoney(data.totalBrut), 84, cardY + 12.5);

  doc.setFillColor(236, 253, 245);
  doc.setDrawColor(167, 243, 208);
  doc.roundedRect(148, cardY, cardW, cardH, 2, 2, 'FD');
  doc.setTextColor(4, 120, 87);
  doc.setFontSize(7.5);
  doc.setFont(fontFam, 'bold');
  doc.text('DÉJÀ RÉGLÉ PAR ASSURANCES', 152, cardY + 5.5);
  doc.setFontSize(11.5);
  doc.text(formatMoney(data.totalPaye), 152, cardY + 12.5);

  doc.setFillColor(238, 242, 255);
  doc.setDrawColor(199, 210, 254);
  doc.roundedRect(216, cardY, cardW, cardH, 2, 2, 'FD');
  doc.setTextColor(67, 56, 202);
  doc.setFontSize(7.5);
  doc.setFont(fontFam, 'bold');
  doc.text('DOSSIERS EN SOUFFRANCE', 220, cardY + 5.5);
  doc.setFontSize(11.5);
  doc.text(`${data.dossiersCount} factures (${data.parSociete.length} ass.)`, 220, cardY + 12.5);

  currentY = cardY + cardH + 7;

  // 1. Récapitulatif mensuel
  if (data.parMois && data.parMois.length > 0) {
    doc.setTextColor(palette.primary[0], palette.primary[1], palette.primary[2]);
    doc.setFontSize(9.5);
    doc.setFont(fontFam, 'bold');
    doc.text('1. Récapitulatif Mensuel des Impayés & Créances en Retard', 12, currentY);

    const moisHeaders = ['Mois / Période', 'Factures', 'Total Facturé', 'Charge Assureur', 'Déjà Réglé', 'Solde Impayé'];
    const moisRows = data.parMois.map(m => [
      m.moisLibelle,
      String(m.dossiersCount),
      formatMoney(m.totalBrut),
      formatMoney(m.totalARembourser),
      formatMoney(m.totalPaye),
      formatMoney(m.resteARecouvrer)
    ]);

    moisRows.push([
      'TOTAL GÉNÉRAL',
      String(data.dossiersCount),
      formatMoney(data.totalBrut),
      formatMoney(data.totalARembourser),
      formatMoney(data.totalPaye),
      formatMoney(data.totalARecouvrer)
    ]);

    autoTable(doc, {
      startY: currentY + 3,
      head: [moisHeaders],
      body: moisRows,
      theme: 'grid',
      headStyles: {
        fillColor: [palette.accent[0], palette.accent[1], palette.accent[2]],
        textColor: 255,
        fontSize: 7.5,
        fontStyle: 'bold',
        halign: 'left',
      },
      styles: { fontSize: 7, cellPadding: 1.6, textColor: [30, 41, 59] },
      columnStyles: {
        0: { fontStyle: 'bold', minCellWidth: 45 },
        1: { halign: 'center', cellWidth: 20 },
        2: { halign: 'right', cellWidth: 40 },
        3: { halign: 'right', cellWidth: 40 },
        4: { halign: 'right', cellWidth: 40, textColor: [4, 120, 87] },
        5: { halign: 'right', cellWidth: 48, fontStyle: 'bold', textColor: [185, 28, 28] },
      },
      didParseCell: (hookData) => {
        if (hookData.section === 'body' && hookData.row.index === moisRows.length - 1) {
          hookData.cell.styles.fontStyle = 'bold';
          hookData.cell.styles.fillColor = [254, 242, 242];
        }
      },
    });

    currentY = (doc as any).lastAutoTable.finalY + 6;
  }

  // 2. Ventilation par Société
  if (data.parSociete.length > 0 && currentY < 155) {
    doc.setTextColor(palette.primary[0], palette.primary[1], palette.primary[2]);
    doc.setFontSize(9.5);
    doc.setFont(fontFam, 'bold');
    doc.text('2. Ventilation par Organisme / Assurance', 12, currentY);

    const recapHeaders = ['Organisme / Assurance', 'Factures', 'Total Facturé', 'Charge Assureur', 'Déjà Réglé', 'Solde à Recouvrer', 'Max Retard'];
    const recapRows = data.parSociete.map(s => [
      s.societeNom,
      String(s.dossiersCount),
      formatMoney(s.totalBrut),
      formatMoney(s.totalARembourser),
      formatMoney(s.totalPaye),
      formatMoney(s.resteARecouvrer),
      `${s.maxRetardJours} j (${Math.round(s.maxRetardJours / 30)} m)`
    ]);

    recapRows.push([
      'TOTAL GÉNÉRAL',
      String(data.dossiersCount),
      formatMoney(data.totalBrut),
      formatMoney(data.totalARembourser),
      formatMoney(data.totalPaye),
      formatMoney(data.totalARecouvrer),
      ''
    ]);

    autoTable(doc, {
      startY: currentY + 3,
      head: [recapHeaders],
      body: recapRows,
      theme: 'grid',
      headStyles: {
        fillColor: [palette.primary[0], palette.primary[1], palette.primary[2]],
        textColor: 255,
        fontSize: 7.5,
        fontStyle: 'bold',
        halign: 'left',
      },
      styles: { fontSize: 7, cellPadding: 1.6, textColor: [30, 41, 59] },
      columnStyles: {
        0: { fontStyle: 'bold', minCellWidth: 55 },
        1: { halign: 'center', cellWidth: 20 },
        2: { halign: 'right', cellWidth: 35 },
        3: { halign: 'right', cellWidth: 35 },
        4: { halign: 'right', cellWidth: 35, textColor: [4, 120, 87] },
        5: { halign: 'right', cellWidth: 40, fontStyle: 'bold', textColor: [185, 28, 28] },
        6: { halign: 'center', cellWidth: 30, textColor: [153, 27, 27] }
      },
      didParseCell: (hookData) => {
        if (hookData.section === 'body' && hookData.row.index === recapRows.length - 1) {
          hookData.cell.styles.fontStyle = 'bold';
          hookData.cell.styles.fillColor = [254, 242, 242];
        }
      },
    });
  }

  // 3. Tableau nominatif
  doc.addPage();
  currentY = 16;
  doc.setTextColor(palette.primary[0], palette.primary[1], palette.primary[2]);
  doc.setFontSize(9.5);
  doc.setFont(fontFam, 'bold');
  doc.text('3. Liste Détaillée des Créances Échues (> 3 Mois)', 12, currentY);

  const detailHeaders = [
    'Date & Matricule',
    'Patient / Assuré (Sous-Société)',
    'Organisme',
    'Montant Brut',
    'Ticket Mod.',
    'Charge Assur.',
    'Déjà Payé',
    'Reste Dû',
    'Retard'
  ];

  const detailRows = data.items.map(item => {
    const dateMat = item.matricule && item.matricule !== '-' ? `${formatDate(item.dateFacture)}\n(${item.matricule})` : formatDate(item.dateFacture);
    const patientSoc = item.patientNom + (item.sousSociete ? ` (${item.sousSociete})` : '');
    return [
      dateMat,
      patientSoc,
      item.societeNom,
      formatMoney(item.montantBrut),
      formatMoney(item.ticketModerateur),
      formatMoney(item.montantARembourser),
      formatMoney(item.totalPaye),
      formatMoney(item.resteARecouvrer),
      `${item.retardJours} j`
    ];
  });

  detailRows.push([
    'TOTAL GÉNÉRAL',
    `${data.dossiersCount} factures`,
    '',
    formatMoney(data.totalBrut),
    formatMoney(data.totalTicketModerateur),
    formatMoney(data.totalARembourser),
    formatMoney(data.totalPaye),
    formatMoney(data.totalARecouvrer),
    ''
  ]);

  autoTable(doc, {
    startY: currentY + 3,
    head: [detailHeaders],
    body: detailRows,
    theme: 'grid',
    headStyles: {
      fillColor: [palette.primary[0], palette.primary[1], palette.primary[2]],
      textColor: 255,
      fontSize: 7.5,
      fontStyle: 'bold',
      halign: 'left',
    },
    styles: { fontSize: 7, cellPadding: 1.5, textColor: [30, 41, 59] },
    columnStyles: {
      0: { cellWidth: 32 },
      1: { cellWidth: 60 },
      2: { cellWidth: 40 },
      3: { halign: 'right', cellWidth: 26 },
      4: { halign: 'right', cellWidth: 24, textColor: [180, 83, 9] },
      5: { halign: 'right', cellWidth: 26 },
      6: { halign: 'right', cellWidth: 26, textColor: [4, 120, 87] },
      7: { halign: 'right', cellWidth: 28, fontStyle: 'bold', textColor: [185, 28, 28] },
      8: { halign: 'center', cellWidth: 18, textColor: [153, 27, 27] }
    },
    didParseCell: (hookData) => {
      if (hookData.section === 'body' && hookData.row.index === detailRows.length - 1) {
        hookData.cell.styles.fontStyle = 'bold';
        hookData.cell.styles.fillColor = [254, 242, 242];
      }
    }
  });

  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.setDrawColor(226, 232, 240);
    doc.line(12, 200, 285, 200);
    doc.text(config.textePiedDePage || `Document Confidentiel de Recouvrement • ${config.etablissement}`, 12, 205);
    doc.text(`Page ${i} sur ${pageCount}`, 285, 205, { align: 'right' });
  }

  const filename = `Etat_Recouvrement_Plus_${seuil}_Mois_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(filename);
}

/**
 * Résout le nom complet d'un acte médical (ex: CONS -> Consultations & Visites Médicales)
 */
function getFullActeLabel(code?: string, libelle?: string, familles?: Famille[]): string {
  const cleanCode = (code || '').toUpperCase().trim();
  const cleanLib = (libelle || '').trim();

  // Recherche dans les familles définies ou initiales
  const matchedFam = familles?.find(f => 
    f.code.toUpperCase() === cleanCode || 
    (f.aliases && f.aliases.some(a => a.toUpperCase() === cleanCode))
  ) || initialFamilles.find(f =>
    f.code.toUpperCase() === cleanCode ||
    (f.aliases && f.aliases.some(a => a.toUpperCase() === cleanCode))
  );

  if (matchedFam) {
    return matchedFam.libelle;
  }

  // Dictionnaire standard des correspondances
  if (cleanCode === 'CONS' || cleanCode === 'CG' || cleanCode === 'CS' || cleanLib.toUpperCase().includes('CONSULT') || cleanLib.toUpperCase().includes('VISITE')) {
    return 'Consultations & Visites Médicales';
  }
  if (cleanCode === 'PHAR' || cleanCode === 'PH' || cleanCode === 'PHSB' || cleanLib.toUpperCase().includes('PHARMACIE') || cleanLib.toUpperCase().includes('MEDIC')) {
    return 'Pharmacie & Médicaments';
  }
  if (cleanCode === 'LABO' || cleanCode === 'EB' || cleanLib.toUpperCase().includes('LABO') || cleanLib.toUpperCase().includes('ANALYSE')) {
    return 'Analyses Médicales & Laboratoire';
  }
  if (cleanCode === 'DENT' || cleanCode === 'DC' || cleanCode === 'DK' || cleanLib.toUpperCase().includes('DENT')) {
    return 'Soins Dentaires';
  }
  if (cleanCode === 'ECHO' || cleanCode === 'RADI' || cleanLib.toUpperCase().includes('ECHO') || cleanLib.toUpperCase().includes('RADIO')) {
    return 'Échographie & Imagerie';
  }
  if (cleanCode === 'HOSP' || cleanLib.toUpperCase().includes('HOSPIT')) {
    return 'Hospitalisation & Séjour';
  }
  if (cleanCode === 'SOINS' || cleanLib.toUpperCase().includes('SOIN')) {
    return 'Soins Médicaux & Infirmiers';
  }
  if (cleanCode === 'MAT' || cleanLib.toUpperCase().includes('MATERN')) {
    return 'Maternité & Accouchement';
  }

  if (cleanLib && cleanLib.toUpperCase() !== cleanCode) {
    return cleanLib;
  }

  return cleanCode === 'CONS' ? 'Consultations & Visites Médicales' : (cleanCode || 'Acte');
}

/**
 * Génère le rapport PDF en orientation PORTRAIT pour la sélection (une seule société ou sélection spécifique)
 * Conforme aux exigences :
 * - Orientation : PORTRAIT (A4)
 * - Suppression des colonnes : "N° Facture / Code" et "Organisme / Client"
 * - Nom suivi de la Sous-Société entre parenthèses
 * - Matricule placé après la date
 * - En-tête entièrement paramétrable (format, taille, forme de police, couleurs)
 */
export function generateSelectedPrestationsPdf(
  prestations: Prestation[],
  paiements: Paiement[],
  societes: Societe[],
  personnes: Personne[],
  options?: {
    titreEtablissement?: string;
    enteteConfig?: EnteteConfig;
    familles?: Famille[];
  }
) {
  const config = options?.enteteConfig || getStoredEnteteConfig();
  const palette = getThemePalette(config);
  const fontFam = config.fontFamily || 'helvetica';

  // Orientation PORTRAIT comme demandé explicitement par l'utilisateur
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 210;
  const pageHeight = 297;

  // Déterminer la société principale de la sélection
  const firstSocId = prestations[0]?.societeId;
  const mainSocNom = prestations[0]?.societeNom || societes.find(s => s.id === firstSocId)?.nom || 'Organisme';

  let currentY = renderCustomHeader(
    doc,
    config,
    pageWidth,
    `ÉTAT DE DÉCOMPTE & RECOUVREMENT • ${mainSocNom.toUpperCase()}`,
    ''
  );

  // Calculs paiements
  const paiementsParPrestation: Record<string, number> = {};
  const paiementsParLigne: Record<string, number> = {};
  paiements.forEach(p => {
    p.lignes.forEach(l => {
      const paye = Number(l.totalPaye || l.montantPaye || 0);
      const exclu = Number(l.montantExclu || 0);
      if (paye > 0 || exclu > 0) {
        if (l.prestationId) paiementsParPrestation[l.prestationId] = (paiementsParPrestation[l.prestationId] || 0) + paye;
        if (l.lignePrestationId) paiementsParLigne[l.lignePrestationId] = (paiementsParLigne[l.lignePrestationId] || 0) + paye;
      }
    });
  });

  let totalFacture = 0;
  let totalTicket = 0;
  let totalRemb = 0;
  let totalPayeAll = 0;
  let totalResteAll = 0;

  const moisMap: Record<string, {
    moisKey: string;
    moisLibelle: string;
    dossiersCount: number;
    totalBrut: number;
    ticket: number;
    totalARembourser: number;
    totalPaye: number;
    resteARecouvrer: number;
  }> = {};

  const MOIS_FR = [
    'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
  ];

  function formatMoisFR(key: string): string {
    if (!key || key === 'Inconnu') return 'Non spécifié';
    const parts = key.split('-');
    if (parts.length >= 2) {
      const year = parts[0];
      const monthIdx = parseInt(parts[1], 10) - 1;
      if (monthIdx >= 0 && monthIdx < 12) {
        return `${MOIS_FR[monthIdx]} ${year}`;
      }
    }
    return key;
  }

  const detailRows: any[] = [];

  prestations.forEach(p => {
    const pers = personnes.find(pe => pe.id === p.personneId);
    const nomPatient = (p.nomAgent || pers?.nomPrenom || 'Agent').trim();
    const matricule = (p.matricule || pers?.matricule || '').trim();
    const sousSoc = (p.sousSociete || '').trim();

    const montantBrut = Number(p.totalPrestation ?? p.montantTotal ?? 0);
    const ticket = Number(p.participation ?? p.ticketModerateur ?? 0);
    const charge = Number(p.montantARembourser ?? Math.max(0, montantBrut - ticket));

    let prestPaye = Math.max(Number(p.totalPaye || 0), paiementsParPrestation[p.id] || 0);
    let linesPaye = 0;
    p.lignes?.forEach(l => {
      const lp = Math.max(l.totalPaye || 0, paiementsParLigne[l.id] || 0);
      linesPaye += lp;
    });
    prestPaye = Math.max(prestPaye, linesPaye);
    const prestReste = Math.max(0, charge - prestPaye);

    totalFacture += montantBrut;
    totalTicket += ticket;
    totalRemb += charge;
    totalPayeAll += prestPaye;
    totalResteAll += prestReste;

    // Regroupement Mois
    const mKey = p.date ? p.date.substring(0, 7) : 'Inconnu';
    if (!moisMap[mKey]) {
      moisMap[mKey] = {
        moisKey: mKey,
        moisLibelle: formatMoisFR(mKey),
        dossiersCount: 0,
        totalBrut: 0,
        ticket: 0,
        totalARembourser: 0,
        totalPaye: 0,
        resteARecouvrer: 0,
      };
    }
    const mm = moisMap[mKey];
    mm.dossiersCount += 1;
    mm.totalBrut += montantBrut;
    mm.ticket += ticket;
    mm.totalARembourser += charge;
    mm.totalPaye += prestPaye;
    mm.resteARecouvrer += prestReste;

    // Formatage demandé :
    // 1. Date suivie du Matricule
    const dateAndMatricule = matricule && matricule !== '-' ? `${formatDate(p.date)}\n(${matricule})` : formatDate(p.date);

    // 2. Nom du patient suivi de la Sous Société entre parenthèses
    const nomAndSousSociete = sousSoc ? `${nomPatient} (${sousSoc})` : nomPatient;

    const hasSubLines = !!(p.lignes && p.lignes.length > 0);
    const rowSpanCount = hasSubLines ? 1 + p.lignes.length : 1;

    // Ligne principale de la prestation (Date centrée et fusionnée avec ses lignes d'actes)
    detailRows.push([
      { 
        content: dateAndMatricule, 
        rowSpan: rowSpanCount, 
        styles: { 
          halign: 'center', 
          valign: 'middle', 
          fontStyle: 'bold',
          fillColor: [255, 255, 255]
        } 
      },
      { content: nomAndSousSociete, styles: { fontStyle: 'bold', textColor: [15, 23, 42] } },
      { content: formatMoney(montantBrut), styles: { halign: 'right', fontStyle: 'bold' } },
      { content: formatMoney(ticket), styles: { halign: 'right', textColor: [180, 83, 9], fontStyle: 'bold' } },
      { content: formatMoney(charge), styles: { halign: 'right', fontStyle: 'bold' } },
      { content: formatMoney(prestPaye), styles: { halign: 'right', textColor: [4, 120, 87], fontStyle: 'bold' } },
      { content: formatMoney(prestReste), styles: { halign: 'right', fontStyle: 'bold', textColor: [185, 28, 28] } },
    ]);

    // Lignes d'actes rattachés (fusionnées sous la même date)
    p.lignes?.forEach(l => {
      const lBrut = l.totalPrestation || 0;
      const lTicket = l.ticketModerateur ?? Math.round((p.ticketModerateur || 0) / (p.lignes.length || 1));
      const lCharge = l.montantARembourser ?? Math.max(0, lBrut - lTicket);
      const lPaye = Math.max(l.totalPaye || 0, paiementsParLigne[l.id] || 0);
      const lReste = Math.max(0, lCharge - lPaye);
      const fullActeName = getFullActeLabel(l.code, l.libelle, options?.familles);

      detailRows.push([
        { content: `   - ${fullActeName}`, styles: { textColor: [100, 116, 139] } },
        { content: formatMoney(lBrut), styles: { halign: 'right', textColor: [100, 116, 139] } },
        { content: formatMoney(lTicket), styles: { halign: 'right', textColor: [100, 116, 139] } },
        { content: formatMoney(lCharge), styles: { halign: 'right', textColor: [100, 116, 139] } },
        { content: formatMoney(lPaye), styles: { halign: 'right', textColor: [100, 116, 139] } },
        { content: formatMoney(lReste), styles: { halign: 'right', textColor: [100, 116, 139] } }
      ]);
    });
  });

  // Ligne de TOTAL GÉNÉRAL
  detailRows.push([
    { content: `TOTAL GÉNÉRAL (${prestations.length} factures)`, colSpan: 2, styles: { fontStyle: 'bold', fillColor: [254, 242, 242] } },
    { content: formatMoney(totalFacture), styles: { fontStyle: 'bold', halign: 'right', fillColor: [254, 242, 242] } },
    { content: formatMoney(totalTicket), styles: { fontStyle: 'bold', halign: 'right', textColor: [180, 83, 9], fillColor: [254, 242, 242] } },
    { content: formatMoney(totalRemb), styles: { fontStyle: 'bold', halign: 'right', fillColor: [254, 242, 242] } },
    { content: formatMoney(totalPayeAll), styles: { fontStyle: 'bold', halign: 'right', textColor: [4, 120, 87], fillColor: [254, 242, 242] } },
    { content: formatMoney(totalResteAll), styles: { fontStyle: 'bold', halign: 'right', textColor: [185, 28, 28], fillColor: [254, 242, 242] } },
  ]);

  // 1. Récapitulatif mensuel en Portrait
  const parMois = Object.values(moisMap).sort((a, b) => b.moisKey.localeCompare(a.moisKey));
  if (parMois.length > 0) {
    doc.setTextColor(palette.primary[0], palette.primary[1], palette.primary[2]);
    doc.setFontSize(9);
    doc.setFont(fontFam, 'bold');
    doc.text('1. Synthèse Mensuelle des Créances', 12, currentY);

    const moisHeaders = [
      'Mois / Période',
      'Fact.',
      'Total Brut',
      'Ticket Mod.',
      'Charge Assur.',
      'Déjà Réglé',
      'Reste Dû'
    ];

    const moisRows = parMois.map(m => [
      m.moisLibelle,
      String(m.dossiersCount),
      formatMoney(m.totalBrut),
      formatMoney(m.ticket),
      formatMoney(m.totalARembourser),
      formatMoney(m.totalPaye),
      formatMoney(m.resteARecouvrer)
    ]);

    moisRows.push([
      'TOTAL GÉNÉRAL',
      String(prestations.length),
      formatMoney(totalFacture),
      formatMoney(totalTicket),
      formatMoney(totalRemb),
      formatMoney(totalPayeAll),
      formatMoney(totalResteAll)
    ]);

    autoTable(doc, {
      startY: currentY + 2.5,
      head: [moisHeaders],
      body: moisRows,
      theme: 'grid',
      headStyles: {
        fillColor: [palette.accent[0], palette.accent[1], palette.accent[2]],
        textColor: 255,
        fontSize: 7.5,
        fontStyle: 'bold',
        halign: 'left',
      },
      styles: {
        fontSize: 6.8,
        cellPadding: 1.4,
        textColor: [30, 41, 59],
      },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 42 },
        1: { halign: 'center', cellWidth: 14 },
        2: { halign: 'right', cellWidth: 26 },
        3: { halign: 'right', cellWidth: 24 },
        4: { halign: 'right', cellWidth: 26 },
        5: { halign: 'right', cellWidth: 26, textColor: [4, 120, 87] },
        6: { halign: 'right', cellWidth: 28, fontStyle: 'bold', textColor: [185, 28, 28] },
      },
      didParseCell: (hookData) => {
        if (hookData.section === 'body' && hookData.row.index === moisRows.length - 1) {
          hookData.cell.styles.fontStyle = 'bold';
          hookData.cell.styles.fillColor = [254, 242, 242];
        }
      },
    });

    currentY = (doc as any).lastAutoTable.finalY + 6;
  }

  // 2. Tableau Nominatif Détaillé en Portrait
  // Colonnes demandées :
  // - Date & Matricule
  // - Patient / Assuré (Sous Société)
  // - Montant Brut
  // - Ticket Mod.
  // - Charge Assur.
  // - Déjà Payé
  // - Reste Dû
  if (currentY > 210) {
    doc.addPage();
    currentY = 16;
  }

  doc.setTextColor(palette.primary[0], palette.primary[1], palette.primary[2]);
  doc.setFontSize(9);
  doc.setFont(fontFam, 'bold');
  doc.text('2. Liste Nominative Détaillée des Factures & Actes (Portrait)', 12, currentY);

  const detailHeaders = [
    { content: 'Date & Matricule', styles: { halign: 'center' } },
    { content: 'Patient / Assuré (Sous-Société) & Actes', styles: { halign: 'left' } },
    { content: 'Montant Brut', styles: { halign: 'right' } },
    { content: 'Ticket Mod.', styles: { halign: 'right' } },
    { content: 'Charge Assur.', styles: { halign: 'right' } },
    { content: 'Déjà Payé', styles: { halign: 'right' } },
    { content: 'Reste Dû', styles: { halign: 'right' } }
  ];

  autoTable(doc, {
    startY: currentY + 2.5,
    head: [detailHeaders as any],
    body: detailRows,
    theme: 'grid',
    headStyles: {
      fillColor: [palette.primary[0], palette.primary[1], palette.primary[2]],
      textColor: 255,
      fontSize: 7.5,
      fontStyle: 'bold',
    },
    styles: {
      fontSize: 6.8,
      cellPadding: 1.4,
      textColor: [30, 41, 59],
    },
    columnStyles: {
      0: { cellWidth: 30, halign: 'center', valign: 'middle' },
      1: { cellWidth: 52 },
      2: { halign: 'right', cellWidth: 21 },
      3: { halign: 'right', cellWidth: 19, textColor: [180, 83, 9] },
      4: { halign: 'right', cellWidth: 21 },
      5: { halign: 'right', cellWidth: 21, textColor: [4, 120, 87] },
      6: { halign: 'right', cellWidth: 22 }
    },
    didParseCell: (hookData) => {
      // Style des lignes d'actes indentées
      const rawCell0 = (hookData.row.raw && Array.isArray(hookData.row.raw)) ? hookData.row.raw[0] : null;
      const cellText = typeof rawCell0 === 'object' && rawCell0 !== null ? ((rawCell0 as any).content || '') : String(rawCell0 || '');
      if (hookData.section === 'body' && String(cellText).startsWith('   - ')) {
        hookData.cell.styles.fillColor = [248, 250, 252];
      }
      // Style de la ligne TOTAL GÉNÉRAL
      if (hookData.section === 'body' && hookData.row.index === detailRows.length - 1) {
        hookData.cell.styles.fontStyle = 'bold';
        hookData.cell.styles.fillColor = [254, 242, 242];
      }
    }
  });

  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.setDrawColor(226, 232, 240);
    doc.line(12, pageHeight - 12, pageWidth - 12, pageHeight - 12);
    doc.text(config.textePiedDePage || `Document Confidentiel de Recouvrement • ${config.etablissement}`, 12, pageHeight - 7);
    doc.text(`Page ${i} sur ${pageCount}`, pageWidth - 12, pageHeight - 7, { align: 'right' });
  }

  const MOIS_FR_UPPER = [
    'JANVIER', 'FEVRIER', 'MARS', 'AVRIL', 'MAI', 'JUIN',
    'JUILLET', 'AOUT', 'SEPTEMBRE', 'OCTOBRE', 'NOVEMBRE', 'DECEMBRE'
  ];

  const uniqueMonths = Array.from(new Set(
    prestations
      .map(p => {
        if (!p.date) return null;
        const parts = p.date.split('-');
        if (parts.length >= 2) {
          const mIdx = parseInt(parts[1], 10) - 1;
          if (mIdx >= 0 && mIdx < 12) {
            return MOIS_FR_UPPER[mIdx];
          }
        }
        return null;
      })
      .filter((m): m is string => Boolean(m))
  ));

  const monthPart = uniqueMonths.length > 0
    ? uniqueMonths.join('_')
    : MOIS_FR_UPPER[new Date().getMonth()];

  const cleanSocName = mainSocNom.replace(/[^a-zA-Z0-9]/g, '_');
  const filename = `Recouvrement_${cleanSocName}_${monthPart}_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(filename);
}
