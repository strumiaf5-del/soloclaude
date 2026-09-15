// ============================================================
// 00-bootstrap.js — helpers globales mínimos que antes vivían
// como <script> inline en index.html.
//
// BUGFIX (CSP): el servidor sirve con
// "Content-Security-Policy: script-src 'self' https://cdnjs.cloudflare.com",
// que bloquea cualquier <script> inline sin nonce/hash. Los dos bloques
// inline que tenía index.html (el helper API() y el fix de zoom táctil en
// mobile) se movieron acá — 'self' sí permite archivos .js servidos por el
// mismo origen.
// ============================================================

// API URL — delega siempre en el cliente API canónico.
const API = () => {
  if (typeof window.LGMDM?.api?.apiBase === 'function') {
    return window.LGMDM.api.apiBase();
  }
  return 'https://masteringstudio-api.duckdns.org';
};

// Prevenir zoom por doble-tap en mobile.
(function () {
  let lastTouchEnd = 0;
  document.addEventListener(
    "touchend",
    (e) => {
      const now = Date.now();
      if (now - lastTouchEnd <= 300) {
        e.preventDefault();
      }
      lastTouchEnd = now;
    },
    false
  );

  // Reajustar el viewport al rotar el dispositivo.
  window.addEventListener("orientationchange", () => {
    setTimeout(() => {
      window.scrollTo(0, 0);
    }, 100);
  });
})();
