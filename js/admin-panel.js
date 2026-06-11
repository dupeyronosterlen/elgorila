/* Panel Admin v3 — Teatros · Equipo · Sitio · Informes */
(function () {
  'use strict';

  const TID = () => window.TEATRO_ID || 'wilberto';

  const state = {
    view: 'hub',
    funcion: null,
    funciones: [],
    ventas: [],
    usuarios: [],
    auditoria: [],
    fiscal: 0,
    sitio: {},
    inv: {},
  };

  function token() { return AuthManager.obtenerAdminToken(); }

  async function api(url, opts = {}) {
    const h = { ...(opts.headers || {}) };
    const t = token();
    if (t) h.Authorization = `Bearer ${t}`;
    if (opts.body && !h['Content-Type']) h['Content-Type'] = 'application/json';
    const res = await fetch(url, { ...opts, headers: h });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
    return data;
  }

  function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function fmtMXN(n) { return `$${(Number(n) || 0).toFixed(2)}`; }

  function fmtFecha(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('es-MX', { timeZone: 'America/Mexico_City', dateStyle: 'short', timeStyle: 'short' });
    } catch { return iso; }
  }

  function esAdmin() {
    const u = AuthManager.obtenerUsuarioActual();
    return u && u.rol === 'admin';
  }

  function perm(p) {
    return AuthManager.tienePermiso(p);
  }

  function navHtml(active) {
    const items = [
      ['hub', 'Teatros', true],
      ['equipo', 'Equipo', perm('gestionarEquipo')],
      ['sitio', 'Sitio web', perm('editarSitio')],
      ['informes', 'Informes', perm('verAuditoria') || perm('verFiscal') || perm('exportarDatos')],
    ].filter(([, , ok]) => ok);
    return `<nav class="flex gap-2 flex-wrap mb-6 border-b border-primary/20 pb-3">
      ${items.map(([id, label]) =>
        `<button type="button" data-nav="${id}" class="px-3 py-1.5 text-sm border ${active === id ? 'border-primary text-primary bg-primary/10' : 'border-transparent text-text-dark/70 hover:text-primary'}">${label}</button>`
      ).join('')}
    </nav>`;
  }

  async function cargarFunciones() {
    const data = await api(window.teatroApi('funciones'));
    state.funciones = data.funciones || [];
  }

  async function cargarFiscal() {
    try {
      const d = await api(window.teatroAdminApi('fiscal'));
      state.fiscal = d.acumulado || 0;
    } catch { state.fiscal = 0; }
  }

  async function cargarVentas(fecha, q) {
    const p = new URLSearchParams();
    if (fecha) p.set('fecha', fecha);
    if (q) p.set('q', q);
    const qs = p.toString();
    const d = await api(window.teatroAdminApi('ventas') + (qs ? `?${qs}` : ''));
    state.ventas = d.ventas || [];
  }

  async function cargarUsuarios() {
    const d = await api(window.teatroAdminSistemaApi('usuarios'));
    state.usuarios = d.usuarios || [];
  }

  async function cargarAuditoria() {
    const d = await api(window.teatroAdminSistemaApi('auditoria?limite=150'));
    state.auditoria = d.entries || [];
  }

  async function cargarSitio() {
    const d = await api(window.teatroAdminSistemaApi('sitio'));
    state.sitio = d.config || {};
  }

  function renderHub() {
    return `${navHtml('hub')}
      <h2 class="text-2xl font-display text-primary mb-4">Teatros</h2>
      <div class="grid gap-4 md:grid-cols-2">
        <button type="button" data-teatro="wilberto" class="text-left p-6 bg-surface-dark/80 border border-primary/30 hover:border-primary/60 transition-colors">
          <h3 class="text-xl font-display text-primary">Teatro Wilberto Cantón</h3>
          <p class="text-sm text-text-dark/60 mt-2">Temporada El Gorila · CDMX</p>
          <p class="text-xs font-mono text-text-dark/50 mt-3 uppercase tracking-widest">Operativo</p>
        </button>
        <div class="p-6 bg-surface-dark/40 border border-primary/10 opacity-60">
          <h3 class="text-xl font-display text-text-dark/50">Carpa Geodésica (CCC)</h3>
          <p class="text-sm text-text-dark/40 mt-2">Histórico · sin funciones activas</p>
        </div>
      </div>`;
  }

  function renderTeatro() {
    const cards = state.funciones.map(f => {
      const inv = state.inv[f.fecha_iso] || {};
      const disp = inv.disponibles ?? '—';
      return `<button type="button" data-funcion="${esc(f.fecha_iso)}" class="text-left p-4 bg-background-dark/50 border border-primary/20 hover:border-primary/40">
        <div class="font-display text-lg text-text-dark">${esc(f.nombre)}</div>
        <div class="font-mono text-xs text-text-dark/50 mt-1">${esc(f.fecha_iso)} · ~${disp} disp.</div>
      </button>`;
    }).join('');

    return `${navHtml('hub')}
      <div class="flex flex-wrap items-center gap-3 mb-4">
        <button type="button" data-back="hub" class="text-sm text-primary hover:underline">← Teatros</button>
        <h2 class="text-2xl font-display text-primary">Wilberto Cantón</h2>
      </div>
      <div class="flex flex-wrap gap-2 mb-6">
        ${perm('venderEfectivo') ? '<a href="boletera.html" class="px-3 py-2 text-sm border border-primary/30 text-primary">Boletera</a>' : ''}
        ${perm('verificarBoletos') ? '<a href="verificar.html" class="px-3 py-2 text-sm border border-primary/30 text-primary">Verificar</a>' : ''}
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        ${perm('verFiscal') ? `<div class="p-4 border border-primary/20"><div class="text-xs font-mono text-text-dark/50">RESERVA FISCAL 8%</div><div class="text-2xl text-yellow-400 font-display">${fmtMXN(state.fiscal)}</div></div>` : ''}
        <div class="p-4 border border-primary/20"><div class="text-xs font-mono text-text-dark/50">FUNCIONES</div><div class="text-2xl text-primary font-display">${state.funciones.length}</div></div>
        ${perm('verVentas') ? `<div class="p-4 border border-primary/20"><div class="text-xs font-mono text-text-dark/50">VENTAS (última carga)</div><div class="text-2xl text-primary font-display">${state.ventas.length}</div></div>` : ''}
      </div>
      <h3 class="text-lg font-display text-primary mb-3">Funciones</h3>
      <div class="grid gap-3 sm:grid-cols-2">${cards || '<p class="text-text-dark/50">Sin funciones en KV.</p>'}</div>`;
  }

  function renderFuncion() {
    const f = state.funciones.find(x => x.fecha_iso === state.funcion);
    const nombre = f ? f.nombre : state.funcion;
    const rows = state.ventas.map(v => {
      const estado = v.usado ? '<span class="text-yellow-400">canjeado</span>'
        : v.reagendado ? '<span class="text-blue-400">reagendado</span>' : '<span class="text-green-400">activo</span>';
      const reag = (!v.usado && perm('reagendar'))
        ? `<button type="button" data-reagendar="${esc(v.codigo)}" class="text-xs text-primary underline ml-2">Reagendar</button>` : '';
      return `<tr class="border-b border-primary/10">
        <td class="py-2 pr-2 font-mono text-xs">${esc(v.codigo)}</td>
        <td class="py-2 pr-2 text-sm">${esc(v.nombre || '—')}</td>
        <td class="py-2 pr-2 text-sm">${esc(v.email || '—')}</td>
        <td class="py-2 pr-2 text-sm">${v.cantidad || 0}</td>
        <td class="py-2 pr-2 text-sm">${fmtMXN(v.total)}</td>
        <td class="py-2 pr-2 text-xs">${esc(v.metodoPago || '—')}</td>
        <td class="py-2 text-xs">${estado}${reag}</td>
      </tr>`;
    }).join('');

    const opts = state.funciones.filter(x => x.fecha_iso !== state.funcion)
      .map(x => `<option value="${esc(x.fecha_iso)}">${esc(x.nombre)}</option>`).join('');

    return `${navHtml('hub')}
      <div class="flex flex-wrap items-center gap-3 mb-4">
        <button type="button" data-back="teatro" class="text-sm text-primary hover:underline">← Wilberto Cantón</button>
        <h2 class="text-2xl font-display text-primary">${esc(nombre)}</h2>
      </div>
      <div class="flex flex-wrap gap-2 mb-4">
        <input type="search" id="buscar-ventas" placeholder="Buscar nombre, email, folio…" class="px-3 py-2 bg-background-dark border border-primary/30 text-sm flex-1 min-w-[200px]">
        <button type="button" id="btn-buscar-ventas" class="px-4 py-2 bg-primary/20 border border-primary/30 text-primary text-sm">Buscar</button>
        ${perm('exportarDatos') ? '<button type="button" id="btn-export-funcion" class="px-4 py-2 bg-primary/20 border border-primary/30 text-primary text-sm">Exportar CSV</button>' : ''}
        ${perm('verificarBoletos') ? '<a href="verificar.html" class="px-4 py-2 border border-primary/30 text-primary text-sm">Verificar</a>' : ''}
      </div>
      <div class="overflow-x-auto border border-primary/20">
        <table class="w-full text-left text-sm">
          <thead><tr class="border-b border-primary/20 font-mono text-xs text-text-dark/60">
            <th class="p-2">Folio</th><th class="p-2">Nombre</th><th class="p-2">Email</th>
            <th class="p-2">Cant.</th><th class="p-2">Total</th><th class="p-2">Pago</th><th class="p-2">Estado</th>
          </tr></thead>
          <tbody>${rows || '<tr><td colspan="7" class="p-6 text-center text-text-dark/50">Sin ventas</td></tr>'}</tbody>
        </table>
      </div>
      ${perm('reagendar') ? `<div id="reagendar-panel" class="hidden mt-6 p-4 border border-primary/30 bg-surface-dark/80">
        <p class="text-sm mb-2">Reagendar <strong id="reag-codigo"></strong> — el dinero queda en la compra original.</p>
        <select id="reag-destino" class="px-3 py-2 bg-background-dark border border-primary/30 mr-2">${opts}</select>
        <button type="button" id="btn-reagendar-ok" class="px-4 py-2 bg-primary text-background-dark font-semibold">Confirmar cambio</button>
        <button type="button" id="btn-reagendar-cancel" class="px-4 py-2 ml-2 border border-primary/30">Cancelar</button>
      </div>` : ''}`;
  }

  function renderEquipo() {
    if (!esAdmin()) return '<p class="text-red-300">Solo el administrador gestiona el equipo.</p>';
    const rows = state.usuarios.map(u => `<tr class="border-b border-primary/10">
      <td class="py-2 font-mono text-sm">${esc(u.id)}</td>
      <td class="py-2">${esc(u.nombre)}</td>
      <td class="py-2 text-sm">${esc(u.rol)}</td>
      <td class="py-2 text-sm">${u.activo ? 'activo' : 'inactivo'}</td>
      <td class="py-2"><button type="button" data-edit-user="${esc(u.id)}" class="text-primary text-xs underline">Editar</button></td>
    </tr>`).join('');

    return `${navHtml('equipo')}
      <div class="flex justify-between items-center mb-4">
        <h2 class="text-2xl font-display text-primary">Equipo</h2>
        <button type="button" id="btn-nuevo-usuario" class="px-4 py-2 bg-primary/20 border border-primary/30 text-primary text-sm">+ Nuevo usuario</button>
      </div>
      <p class="text-sm text-text-dark/60 mb-4">Contraseñas en servidor (KV). Roles: boletera, puerta, gerente, reclamos. Un solo admin principal.</p>
      <table class="w-full text-left"><thead><tr class="border-b border-primary/20 font-mono text-xs text-text-dark/60">
        <th class="pb-2">ID</th><th class="pb-2">Nombre</th><th class="pb-2">Rol</th><th class="pb-2">Estado</th><th class="pb-2"></th>
      </tr></thead><tbody>${rows || '<tr><td colspan="5" class="py-6 text-center text-text-dark/50">Sin usuarios — crea el primero</td></tr>'}</tbody></table>
      <div id="modal-user" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
        <div class="bg-surface-dark border border-primary/30 p-6 max-w-md w-full">
          <h3 class="text-xl font-display text-primary mb-4" id="modal-user-title">Usuario</h3>
          <input type="hidden" id="mu-edit-id">
          <label class="block text-xs font-mono mb-1">ID usuario</label>
          <input id="mu-id" class="w-full mb-3 px-3 py-2 bg-background-dark border border-primary/30">
          <label class="block text-xs font-mono mb-1">Nombre</label>
          <input id="mu-nombre" class="w-full mb-3 px-3 py-2 bg-background-dark border border-primary/30">
          <label class="block text-xs font-mono mb-1">Rol</label>
          <select id="mu-rol" class="w-full mb-3 px-3 py-2 bg-background-dark border border-primary/30">
            <option value="taquilla">Boletera</option>
            <option value="validacion">Puerta (verificar)</option>
            <option value="gerente">Gerente</option>
            <option value="reclamos">Reclamos</option>
          </select>
          <label class="block text-xs font-mono mb-1">Contraseña</label>
          <input type="password" id="mu-pass" class="w-full mb-4 px-3 py-2 bg-background-dark border border-primary/30" autocomplete="new-password">
          <label class="flex items-center gap-2 mb-4 text-sm"><input type="checkbox" id="mu-activo" checked> Activo</label>
          <div class="flex gap-2">
            <button type="button" id="mu-guardar" class="flex-1 py-2 bg-primary text-background-dark font-semibold">Guardar</button>
            <button type="button" id="mu-cerrar" class="flex-1 py-2 border border-primary/30">Cerrar</button>
          </div>
          <p id="mu-error" class="text-red-300 text-sm mt-2 hidden"></p>
        </div>
      </div>`;
  }

  function renderSitio() {
    const s = state.sitio;
    return `${navHtml('sitio')}
      <h2 class="text-2xl font-display text-primary mb-4">Sitio web</h2>
      <p class="text-sm text-text-dark/60 mb-4">Guardado en servidor (KV). La portada pública leerá esto cuando conectemos index.</p>
      <div class="space-y-4 max-w-xl">
        <div><label class="text-xs font-mono">Instagram URL</label>
          <input id="sitio-instagram" class="w-full px-3 py-2 bg-background-dark border border-primary/30" value="${esc(s.instagram || '')}"></div>
        <div><label class="text-xs font-mono">WhatsApp (52…)</label>
          <input id="sitio-whatsapp" class="w-full px-3 py-2 bg-background-dark border border-primary/30" value="${esc(s.whatsapp || '')}"></div>
        <div><label class="text-xs font-mono">Email contacto</label>
          <input id="sitio-email" class="w-full px-3 py-2 bg-background-dark border border-primary/30" value="${esc(s.email || '')}"></div>
        <div><label class="text-xs font-mono">Sinopsis (texto portada)</label>
          <textarea id="sitio-sinopsis" rows="5" class="w-full px-3 py-2 bg-background-dark border border-primary/30">${esc(s.sinopsis || '')}</textarea></div>
        <label class="flex items-center gap-2 text-sm"><input type="checkbox" id="sitio-footer-admin" ${s.mostrarAdminFooter ? 'checked' : ''}> Mostrar enlace admin en footer</label>
        <button type="button" id="btn-guardar-sitio" class="px-6 py-2 bg-primary text-background-dark font-semibold">Guardar en servidor</button>
      </div>`;
  }

  function renderInformes() {
    const rows = state.auditoria.map(a => `<tr class="border-b border-primary/10 text-sm">
      <td class="py-2 font-mono text-xs text-primary/80">${esc(a.id)}</td>
      <td class="py-2 text-xs">${fmtFecha(a.ts)}</td>
      <td class="py-2">${esc(a.usuario)} <span class="text-text-dark/50 text-xs">(${esc(a.rol)})</span></td>
      <td class="py-2 font-mono text-xs">${esc(a.accion)}</td>
      <td class="py-2 text-text-dark/80">${esc(a.detalles)}</td>
    </tr>`).join('');

    return `${navHtml('informes')}
      <h2 class="text-2xl font-display text-primary mb-4">Informes y auditoría</h2>
      <div class="grid sm:grid-cols-2 gap-4 mb-6">
        ${perm('verFiscal') ? `<div class="p-4 border border-primary/20">
          <div class="text-xs font-mono text-text-dark/50">RESERVA FISCAL</div>
          <div class="text-2xl text-yellow-400">${fmtMXN(state.fiscal)}</div>
          ${perm('fiscalReset') ? '<button type="button" id="btn-fiscal-reset" class="mt-2 text-xs text-yellow-400 underline">Resetear tras pago impuesto</button>' : ''}
        </div>` : ''}
        ${perm('exportarDatos') ? `<div class="p-4 border border-primary/20">
          <button type="button" id="btn-export-todo" class="px-4 py-2 bg-primary/20 border border-primary/30 text-primary text-sm">Exportar ventas JSON</button>
        </div>` : ''}
      </div>
      ${perm('verAuditoria') ? `<h3 class="text-lg font-display text-primary mb-2">Registro de acciones</h3>
      <p class="text-xs text-text-dark/50 mb-3">Cada acción tiene ID único (AUD-…). Reagendos, canjes, ventas, equipo.</p>
      <div class="overflow-x-auto max-h-[480px] border border-primary/20">
        <table class="w-full text-left"><thead><tr class="border-b border-primary/20 font-mono text-xs sticky top-0 bg-background-dark">
          <th class="p-2">ID</th><th class="p-2">Fecha</th><th class="p-2">Usuario</th><th class="p-2">Acción</th><th class="p-2">Detalle</th>
        </tr></thead><tbody>${rows || '<tr><td colspan="5" class="p-6 text-center text-text-dark/50">Sin registros</td></tr>'}</tbody></table>
      </div>` : '<p class="text-text-dark/50 text-sm">Sin acceso a auditoría con tu rol.</p>'}`;
  }

  let reagendarCodigo = null;

  async function paint() {
    const app = document.getElementById('admin-app');
    if (!app) return;
    app.innerHTML = '<p class="text-text-dark/50">Cargando…</p>';
    try {
      if (state.view === 'hub') app.innerHTML = renderHub();
      else if (state.view === 'teatro') {
        const jobs = [cargarFunciones()];
        if (perm('verFiscal')) jobs.push(cargarFiscal());
        if (perm('verVentas')) jobs.push(cargarVentas());
        await Promise.all(jobs);
        for (const f of state.funciones) {
          try {
            const d = await api(window.teatroApi(`disponibilidad?fecha=${f.fecha_iso}`));
            state.inv[f.fecha_iso] = d;
          } catch { /* */ }
        }
        app.innerHTML = renderTeatro();
      } else if (state.view === 'funcion') {
        await cargarVentas(state.funcion);
        app.innerHTML = renderFuncion();
      } else if (state.view === 'equipo') {
        if (!perm('gestionarEquipo')) { state.view = 'hub'; return paint(); }
        await cargarUsuarios();
        app.innerHTML = renderEquipo();
      } else if (state.view === 'sitio') {
        if (!perm('editarSitio')) { state.view = 'hub'; return paint(); }
        await cargarSitio();
        app.innerHTML = renderSitio();
      } else if (state.view === 'informes') {
        if (!perm('verAuditoria') && !perm('verFiscal') && !perm('exportarDatos')) { state.view = 'hub'; return paint(); }
        const jobs = [];
        if (perm('verFiscal')) jobs.push(cargarFiscal());
        if (perm('verAuditoria')) jobs.push(cargarAuditoria());
        await Promise.all(jobs);
        app.innerHTML = renderInformes();
      }
      bindEvents();
    } catch (e) {
      app.innerHTML = `<p class="text-red-300">${esc(e.message)}</p>`;
    }
  }

  function bindEvents() {
    document.querySelectorAll('[data-nav]').forEach(el => {
      el.onclick = () => { state.view = el.dataset.nav; paint(); };
    });
    document.querySelectorAll('[data-teatro]').forEach(el => {
      el.onclick = () => { state.view = 'teatro'; paint(); };
    });
    document.querySelectorAll('[data-back]').forEach(el => {
      el.onclick = () => {
        state.view = el.dataset.back === 'hub' ? 'hub' : 'teatro';
        if (state.view === 'teatro') state.funcion = null;
        paint();
      };
    });
    document.querySelectorAll('[data-funcion]').forEach(el => {
      el.onclick = () => { state.funcion = el.dataset.funcion; state.view = 'funcion'; paint(); };
    });

    const btnBuscar = document.getElementById('btn-buscar-ventas');
    if (btnBuscar) {
      btnBuscar.onclick = async () => {
        const q = document.getElementById('buscar-ventas')?.value?.trim();
        await cargarVentas(state.funcion, q);
        const tbody = document.querySelector('#admin-app tbody');
        if (!tbody) return;
        tbody.innerHTML = state.ventas.map(v => {
          const estado = v.usado ? 'canjeado' : v.reagendado ? 'reagendado' : 'activo';
          return `<tr class="border-b border-primary/10"><td class="py-2 font-mono text-xs">${esc(v.codigo)}</td><td class="py-2">${esc(v.nombre)}</td><td class="py-2">${esc(v.email)}</td><td class="py-2">${v.cantidad}</td><td class="py-2">${fmtMXN(v.total)}</td><td class="py-2">${esc(v.metodoPago)}</td><td class="py-2">${estado}</td></tr>`;
        }).join('') || '<tr><td colspan="7" class="p-6 text-center">Sin resultados</td></tr>';
      };
    }

    document.querySelectorAll('[data-reagendar]').forEach(el => {
      el.onclick = () => {
        reagendarCodigo = el.dataset.reagendar;
        document.getElementById('reag-codigo').textContent = reagendarCodigo;
        document.getElementById('reagendar-panel')?.classList.remove('hidden');
      };
    });
    document.getElementById('btn-reagendar-cancel')?.addEventListener('click', () => {
      document.getElementById('reagendar-panel')?.classList.add('hidden');
      reagendarCodigo = null;
    });
    document.getElementById('btn-reagendar-ok')?.addEventListener('click', async () => {
      const dest = document.getElementById('reag-destino')?.value;
      if (!reagendarCodigo || !dest) return;
      try {
        await api(window.teatroAdminApi('reagendar'), {
          method: 'POST', body: JSON.stringify({ codigo: reagendarCodigo, fechaDestino: dest }),
        });
        alert('Boleto reagendado. Registrado en auditoría.');
        paint();
      } catch (e) { alert(e.message); }
    });

    document.getElementById('btn-export-funcion')?.addEventListener('click', () => exportCsv(state.ventas, `ventas_${state.funcion}.csv`));
    document.getElementById('btn-export-todo')?.addEventListener('click', async () => {
      await cargarVentas();
      const blob = new Blob([JSON.stringify(state.ventas, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `ventas_${TID()}_${Date.now()}.json`;
      a.click();
    });

    document.getElementById('btn-fiscal-reset')?.addEventListener('click', async () => {
      if (!confirm('¿Resetear reserva fiscal a $0?')) return;
      try {
        await api(window.teatroAdminApi('fiscal/reset'), { method: 'POST' });
        paint();
      } catch (e) { alert(e.message); }
    });

    document.getElementById('btn-nuevo-usuario')?.addEventListener('click', () => openUserModal());
    document.querySelectorAll('[data-edit-user]').forEach(el => {
      el.onclick = () => openUserModal(el.dataset.editUser);
    });
    document.getElementById('mu-cerrar')?.addEventListener('click', () => document.getElementById('modal-user')?.classList.add('hidden'));
    document.getElementById('mu-guardar')?.addEventListener('click', guardarUsuario);

    document.getElementById('btn-guardar-sitio')?.addEventListener('click', async () => {
      const config = {
        instagram: document.getElementById('sitio-instagram')?.value?.trim(),
        whatsapp: document.getElementById('sitio-whatsapp')?.value?.trim(),
        email: document.getElementById('sitio-email')?.value?.trim(),
        sinopsis: document.getElementById('sitio-sinopsis')?.value?.trim(),
        mostrarAdminFooter: document.getElementById('sitio-footer-admin')?.checked,
      };
      try {
        await api(window.teatroAdminSistemaApi('sitio'), { method: 'PUT', body: JSON.stringify({ config }) });
        alert('Sitio guardado en servidor.');
      } catch (e) { alert(e.message); }
    });
  }

  function exportCsv(ventas, name) {
    const head = ['codigo', 'nombre', 'email', 'cantidad', 'total', 'metodoPago', 'fechaCompra', 'usado'];
    const lines = [head.join(',')].concat(ventas.map(v =>
      head.map(k => `"${String(v[k] ?? '').replace(/"/g, '""')}"`).join(',')
    ));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
    a.download = name;
    a.click();
  }

  function openUserModal(editId) {
    const m = document.getElementById('modal-user');
    if (!m) return;
    m.classList.remove('hidden');
    document.getElementById('mu-error')?.classList.add('hidden');
    const u = editId ? state.usuarios.find(x => x.id === editId) : null;
    document.getElementById('modal-user-title').textContent = u ? 'Editar usuario' : 'Nuevo usuario';
    document.getElementById('mu-edit-id').value = u?.id || '';
    document.getElementById('mu-id').value = u?.id || '';
    document.getElementById('mu-id').disabled = !!u;
    document.getElementById('mu-nombre').value = u?.nombre || '';
    document.getElementById('mu-rol').value = u?.rol || 'taquilla';
    document.getElementById('mu-pass').value = '';
    document.getElementById('mu-activo').checked = u ? u.activo !== false : true;
  }

  async function guardarUsuario() {
    const editId = document.getElementById('mu-edit-id')?.value;
    const err = document.getElementById('mu-error');
    try {
      if (editId) {
        const body = {
          nombre: document.getElementById('mu-nombre')?.value,
          rol: document.getElementById('mu-rol')?.value,
          activo: document.getElementById('mu-activo')?.checked,
        };
        const p = document.getElementById('mu-pass')?.value;
        if (p) body.password = p;
        await api(window.teatroAdminSistemaApi(`usuarios/${editId}`), { method: 'PUT', body: JSON.stringify(body) });
      } else {
        await api(window.teatroAdminSistemaApi('usuarios'), {
          method: 'POST',
          body: JSON.stringify({
            id: document.getElementById('mu-id')?.value,
            nombre: document.getElementById('mu-nombre')?.value,
            rol: document.getElementById('mu-rol')?.value,
            password: document.getElementById('mu-pass')?.value,
          }),
        });
      }
      document.getElementById('modal-user')?.classList.add('hidden');
      paint();
    } catch (e) {
      if (err) { err.textContent = e.message; err.classList.remove('hidden'); }
    }
  }

  window.AdminPanel = {
    iniciar(usuario) {
      if (usuario.rol === 'taquilla') { window.location.href = 'boletera.html'; return; }
      if (usuario.rol === 'validacion') { window.location.href = 'verificar.html'; return; }

      const elU = document.getElementById('usuario-actual');
      const elR = document.getElementById('rol-actual');
      if (elU) elU.textContent = usuario.nombre || usuario.usuarioId;
      if (elR) elR.textContent = (usuario.rol || 'admin').toUpperCase();
      const lb = document.getElementById('link-boletera');
      const lv = document.getElementById('link-verificar');
      if (lb) lb.classList.toggle('hidden', !perm('venderEfectivo'));
      if (lv) lv.classList.toggle('hidden', !perm('verificarBoletos'));
      if (!esAdmin()) state.view = 'hub';
      paint();
    },
  };

  window.verificarAcceso = async function verificarAcceso() {
    const usuarioId = document.getElementById('usuario-input')?.value?.trim();
    const password  = document.getElementById('password-input')?.value;
    const errorDiv  = document.getElementById('error-login');
    if (errorDiv) errorDiv.classList.add('hidden');
    if (!usuarioId || !password) {
      if (errorDiv) { errorDiv.textContent = 'Ingresa usuario y contraseña'; errorDiv.classList.remove('hidden'); }
      return;
    }
    const resultado = await AuthManager.autenticarAdmin(usuarioId, password);
    if (!resultado.exito) {
      if (errorDiv) { errorDiv.textContent = resultado.error || 'Credenciales incorrectas'; errorDiv.classList.remove('hidden'); }
      return;
    }
    document.getElementById('login-screen')?.classList.add('hidden');
    document.getElementById('admin-panel')?.classList.remove('hidden');
    AdminPanel.iniciar(resultado.usuario);
  };

  window.cerrarSesion = function cerrarSesion() {
    AuthManager.cerrarSesion();
    location.reload();
  };

  document.addEventListener('DOMContentLoaded', () => {
    const u = AuthManager.obtenerUsuarioActual();
    if (u) {
      document.getElementById('login-screen')?.classList.add('hidden');
      document.getElementById('admin-panel')?.classList.remove('hidden');
      AdminPanel.iniciar(u);
    }
    document.addEventListener('keypress', e => {
      if (e.key === 'Enter' && !document.getElementById('login-screen')?.classList.contains('hidden')) {
        verificarAcceso();
      }
    });
  });
})();
