import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './lib/theme'
import './index.css'
import App from './App.tsx'
import { reportError } from './lib/reportError.ts'

if (typeof window !== "undefined") {
  window.addEventListener("unhandledrejection", (event) => {
    reportError(event.reason, { type: "unhandledrejection" });
  });
}

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("ServiceWorker registration failed:", err);
    });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
