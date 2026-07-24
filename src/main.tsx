import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

/**
 * Démarre l'application de manière défensive.
 *
 * L'import dynamique permet d'afficher un message exploitable si le chargement
 * d'un module de l'application échoue (au lieu de laisser une page blanche).
 * C'est particulièrement utile après un déploiement où le cache du navigateur
 * peut encore contenir une ancienne version des fichiers.
 */
const rootElement = document.getElementById("root");

function showStartupError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "Erreur inconnue");
  const safeMessage = message.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character] || character);

  if (rootElement) {
    rootElement.innerHTML = `
      <main class="startup-error" role="alert">
        <div class="startup-error__icon" aria-hidden="true">⚠️</div>
        <h1>Impossible de démarrer l'application</h1>
        <p>Un problème est survenu pendant le chargement. Rechargez la page. Si le problème persiste après un déploiement, videz le cache du navigateur puis réessayez.</p>
        <p class="startup-error__detail">${safeMessage}</p>
        <button type="button" onclick="window.location.reload()">Recharger l'application</button>
      </main>`;
  }
  console.error("[startup] Échec du démarrage de l'application", error);
}

if (!rootElement) {
  console.error("[startup] L'élément #root est introuvable.");
} else {
  import("./App")
    .then(({ default: App }) => {
      createRoot(rootElement).render(
        <StrictMode>
          <App />
        </StrictMode>,
      );
    })
    .catch(showStartupError);
}
