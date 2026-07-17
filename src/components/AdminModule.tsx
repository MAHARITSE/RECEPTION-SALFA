import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { UserRole, Article, ArticleFamily } from '../types';
import type { AppState } from '../store';
import { ARTICLE_FAMILIES, familyLabel, formatAr } from '../store';
import { DollarSign, Save, Trash2, Plus, X, Check } from 'lucide-react';

interface Props { state: AppState; setState: React.Dispatch<React.SetStateAction<AppState>>; }
type Tab = 'users' | 'articles' | 'prices' | 'companies' | 'prompts';
import { WINDEV_PROMPT, WEB_PROMPT } from '../data/promptsData';
import { FileText, Copy } from 'lucide-react';

const roleLabels: Record<string, string> = { doctor:'Médecin', cashier:'Caisse', pharmacy:'Pharmacie', magasinier:'Magasinier', laboratory:'Laboratoire', hospitalization:'Hospitalisation', admin:'Admin' };
const ALL_ROLES: UserRole[] = ['doctor','cashier','pharmacy','magasinier','laboratory','hospitalization','admin'];

export default function AdminModule({ state, setState }: Props) {
  const [tab, setTab] = useState<Tab>('users');
  const [addUser, setAddUser] = useState(false);
  const [newUser, setNewUser] = useState({ id: '', name: '', role: 'doctor' as UserRole, password: '' });
  const [addArticle, setAddArticle] = useState(false);
  const [newArt, setNewArt] = useState({ name: '', family: 'MEDIC' as ArticleFamily, unit: '', priceComptoir: 0, priceSociete: 0, priceExterne: 0, purchasePrice: 0 });
  const [editingArt, setEditingArt] = useState<string | null>(null);
  const [editPrices, setEditPrices] = useState({ priceComptoir: 0, priceSociete: 0, priceExterne: 0 });
  const [addCompany, setAddCompany] = useState(false);
  const [newCompany, setNewCompany] = useState('');

  const saveUser = () => {
    if (!newUser.id || !newUser.name) { alert('ID et nom requis'); return; }
    if (state.users.find((u) => u.id === newUser.id)) { alert('ID existe déjà'); return; }
    setState((prev) => ({ ...prev, users: [...prev.users, { ...newUser, password: newUser.password || 'pass123' }] }));
    setAddUser(false); setNewUser({ id: '', name: '', role: 'doctor', password: '' });
  };

  const deleteUser = (uid: string) => { if (uid === 'ADM001' || !confirm(`Supprimer ${uid} ?`)) return; setState((prev) => ({ ...prev, users: prev.users.filter((u) => u.id !== uid) })); };

  const saveArticle = () => {
    if (!newArt.name || !newArt.unit) { alert('Nom et unité requis'); return; }
    const a: Article = { id: uuidv4(), ...newArt, stockCentral: 0, stockPharmacie: 0, minStockCentral: 10, minStockPharmacie: 5 };
    setState((prev) => ({ ...prev, articles: [...prev.articles, a] }));
    setAddArticle(false); setNewArt({ name: '', family: 'MEDIC', unit: '', priceComptoir: 0, priceSociete: 0, priceExterne: 0, purchasePrice: 0 });
  };

  const startEditPrices = (a: Article) => { setEditingArt(a.id); setEditPrices({ priceComptoir: a.priceComptoir, priceSociete: a.priceSociete, priceExterne: a.priceExterne }); };
  const savePrices = () => { if (!editingArt) return; setState((prev) => ({ ...prev, articles: prev.articles.map((a) => a.id === editingArt ? { ...a, ...editPrices } : a) })); setEditingArt(null); };

  const saveCompany = () => { if (!newCompany) return; setState((prev) => ({ ...prev, companies: [...prev.companies, { id: uuidv4(), name: newCompany.toUpperCase() }] })); setNewCompany(''); setAddCompany(false); };
  const deleteCompany = (id: string) => { setState((prev) => ({ ...prev, companies: prev.companies.filter((c) => c.id !== id) })); };

  const [promptView, setPromptView] = useState<'windev' | 'web'>('windev');
  const [copied, setCopied] = useState(false);

  const copyPromptText = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="flex border-b overflow-x-auto">
          {[{ key:'users' as Tab, l:'👥 Utilisateurs' },{ key:'articles' as Tab, l:'📦 Articles' },{ key:'prices' as Tab, l:'💰 Tarifs' },{ key:'companies' as Tab, l:'🏢 Sociétés / Clients' },{ key:'prompts' as Tab, l:'📜 Prompts & Spécifications' }].map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} className={`px-6 py-3 text-sm font-medium border-b-2 cursor-pointer whitespace-nowrap ${tab===t.key?'border-slate-800 text-slate-800 bg-slate-100':'border-transparent text-slate-500'}`}>{t.l}</button>
          ))}
        </div>
        <div className="p-4 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>

          {tab === 'users' && <div>
            <button onClick={() => setAddUser(true)} className="mb-3 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 flex items-center gap-2 cursor-pointer text-sm"><Plus className="w-4 h-4" /> Nouvel utilisateur</button>
            {addUser && <div className="grid grid-cols-4 gap-2 mb-3 p-3 bg-slate-50 rounded-lg text-sm">
              <input type="text" value={newUser.id} onChange={(e) => setNewUser({...newUser,id:e.target.value})} className="px-2 py-1.5 border rounded outline-none" placeholder="ID (ex: DOC004)" />
              <input type="text" value={newUser.name} onChange={(e) => setNewUser({...newUser,name:e.target.value})} className="px-2 py-1.5 border rounded outline-none" placeholder="Nom complet" />
              <select value={newUser.role} onChange={(e) => setNewUser({...newUser,role:e.target.value as UserRole})} className="px-2 py-1.5 border rounded outline-none cursor-pointer">{ALL_ROLES.map((r) => (<option key={r} value={r}>{roleLabels[r]}</option>))}</select>
              <div className="flex gap-1"><input type="password" value={newUser.password} onChange={(e) => setNewUser({...newUser,password:e.target.value})} className="flex-1 px-2 py-1.5 border rounded outline-none" placeholder="MDP" /><button onClick={saveUser} className="px-2 bg-emerald-600 text-white rounded cursor-pointer"><Check className="w-4 h-4" /></button><button onClick={() => setAddUser(false)} className="px-2 bg-slate-400 text-white rounded cursor-pointer"><X className="w-4 h-4" /></button></div>
            </div>}
            <div className="overflow-auto"><table className="w-full text-sm"><thead className="bg-slate-50 border-b"><tr><th className="p-2 text-left">ID</th><th className="p-2 text-left">Nom</th><th className="p-2 text-left">Rôle</th><th className="p-2 text-left">MDP</th><th className="p-2 w-10"></th></tr></thead><tbody>{staffUsers.map((u) => (<tr key={u.id} className="border-b border-slate-100"><td className="p-2 font-mono font-bold">{u.id}</td><td className="p-2">{u.name}</td><td className="p-2"><span className="px-2 py-0.5 bg-slate-200 rounded text-xs">{roleLabels[u.role]}</span></td><td className="p-2 font-mono text-slate-400">{u.password}</td><td className="p-2"><button onClick={() => deleteUser(u.id)} disabled={u.id==='ADM001'} className="text-red-500 disabled:opacity-30 cursor-pointer"><Trash2 className="w-4 h-4" /></button></td></tr>))}</tbody></table></div>
          </div>}

          {tab === 'articles' && <div>
            <button onClick={() => setAddArticle(true)} className="mb-3 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 cursor-pointer text-sm"><Plus className="w-4 h-4" /> Nouvel article</button>
            {addArticle && <div className="p-3 bg-blue-50 rounded-lg mb-3 space-y-2 text-sm">
              <div className="grid grid-cols-3 gap-2">
                <input type="text" value={newArt.name} onChange={(e) => setNewArt({...newArt,name:e.target.value})} className="px-2 py-1.5 border rounded outline-none" placeholder="Nom article *" />
                <select value={newArt.family} onChange={(e) => setNewArt({...newArt,family:e.target.value as ArticleFamily})} className="px-2 py-1.5 border rounded outline-none cursor-pointer">{ARTICLE_FAMILIES.map((f) => (<option key={f} value={f}>{familyLabel(f)}</option>))}</select>
                <input type="text" value={newArt.unit} onChange={(e) => setNewArt({...newArt,unit:e.target.value})} className="px-2 py-1.5 border rounded outline-none" placeholder="Unité (comprimé, flacon...)" />
              </div>
              <div className="grid grid-cols-4 gap-2">
                <input type="number" value={newArt.purchasePrice||''} onChange={(e) => setNewArt({...newArt,purchasePrice:parseInt(e.target.value)||0})} className="px-2 py-1.5 border rounded outline-none" placeholder="P. Achat (Ar)" />
                <input type="number" value={newArt.priceComptoir||''} onChange={(e) => setNewArt({...newArt,priceComptoir:parseInt(e.target.value)||0})} className="px-2 py-1.5 border rounded outline-none" placeholder="P. Comptoir" />
                <input type="number" value={newArt.priceSociete||''} onChange={(e) => setNewArt({...newArt,priceSociete:parseInt(e.target.value)||0})} className="px-2 py-1.5 border rounded outline-none" placeholder="P. Société" />
                <input type="number" value={newArt.priceExterne||''} onChange={(e) => setNewArt({...newArt,priceExterne:parseInt(e.target.value)||0})} className="px-2 py-1.5 border rounded outline-none" placeholder="P. Externe" />
              </div>
              <div className="flex gap-2"><button onClick={saveArticle} className="px-4 py-1.5 bg-blue-600 text-white rounded cursor-pointer flex items-center gap-1"><Check className="w-4 h-4" /> Enregistrer</button><button onClick={() => setAddArticle(false)} className="px-4 py-1.5 bg-slate-400 text-white rounded cursor-pointer">Annuler</button></div>
            </div>}
            <div className="overflow-auto"><table className="w-full text-xs"><thead className="bg-slate-50 border-b"><tr><th className="p-2 text-left">Famille</th><th className="p-2 text-left">Nom</th><th className="p-2">Unité</th><th className="p-2 text-right">P.Achat</th><th className="p-2 text-right">P.Comptoir</th><th className="p-2 text-right">P.Société</th><th className="p-2 text-right">P.Externe</th><th className="p-2 text-center">Stocks C/P</th></tr></thead><tbody>{state.articles.map((a) => (
              <tr key={a.id} className="border-b border-slate-100"><td className="p-2"><span className="px-1.5 py-0.5 bg-slate-200 rounded text-[10px]">{familyLabel(a.family)}</span></td><td className="p-2 font-medium">{a.name}</td><td className="p-2 text-slate-500">{a.unit}</td><td className="p-2 text-right font-mono">{formatAr(a.purchasePrice)}</td><td className="p-2 text-right font-mono">{formatAr(a.priceComptoir)}</td><td className="p-2 text-right font-mono">{formatAr(a.priceSociete)}</td><td className="p-2 text-right font-mono">{formatAr(a.priceExterne)}</td><td className="p-2 text-center font-mono">{a.stockCentral}/{a.stockPharmacie}</td></tr>
            ))}</tbody></table></div>
          </div>}

          {tab === 'prices' && <div>
            {ARTICLE_FAMILIES.map((f) => { const arts = state.articles.filter((a) => a.family === f);
              return (<div key={f} className="mb-4"><h4 className="font-semibold mb-1 text-sm">{familyLabel(f)}</h4>
                <div className="overflow-auto"><table className="w-full text-xs"><thead className="bg-slate-50"><tr><th className="p-2 text-left">Article</th><th className="p-2 text-right">Comptoir</th><th className="p-2 text-right">Société</th><th className="p-2 text-right">Externe</th><th className="p-2 w-10"></th></tr></thead><tbody>{arts.map((a) => (
                  <tr key={a.id} className="border-b border-slate-100">
                    {editingArt === a.id ? <><td className="p-2 font-medium">{a.name}</td><td className="p-1"><input type="number" value={editPrices.priceComptoir} onChange={(e) => setEditPrices({...editPrices,priceComptoir:parseInt(e.target.value)||0})} className="w-full px-1 py-0.5 border rounded text-right outline-none" /></td><td className="p-1"><input type="number" value={editPrices.priceSociete} onChange={(e) => setEditPrices({...editPrices,priceSociete:parseInt(e.target.value)||0})} className="w-full px-1 py-0.5 border rounded text-right outline-none" /></td><td className="p-1"><input type="number" value={editPrices.priceExterne} onChange={(e) => setEditPrices({...editPrices,priceExterne:parseInt(e.target.value)||0})} className="w-full px-1 py-0.5 border rounded text-right outline-none" /></td><td className="p-1"><button onClick={savePrices} className="text-emerald-600 cursor-pointer"><Save className="w-4 h-4" /></button></td></>
                    : <><td className="p-2 font-medium">{a.name}</td><td className="p-2 text-right font-mono">{formatAr(a.priceComptoir)}</td><td className="p-2 text-right font-mono">{formatAr(a.priceSociete)}</td><td className="p-2 text-right font-mono">{formatAr(a.priceExterne)}</td><td className="p-1"><button onClick={() => startEditPrices(a)} className="text-blue-600 cursor-pointer"><DollarSign className="w-4 h-4" /></button></td></>}
                  </tr>
                ))}</tbody></table></div></div>);
            })}
          </div>}

          {tab === 'companies' && <div>
            <button onClick={() => setAddCompany(true)} className="mb-3 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 flex items-center gap-2 cursor-pointer text-sm"><Plus className="w-4 h-4" /> Nouvelle société</button>
            {addCompany && <div className="flex gap-2 mb-3"><input type="text" value={newCompany} onChange={(e) => setNewCompany(e.target.value)} className="flex-1 px-3 py-2 border rounded-lg outline-none" placeholder="Nom de la société" /><button onClick={saveCompany} className="px-4 py-2 bg-emerald-600 text-white rounded-lg cursor-pointer"><Check className="w-4 h-4" /></button><button onClick={() => setAddCompany(false)} className="px-4 py-2 bg-slate-400 text-white rounded-lg cursor-pointer"><X className="w-4 h-4" /></button></div>}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{state.companies.map((c) => (<div key={c.id} className="flex items-center justify-between px-3 py-2 bg-slate-50 border rounded-lg"><span className="font-medium text-sm">{c.name}</span><button onClick={() => deleteCompany(c.id)} className="text-red-500 cursor-pointer"><Trash2 className="w-4 h-4" /></button></div>))}</div>
          </div>}

          {tab === 'prompts' && <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                <button onClick={() => setPromptView('windev')} className={`px-4 py-2 rounded-lg text-sm font-medium cursor-pointer ${promptView === 'windev' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
                  💻 Prompt WinDev (RECEPTION SALFA)
                </button>
                <button onClick={() => setPromptView('web')} className={`px-4 py-2 rounded-lg text-sm font-medium cursor-pointer ${promptView === 'web' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
                  🌐 Prompt Web (MediCare HIS)
                </button>
              </div>
              <button onClick={() => copyPromptText(promptView === 'windev' ? WINDEV_PROMPT : WEB_PROMPT)} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 flex items-center gap-2 cursor-pointer">
                <Copy className="w-4 h-4" /> {copied ? 'Copié !' : 'Copier le prompt'}
              </button>
            </div>
            <div className="p-4 bg-slate-900 text-slate-100 rounded-xl font-mono text-xs overflow-auto whitespace-pre-wrap" style={{ maxHeight: 'calc(100vh - 360px)' }}>
              {promptView === 'windev' ? WINDEV_PROMPT : WEB_PROMPT}
            </div>
          </div>}
        </div>
      </div>
    </div>
  );
}
