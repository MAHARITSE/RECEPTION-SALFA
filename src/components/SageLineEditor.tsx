import { useState, useEffect } from 'react';
import { Plus, Trash2, Save } from 'lucide-react';
import { formatAr } from '../store';

export interface SageLine {
  id: string;
  reference: string;
  designation: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  netPrice: number;
  amount: number;
  posology?: string;
  duration?: string;
  unit?: string;
  extra?: string; // date péremption, fournisseur, etc
}

interface Props {
  lines: SageLine[];
  onLinesChange: (lines: SageLine[]) => void;
  columns: { key: keyof SageLine; label: string; width: string; type: 'text' | 'number' | 'readonly' | 'date'; }[];
  searchPlaceholder?: string;
  searchItems?: { id: string; label: string; subLabel?: string; price: number; unit?: string }[];
  onSearchSelect?: (id: string) => SageLine | null;
  showSearch?: boolean;
  searchFilterFn?: (query: string) => { id: string; label: string; subLabel?: string; price: number }[];
}

export default function SageLineEditor({ lines, onLinesChange, columns, searchPlaceholder, onSearchSelect, showSearch = true, searchFilterFn }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<SageLine>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ id: string; label: string; subLabel?: string; price: number }[]>([]);
  const [isNew, setIsNew] = useState(false);

  // Load selected line into form
  useEffect(() => {
    const line = lines.find(l => l.id === selectedId);
    if (line) { setForm({ ...line }); setIsNew(false); }
  }, [selectedId]);

  // Search
  useEffect(() => {
    if (searchQuery.length >= 1 && searchFilterFn) {
      setSearchResults(searchFilterFn(searchQuery));
    } else {
      setSearchResults([]);
    }
  }, [searchQuery]);

  const handleFormChange = (key: string, value: any) => {
    setForm(prev => {
      const updated = { ...prev, [key]: value };
      // Auto-calc
      const qty = key === 'quantity' ? Number(value) : (updated.quantity || 0);
      const pu = key === 'unitPrice' ? Number(value) : (updated.unitPrice || 0);
      const disc = key === 'discount' ? Number(value) : (updated.discount || 0);
      const net = pu - (pu * disc / 100);
      updated.netPrice = Math.round(net);
      updated.amount = Math.round(qty * net);
      return updated;
    });
  };

  const handleSearchSelect = (id: string) => {
    if (onSearchSelect) {
      const newLine = onSearchSelect(id);
      if (newLine) {
        setForm({ ...newLine });
        setSelectedId(newLine.id);
        setIsNew(true);
        setSearchQuery('');
        setSearchResults([]);
      }
    }
  };

  const handleSave = () => {
    if (!form.id || !form.designation) return;
    const line = form as SageLine;
    if (isNew || !lines.find(l => l.id === line.id)) {
      onLinesChange([...lines, line]);
    } else {
      onLinesChange(lines.map(l => l.id === line.id ? line : l));
    }
    setIsNew(false);
  };

  const handleDelete = () => {
    if (!selectedId) return;
    const newLines = lines.filter(l => l.id !== selectedId);
    onLinesChange(newLines);
    setSelectedId(null);
    setForm({});
  };

  const handleNew = () => {
    setForm({ id: '', reference: '', designation: '', quantity: 1, unitPrice: 0, discount: 0, netPrice: 0, amount: 0 });


    setSelectedId(null);
    setIsNew(true);
  };

  return (
    <div className="w-full bg-[#f4f4f4] border border-slate-300 rounded text-xs select-none">

      {/* SEARCH BAR */}
      {showSearch && (
        <div className="px-2 pt-2 relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white border border-blue-400 rounded px-2 py-1 text-sm focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-500"
            placeholder={searchPlaceholder || '🔍 Tapez pour rechercher un article...'}
          />
          {searchResults.length > 0 && (
            <div className="absolute top-full left-2 right-2 bg-white border border-slate-300 rounded-b shadow-xl z-30 max-h-40 overflow-y-auto">
              {searchResults.map((r) => (
                <div key={r.id} onClick={() => handleSearchSelect(r.id)}
                  className="px-3 py-1.5 hover:bg-blue-50 cursor-pointer flex justify-between border-b border-slate-100">
                  <span className="font-medium">{r.label}</span>
                  <span className="font-mono text-blue-600">{formatAr(r.price)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* FORM BAR (top edit zone) */}
      <div className="bg-slate-100 border-b border-slate-300 p-1.5 m-2 mb-0 rounded shadow-inner">
        <div className="flex flex-wrap items-center gap-1">
          {columns.map(col => (
            <div key={col.key} style={{ width: col.width }} className="flex-shrink-0">
              <label className="block text-[9px] text-slate-500 mb-0.5 truncate">{col.label}</label>
              {col.type === 'readonly' ? (
                <input type="text" readOnly value={form[col.key] != null ? String(form[col.key]) : ''} className="w-full bg-slate-200 border border-slate-300 rounded px-1 py-0.5 text-right font-mono font-bold text-slate-700" />
              ) : (
                <input
                  type={col.type === 'number' ? 'number' : 'text'}
                  value={form[col.key] != null ? String(form[col.key]) : ''}
                  onChange={(e) => handleFormChange(col.key, col.type === 'number' ? (parseFloat(e.target.value) || 0) : e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded px-1 py-0.5 font-mono focus:outline-none focus:border-blue-500 text-slate-800"
                  step={col.type === 'number' ? 'any' : undefined}
                />
              )}
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-1 mt-1.5">
          <button onClick={handleNew} className="flex items-center gap-1 px-2.5 py-0.5 bg-white hover:bg-slate-50 border border-slate-300 rounded shadow-sm text-slate-700 transition cursor-pointer">
            <Plus className="h-3 w-3 text-slate-500" /> Nouveau
          </button>
          <button onClick={handleDelete} disabled={!selectedId} className="flex items-center gap-1 px-2.5 py-0.5 bg-white hover:bg-slate-50 border border-slate-300 rounded shadow-sm text-slate-700 disabled:opacity-40 transition cursor-pointer">
            <Trash2 className="h-3 w-3 text-rose-600" /> Supprimer
          </button>
          <button onClick={handleSave} disabled={!form.designation} className="flex items-center gap-1 px-2.5 py-0.5 bg-sky-500 hover:bg-sky-600 text-white border border-sky-600 rounded shadow-sm font-medium disabled:opacity-40 transition cursor-pointer">
            <Save className="h-3 w-3" /> Enregistrer
          </button>
        </div>
      </div>

      {/* TABLE */}
      <div className="bg-white border-t border-slate-300 overflow-x-auto m-2 mt-0 rounded-b">
        <table className="w-full text-left border-collapse text-[11px]">
          <thead className="bg-slate-50 border-b border-slate-300 text-slate-600">
            <tr className="divide-x divide-slate-200">
              {columns.map(col => (
                <th key={col.key} className="p-1 font-normal truncate" style={{ minWidth: col.width }}>{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-150 font-mono">
            {lines.map((line) => {
              const isSel = line.id === selectedId;
              return (
                <tr key={line.id} onClick={() => setSelectedId(line.id)}
                  className={`cursor-pointer divide-x divide-slate-200 transition-colors ${isSel ? 'bg-blue-500 text-white font-medium' : 'hover:bg-slate-50 text-slate-800'}`}>
                  {columns.map(col => {
                    const val = line[col.key];
                    const isNum = col.type === 'number' || col.type === 'readonly';
                    return (
                      <td key={col.key} className={`p-1 ${isNum ? 'text-right' : ''} ${col.key === 'amount' ? 'font-bold' : ''} truncate`}>
                        {typeof val === 'number' ? val.toLocaleString('fr-FR') : (val || '')}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {lines.length === 0 && (
              <tr><td colSpan={columns.length} className="p-4 text-center text-slate-400 font-sans">Aucune ligne</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
