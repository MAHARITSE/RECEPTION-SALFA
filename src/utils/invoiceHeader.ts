import DOMPurify from 'dompurify';
import type { TicketSettings } from '../types';

export const INVOICE_HEADER_FONTS = ['Arial', 'Helvetica', 'Times New Roman', 'Georgia', 'Verdana', 'Tahoma', 'Courier New'] as const;
export const MIN_HEADER_FONT_SIZE = 6;
export const MAX_HEADER_FONT_SIZE = 36;
export const escapeHeaderText = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
export function headerTypography(settings: Pick<TicketSettings, 'invoiceHeaderFontFamily' | 'invoiceHeaderFontSize'>) {
  const font = INVOICE_HEADER_FONTS.find(f => f === settings.invoiceHeaderFontFamily) || 'Arial';
  const value = settings.invoiceHeaderFontSize;
  const size = typeof value === 'number' && Number.isFinite(value) ? Math.max(MIN_HEADER_FONT_SIZE, Math.min(MAX_HEADER_FONT_SIZE, value)) : 10;
  return { font, size };
}

/** Preserve the editor's text, figures and watermarks, but never executable
 * markup, global style sheets or external CSS. Used on save and before display. */
export function sanitizeInvoiceHeader(html: string): string {
  if (!DOMPurify.isSupported || typeof document === 'undefined') return escapeHeaderText(html);
  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['div', 'p', 'br', 'span', 'strong', 'b', 'i', 'em', 'u', 's', 'font', 'img', 'h1', 'h2', 'h3', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'th', 'td'],
    ALLOWED_ATTR: ['style', 'class', 'src', 'alt', 'width', 'height', 'align', 'color', 'face', 'size', 'colspan', 'rowspan', 'contenteditable', 'draggable'],
    ALLOW_DATA_ATTR: true,
  });
  const container = document.createElement('div');
  container.innerHTML = clean;
  const allowedStyles = new Set(['display', 'position', 'text-align', 'vertical-align', 'font-family', 'font-size', 'font-weight', 'font-style', 'text-decoration', 'line-height', 'color', 'background-color', 'width', 'max-width', 'height', 'max-height', 'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'left', 'top', 'right', 'bottom', 'opacity', 'transform', 'z-index', 'border', 'border-radius', 'user-select']);
  container.querySelectorAll<HTMLElement>('*').forEach(el => {
    for (const property of Array.from(el.style)) {
      const value = el.style.getPropertyValue(property);
      if (!allowedStyles.has(property) || /url\s*\(|expression\s*\(|@import/i.test(value) || (property === 'position' && value === 'fixed')) el.style.removeProperty(property);
    }
    el.classList.remove('entete-sel');
    if (el.tagName === 'IMG') {
      const src = el.getAttribute('src') || '';
      if (!(/^(?:https?:\/\/|data:image\/(?:png|jpeg|jpg|gif|webp|bmp);base64,)/i.test(src) || (!!src && !/[:\\]/.test(src) && !src.startsWith('//')))) el.removeAttribute('src');
    }
  });
  return container.innerHTML;
}

/** Shared by Administration preview, individual A5 and company A4 invoices.
 * Descendant typography overrides pasted sizes, but not bold/italic/alignment. */
export const INVOICE_HEADER_STYLE = `
.invoice-header{display:block;position:relative;isolation:isolate;break-inside:avoid;margin:0 0 5mm;padding:0 0 3mm;border-bottom:1px solid #000;color:#000;overflow:hidden}
.invoice-header-content{position:relative;z-index:1;text-align:center;line-height:1.3}
.invoice-header-content,.invoice-header-content *{font-family:var(--invoice-header-font,Arial),sans-serif!important;font-size:var(--invoice-header-size,10pt)!important}
.invoice-header-content p,.invoice-header-content h1,.invoice-header-content h2,.invoice-header-content h3{margin:0;line-height:inherit}
.invoice-header-content table{width:100%;border-collapse:collapse;table-layout:auto}
.invoice-header-content td,.invoice-header-content th{border:0;padding:0}
.invoice-header-content img{max-width:100%;max-height:110px;height:auto;display:inline-block}
.invoice-header-content [data-entete-fig]{position:relative}
.invoice-header-content [data-entete-fig].entete-bg{position:absolute!important}
.invoice-header-content .entete-bg img{max-height:160px}
`;

export function invoiceHeaderMarkup(settings: TicketSettings): string {
  const { font, size } = headerTypography(settings);
  const content = settings.customInvoiceHeader && settings.invoiceHeaderHtml?.trim()
    ? sanitizeInvoiceHeader(settings.invoiceHeaderHtml)
    : `<div><strong>${escapeHeaderText(settings.facilityName)}</strong></div>${[settings.address, settings.phone ? `Tél. : ${settings.phone}` : '', settings.nif ? `NIF : ${settings.nif}` : '', settings.email || ''].filter(Boolean).map(line => `<div>${escapeHeaderText(line)}</div>`).join('')}`;
  return `<div class="invoice-header" style="--invoice-header-font:'${font}';--invoice-header-size:${size}pt"><div class="invoice-header-content">${content}</div></div>`;
}
