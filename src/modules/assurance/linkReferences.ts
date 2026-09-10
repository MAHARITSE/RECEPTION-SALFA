import type { AppState } from '../../store';

const key = (s?: string) => (s || '').trim().normalize('NFKC').toUpperCase();

/** Idempotent upgrade of the previous standalone module. No invoice, payment,
 * clinical record or ambiguous identity is deleted or matched by name alone. */
export function linkSharedReferences(state: AppState): AppState {
  const companies = [...state.companies];
  const societyIds = new Map<string, string>();
  let changed = false;
  for (const s of state.assuranceSocietes || []) {
    const common = companies.find(c => c.id === s.id) || companies.find(c => key(c.name) === key(s.nom));
    if (common) {
      societyIds.set(s.id, common.id);
      if (s.id !== common.id || !s.sharedCompany) changed = true;
    } else if (!s.sharedCompany) {
      companies.push({ id: s.id, name: s.nom, paymentMode: 'Crédit', settlementMode: 'per_invoice', type: 'assurance', tauxCouverture: s.tauxCouvertureDefaut });
      societyIds.set(s.id, s.id);
      changed = true;
    }
  }
  const sid = (id: string) => societyIds.get(id) || id;
  const patientIds = new Map<string, string>();
  for (const p of state.assurancePersonnes || []) {
    const company = companies.find(c => c.id === sid(p.societeId));
    const exact = state.patients.find(r => r.id === p.id);
    // A matricule is only unique within its insurer; never merge homonyms.
    const candidates = p.matricule && company ? state.patients.filter(r => key(r.matricule) === key(p.matricule) && key(r.company) === key(company.name)) : [];
    const common = exact || (candidates.length === 1 ? candidates[0] : undefined);
    if (common) {
      patientIds.set(p.id, common.id);
      if (p.id !== common.id || !p.sharedPatient) changed = true;
    }
  }
  if (!changed) return state;
  const pid = (id: string) => patientIds.get(id) || id;
  // Canonical records win on collisions, supplementary fields are retained.
  const dedupe = <T extends { id: string }>(rows: T[]) => Array.from(new Map(rows.map(row => [row.id, row])).values());
  return { ...state, companies,
    assuranceSocietes: dedupe((state.assuranceSocietes || []).map(s => ({ ...s, id: sid(s.id), sharedCompany: true }))),
    assurancePersonnes: dedupe((state.assurancePersonnes || []).map(p => ({ ...p, id: pid(p.id), sharedPatient: patientIds.has(p.id) || p.sharedPatient, societeId: sid(p.societeId) }))),
    assurancePrestations: (state.assurancePrestations || []).map(p => ({ ...p, personneId: pid(p.personneId), societeId: sid(p.societeId) })),
    assurancePaiements: (state.assurancePaiements || []).map(p => ({ ...p, societeId: sid(p.societeId) })),
  };
}
