import { useEffect, useMemo, useRef, useState } from 'react';
import type { TicketSettings } from '../types';
import { INVOICE_HEADER_FONTS, MIN_HEADER_FONT_SIZE, MAX_HEADER_FONT_SIZE, headerTypography, sanitizeInvoiceHeader, INVOICE_HEADER_STYLE, escapeHeaderText } from '../utils/invoiceHeader';
import {
  Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight,
  Image as ImageIcon, Save, RotateCcw, Check, Eye, Info, Type, Eraser, Printer,
  ArrowUp, ArrowDown, Layers, Trash2, MousePointerClick, Maximize2,
} from 'lucide-react';

interface Props {
  settings: TicketSettings;
  updateTicket: (patch: Partial<TicketSettings>) => void;
  showToast: (msg: string) => void;
}

/* ------------------------------------------------------------------ */
/*  Utilitaires de manipulation des images (blocs `.entete-fig`)      */
/* ------------------------------------------------------------------ */

const FIG_TAG = 'data-entete-fig';

/** Identifiant unique pour chaque image insérée. */
const figId = () => 'fig-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/** Bloc image prêt à être inséré dans la zone (ligne propre = facile à déplacer). */
function figHtml(dataUrl: string): string {
  return `<div ${FIG_TAG} data-id="${figId()}" contenteditable="false" class="entete-fig"
    style="display:block;margin:4px auto;text-align:center;position:relative;user-select:none;">
      <img src="${escapeHeaderText(dataUrl)}" alt="image" draggable="false"
        style="max-width:140px;height:auto;max-height:90px;display:inline-block;vertical-align:middle;border-radius:4px;" />
    </div>`;
}

/** Renvoie le bloc image conteneur d'un élément donné (ou null). */
function figOf(node: Node | null): HTMLElement | null {
  if (!node) return null;
  const el = node instanceof Element ? node : (node.parentElement || null);
  if (!el) return null;
  return el.closest<HTMLElement>(`[${FIG_TAG}]`);
}

/** Prochain bloc-sibling (élément, hors <br> et blocs vides de texte) dans un sens donné. */
function nextBlockSibling(el: HTMLElement, forward: boolean): HTMLElement | null {
  const parent = el.parentElement;
  if (!parent) return null;
  let cur: HTMLElement | null = el;
  while ((cur = forward ? (cur.nextElementSibling as HTMLElement | null) : (cur.previousElementSibling as HTMLElement | null))) {
    if (cur.tagName === 'BR') continue;
    const hasContent = cur.querySelector('img') || (cur.textContent || '').trim().length > 0;
    if (hasContent) return cur;
  }
  return null;
}

/**
 * Éditeur de l'EN-TÊTE DES FACTURES (A4/A5) — indépendant de l'en-tête du ticket POS.
 * Zone de texte enrichie (gras / italique / souligné / alignement) dans laquelle
 * l'utilisateur peut insérer des images (logos), les DÉPLACER (monter/descendre,
 * aligner, glisser en arrière-plan) et les placer EN ARRIÈRE-PLAN (filigrane) du texte.
 */
