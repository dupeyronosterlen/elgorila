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
    informeFunciones: [],
    informeTotales: {},
    informeError: null,
    informeFuncionSel: null,
    informeVentas: [],
    opsVenta: null,
    auditFilter: '',
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

  const ACCION_TIPOS = {
    reagenda:          { label: 'Reagenda',     cls: 'text-blue-400 border-blue-400/40 bg-blue-400/10' },
    reagendar_boleto:  { label: 'Reagenda',     cls: 'text-blue-400 border-blue-400/40 bg-blue-400/10' },
    reembolso:         { label: 'Reembolso',    cls: 'text-red-400 border-red-400/40 bg-red-400/10' },
    reembolso_venta:   { label: 'Reembolso',    cls: 'text-red-400 border-red-400/40 bg-red-400/10' },
    cancelacion:       { label: 'Cancelación',  cls: 'text-orange-400 border-orange-400/40 bg-orange-400/10' },
    'email.corregido': { label: 'Correo',       cls: 'text-yellow-400 border-yellow-400/40 bg-yellow-400/10' },
    'email.reenviado': { label: 'Reenvío',      cls: 'text-yellow-400 border-yellow-400/40 bg-yellow-400/10' },
    canjear_boleto:    { label: 'Canje',        cls: 'text-green-400 border-green-400/40 bg-green-400/10' },
    canjear_lote:      { label: 'Canje lote',   cls: 'text-green-400 border-green-400/40 bg-green-400/10' },
    venta_manual:      { label: 'Venta taquilla', cls: 'text-primary border-primary/40 bg-primary/10' },
    fiscal_reset:      { label: 'Fiscal',       cls: 'text-yellow-300 border-yellow-300/40 bg-yellow-300/10' },
    crear_usuario:     { label: 'Equipo',       cls: 'text-text-dark/70 border-primary/20 bg-primary/5' },
    actualizar_usuario:{ label: 'Equipo',       cls: 'text-text-dark/70 border-primary/20 bg-primary/5' },
    actualizar_sitio:  { label: 'Sitio',        cls: 'text-text-dark/70 border-primary/20 bg-primary/5' },
  };

  const FILTROS_AUDITORIA = [
    ['', 'Todas las acciones'],
    ['reagenda', 'Reagenda'],
    ['reembolso', 'Reembolso'],
    ['cancelacion', 'Cancelación'],
    ['email', 'Correo / reenvío'],
    ['canje', 'Canje en puerta'],
    ['venta_manual', 'Venta taquilla'],
    ['fiscal', 'Fiscal'],
    ['equipo', 'Equipo / sitio'],
  ];

  function accionTipo(a) {
    const key = (a.accion || '').toLowerCase();
    if (ACCION_TIPOS[key]) return ACCION_TIPOS[key];
    if (key.includes('reagend')) return ACCION_TIPOS.reagenda;
    if (key.includes('reembolso')) return ACCION_TIPOS.reembolso;
    if (key.includes('email')) return ACCION_TIPOS['email.reenviado'];
    if (key.includes('canjear')) return ACCION_TIPOS.canjear_boleto;
    return { label: a.accion || '—', cls: 'text-text-dark/60 border-primary/20 bg-primary/5' };
  }

  function accionCoincideFiltro(a, filtro) {
    if (!filtro) return true;
    const key = (a.accion || '').toLowerCase();
    const metaTipo = (a.meta?.tipo || '').toLowerCase();
    if (filtro === 'reagenda') return key.includes('reagend') || metaTipo === 'reagenda';
    if (filtro === 'reembolso') return key.includes('reembolso');
    if (filtro === 'cancelacion') return metaTipo === 'cancelacion' || (a.detalles || '').toLowerCase().includes('cancelado');
    if (filtro === 'email') return key.includes('email');
    if (filtro === 'canje') return key.includes('canjear');
    if (filtro === 'venta_manual') return key === 'venta_manual';
    if (filtro === 'fiscal') return key.includes('fiscal');
    if (filtro === 'equipo') return key.includes('usuario') || key.includes('sitio');
    return true;
  }

  function badgeAccion(a) {
    const t = accionTipo(a);
    return `<span class="inline-block px-2 py-0.5 text-xs font-mono border rounded ${t.cls}">${esc(t.label)}</span>`;
  }

  async function cargarInformeFunciones() {
    state.informeFunciones = [];
    state.informeTotales = {};
    state.informeError = null;
    try {
      const d = await api(window.teatroAdminApi('informe-funciones'));
      state.informeFunciones = d.funciones || [];
      state.informeTotales = d.totales || {};
      return;
    } catch (e) {
      const msg = e.message || '';
      const es404 = /not found|404/i.test(msg);
      try {
        const d = await api(window.teatroAdminApi('ventas'));
        const ventas = d.ventas || [];
        const stats = {};
        const asisten = {};
        for (const v of ventas) {
          if (v.estado === 'reembolsada') continue;
          const fc = v.fechaContable || (v.reagendado && v.reagendado.de) || v.fecha;
          if (!fc) continue;
          if (!stats[fc]) stats[fc] = { entradasVendidas: 0, ventas: 0, revenue: 0, reembolsos: 0 };
          stats[fc].entradasVendidas += v.cantidad || 0;
          stats[fc].ventas += 1;
          stats[fc].revenue += Number(v.total) || 0;
          const fa = v.fecha;
          if (fa) asisten[fa] = (asisten[fa] || 0) + (v.cantidad || 0);
        }
        state.informeFunciones = Object.entries(stats)
          .filter(([, s]) => s.ventas > 0)
          .map(([fecha_iso, s]) => ({
            fecha_iso,
            nombre: fecha_iso,
            entradasVendidas: s.entradasVendidas,
            ventas: s.ventas,
            revenue: Math.round(s.revenue * 100) / 100,
            asisten: asisten[fecha_iso] || 0,
            reembolsos: 0,
          }))
          .sort((a, b) => a.fecha_iso.localeCompare(b.fecha_iso));
        state.informeTotales = state.informeFunciones.reduce((acc, f) => ({
          entradas: acc.entradas + f.entradasVendidas,
          revenue: Math.round((acc.revenue + f.revenue) * 100) / 100,
          ventas: acc.ventas + f.ventas,
        }), { entradas: 0, revenue: 0, ventas: 0 });
        if (es404) {
          state.informeError = 'Worker sin actualizar — mostrando vista parcial. Ejecuta: npx wrangler deploy';
        } else if (msg) {
          state.informeError = msg;
        }
      } catch {
        state.informeError = es404
          ? 'Informe por función no disponible. Despliega el Worker: npx wrangler deploy'
          : (msg || 'Error al cargar informe');
      }
    }
  }

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
      ['informes', 'Informes', perm('verAuditoria') || perm('verFiscal') || perm('exportarDatos') || perm('verVentas')],
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
      const disp = typeof window.disponiblesAforoTotal === 'function'
        ? window.disponiblesAforoTotal(inv)
        : (inv.disponibles ?? '—');
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

  function certVenta(v) {
    return (v.certificado || v.codigo || '').trim();
  }

  function utmResumen(utm) {
    if (!utm || typeof utm !== 'object') return '—';
    const parts = ['source', 'medium', 'campaign', 'content'].map(k => utm[k]).filter(Boolean);
    return parts.length ? parts.join(' / ') : '—';
  }

  function estadoVentaHtml(v) {
    if (v.estado === 'reembolsada') return '<span class="text-red-400">reembolsado</span>';
    if (v.usado) return '<span class="text-yellow-400">canjeado</span>';
    if (v.reagendado) return '<span class="text-blue-400">reagendado</span>';
    return '<span class="text-green-400">activo</span>';
  }

  function renderVentaRow(v) {
    const cert = certVenta(v);
    const reag = (!v.usado && v.estado !== 'reembolsada' && perm('reagendar'))
      ? `<button type="button" data-reagendar="${esc(cert)}" class="text-xs text-primary underline ml-1">Reagendar</button>` : '';
    const esStripe = v.metodoPago && v.metodoPago !== 'efectivo' && !String(v.sessionId || '').startsWith('manual_');
    const reemb = (perm('reembolsar') && esStripe && v.estado === 'completada' && !v.usado)
      ? `<button type="button" data-reembolso="${esc(cert)}" class="text-xs text-red-400 underline ml-1">Reembolsar</button>` : '';
    return `<tr class="border-b border-primary/10 hover:bg-primary/5 cursor-pointer" data-venta="${esc(cert)}">
      <td class="py-2 pr-2 font-mono text-xs text-primary/90">${esc(cert)}</td>
      <td class="py-2 pr-2 text-sm">${esc(v.nombre || '—')}</td>
      <td class="py-2 pr-2 text-sm max-w-[140px] truncate" title="${esc(v.email || '')}">${esc(v.email || '—')}</td>
      <td class="py-2 pr-2 text-xs font-mono">${esc(v.codigoCupon || '—')}</td>
      <td class="py-2 pr-2 text-xs font-mono">${esc(v.referidoDe || '—')}</td>
      <td class="py-2 pr-2 text-xs">${esc(utmResumen(v.utm))}</td>
      <td class="py-2 pr-2 text-sm">${v.cantidad || 0}</td>
      <td class="py-2 pr-2 text-sm">${fmtMXN(v.total)}</td>
      <td class="py-2 pr-2 text-xs whitespace-nowrap">${fmtFecha(v.fechaCompra)}</td>
      <td class="py-2 text-xs">${estadoVentaHtml(v)}${reag}${reemb}</td>
    </tr>`;
  }

  function renderModalVenta() {
    return `<div id="modal-venta" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 overflow-y-auto">
      <div class="bg-surface-dark border border-primary/30 p-6 max-w-2xl w-full my-8">
        <div class="flex justify-between items-start gap-4 mb-4">
          <h3 class="text-xl font-display text-primary">Detalle de venta</h3>
          <button type="button" id="mv-cerrar" class="text-text-dark/60 hover:text-primary text-2xl leading-none">&times;</button>
        </div>
        <div id="mv-contenido" class="text-sm space-y-3"></div>
        <div id="mv-acciones" class="mt-6 pt-4 border-t border-primary/20 flex flex-wrap gap-2"></div>
        <p id="mv-msg" class="text-sm mt-3 hidden"></p>
      </div>
    </div>`;
  }

  function renderDetalleVenta(v) {
    const cert = certVenta(v);
    const boletos = (v.boletos || []).map(b => `<tr class="border-b border-primary/10">
      <td class="py-1 font-mono text-xs">${esc(b.cert)}</td>
      <td class="py-1 font-mono text-xs">${esc(b.folio || '—')}</td>
      <td class="py-1 text-xs">${esc(b.tipo || '—')}</td>
      <td class="py-1 text-xs">${b.usado ? '<span class="text-yellow-400">canjeado</span>' : 'pendiente'}</td>
    </tr>`).join('') || '<tr><td colspan="4" class="py-2 text-text-dark/50">Sin desglose por boleto</td></tr>';

    const items = (v.items || []).map(it => `${it.cantidad || 1}× ${it.nombre || it.seccion || 'entrada'}`).join(', ') || '—';

    return `<dl class="grid sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
      <div><dt class="text-xs font-mono text-text-dark/50">Certificado</dt><dd class="font-mono text-primary">${esc(cert)}</dd></div>
      <div><dt class="text-xs font-mono text-text-dark/50">Estado</dt><dd>${estadoVentaHtml(v)}</dd></div>
      <div><dt class="text-xs font-mono text-text-dark/50">Nombre</dt><dd>${esc(v.nombre || '—')}</dd></div>
      <div><dt class="text-xs font-mono text-text-dark/50">Correo</dt><dd id="mv-email-actual">${esc(v.email || '—')}</dd></div>
      <div><dt class="text-xs font-mono text-text-dark/50">Teléfono</dt><dd>${esc(v.telefono || '—')}</dd></div>
      <div><dt class="text-xs font-mono text-text-dark/50">Compra</dt><dd>${fmtFecha(v.fechaCompra)}</dd></div>
      <div><dt class="text-xs font-mono text-text-dark/50">Total</dt><dd>${fmtMXN(v.total)} · ${esc(v.metodoPago || '—')}</dd></div>
      <div><dt class="text-xs font-mono text-text-dark/50">Cupón</dt><dd>${esc(v.codigoCupon || '—')}${v.cuponPct != null ? ` (−${v.cuponPct}%)` : ''}</dd></div>
      <div><dt class="text-xs font-mono text-text-dark/50">Referido de</dt><dd class="font-mono text-xs">${esc(v.referidoDe || '—')}</dd></div>
      <div><dt class="text-xs font-mono text-text-dark/50">UTM</dt><dd class="text-xs">${esc(utmResumen(v.utm))}</dd></div>
      <div class="sm:col-span-2"><dt class="text-xs font-mono text-text-dark/50">Entradas</dt><dd>${esc(items)}</dd></div>
      ${v.reagendado ? `<div class="sm:col-span-2"><dt class="text-xs font-mono text-text-dark/50">Contable</dt><dd class="text-xs">${esc(v.fechaContable || '—')} · asiste ${esc(v.fecha)}</dd></div>` : ''}
      ${v.emailAnterior ? `<div class="sm:col-span-2"><dt class="text-xs font-mono text-text-dark/50">Correo anterior</dt><dd class="text-xs text-text-dark/70">${esc(v.emailAnterior)} · corregido ${fmtFecha(v.emailCorregidoEn)}</dd></div>` : ''}
    </dl>
    <h4 class="text-xs font-mono text-text-dark/50 mt-4 mb-2">Boletos (certificados / folios puerta)</h4>
    <div class="overflow-x-auto border border-primary/20">
      <table class="w-full text-left"><thead><tr class="border-b border-primary/20 font-mono text-xs text-text-dark/60">
        <th class="p-2">Cert</th><th class="p-2">Folio puerta</th><th class="p-2">Tipo</th><th class="p-2">Estado</th>
      </tr></thead><tbody>${boletos}</tbody></table>
    </div>
    <p class="text-xs text-text-dark/50 mt-2">
      <a href="compartir-boleto.html?c=${encodeURIComponent(cert)}" target="_blank" rel="noopener" class="text-primary underline">Abrir enlace compartir</a>
    </p>`;
  }

  function renderAccionesVenta(v) {
    const cert = certVenta(v);
    const puedeReenviar = perm('reenviarBoleto') && v.estado !== 'reembolsada';
    const puedeCorregir = perm('corregirEmail') && v.estado !== 'reembolsada';
    let html = '';
    if (puedeReenviar && v.email) {
      html += `<button type="button" id="mv-reenviar" data-cert="${esc(cert)}" class="px-4 py-2 bg-primary/20 border border-primary/30 text-primary text-sm">Reenviar boleto</button>`;
    }
    if (puedeCorregir) {
      html += `<div class="flex flex-wrap gap-2 items-center w-full sm:w-auto">
        <input type="email" id="mv-email-nuevo" placeholder="Correo corregido" class="px-3 py-2 bg-background-dark border border-primary/30 text-sm flex-1 min-w-[200px]" value="${esc(v.email || '')}">
        <button type="button" id="mv-corregir" data-cert="${esc(cert)}" class="px-4 py-2 bg-primary text-background-dark font-semibold text-sm">Corregir y reenviar</button>
      </div>`;
    } else if (puedeReenviar && !v.email) {
      html += `<p class="text-xs text-yellow-400">Sin correo registrado — solo admin/reclamos puede corregir.</p>`;
    }
    return html || '<p class="text-xs text-text-dark/50">Sin acciones de correo con tu rol.</p>';
  }

  async function abrirVentaDetalle(cert) {
    const modal = document.getElementById('modal-venta');
    const contenido = document.getElementById('mv-contenido');
    const acciones = document.getElementById('mv-acciones');
    const msg = document.getElementById('mv-msg');
    if (!modal || !contenido) return;
    msg?.classList.add('hidden');
    contenido.innerHTML = '<p class="text-text-dark/50">Cargando…</p>';
    acciones.innerHTML = '';
    modal.classList.remove('hidden');
    try {
      const v = await api(window.teatroAdminApi(`venta/${encodeURIComponent(cert)}`));
      state.ventaDetalle = v;
      contenido.innerHTML = renderDetalleVenta(v);
      acciones.innerHTML = renderAccionesVenta(v);
      bindModalVentaEvents();
    } catch (e) {
      contenido.innerHTML = `<p class="text-red-300">${esc(e.message)}</p>`;
    }
  }

  async function reenviarEmailVenta(cert, emailNuevo) {
    const body = emailNuevo ? { email: emailNuevo } : {};
    return api(window.teatroAdminApi(`venta/${encodeURIComponent(cert)}/reenviar-email`), {
      method: 'POST', body: JSON.stringify(body),
    });
  }

  function bindModalVentaEvents() {
    document.getElementById('mv-reenviar')?.addEventListener('click', async () => {
      const cert = document.getElementById('mv-reenviar')?.dataset.cert;
      const msg = document.getElementById('mv-msg');
      if (!cert) return;
      try {
        await reenviarEmailVenta(cert);
        if (msg) { msg.textContent = 'Boleto reenviado al correo registrado.'; msg.className = 'text-sm mt-3 text-green-400'; msg.classList.remove('hidden'); }
      } catch (e) {
        if (msg) { msg.textContent = e.message; msg.className = 'text-sm mt-3 text-red-300'; msg.classList.remove('hidden'); }
      }
    });
    document.getElementById('mv-corregir')?.addEventListener('click', async () => {
      const cert = document.getElementById('mv-corregir')?.dataset.cert;
      const email = document.getElementById('mv-email-nuevo')?.value?.trim();
      const msg = document.getElementById('mv-msg');
      if (!cert || !email) { if (msg) { msg.textContent = 'Indica un correo válido.'; msg.className = 'text-sm mt-3 text-red-300'; msg.classList.remove('hidden'); } return; }
      try {
        const r = await reenviarEmailVenta(cert, email);
        if (msg) { msg.textContent = r.emailCorregido ? `Correo actualizado y boleto enviado a ${r.emailEnviado}.` : `Boleto enviado a ${r.emailEnviado}.`; msg.className = 'text-sm mt-3 text-green-400'; msg.classList.remove('hidden'); }
        const el = document.getElementById('mv-email-actual');
        if (el) el.textContent = r.emailEnviado;
        await cargarVentas(state.funcion, document.getElementById('buscar-ventas')?.value?.trim());
        const tbody = document.querySelector('#admin-app tbody');
        if (tbody) tbody.innerHTML = state.ventas.map(renderVentaRow).join('') || '<tr><td colspan="10" class="p-6 text-center text-text-dark/50">Sin ventas</td></tr>';
        bindVentaRowEvents();
      } catch (e) {
        if (msg) { msg.textContent = e.message; msg.className = 'text-sm mt-3 text-red-300'; msg.classList.remove('hidden'); }
      }
    });
  }

  function bindVentaRowEvents() {
    document.querySelectorAll('[data-venta]').forEach(el => {
      el.onclick = (e) => {
        if (e.target.closest('[data-reagendar], [data-reembolso]')) return;
        abrirVentaDetalle(el.dataset.venta);
      };
    });
    document.querySelectorAll('[data-reagendar]').forEach(el => {
      el.onclick = (e) => {
        e.stopPropagation();
        reagendarCodigo = el.dataset.reagendar;
        document.getElementById('reag-codigo').textContent = reagendarCodigo;
        document.getElementById('reagendar-panel')?.classList.remove('hidden');
      };
    });
    document.querySelectorAll('[data-reembolso]').forEach(el => {
      el.onclick = async (e) => {
        e.stopPropagation();
        const cod = el.dataset.reembolso;
        if (!cod) return;
        if (!confirm(`¿Reembolsar ${cod} vía Stripe?\nSe devuelve el cargo y se libera el cupo.`)) return;
        try {
          await api(window.teatroAdminApi('reembolso'), { method: 'POST', body: JSON.stringify({ codigo: cod }) });
          alert('Reembolso procesado. Cupo liberado.');
          paint();
        } catch (err) { alert(err.message); }
      };
    });
  }

  function renderFuncion() {
    const f = state.funciones.find(x => x.fecha_iso === state.funcion);
    const nombre = f ? f.nombre : state.funcion;
    const rows = state.ventas.map(renderVentaRow).join('');

    const opts = state.funciones.filter(x => x.fecha_iso !== state.funcion)
      .map(x => `<option value="${esc(x.fecha_iso)}">${esc(x.nombre)}</option>`).join('');

    return `${navHtml('hub')}
      <div class="flex flex-wrap items-center gap-3 mb-4">
        <button type="button" data-back="teatro" class="text-sm text-primary hover:underline">← Wilberto Cantón</button>
        <h2 class="text-2xl font-display text-primary">${esc(nombre)}</h2>
      </div>
      <div class="flex flex-wrap gap-2 mb-4">
        <input type="search" id="buscar-ventas" placeholder="Nombre, email, certificado, cupón, referido…" class="px-3 py-2 bg-background-dark border border-primary/30 text-sm flex-1 min-w-[200px]">
        <button type="button" id="btn-buscar-ventas" class="px-4 py-2 bg-primary/20 border border-primary/30 text-primary text-sm">Buscar</button>
        ${perm('exportarDatos') ? '<button type="button" id="btn-export-funcion" class="px-4 py-2 bg-primary/20 border border-primary/30 text-primary text-sm">Exportar CSV</button>' : ''}
        ${perm('verificarBoletos') ? '<a href="verificar.html" class="px-4 py-2 border border-primary/30 text-primary text-sm">Verificar</a>' : ''}
      </div>
      <div class="overflow-x-auto border border-primary/20">
        <table class="w-full text-left text-sm min-w-[900px]">
          <thead><tr class="border-b border-primary/20 font-mono text-xs text-text-dark/60">
            <th class="p-2">Certificado</th><th class="p-2">Nombre</th><th class="p-2">Email</th>
            <th class="p-2">Cupón</th><th class="p-2">Referido</th><th class="p-2">UTM</th>
            <th class="p-2">Cant.</th><th class="p-2">Total</th><th class="p-2">Fecha</th><th class="p-2">Estado</th>
          </tr></thead>
          <tbody>${rows || '<tr><td colspan="10" class="p-6 text-center text-text-dark/50">Sin ventas</td></tr>'}</tbody>
        </table>
      </div>
      ${perm('reagendar') ? `<div id="reagendar-panel" class="hidden mt-6 p-4 border border-primary/30 bg-surface-dark/80">
        <p class="text-sm mb-2">Reagendar <strong id="reag-codigo"></strong></p>
        <p class="text-xs text-text-dark/60 mb-3">El boleto se <strong>cancela en la función actual</strong> (libera cupo) y queda <strong>activo en la nueva</strong>. El monto contable permanece en la función original — no se mueve el dinero.</p>
        <select id="reag-destino" class="px-3 py-2 bg-background-dark border border-primary/30 mr-2">${opts}</select>
        <button type="button" id="btn-reagendar-ok" class="px-4 py-2 bg-primary text-background-dark font-semibold">Confirmar cambio</button>
        <button type="button" id="btn-reagendar-cancel" class="px-4 py-2 ml-2 border border-primary/30">Cancelar</button>
      </div>` : ''}
      ${renderModalVenta()}`;
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

  async function cargarVentasFuncion(fecha) {
    if (!fecha) { state.informeVentas = []; return; }
    const d = await api(window.teatroAdminApi(`ventas?fecha=${encodeURIComponent(fecha)}`));
    state.informeVentas = d.ventas || [];
    state.informeFuncionSel = fecha;
  }

  async function refrescarInformes() {
    const jobs = [];
    if (perm('verFiscal')) jobs.push(cargarFiscal().catch(() => { state.fiscal = 0; }));
    if (perm('verVentas')) jobs.push(cargarInformeFunciones());
    if (perm('verAuditoria')) jobs.push(cargarAuditoria().catch(() => { state.auditoria = []; }));
    if (state.informeFuncionSel && perm('verVentas')) {
      jobs.push(cargarVentasFuncion(state.informeFuncionSel).catch(() => { state.informeVentas = []; }));
    }
    await Promise.allSettled(jobs);
  }

  function renderOpsVentaCard() {
    const v = state.opsVenta;
    if (!v) {
      return `<p class="text-xs text-text-dark/50">Busca un certificado CERT-ORD-… para reagendar, reembolsar o reenviar.</p>`;
    }
    const cert = certVenta(v);
    const esStripe = v.metodoPago && v.metodoPago !== 'efectivo' && !String(v.sessionId || '').startsWith('manual_');
    const optsReag = state.funciones.filter(x => x.fecha_iso !== v.fecha)
      .map(x => `<option value="${esc(x.fecha_iso)}">${esc(x.nombre)}</option>`).join('');
    return `<div class="p-4 border border-primary/30 bg-background-dark/50 text-sm space-y-2">
      <div class="flex flex-wrap gap-x-4 gap-y-1">
        <span class="font-mono text-primary">${esc(cert)}</span>
        <span>${esc(v.nombre || '—')}</span>
        <span class="text-text-dark/60">${esc(v.email || '—')}</span>
        <span>${v.cantidad || 0} boleto(s) · ${fmtMXN(v.total)}</span>
        <span class="text-xs">${esc(v.funcionNombre || v.fecha)}</span>
        ${v.fechaContable && v.fechaContable !== v.fecha ? `<span class="text-xs text-blue-400">contable: ${esc(v.fechaContable)}</span>` : ''}
      </div>
      <div class="flex flex-wrap gap-2 pt-2">
        ${perm('reagendar') && !v.usado && v.estado !== 'reembolsada' ? `
          <select id="ops-reag-dest" class="px-2 py-1 bg-background-dark border border-primary/30 text-xs">${optsReag}</select>
          <button type="button" id="ops-reagendar" data-cert="${esc(cert)}" class="px-3 py-1 text-xs border border-blue-400/40 text-blue-400">Reagendar</button>` : ''}
        ${perm('reembolsar') && esStripe && v.estado === 'completada' && !v.usado ? `
          <button type="button" id="ops-reembolso" data-cert="${esc(cert)}" class="px-3 py-1 text-xs border border-red-400/40 text-red-400">Reembolsar</button>` : ''}
        ${perm('reenviarBoleto') && v.estado !== 'reembolsada' && v.email ? `
          <button type="button" id="ops-reenviar" data-cert="${esc(cert)}" class="px-3 py-1 text-xs border border-primary/40 text-primary">Reenviar boleto</button>` : ''}
        ${perm('corregirEmail') && v.estado !== 'reembolsada' ? `
          <input type="email" id="ops-email-nuevo" placeholder="Corregir email" class="px-2 py-1 bg-background-dark border border-primary/30 text-xs" value="${esc(v.email || '')}">
          <button type="button" id="ops-corregir" data-cert="${esc(cert)}" class="px-3 py-1 text-xs bg-primary text-background-dark font-semibold">Corregir y reenviar</button>` : ''}
      </div>
      <p id="ops-msg" class="text-xs hidden"></p>
    </div>`;
  }

  function renderInformeVentasRows() {
    if (!state.informeFuncionSel) return '';
    const fn = state.funciones.find(x => x.fecha_iso === state.informeFuncionSel);
    const nombre = fn ? fn.nombre : state.informeFuncionSel;
    const rows = (state.informeVentas || []).map(v => {
      const cert = certVenta(v);
      return `<tr class="border-b border-primary/10 text-sm">
        <td class="py-2 font-mono text-xs"><button type="button" class="text-primary underline ops-pick-venta" data-cert="${esc(cert)}">${esc(cert)}</button></td>
        <td class="py-2">${esc(v.nombre || '—')}</td>
        <td class="py-2 text-xs">${esc(v.email || '—')}</td>
        <td class="py-2">${v.cantidad || 0}</td>
        <td class="py-2">${fmtMXN(v.total)}</td>
        <td class="py-2 text-xs">${v.estado === 'reembolsada' ? '<span class="text-red-400">reemb.</span>' : v.usado ? '<span class="text-yellow-400">canj.</span>' : '<span class="text-green-400">activo</span>'}</td>
      </tr>`;
    }).join('');
    return `<div class="mb-8">
      <h3 class="text-lg font-display text-primary mb-2">Ventas — ${esc(nombre)}</h3>
      <p class="text-xs text-text-dark/50 mb-2">Clic en certificado para operar abajo. Tras reagendar/reembolso aparece en registro de acciones.</p>
      <div class="overflow-x-auto border border-primary/20 max-h-[280px]">
        <table class="w-full text-left text-sm">
          <thead><tr class="border-b border-primary/20 font-mono text-xs text-text-dark/60 sticky top-0 bg-background-dark">
            <th class="p-2">Certificado</th><th class="p-2">Nombre</th><th class="p-2">Email</th>
            <th class="p-2">Cant.</th><th class="p-2">Total</th><th class="p-2">Estado</th>
          </tr></thead>
          <tbody>${rows || '<tr><td colspan="6" class="p-4 text-center text-text-dark/50">Sin ventas</td></tr>'}</tbody>
        </table>
      </div>
    </div>`;
  }
  function renderInformes() {
    const filtro = state.auditFilter || '';
    const auditoriaFiltrada = state.auditoria.filter(a => accionCoincideFiltro(a, filtro));

    const filtroOpts = FILTROS_AUDITORIA.map(([val, label]) =>
      `<option value="${esc(val)}" ${filtro === val ? 'selected' : ''}>${esc(label)}</option>`
    ).join('');

    const fnRows = (state.informeFunciones || []).map(f => {
      const sel = state.informeFuncionSel === f.fecha_iso ? ' bg-primary/10' : '';
      return `<tr class="border-b border-primary/10 text-sm cursor-pointer hover:bg-primary/5 informe-fn-row${sel}" data-informe-fn="${esc(f.fecha_iso)}">
      <td class="py-2 font-mono text-xs">${esc(f.fecha_iso)}</td>
      <td class="py-2">${esc(f.nombre)}</td>
      <td class="py-2 text-right">${f.entradasVendidas}</td>
      <td class="py-2 text-right">${f.asisten}</td>
      <td class="py-2 text-right font-mono">${fmtMXN(f.revenue)}</td>
      <td class="py-2 text-right text-xs text-text-dark/50">${f.reembolsos ? `${f.reembolsos} reemb.` : '—'}</td>
    </tr>`;
    }).join('');

    const tot = state.informeTotales || {};

    const rows = auditoriaFiltrada.map(a => `<tr class="border-b border-primary/10 text-sm">
      <td class="py-2 font-mono text-xs text-primary/80">${esc(a.id)}</td>
      <td class="py-2 text-xs whitespace-nowrap">${fmtFecha(a.ts)}</td>
      <td class="py-2">${esc(a.usuario)} <span class="text-text-dark/50 text-xs">(${esc(a.rol)})</span></td>
      <td class="py-2">${badgeAccion(a)}</td>
      <td class="py-2 text-text-dark/80">${esc(a.detalles)}</td>
    </tr>`).join('');

    const puedeOps = perm('reagendar') || perm('reembolsar') || perm('reenviarBoleto') || perm('corregirEmail');

    return `${navHtml('informes')}
      <h2 class="text-2xl font-display text-primary mb-4">Informes y auditoría</h2>
      <div class="grid sm:grid-cols-2 gap-4 mb-6">
        ${perm('verFiscal') ? `<div class="p-4 border border-primary/20">
          <div class="text-xs font-mono text-text-dark/50">RESERVA FISCAL</div>
          <div class="text-2xl text-yellow-400">${fmtMXN(state.fiscal)}</div>
          ${perm('fiscalReset') ? '<button type="button" id="btn-fiscal-reset" class="mt-2 text-xs text-yellow-400 underline">Resetear tras pago impuesto</button>' : ''}
        </div>` : ''}
        <div class="p-4 border border-primary/20 flex flex-wrap gap-2 items-end">
          ${perm('exportarDatos') ? '<button type="button" id="btn-export-todo" class="px-4 py-2 bg-primary/20 border border-primary/30 text-primary text-sm">Exportar ventas JSON</button>' : ''}
          <button type="button" id="btn-refrescar-informes" class="px-4 py-2 border border-primary/30 text-primary text-sm">Actualizar movimientos</button>
        </div>
      </div>
      ${puedeOps ? `<div class="mb-8 p-4 border border-primary/30 bg-surface-dark/60">
        <h3 class="text-lg font-display text-primary mb-2">Operaciones — reagenda · reembolso · correo</h3>
        <p class="text-xs text-text-dark/50 mb-3">Cada acción queda registrada abajo en tiempo real para agencia.</p>
        <div class="flex flex-wrap gap-2 mb-3">
          <input type="search" id="ops-buscar-cert" placeholder="CERT-ORD-… o folio" class="px-3 py-2 bg-background-dark border border-primary/30 text-sm flex-1 min-w-[200px]">
          <button type="button" id="ops-buscar-btn" class="px-4 py-2 bg-primary/20 border border-primary/30 text-primary text-sm">Buscar venta</button>
        </div>
        <div id="ops-venta-card">${renderOpsVentaCard()}</div>
      </div>` : ''}
      ${perm('verVentas') ? `<h3 class="text-lg font-display text-primary mb-2">Registro por función</h3>
      ${state.informeError ? `<p class="text-xs text-yellow-400 mb-2">${esc(state.informeError)}</p>` : ''}
      <p class="text-xs text-text-dark/50 mb-3">Clic en una fila para ver ventas y operar. Solo funciones con al menos una venta.</p>
      <div class="overflow-x-auto border border-primary/20 mb-4">
        <table class="w-full text-left text-sm">
          <thead><tr class="border-b border-primary/20 font-mono text-xs text-text-dark/60">
            <th class="p-2">Fecha</th><th class="p-2">Función</th>
            <th class="p-2 text-right">Vendidas</th><th class="p-2 text-right">Asisten</th>
            <th class="p-2 text-right">Ingresos</th><th class="p-2 text-right">Reemb.</th>
          </tr></thead>
          <tbody id="informe-fn-tbody">${fnRows || '<tr><td colspan="6" class="p-6 text-center text-text-dark/50">Sin ventas registradas aún</td></tr>'}</tbody>
          ${fnRows ? `<tfoot><tr class="border-t border-primary/30 font-mono text-xs">
            <td class="p-2" colspan="2">Total</td>
            <td class="p-2 text-right">${tot.entradas || 0}</td>
            <td class="p-2 text-right">—</td>
            <td class="p-2 text-right text-primary">${fmtMXN(tot.revenue)}</td>
            <td class="p-2"></td>
          </tr></tfoot>` : ''}
        </table>
      </div>
      <div id="informe-ventas-wrap">${renderInformeVentasRows()}</div>` : ''}
      ${perm('verAuditoria') ? `<div class="flex flex-wrap items-center gap-3 mb-3">
        <h3 class="text-lg font-display text-primary">Registro de acciones</h3>
        <label class="text-xs font-mono text-text-dark/50 ml-auto">Filtrar:
          <select id="audit-filtro" class="ml-2 px-2 py-1 bg-background-dark border border-primary/30 text-sm">${filtroOpts}</select>
        </label>
      </div>
      <p class="text-xs text-text-dark/50 mb-3">Reagenda = cancelación en origen + activación en destino · monto en función original.</p>
      <div class="overflow-x-auto max-h-[480px] border border-primary/20">
        <table class="w-full text-left"><thead><tr class="border-b border-primary/20 font-mono text-xs sticky top-0 bg-background-dark">
          <th class="p-2">ID</th><th class="p-2">Fecha</th><th class="p-2">Usuario</th><th class="p-2">Tipo</th><th class="p-2">Detalle</th>
        </tr></thead><tbody id="audit-tbody">${rows || '<tr><td colspan="5" class="p-6 text-center text-text-dark/50">Sin registros</td></tr>'}</tbody></table>
      </div>` : '<p class="text-text-dark/50 text-sm">Sin acceso a auditoría con tu rol.</p>'}`;
  }

  async function opsBuscarVenta(cert) {
    const c = (cert || document.getElementById('ops-buscar-cert')?.value || '').trim();
    if (!c) return;
    state.opsVenta = await api(window.teatroAdminApi(`venta/${encodeURIComponent(c)}`));
    const card = document.getElementById('ops-venta-card');
    if (card) card.innerHTML = renderOpsVentaCard();
    bindInformesOps();
  }

  async function opsAfterAction(msg) {
    await refrescarInformes();
    const fnBody = document.getElementById('informe-fn-tbody');
    if (fnBody && state.informeFunciones?.length) {
      fnBody.innerHTML = state.informeFunciones.map(f => {
        const sel = state.informeFuncionSel === f.fecha_iso ? ' bg-primary/10' : '';
        return `<tr class="border-b border-primary/10 text-sm cursor-pointer hover:bg-primary/5 informe-fn-row${sel}" data-informe-fn="${esc(f.fecha_iso)}">
          <td class="py-2 font-mono text-xs">${esc(f.fecha_iso)}</td>
          <td class="py-2">${esc(f.nombre)}</td>
          <td class="py-2 text-right">${f.entradasVendidas}</td>
          <td class="py-2 text-right">${f.asisten}</td>
          <td class="py-2 text-right font-mono">${fmtMXN(f.revenue)}</td>
          <td class="py-2 text-right text-xs text-text-dark/50">${f.reembolsos ? `${f.reembolsos} reemb.` : '—'}</td>
        </tr>`;
      }).join('');
    }
    const auditBody = document.getElementById('audit-tbody');
    if (auditBody && state.auditoria.length) {
      const filtro = state.auditFilter || '';
      auditBody.innerHTML = state.auditoria
        .filter(a => accionCoincideFiltro(a, filtro))
        .map(a => `<tr class="border-b border-primary/10 text-sm">
          <td class="py-2 font-mono text-xs text-primary/80">${esc(a.id)}</td>
          <td class="py-2 text-xs whitespace-nowrap">${fmtFecha(a.ts)}</td>
          <td class="py-2">${esc(a.usuario)} <span class="text-text-dark/50 text-xs">(${esc(a.rol)})</span></td>
          <td class="py-2">${badgeAccion(a)}</td>
          <td class="py-2 text-text-dark/80">${esc(a.detalles)}</td>
        </tr>`).join('');
    }
    const wrap = document.getElementById('informe-ventas-wrap');
    if (wrap) wrap.innerHTML = renderInformeVentasRows();
    if (state.opsVenta) {
      const cert = certVenta(state.opsVenta);
      try {
        state.opsVenta = await api(window.teatroAdminApi(`venta/${encodeURIComponent(cert)}`));
      } catch { /* */ }
      const card = document.getElementById('ops-venta-card');
      if (card) card.innerHTML = renderOpsVentaCard();
    }
    bindInformesOps();
    const m = document.getElementById('ops-msg');
    if (m && msg) { m.textContent = msg; m.className = 'text-xs text-green-400'; m.classList.remove('hidden'); }
  }

  function bindInformesOps() {
    const btnBuscar = document.getElementById('ops-buscar-btn');
    if (btnBuscar) btnBuscar.onclick = () => opsBuscarVenta();
    const inpCert = document.getElementById('ops-buscar-cert');
    if (inpCert) inpCert.onkeydown = (e) => { if (e.key === 'Enter') opsBuscarVenta(); };
    const btnRef = document.getElementById('btn-refrescar-informes');
    if (btnRef) btnRef.onclick = async () => {
      await refrescarInformes();
      document.getElementById('admin-app').innerHTML = renderInformes();
      bindEvents();
    };
    document.querySelectorAll('.informe-fn-row').forEach(el => {
      el.onclick = async () => {
        state.informeFuncionSel = el.dataset.informeFn;
        await cargarVentasFuncion(state.informeFuncionSel);
        document.querySelectorAll('.informe-fn-row').forEach(r => r.classList.remove('bg-primary/10'));
        el.classList.add('bg-primary/10');
        const wrap = document.getElementById('informe-ventas-wrap');
        if (wrap) wrap.innerHTML = renderInformeVentasRows();
        bindInformesOps();
      };
    });
    document.querySelectorAll('.ops-pick-venta').forEach(el => {
      el.onclick = (e) => { e.preventDefault(); opsBuscarVenta(el.dataset.cert); };
    });
    const btnReag = document.getElementById('ops-reagendar');
    if (btnReag) btnReag.onclick = async () => {
      const cert = btnReag.dataset.cert;
      const dest = document.getElementById('ops-reag-dest')?.value;
      if (!cert || !dest || !confirm(`¿Reagendar ${cert} a otra función?`)) return;
      try {
        await api(window.teatroAdminApi('reagendar'), { method: 'POST', body: JSON.stringify({ codigo: cert, fechaDestino: dest }) });
        await opsAfterAction('Reagendado — registrado en acciones.');
      } catch (e) { alert(e.message); }
    };
    const btnReemb = document.getElementById('ops-reembolso');
    if (btnReemb) btnReemb.onclick = async () => {
      const cert = btnReemb.dataset.cert;
      if (!cert || !confirm(`¿Reembolsar ${cert} vía Stripe?`)) return;
      try {
        await api(window.teatroAdminApi('reembolso'), { method: 'POST', body: JSON.stringify({ codigo: cert }) });
        await opsAfterAction('Reembolso procesado — registrado en acciones.');
      } catch (e) { alert(e.message); }
    };
    const btnReenv = document.getElementById('ops-reenviar');
    if (btnReenv) btnReenv.onclick = async () => {
      const cert = btnReenv.dataset.cert;
      if (!cert) return;
      try {
        await api(window.teatroAdminApi(`venta/${encodeURIComponent(cert)}/reenviar-email`), { method: 'POST', body: JSON.stringify({}) });
        await opsAfterAction('Boleto reenviado.');
      } catch (e) { alert(e.message); }
    };
    const btnCorr = document.getElementById('ops-corregir');
    if (btnCorr) btnCorr.onclick = async () => {
      const cert = btnCorr.dataset.cert;
      const email = document.getElementById('ops-email-nuevo')?.value?.trim();
      if (!cert || !email) return;
      try {
        await api(window.teatroAdminApi(`venta/${encodeURIComponent(cert)}/reenviar-email`), { method: 'POST', body: JSON.stringify({ email }) });
        await opsAfterAction('Correo corregido y boleto enviado.');
      } catch (e) { alert(e.message); }
    };
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
        if (!perm('verAuditoria') && !perm('verFiscal') && !perm('exportarDatos') && !perm('verVentas')) {
          state.view = 'hub'; return paint();
        }
        const jobs = [];
        if (perm('verFiscal')) jobs.push(cargarFiscal().catch(() => { state.fiscal = 0; }));
        if (perm('verVentas')) jobs.push(cargarFunciones(), cargarInformeFunciones());
        if (perm('verAuditoria')) jobs.push(cargarAuditoria().catch(() => { state.auditoria = []; }));
        if (state.informeFuncionSel && perm('verVentas')) {
          jobs.push(cargarVentasFuncion(state.informeFuncionSel).catch(() => { state.informeVentas = []; }));
        }
        await Promise.allSettled(jobs);
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
        tbody.innerHTML = state.ventas.map(renderVentaRow).join('')
          || '<tr><td colspan="10" class="p-6 text-center">Sin resultados</td></tr>';
        bindVentaRowEvents();
      };
    }

    bindVentaRowEvents();

    document.getElementById('mv-cerrar')?.addEventListener('click', () => {
      document.getElementById('modal-venta')?.classList.add('hidden');
    });
    document.getElementById('modal-venta')?.addEventListener('click', (e) => {
      if (e.target.id === 'modal-venta') document.getElementById('modal-venta')?.classList.add('hidden');
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

    document.getElementById('audit-filtro')?.addEventListener('change', (e) => {
      state.auditFilter = e.target.value;
      const tbody = document.getElementById('audit-tbody');
      if (!tbody) return;
      const html = state.auditoria
        .filter(a => accionCoincideFiltro(a, state.auditFilter))
        .map(a => `<tr class="border-b border-primary/10 text-sm">
          <td class="py-2 font-mono text-xs text-primary/80">${esc(a.id)}</td>
          <td class="py-2 text-xs whitespace-nowrap">${fmtFecha(a.ts)}</td>
          <td class="py-2">${esc(a.usuario)} <span class="text-text-dark/50 text-xs">(${esc(a.rol)})</span></td>
          <td class="py-2">${badgeAccion(a)}</td>
          <td class="py-2 text-text-dark/80">${esc(a.detalles)}</td>
        </tr>`).join('');
      tbody.innerHTML = html || '<tr><td colspan="5" class="p-6 text-center text-text-dark/50">Sin registros</td></tr>';
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

    if (state.view === 'informes') bindInformesOps();
  }

  function exportCsv(ventas, name) {
    const head = ['certificado', 'nombre', 'email', 'telefono', 'cantidad', 'total', 'metodoPago', 'codigoCupon', 'cuponPct', 'referidoDe', 'utm_source', 'utm_medium', 'utm_campaign', 'fechaCompra', 'estado', 'usado'];
    const lines = [head.join(',')].concat(ventas.map(v => {
      const row = {
        certificado: certVenta(v),
        nombre: v.nombre,
        email: v.email,
        telefono: v.telefono,
        cantidad: v.cantidad,
        total: v.total,
        metodoPago: v.metodoPago,
        codigoCupon: v.codigoCupon,
        cuponPct: v.cuponPct,
        referidoDe: v.referidoDe,
        utm_source: v.utm?.source,
        utm_medium: v.utm?.medium,
        utm_campaign: v.utm?.campaign,
        fechaCompra: v.fechaCompra,
        estado: v.estado,
        usado: v.usado,
      };
      return head.map(k => `"${String(row[k] ?? '').replace(/"/g, '""')}"`).join(',');
    }));
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
      // reclamos y gerente entran al panel (ventas / reenvíos según rol)

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
