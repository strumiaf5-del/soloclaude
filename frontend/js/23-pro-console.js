
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const root = document.documentElement;
  const STORAGE = 'lgmdm.expert-mode';
  const PRESET_STORAGE = 'lgmdm.custom-presets';

  const sliderMap = {
    's-input-gain':'input_gain_db','s-comp-thresh':'comp_threshold_db','s-comp-ratio':'comp_ratio',
    's-stereo-width':'stereo_width','s-limiter-ceiling':'true_peak_db'
  };

  let _syncChainTimer = null;

  function allControls() {
    return [...document.querySelectorAll('.param input[type="range"], .param select, .param input[type="checkbox"], input[id^="s-"]')]
      .filter(el => el.id && !el.closest('.lg-pro-presetbar'));
  }
  function collectPreset() {
    const params = {};
    allControls().forEach(el => {
      const key = sliderMap[el.id] || el.id;
      if (el.type === 'checkbox') params[key] = !!el.checked;
      else params[key] = el.value;
    });
    return { name: LGMDM.dom.byId('presetName')?.value?.trim() || 'LGMDM Custom', created_at: new Date().toISOString(), params };
  }
  function downloadJSON(data) {
    const blob = new Blob([JSON.stringify(data,null,2)], {type:'application/json'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${(data.name||'lgmdm-preset').replace(/[^a-z0-9_-]+/gi,'_')}.json`; a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),500);
  }
  function applyPreset(data) {
    const p = data?.params || data?.settings || data || {};
    Object.entries(p).forEach(([key,val]) => {
      let id = key;
      const found = Object.entries(sliderMap).find(([,mapped]) => mapped === key); if (found) id = found[0];
      const el = LGMDM.dom.byId(id); if (!el) return;
      if (el.type === 'checkbox') el.checked = !!val;
      else { el.value = val; el.dispatchEvent(new Event('input',{bubbles:true})); }
      el.dispatchEvent(new Event(el.type === 'checkbox' ? 'change' : 'input',{bubbles:true}));
    });
    window.LGMDM?.previewController?.request?.();
    if (typeof window.LGMDM?.meters?.updateReadouts === 'function') window.LGMDM.meters.updateReadouts();
    document.querySelectorAll('.preset-btn.active').forEach(b=>b.classList.remove('active'));
    if (LGMDM.dom.byId('presetStatus')) LGMDM.dom.byId('presetStatus').textContent = `Aplicado: ${data?.name || 'preset'}`;
  }
  function loadCustomPresets() { try { return LGMDM.storage.getJSON(PRESET_STORAGE, []); } catch { return []; } }
  function saveCustomPresets(list) { LGMDM.storage.setJSON(PRESET_STORAGE, list.slice(-20)); }
  function refreshCustomSelect() {
    const sel = LGMDM.dom.byId('customPreset'); if (!sel) return;
    sel.innerHTML = '<option value="">Mis presets…</option>';
    loadCustomPresets().forEach((p,i)=>{ const o=document.createElement('option');o.value=String(i);o.textContent=p.name||`Preset ${i+1}`;sel.appendChild(o); });
  }

  function setExpert(enabled) {
    document.body.classList.toggle('lg-pro-expert', enabled);
    const cb = LGMDM.dom.byId('expertModeToggle'); if (cb) cb.checked = enabled;
    try { LGMDM.storage.set(STORAGE, enabled?'1':'0'); } catch {}
    if (LGMDM.dom.byId('expertState')) LGMDM.dom.byId('expertState').textContent = enabled ? 'STUDIO' : 'STANDARD';
  }

  function setChainActive(stage) {
    document.querySelectorAll('.lg-pro-node').forEach(n=>n.classList.toggle('active', n.dataset.stage===stage));
    document.querySelectorAll('.lg-stage-card').forEach(n=>n.classList.toggle('active', n.dataset.stage===stage));
  }
  function syncChainBypass() {
    const rootConsole = window.LGMDM?.console;
    const bypass = rootConsole?.getChainOverrides ? rootConsole.getChainOverrides() : {};
    document.querySelectorAll('.lg-pro-node[data-stage]').forEach(n=>n.classList.toggle('bypassed', !!bypass[`${n.dataset.stage}_bypass`]));
  }

  function install() {
    const consoleEl = LGMDM.dom.byId('lgMasterConsole'); if (!consoleEl) return;
    const status = document.createElement('div');
    status.className = 'lg-pro-statusbar';
    status.innerHTML = `
      <div class="lg-pro-status-main"><div><span class="lg-pro-status-kicker">MASTER ENGINE</span><strong>LGMDM PROCESSING CORE</strong><small id="statusMeta">Stereo · Ready</small></div><span class="lg-pro-online"><i></i><span id="onlineText">ONLINE</span></span></div>
      <div class="lg-pro-status-chip"><span class="lg-pro-chip-label">INPUT</span><strong class="lg-pro-chip-value" id="inputReadout">0.0 dB</strong></div>
      <div class="lg-pro-status-chip"><span class="lg-pro-chip-label">LUFS</span><strong class="lg-pro-chip-value" id="lufsReadout">-∞</strong></div>
      <div class="lg-pro-status-chip"><span class="lg-pro-chip-label">TRUE PEAK</span><strong class="lg-pro-chip-value" id="peakReadout">-∞ dBTP</strong></div>
      <div class="lg-pro-status-chip"><span class="lg-pro-chip-label">MODE</span><strong class="lg-pro-chip-value" id="expertState">STANDARD</strong></div>`;
    consoleEl.prepend(status);

    const preset = document.createElement('div'); preset.className='lg-pro-presetbar';
    preset.innerHTML=`<span class="lg-pro-preset-label">PRESET STUDIO</span><select id="presetCategory"><option value="all">Todos los estilos</option><option value="streaming">Streaming</option><option value="loud">Loud / Club</option><option value="dynamic">Dynamic</option><option value="broadcast">Broadcast</option><option value="custom">Mis presets</option></select><select id="customPreset"><option value="">Mis presets…</option></select><input id="presetName" placeholder="Nombre para guardar…" aria-label="Nombre del preset"><div class="lg-pro-preset-actions"><button class="lg-pro-btn primary" id="savePreset">GUARDAR</button><button class="lg-pro-btn" id="exportPreset">EXPORTAR JSON</button></div>`;
    consoleEl.insertBefore(preset, status.nextSibling);

    const title = consoleEl.querySelector('.lg-console-topbar .lg-console-actions');
    if (title) { const label=document.createElement('label');label.className='lg-pro-expert-toggle';label.innerHTML='<input type="checkbox" id="expertModeToggle"> STUDIO';title.prepend(label); }

    const chain = consoleEl.querySelector('.lg-chain-panel');
    if (chain) {
      const shell=document.createElement('div'); shell.className='lg-pro-chain-shell'; shell.innerHTML=`<div class="lg-pro-chain-head"><div><strong>PROCESSING CHAIN</strong><small> · señal de entrada a salida</small></div><span class="lg-pro-online"><i></i><span>ROUTED</span></span></div><div class="lg-pro-chain-flow">
      <button class="lg-pro-node active" data-stage="input"><i class="lg-pro-node-state"></i><span class="lg-pro-node-index">01</span><span class="lg-pro-node-title">INPUT</span><span class="lg-pro-node-value">Gain / Trim</span></button>
      <button class="lg-pro-node" data-stage="eq"><i class="lg-pro-node-state"></i><span class="lg-pro-node-index">02</span><span class="lg-pro-node-title">EQ</span><span class="lg-pro-node-value">Tonal shaping</span></button>
      <button class="lg-pro-node" data-stage="comp"><i class="lg-pro-node-state"></i><span class="lg-pro-node-index">03</span><span class="lg-pro-node-title">COMP</span><span class="lg-pro-node-value">Glue / Dynamics</span></button>
      <button class="lg-pro-node" data-stage="stereo"><i class="lg-pro-node-state"></i><span class="lg-pro-node-index">04</span><span class="lg-pro-node-title">STEREO</span><span class="lg-pro-node-value">M/S width</span></button>
      <button class="lg-pro-node" data-stage="limiter"><i class="lg-pro-node-state"></i><span class="lg-pro-node-index">05</span><span class="lg-pro-node-title">LIMITER</span><span class="lg-pro-node-value">True peak</span></button>
      <button class="lg-pro-node" data-stage="output"><i class="lg-pro-node-state"></i><span class="lg-pro-node-index">06</span><span class="lg-pro-node-title">OUTPUT</span><span class="lg-pro-node-value">Loudness / delivery</span></button></div>`;
      chain.replaceWith(shell);
      shell.querySelectorAll('.lg-pro-node').forEach(n=>n.addEventListener('click',()=>{setChainActive(n.dataset.stage); const pane=n.dataset.stage==='output'?'pane-salida':'pane-cadena';document.querySelector(`.sidebar-tab[data-pane="${pane}"]`)?.click();}));
    }

    const expert=document.createElement('div'); expert.className='lg-pro-expert-banner'; expert.innerHTML='<span>STUDIO · estudio modular activo</span><span>La cadena activa controla el motor de procesamiento.</span>'; consoleEl.insertBefore(expert, consoleEl.querySelector('.lg-console-controlbar'));
    const expertPanel=document.createElement('div'); expertPanel.className='lg-pro-expert-panel lg-pro-expert-only'; expertPanel.innerHTML=`<div class="lg-pro-chain-head"><div><strong>STUDIO ENGINE</strong><small> parámetros finos de operación</small></div></div><div class="lg-pro-expert-grid"><div class="lg-pro-mini-param"><label><span>OVERSAMPLING</span><span>ENGINE</span></label><select id="oversample"><option value="1x">1×</option><option value="2x">2×</option><option value="4x">4×</option><option value="8x">8×</option></select></div><div class="lg-pro-mini-param"><label><span>TRUE PEAK</span><span>CEILING</span></label><input id="truePeak" type="range" min="-3" max="-0.1" step="0.1" value="-1"><output>-1.0 dBTP</output></div><div class="lg-pro-mini-param"><label><span>STEREO</span><span>LINK</span></label><select id="stereoLink"><option>100%</option><option>75%</option><option>50%</option></select></div><div class="lg-pro-mini-param"><label><span>PREVIEW</span><span>FALLBACK</span></label><select id="previewMode"><option value="fallback">Fallback</option><option value="hq">HQ fallback</option></select></div></div>`;
    consoleEl.appendChild(expertPanel);

    LGMDM.dom.byId('expertModeToggle')?.addEventListener('change',e=>setExpert(e.target.checked));
    LGMDM.dom.byId('savePreset')?.addEventListener('click',()=>{const data=collectPreset();const list=loadCustomPresets();list.push(data);saveCustomPresets(list);refreshCustomSelect();if(LGMDM.dom.byId('presetStatus'))LGMDM.dom.byId('presetStatus').textContent=`Guardado: ${data.name}`;});
    LGMDM.dom.byId('exportPreset')?.addEventListener('click',()=>downloadJSON(collectPreset()));
    LGMDM.dom.byId('customPreset')?.addEventListener('change',e=>{const i=Number(e.target.value);if(!Number.isInteger(i))return;const p=loadCustomPresets()[i];if(p)applyPreset(p);});
    LGMDM.dom.byId('presetCategory')?.addEventListener('change',e=>{if(e.target.value==='custom')LGMDM.dom.byId('customPreset')?.focus();});
    const statusText=document.createElement('span');statusText.id='presetStatus';statusText.style.cssText='font:500 10px IBM Plex Mono,monospace;color:var(--muted);grid-column:1/-1;min-height:12px';preset.appendChild(statusText);

    try { setExpert(LGMDM.storage.get(STORAGE)==='1'); } catch { setExpert(false); }
    refreshCustomSelect();
    const observer=new MutationObserver(()=>{ LGMDM.dom.byId('inputReadout').textContent=LGMDM.dom.byId('consoleInputReadout')?.textContent||'0.0 dB'; LGMDM.dom.byId('lufsReadout').textContent=LGMDM.dom.byId('consoleLufs')?.textContent||'-∞'; LGMDM.dom.byId('peakReadout').textContent=LGMDM.dom.byId('consoleTruePeak')?.textContent||'-∞ dBTP'; syncChainBypass(); });
    observer.observe(consoleEl,{subtree:true,childList:true,characterData:true});
    if(!_syncChainTimer){ _syncChainTimer=setInterval(syncChainBypass,800); }
  }
  function teardownProConsole(){
    if(_syncChainTimer){ clearInterval(_syncChainTimer); _syncChainTimer=null; }
  }
  window.LGMDM = window.LGMDM || {};
  window.LGMDM.proConsole = Object.assign(window.LGMDM.proConsole || {}, { teardown: teardownProConsole });
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install,{once:true}); else install();
})();
