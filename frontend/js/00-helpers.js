// ============================================================
// 00-helpers.js — Utilidades DOM/JSON responsive bajo LGMDM.*
// ============================================================
(function (global) {
  'use strict';
  const LG = global.LGMDM = global.LGMDM || {};
  const dom = LG.dom = LG.dom || {};
  const helpers = dom.helpers = dom.helpers || {};

  helpers.value = (id, defaultVal = '') => document.getElementById(id)?.value ?? defaultVal;
  helpers.checked = (id, defaultVal = false) => document.getElementById(id)?.checked ?? defaultVal;
  helpers.text = (id, defaultVal = '') => document.getElementById(id)?.textContent ?? defaultVal;
  helpers.byId = (id) => document.getElementById(id) || null;
  helpers.setValue = (id, value) => {
    const el = document.getElementById(id);
    if (!el) return false;
    el.value = value;
    return true;
  };
  helpers.parse = (json, defaultVal = null) => {
    try { return JSON.parse(json); } catch (_) { return defaultVal; }
  };
  helpers.stringify = (obj, defaultVal = '{}') => {
    try { return JSON.stringify(obj); } catch (_) { return defaultVal; }
  };
  helpers.isMobile = () => global.innerWidth < 600;
  helpers.isTablet = () => global.innerWidth >= 600 && global.innerWidth < 960;
  helpers.isDesktop = () => global.innerWidth >= 960;

  LG.dom.helpers = helpers;
})(window);
