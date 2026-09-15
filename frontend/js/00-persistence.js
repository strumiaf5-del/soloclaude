// filepath: js/00-persistence.js
(function (global) {
  'use strict';
  const LGMDM = global.LGMDM = global.LGMDM || {};
  const DB_NAME = 'lgmdm-ui';
  const DB_VERSION = 1;
  const STORE = 'snapshots';
  const SNAPSHOT_KEY = 'current';
  const SAVE_DEBOUNCE_MS = 1500;
  const AUTO_SAVE_MS = 30000;
  let dbPromise = null;
  let saveTimer = null;
  let autoSaveTimer = null;
  let started = false;

  function openDb() {
    if (!('indexedDB' in global)) return Promise.resolve(null);
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onerror = () => reject(req.error || new Error('IndexedDB no disponible'));
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
    }).catch(() => null);
    return dbPromise;
  }

  function collectFormState() {
    const values = {};
    document.querySelectorAll('input, select, textarea').forEach((el) => {
      if (!el.id || el.disabled || el.type === 'file' || el.type === 'password') return;
      if (el.dataset.persist === 'false') return;
      if (el.type === 'checkbox' || el.type === 'radio') values[el.id] = { type: el.type, checked: el.checked };
      else values[el.id] = { type: el.type || el.tagName.toLowerCase(), value: el.value };
    });
    return values;
  }

  function collectSnapshot() {
    const state = LGMDM.state || {};
    return {
      version: 1,
      createdAt: Date.now(),
      workspace: LGMDM.storage.get('lgmdm.workspace') || null,
      activeTab: LGMDM.storage.get('active-tab') || null,
      theme: LGMDM.storage.get('lgmdm-theme') || null,
      expertMode: LGMDM.storage.get('lgmdm-expert-mode') || null,
      drawerWidth: LGMDM.storage.get('lgmdm.drawer-width') || null,
      state: {
        selectedFileName: state.selectedFile?.name || null,
      },
      form: collectFormState(),
    };
  }

  async function syncToBackend(snapshot) {
    const node = document.querySelector('meta[name="lgmdm-persistence-sync-endpoint"]');
    const target = node?.content?.trim() || '';
    if (!target || typeof LGMDM.api?.client?.post !== 'function') return false;
    try {
      const response = await LGMDM.api.client.post(target, {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(snapshot),
      });
      return response.ok;
    } catch (_) { return false; }
  }

  async function save(reason = 'manual') {
    const db = await openDb();
    if (!db) return false;
    const snapshot = collectSnapshot();
    snapshot.reason = reason;
    syncToBackend(snapshot);
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(snapshot, SNAPSHOT_KEY);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (_) { resolve(false); }
    });
  }

  function scheduleSave(reason = 'debounced') {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { save(reason); }, SAVE_DEBOUNCE_MS);
  }

  function clearAutoSaveTimer() {
    if (autoSaveTimer) {
      clearInterval(autoSaveTimer);
      autoSaveTimer = null;
    }
  }

  async function restore() {
    const db = await openDb();
    if (!db) return null;
    const snapshot = await new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).get(SNAPSHOT_KEY);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      } catch (_) { resolve(null); }
    });
    if (!snapshot || snapshot.version !== 1) return null;
    for (const [id, data] of Object.entries(snapshot.form || {})) {
      const el = document.getElementById(id);
      if (!el || data?.type === 'file') continue;
      if (data.type === 'checkbox' || data.type === 'radio') el.checked = !!data.checked;
      else if ('value' in data) el.value = data.value;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return snapshot;
  }

  function start() {
    if (started) return;
    started = true;
    const runRestore = () => restore().then(() => scheduleSave('restore-complete'));
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', runRestore, { once: true });
    else runRestore();
    autoSaveTimer = setInterval(() => save('autosave'), AUTO_SAVE_MS);
    const schedule = () => scheduleSave('ui-change');
    document.addEventListener('change', schedule, { capture: true, passive: true });
    document.addEventListener('input', schedule, { capture: true, passive: true });
    global.addEventListener('pagehide', () => { clearAutoSaveTimer(); save('pagehide'); }, { once: true });
    global.addEventListener('beforeunload', () => { clearAutoSaveTimer(); save('beforeunload'); }, { once: true });
  }

  LGMDM.persistence = { start, save, restore, scheduleSave, clearAutoSaveTimer, collectSnapshot, DB_NAME };
  start();
})(window);
