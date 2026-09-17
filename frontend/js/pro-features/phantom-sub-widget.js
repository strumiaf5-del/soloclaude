// ============================================================
// phantom-sub-widget.js — Sintetizador psicoacústico de graves
// Endpoint: /dsp/phantom-sub (crossover_hz, mix, harmonic_mode)
// ============================================================
(function (global) {
  'use strict';

  const LG = global.LGMDM = global.LGMDM || {};
  LG.proFeatures = LG.proFeatures || {};

  const HARMONIC_MODES = [
    { value: 'octave', label: 'Octave' },
    { value: 'fifth', label: 'Fifth' },
    { value: 'rich', label: 'Rich' }
  ];

  class phantomSubWidget {
    constructor() {
      this.root = null;
      this.state = { crossover_hz: 80, mix: 0.5, harmonic_mode: 'octave', bypass: false };
      this._listeners = [];
    }

    init(canvas, options = {}) {
      this.root = (canvas && canvas.parentElement) || null;
      if (!this.root) return;
      if (Number.isFinite(options.crossover_hz)) this.state.crossover_hz = options.crossover_hz;
      if (Number.isFinite(options.mix)) this.state.mix = options.mix;
      if (options.harmonic_mode) this.state.harmonic_mode = options.harmonic_mode;
      if (typeof options.bypass === 'boolean') this.state.bypass = options.bypass;

      const card = document.createElement('div');
      card.className = 'pro-meter-card phantom-sub-widget';
      card.dataset.insertId = 'phantom-sub';
      card.dataset.endpoint = '/dsp/phantom-sub';
      card.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <strong>🔊 Phantom Sub</strong>
          <label class="ps-bypass"><input type="checkbox" data-role="bypass" ${this.state.bypass ? '' : 'checked'}/> Bypass</label>
        </div>
        <div class="ps-grid">
          <div>
            <label>Crossover (Hz)</label>
            <input type="range" min="30" max="160" step="1" value="${this.state.crossover_hz}" data-role="crossover"/>
            <output data-role="crossoverVal">${this.state.crossover_hz} Hz</output>
          </div>
          <div>
            <label>Mix</label>
            <input type="range" min="0" max="100" step="1" value="${Math.round(this.state.mix * 100)}" data-role="mix"/>
            <output data-role="mixVal">${Math.round(this.state.mix * 100)}%</output>
          </div>
        </div>
        <div class="ps-harmonics">
          <label>Harmonic Mode</label>
          <div data-role="harmonics" class="ps-harmonic-pills">
            ${HARMONIC_MODES.map(m => `
              <button type="button" data-value="${m.value}" class="ps-pill ${m.value === this.state.harmonic_mode ? 'active' : ''}">${m.label}</button>
            `).join('')}
          </div>
        </div>
        <div class="ps-footer">
          <span data-role="f0">f₀: ${this.state.crossover_hz} Hz</span>
          <span data-role="status">Ready</span>
        </div>
      `;
      if (canvas && canvas.parentElement === this.root) {
        canvas.insertAdjacentElement('afterend', card);
      } else {
        this.root.appendChild(card);
      }
      this.cardEl = card;
      this._wire();
    }

    update(data = {}) {
      if (Number.isFinite(data.f0_hz)) {
        const f0 = this.cardEl.querySelector('[data-role="f0"]');
        if (f0) f0.textContent = `f₀: ${data.f0_hz} Hz`;
      }
    }

    destroy() {
      this._listeners.forEach(({ el, type, fn }) => el.removeEventListener(type, fn));
      this._listeners = [];
    }

    _wire() {
      const bind = (sel, type, fn) => {
        const el = this.cardEl.querySelector(sel);
        if (el) {
          el.addEventListener(type, fn);
          this._listeners.push({ el, type, fn });
        }
      };
      bind('[data-role="crossover"]', 'input', (e) => {
        this.state.crossover_hz = Number(e.target.value);
        const out = this.cardEl.querySelector('[data-role="crossoverVal"]');
        if (out) out.textContent = `${e.target.value} Hz`;
        const f0 = this.cardEl.querySelector('[data-role="f0"]');
        if (f0) f0.textContent = `f₀: ${e.target.value} Hz`;
      });
      bind('[data-role="mix"]', 'input', (e) => {
        this.state.mix = Number(e.target.value) / 100;
        const out = this.cardEl.querySelector('[data-role="mixVal"]');
        if (out) out.textContent = `${e.target.value}%`;
      });
      const pills = this.cardEl.querySelectorAll('.ps-pill');
      pills.forEach(p => {
        const fn = () => {
          pills.forEach(x => x.classList.remove('active'));
          p.classList.add('active');
          this.state.harmonic_mode = p.dataset.value;
        };
        p.addEventListener('click', fn);
        this._listeners.push({ el: p, type: 'click', fn });
      });
      bind('[data-role="bypass"]', 'change', (e) => {
        this.state.bypass = !e.target.checked;
      });
    }
  }

  LG.proFeatures.phantomSubWidget = phantomSubWidget;
})(typeof window !== 'undefined' ? window : globalThis);
