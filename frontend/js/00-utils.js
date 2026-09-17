// ============================================================
// 00-utils.js — Funciones matemáticas compartidas entre widgets
// ============================================================
// Fuente autoritativa para: clamp, clamp01, logFreq, xFromFreq,
// yFromDb, freqFromX. Cualquier widget debe consumir
// LGMDM.utils.* o los aliases globales window.* (ver final).

(function () {
  "use strict";

  /** Clamp numérico con fallback seguro. */
  function clamp(n, lo, hi) {
    n = Number(n);
    if (!Number.isFinite(n)) return lo;
    if (n < lo) return lo;
    if (n > hi) return hi;
    return n;
  }

  /** Clamp específico para rango [0, 1]. */
  function clamp01(v) {
    return Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
  }

  /** Escala logarítmica para frecuencia audible (Hz → log10). */
  function logFreq(f) {
    return Math.log10(Math.max(1, f));
  }

  /** Convierte Hz → coordenada X en un canvas (rango log).
   *  @param {number} f  - Frecuencia en Hz
   *  @param {number} left - Coordenada X inicial del área de dibujo
   *  @param {number} width - Ancho del área de dibujo
   *  @param {number} LOG_FMIN - log10(FMIN)
   *  @param {number} LOG_FMAX - log10(FMAX)
   */
  function xFromFreq(f, left, width, LOG_FMIN, LOG_FMAX) {
    const t = (logFreq(f) - LOG_FMIN) / (LOG_FMAX - LOG_FMIN);
    return left + t * width;
  }

  /** Convierte X → Hz (inversa de xFromFreq). */
  function freqFromX(x, left, width, LOG_FMIN, LOG_FMAX) {
    const t = (x - left) / width;
    return Math.pow(10, LOG_FMIN + t * (LOG_FMAX - LOG_FMIN));
  }

  /** Convierte dB → coordenada Y en un canvas.
   *  @param {number} db - Valor en dB
   *  @param {number} top - Coordenada Y inicial del área de dibujo
   *  @param {number} height - Alto del área de dibujo
   *  @param {number} DMIN - dB mínimo (e.g., -80)
   *  @param {number} DMAX - dB máximo (e.g., 0)
   */
  function yFromDb(db, top, height, DMIN, DMAX) {
    const t = (db - DMIN) / (DMAX - DMIN);
    return top + (1 - t) * height;
  }

  // ── Exposición pública ──
  window.LGMDM = window.LGMDM || {};
  window.LGMDM.utils = { clamp, clamp01, logFreq, xFromFreq, freqFromX, yFromDb };

  // Aliases globales para retrocompatibilidad con widgets legacy
  // que invocan las funciones sin prefijo.
  window.clamp = clamp;
  window.clamp01 = clamp01;
  window.logFreq = logFreq;
  window.xFromFreq = xFromFreq;
  window.freqFromX = freqFromX;
  window.yFromDb = yFromDb;
})();
