try {
  let originalFetch = window.fetch;
  Object.defineProperty(window, 'fetch', {
    get: function() { return originalFetch; },
    set: function(val) { originalFetch = val; },
    configurable: true,
    enumerable: true
  });
} catch (e) {}

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { ThemeProvider } from "./context/ThemeContext";
import { IS_WAMP_BUILD } from "./wamp";

// Marqueur de build (support) : visible dans la console du navigateur (F12).
// WAMP/MySQL = données dans MySQL via wamp_deploy/api ; sinon IndexedDB locale.
console.info(
  `[SALFA] Mode de stockage : ${IS_WAMP_BUILD ? "WAMP / MySQL (wamp_deploy/api)" : "Navigateur (IndexedDB locale)"}`
);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>
);
