import type { AppState } from './store';
import type { Vente } from './types';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  RÉPARATION MONÉTAIRE APRÈS FUSION MULTI-POSTES
 * ─────────────────────────────────────────────────────────────────────────────
 *  Problème : deux caisses encaissant la MÊME vente créent des lignes de
 *  paiement DISTINCTES (préservées par la fusion, une par `id`), mais une
 *  seule version de l'EN-TÊTE survit (« dernier écrivain gagne ») → le total
 *  encaissé (`montantPaye`) et le statut seraient faux sans cette passe.
 *
 *  Règle : les LIGNES de paiement font foi ; les en-têtes sont recalculés —
 *  mais JAMAIS diminués (les données historiques sans lignes détaillées,
 *  ex. factures migrées, sont préservées). Idempotent et sans danger.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Arrondi monétaire local (évite tout cycle d'import avec store.ts). */
const round2 = (n: number): number => Math.round((n || 0) * 100) / 100;

/**
 * Recalcule `montantPaye` / `status` / `paidAt` de chaque vente depuis ses
 * lignes de paiement. Retourne le MÊME objet si rien n'a changé (préserve
 * les références pour les comparaisons rapides).
 */
export function repairVenteHeaders(state: AppState): AppState {
  const payments = state.ventePayments || [];
  if (payments.length === 0 || (state.ventes || []).length === 0) return state;

  const totalByVente = new Map<string, number>();
  const lastDateByVente = new Map<string, string>();
  for (const p of payments) {
    if (!p.venteId) continue;
    totalByVente.set(p.venteId, round2((totalByVente.get(p.venteId) || 0) + (p.amount || 0)));
    const prev = lastDateByVente.get(p.venteId) || '';
    if ((p.date || '') > prev) lastDateByVente.set(p.venteId, p.date);
  }
  if (totalByVente.size === 0) return state;

  let changed = false;
  const ventes = (state.ventes || []).map((v) => {
    const sum = totalByVente.get(v.id);
    // Seule une SOMME SUPÉRIEURE déclenche la réparation (jamais de diminution).
    if (sum === undefined || sum <= (v.montantPaye || 0)) return v;
    changed = true;
    const paid = v.montantFacture > 0 && sum >= v.montantFacture;
    return {
      ...v,
      montantPaye: sum,
      status: (v.status === 'annule' ? 'annule' : paid ? 'paid' : 'partiel') as Vente['status'],
      paidAt: paid ? v.paidAt || lastDateByVente.get(v.id) || v.datePaiement : v.paidAt,
    };
  });
  return changed ? { ...state, ventes } : state;
}
