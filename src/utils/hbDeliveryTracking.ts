import type { Article, HbLine, HbRecord, PharmaDeliveryItem, StockMovement, User } from '../types';
import type { AppState } from '../store';
import { v4 as uuidv4 } from 'uuid';
import { familyManagesStock } from '../store';

/** Vérifie si un article / ligne correspond à un médicament GÉRÉ EN STOCK en pharmacie. */
export function isHbLineMedication(line: HbLine, articles: Article[] = [], familles: any[] = []): boolean {
  const art = articles.find((a: Article) => a.name.toLowerCase() === line.articleName.toLowerCase() || a.id === line.id);
  if (art) {
    // Si l'article existe en base, il DOIT être géré en stock (famille avec gestion de stock active)
    return familyManagesStock(art.family, familles);
  }
  // Si l'article n'est pas dans le catalogue d'articles gérés en stock, pas de suivi ni de notification stock
  return false;
}

/** Statistiques de délivrance des médicaments pour un dossier Hospit / Bloc. */
export interface HbMedicationStats {
  totalLines: number;
  totalQty: number;
  deliveredQty: number;
  pendingQty: number;
  hasMeds: boolean;
  isAllDelivered: boolean;
  medLines: HbLine[];
}

export function getHbMedicationStats(lines: HbLine[] = [], articles: Article[] = [], familles: any[] = []): HbMedicationStats {
  const medLines = lines.filter((l: HbLine) => isHbLineMedication(l, articles, familles));
  const totalLines = medLines.length;
  const totalQty = medLines.reduce((s: number, l: HbLine) => s + (Number(l.quantity) || 1), 0);
  const deliveredQty = medLines.filter((l: HbLine) => l.delivered).reduce((s: number, l: HbLine) => s + (Number(l.quantity) || 1), 0);
  const pendingQty = Math.max(0, totalQty - deliveredQty);
  const hasMeds = totalLines > 0;
  const isAllDelivered = hasMeds && pendingQty === 0;

  return {
    totalLines,
    totalQty,
    deliveredQty,
    pendingQty,
    hasMeds,
    isAllDelivered,
    medLines,
  };
}

export interface HbServiceAddition {
  service: string;
  count: number;
  author?: string;
  lastDate?: string;
  articles: string[];
}

export interface HbServiceNotificationSummary {
  services: HbServiceAddition[];
  totalActs: number;
  hasAdditions: boolean;
}

/** Récapitule les données ajoutées par les différents services sur le dossier. */
export function getHbRecordServiceAdditions(record: HbRecord): HbServiceNotificationSummary {
  const serviceMap: Record<string, { count: number; articles: string[]; author?: string; lastDate?: string }> = {};

  (record.lines || []).forEach((l: HbLine) => {
    let s = l.addedByService;
    if (!s) {
      if (l.articleName.startsWith('🔬')) s = 'Laboratoire';
      else if (l.articleName.startsWith('📡')) s = 'Échographie';
      else if (l.category === 'pharmacy') s = 'Pharmacie';
      else if (l.consultationId) s = 'Médecin';
      else if (record.type === 'bloc') s = 'Bloc Opératoire';
      else s = 'Hospitalisation';
    }

    if (!serviceMap[s]) {
      serviceMap[s] = { count: 0, articles: [], author: l.addedByName, lastDate: l.addedAt || l.dateSort };
    }
    const q = Number(l.quantity) || 1;
    serviceMap[s].count += q;
    if (!serviceMap[s].articles.includes(l.articleName)) {
      serviceMap[s].articles.push(l.articleName);
    }
    if (l.addedByName && !serviceMap[s].author) {
      serviceMap[s].author = l.addedByName;
    }
  });

  const services: HbServiceAddition[] = Object.entries(serviceMap).map(([service, info]) => ({
    service,
    count: info.count,
    author: info.author,
    lastDate: info.lastDate,
    articles: info.articles,
  }));

  const totalActs = services.reduce((s, x) => s + x.count, 0);
  const hasAdditions = services.length > 0;

  return { services, totalActs, hasAdditions };
}

/**
 * Bascule l'état de délivrance d'une ligne de médicament (délivré / non délivré),
 * avec décrémentation / restauration immédiate du stock pharmacie et traçabilité complète.
 */
