import React from 'react';
import { AlertTriangle, Trash2, HelpCircle, CheckCircle, Info, X } from 'lucide-react';

export interface ConfirmModalProps {
  isOpen: boolean;
  title?: string;
  message: string;
  subText?: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'info' | 'success';
  showCancel?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  isOpen,
  title = 'Confirmation',
  message,
  subText,
  confirmText = 'Confirmer',
  cancelText = 'Annuler',
  type = 'danger',
  showCancel = true,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!isOpen) return null;

  const headerGradient = {
    danger: 'from-rose-600 to-red-600 text-white',
    warning: 'from-amber-500 to-orange-600 text-white',
    info: 'from-blue-600 to-indigo-600 text-white',
    success: 'from-emerald-600 to-teal-600 text-white',
  }[type];

  const iconComponent = {
    danger: <Trash2 className="w-8 h-8 text-white animate-bounce-once" />,
    warning: <AlertTriangle className="w-8 h-8 text-white" />,
    info: <Info className="w-8 h-8 text-white" />,
    success: <CheckCircle className="w-8 h-8 text-white" />,
  }[type];

  const buttonClass = {
    danger: 'bg-rose-600 hover:bg-rose-700 focus:ring-rose-500 shadow-rose-600/30',
    warning: 'bg-amber-600 hover:bg-amber-700 focus:ring-amber-500 shadow-amber-600/30',
    info: 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500 shadow-blue-600/30',
    success: 'bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-500 shadow-emerald-600/30',
  }[type];

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
      >
        {/* Header bar colorisé */}
        <div className={`bg-gradient-to-r ${headerGradient} p-5 flex items-center gap-4 relative`}>
          <div className="p-2.5 bg-white/20 backdrop-blur rounded-xl shrink-0">
            {iconComponent}
          </div>
          <div className="flex-1 pr-6">
            <h3 className="text-lg font-bold tracking-tight text-white leading-tight">
              {title}
            </h3>
            <p className="text-xs text-white/80 font-medium mt-0.5">
              Attention requise
            </p>
          </div>
          <button
            onClick={onCancel}
            className="absolute top-4 right-4 p-1 text-white/70 hover:text-white hover:bg-white/20 rounded-lg transition"
            title="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content body */}
        <div className="p-6 text-slate-800 space-y-3">
          <p className="text-base font-semibold leading-relaxed text-slate-800">
            {message}
          </p>
          {subText && (
            <p className="text-xs text-slate-500 leading-normal bg-slate-50 p-3 rounded-xl border border-slate-200/80">
              {subText}
            </p>
          )}
        </div>

        {/* Footer actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
          {showCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-semibold text-sm rounded-xl transition cursor-pointer shadow-sm active:scale-95"
            >
              {cancelText}
            </button>
          )}
          <button
            type="button"
            onClick={onConfirm}
            className={`px-5 py-2.5 text-white font-semibold text-sm rounded-xl transition cursor-pointer shadow-lg active:scale-95 focus:outline-none focus:ring-2 focus:ring-offset-2 ${buttonClass}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
