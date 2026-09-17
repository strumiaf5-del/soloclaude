// ============================================================
// 00-auth.js — Login, registro y panel de admin
// Bloquea el acceso hasta que haya una sesión válida en sessionStorage.
// ============================================================

(function () {
  'use strict';

  const LG = window.LGMDM = window.LGMDM || {};
  const TOKEN_KEY = 'master_auth_token';
  const USER_KEY  = 'master_auth_user';

  // ── Helpers ───────────────────────────────────────────────────────────────

  function clearRetiredSessionKeys() {
    try {
      LGMDM.storage.remove(TOKEN_KEY);
      LGMDM.storage.remove(USER_KEY);
    } catch (_) {}
  }

  function saveSession(token, user) {
    sessionStorage.setItem(TOKEN_KEY, token);
    sessionStorage.setItem(USER_KEY, JSON.stringify(user));
    clearRetiredSessionKeys();
  }

  function clearSession() {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
    clearRetiredSessionKeys();
  }

  function getToken() {
    return sessionStorage.getItem(TOKEN_KEY);
  }

  function getUser()  {
    try { return JSON.parse(sessionStorage.getItem(USER_KEY) || 'null'); } catch { return null; }
  }

  // La autenticación de transporte vive en 00-api.js (apiFetch/authHeaders).
  // ── UI ────────────────────────────────────────────────────────────────────

  function hideAuthOverlay() {
    const overlay = document.getElementById('auth-overlay');
    if (overlay) {
      overlay.classList.add('hidden');
      overlay.style.display = 'none';
    }
  }

  function renderUserBar(user) {
    let bar = document.getElementById('auth-user-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'auth-user-bar';
    } else {
      bar.innerHTML = '';
    }

    const nameSpan = document.createElement('span');
    nameSpan.className = 'auth-user-name';
    nameSpan.textContent = `👤 ${String(user?.name || user?.email || '').trim()}`;

    const logoutBtn = document.createElement('button');
    logoutBtn.className = 'auth-logout-btn';
    logoutBtn.id = 'logout-btn';
    logoutBtn.type = 'button';
    logoutBtn.textContent = 'Cerrar sesión';

    bar.appendChild(nameSpan);

    if (user?.role === 'admin') {
      const adminBtn = document.createElement('button');
      adminBtn.id = 'admin-panel-btn';
      adminBtn.className = 'auth-admin-btn';
      adminBtn.type = 'button';
      adminBtn.textContent = '⚙ Admin';
      adminBtn.title = 'Panel de administración de usuarios';
      adminBtn.addEventListener('click', openAdminPanel);
      bar.appendChild(adminBtn);
    }

    bar.appendChild(logoutBtn);

    const headerRight = document.querySelector('.header-right');
    const headerEl = document.querySelector('header');
    if (headerRight && !headerRight.contains(bar)) {
      headerRight.appendChild(bar);
    } else if (headerEl && !headerEl.contains(bar)) {
      headerEl.appendChild(bar);
    } else if (!document.body.contains(bar)) {
      document.body.appendChild(bar);
    }

    const bindOnce = window.LGMDM.ui.bindOnce;
    bindOnce(logoutBtn, 'click', () => {
      clearSession();
      window.location.replace('login.html');
    }, 'auth-userbar-logout');
  }

  function renderAdminButton() {
    let btn = document.getElementById('admin-panel-btn');
    if (!btn) {
      const userBar = document.getElementById('auth-user-bar');
      if (userBar) {
        btn = document.createElement('button');
        btn.id = 'admin-panel-btn';
        btn.className = 'auth-admin-btn';
        btn.type = 'button';
        btn.textContent = '⚙ Admin';
        btn.title = 'Panel de administración de usuarios';
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) userBar.insertBefore(btn, logoutBtn);
        else userBar.appendChild(btn);
      }
    }
    if (btn && !btn.dataset.wired) {
      btn.dataset.wired = 'true';
      btn.addEventListener('click', openAdminPanel);
    }
  }

  async function openAdminPanel() {
    let overlay = document.getElementById('admin-overlay');
    if (overlay) {
      overlay.classList.remove('hidden');
      overlay.style.display = 'flex';
      loadAdminUsers();
      return;
    }

    overlay = document.createElement('div');
    overlay.id = 'admin-overlay';
    overlay.style.display = 'flex';
    overlay.innerHTML = `
      <div class="admin-box">
        <div class="admin-title">
          <span>⚙ Panel de administración</span>
          <button class="admin-close" id="admin-close-btn" type="button" aria-label="Cerrar panel">✕</button>
        </div>
        <div id="admin-users-list">Cargando…</div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => {
      if (e.target === overlay) {
        overlay.classList.add('hidden');
        overlay.style.display = 'none';
      }
    });
    document.getElementById('admin-close-btn')?.addEventListener('click', () => {
      overlay.classList.add('hidden');
      overlay.style.display = 'none';
    });
    loadAdminUsers();
  }

  async function loadAdminUsers() {
    const list = document.getElementById('admin-users-list');
    if (!list) return;
    list.textContent = 'Cargando…';
    try {
      const res = await LGMDM.api.apiFetch(`/auth/admin/users`);
      if (!res.ok) throw new Error(await res.text());
      const users = await res.json();
      if (!users.length) {
        list.innerHTML = '<div class="lgjs-centered-empty">Sin usuarios registrados</div>';
        return;
      }

      list.innerHTML = users.map(u => {
        const id = LG.ui.escapeHtml(String(u.id ?? ''));
        const email = LG.ui.escapeHtml(String(u.email ?? ''));
        const name = LG.ui.escapeHtml(String(u.name ?? ''));
        const status = LG.ui.escapeHtml(String(u.status ?? 'unknown'));
        const role = String(u.role ?? '');
        const statusClass = ['pending', 'approved', 'rejected'].includes(String(u.status)) ? String(u.status) : 'pending';
        return `
        <div class="user-row" data-id="${id}">
          <div class="user-info">
            <div class="user-email">${email}</div>
            <div class="user-name">${name}</div>
          </div>
          <span class="badge badge-${statusClass}">${status}</span>
          ${role === 'admin' ? '<span class="badge badge-admin">admin</span>' : ''}
          <div class="admin-actions">
            ${u.status !== 'approved' ? `<button type="button" class="admin-btn btn-approve" data-action="approve" data-id="${id}">✓ Aprobar</button>` : ''}
            ${u.status !== 'rejected' && role !== 'admin' ? `<button type="button" class="admin-btn btn-reject" data-action="reject" data-id="${id}">✗ Rechazar</button>` : ''}
            ${role !== 'admin' ? `<button type="button" class="admin-btn btn-delete" data-action="delete" data-id="${id}">🗑</button>` : ''}
          </div>
        </div>`;
      }).join('');

      if (!list.dataset.bound) {
        list.dataset.bound = '1';
        list.addEventListener('click', async e => {
          const btn = e.target.closest('[data-action]');
          if (!btn || !list.contains(btn)) return;
          const { action, id } = btn.dataset;
          btn.disabled = true;
          try {
            let res;
            if (action === 'approve') res = await LGMDM.api.apiFetch(`/auth/admin/approve/${encodeURIComponent(id)}`, { method: 'POST' });
            else if (action === 'reject') res = await LGMDM.api.apiFetch(`/auth/admin/reject/${encodeURIComponent(id)}`, { method: 'POST' });
            else if (action === 'delete') {
              if (!confirm('¿Eliminar este usuario?')) { btn.disabled = false; return; }
              res = await LGMDM.api.apiFetch(`/auth/admin/users/${encodeURIComponent(id)}`, { method: 'DELETE' });
            }
            if (!res?.ok) throw new Error(await res?.text());
            await loadAdminUsers();
          } catch (err) {
            alert('Error: ' + err.message);
            btn.disabled = false;
          }
        });
      }
    } catch (err) {
      list.innerHTML = '<div class="auth-msg error"></div>';
      const errorEl = list.firstElementChild;
      if (errorEl) errorEl.textContent = `Error: ${err.message}`;
    }
  }

  function showMsg(id, text, type) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    el.className = `auth-msg ${type}`;
    el.classList.remove('lgjs-hidden');
  }

  function bindAuthEvents() {
    // Tabs
    const tabLogin = document.getElementById('tab-login');
    const tabReg = document.getElementById('tab-register');
    const formLogin = document.getElementById('form-login');
    const formReg = document.getElementById('form-register');

    tabLogin?.addEventListener('click', () => {
      formLogin?.classList.remove('lgjs-hidden');
      formReg?.classList.add('lgjs-hidden');
      tabLogin.classList.add('active');
      tabLogin.setAttribute('aria-selected', 'true');
      tabReg?.classList.remove('active');
      tabReg?.setAttribute('aria-selected', 'false');
      document.getElementById('login-email')?.focus();
    });

    tabReg?.addEventListener('click', () => {
      formLogin?.classList.add('lgjs-hidden');
      formReg?.classList.remove('lgjs-hidden');
      tabLogin?.classList.remove('active');
      tabLogin?.setAttribute('aria-selected', 'false');
      tabReg.classList.add('active');
      tabReg.setAttribute('aria-selected', 'true');
      document.getElementById('reg-name')?.focus();
    });

    // Login
    const loginBtn = document.getElementById('login-btn');
    async function doLogin() {
      const email = document.getElementById('login-email')?.value?.trim();
      const pwd   = document.getElementById('login-pwd')?.value;
      if (!email || !pwd) { showMsg('login-msg', 'Completá todos los campos', 'error'); return; }
      loginBtn.disabled = true;
      loginBtn.textContent = 'Ingresando…';
      try {
        const res = await LGMDM.api.apiFetch('/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password: pwd }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.detail || `Error de login (HTTP ${res.status})`);
        }
        const data = await res.json();
        saveSession(data.access_token, data.user);
        hideAuthOverlay();
        onAuthenticated(data.user);
      } catch (err) {
        showMsg('login-msg', err.message, 'error');
      } finally {
        loginBtn.disabled = false;
        loginBtn.textContent = 'Ingresar';
      }
    }
    loginBtn?.addEventListener('click', doLogin);

    // Soporte Enter en inputs de login
    const loginEmail = document.getElementById('login-email');
    const loginPwd   = document.getElementById('login-pwd');
    loginEmail?.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        if (!loginPwd?.value) {
          loginPwd?.focus();
        } else {
          doLogin();
        }
      }
    });
    loginPwd?.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });

    // Registro
    const regBtn = document.getElementById('register-btn');
    async function doRegister() {
      const name  = document.getElementById('reg-name')?.value?.trim();
      const email = document.getElementById('reg-email')?.value?.trim();
      const pwd   = document.getElementById('reg-pwd')?.value;
      if (!email || !pwd) { showMsg('reg-msg', 'Completá todos los campos', 'error'); return; }
      regBtn.disabled = true;
      regBtn.textContent = 'Creando cuenta…';
      try {
        const res = await LGMDM.api.apiFetch('/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password: pwd, name }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.detail || `Error de registro (HTTP ${res.status})`);
        }
        const data = await res.json();
        showMsg('reg-msg', '✓ Cuenta creada. Esperá la aprobación del administrador.', 'success');
        const regNameEl = document.getElementById('reg-name');
        const regEmailEl = document.getElementById('reg-email');
        const regPwdEl = document.getElementById('reg-pwd');
        if (regNameEl) regNameEl.value = '';
        if (regEmailEl) regEmailEl.value = '';
        if (regPwdEl) regPwdEl.value = '';
      } catch (err) {
        showMsg('reg-msg', err.message, 'error');
      } finally {
        regBtn.disabled = false;
        regBtn.textContent = 'Crear cuenta';
      }
    }
    regBtn?.addEventListener('click', doRegister);

    // Soporte Enter en inputs de registro
    document.getElementById('reg-name')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('reg-email')?.focus();
    });
    document.getElementById('reg-email')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('reg-pwd')?.focus();
    });
    document.getElementById('reg-pwd')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') doRegister();
    });
  }

  function onAuthenticated(user) {
    renderUserBar(user);
    if (user.role === 'admin') renderAdminButton();
    window.dispatchEvent(new CustomEvent('lgmdm:authenticated', { detail: { user } }));
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  function init() {
    const token = getToken();
    const user  = getUser();

    // Si no hay sesión válida, redirigir inmediatamente a la página de login
    if (!token || !user) {
      window.location.replace('login.html');
      return;
    }

    // Validar sesión previa con el backend
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 4000);

    LGMDM.api.apiFetch('/auth/me', { signal: controller.signal })
      .then(async res => {
        if (res.ok) {
          onAuthenticated(user);
          hideAuthOverlay();
          return;
        }
        clearSession();
        window.location.replace('login.html');
      })
      .catch(() => {
        clearSession();
        window.location.replace('login.html');
      })
      .finally(() => window.clearTimeout(timeoutId));
  }

  // Esperar a que el DOM esté listo
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
