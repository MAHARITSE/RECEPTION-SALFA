import type { ExclusionSociete, Famille, LignePrestation, Personne, Societe, SocieteModePaiement } from '../types';

/** Retire les accents / espaces superflus pour comparer des libellés d'actes. */
export function normaliseActeTexte(value?: string): string {
  return (value || '')
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

/** Mode de règlement effectif d'une société (paiement partiel / assurance par défaut). */
export function societeModePaiement(societe?: Partial<Societe> | null): SocieteModePaiement {
  return societe?.modePaiement === 'global' ? 'global' : 'partiel';
}

export function societeModeLabel(societe?: Partial<Societe> | null): string {
  return societeModePaiement(societe) === 'global' ? 'Payeur global' : 'Paiement partiel (assurance)';
}

export function societeEstPayeurGlobal(societe?: Partial<Societe> | null): boolean {
  return societeModePaiement(societe) === 'global';
}

/** Exclusions actives (les règles désactivées sont conservées mais ignorées). */
export function exclusionsActives(societe?: Partial<Societe> | null): ExclusionSociete[] {
  return (societe?.exclusions || []).filter(e => e && e.actif !== false);
}

export function resumerExclusions(societe?: Partial<Societe> | null): { total: number; personnes: number; familles: number } {
  const actives = exclusionsActives(societe);
  return {
    total: actives.length,
    personnes: actives.filter(e => e.type === 'personne').length,
    familles: actives.filter(e => e.type === 'famille').length,
  };
}

/** Libellé lisible d'une exclusion (assuré ou famille d'articles). */
export function libelleExclusion(exclusion: ExclusionSociete): string {
  if (exclusion.type === 'personne') {
    return exclusion.nomPrenom?.trim() || exclusion.matricule?.trim() || exclusion.personneId || 'Assuré exclu';
  }
  return exclusion.familleLibelle?.trim() || exclusion.familleCode?.trim() || (exclusion.motsCles || [])[0] || 'Famille exclue';
}

/** Exclusion touchant un assuré donné (identifiant, sinon nom ou matricule). */
export function exclusionPersonne(
  societe: Partial<Societe> | undefined | null,
  personne?: Partial<Personne> | null,
): ExclusionSociete | undefined {
  if (!personne) return undefined;
  const regles = exclusionsActives(societe).filter(e => e.type === 'personne');
  if (!regles.length) return undefined;

  const nom = normaliseActeTexte(personne.nomPrenom);
  const matricule = normaliseActeTexte(personne.matricule);
  return regles.find(r => {
    if (personne.id && r.personneId && r.personneId === personne.id) return true;
    if (matricule && normaliseActeTexte(r.matricule) === matricule) return true;
    if (nom && normaliseActeTexte(r.nomPrenom) === nom) return true;
    return false;
  });
}

/** Exclusion touchant un acte (code famille, libellé catalogue ou mot-clé libre). */
export function exclusionActe(
  societe: Partial<Societe> | undefined | null,
  acte?: { code?: string; libelle?: string; familleCode?: string } | null,
): ExclusionSociete | undefined {
  if (!acte) return undefined;
  const regles = exclusionsActives(societe).filter(e => e.type === 'famille');
  if (!regles.length) return undefined;

  const code = normaliseActeTexte(acte.code || acte.familleCode);
  const libelle = normaliseActeTexte(acte.libelle);
  const champs = [code, libelle].filter(Boolean);

  return regles.find(r => {
    const tokens = [r.familleCode, r.familleLibelle, ...(r.motsCles || [])]
      .map(normaliseActeTexte)
      .filter(Boolean);
    return tokens.some(token => {
      if (!token) return false;
      // Code famille exact (ECHO, LABO, CONS…) ou alias du catalogue.
      if (code && (token === code || code.startsWith(`${token} `))) return true;
      // Mot-clé contenu dans le libellé de l'acte (ex: « ÉCHOGRAPHIE PELVIENNE »).
      if (token.length >= 4 && champs.some(champ => champ.includes(token))) return true;
      return false;
    });
  });
}

export interface RepartitionActe {
  /** Taux effectivement pris en charge par la société (0 = totalement exclu). */
  taux: number;
  montantARembourser: number;
  ticketModerateur: number;
  /** Part bloquée par l'exclusion (au-delà du ticket modérateur contractuel). */
  montantExclu: number;
  exclusion?: ExclusionSociete;
  excluParSociete: boolean;
  motifExclusion?: string;
}

const clampTaux = (taux: number) => Math.max(0, Math.min(100, Number.isFinite(taux) ? taux : 0));

/**
 * Répartition d'un acte pour une société : taux contractuel, exclusions de
 * l'assuré puis exclusions de famille d'articles.
 * Une exclusion bloque la prise en charge : le montant reste dû par le patient
 * (à facturer en client comptoir).
 */
export function repartirActe(
  societe: Societe | undefined | null,
  ligne: Pick<LignePrestation, 'totalPrestation' | 'code' | 'libelle'>,
  personne?: Partial<Personne> | null,
): RepartitionActe {
  const total = Math.max(0, Number(ligne.totalPrestation) || 0);
  const tauxContrat = clampTaux(societe?.tauxCouvertureDefaut ?? (societeEstPayeurGlobal(societe) ? 100 : 80));

  const exclusionAssure = exclusionPersonne(societe, personne);
  const exclusion = exclusionAssure || exclusionActe(societe, ligne);
  const tauxExclusion = exclusion ? clampTaux(exclusion.tauxPriseEnCharge ?? 0) : null;
  const taux = tauxExclusion == null ? tauxContrat : Math.min(tauxContrat, tauxExclusion);

  const montantARembourser = Math.round(total * (taux / 100));
  const ticketModerateur = Math.max(0, total - montantARembourser);
  const montantStandard = Math.round(total * (tauxContrat / 100));
  const montantExclu = exclusion ? Math.max(0, montantStandard - montantARembourser) : 0;

  const motifExclusion = exclusion
    ? `${exclusion.type === 'personne' ? 'Assuré exclu' : 'Acte exclu'} par ${societe?.nom || 'la société'}` +
      `${exclusion.motif ? ` — ${exclusion.motif}` : ''} — à facturer en client comptoir`
    : undefined;

  return {
    taux,
    montantARembourser,
    ticketModerateur,
    montantExclu,
    exclusion,
    excluParSociete: Boolean(exclusion) && taux <= 0,
    motifExclusion,
  };
}

/** Reprend le calcul de `repartirActe` au niveau d'une prestation complète. */
export function repartirPrestation(
  societe: Societe | undefined | null,
  lignes: Pick<LignePrestation, 'totalPrestation' | 'code' | 'libelle'>[] = [],
  personne?: Partial<Personne> | null,
) {
  const repartitions = lignes.map(l => repartirActe(societe, l, personne));
  return {
    lignes: repartitions,
    totalPrestation: lignes.reduce((s, l) => s + (Number(l.totalPrestation) || 0), 0),
    montantARembourser: repartitions.reduce((s, r) => s + r.montantARembourser, 0),
    ticketModerateur: repartitions.reduce((s, r) => s + r.ticketModerateur, 0),
    montantExclu: repartitions.reduce((s, r) => s + r.montantExclu, 0),
    nbActesExclus: repartitions.filter(r => r.excluParSociete).length,
    assureExclu: Boolean(exclusionPersonne(societe, personne)),
  };
}

/** Familles d'articles proposées à l'exclusion, filtrées par une recherche libre. */
export function rechercherFamilles(familles: Famille[] = [], recherche = ''): Famille[] {
  const terme = normaliseActeTexte(recherche);
  if (!terme) return familles;
  const mots = terme.split(' ').filter(Boolean);
  return familles.filter(f => {
    const champs = [f.code, f.libelle, f.description, ...(f.aliases || [])].map(normaliseActeTexte).filter(Boolean);
    return mots.every(mot => champs.some(champ => champ.includes(mot)));
  });
}

/** Assurés d'une société proposés à l'exclusion, filtrés par une recherche libre. */
export function rechercherPersonnes(personnes: Personne[], societeId?: string, recherche = ''): Personne[] {
  const terme = normaliseActeTexte(recherche);
  return personnes
    .filter(p => !societeId || p.societeId === societeId)
    .filter(p => {
      if (!terme) return true;
      const champs = [p.nomPrenom, p.matricule, p.qualite, p.sousSociete].map(normaliseActeTexte).filter(Boolean);
      return champs.some(champ => champ.includes(terme));
    })
    .sort((a, b) => (a.nomPrenom || '').localeCompare(b.nomPrenom || ''));
}