export function toggleHbLineDelivery(
  state: AppState,
  recordId: string,
  lineId: string,
  currentUser?: User | null,
): { nextState: AppState; success: boolean; message?: string } {
  const records = state.hbRecords || [];
  const recIndex = records.findIndex((r: HbRecord) => r.id === recordId);
  if (recIndex === -1) return { nextState: state, success: false, message: 'Dossier introuvable.' };

  const record = records[recIndex];
  const lineIndex = record.lines.findIndex((l: HbLine) => l.id === lineId);
  if (lineIndex === -1) return { nextState: state, success: false, message: 'Ligne introuvable.' };

  const line = record.lines[lineIndex];
  const isDeliveredNow = !line.delivered;
  const qty = Number(line.quantity) || 1;

  const art = state.articles.find(
    (a: Article) => a.name.toLowerCase() === line.articleName.toLowerCase() || a.id === line.id,
  );
  const managesStock = art && familyManagesStock(art.family, state.familles);

  if (isDeliveredNow && art && managesStock && art.stockPharmacie < qty) {
    return {
      nextState: state,
      success: false,
      message: `Stock insuffisant pour « ${art.name} » : ${art.stockPharmacie} disponible(s), ${qty} demandée(s).`,
    };
  }

  const now = new Date().toISOString();
  const userName = currentUser?.name || (currentUser?.role === 'pharmacy' ? 'Pharmacie' : 'Soins / Caisse');
  const userId = currentUser?.id || 'SYSTEM';

  const updatedLine: HbLine = {
    ...line,
    delivered: isDeliveredNow,
    deliveredAt: isDeliveredNow ? now : undefined,
    deliveredBy: isDeliveredNow ? userName : undefined,
    deliveredByUserId: isDeliveredNow ? userId : undefined,
  };

  const updatedLines = [...record.lines];
  updatedLines[lineIndex] = updatedLine;

  const updatedRecord: HbRecord = {
    ...record,
    lines: updatedLines,
  };

  const updatedHbRecords = [...records];
  updatedHbRecords[recIndex] = updatedRecord;

  let updatedArticles = state.articles;
  const newStockMovements: StockMovement[] = [...(state.stockMovements || [])];
  let newPharmaDeliveries: PharmaDeliveryItem[] = [...(state.pharmaDeliveryItems || [])];

  if (art && managesStock) {
    const stockChange = isDeliveredNow ? -qty : qty;
    updatedArticles = state.articles.map((a: Article) => {
      if (a.id === art.id) {
        return {
          ...a,
          stockPharmacie: Math.max(0, (a.stockPharmacie || 0) + stockChange),
        };
      }
      return a;
    });

    if (isDeliveredNow) {
      newStockMovements.push({
        id: uuidv4(),
        type: 'exit',
        articleId: art.id,
        articleName: art.name,
        quantity: qty,
        fromLocation: 'pharmacie',
        toLocation: record.type === 'hospit' ? 'hospitalisation' : 'bloc',
        reason: `Délivrance médicament ${record.type === 'hospit' ? 'hospit' : 'bloc'} — ${record.patientName}`,
        ref: record.numeroFacture || record.id,
        date: now,
        userId,
        userName,
      });

      newPharmaDeliveries.push({
        id: uuidv4(),
        consultationId: line.consultationId || record.id,
        patientId: record.patientId,
        patientName: record.patientName,
        doctorName: line.addedByName,
        articleId: art.id,
        articleName: art.name,
        quantity: qty,
        unitPrice: line.unitPrice || 0,
        deliveredAt: now,
        deliveredByUserId: userId,
        deliveredByName: userName,
        isExternal: false,
      });
    } else {
      newStockMovements.push({
        id: uuidv4(),
        type: 'entry',
        articleId: art.id,
        articleName: art.name,
        quantity: qty,
        fromLocation: record.type === 'hospit' ? 'hospitalisation' : 'bloc',
        toLocation: 'pharmacie',
        reason: `Retour / annulation livraison ${record.type === 'hospit' ? 'hospit' : 'bloc'} — ${record.patientName}`,
        ref: record.numeroFacture || record.id,
        date: now,
        userId,
        userName,
      });

      newPharmaDeliveries = newPharmaDeliveries.filter(
        (p: PharmaDeliveryItem) => !(p.patientName === record.patientName && p.articleName === art.name && !p.closingId),
      );
    }
  }

  const nextState: AppState = {
    ...state,
    hbRecords: updatedHbRecords,
    articles: updatedArticles,
    stockMovements: newStockMovements,
    pharmaDeliveryItems: newPharmaDeliveries,
  };

  return {
    nextState,
    success: true,
    message: isDeliveredNow
      ? `✅ « ${line.articleName} » (×${qty}) marqué comme LIVRÉ (stock pharmacie déduit).`
      : `↩ Délivrance de « ${line.articleName} » annulée (stock pharmacie réintégré).`,
  };
}

