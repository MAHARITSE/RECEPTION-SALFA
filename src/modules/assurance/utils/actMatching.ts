import { Famille } from '../types';

/**
 * Intelligent Act Matching Helper
 * Matches raw act code or text from insurance invoices/statements (MCI, ASCOMA, BSA, AXA, etc.)
 * to an existing Famille / Acte in the database using exact codes, aliases, and keyword matching.
 */
export function findFamilleForAct(
  rawCode: string | undefined | null,
  rawLibelle: string | undefined | null,
  familles: Famille[]
): Famille | undefined {
  if (!familles || familles.length === 0) return undefined;

  const cleanCode = (rawCode || '').trim().toUpperCase();
  const cleanLibelle = (rawLibelle || '').trim().toUpperCase();

  // 1. Direct code exact match (e.g. 'PHAR' === 'PHAR', 'CONS' === 'CONS')
  const exactCode = familles.find(f => f.code.toUpperCase() === cleanCode);
  if (exactCode) return exactCode;

  // 2. Direct alias exact match (e.g. 'PH', 'PHSB', 'CG', 'DC', 'DK', 'EB', 'SI')
  if (cleanCode) {
    const aliasExact = familles.find(f => 
      f.aliases && f.aliases.some(a => a.trim().toUpperCase() === cleanCode)
    );
    if (aliasExact) return aliasExact;
  }

  // 3. Libelle exact or prefix match with family libelle or code
  if (cleanLibelle) {
    const libExact = familles.find(f => 
      f.libelle.toUpperCase() === cleanLibelle || 
      cleanLibelle.startsWith(f.code.toUpperCase()) ||
      cleanLibelle.startsWith(f.libelle.toUpperCase())
    );
    if (libExact) return libExact;

    // 4. Check if any alias is contained inside the raw libelle or vice versa
    const aliasInLib = familles.find(f => 
      f.aliases && f.aliases.some(a => {
        const cleanA = a.trim().toUpperCase();
        if (cleanA.length < 2) return false;
        // Word boundary check or substring
        return cleanLibelle.includes(cleanA) || cleanA.includes(cleanLibelle);
      })
    );
    if (aliasInLib) return aliasInLib;
  }

  // 5. Check if rawCode is contained in libelle or vice-versa
  if (cleanCode && cleanCode.length >= 2) {
    const codeInLib = familles.find(f => f.libelle.toUpperCase().includes(cleanCode));
    if (codeInLib) return codeInLib;
  }

  // 6. Common domain-specific heuristics as smart fallback
  if (cleanCode === 'CG' || cleanCode === 'CONS' || cleanLibelle.includes('CONSULT') || cleanLibelle.includes('VISITE')) {
    const cons = familles.find(f => f.code.toUpperCase() === 'CONS');
    if (cons) return cons;
  }
  if (cleanCode === 'PH' || cleanCode === 'PHSB' || cleanCode === 'MEDIC' || cleanLibelle.includes('PHARMACIE') || cleanLibelle.includes('MEDICAMENT')) {
    const phar = familles.find(f => f.code.toUpperCase() === 'PHAR');
    if (phar) return phar;
  }
  if (cleanCode === 'DC' || cleanCode === 'DK' || cleanLibelle.includes('DENT') || cleanLibelle.includes('RADICULAIRE')) {
    const dent = familles.find(f => f.code.toUpperCase() === 'DENT');
    if (dent) return dent;
  }
  if (cleanCode === 'EB' || cleanCode === 'LABO' || cleanLibelle.includes('LABORATOIRE') || cleanLibelle.includes('BIOLOG') || cleanLibelle.includes('TDR')) {
    const labo = familles.find(f => f.code.toUpperCase() === 'LABO');
    if (labo) return labo;
  }
  if (cleanCode === 'SI' || cleanCode === 'SOINS' || cleanLibelle.includes('SOIN') || cleanLibelle.includes('PANSEMENT') || cleanLibelle.includes('INJECTION')) {
    const soins = familles.find(f => f.code.toUpperCase() === 'SOINS');
    if (soins) return soins;
  }
  if (cleanCode === 'ECHO' || cleanLibelle.includes('ECHO')) {
    const echo = familles.find(f => f.code.toUpperCase() === 'ECHO' || f.code.toUpperCase() === 'RADI');
    if (echo) return echo;
  }
  if (cleanCode === 'HOSP' || cleanLibelle.includes('HOSPITAL') || cleanLibelle.includes('CHIRURG')) {
    const hosp = familles.find(f => f.code.toUpperCase() === 'HOSP');
    if (hosp) return hosp;
  }

  return undefined;
}
