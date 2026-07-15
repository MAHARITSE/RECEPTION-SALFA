import React, { useState } from 'react';
import type { LabResult } from '../types';
import type { AppState } from '../store';
import { addAuditLog, addNotification, LAB_NORMS } from '../store';
import {
  FlaskConical, Clock, CheckCircle, AlertTriangle,
  Send, Microscope, FileSearch
} from 'lucide-react';

interface Props {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
}

type Tab = 'pending' | 'in_progress' | 'completed';

export default function LaboratoryModule({ state, setState }: Props) {
  const [tab, setTab] = useState<Tab>('pending');
  const [activeLabId, setActiveLabId] = useState<string | null>(null);
  const [resultValues, setResultValues] = useState<Record<string, number>>({});

  // Get lab requests that are paid (or urgent)
  const allLabRequests: { consultationId: string; labRequest: any; patientName: string; doctorName: string; isEmergency: boolean }[] = [];

  state.consultations.forEach((c) => {
    const patient = state.patients.find((p) => p.id === c.patientId);
    const invoice = state.invoices.find((inv) => inv.consultationId === c.id && inv.status === 'paid');
    const canProcess = invoice || c.isEmergency;

    c.labRequests.forEach((lr) => {
      if (canProcess) {
        allLabRequests.push({
          consultationId: c.id,
          labRequest: lr,
          patientName: `${patient?.lastName || ''} ${patient?.firstName || ''}`,
          doctorName: c.doctorName,
          isEmergency: c.isEmergency,
        });
      }
    });
  });

  const pendingLabs = allLabRequests.filter((l) => l.labRequest.status === 'paid' || l.labRequest.status === 'pending');
  const inProgressLabs = allLabRequests.filter((l) => l.labRequest.status === 'in_progress');
  const completedLabs = allLabRequests.filter((l) => l.labRequest.status === 'completed');

  const startAnalysis = (consultationId: string, labId: string) => {
    setState((prev) => ({
      ...prev,
      consultations: prev.consultations.map((c) =>
        c.id === consultationId
          ? {
              ...c,
              labRequests: c.labRequests.map((lr) =>
                lr.id === labId ? { ...lr, status: 'in_progress' as const } : lr
              ),
            }
          : c
      ),
    }));
    setActiveLabId(labId);
    setResultValues({});
  };

  const submitResults = (consultationId: string, labId: string) => {
    const consultation = state.consultations.find((c) => c.id === consultationId);
    const lr = consultation?.labRequests.find((l) => l.id === labId);
    if (!lr) return;

    const results: LabResult[] = lr.parameters.map((param) => {
      const value = resultValues[param] || 0;
      const norm = LAB_NORMS[param];
      return {
        parameter: param,
        value,
        unit: norm?.unit || '',
        normalMin: norm?.min || 0,
        normalMax: norm?.max || 0,
        isAbnormal: norm ? (value < norm.min || value > norm.max) : false,
      };
    });

    const hasAbnormal = results.some((r) => r.isAbnormal);
    const patient = state.patients.find((p) => p.id === consultation?.patientId);

    setState((prev) => {
      const next = {
        ...prev,
        consultations: prev.consultations.map((c) =>
          c.id === consultationId
            ? {
                ...c,
                labRequests: c.labRequests.map((l) =>
                  l.id === labId
                    ? {
                        ...l,
                        status: 'completed' as const,
                        results,
                        completedAt: new Date().toISOString(),
                        completedBy: prev.currentUser?.id || '',
                      }
                    : l
                ),
              }
            : c
        ),
      };

      addAuditLog(next, 'RESULTATS_ANALYSE', `Résultats ${lr.examType} saisis pour ${patient?.lastName}`, consultation?.patientId);

      if (hasAbnormal) {
        addNotification(
          next,
          'doctor',
          `🚨 Résultats ANORMAUX - ${lr.examType} pour ${patient?.lastName} ${patient?.firstName}`,
          'critical',
          consultation?.doctorId
        );
      } else {
        addNotification(
          next,
          'doctor',
          `Résultats disponibles: ${lr.examType} pour ${patient?.lastName} ${patient?.firstName}`,
          'info',
          consultation?.doctorId
        );
      }

      return next;
    });

    setActiveLabId(null);
    setResultValues({});
    alert('Résultats enregistrés et envoyés au médecin !');
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 rounded-lg"><Clock className="w-5 h-5 text-amber-600" /></div>
            <div>
              <div className="text-2xl font-bold text-slate-800">{pendingLabs.length}</div>
              <div className="text-sm text-slate-500">Analyses en attente</div>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg"><Microscope className="w-5 h-5 text-blue-600" /></div>
            <div>
              <div className="text-2xl font-bold text-slate-800">{inProgressLabs.length}</div>
              <div className="text-sm text-slate-500">En cours</div>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg"><CheckCircle className="w-5 h-5 text-green-600" /></div>
            <div>
              <div className="text-2xl font-bold text-slate-800">{completedLabs.length}</div>
              <div className="text-sm text-slate-500">Terminées</div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="flex border-b border-slate-200">
          {[
            { key: 'pending' as Tab, icon: <Clock className="w-4 h-4" />, label: `En attente (${pendingLabs.length})` },
            { key: 'in_progress' as Tab, icon: <FlaskConical className="w-4 h-4" />, label: `En cours (${inProgressLabs.length})` },
            { key: 'completed' as Tab, icon: <CheckCircle className="w-4 h-4" />, label: `Terminées (${completedLabs.length})` },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-6 py-3 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
                tab === t.key
                  ? 'border-cyan-500 text-cyan-600 bg-cyan-50/50'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-6">
          {tab === 'pending' && (
            <div>
              {pendingLabs.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <FlaskConical className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>Aucune analyse en attente</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {pendingLabs.map((l) => (
                    <div key={l.labRequest.id} className={`p-4 border rounded-xl ${l.isEmergency && l.labRequest.status === 'pending' ? 'border-red-300 bg-red-50' : 'border-slate-200'}`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-semibold text-slate-800 flex items-center gap-2">
                            {l.patientName}
                            {l.labRequest.urgent && <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full">URGENT</span>}
                            {l.isEmergency && l.labRequest.status === 'pending' && (
                              <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full">🚨 URGENCE</span>
                            )}
                          </div>
                          <div className="text-sm text-slate-500 mt-1">
                            {l.labRequest.examType} — Dr. {l.doctorName}
                          </div>
                          <div className="text-xs text-slate-400 mt-1">
                            Paramètres: {l.labRequest.parameters.join(', ')}
                          </div>
                        </div>
                        <button
                          onClick={() => startAnalysis(l.consultationId, l.labRequest.id)}
                          className="px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors font-medium text-sm flex items-center gap-2 cursor-pointer"
                        >
                          <FlaskConical className="w-4 h-4" />
                          Commencer
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'in_progress' && (
            <div>
              {inProgressLabs.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <Microscope className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>Aucune analyse en cours</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {inProgressLabs.map((l) => (
                    <div key={l.labRequest.id} className="border border-cyan-200 rounded-xl overflow-hidden">
                      <div className="p-4 bg-cyan-50 flex items-center justify-between">
                        <div>
                          <div className="font-semibold text-slate-800">{l.patientName}</div>
                          <div className="text-sm text-slate-500">{l.labRequest.examType}</div>
                        </div>
                        {activeLabId === l.labRequest.id && (
                          <button
                            onClick={() => submitResults(l.consultationId, l.labRequest.id)}
                            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium text-sm flex items-center gap-2 cursor-pointer"
                          >
                            <Send className="w-4 h-4" />
                            Valider les résultats
                          </button>
                        )}
                        {activeLabId !== l.labRequest.id && (
                          <button
                            onClick={() => { setActiveLabId(l.labRequest.id); setResultValues({}); }}
                            className="px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors font-medium text-sm cursor-pointer"
                          >
                            Saisir résultats
                          </button>
                        )}
                      </div>

                      {activeLabId === l.labRequest.id && (
                        <div className="p-4">
                          <h4 className="font-medium text-slate-700 mb-3 flex items-center gap-2">
                            <FileSearch className="w-4 h-4" />
                            Saisie des résultats
                          </h4>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {l.labRequest.parameters.map((param: string) => {
                              const norm = LAB_NORMS[param];
                              return (
                                <div key={param} className="p-3 bg-slate-50 rounded-lg">
                                  <label className="text-sm font-medium text-slate-700">{param}</label>
                                  {norm && (
                                    <div className="text-xs text-slate-400 mt-0.5">
                                      Normes: {norm.min} – {norm.max} {norm.unit}
                                    </div>
                                  )}
                                  <div className="flex items-center gap-2 mt-1">
                                    <input
                                      type="number"
                                      step="0.01"
                                      value={resultValues[param] || ''}
                                      onChange={(e) =>
                                        setResultValues({ ...resultValues, [param]: parseFloat(e.target.value) || 0 })
                                      }
                                      className={`w-full px-3 py-1.5 border rounded-lg text-sm outline-none focus:ring-2 ${
                                        resultValues[param] !== undefined && norm && (resultValues[param] < norm.min || resultValues[param] > norm.max)
                                          ? 'border-red-400 focus:ring-red-500 bg-red-50'
                                          : 'border-slate-300 focus:ring-cyan-500'
                                      }`}
                                    />
                                    <span className="text-xs text-slate-500 whitespace-nowrap">{norm?.unit || ''}</span>
                                  </div>
                                  {resultValues[param] !== undefined && norm && (resultValues[param] < norm.min || resultValues[param] > norm.max) && (
                                    <div className="flex items-center gap-1 mt-1 text-xs text-red-600">
                                      <AlertTriangle className="w-3 h-3" />
                                      HORS NORMES
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'completed' && (
            <div>
              {completedLabs.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <CheckCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>Aucune analyse terminée</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {completedLabs.map((l) => (
                    <div key={l.labRequest.id} className="border border-green-200 rounded-xl overflow-hidden">
                      <div className="p-4 bg-green-50">
                        <div className="flex items-center gap-2">
                          <CheckCircle className="w-5 h-5 text-green-600" />
                          <div>
                            <div className="font-semibold text-slate-800">{l.patientName}</div>
                            <div className="text-sm text-slate-500">{l.labRequest.examType}</div>
                          </div>
                        </div>
                      </div>
                      {l.labRequest.results && (
                        <div className="p-4">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-slate-200">
                                <th className="text-left py-2 text-slate-600">Paramètre</th>
                                <th className="text-center py-2 text-slate-600">Résultat</th>
                                <th className="text-center py-2 text-slate-600">Normes</th>
                                <th className="text-center py-2 text-slate-600">État</th>
                              </tr>
                            </thead>
                            <tbody>
                              {l.labRequest.results.map((r: LabResult) => (
                                <tr key={r.parameter} className={`border-b border-slate-100 ${r.isAbnormal ? 'bg-red-50' : ''}`}>
                                  <td className="py-2 text-slate-700">{r.parameter}</td>
                                  <td className={`py-2 text-center font-mono font-bold ${r.isAbnormal ? 'text-red-600' : 'text-green-600'}`}>
                                    {r.value} {r.unit}
                                  </td>
                                  <td className="py-2 text-center text-xs text-slate-500">
                                    {r.normalMin} – {r.normalMax} {r.unit}
                                  </td>
                                  <td className="py-2 text-center">
                                    {r.isAbnormal ? (
                                      <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full font-bold flex items-center justify-center gap-1">
                                        <AlertTriangle className="w-3 h-3" /> ANORMAL
                                      </span>
                                    ) : (
                                      <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">Normal</span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
