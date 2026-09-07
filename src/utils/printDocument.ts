interface PrintJob {
  html: string;
  title: string;
}

export const PRINT_ERROR_EVENT = 'salfa:print-error';

const jobs: PrintJob[] = [];
let processing = false;

/**
 * Une seule boîte d'impression à la fois, y compris pour les exemplaires et les
 * factures A4/A5. Un délai fixe entre deux print() ne suffit pas : l'utilisateur
 * peut laisser la première boîte ouverte plusieurs minutes.
 */
export function printDocument(html: string, title: string, copies = 1): void {
  const count = Number.isFinite(Number(copies)) ? Math.max(1, Math.min(5, Math.floor(Number(copies)))) : 1;
  for (let i = 0; i < count; i++) jobs.push({ html, title });
  void processJobs();
}

async function processJobs(): Promise<void> {
  if (processing) return;
  processing = true;
  try {
    while (jobs.length) {
      const job = jobs.shift()!;
      try {
        await printInFrame(job);
      } catch (error) {
        console.error('[Impression]', job.title, error);
        // Une alerte dans l'application fonctionne aussi dans les aperçus où
        // print() ET window.alert() sont interdits par le navigateur.
        window.dispatchEvent(new CustomEvent(PRINT_ERROR_EVENT, { detail: { title: job.title } }));
      }
    }
  } finally {
    processing = false;
  }
}

function printInFrame(job: PrintJob): Promise<void> {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement('iframe');
    iframe.dataset.salfaPrint = 'true';
    iframe.title = job.title;
    iframe.setAttribute('aria-hidden', 'true');
    iframe.tabIndex = -1;
    // Hors écran, mais PAS display:none / visibility:hidden / 0 × 0 : certains
    // navigateurs ne mettent pas correctement en page ces cadres pour imprimer.
    iframe.style.cssText = 'position:fixed;left:-10000px;top:0;width:1024px;height:768px;border:0;pointer-events:none;';

    let finished = false;
    let loaded = false;
    let printStarted = false;
    let startTimer: ReturnType<typeof setTimeout> | undefined;
    let fontTimer: ReturnType<typeof setTimeout> | undefined;
    let media: MediaQueryList | undefined;
    let win: Window | null = null;

    const cleanup = () => {
      clearTimeout(loadTimer);
      clearTimeout(startTimer);
      clearTimeout(fontTimer);
      iframe.onload = null;
      win?.removeEventListener('beforeprint', beforePrint);
      win?.removeEventListener('afterprint', afterPrint);
      media?.removeEventListener('change', mediaChanged);
      iframe.remove();
    };
    const fail = (error: unknown) => {
      if (finished) return;
      finished = true;
      cleanup();
      reject(error);
    };
    const beforePrint = () => {
      printStarted = true;
      clearTimeout(startTimer);
    };
    const afterPrint = () => {
      if (finished) return;
      finished = true;
      // Laisser le navigateur terminer son événement avant de retirer le cadre
      // et d'ouvrir le document suivant (notamment sous Firefox).
      setTimeout(() => { cleanup(); resolve(); }, 0);
    };
    const mediaChanged = (event: MediaQueryListEvent) => {
      if (event.matches) beforePrint();
      else if (printStarted) afterPrint();
    };
    // Limiter uniquement le CHARGEMENT, jamais la durée de la boîte native :
    // retirer le cadre après 45 secondes pouvait interrompre une impression.
    const loadTimer = setTimeout(() => fail(new Error('Chargement du document trop long.')), 15000);

    iframe.onload = async () => {
      if (loaded || finished) return;
      win = iframe.contentWindow;
      const doc = iframe.contentDocument;
      if (!win || !doc) { fail(new Error('Document inaccessible.')); return; }
      // Ignorer un éventuel premier événement about:blank.
      if (doc.URL === 'about:blank') return;
      if (!doc.body) { fail(new Error('Document vide.')); return; }
      loaded = true;
      clearTimeout(loadTimer);
      try {
        // Les images sont chargées au onload ; attendre aussi les polices, avec
        // un repli borné vers les polices système si une police distante bloque.
        if (doc.fonts) {
          await Promise.race([
            doc.fonts.ready,
            new Promise<void>((done) => { fontTimer = setTimeout(done, 1500); }),
          ]);
          clearTimeout(fontTimer);
        }
        if (finished) return;
        const style = doc.createElement('style');
        style.textContent = 'html { color-scheme: light; background: #fff; } body { background: #fff; }';
        doc.head.appendChild(style);

        // Installer les événements AVANT print(), qui peut être bloquant ou non.
        win.addEventListener('beforeprint', beforePrint);
        win.addEventListener('afterprint', afterPrint);
        media = win.matchMedia('print');
        media.addEventListener('change', mediaChanged);
        startTimer = setTimeout(() => {
          if (!printStarted && !finished) fail(new Error("Impression bloquée par le navigateur."));
        }, 1500);
        win.focus();
        // Le navigateur décide d'afficher sa boîte native. Une impression
        // réellement silencieuse nécessite une configuration kiosk côté poste.
        win.print();
      } catch (error) {
        fail(error);
      }
    };

    // Les documents n'embarquent plus de script print() concurrent.
    iframe.srcdoc = job.html;
    document.body.appendChild(iframe);
  });
}
