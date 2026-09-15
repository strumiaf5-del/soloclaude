// ============================================================
// pro-features/saturation-widget.js
// F3.5 — Saturation spectrum overlay
// ============================================================
(function (global) {
  'use strict';

  const NS = (global.LGMDM = global.LGMDM || {});
  NS.proFeatures = NS.proFeatures || {};

  const PALETTE = (() => {
    if (typeof document === 'undefined') return null;
    const s = getComputedStyle(document.documentElement);
    return {
      good: s.getPropertyValue('--ui-good').trim() || '#45f6b2',
      warn: s.getPropertyValue('--ui-warn').trim() || '#ffbd4a',
      danger: s.getPropertyValue('--ui-danger').trim() || '#ff4264',
      accent: s.getPropertyValue('--ui-accent').trim() || '#23e7ff',
      text: s.getPropertyValue('--ui-text').trim() || '#f4f7ff',
      muted: s.getPropertyValue('--ui-muted').trim() || '#8995b0',
      bg: s.getPropertyValue('--ui-surface').trim() || '#0d1220'
    };
  })();

  const COLOR_BG = (PALETTE && PALETTE.bg) || '#0d1020';
  const COLOR_GRID = 'rgba(147,164,255,0.10)';
  const COLOR_AXIS = 'rgba(147,164,255,0.35)';
  const COLOR_ORIG = (PALETTE && PALETTE.muted) || '#9ba6c4';
  const COLOR_SAT = (PALETTE && PALETTE.danger) || '#ff5f72';
  const COLOR_HARM = (PALETTE && PALETTE.warn) || '#ffcc66';
  const COLOR_TEXT = (PALETTE && PALETTE.text) || '#f7f8ff';
  const COLOR_MUTED = (PALETTE && PALETTE.muted) || '#9ba6c4';
  const COLOR_PILL_BG = 'rgba(255,255,255,0.04)';
  const COLOR_PILL_ACTIVE = 'rgba(92,232,255,0.18)';
  const FMIN = 20;
  const FMAX = 20000;
  const DMIN = -60;
  const DMAX = 0;

  function logFreq(f) { return Math.log10(Math.max(1, f)); }
  const LOG_FMIN = logFreq(FMIN);
  const LOG_FMAX = logFreq(FMAX);
  function xFromFreq(f, left, width) {
    const t = (logFreq(f) - LOG_FMIN) / (LOG_FMAX - LOG_FMIN);
    return left + t * width;
  }
  function yFromDb(db, top, height) {
    const t = (db - DMIN) / (DMAX - DMIN);
    return top + (1 - t) * height;
  }

  class Widget {
    constructor() {
      this.canvas = null;
      this.ctx = null;
      this.dpr = 1;
      this.cssWidth = 800;
      this.cssHeight = 400;
      this.data = {
        drive: 50,
        type: 'II',
        orig_spectrum: [],
        saturated_spectrum: [],
        harmonics_added_db: [0, 0, 0]
      };
      this._rafId = 0;
      this._lastFrame = 0;
      this._frameInterval = 1000 / 60;
      this._running = false;
      this._destroyed = false;
      this._mouseMove = null;
      this._mouseLeave = null;
      this._click = null;
    }

    init(canvas, options = {}) {
      if (!canvas) throw new Error('[saturationWidget] canvas required');
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.options = options || {};
      this._size();
      this._bindResize();
      this._bind();
      this._running = true;
      this._tick(performance.now());
    }

    _bindResize() {
      if (typeof ResizeObserver === 'undefined' || !this.canvas) return;
      this._ro = new ResizeObserver(() => this._size());
      this._ro.observe(this.canvas);
    }

    _size() {
      const rect = this.canvas.getBoundingClientRect();
      this.cssWidth = Math.max(rect.width, 320);
      this.cssHeight = Math.max(rect.height, 200);
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.canvas.width = Math.floor(this.cssWidth * this.dpr);
      this.canvas.height = Math.floor(this.cssHeight * this.dpr);
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }

    _bind() {
      this._mouseMove = (e) => {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const r = this._plotRect();
        this._hover = (x < r.left || x > r.right || y < r.top || y > r.bottom) ? null : { x, y };
      };
      this._mouseLeave = () => { this._hover = null; };
      this._click = (e) => this._handleClick(e);
      this.canvas.addEventListener('mousemove', this._mouseMove);
      this.canvas.addEventListener('mouseleave', this._mouseLeave);
      this.canvas.addEventListener('click', this._click);
    }

    _plotRect() {
      const left = 56;
      const right = this.cssWidth - 16;
      const top = 16;
      const bottom = this.cssHeight - 70;
      return { left, right, top, bottom, width: right - left, height: bottom - top };
    }

    _handleClick(e) {
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const segY = this.cssHeight - 50;
      const segX = this.cssWidth - 200;
      const segW = 56;
      const segH = 24;
      const types = ['I', 'II', 'III'];
      types.forEach((t, i) => {
        const tx = segX + i * (segW + 6);
        if (x >= tx && x <= tx + segW && y >= segY && y <= segY + segH) {
          this.data.type = t;
          if (this.options.onTypeChange) this.options.onTypeChange(t);
        }
      });
      const slX = 70;
      const slY = this.cssHeight - 50;
      const slW = 240;
      const slH = 14;
      if (x >= slX && x <= slX + slW && y >= slY - 8 && y <= slY + slH + 8) {
        const drive = Math.round(((x - slX) / slW) * 100);
        this.data.drive = Math.max(0, Math.min(100, drive));
        if (this.options.onDriveChange) this.options.onDriveChange(this.data.drive);
      }
    }

    update(data) {
      this.data = Object.assign({
        drive: 50, type: 'II', orig_spectrum: [],
        saturated_spectrum: [], harmonics_added_db: [0, 0, 0]
      }, data || {});
    }

    resize() { this._size(); }

    destroy() {
      this._destroyed = true;
      this._running = false;
      if (this._rafId) cancelAnimationFrame(this._rafId);
      this._rafId = 0;
      if (this._ro) { try { this._ro.disconnect(); } catch (_) {} this._ro = null; }
      if (this.canvas) {
        if (this._mouseMove) this.canvas.removeEventListener('mousemove', this._mouseMove);
        if (this._mouseLeave) this.canvas.removeEventListener('mouseleave', this._mouseLeave);
        if (this._click) this.canvas.removeEventListener('click', this._click);
      }
      this._mouseMove = this._mouseLeave = this._click = null;
      this.canvas = null;
      this.ctx = null;
    }

    teardown() { this.destroy(); }

    _tick(now) {
      if (this._destroyed || !this._running) return;
      if (now - this._lastFrame < this._frameInterval) {
        this._rafId = requestAnimationFrame((t) => this._tick(t));
        return;
      }
      this._lastFrame = now;
      this._render();
      this._rafId = requestAnimationFrame((t) => this._tick(t));
    }

    _render() {
      const ctx = this.ctx;
      const w = this.cssWidth;
      const h = this.cssHeight;
      const r = this._plotRect();
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = COLOR_BG;
      ctx.fillRect(0, 0, w, h);
      this._drawGrid(r);

      const drawCurve = (points, color, width, alpha = 1) => {
        if (!points || points.length < 2) return;
        ctx.globalAlpha = alpha;
        ctx.lineWidth = width;
        ctx.strokeStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 5;
        ctx.beginPath();
        const sorted = points.filter(p => p && isFinite(p.freq) && isFinite(p.db))
          .slice().sort((a, b) => a.freq - b.freq);
        for (let i = 0; i < sorted.length; i++) {
          const f = Math.max(FMIN, Math.min(FMAX, sorted[i].freq));
          const db = Math.max(DMIN, Math.min(DMAX, sorted[i].db));
          const x = xFromFreq(f, r.left, r.width);
          const y = yFromDb(db, r.top, r.height);
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
      };

      drawCurve(this.data.orig_spectrum, COLOR_ORIG, 1.4, 0.6);
      drawCurve(this.data.saturated_spectrum, COLOR_SAT, 2.0, 1.0);

      const harmonics = this.data.harmonics_added_db || [];
      const baseF = this._detectFundamental(this.data.orig_spectrum);
      if (baseF > 0) {
        for (let n = 2; n <= 4; n++) {
          const f = baseF * n;
          if (f < FMIN || f > FMAX) continue;
          const x = xFromFreq(f, r.left, r.width);
          const gain = harmonics[n - 2] || 0;
          const yT = yFromDb(-10 + gain * 4, r.top, r.height);
          ctx.strokeStyle = COLOR_HARM;
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(x, r.top);
          ctx.lineTo(x, r.bottom);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = COLOR_HARM;
          ctx.beginPath();
          ctx.arc(x, yT, 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = COLOR_MUTED;
          ctx.font = '10px system-ui, -apple-system, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(`${n}nd harmonic +${gain.toFixed(1)}dB`, x, Math.max(r.top + 10, yT - 12));
          ctx.textAlign = 'left';
        }
      }

      this._drawControls();
    }

    _detectFundamental(spec) {
      if (!spec || spec.length === 0) return 0;
      let best = spec[0];
      spec.forEach(p => { if (p && isFinite(p.db) && (best.db == null || p.db > best.db)) best = p; });
      return Math.max(1, best.freq || 0);
    }

    _drawGrid(r) {
      const ctx = this.ctx;
      ctx.font = '10px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = COLOR_MUTED;
      ctx.textBaseline = 'middle';

      const yTicks = [-60, -48, -36, -24, -12, 0];
      yTicks.forEach((db) => {
        const y = yFromDb(db, r.top, r.height);
        ctx.strokeStyle = db === 0 ? COLOR_AXIS : COLOR_GRID;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(r.left, y);
        ctx.lineTo(r.right, y);
        ctx.stroke();
        ctx.textAlign = 'right';
        ctx.fillText(db + ' dB', r.left - 6, y);
      });

      const xTicks = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
      ctx.textBaseline = 'top';
      ctx.textAlign = 'center';
      xTicks.forEach((f) => {
        const x = xFromFreq(f, r.left, r.width);
        ctx.beginPath();
        ctx.moveTo(x, r.top);
        ctx.lineTo(x, r.bottom);
        ctx.strokeStyle = COLOR_GRID;
        ctx.stroke();
        const label = f >= 1000 ? (f / 1000) + 'k' : String(f);
        ctx.fillText(label, x, r.bottom + 6);
      });

      ctx.textAlign = 'left';
    }

    _drawControls() {
      const ctx = this.ctx;
      const y = this.cssHeight - 50;

      ctx.fillStyle = COLOR_MUTED;
      ctx.font = '11px system-ui, -apple-system, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillText('Drive', 16, y + 7);
      ctx.fillText('Type', this.cssWidth - 250, y + 7);

      const slX = 70;
      const slW = 240;
      ctx.fillStyle = 'rgba(147,164,255,0.18)';
      ctx.fillRect(slX, y, slW, 8);
      const driveVal = Math.max(0, Math.min(100, this.data.drive || 0));
      const driveW = (driveVal / 100) * slW;
      const grd = ctx.createLinearGradient(slX, 0, slX + driveW, 0);
      grd.addColorStop(0, '#42e8ff');
      grd.addColorStop(1, '#ff5f72');
      ctx.fillStyle = grd;
      ctx.fillRect(slX, y, driveW, 8);
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(slX + driveW, y + 4, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = COLOR_TEXT;
      ctx.font = '700 12px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(driveVal + '%', slX + slW + 10, y + 4);

      const segX = this.cssWidth - 200;
      const segW = 56;
      const segH = 24;
      ['I', 'II', 'III'].forEach((t, i) => {
        const tx = segX + i * (segW + 6);
        const active = this.data.type === t;
        ctx.fillStyle = active ? COLOR_PILL_ACTIVE : COLOR_PILL_BG;
        ctx.strokeStyle = active ? 'rgba(92,232,255,0.55)' : 'rgba(255,255,255,0.10)';
        ctx.lineWidth = 1;
        this._roundRect(ctx, tx, y - 6, segW, segH, 8);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = active ? '#dffcff' : COLOR_MUTED;
        ctx.font = '700 12px system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(t, tx + segW / 2, y + 6);
      });

      ctx.fillStyle = COLOR_MUTED;
      ctx.font = '10px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`Drive ${driveVal}% · Curve type ${this.data.type}`, 16, y + 24);
      let lx = this.cssWidth / 2;
      ctx.fillStyle = COLOR_ORIG;
      ctx.globalAlpha = 0.6;
      ctx.fillRect(lx, y + 20, 12, 3);
      ctx.globalAlpha = 1;
      ctx.fillStyle = COLOR_MUTED;
      ctx.fillText('Original', lx + 16, y + 22);
      lx += 86;
      ctx.fillStyle = COLOR_SAT;
      ctx.fillRect(lx, y + 20, 12, 3);
      ctx.fillStyle = COLOR_MUTED;
      ctx.fillText('Saturated', lx + 16, y + 22);
      lx += 86;
      ctx.fillStyle = COLOR_HARM;
      ctx.beginPath(); ctx.arc(lx + 6, y + 22, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = COLOR_MUTED;
      ctx.fillText('Harmonics', lx + 16, y + 22);
    }

    _roundRect(ctx, x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
    }
  }

  NS.proFeatures.saturationWidget = Widget;
  if (typeof module !== 'undefined' && module.exports) module.exports = { Widget };
})(typeof window !== 'undefined' ? window : globalThis);
