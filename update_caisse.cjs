const fs = require('fs');
let code = fs.readFileSync('src/components/ModuleCaisse.tsx', 'utf-8');

// 1. Replace state.ticketSettings with effectiveTicketSettings
code = code.replace(/state\.ticketSettings/g, 'effectiveTicketSettings');

// 2. Insert printer state after const [tab, setTab] = useState<Tab>('payment');
const stateInsertion = `  const [tab, setTab] = useState<Tab>('payment');

  // Configuration imprimante & tickets spécifique au caissier connecté
  const cashierId = state.currentUser?.id || 'default';
  const [printerSettings, setPrinterSettings] = useState(() => {
    try {
      const saved = localStorage.getItem(\`salfa_caisse_printer_\${cashierId}\`);
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return {
      printerName: state.currentUser?.name ? \`Imprimante de \${state.currentUser.name}\` : 'Imprimante Caisse',
      paperWidth: state.ticketSettings?.paperWidth || 80,
      autoPrint: state.ticketSettings?.autoPrint ?? true,
      copies: state.ticketSettings?.copies || 1,
      receiptTitle: state.ticketSettings?.receiptTitle || 'REÇU DE PAIEMENT',
      footerMessage: state.ticketSettings?.footerMessage || 'Merci de votre visite. Prompt rétablissement !'
    };
  });
  const [printerModalOpen, setPrinterModalOpen] = useState(false);
  const [tempPrinterSettings, setTempPrinterSettings] = useState(printerSettings);

  const effectiveTicketSettings = {
    ...state.ticketSettings,
    paperWidth: printerSettings.paperWidth,
    autoPrint: printerSettings.autoPrint,
    copies: printerSettings.copies,
    receiptTitle: printerSettings.receiptTitle,
    footerMessage: printerSettings.footerMessage,
  };`;

code = code.replace("const [tab, setTab] = useState<Tab>('payment');", stateInsertion);

// 3. Replace tab header
const oldTabHeader = `<div className="flex border-b overflow-x-auto">
          {([['payment','📋 Facturation',pendingPatients.length],['hospit','🏨 Hospit.',hbRecords.filter(h=>h.type==='hospit').length],['bloc','🏥 Bloc',hbRecords.filter(h=>h.type==='bloc').length],['closing','🔒 Clôture',0]] as [Tab,string,number][]).map(([k,l,c]) => (
            <button key={k} onClick={() => switchTab(k)} className={\`flex items-center gap-1 px-4 py-3 text-xs font-medium border-b-2 cursor-pointer whitespace-nowrap \${tab===k?'border-amber-500 text-amber-600 bg-amber-50/50':'border-transparent text-slate-500'}\`}>{l}{c > 0 ? \` (\${c})\` : ''}</button>
          ))}
        </div>`;

const newTabHeader = `<div className="flex items-center justify-between border-b overflow-x-auto bg-slate-50/50 px-2">
          <div className="flex overflow-x-auto">
            {([['payment','📋 Facturation',pendingPatients.length],['hospit','🏨 Hospit.',hbRecords.filter(h=>h.type==='hospit').length],['bloc','🏥 Bloc',hbRecords.filter(h=>h.type==='bloc').length],['closing','🔒 Clôture',0]] as [Tab,string,number][]).map(([k,l,c]) => (
              <button key={k} onClick={() => switchTab(k)} className={\`flex items-center gap-1 px-4 py-3 text-xs font-medium border-b-2 cursor-pointer whitespace-nowrap \${tab===k?'border-amber-500 text-amber-600 bg-amber-50/50':'border-transparent text-slate-500 hover:text-slate-800'}\`}>{l}{c > 0 ? \` (\${c})\` : ''}</button>
            ))}
          </div>
          <div className="pr-2">
            <button
              onClick={() => { setTempPrinterSettings(printerSettings); setPrinterModalOpen(true); }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg text-xs font-semibold text-slate-700 cursor-pointer shadow-xs transition"
              title="Configurer l'imprimante et le format de ticket pour ce caissier"
            >
              <Printer className="w-4 h-4 text-amber-600" />
              <span>Imprimante : {printerSettings.printerName} ({printerSettings.paperWidth}mm)</span>
            </button>
          </div>
        </div>`;

