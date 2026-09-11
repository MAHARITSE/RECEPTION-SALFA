import type { Prestation, Paiement } from '../types';

/** Recalculate balances only from payments belonging to the same guarantor. */
export function reconcilePrestationsWithPaiements(rawPrestations: Prestation[], currentPaiements: Paiement[]): Prestation[] {
    return (rawPrestations || []).map(p => {
      const matchingLinesWithPayment: { lp: any; pm: Paiement }[] = [];
      const matchingBordereaux = new Set<string>();
      let latestDate = '';

      (currentPaiements || []).forEach(pm => {
        if (pm.societeId !== p.societeId) return;
        (pm.lignes || []).forEach(lp => {
          const matchByPrestId = Boolean(lp.prestationId && lp.prestationId === p.id);
          const matchByFacture = Boolean(
            lp.prestationNumero &&
            p.numeroFacture &&
            lp.prestationNumero.trim().toLowerCase() === p.numeroFacture.trim().toLowerCase()
          );
          const matchByLigneId = Boolean(
            lp.lignePrestationId && p.lignes?.some(l => l.id === lp.lignePrestationId)
          );

          // An explicit FK takes precedence over a duplicate invoice number.
          if (lp.prestationId ? matchByPrestId : (matchByFacture || matchByLigneId)) {
            matchingLinesWithPayment.push({ lp, pm });
            if (pm.numeroBordereau) {
              matchingBordereaux.add(pm.numeroBordereau);
            }
            if (pm.datePaiement && (!latestDate || pm.datePaiement > latestDate)) {
              latestDate = pm.datePaiement;
            }
          }
        });
      });

      const hasLignes = p.lignes && p.lignes.length > 0;
      let pTotalPaye = 0;
      let pTotalExclu = 0;

      const updatedLignes = (p.lignes || []).map(l => {
        let lTotalPaye = 0;
        let lTotalExclu = 0;

        matchingLinesWithPayment.forEach(({ lp }) => {
          const matchThisLine = (lp.lignePrestationId && lp.lignePrestationId === l.id) ||
            (!lp.lignePrestationId && p.lignes?.length === 1);

          if (matchThisLine) {
            const net = Number(lp.totalPaye ?? lp.montantPaye ?? 0);
            const exclu = Number(lp.montantExclu || 0);
            lTotalPaye += net;
            lTotalExclu += exclu;
          }
        });

        const lTot = (l as any).montantTotal ?? l.totalPrestation ?? 0;
        const lMod = l.ticketModerateur ?? 0;
        const lRemb = l.montantARembourser ?? Math.max(0, lTot - lMod);
        const lReste = Math.max(0, lRemb - lTotalPaye - lTotalExclu);
        const isLPaid = (lTotalPaye >= lRemb && lRemb > 0) || (lReste <= 0 && lTotalPaye > 0);
        const isLPart = lTotalPaye > 0 && !isLPaid && lReste > 0;
        const isLExcluded = lTotalExclu >= lRemb && lRemb > 0 && lTotalPaye === 0;
        // Acte bloqué par une exclusion de la société (assuré ou famille d'articles) :
        // il n'y a rien à recouvrer, il est affiché comme rejeté / exclu.
        const isLBlocked = Boolean((l as any).excluParSociete) && lTotalPaye === 0;

        const lStatut = (isLExcluded || isLBlocked) ? 'Rejeté' : isLPaid ? 'Payé' : isLPart ? 'Partiellement payé' : 'En attente';

        pTotalPaye += lTotalPaye;
        pTotalExclu += lTotalExclu;

        return {
          ...l,
          totalPaye: lTotalPaye,
          montantExclu: lTotalExclu,
          resteAPayer: lReste,
          statut: lStatut as any,
        };
      });

      // A historical invoice payment need not identify an individual act.
      // Count it once at invoice level without inventing an act allocation.
      pTotalPaye = matchingLinesWithPayment.reduce((sum, { lp }) => sum + Number(lp.totalPaye ?? lp.montantPaye ?? 0), 0);
      pTotalExclu = matchingLinesWithPayment.reduce((sum, { lp }) => sum + Number(lp.montantExclu || 0), 0);

      const lignesBloquees = (p.lignes || []).filter(l => Boolean((l as any).excluParSociete)).length;
      const toutBloque = hasLignes && lignesBloquees === (p.lignes?.length || 0);

      const tot = p.montantTotal ?? p.totalPrestation ?? 0;
      const mod = p.ticketModerateur ?? p.participation ?? 0;
      const remb = p.montantARembourser ?? Math.max(0, tot - mod);
      const totalPaye = pTotalPaye;
      const totalExclu = pTotalExclu;
      const resteAPayer = Math.max(0, remb - totalPaye - totalExclu);

      const isFullyPaid = (totalPaye >= remb && remb > 0) || (resteAPayer <= 0 && totalPaye > 0);
      const isPartiallyPaid = totalPaye > 0 && !isFullyPaid && resteAPayer > 0;
      const isExcluded = (totalExclu >= remb && remb > 0 && totalPaye === 0) || (toutBloque && totalPaye === 0);

      const newNumeroBordereau = Array.from(matchingBordereaux).join(', ');

      return {
        ...p,
        totalPaye,
        montantExclu: totalExclu,
        resteAPayer,
        lignes: hasLignes ? updatedLignes : p.lignes,
        statut: isExcluded ? 'Rejeté' : isFullyPaid ? 'Payé' : isPartiallyPaid ? 'Partiellement payé' : 'En attente',
        datePaiement: latestDate || undefined,
        numeroBordereau: newNumeroBordereau || undefined,
      };
    });
}
