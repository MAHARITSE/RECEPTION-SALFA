import { Societe } from '../types';

/**
 * Intelligent and robust society matcher preventing incorrect assignments (e.g. MCI CARE wrongly assigned to BSA)
 */
export function findBestMatchingSociete(
  rawName: string,
  societes: Societe[],
  preferredNameOrId?: string
): Societe | undefined {
  if (!societes || societes.length === 0) return undefined;

  if (!societes || societes.length === 0) return undefined;

  const clean = (rawName || '').toLowerCase().trim();

  // 1. Check if rawName contains explicit keywords for known insurances (BSA, ASCOMA, HAVANA, SANLAM/MCI)
  // This takes priority over default/inferred preferred society to avoid misassigning BSA as ASCOMA.
  if (
    clean.includes('bsa') || 
    clean.includes('ask gs') ||
    clean.includes('ask-gs') ||
    clean.includes('bsa / ask gs') ||
    clean.includes('gras savoye') || 
    clean.includes('gras-savoye') || 
    clean.includes('grassavoye') || 
    clean.includes('ask gras') ||
    clean.includes('ask gras savoye') ||
    clean.includes('releve de remboursements') ||
    clean.includes('relevé de remboursements') ||
    clean.includes('frais de sante') ||
    clean.includes('frais de santé') ||
    clean.includes('bfv') ||
    clean.includes('bred madagasikara') ||
    clean.includes('bred')
  ) {
    const bsa = societes.find(s => 
      s.code.toUpperCase() === 'BSA' || 
      s.nom.toUpperCase().includes('BSA') || 
      s.nom.toUpperCase().includes('GRAS SAVOYE') ||
      s.nom.toUpperCase().includes('ASK')
    );
    if (bsa) return bsa;
  }

  if (
    clean.includes('ascoma') ||
    clean.includes('decompte de reglement tiers payant') ||
    clean.includes('décompte de règlement tiers payant') ||
    clean.includes('dispensaire lutherien') ||
    clean.includes('code : 599') ||
    clean.includes('code 599')
  ) {
    const ascoma = societes.find(s => s.nom.toUpperCase().includes('ASCOMA') || s.code.toUpperCase().includes('ASCOMA'));
    if (ascoma) return ascoma;
  }

  if (
    clean.includes('havana') || 
    clean.includes('ny havana') || 
    clean.includes('ny-havana') ||
    clean.includes('nyhavana')
  ) {
    const havana = societes.find(s => s.nom.toUpperCase().includes('HAVANA') || s.code.toUpperCase().includes('HAVANA'));
    if (havana) return havana;
  }

  if (
    clean.includes('mci') || 
    clean.includes('mcicare') || 
    clean.includes('mci care') || 
    clean.includes('sanlamallianz') ||
    clean.includes('sanlam allianz') ||
    clean.includes('compagnie sanlamallianz') ||
    clean.includes('sanlam') ||
    clean.includes('conservation international') ||
    clean.includes('conservation internationale')
  ) {
    const sanlam = societes.find(s => s.nom.toUpperCase().includes('SANLAM') || s.code.toUpperCase().includes('SANLAM'));
    if (sanlam && (clean.includes('sanlam') || clean.includes('sanlamallianz'))) return sanlam;

    const mci = societes.find(s => s.code.toUpperCase().includes('MCI') || s.nom.toUpperCase().includes('MCI'));
    if (mci) return mci;
  }

  // 2. Exact match on rawName (Name or Code)
  if (clean && clean !== 'organisme' && clean !== 'assurance' && clean !== 'client') {
    const exact = societes.find(s => 
      s.nom.toLowerCase().trim() === clean || 
      s.code.toLowerCase().trim() === clean
    );
    if (exact) return exact;
  }

  // 3. Fallback to user-preferred society (if provided and valid)
  if (preferredNameOrId && preferredNameOrId !== 'AUTO' && preferredNameOrId !== 'ALL' && preferredNameOrId !== 'CUSTOM') {
    const byId = societes.find(s => s.id === preferredNameOrId);
    if (byId) return byId;

    const byName = societes.find(s => s.nom.toLowerCase().trim() === preferredNameOrId.toLowerCase().trim());
    if (byName) return byName;
  }

  // 4. Substring / Word inclusion match (excluding generic terms)
  const partial = societes.find(s => {
    const sNom = s.nom.toLowerCase().trim();
    const sCode = s.code.toLowerCase().trim();
    if (sNom.length < 3 && sCode.length < 3) return false;
    return (
      (sNom.length >= 3 && clean.includes(sNom)) ||
      (sCode.length >= 3 && clean.includes(sCode)) ||
      (clean.length >= 4 && sNom.includes(clean))
    );
  });
  if (partial) return partial;

  return undefined;
}