export default function EnTeteFactureEditor({ settings, updateTicket, showToast }: Props) {
  const editorRef = useRef<HTMLDivElement>(null);
  const imgInputRef = useRef<HTMLInputElement>(null);
  const rangeRef = useRef<Range | null>(null);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [fontFamily, setFontFamily] = useState(headerTypography(settings).font);
  const [fontSize, setFontSize] = useState(headerTypography(settings).size);
  const typography = headerTypography({ invoiceHeaderFontFamily: fontFamily, invoiceHeaderFontSize: fontSize });
  const typographyStyle = { '--invoice-header-font': `'${typography.font}'`, '--invoice-header-size': `${typography.size}pt` } as React.CSSProperties;
  const [editorKey, setEditorKey] = useState(0);
  // Image actuellement sélectionnée (par data-id) → permet d'afficher la barre d'outils image.
  const [selId, setSelId] = useState<string | null>(null);
  // Incrémenté à chaque frappe / modification pour rafraîchir l'aperçu en direct.
  const [ver, setVer] = useState(0);
  const dragState = useRef<{ x: number; y: number; dx: number; dy: number; el: HTMLElement } | null>(null);

  const hasCustom = !!settings.customInvoiceHeader && !!(settings.invoiceHeaderHtml || '').trim();

  // Modèle à afficher dans la zone : l'en-tête déjà sauvegardé, sinon un modèle.
  const starter = useMemo(() => buildStarterHtml(settings), [settings]);

  // Ré-initialise la zone à chaque nouvelle clef (modèle chargé / désactivé).
  useEffect(() => {
    if (!editorRef.current) return;
    const seed = hasCustom ? settings.invoiceHeaderHtml || '' : starter;
    editorRef.current.innerHTML = sanitizeInvoiceHeader(seed || starter);
    setSelId(null);
  }, [editorKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const current = (): HTMLElement | null => editorRef.current;

  /** Image sélectionnée actuellement. */
  const selectedFig = (): HTMLElement | null => {
    const el = current();
    if (!el || !selId) return null;
    return el.querySelector<HTMLElement>(`[${FIG_TAG}][data-id="${selId}"]`);
  };

  const isBg = (el: HTMLElement | null) => !!el?.classList.contains('entete-bg');

  const rememberRange = () => {
    const sel = window.getSelection?.();
    if (!sel || sel.rangeCount === 0) return;
    const node = editorRef.current;
    if (node && node.contains(sel.anchorNode)) rangeRef.current = sel.getRangeAt(0).cloneRange();
  };

  const focusEditor = () => {
    editorRef.current?.focus();
    if (rangeRef.current) {
      const sel = window.getSelection();
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(rangeRef.current);
      }
    }
  };

  const exec = (command: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false);
    editorRef.current?.focus();
  };

  // Nettoie l'état de sélection après action du clavier / clic hors image.
  const refreshSelection = () => {
    const el = selectedFig();
    current()?.querySelectorAll(`[${FIG_TAG}].entete-sel`).forEach((n) => n.classList.remove('entete-sel'));
    if (el) el.classList.add('entete-sel');
  };

  /** Clic dans l'éditeur : sélectionne l'image cliquée sinon dé-sélectionne. */
  const handleEditorClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const t = e.target as Element;
    const fig = figOf(t);
    if (fig) {
      e.preventDefault();
      setSelId(fig.getAttribute('data-id'));
      requestAnimationFrame(refreshSelection);
    } else if (!(t as Element).closest?.('.entete-fig')) {
      setSelId(null);
      requestAnimationFrame(refreshSelection);
    }
  };

  /* ---- Opérations image ---- */

  const handleImageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const dataUrl = await processImage(file);
      focusEditor();
      document.execCommand('insertHTML', false, figHtml(dataUrl) + '<div>&nbsp;</div>');
      editorRef.current?.focus();
      rememberRange();
      showToast('Image ajoutée à l\'en-tête — cliquez dessus pour la déplacer / la passer en arrière-plan.');
    } catch (err) {
      showToast('⚠️ ' + (err as Error).message);
    }
  };

  /** Déplace verticalement le bloc image parmi les lignes de l'en-tête. */
  const moveFig = (dir: -1 | 1) => {
    const el = selectedFig();
    if (!el || isBg(el)) return;
    const parent = el.parentElement;
    if (!parent) return;
    const target = nextBlockSibling(el, dir === 1);
    if (!target) { showToast(dir === -1 ? 'Déjà en haut de l\'en-tête' : 'Déjà en bas de l\'en-tête'); return; }
    if (dir === -1) parent.insertBefore(el, target);
    else if (target.nextSibling) parent.insertBefore(el, target.nextSibling);
    else parent.appendChild(el);
    focusEditor();
    refreshSelection();
    setVer((v) => v + 1);
    showToast('Image déplacée');
  };

  /** Aligne l'image (gauche / centre / droite) dans sa ligne. */
  const alignFig = (align: 'left' | 'center' | 'right') => {
    const el = selectedFig();
    if (!el || isBg(el)) return;
    el.style.textAlign = align;
    refreshSelection();
    setVer((v) => v + 1);
  };

  /** Met l'image en arrière-plan (filigrane derrière le texte) ou la remet au premier plan. */
  const toggleBg = () => {
    const el = selectedFig();
    if (!el) return;
    const wasBg = isBg(el);
    if (wasBg) {
      el.classList.remove('entete-bg', 'entete-sel');
      el.style.position = 'relative';
      el.style.cssFloat = '';
      el.style.transform = '';
      el.style.zIndex = '';
      el.style.opacity = '';
      const img = el.querySelector('img');
      if (img) { img.style.maxWidth = '140px'; img.style.maxHeight = '90px'; img.style.opacity = '1'; }
      setSelId(null);
      setVer((v) => v + 1);
      showToast('Image remise au premier plan (texte devant)');
    } else {
      el.classList.add('entete-bg', 'entete-sel');
      el.style.position = 'absolute';
      el.style.cssFloat = '';
      el.style.transform = 'translate(-50%, -50%)';
      el.style.zIndex = '-1';
      el.dataset.dx = '0';
      el.dataset.dy = '0';
      el.style.left = '50%';
      el.style.top = '50%';
      const img = el.querySelector('img');
      if (img) { img.style.maxWidth = '70%'; img.style.maxHeight = '140px'; img.style.opacity = '0.25'; }
      setVer((v) => v + 1);
      showToast('Image placée en arrière-plan — glissez-la pour la repositionner');
    }
    refreshSelection();
  };

  const removeFig = () => {
    const el = selectedFig();
    if (!el) return;
    el.remove();
    setSelId(null);
    refreshSelection();
    setVer((v) => v + 1);
    showToast('Image supprimée de l\'en-tête');
  };

  /* --- Déplacement à la souris d'une image d'arrière-plan (filigrane) --- */
  const startBgDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = figOf(e.target as Element);
    if (!el || !isBg(el)) return;
    e.preventDefault();
    const dx = parseFloat(el.dataset.dx || '0');
    const dy = parseFloat(el.dataset.dy || '0');
    dragState.current = { x: e.clientX, y: e.clientY, dx, dy, el };
    const onMove = (ev: PointerEvent) => {
      const s = dragState.current;
      if (!s) return;
      const ndx = s.dx + (ev.clientX - s.x);
      const ndy = s.dy + (ev.clientY - s.y);
      s.dx = ndx; s.dy = ndy; s.x = ev.clientX; s.y = ev.clientY;
      s.el.dataset.dx = String(ndx);
      s.el.dataset.dy = String(ndy);
      s.el.style.transform = `translate(calc(-50% + ${ndx}px), calc(-50% + ${ndy}px))`;
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      dragState.current = null;
      refreshSelection();
      setVer((v) => v + 1);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  /* ---- Boutons généraux ---- */
  const save = () => {
    const html = sanitizeInvoiceHeader(current()?.innerHTML?.trim() || '');
    if (!html) { showToast('⚠️ L\'en-tête est vide. Saisissez du texte ou insérez une image.'); return; }
    updateTicket({ customInvoiceHeader: true, invoiceHeaderHtml: html, invoiceHeaderFontFamily: typography.font, invoiceHeaderFontSize: typography.size });
    showToast('✅ En-tête de facture personnalisé enregistré');
  };

  const disable = () => {
    updateTicket({ customInvoiceHeader: false });
    showToast('En-tête par défaut rétabli (les factures réutilisent l\'en-tête officiel)');
  };

  const loadStarter = () => {
    if (editorRef.current) editorRef.current.innerHTML = sanitizeInvoiceHeader(starter);
    setSelId(null);
    rangeRef.current = null;
    setVer(v => v + 1);
    showToast('Modèle chargé dans la zone d\'édition');
  };

  const clearAll = () => {
    if (editorRef.current) editorRef.current.innerHTML = '';
    setSelId(null);
    editorRef.current?.focus();
    refreshSelection();
    setVer(v => v + 1);
  };

  const previewContent = sanitizeInvoiceHeader(current()?.innerHTML || '');

  const sel = selectedFig();
  const selIsBg = isBg(sel);

  const toolbarBtn = 'px-2 py-1 rounded-md hover:bg-surface-hover border border-transparent cursor-pointer text-ink-strong flex items-center gap-1';
  const imgFileBtn = `px-2 py-1 rounded-md cursor-pointer bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1.5 text-xs font-semibold`;

  return (
    <div className="space-y-6 max-w-5xl">
      <style>{INVOICE_HEADER_STYLE}</style>
      {/* En-tête de la section */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-bold text-ink-strong text-xl flex items-center gap-2.5">
            <Type className="w-6 h-6 text-indigo-600 dark:text-indigo-400" /> En-tête des Factures (A4/A5)
          </h3>
          <p className="text-xs text-ink-muted mt-0.5 max-w-2xl">
            Personnalisez l'en-tête <strong className="text-ink">uniquement des FACTURES</strong> imprimées (facture
            individuelle A5 et facture société A4, y compris dans le module Facturation). Le <strong className="text-ink">ticket POS (58/80 mm) n'est pas concerné</strong> :
            il conserve son propre en-tête réglé dans « Tickets POS &amp; Format ». Texte libre modifiable + images
            <strong> déplaçables</strong> et pouvant être mises en <strong>arrière-plan</strong>.
          </p>
        </div>
        <div className={`px-3 py-1.5 rounded-full text-xs font-bold border ${
          hasCustom ? 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-500/30'
            : 'bg-surface-hover text-ink-muted border-line'
        }`}>
          {hasCustom ? '● En-tête personnalisé actif' : '○ En-tête officiel par défaut'}
        </div>
      </div>

      {/* Bandeau d'aide */}
      <div className="flex gap-2.5 p-3.5 bg-indigo-50/70 dark:bg-indigo-500/6 border border-indigo-200 dark:border-indigo-500/25 rounded-2xl text-xs text-indigo-900 dark:text-indigo-300 leading-relaxed">
        <Info className="w-4 h-4 shrink-0 mt-0.5 text-indigo-500 dark:text-indigo-400" />
        <span>
          <strong>Cliquez sur une image</strong> pour la sélectionner : une barre d'outils apparaît pour la
          <strong> déplacer</strong> (monter / descendre, aligner à gauche / centre / droite) et la
          <strong> mettre en arrière-plan</strong> (filigrane derrière le texte). Une image d'arrière-plan peut être
          <strong> glissée à la souris</strong> pour être repositionnée. Le tout est reproduit à l'impression de la facture.
        </span>
      </div>

      {/* Barre d'outils + éditeur */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-start">
        {/* Colonne édition */}
        <div className="lg:col-span-3 rounded-2xl border border-line bg-surface shadow-xs overflow-hidden">
          {/* Barre de formatage texte + insertion image */}
          <div className="px-3 py-2 border-b border-line flex flex-wrap items-center gap-1 bg-surface-muted/50">
            <button type="button" title="Gras" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('bold')} className={toolbarBtn}>
              <Bold className="w-4 h-4" />
            </button>
            <button type="button" title="Italique" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('italic')} className={toolbarBtn}>
              <Italic className="w-4 h-4" />
            </button>
            <button type="button" title="Souligné" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('underline')} className={toolbarBtn}>
              <Underline className="w-4 h-4" />
            </button>
            <span className="w-px h-5 bg-line mx-1" />
            <button type="button" title="Aligner le texte à gauche" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('justifyLeft')} className={toolbarBtn}>
              <AlignLeft className="w-4 h-4" />
            </button>
            <button type="button" title="Centrer le texte" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('justifyCenter')} className={toolbarBtn}>
              <AlignCenter className="w-4 h-4" />
            </button>
            <button type="button" title="Aligner le texte à droite" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('justifyRight')} className={toolbarBtn}>
              <AlignRight className="w-4 h-4" />
            </button>
            <button type="button" title="Retirer le formatage de la sélection" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('removeFormat')} className={toolbarBtn}>
              <Eraser className="w-4 h-4" />
            </button>
            <span className="w-px h-5 bg-line mx-1" />
            <button type="button" className={imgFileBtn} onMouseDown={(e) => e.preventDefault()} onClick={() => imgInputRef.current?.click()}>
              <ImageIcon className="w-4 h-4" /> Ajouter une image
            </button>
            <input ref={imgInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageFile} />
          </div>

          <div className="px-3 py-2 border-b border-line flex flex-wrap items-center gap-2 bg-surface-muted/50">
            <label className="text-xs text-ink">Police de l’en-tête
              <select aria-label="Police de l’en-tête" value={fontFamily} onChange={e => setFontFamily(e.target.value as typeof fontFamily)} className="ml-2 rounded border border-line bg-field px-2 py-1">
                {INVOICE_HEADER_FONTS.map(font => <option key={font} value={font}>{font}</option>)}
              </select>
            </label>
            <button type="button" aria-label="Diminuer la taille de police de l’en-tête" disabled={typography.size <= MIN_HEADER_FONT_SIZE} onClick={() => setFontSize(Math.max(MIN_HEADER_FONT_SIZE, typography.size - 1))} className={toolbarBtn}>A−</button>
            <label className="text-xs text-ink">Taille (pt)
              <input aria-label="Taille de police de l’en-tête" type="number" min={MIN_HEADER_FONT_SIZE} max={MAX_HEADER_FONT_SIZE} step={1} value={fontSize} onChange={e => setFontSize(e.target.value === '' ? 10 : Number(e.target.value))} onBlur={() => setFontSize(typography.size)} className="ml-1 w-16 rounded border border-line bg-field px-2 py-1" />
            </label>
            <button type="button" aria-label="Augmenter la taille de police de l’en-tête" disabled={typography.size >= MAX_HEADER_FONT_SIZE} onClick={() => setFontSize(Math.min(MAX_HEADER_FONT_SIZE, typography.size + 1))} className={toolbarBtn}>A+</button>
            <p className="basis-full text-[11px] text-ink-muted">Ces réglages s’appliquent à toute la zone de texte de l’en-tête, pas au corps de la facture. Enregistrez pour les appliquer aux impressions et réimpressions.</p>
          </div>

          {/* Barre image : visible quand une image est sélectionnée */}
          {sel && (
            <div className="px-3 py-2 border-b border-indigo-200 dark:border-indigo-500/25 bg-indigo-50/60 dark:bg-indigo-500/8 flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-bold text-indigo-900 dark:text-indigo-300 uppercase tracking-wider mr-1 flex items-center gap-1">
                <MousePointerClick className="w-3.5 h-3.5" /> Image sélectionnée
              </span>
              {!selIsBg ? (
                <>
                  <button type="button" onClick={() => moveFig(-1)} title="Monter l'image"
                    className="px-2 py-1 rounded-md bg-surface hover:bg-surface-hover border border-line text-ink text-xs font-semibold cursor-pointer flex items-center gap-1">
                    <ArrowUp className="w-3.5 h-3.5" /> Monter
                  </button>
                  <button type="button" onClick={() => moveFig(1)} title="Descendre l'image"
                    className="px-2 py-1 rounded-md bg-surface hover:bg-surface-hover border border-line text-ink text-xs font-semibold cursor-pointer flex items-center gap-1">
                    <ArrowDown className="w-3.5 h-3.5" /> Descendre
                  </button>
                  <span className="w-px h-5 bg-indigo-200 dark:bg-indigo-500/30 mx-1" />
                  <button type="button" onClick={() => alignFig('left')} title="Aligner à gauche"
                    className="p-1.5 rounded-md bg-surface hover:bg-surface-hover border border-line text-ink cursor-pointer"><AlignLeft className="w-3.5 h-3.5" /></button>
                  <button type="button" onClick={() => alignFig('center')} title="Centrer"
                    className="p-1.5 rounded-md bg-surface hover:bg-surface-hover border border-line text-ink cursor-pointer"><AlignCenter className="w-3.5 h-3.5" /></button>
                  <button type="button" onClick={() => alignFig('right')} title="Aligner à droite"
                    className="p-1.5 rounded-md bg-surface hover:bg-surface-hover border border-line text-ink cursor-pointer"><AlignRight className="w-3.5 h-3.5" /></button>
                </>
              ) : (
                <span className="text-[11px] text-indigo-700 dark:text-indigo-300 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5" /> Image en arrière-plan — <strong>glissez-la</strong> pour la déplacer dans la zone.
                </span>
              )}
              <span className="flex-1" />
              <button type="button" onClick={toggleBg} title={selIsBg ? 'Remettre l\'image devant le texte' : 'Placer l\'image derrière le texte (filigrane)'}
                className={`px-2.5 py-1.5 rounded-md text-xs font-semibold cursor-pointer flex items-center gap-1.5 border ${
                  selIsBg
                    ? 'bg-amber-100 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-500/30 hover:bg-amber-200 dark:hover:bg-amber-500/25'
                    : 'bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-600'
                }`}>
                <Layers className="w-3.5 h-3.5" /> {selIsBg ? 'Remettre au premier plan' : 'Mettre en arrière-plan'}
              </button>
              <button type="button" onClick={removeFig} title="Supprimer l'image"
                className="px-2 py-1.5 rounded-md bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer flex items-center gap-1">
                <Trash2 className="w-3.5 h-3.5" /> Supprimer
              </button>
            </div>
          )}

          {/* Zone éditable */}
          <div
            key={editorKey}
            ref={editorRef}
            contentEditable
            role="textbox"
            aria-label="Texte de l’en-tête des factures"
            aria-multiline="true"
            suppressContentEditableWarning
            onSelect={rememberRange}
            onKeyUp={(e) => { rememberRange(); setVer((v) => v + 1); if (e.key === 'Escape') { setSelId(null); refreshSelection(); } }}
            onInput={() => setVer((v) => v + 1)}
            onPaste={event => {
              event.preventDefault();
              const html = event.clipboardData.getData('text/html') || escapeHeaderText(event.clipboardData.getData('text/plain')).replace(/\n/g, '<br>');
              document.execCommand('insertHTML', false, sanitizeInvoiceHeader(html));
              rememberRange(); setVer(v => v + 1);
            }}
            onMouseUp={rememberRange}
            onClick={handleEditorClick}
            onPointerDown={startBgDrag}
            data-placeholder="Saisissez ici le texte de l'en-tête de votre facture…"
            className="invoice-header-content relative z-10 min-h-[240px] px-4 py-4 outline-none leading-relaxed text-ink-strong"
            style={{ ...typographyStyle, position: 'relative', zIndex: 1 }}
            spellCheck
          />

          <div className="border-t border-line px-3 py-1.5 bg-surface-muted/40 text-[10px] text-ink-muted flex flex-wrap gap-x-4 gap-y-1">
            <span>Commencez par charger un modèle puis ajustez texte et images (clic sur une image = outils de déplacement / arrière-plan).</span>
          </div>
        </div>

        {/* Colonne actions + aperçu */}
        <div className="lg:col-span-2 space-y-3">
          <div className="rounded-2xl border border-line bg-surface p-3.5 shadow-xs space-y-2.5">
            <div className="text-xs font-bold text-ink-strong flex items-center justify-between">
              <span className="flex items-center gap-1.5"><Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> Actions</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={loadStarter} className="col-span-2 px-3 py-2 rounded-xl bg-surface-hover hover:bg-surface-active text-ink text-xs font-semibold cursor-pointer flex items-center justify-center gap-1.5 border border-line">
                <RotateCcw className="w-3.5 h-3.5" /> Charger un modèle
              </button>
              <button onClick={clearAll} className="px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-500/8 text-rose-700 dark:text-rose-300 text-xs font-semibold cursor-pointer hover:bg-rose-100 dark:hover:bg-rose-500/15 flex items-center justify-center gap-1.5">
                <Eraser className="w-3.5 h-3.5" /> Vider
              </button>
              <button onClick={() => setPreviewOpen((p) => !p)} className="px-3 py-2 rounded-xl bg-slate-800 text-white text-xs font-semibold cursor-pointer hover:bg-slate-700 flex items-center justify-center gap-1.5">
                <Eye className="w-3.5 h-3.5" /> {previewOpen ? 'Masquer' : 'Aperçu'}
              </button>
              <button onClick={save} className="col-span-2 px-3 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer shadow-md flex items-center justify-center gap-1.5">
                <Save className="w-4 h-4" /> Enregistrer l'en-tête de facture
              </button>
              {hasCustom && (
                <button onClick={disable} className="col-span-2 px-3 py-2 rounded-xl bg-surface-muted hover:bg-surface-active text-ink-secondary text-xs font-semibold cursor-pointer border border-line flex items-center justify-center gap-1.5">
                  <Printer className="w-3.5 h-3.5" /> Revenir à l'en-tête par défaut
                </button>
              )}
            </div>
            <p className="text-[10px] text-ink-muted leading-snug">
              Cliquez « Enregistrer » pour appliquer l'en-tête personnalisé à toutes les factures imprimées. Pour la désactiver,
              utilisez « Revenir à l'en-tête par défaut ».
            </p>
          </div>

          {/* Aperçu */}
          {previewOpen && (
            <div className="rounded-2xl border-2 border-line-strong bg-white p-4 shadow-md">
              <div className="text-[10px] uppercase tracking-wide font-bold text-ink-muted mb-2 flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5" /> Aperçu de l'en-tête de facture
              </div>
              <div className="min-h-[150px] border-b-2 border-black pb-3 relative" style={{ fontFamily: 'Arial, Helvetica, sans-serif', position: 'relative' }}>
                <div className="invoice-header-content text-center relative z-10" style={typographyStyle} data-testid="invoice-header-preview" dangerouslySetInnerHTML={{ __html: previewContent || '<span class="text-ink-faint" style="color:#999;">Aucun contenu — saisissez ou chargez un modèle.</span>' }} />
              </div>
              <div className="pt-2 text-[10px] text-ink-muted text-center flex items-center justify-center gap-1">
                <Maximize2 className="w-3 h-3" /> Format d'impression A5 / A4 — l'image d'arrière-plan apparaît derrière le texte
              </div>
            </div>
          )}

          {/* Petit rappel des manipulations possibles */}
          <div className="rounded-2xl border border-line bg-surface-muted/40 p-3 text-[11px] text-ink-secondary leading-relaxed space-y-1">
            <div className="font-bold text-ink-strong text-xs flex items-center gap-1.5"><Layers className="w-3.5 h-3.5 text-indigo-500" /> Déplacer / Arrière-plan des images</div>
            <ul className="list-disc pl-4 space-y-0.5">
              <li><strong>Cliquer</strong> sur une image la sélectionne (outils affichés au-dessus).</li>
              <li><strong>Monter / Descendre</strong> : réorganise l'image dans l'en-tête.</li>
              <li><strong>Aligner</strong> : gauche / centre / droite dans la ligne.</li>
              <li><strong>Mettre en arrière-plan</strong> : image derrière le texte (filigrane), puis <strong>glissez-la</strong> pour la repositionner.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Helpers partagés (hors composant)                                 */
