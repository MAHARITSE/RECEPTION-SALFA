import type { AppState } from '../../store';
import { billingFamilyResolver } from './billingFamilies';
import { collectBillingDocuments, type MonthlyInvoice, type BillingItem } from './monthlyBilling';

/** Complete only missing family metadata. No re-billing, no new source lines,
 * no changes to existing family assignments, amounts, dates, identities or numbering. */
export function planMonthlyFamilyRepair(state: AppState, invoice: MonthlyInvoice) {
  const current = collectBillingDocuments(state);
  const resolve = billingFamilyResolver(state);
  const entries: { documentId: string; itemIndex: number; family: string }[] = [];
  const unresolved: { documentId: string; itemIndex: number; description: string }[] = [];
  const sameLine = (a: BillingItem, b: BillingItem) => a.description === b.description && a.amount === b.amount
    && (a.quantity == null || a.quantity === b.quantity) && (a.unitPrice == null || a.unitPrice === b.unitPrice);
  for (const document of invoice.documents) {
    const live = current.find(d => d.id === document.id && d.sourceId === document.sourceId);
    document.items.forEach((item, itemIndex) => {
      if (item.actCode?.trim()) return;
      // Match an original piece, not its array position after a possible edit.
      const matches = live?.items.filter(candidate => sameLine(item, candidate)) || [];
      const families = new Set(matches.map(i => i.actCode).filter((code): code is string => !!code?.trim()));
      const family = matches.length && families.size === 1 && matches.every(i => i.actCode?.trim())
        ? [...families][0] : !matches.length ? resolve({ articleName: item.description }) : undefined;
      if (family) entries.push({ documentId: document.id, itemIndex, family });
      else unresolved.push({ documentId: document.id, itemIndex, description: item.description });
    });
  }
  return { entries, unresolved };
}

export function applyMonthlyFamilyRepair(state: AppState, invoice: MonthlyInvoice, now = new Date().toISOString()): MonthlyInvoice {
  if (!state.currentUser || !['admin', 'billing'].includes(state.currentUser.role)) throw new Error('Connexion facturation requise.');
  const plan = planMonthlyFamilyRepair(state, invoice);
  if (!plan.entries.length) throw new Error('Aucune famille ne peut être rétablie avec certitude. Corrigez les articles ou les pièces d’origine.');
  return completeFamilies(invoice, plan.entries, now, state.currentUser.id);
}

function completeFamilies(invoice: MonthlyInvoice, entries: { documentId: string; itemIndex: number; family: string }[], now: string, userId: string): MonthlyInvoice {
  return { ...invoice,
    documents: invoice.documents.map(d => ({ ...d, items: d.items.map((item, index) => {
      const entry = entries.find(e => e.documentId === d.id && e.itemIndex === index);
      return entry ? { ...item, actCode: entry.family } : item;
    }) })),
    familyMetadataRepairs: [...(invoice.familyMetadataRepairs || []), { date: now, userId, entries }],
  };
}


/** Automatic, idempotent reorganization authorized by the user. Runs inside the
 * shared database transaction, not just in the print renderer. Unambiguous family
 * references and absent display metadata only; never reset or recreate records. */
export function reorganizeFamilyMetadata(state: AppState, now = new Date().toISOString()): AppState {
  const resolve = billingFamilyResolver(state);
  let changed = false;
  const articles = state.articles.map(article => {
    const family = resolve({ articleId: article.id });
    if (!family || family === article.family) return article;
    changed = true;
    return { ...article, family };
  });
  const source = changed ? { ...state, articles } : state;
  const monthlyInvoices = state.monthlyInvoices?.map(invoice => {
    if (!invoice.documents.some(d => d.items.some(i => !i.actCode?.trim()))) return invoice;
    const plan = planMonthlyFamilyRepair(source, invoice);
    if (!plan.entries.length) return invoice;
    changed = true;
    return completeFamilies(invoice, plan.entries, now, 'migration:families-v1');
  });
  return changed ? { ...source, monthlyInvoices } : state;
}