code = code.replace(oldTabHeader, newTabHeader);

// 4. Insert printer modal before last closing div
const modalSnippet = `      {printerModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-sm">
                <Printer className="w-5 h-5 text-amber-400" /> Configuration Imprimante & Reçus
              </div>
              <button
                onClick={() => setPrinterModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="p-5 space-y-4 text-xs">
              <p className="text-slate-500 leading-relaxed">
                Chaque caissier peut configurer sa propre imprimante et son format de ticket thermique (le réglage est mémorisé sur ce poste / navigateur pour votre compte).
              </p>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nom / Poste de l'imprimante</label>
                <input
                  type="text"
                  value={tempPrinterSettings.printerName}
                  onChange={e => setTempPrinterSettings({ ...tempPrinterSettings, printerName: e.target.value })}
                  className="w-full px-3 py-2 border rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
                  placeholder="ex: Caisse 1 - Imprimante Thermique Bureau"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Format Papier Thermique</label>
                  <select
                    value={tempPrinterSettings.paperWidth}
                    onChange={e => setTempPrinterSettings({ ...tempPrinterSettings, paperWidth: Number(e.target.value) })}
                    className="w-full px-3 py-2 border rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium bg-white"
                  >
                    <option value={80}>80 mm (Standard POS)</option>
                    <option value={58}>58 mm (Étroit / Portable)</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Nombre d'exemplaires</label>
                  <input
                    type="number"
                    min={1}
                    max={5}
                    value={tempPrinterSettings.copies}
                    onChange={e => setTempPrinterSettings({ ...tempPrinterSettings, copies: Math.max(1, parseInt(e.target.value) || 1) })}
                    className="w-full px-3 py-2 border rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
                  />
                </div>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Titre du reçu / ticket</label>
                <input
                  type="text"
                  value={tempPrinterSettings.receiptTitle}
                  onChange={e => setTempPrinterSettings({ ...tempPrinterSettings, receiptTitle: e.target.value })}
                  className="w-full px-3 py-2 border rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
                  placeholder="ex: REÇU DE PAIEMENT"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Message de pied de page</label>
                <input
                  type="text"
                  value={tempPrinterSettings.footerMessage}
                  onChange={e => setTempPrinterSettings({ ...tempPrinterSettings, footerMessage: e.target.value })}
                  className="w-full px-3 py-2 border rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
                  placeholder="ex: Merci de votre visite !"
                />
              </div>
              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="autoPrintCheck"
                  checked={tempPrinterSettings.autoPrint}
                  onChange={e => setTempPrinterSettings({ ...tempPrinterSettings, autoPrint: e.target.checked })}
                  className="w-4 h-4 text-amber-600 rounded focus:ring-amber-500"
                />
                <label htmlFor="autoPrintCheck" className="font-semibold text-slate-700 cursor-pointer">
                  Lancer l'impression silencieuse / automatique (si supporté)
                </label>
              </div>
            </div>
            <div className="bg-slate-50 px-5 py-3 border-t flex justify-end gap-2">
              <button
                onClick={() => setPrinterModalOpen(false)}
                className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-100 rounded-xl text-xs font-semibold text-slate-700 cursor-pointer"
              >
                Annuler
              </button>
              <button
                onClick={() => {
                  setPrinterSettings(tempPrinterSettings);
                  try {
                    localStorage.setItem(\`salfa_caisse_printer_\${cashierId}\`, JSON.stringify(tempPrinterSettings));
                  } catch (e) {}
                  setPrinterModalOpen(false);
                }}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-semibold cursor-pointer shadow-sm"
              >
                Enregistrer mes préférences
              </button>
            </div>
          </div>
        </div>
      )}
`;

code = code.replace('      {/* Notification rouge centrée', modalSnippet + '\n      {/* Notification rouge centrée');

fs.writeFileSync('src/components/ModuleCaisse.tsx', code);
console.log('ModuleCaisse updated successfully with cashier printer settings!');