/* ------------------------------------------------------------------ */

/** Construit un modèle d'en-tête prêt à éditer (texte libre + logo image facultatif). */
function buildStarterHtml(s: TicketSettings): string {
  const lines: string[] = [];
  const mainName = escapeHeaderText(s.facilityName || 'NOM DE L\'ÉTABLISSEMENT');
  if (s.logoUrl && s.logoUrl.length > 5) {
    lines.push(figHtml(s.logoUrl));
  } else if (s.secondLogoUrl && s.secondLogoUrl.length > 5) {
    lines.push(figHtml(s.secondLogoUrl));
  }
  if (s.email || s.website) lines.push(`<div style="font-size:10px;">${[s.email, s.website].filter(Boolean).map(escapeHeaderText).join(' · ')}</div>`);
  return `<div style="text-align:center;">${lines.join('')}
  <div><strong>${mainName}</strong></div>
  ${s.address ? `<div style="font-size:11px;">${escapeHeaderText(s.address)}</div>` : ''}
  ${s.phone ? `<div style="font-size:11px;">Tél. : ${escapeHeaderText(s.phone)}</div>` : ''}
  ${s.nif ? `<div style="font-size:11px;">NIF : ${escapeHeaderText(s.nif)}</div>` : ''}
</div>`;
}

/** Redimensionne + compresse l'image choisie et retourne une data-URL réutilisable à l'impression. */
function processImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!/^image\/(png|jpe?g|webp|gif|bmp)/i.test(file.type)) {
      reject(new Error('Fichier non image'));
      return;
    }
    if (file.size > 4 * 1024 * 1024) { reject(new Error('Image trop volumineuse (maximum 4 Mo)')); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const MAXW = 600;
        const scale = Math.min(1, MAXW / (img.width || MAXW));
        const w = Math.max(1, Math.round((img.width || MAXW) * scale));
        const h = Math.max(1, Math.round((img.height || 1) * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('Impossible de traiter l\'image')); return; }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        const png = file.type === 'image/png' || /png|webp|gif/.test(file.type);
        resolve(canvas.toDataURL(png ? 'image/png' : 'image/jpeg', 0.9));
      };
      img.onerror = () => reject(new Error('Image illisible'));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error('Erreur de lecture du fichier'));
    reader.readAsDataURL(file);
  });
}
