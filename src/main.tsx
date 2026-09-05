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

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>
);
