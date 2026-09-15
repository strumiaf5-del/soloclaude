/** 22-tabs-handler.js — authoritative sidebar navigation. */
(function(){
  'use strict';
  const LG = window.LGMDM = window.LGMDM || {};
  LG.tabs = LG.tabs || {};
  const TAB_STATE = LG.tabs.state = LG.tabs.state || { activeTab: 'pane-archivo' };
  const bindOnce = LG.ui?.bindOnce || ((el, ev, fn) => el?.addEventListener(ev, fn));
  const paneMap = { 'pane-archivo':'archivo', 'pane-cadena':'cadena', 'pane-salida':'salida' };
  const detailsMap = { 'pane-archivo':'pasoArchivo', 'pane-cadena':'pasoCadena', 'pane-salida':'pasoSalida' };

  function selectTabInternal(tabName) {
    const normalized = ['pane-archivo','pane-cadena','pane-salida','pane-proyectos'].includes(tabName)
      ? tabName
      : 'pane-archivo';
    if (typeof LGMDM?.previewController?.teardown === 'function') {
      LGMDM.previewController.teardown();
    }
    const tabs = document.querySelectorAll('#sidebarTabs .sidebar-tab');
    TAB_STATE.activeTab = normalized;
    tabs.forEach((btn) => btn.classList.toggle('active', btn.dataset.pane === normalized));

    if (normalized === 'pane-proyectos') {
      document.querySelector('.content-shell')?.classList.add('is-tab-hidden');
      document.getElementById('projects-section')?.classList.remove('is-tab-hidden');
      // loadAndRenderProjects is bound to the tab click in 21-projects-ui.js,
      // so it will fire automatically when this tab is selected. No duplicate call here.
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
      .forEach((details) => details.removeAttribute('open'));

    const activeDetails = document.getElementById(detailsMap[normalized]);
    if (activeDetails) activeDetails.setAttribute('open', '');

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
    const initial = ['pane-archivo','pane-cadena','pane-salida','pane-proyectos'].includes(saved)
      ? saved
      : 'pane-archivo';
    selectTabInternal(initial);
  }

  bindOnce(document, 'DOMContentLoaded', initTabs, 'tabs-handler-dom-ready', { once:true });
  if (document.readyState !== 'loading') initTabs();
})();
