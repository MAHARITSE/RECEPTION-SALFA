import { linkSharedReferences } from './linkReferences';
import type { AppState } from '../../store';
import { initialFamilles as assuranceActes } from './data/initialData';

/** Non-destructive upgrade of backups created before the assurance module. */
export function ensureAssuranceCollections(state: AppState): AppState {
  return linkSharedReferences({ ...state,
    monthlyInvoices: state.monthlyInvoices ?? [],
    assuranceSocietes: state.assuranceSocietes ?? [],
    assurancePersonnes: state.assurancePersonnes ?? [],
    assuranceFamilles: state.assuranceFamilles ?? structuredClone(assuranceActes),
    assurancePrestations: state.assurancePrestations ?? [],
    assurancePaiements: state.assurancePaiements ?? [],
  });
}

