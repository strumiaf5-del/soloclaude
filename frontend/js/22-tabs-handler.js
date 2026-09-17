/** 22-tabs-handler.js — authoritative sidebar navigation. */
(function(){
  'use strict';
  const LG = window.LGMDM = window.LGMDM || {};
  LG.tabs = LG.tabs || {};
  const TAB_STATE = LG.tabs.state = LG.tabs.state || { activeTab: 'pane-mastering-ref' };
  const bindOnce = LG.ui?.bindOnce || ((el, ev, fn) => el?.addEventListener(ev, fn));
  const paneMap = {
    'pane-mastering-ref': 'archivo',
    'pane-archivo': 'archivo',
    'pane-cadena': 'cadena',
    'pane-salida': 'salida',
    'pane-mixer': 'mixer',
    'pane-proyectos': 'proyectos'
  };
  const detailsMap = {
    'pane-mastering-ref': 'pasoArchivo',
    'pane-archivo': 'pasoArchivo',
    'pane-cadena': 'pasoCadena',
    'pane-salida': 'pasoSalida',
    'pane-mixer': 'pasoMixer'
  };
  const VALID_TABS = ['pane-mastering-ref', 'pane-archivo', 'pane-cadena', 'pane-salida', 'pane-mixer', 'pane-proyectos'];

  function selectTabInternal(tabName) {
    const normalized = VALID_TABS.includes(tabName)
      ? tabName
      : 'pane-mastering-ref';
    // No teardown del preview cuando vamos al Mixer: activateMixerMode
    // gestiona su propio previewEngine (previewEngine.playing → stopPreview
    // en deactivateMixerMode). Llamar teardown aquí destruiría el engine del
    // mixer antes de que pueda usarlo (race condition Mixer ↔ preview).
    if (normalized !== 'pane-mixer' && typeof LGMDM?.previewController?.teardown === 'function') {
      LGMDM.previewController.teardown();
    }
    const tabs = document.querySelectorAll('#sidebarTabs .sidebar-tab');
    TAB_STATE.activeTab = normalized;
    tabs.forEach((btn) => btn.classList.toggle('active', btn.dataset.pane === normalized));

    if (normalized === 'pane-proyectos') {
      document.querySelector('.content-shell')?.classList.add('is-tab-hidden');
      document.getElementById('projects-section')?.classList.remove('is-tab-hidden');
      return;
    }

    const container = document.getElementById('sidebarPaneContainer');
    if (container && paneMap[normalized]) {
      container.className = container.className.replace(/sidebar-showing-\w+/g, '').trim();
      container.classList.add(`sidebar-showing-${paneMap[normalized]}`);
    }

    Object.values(detailsMap)
      .map((id) => document.getElementById(id))
      .filter(Boolean)
      .forEach((details) => {
        if (typeof details.removeAttribute === 'function' && details.tagName === 'DETAILS') {
          details.removeAttribute('open');
        }
      });

    const activeDetails = document.getElementById(detailsMap[normalized]);
    if (activeDetails && activeDetails.tagName === 'DETAILS') {
      activeDetails.setAttribute('open', '');
    }

    document.querySelector('.content-shell')?.classList.remove('is-tab-hidden');
    document.getElementById('projects-section')?.classList.add('is-tab-hidden');
  }

  function selectTab(tabName) {
    selectTabInternal(tabName);
    try { LG.storage?.set('active-tab', TAB_STATE.activeTab); } catch (_) {}
  }

  LG.tabs.select = selectTab;
  LG.tabs.getActive = () => TAB_STATE.activeTab;

  function initTabs() {
    const tabs = document.querySelectorAll('#sidebarTabs .sidebar-tab[data-pane]');
    if (!tabs.length) return;
    tabs.forEach((tab) => bindOnce(tab, 'click', () => selectTab(tab.dataset.pane), 'tabs-handler-click'));
    let saved = null;
    try { saved = LG.storage?.get('active-tab'); } catch (_) {}
    const initial = VALID_TABS.includes(saved)
      ? saved
      : 'pane-mastering-ref';
    selectTabInternal(initial);
  }

  bindOnce(document, 'DOMContentLoaded', initTabs, 'tabs-handler-dom-ready', { once:true });
  if (document.readyState !== 'loading') initTabs();
})();
