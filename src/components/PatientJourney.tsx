import type { PatientJourneyEvent, JourneyDepartment } from '../types';
import {
  UserPlus, Stethoscope, FlaskConical, Pill, CreditCard,
  Building2, Heart, ScanLine, Shield,
} from 'lucide-react';

const DEPT_META: Record<JourneyDepartment, { label: string; icon: any; ring: string }> = {
  reception: { label: 'Réception', icon: UserPlus, ring: 'bg-blue-100 text-blue-700 border-blue-200' },
  consultation: { label: 'Consultation', icon: Stethoscope, ring: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  laboratoire: { label: 'Laboratoire', icon: FlaskConical, ring: 'bg-cyan-100 text-cyan-700 border-cyan-200' },
  pharmacie: { label: 'Pharmacie', icon: Pill, ring: 'bg-purple-100 text-purple-700 border-purple-200' },
  caisse: { label: 'Caisse', icon: CreditCard, ring: 'bg-amber-100 text-amber-700 border-amber-200' },
  hospitalisation: { label: 'Hospitalisation', icon: Building2, ring: 'bg-rose-100 text-rose-700 border-rose-200' },
  bloc: { label: 'Bloc', icon: Heart, ring: 'bg-red-100 text-red-700 border-red-200' },
  imagerie: { label: 'Imagerie', icon: ScanLine, ring: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
  administration: { label: 'Administration', icon: Shield, ring: 'bg-slate-100 text-slate-700 border-slate-200' },
};

export default function PatientJourney({ events }: { events: PatientJourneyEvent[] }) {
  const sorted = [...events].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  if (sorted.length === 0) {
    return (
      <div className="text-sm text-slate-400 italic p-4 text-center">
        Aucun événement de parcours enregistré pour ce patient.
      </div>
    );
  }

  return (
    <ol className="relative border-l-2 border-slate-200 ml-3 space-y-4 pb-2">
      {sorted.map((ev) => {
        const meta = DEPT_META[ev.department];
        const Icon = meta.icon;
        return (
          <li key={ev.id} className="ml-4">
            <span className={`absolute -left-[13px] flex items-center justify-center w-6 h-6 rounded-full border ${meta.ring}`}>
              <Icon className="w-3.5 h-3.5" />
            </span>
            <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm hover:shadow transition">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="font-semibold text-slate-800 text-sm flex items-center gap-2">{ev.action}</div>
                {ev.status && (
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${meta.ring}`}>{ev.status}</span>
                )}
              </div>
              <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
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
              {ev.details && <p className="text-xs text-slate-600 mt-1">{ev.details}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
