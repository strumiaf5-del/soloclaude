// ============================================================
// 00-library-service.js — único dueño de uploads persistentes locales
// No renderiza selector ni modal: reference-library-picker es el dueño de la selección.
// ============================================================
(function (global) {
  "use strict";
  const LG = global.LGMDM = global.LGMDM || {};
  const service = LG.library = LG.library || {};
  service.saveLocalFile = async function saveLocalFile(file, options = {}) {
    if (!(file instanceof File)) throw new TypeError('saveLocalFile requiere un File');
    const form = new FormData();
    form.append('file', file);
    const response = await LG.api.apiFetch(`${LG.api.apiBase()}/library/upload`, { method: 'POST', body: form });
    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    const payload = await response.json().catch(() => ({}));
    global.dispatchEvent(new CustomEvent('lgmdm:library-updated', { detail: { kind: options.kind || 'track', file: file.name, payload } }));
    return payload;
  };
})(window);