/** Délivre TOUS les médicaments en attente d'un dossier en une seule opération. */
export function deliverAllHbRecordMedications(
  state: AppState,
  recordId: string,
  currentUser?: User | null,
): { nextState: AppState; count: number; message: string } {
  const records = state.hbRecords || [];
  const recIndex = records.findIndex((r: HbRecord) => r.id === recordId);
  if (recIndex === -1) return { nextState: state, count: 0, message: 'Dossier introuvable.' };

  const record = records[recIndex];
  const now = new Date().toISOString();
  const userName = currentUser?.name || (currentUser?.role === 'pharmacy' ? 'Pharmacie' : 'Soins / Caisse');
  const userId = currentUser?.id || 'SYSTEM';

  let count = 0;
  const updatedLines: HbLine[] = [];
  const stockDeltas: Record<string, number> = {};
  const newStockMovements: StockMovement[] = [...(state.stockMovements || [])];
  const newPharmaDeliveries: PharmaDeliveryItem[] = [...(state.pharmaDeliveryItems || [])];

  for (const line of record.lines) {
    if (!line.delivered && isHbLineMedication(line, state.articles, state.familles)) {
      count++;
      const qty = Number(line.quantity) || 1;
      updatedLines.push({
        ...line,
        delivered: true,
        deliveredAt: now,
        deliveredBy: userName,
        deliveredByUserId: userId,
      });

      const art = state.articles.find(
        (a: Article) => a.name.toLowerCase() === line.articleName.toLowerCase() || a.id === line.id,
      );
      if (art && familyManagesStock(art.family, state.familles)) {
        stockDeltas[art.id] = (stockDeltas[art.id] || 0) + qty;

        newStockMovements.push({
          id: uuidv4(),
          type: 'exit',
          articleId: art.id,
          articleName: art.name,
          quantity: qty,
          fromLocation: 'pharmacie',
          toLocation: record.type === 'hospit' ? 'hospitalisation' : 'bloc',
          reason: `Délivrance globale ${record.type === 'hospit' ? 'hospit' : 'bloc'} — ${record.patientName}`,
          ref: record.numeroFacture || record.id,
          date: now,
          userId,
          userName,
        });

        newPharmaDeliveries.push({
          id: uuidv4(),
          consultationId: line.consultationId || record.id,
          patientId: record.patientId,
          patientName: record.patientName,
          doctorName: line.addedByName,
          articleId: art.id,
          articleName: art.name,
          quantity: qty,
          unitPrice: line.unitPrice || 0,
          deliveredAt: now,
          deliveredByUserId: userId,
          deliveredByName: userName,
          isExternal: false,
        });
      }
    } else {
      updatedLines.push(line);
    }
  }

  if (count === 0) {
    return { nextState: state, count: 0, message: 'Aucun médicament en attente de livraison.' };
  }

  const updatedArticles = state.articles.map((a: Article) => {
    if (stockDeltas[a.id]) {
      return {
        ...a,
        stockPharmacie: Math.max(0, (a.stockPharmacie || 0) - stockDeltas[a.id]),
      };
    }
    return a;
  });

  const updatedHbRecords = [...records];
  updatedHbRecords[recIndex] = {
    ...record,
    lines: updatedLines,
  };

  const nextState: AppState = {
    ...state,
    hbRecords: updatedHbRecords,
    articles: updatedArticles,
    stockMovements: newStockMovements,
    pharmaDeliveryItems: newPharmaDeliveries,
  };

  return {
    nextState,
    count,
    message: `✅ ${count} médicament(s) délivré(s) avec succès pour ${record.patientName} (stock pharmacie déduit).`,
  };
}
