import type { PatientJourneyEvent, JourneyDepartment } from '../types';
import {
  UserPlus, Stethoscope, FlaskConical, Pill, CreditCard,
  Building2, Heart, ScanLine, Shield,
} from 'lucide-react';

const DEPT_META: Record<JourneyDepartment, { label: string; icon: any; ring: string }> = {
  reception: { label: 'Réception', icon: UserPlus, ring: 'bg-blue-100 dark:bg-cyan-500/15 text-blue-700 dark:text-cyan-400 border-blue-200 dark:border-cyan-500/25' },
  consultation: { label: 'Consultation', icon: Stethoscope, ring: 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/25' },
  laboratoire: { label: 'Laboratoire', icon: FlaskConical, ring: 'bg-cyan-100 dark:bg-cyan-500/15 text-cyan-700 dark:text-cyan-400 border-cyan-200 dark:border-cyan-500/25' },
  pharmacie: { label: 'Pharmacie', icon: Pill, ring: 'bg-purple-100 dark:bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-500/25' },
  caisse: { label: 'Caisse', icon: CreditCard, ring: 'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/25' },
  hospitalisation: { label: 'Hospitalisation', icon: Building2, ring: 'bg-rose-100 dark:bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-500/25' },
  bloc: { label: 'Bloc', icon: Heart, ring: 'bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-400 border-red-200 dark:border-red-500/25' },
  imagerie: { label: 'Imagerie', icon: ScanLine, ring: 'bg-indigo-100 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-500/25' },
  administration: { label: 'Administration', icon: Shield, ring: 'bg-surface-hover text-ink border-line' },
};

export default function PatientJourney({ events }: { events: PatientJourneyEvent[] }) {
  const sorted = [...events].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  if (sorted.length === 0) {
    return (
      <div className="text-sm text-ink-faint italic p-4 text-center">
        Aucun événement de parcours enregistré pour ce patient.
      </div>
    );
  }

  return (
    <ol className="relative border-l-2 border-line ml-3 space-y-4 pb-2">
      {sorted.map((ev) => {


        const meta = DEPT_META[ev.department];
        const Icon = meta.icon;
        return (
          <li key={ev.id} className="ml-4">
            <span className={`absolute -left-[13px] flex items-center justify-center w-6 h-6 rounded-full border ${meta.ring}`}>
              <Icon className="w-3.5 h-3.5" />
            </span>
            <div className="bg-surface border border-line rounded-lg p-3 shadow-sm hover:shadow transition">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="font-semibold text-ink-strong text-sm flex items-center gap-2">{ev.action}</div>
                {ev.status && (
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${meta.ring}`}>{ev.status}</span>
                )}
              </div>
              <div className="text-xs text-ink-muted mt-0.5 flex items-center gap-2 flex-wrap">
                <span className={`px-1.5 py-0.5 rounded font-medium ${meta.ring}`}>{meta.label}</span>
                <span>
                  {new Date(ev.timestamp).toLocaleString('fr-FR', {
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                {ev.actorName && <span>· {ev.actorName}</span>}
              </div>
              {ev.details && <p className="text-xs text-ink-secondary mt-1">{ev.details}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
