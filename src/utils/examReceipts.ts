import type { Consultation, EchoRequest, Invoice, InvoiceItem, LabRequest } from '../types';

/** Données d'affichage uniquement : ce n'est pas une nouvelle demande médicale. */
export interface ExamTicketLine {
  examType: string;
  urgent: boolean;
  quantity?: number;
  price?: number;
  notes?: string;
}

export interface ExamReceipts {
  labLines: ExamTicketLine[];
  echoLines: ExamTicketLine[];
  pendingLabIds: Set<string>;
  pendingEchoIds: Set<string>;
  prescriberId?: string;
}

const URGENT_MARKER = /\s*(?:\[URGENT\]|\(URGENT\))/gi;
// « x » doit être séparé du nom : ne pas tronquer un examen tel que « Latex 2 ».
const QUANTITY_SUFFIX = /(?:\s*×|\s+x)\s*(\d+(?:[.,]\d+)?)\s*$/i;

function examName(description: unknown): string {
  return String(description ?? '').replace(URGENT_MARKER, '').replace(QUANTITY_SUFFIX, '').trim();
}

function normalized(value: unknown): string {
  return examName(value).replace(/&amp;/gi, '&').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr').replace(/\s+/g, ' ').trim();
}

function quantity(item: InvoiceItem): number {
  const suffix = String(item.description ?? '').replace(URGENT_MARKER, '').match(QUANTITY_SUFFIX)?.[1];
  const value = Number(item.quantity ?? suffix?.replace(',', '.') ?? 1);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

type Request = LabRequest | EchoRequest;

function mergeCopies<T extends Request>(copies: readonly T[]): T[] {
  const byId = new Map<string, T>();
  for (const request of copies) {
    const previous = byId.get(request.id);
    byId.set(request.id, { ...previous, ...request,
      // Une copie de consultation legacy ne doit pas effacer le lien explicite
      // conservé dans la table globale (ni le prescripteur lorsqu'il manque).
      invoiceId: request.invoiceId || previous?.invoiceId,
      consultationId: request.consultationId || previous?.consultationId,
      patientId: request.patientId || previous?.patientId,
      requestedBy: request.requestedBy || previous?.requestedBy,
    });
  }
  return [...byId.values()];
}

function belongsToInvoice(request: Request, invoice: Invoice): boolean {
  if (request.patientId && request.patientId !== invoice.patientId) return false;
  // Un lien explicite vers une autre facture ne doit jamais être ignoré.
  if (request.invoiceId) return request.invoiceId === invoice.id;
  // Les anciennes demandes ne renseignent parfois que la consultation.
  return !!invoice.consultationId && request.consultationId === invoice.consultationId;
}

function matchesItem(request: Request, item: InvoiceItem): boolean {
  return (!!item.code && 'code' in request && !!request.code && normalized(item.code) === normalized(request.code)) ||
    normalized(request.examType) === normalized(item.description);
}

/**
 * Les lignes facturées font foi pour l'impression, pas le statut médical de la
 * demande. Un examen déjà réalisé ou dépourvu de lien legacy doit encore donner
 * lieu à un bon / duplicata. Les métadonnées (urgence, notes) sont récupérées
 * seulement sur les demandes du même examen et de la même facture/consultation.
 * Aucune demande, facture, tarification ou donnée clinique n'est créée ici.
 */
export function getExamReceipts(
  invoices: readonly Invoice[],
  consultations: readonly Consultation[],
  standaloneLabs: readonly LabRequest[],
): ExamReceipts {
  const labCopies: LabRequest[] = [...standaloneLabs];
  const echoCopies: EchoRequest[] = [];
  for (const consultation of consultations) {
    const context = {
      patientId: consultation.patientId || undefined,
      consultationId: consultation.id,
      requestedBy: consultation.doctorId,
    };
    for (const request of consultation.labRequests || []) {
      labCopies.push({ ...request,
        patientId: request.patientId || context.patientId,
        consultationId: request.consultationId || context.consultationId,
        requestedBy: request.requestedBy || context.requestedBy,
      });
    }
    for (const request of consultation.echoRequests || []) {
      echoCopies.push({ ...request,
        patientId: request.patientId || context.patientId,
        consultationId: request.consultationId || context.consultationId,
        requestedBy: request.requestedBy || context.requestedBy,
      });
    }
  }
  // La copie de consultation fait foi pour les notes ; pas de bon en double si
  // la demande figure également dans state.labRequests.
  const labs = mergeCopies(labCopies);
  const echoes = mergeCopies(echoCopies);
  const result: ExamReceipts = {
    labLines: [], echoLines: [], pendingLabIds: new Set(), pendingEchoIds: new Set(),
  };

  for (const invoice of new Map(invoices.map((inv) => [inv.id, inv])).values()) {
    for (const item of invoice.items) {
      if (item.category !== 'lab' && item.category !== 'echo') continue;
      const source = item.category === 'lab' ? labs : echoes;
      const matches = source.filter((request) => belongsToInvoice(request, invoice) && matchesItem(request, item));
      const qty = quantity(item);
      const notes = [...new Set(matches.flatMap((request) => 'notes' in request && request.notes ? [request.notes] : []))];
      const line: ExamTicketLine = {
        examType: matches[0]?.examType || examName(item.description) || 'Examen facturé (désignation manquante)',
        urgent: matches.some((request) => request.urgent) || /\bURGENT\b/i.test(item.description),
        quantity: qty,
        price: item.unitPrice ?? item.amount / qty,
        ...(notes.length ? { notes: notes.join('\n') } : {}),
      };
      (item.category === 'lab' ? result.labLines : result.echoLines).push(line);
      result.prescriberId ||= matches[0]?.requestedBy || consultations.find((c) =>
        c.id === invoice.consultationId && (!invoice.patientId || c.patientId === invoice.patientId),
      )?.doctorId;

      // Seules les VRAIES demandes encore en attente peuvent passer à « payé ».
      // Ne jamais rétrograder un examen en cours / terminé, même si une copie
      // ancienne restée pending existe dans l'autre table.
      const copies = item.category === 'lab' ? labCopies : echoCopies;
      const pendingIds = item.category === 'lab' ? result.pendingLabIds : result.pendingEchoIds;
      for (const request of matches) {
        if (copies.filter((copy) => copy.id === request.id).every((copy) =>
          (!copy.status || copy.status === 'pending') &&
          (!copy.invoiceId || copy.invoiceId === invoice.id) &&
          (!copy.patientId || copy.patientId === invoice.patientId),
        )) {
          pendingIds.add(request.id);
        }
      }
    }
  }
  return result;
}
