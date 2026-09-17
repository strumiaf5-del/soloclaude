// ============================================================
// pro-insert-rack.js — Pro Insert Rack flotante con drag-reorder
// 10 inserts DSP premium con dock/floating modes + persistencia
// ============================================================
(function (global) {
  'use strict';

  const LG = global.LGMDM = global.LGMDM || {};
  const NS = (LG.proInsertRack = LG.proInsertRack || {});

  // Catálogo de los 10 inserts premium
  const INSERTS = [
    { id: 'resonance-tamer',  title: '🎯 Reso Tamer',   endpoint: '/dsp/resonance-tamer' },
    { id: 'inflator',         title: '🔥 Inflator',      endpoint: '/dsp/inflator' },
    { id: 'phantom-sub',      title: '🔊 Phantom Sub',  endpoint: '/dsp/phantom-sub' },
    { id: 'iso-compensation', title: '🔉 ISO Comp',     endpoint: '/dsp/iso-compensation' },
    { id: 'match-eq',         title: '🎚 Match EQ',     endpoint: '/dsp/match-eq' },
    { id: 'cross-demask',     title: '🎭 Cross Demask', endpoint: '/dsp/cross-demask' },
    { id: 'loudness-penalty', title: '🎧 Loud Penalty', endpoint: '/dsp/loudness-penalty' },
    { id: 'phase-rotation',   title: '🔄 Phase Rot',    endpoint: '/dsp/phase-rotation' },
    { id: 'spectral-tilt',    title: '📈 Spectral Tilt',endpoint: '/dsp/spectral-tilt' },
    { id: 'dr-meter',         title: '📊 DR Meter',     endpoint: '/dsp/dr-meter' }
  ];

  const STATE_KEY = 'lgmdm.insert_rack.state.v1';

  function loadState() {
    try {
      const raw = localStorage.getItem(STATE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_) { return null; }
  }
  function saveState(s) {
    try { localStorage.setItem(STATE_KEY, JSON.stringify(s)); } catch (_) {}
  }

  function buildCard(spec, isBypassed) {
    const card = document.createElement('article');
    card.className = 'pir-card';
    card.draggable = true;
    card.dataset.insertId = spec.id;
    card.dataset.endpoint = spec.endpoint;
    card.dataset.state = isBypassed ? 'bypassed' : 'active';
    card.tabIndex = 0;
    card.innerHTML = `
      <header class="pir-card-head">
        <span class="pir-drag" aria-label="Drag para reordenar">⠿</span>
        <strong class="pir-card-title">${spec.title}</strong>
        <span class="pir-led ${isBypassed ? '' : 'pir-led--active'}" data-role="led"></span>
        <button class="pir-bypass" data-role="bypass" aria-pressed="${isBypassed}" title="Bypass" type="button">B</button>
      </header>
      <div class="pir-card-body">
        <div class="pir-card-endpoint" data-role="endpoint">${spec.endpoint}</div>
      </div>
      <footer class="pir-card-foot">
        <span class="pir-status" data-role="status">Ready</span>
        <button class="pir-btn pir-btn--mini" data-role="openDetail" title="Abrir detalle" type="button">⤢</button>
      </footer>
    `;
    return card;
  }

  function wireDragAndDrop(grid) {
    let dragSrc = null;
    grid.addEventListener('dragstart', (e) => {
      const card = e.target.closest('.pir-card');
      if (!card) return;
      dragSrc = card;
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', card.dataset.insertId);
    });
    grid.addEventListener('dragend', () => {
      if (dragSrc) dragSrc.classList.remove('dragging');
      grid.querySelectorAll('.drag-over').forEach(c => c.classList.remove('drag-over'));
      persistFromDom();
    });
    grid.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const over = e.target.closest('.pir-card');
      if (!over || over === dragSrc) return;
      grid.querySelectorAll('.drag-over').forEach(c => c.classList.remove('drag-over'));
      over.classList.add('drag-over');
    });
    grid.addEventListener('drop', (e) => {
      e.preventDefault();
      const over = e.target.closest('.pir-card');
      if (!over || over === dragSrc) return;
      const rect = over.getBoundingClientRect();
      const after = (e.clientY - rect.top) > rect.height / 2;
      over.parentNode.insertBefore(dragSrc, after ? over.nextSibling : over);
      dragSrc = null;
    });
  }

  function persistFromDom() {
    const grid = LG.dom.byId('pirGrid');
    if (!grid) return;
    const order = [...grid.querySelectorAll('.pir-card')].map(c => c.dataset.insertId);
    const bypass = {};
    grid.querySelectorAll('.pir-card').forEach(c => {
      bypass[c.dataset.insertId] = c.dataset.state === 'bypassed';
    });
    const rack = LG.dom.byId('proInsertRack');
    const minimized = rack ? rack.dataset.minimized === 'true' : false;
    saveState({ order, bypass, minimized });
    updateActiveCount();
  }

  function updateActiveCount() {
    const grid = LG.dom.byId('pirGrid');
    const out = LG.dom.byId('pirActiveCount');
    if (!grid || !out) return;
    const active = grid.querySelectorAll('.pir-card[data-state="active"]').length;
    out.textContent = `${active}/10 active`;
  }

  function buildShell() {
    const shell = document.createElement('aside');
    shell.id = 'proInsertRack';
    shell.className = 'pro-insert-rack pro-insert-rack--docked';
    shell.dataset.state = 'docked';
    shell.dataset.minimized = 'true';
    shell.setAttribute('role', 'region');
    shell.setAttribute('aria-label', 'Pro Insert Rack');
    shell.innerHTML = `
      <header class="pir-titlebar" id="pirTitlebar">
        <div class="pir-titlebar-left">
          <span class="pir-drag" aria-hidden="true">⋮⋮</span>
          <strong class="pir-title">🎛 Pro Insert Rack</strong>
          <span class="pir-count" id="pirActiveCount">0/10 active</span>
        </div>
        <div class="pir-titlebar-right">
          <button class="pir-btn pir-btn--icon" id="pirMinimize" title="Expandir" type="button">▢</button>
          <button class="pir-btn pir-btn--icon" id="pirClose" title="Cerrar" type="button">✕</button>
        </div>
      </header>
      <div class="pir-grid" id="pirGrid"></div>
    `;
    return shell;
  }

  function mount(rootEl) {
    let root = rootEl || LG.dom.byId('proInsertRack');
    if (!root) {
      root = buildShell();
      document.body.appendChild(root);
    }
    const grid = root.querySelector('#pirGrid');

    const persisted = loadState();
    const order = (persisted && Array.isArray(persisted.order) && persisted.order.length === 10)
      ? persisted.order : INSERTS.map(i => i.id);
    const bypass = (persisted && persisted.bypass) || {};
    if (persisted && typeof persisted.minimized === 'boolean') {
      root.dataset.minimized = persisted.minimized ? 'true' : 'false';
      const minBtn = root.querySelector('#pirMinimize');
      if (minBtn) {
        minBtn.textContent = persisted.minimized ? '▢' : '─';
        minBtn.title = persisted.minimized ? 'Expandir' : 'Minimizar';
      }
    }

    order.forEach(id => {
      const spec = INSERTS.find(i => i.id === id);
      if (spec) grid.appendChild(buildCard(spec, bypass[id] === true));
    });

    wireDragAndDrop(grid);

    grid.addEventListener('click', (e) => {
      const bypassBtn = e.target.closest('[data-role="bypass"]');
      if (bypassBtn) {
        const card = bypassBtn.closest('.pir-card');
        const wasActive = card.dataset.state === 'active';
        card.dataset.state = wasActive ? 'bypassed' : 'active';
        bypassBtn.setAttribute('aria-pressed', String(!wasActive));
        const led = card.querySelector('[data-role="led"]');
        if (led) led.classList.toggle('pir-led--active', !wasActive);
        persistFromDom();
      }
    });

    root.querySelector('#pirClose')?.addEventListener('click', () => {
      root.style.display = 'none';
    });
    root.querySelector('#pirResetAll')?.addEventListener('click', () => resetAll(root));
    root.querySelector('#pirMinimize')?.addEventListener('click', () => {
      const isDocked = root.classList.contains('pro-insert-rack--docked');
      if (isDocked) {
        root.dataset.minimized = root.dataset.minimized === 'true' ? 'false' : 'true';
        const btn = root.querySelector('#pirMinimize');
        if (btn) {
          btn.textContent = root.dataset.minimized === 'true' ? '▢' : '─';
          btn.title = root.dataset.minimized === 'true' ? 'Expandir' : 'Minimizar';
        }
        persistFromDom();
      }
    });

    updateActiveCount();
    return root;
  }

  function resetAll(root) {
    root.querySelectorAll('.pir-card').forEach(c => {
      c.dataset.state = 'active';
      c.querySelector('[data-role="bypass"]').setAttribute('aria-pressed', 'false');
      c.querySelector('[data-role="led"]').className = 'pir-led pir-led--active';
    });
    saveState({ order: INSERTS.map(i => i.id), bypass: {} });
    updateActiveCount();
  }

  async function processInsert(insertId, file) {
    const spec = INSERTS.find(i => i.id === insertId);
    if (!spec) throw new Error('unknown insert ' + insertId);
    const card = document.querySelector(`.pir-card[data-insert-id="${insertId}"]`);
    if (!card) throw new Error('card not mounted');
    if (card.dataset.state === 'bypassed') return null;
    const led = card.querySelector('[data-role="led"]');
    const status = card.querySelector('[data-role="status"]');
    led.className = 'pir-led pir-led--processing';
    card.dataset.state = 'processing';
    if (status) status.textContent = 'Processing…';
    try {
      const fd = new FormData();
      fd.append('file', file);
      const token = (LG.api?.authToken?.() || '');
      const res = await fetch(spec.endpoint, {
        method: 'POST',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        body: fd
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const ct = res.headers.get('content-type') || '';
      const payload = ct.includes('application/json') ? await res.json() : await res.blob();
      led.className = 'pir-led pir-led--active';
      card.dataset.state = 'active';
      if (status) status.textContent = 'Ready';
      return payload;
    } catch (err) {
      led.className = 'pir-led pir-led--error';
      card.dataset.state = 'error';
      if (status) status.textContent = err.message.slice(0, 24);
      throw err;
    }
  }

  // API pública
  NS.mount = mount;
  NS.INSERTS = INSERTS;
  NS.processOne = processInsert;
  NS.processAll = async function(file) {
    const root = LG.dom.byId('proInsertRack');
    if (!root) return null;
    const cards = [...root.querySelectorAll('.pir-card[data-state="active"]')];
    let blob = file;
    const results = [];
    for (let i = 0; i < cards.length; i++) {
      try {
        const payload = await processInsert(cards[i].dataset.insertId, blob);
        if (payload instanceof Blob) blob = payload;
        results.push({ id: cards[i].dataset.insertId, ok: true });
      } catch (e) {
        results.push({ id: cards[i].dataset.insertId, ok: false, error: e.message });
      }
    }
    return { results, blob };
  };
  NS.reset = function() { resetAll(LG.dom.byId('proInsertRack')); };

  // Auto-mount si el DOM tiene el contenedor
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => mount(), { once: true });
  } else {
    mount();
  }
})(typeof window !== 'undefined' ? window : globalThis);
