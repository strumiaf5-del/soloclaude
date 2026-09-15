// filepath: js/00-components.js
(function (global) {
  'use strict';
  const LGMDM = global.LGMDM = global.LGMDM || {};
  LGMDM.components = LGMDM.components || {};

  class LgmdmToast extends HTMLElement {
    constructor() {
      super();
      this.classList.add('toast');
      this._removeTimer = null;
    }

    connectedCallback() {
      if (!this.hasAttribute('role')) this.setAttribute('role', 'status');
      this.render();
    }

    render() {
      const type = this.getAttribute('type') || 'info';
      const message = this.getAttribute('message') || '';
      const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ', loading: '⏳' };
      this.className = `toast toast-${type}`;
      this.replaceChildren();
      const icon = document.createElement('span');
      icon.className = `toast-icon toast-icon-${type}`;
      icon.textContent = icons[type] || icons.info;
      const text = document.createElement('span');
      text.className = 'toast-message';
      text.textContent = message;
      this.append(icon, text);
    }

    scheduleRemove(duration) {
      if (this._removeTimer) clearTimeout(this._removeTimer);
      if (duration <= 0) return;
      this._removeTimer = setTimeout(() => {
        this.classList.add('toast-closing');
        setTimeout(() => this.remove(), 300);
      }, duration);
    }
  }

  if (!customElements.get('lgmdm-toast')) customElements.define('lgmdm-toast', LgmdmToast);
  LGMDM.components.Toast = LgmdmToast;
})(window);
