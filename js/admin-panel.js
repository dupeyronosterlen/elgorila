/* Panel Admin v3 — Teatros · Equipo · Sitio · Informes */
(function () {
  'use strict';

  const TID = () => window.TEATRO_ID || 'wilberto';

  function msgReagendarOk(data) {
    if (!data || typeof data !== 'object') return 'Reagendado — registrado en auditoría.';
    if (data.sinEmail) return 'Reagendado. Sin correo en la venta — usa «Reenviar email» si hace falta.';
    if (data.emailEnviado) return 'Reagendado. Correo enviado al comprador con la nueva función y QR.';
    return 'Reagendado. No se pudo enviar el correo — usa «Reenviar email».';
  }

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
    compradores: [],
    compradoresResumen: null,
    compradoresOrgs: [],
    opsVenta: null,
    auditFilter: '',
    chipFuncion: null,
    ventasEstado: '',
    drawerVenta: null,
    v4Bound: false,
    opsInformes: [],
  };

  const OPS_INF_KEY = 'elgorila_ops_informes_v1';

  const IS_V4 = () => !!document.getElementById('view-hub');

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
    eliminacion:       { label: 'Eliminación',  cls: 'text-red-300 border-red-300/40 bg-red-300/10' },
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
    ['eliminacion', 'Eliminación'],
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
    if (key.includes('eliminacion')) return ACCION_TIPOS.eliminacion;
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
    if (filtro === 'eliminacion') return key.includes('eliminacion') || metaTipo === 'eliminacion';
    if (filtro === 'cancelacion') return metaTipo === 'cancelacion' || (a.detalles || '').toLowerCase().includes('cancelado');
    if (filtro === 'email') return key.includes('email');
    if (filtro === 'canje') return key.includes('canjear');
    if (filtro === 'acceso') return key.includes('acceso_taquilla');
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

  async function cargarFunciones(soloVenta) {
    const url = soloVenta
      ? window.teatroApi('funciones')
      : window.teatroAdminApi('funciones');
    const data = await api(url);
    state.funciones = typeof SelectorFunciones !== 'undefined'
      ? SelectorFunciones.normalizarLista(data)
      : (Array.isArray(data) ? data : (data.funciones || []));
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
        ${perm('venderEfectivo') ? '<button type="button" onclick="abrirBoletera()" class="px-3 py-2 text-sm border border-primary/30 text-primary">Boletera</button>' : ''}
        ${perm('verificarBoletos') ? '<button type="button" onclick="abrirVerificar()" class="px-3 py-2 text-sm border border-primary/30 text-primary">Verificar</button>' : ''}
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
    const reemb = (perm('reembolsar') && v.estado === 'completada' && !v.usado)
      ? `<button type="button" data-reembolso="${esc(cert)}" class="text-xs text-red-400 underline ml-1">${esStripe ? 'Reembolsar' : 'Anular venta'}</button>` : '';
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
      <a href="compartir-boleto.html?c=${encodeURIComponent(cert)}" target="_blank" rel="noopener" class="text-primary underline">Vista previa boleto (staff)</a>
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
        const v = state.ventas.find(x => certVenta(x) === reagendarCodigo);
        reagendarExcluirFecha = v?.fecha || state.funcion || null;
        document.getElementById('reag-codigo').textContent = reagendarCodigo;
        document.getElementById('reagendar-panel')?.classList.remove('hidden');
        v4RenderReagDest(reagendarExcluirFecha);
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

    const opts = state.funciones.filter(x => x.fecha_iso !== state.funcion);

    return `${navHtml('hub')}
      <div class="flex flex-wrap items-center gap-3 mb-4">
        <button type="button" data-back="teatro" class="text-sm text-primary hover:underline">← Wilberto Cantón</button>
        <h2 class="text-2xl font-display text-primary">${esc(nombre)}</h2>
      </div>
      <div class="flex flex-wrap gap-2 mb-4">
        <input type="search" id="buscar-ventas" placeholder="Nombre, email, certificado, cupón, referido…" class="px-3 py-2 bg-background-dark border border-primary/30 text-sm flex-1 min-w-[200px]">
        <button type="button" id="btn-buscar-ventas" class="px-4 py-2 bg-primary/20 border border-primary/30 text-primary text-sm">Buscar</button>
        ${perm('exportarDatos') ? '<button type="button" id="btn-export-funcion" class="px-4 py-2 bg-primary/20 border border-primary/30 text-primary text-sm">Exportar CSV</button>' : ''}
        ${perm('reenviarBoleto') ? '<button type="button" id="btn-email-post-funcion" class="px-4 py-2 bg-primary/20 border border-primary/30 text-primary text-sm">Email post-función (22h)</button>' : ''}
        ${perm('verificarBoletos') ? '<button type="button" onclick="abrirVerificar()" class="px-4 py-2 border border-primary/30 text-primary text-sm">Verificar</button>' : ''}
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
        <div id="reag-destino-grid" class="mb-3"></div>
        <input type="hidden" id="reag-destino" value="">
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

  function compQueryParams() {
    const desde = document.getElementById('comp-desde')?.value || '';
    const hasta = document.getElementById('comp-hasta')?.value || '';
    const organizacion = document.getElementById('comp-organizacion')?.value || '';
    const funcion = document.getElementById('comp-funcion')?.value || '';
    const q = document.getElementById('comp-buscar')?.value?.trim() || '';
    const soloActivas = document.getElementById('comp-solo-activas')?.checked !== false;
    const p = new URLSearchParams();
    if (desde) p.set('desde', desde);
    if (hasta) p.set('hasta', hasta);
    if (organizacion) p.set('organizacion', organizacion);
    if (funcion) p.set('funcion', funcion);
    if (q) p.set('q', q);
    if (!soloActivas) p.set('soloActivas', '0');
    return p.toString();
  }

  async function cargarCompradores() {
    const qs = compQueryParams();
    const d = await api(window.teatroAdminApi(`compradores${qs ? `?${qs}` : ''}`));
    state.compradores = d.compradores || [];
    state.compradoresResumen = d.resumen || null;
    state.compradoresOrgs = d.organizaciones || [];
  }

  function v4FillCompFuncionesSelect() {
    const sel = document.getElementById('comp-funcion');
    if (!sel) return;
    const prev = sel.value;
    const opts = ['<option value="">Cualquier fecha</option>'].concat(
      (state.funciones || []).map(f =>
        `<option value="${esc(f.fecha_iso)}"${prev === f.fecha_iso ? ' selected' : ''}>${esc(f.nombre || f.fecha_iso)}</option>`,
      ),
    );
    sel.innerHTML = opts.join('');
  }

  function v4FillCompOrgSelect() {
    const sel = document.getElementById('comp-organizacion');
    if (!sel) return;
    const prev = sel.value;
    const orgs = state.compradoresOrgs.length
      ? state.compradoresOrgs
      : [...new Set((state.compradores || []).map(v => v.organizacion).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, 'es'),
      );
    const opts = ['<option value="">Todas</option>'].concat(
      orgs.map(o => `<option value="${esc(o)}"${prev === o ? ' selected' : ''}>${esc(o)}</option>`),
    );
    sel.innerHTML = opts.join('');
  }

  function v4RenderCompradoresResumen() {
    const r = state.compradoresResumen;
    v4SetText('comp-stat-ventas', r ? String(r.ventas ?? 0) : '—');
    v4SetText('comp-stat-entradas', r ? String(r.entradas ?? 0) : '—');
    v4SetText('comp-stat-revenue', r ? fmtMXN(r.revenue) : '—');
    const countEl = document.getElementById('comp-count');
    if (countEl) countEl.textContent = r ? `${r.ventas} compra(s) · ${r.entradas} entrada(s)` : '—';

    const orgWrap = document.getElementById('comp-org-wrap');
    if (!orgWrap) return;
    const rows = (r?.porOrganizacion || []).slice(0, 12);
    if (!rows.length) {
      orgWrap.innerHTML = '';
      return;
    }
    orgWrap.innerHTML = `<div class="page-hd" style="border:none;padding:0 0 8px">
        <h2 style="font-family:var(--display);font-size:18px;color:var(--fg)">Por organización / canal</h2>
      </div>
      <div class="table-wrap"><table>
        <thead><tr>
          <th>Organización</th>
          <th style="text-align:right">Ventas</th>
          <th style="text-align:right">Entradas</th>
          <th style="text-align:right">Ingresos</th>
        </tr></thead>
        <tbody>${rows.map(o => `<tr>
          <td>${esc(o.organizacion)}</td>
          <td class="td-num">${o.ventas}</td>
          <td class="td-num">${o.entradas}</td>
          <td class="td-num">${fmtMXN(o.revenue)}</td>
        </tr>`).join('')}</tbody>
      </table></div>`;
  }

  function v4RenderCompradoresTable() {
    const tbody = document.getElementById('comp-tbody');
    if (!tbody) return;
    const rows = (state.compradores || []).map(v => {
      const cert = certVenta(v);
      return `<tr>
        <td style="font-family:var(--mono);font-size:10px;white-space:nowrap">${fmtFecha(v.fechaCompra)}</td>
        <td class="td-mono"><button type="button" class="td-btn ops-pick-comp" data-cert="${esc(cert)}">${esc(cert)}</button></td>
        <td>${esc(v.nombre || '—')}</td>
        <td class="td-email">${esc(v.email || '—')}</td>
        <td style="font-size:11px">${esc(v.organizacion || '—')}</td>
        <td style="font-size:11px">${esc(v.funcionNombre || v.fecha || '—')}</td>
        <td class="td-num">${v.cantidad || 0}</td>
        <td class="td-num">${fmtMXN(v.total)}</td>
        <td>${v4EstadoBadge(v)}</td>
      </tr>`;
    }).join('');
    tbody.innerHTML = rows || '<tr><td colspan="9" style="padding:24px;text-align:center;color:var(--soft)">Sin compradores con estos filtros</td></tr>';
    tbody.querySelectorAll('.ops-pick-comp').forEach(btn => {
      btn.onclick = () => {
        state.view = 'ops';
        v4ShowView('ops');
        v4BuscarVenta(btn.dataset.cert);
      };
    });
  }

  function v4RenderCompradores() {
    v4FillCompFuncionesSelect();
    v4FillCompOrgSelect();
    v4RenderCompradoresResumen();
    v4RenderCompradoresTable();
    v4Toggle('btn-comp-export', perm('exportarDatos') && (state.compradores?.length > 0));
  }

  async function v4BuscarCompradores() {
    const tbody = document.getElementById('comp-tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="9" style="padding:24px;text-align:center;color:var(--soft)">Cargando…</td></tr>';
    try {
      await cargarCompradores();
      v4RenderCompradores();
    } catch (e) {
      if (tbody) tbody.innerHTML = `<tr><td colspan="9" style="padding:24px;text-align:center;color:#facc15">${esc(e.message)}</td></tr>`;
    }
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
          <div id="ops-reag-dest-grid" style="width:100%;margin-bottom:6px"></div>
          <input type="hidden" id="ops-reag-dest" value="">
          <button type="button" id="ops-reagendar" data-cert="${esc(cert)}" data-fecha-actual="${esc(v.fecha)}" class="px-3 py-1 text-xs border border-blue-400/40 text-blue-400">Reagendar</button>` : ''}
        ${perm('reembolsar') && v.estado === 'completada' && !v.usado ? `
          <button type="button" id="ops-reembolso" data-cert="${esc(cert)}" class="px-3 py-1 text-xs border border-red-400/40 text-red-400">${esStripe ? 'Reembolsar' : 'Anular venta'}</button>` : ''}
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
    if (state.opsVenta?.fecha) v4RenderReagDest(state.opsVenta.fecha);
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
        const data = await api(window.teatroAdminApi('reagendar'), { method: 'POST', body: JSON.stringify({ codigo: cert, fechaDestino: dest }) });
        await opsAfterAction(msgReagendarOk(data));
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
  let reagendarExcluirFecha = null;

  async function paint() {
    if (IS_V4()) return v4Paint();
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
        const data = await api(window.teatroAdminApi('reagendar'), {
          method: 'POST', body: JSON.stringify({ codigo: reagendarCodigo, fechaDestino: dest }),
        });
        alert(msgReagendarOk(data));
        paint();
      } catch (e) { alert(e.message); }
    });

    document.getElementById('btn-export-funcion')?.addEventListener('click', () => exportCsv(state.ventas, `ventas_${state.funcion}.csv`));

    document.getElementById('btn-email-post-funcion')?.addEventListener('click', async () => {
      if (!state.funcion) return;
      const conEmail = state.ventas.filter(v => v.email && v.estado !== 'reembolsada').length;
      if (!confirm(
        `¿Enviar «Te dejamos un sobre» a ${conEmail} asistente(s) de ${state.funcion}?\n\n` +
        'Solo compradores con email de ESA función (mismo día en CDMX). Cada uno recibe folio + enlace privado.',
      )) return;
      try {
        const r = await api(window.teatroAdminApi('email-post-funcion'), {
          method: 'POST',
          body: JSON.stringify({ fecha: state.funcion }),
        });
        alert(
          `Post-función: ${r.enviados} enviados` +
          (r.fallidos ? `, ${r.fallidos} fallidos` : '') +
          (r.omitidos ? `, ${r.omitidos} ya enviados antes` : '') +
          `.`,
        );
      } catch (e) { alert(e.message); }
    });

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
    const head = ['certificado', 'nombre', 'email', 'telefono', 'cantidad', 'total', 'metodoPago', 'organizacion', 'codigoCupon', 'cuponPct', 'referidoDe', 'utm_source', 'utm_medium', 'utm_campaign', 'fechaCompra', 'fechaCompraDia', 'funcion', 'funcionNombre', 'estado', 'usado'];
    const lines = [head.join(',')].concat(ventas.map(v => {
      const row = {
        certificado: certVenta(v),
        nombre: v.nombre,
        email: v.email,
        telefono: v.telefono,
        cantidad: v.cantidad,
        total: v.total,
        metodoPago: v.metodoPago,
        organizacion: v.organizacion,
        codigoCupon: v.codigoCupon,
        cuponPct: v.cuponPct,
        referidoDe: v.referidoDe,
        utm_source: v.utm?.source,
        utm_medium: v.utm?.medium,
        utm_campaign: v.utm?.campaign,
        fechaCompra: v.fechaCompra,
        fechaCompraDia: v.fechaCompraDia,
        funcion: v.fecha,
        funcionNombre: v.funcionNombre,
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

  /* ─── Panel v4 (admin.html) ─────────────────────────────────────────────── */

  function v4SetText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text ?? '—';
  }

  function v4Toggle(id, show) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('hidden', !show);
  }

  function loginErrorShow(msg) {
    const el = document.getElementById('error-login');
    if (!el) return;
    if (msg) {
      el.textContent = msg;
      el.classList.remove('hidden');
    } else {
      el.textContent = '';
      el.classList.add('hidden');
    }
  }

  function v4EstadoClase(v) {
    if (v.estado === 'reembolsada') return 'refund';
    if (v.usado) return 'audit';
    if (v.reagendado) return 'reagend';
    return 'ok';
  }

  function v4EstadoBadge(v) {
    const c = v4EstadoClase(v);
    const labels = { refund: 'Reembolsado', audit: 'Canjeado', reagend: 'Reagendado', ok: 'Activo' };
    const cls = { refund: 'badge-refund', audit: 'badge-audit', reagend: 'badge-reagend', ok: 'badge-ok' };
    return `<span class="badge ${cls[c]}">${labels[c]}</span>`;
  }

  function v4BoletoEstadoBadge(usado) {
    return usado
      ? '<span class="badge badge-audit">canjeado</span>'
      : '<span class="badge badge-pend">pendiente</span>';
  }

  function v4FnLabel(iso) {
    const f = state.funciones.find(x => x.fecha_iso === iso);
    return f ? f.nombre : (iso || '—');
  }

  function v4ResumenComprador(v) {
    return `<dl class="confirm-summary">
      <dt>Certificado</dt><dd>${esc(certVenta(v))}</dd>
      <dt>Comprador</dt><dd>${esc(v.nombre || '—')}</dd>
      <dt>Email</dt><dd>${esc(v.email || '—')}</dd>
      <dt>Entradas / total</dt><dd>${v.cantidad || 0} · ${fmtMXN(v.total)}</dd>
      <dt>Método</dt><dd>${esc(v.metodoPago || '—')}</dd>
    </dl>`;
  }

  function v4HtmlResumenReagenda(v, destIso) {
    const origen = v4FnLabel(v.fecha);
    const destino = v4FnLabel(destIso);
    const contable = v.fechaContable || v.fecha;
    return `${v4ResumenComprador(v)}
      <dl class="confirm-summary">
        <dt>Función actual (se cancela)</dt><dd><strong>${esc(origen)}</strong><br><span style="color:var(--soft);font-size:12px">El cupo queda libre en esta fecha.</span></dd>
        <dt>Nueva función (destino)</dt><dd><strong>${esc(destino)}</strong></dd>
        <dt>Monto contable</dt><dd>Permanece en ${esc(v4FnLabel(contable))}</dd>
        <dt>Correo al comprador</dt><dd>Se reenvía boleto con la nueva función (si hay email).</dd>
      </dl>`;
  }

  function v4HtmlResumenReembolso(v) {
    const esStripe = v.metodoPago && v.metodoPago !== 'efectivo';
    return `${v4ResumenComprador(v)}
      <dl class="confirm-summary">
        <dt>Función</dt><dd>${esc(v4FnLabel(v.fecha))}</dd>
        <dt>Acción</dt><dd>${esStripe ? 'Reembolso vía Stripe + liberación de cupo' : 'Anulación de venta taquilla + liberación de cupo'}</dd>
        <dt>Monto</dt><dd><strong>${fmtMXN(v.total)}</strong></dd>
      </dl>`;
  }

  function v4HtmlResumenEliminar(v) {
    return `${v4ResumenComprador(v)}
      <dl class="confirm-summary">
        <dt>Función</dt><dd>${esc(v4FnLabel(v.fecha))}</dd>
        <dt>Acción</dt><dd>Borrado definitivo + liberación de cupo. Queda archivada solo como referencia, fuera de las estadísticas.</dd>
        <dt>Ojo</dt><dd><strong>No devuelve dinero.</strong> Úsalo solo para limpiar pruebas.</dd>
      </dl>`;
  }

  function v4HtmlResumenEmail(v, emailNuevo) {
    const dest = emailNuevo || v.email;
    return `${v4ResumenComprador(v)}
      <dl class="confirm-summary">
        <dt>Correo anterior</dt><dd>${esc(v.email || '—')}</dd>
        <dt>Correo nuevo</dt><dd><strong>${esc(dest)}</strong></dd>
        <dt>Acción</dt><dd>Actualizar correo y reenviar boleto con QR.</dd>
      </dl>`;
  }

  function v4HtmlResumenReenvio(v) {
    return `${v4ResumenComprador(v)}
      <dl class="confirm-summary">
        <dt>Acción</dt><dd>Reenviar boleto al correo registrado.</dd>
      </dl>`;
  }

  function v4InformeTexto(informe) {
    const lines = [
      'EL GORILA — Informe de operación',
      '═'.repeat(40),
      `Tipo: ${informe.tipo}`,
      `Fecha: ${informe.ts}`,
      `Operador: ${informe.usuario || '—'}`,
      '',
      informe.texto || '',
    ];
    if (informe.resultado) {
      lines.push('', 'Resultado:', informe.resultado);
    }
    return lines.join('\n');
  }

  function v4CargarInformesGuardados() {
    try {
      const raw = localStorage.getItem(OPS_INF_KEY);
      state.opsInformes = raw ? JSON.parse(raw) : [];
    } catch { state.opsInformes = []; }
  }

  function v4GuardarInforme(informe) {
    state.opsInformes = state.opsInformes || [];
    state.opsInformes.unshift(informe);
    if (state.opsInformes.length > 80) state.opsInformes.length = 80;
    try { localStorage.setItem(OPS_INF_KEY, JSON.stringify(state.opsInformes)); } catch { /* */ }
    v4RenderOpsInformes();
  }

  function v4DescargarInforme(id) {
    const inf = (state.opsInformes || []).find(x => x.id === id);
    if (!inf) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([v4InformeTexto(inf)], { type: 'text/plain;charset=utf-8' }));
    a.download = `informe-${inf.tipo}-${inf.id}.txt`;
    a.click();
  }

  function v4RenderOpsInformes() {
    const wrap = document.getElementById('ops-informes-list');
    if (!wrap) return;
    const list = state.opsInformes || [];
    wrap.innerHTML = list.length
      ? list.map(inf => `<div class="ops-informe-row">
          <div>
            <div style="font-family:var(--mono);font-size:10px;color:var(--gold);letter-spacing:.08em">${esc(inf.tipo)} · ${esc(new Date(inf.ts).toLocaleString('es-MX'))}</div>
            <div style="font-size:14px;margin-top:4px">${esc(inf.titulo || inf.tipo)}</div>
            <div style="font-family:var(--mono);font-size:10px;color:var(--soft);margin-top:4px">${esc(inf.resumenCorto || '')}</div>
          </div>
          <button type="button" class="td-btn" data-dl-inf="${esc(inf.id)}">Descargar</button>
        </div>`).join('')
      : '<p style="padding:16px;color:var(--soft);font-family:var(--mono);font-size:11px">Sin informes guardados aún.</p>';
    wrap.querySelectorAll('[data-dl-inf]').forEach(btn => {
      btn.onclick = () => v4DescargarInforme(btn.dataset.dlInf);
    });
  }

  function v4ConfirmarAccion({ titulo, resumenHtml, peligro, btnOk, requierePin }) {
    return new Promise(resolve => {
      const modal = document.getElementById('modal-confirm-op');
      if (!modal) { resolve(window.confirm(titulo)); return; }
      const titleEl = document.getElementById('confirm-op-title');
      const bodyEl = document.getElementById('confirm-op-body');
      const okBtn = document.getElementById('confirm-op-ok');
      const pinWrap = document.getElementById('confirm-op-pin-wrap');
      const pinInp = document.getElementById('confirm-op-pin');
      const pinErr = document.getElementById('confirm-op-pin-error');
      if (titleEl) titleEl.textContent = titulo;
      if (bodyEl) bodyEl.innerHTML = resumenHtml;
      if (okBtn) {
        okBtn.textContent = btnOk || 'Confirmar';
        okBtn.classList.toggle('danger', !!peligro);
      }
      if (pinWrap) pinWrap.classList.toggle('hidden', !requierePin);
      if (pinInp) pinInp.value = '';
      if (pinErr) { pinErr.textContent = ''; pinErr.classList.add('hidden'); }
      state._confirmRequierePin = !!requierePin;
      state._confirmResolve = resolve;
      modal.classList.add('open');
    });
  }

  function v4PinFinanciero() {
    return document.getElementById('confirm-op-pin')?.value?.trim() || '';
  }

  function v4CerrarConfirm(ok) {
    if (ok && state._confirmRequierePin) {
      const pin = v4PinFinanciero();
      if (pin !== '9999') {
        const pinErr = document.getElementById('confirm-op-pin-error');
        if (pinErr) { pinErr.textContent = 'PIN incorrecto'; pinErr.classList.remove('hidden'); }
        return;
      }
    }
    document.getElementById('modal-confirm-op')?.classList.remove('open');
    const fn = state._confirmResolve;
    state._confirmResolve = null;
    state._confirmRequierePin = false;
    if (fn) fn(!!ok);
  }

  function v4CrearInforme(tipo, titulo, texto, resumenCorto, resultado) {
    const u = typeof AuthManager !== 'undefined' ? AuthManager.obtenerUsuarioActual() : null;
    return {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      ts: new Date().toISOString(),
      tipo,
      titulo,
      texto,
      resumenCorto,
      resultado,
      usuario: u?.nombre || u?.usuario || '—',
    };
  }

  function v4InformeReagenda(v, destIso, data) {
    const origen = v4FnLabel(v.fecha);
    const destino = v4FnLabel(destIso);
    const texto = [
      `Reagendamiento — ${certVenta(v)}`,
      `Comprador: ${v.nombre || '—'} (${v.email || 'sin email'})`,
      `Cancelado en: ${origen} (${v.fecha}) — cupo liberado`,
      `Activo en: ${destino} (${destIso})`,
      `Monto contable en: ${v.fechaContable || v.fecha}`,
      `Entradas: ${v.cantidad || 0} · Total: ${fmtMXN(v.total)}`,
    ].join('\n');
    const resultado = msgReagendarOk(data) + (data?.auditId ? `\nAuditoría: ${data.auditId}` : '');
    return v4CrearInforme('reagenda', 'Reagendamiento', texto, `${certVenta(v)}: ${origen} → ${destino}`, resultado);
  }

  function v4InformeReembolso(v, data) {
    const esStripe = v.metodoPago && v.metodoPago !== 'efectivo';
    const texto = [
      `${esStripe ? 'Reembolso' : 'Anulación'} — ${certVenta(v)}`,
      `Comprador: ${v.nombre || '—'} (${v.email || 'sin email'})`,
      `Función: ${v4FnLabel(v.fecha)}`,
      `Monto: ${fmtMXN(v.total)}`,
      `Cupo liberado en inventario.`,
    ].join('\n');
    return v4CrearInforme('reembolso', esStripe ? 'Reembolso' : 'Anulación', texto, `${certVenta(v)} · ${fmtMXN(v.total)}`, data?.auditId ? `Auditoría: ${data.auditId}` : 'Procesado.');
  }

  function v4EstadoCoincide(v, filtro) {
    if (!filtro) return true;
    if (filtro === 'reembolsada') return v.estado === 'reembolsada';
    if (filtro === 'canjeada') return !!v.usado && v.estado !== 'reembolsada';
    if (filtro === 'reagendada') return !!v.reagendado && !v.usado && v.estado !== 'reembolsada';
    if (filtro === 'activa') return v.estado !== 'reembolsada' && !v.usado && !v.reagendado;
    return true;
  }

  function v4VentasFiltradas() {
    const q = (document.getElementById('ventas-search')?.value || '').trim().toLowerCase();
    const est = document.getElementById('ventas-estado-filter')?.value || state.ventasEstado || '';
    return state.ventas.filter(v => {
      if (state.chipFuncion && v.fecha !== state.chipFuncion && v.fechaContable !== state.chipFuncion) {
        const fc = v.fechaContable || (v.reagendado && v.reagendado.de) || v.fecha;
        if (fc !== state.chipFuncion && v.fecha !== state.chipFuncion) return false;
      }
      if (!v4EstadoCoincide(v, est)) return false;
      if (!q) return true;
      const cert = certVenta(v).toLowerCase();
      const nombre = (v.nombre || '').toLowerCase();
      const email = (v.email || '').toLowerCase();
      const cupon = (v.codigoCupon || '').toLowerCase();
      return cert.includes(q) || nombre.includes(q) || email.includes(q) || cupon.includes(q);
    });
  }

  function esVentaTaquilla(v) {
    const m = (v?.metodoPago || '').toLowerCase();
    if (m === 'efectivo' || m === 'tarjeta_taquilla') return true;
    return String(v?.sessionId || '').startsWith('manual_');
  }

  function v4CalcStats(ventas) {
    let entradas = 0;
    let revenueStripe = 0;
    let revenueTaquilla = 0;
    let refunds = 0;
    let refundMxn = 0;
    let tx = 0;
    for (const v of ventas) {
      if (v.estado === 'reembolsada') {
        refunds += 1;
        refundMxn += Number(v.total) || 0;
        continue;
      }
      tx += 1;
      entradas += v.cantidad || 0;
      const total = Number(v.total) || 0;
      if (esVentaTaquilla(v)) revenueTaquilla += total;
      else revenueStripe += total;
    }
    return { entradas, revenue: revenueStripe, revenueTaquilla, tx, refunds, refundMxn };
  }

  function v4RenderStats() {
    const filtradas = v4VentasFiltradas();
    const all = state.chipFuncion
      ? state.ventas.filter(v => {
          const fc = v.fechaContable || (v.reagendado && v.reagendado.de) || v.fecha;
          return fc === state.chipFuncion || v.fecha === state.chipFuncion;
        })
      : state.ventas;
    const s = v4CalcStats(all);
    v4SetText('stat-entradas', String(s.entradas));
    v4SetText('stat-revenue', fmtMXN(s.revenue));
    v4SetText('stat-taquilla', fmtMXN(s.revenueTaquilla));
    v4SetText('stat-tx', String(s.tx));
    v4SetText('stat-refunds', String(s.refunds));
    const sub = document.getElementById('stat-entradas-sub');
    if (sub) {
      sub.textContent = state.chipFuncion
        ? (state.funciones.find(f => f.fecha_iso === state.chipFuncion)?.nombre || state.chipFuncion)
        : `${state.funciones.length} funciones · temporada`;
    }
    const revSub = document.getElementById('stat-revenue-sub');
    if (revSub) {
      revSub.textContent = state.chipFuncion ? 'Stripe · función seleccionada' : 'MXN en línea · sin taquilla';
    }
    const taqSub = document.getElementById('stat-taquilla-sub');
    if (taqSub) {
      taqSub.textContent = state.chipFuncion ? 'efectivo + tarjeta en puerta' : 'efectivo + tarjeta en puerta · temporada';
    }
    const refSub = document.getElementById('stat-refunds-sub');
    if (refSub) refSub.textContent = s.refunds ? fmtMXN(s.refundMxn) + ' devueltos' : 'en la temporada';
    const txSub = document.getElementById('stat-tx-sub');
    if (txSub) txSub.textContent = s.refunds ? `${s.tx} activas · ${s.refunds} reembolsadas` : 'online + taquilla';
    v4SetText('ventas-count', `${filtradas.length} resultado${filtradas.length === 1 ? '' : 's'}`);
  }

  function v4RenderFnChips() {
    const wrap = document.getElementById('fn-chips');
    if (!wrap) return;
    const counts = {};
    for (const v of state.ventas) {
      if (v.estado === 'reembolsada') continue;
      const fc = v.fechaContable || v.fecha;
      if (fc) counts[fc] = (counts[fc] || 0) + 1;
    }
    const chips = [`<button type="button" class="fn-chip${!state.chipFuncion ? ' active' : ''}" data-chip="">Todas<span class="fn-chip-count">${state.ventas.length}</span></button>`];
    for (const f of state.funciones) {
      const n = counts[f.fecha_iso] || 0;
      const act = state.chipFuncion === f.fecha_iso ? ' active' : '';
      chips.push(`<button type="button" class="fn-chip${act}" data-chip="${esc(f.fecha_iso)}">${esc(f.nombre)}<span class="fn-chip-count">${n}</span></button>`);
    }
    wrap.innerHTML = chips.join('');
    wrap.querySelectorAll('[data-chip]').forEach(btn => {
      // Filtrado 100% en el cliente: state.ventas ya trae TODAS las ventas.
      // (Recargar filtrado por fecha rompía los conteos de los demás chips y trababa.)
      btn.onclick = () => {
        state.chipFuncion = btn.dataset.chip || null;
        v4RenderFnChips();
        v4RenderVentasTable();
        v4RenderStats();
        v4Toggle('btn-email-post-funcion', !!state.chipFuncion && perm('reenviarBoleto'));
        v4Toggle('btn-email-dia-funcion', !!state.chipFuncion && perm('reenviarBoleto'));
      };
    });
    v4Toggle('btn-email-post-funcion', !!state.chipFuncion && perm('reenviarBoleto'));
    v4Toggle('btn-email-dia-funcion', !!state.chipFuncion && perm('reenviarBoleto'));
  }

  function v4RenderVentasTable() {
    const tbody = document.getElementById('tabla-ventas');
    if (!tbody) return;
    const rows = v4VentasFiltradas();
    tbody.innerHTML = rows.map(v => {
      const cert = certVenta(v);
      const metodo = esVentaTaquilla(v)
        ? ((v.metodoPago || '').toLowerCase() === 'tarjeta_taquilla' ? 'tarjeta taquilla' : 'efectivo')
        : (v.metodoPago || 'online');
      const st = v4EstadoClase(v);
      return `<tr data-venta="${esc(cert)}" class="row-st-${st}">
        <td class="td-mono">${esc(cert)}</td>
        <td>${esc(v.nombre || '—')}</td>
        <td class="td-email">${esc(v.email || '—')}</td>
        <td class="td-num">${v.cantidad || 0}</td>
        <td class="td-num">${fmtMXN(v.total)}</td>
        <td>${v4EstadoBadge(v)}</td>
        <td class="td-metodo">${esc(metodo)}</td>
        <td class="td-actions"><button type="button" class="td-btn" data-open="${esc(cert)}">Ver</button></td>
      </tr>`;
    }).join('') || '<tr><td colspan="8" style="padding:24px;text-align:center;color:var(--soft)">Sin ventas</td></tr>';
    tbody.querySelectorAll('[data-open]').forEach(btn => {
      btn.onclick = (e) => { e.stopPropagation(); v4AbrirDrawer(btn.dataset.open); };
    });
    tbody.querySelectorAll('[data-venta]').forEach(row => {
      row.onclick = () => v4AbrirDrawer(row.dataset.venta);
    });
    v4RenderStats();
  }

  function v4RenderReagDest(excluirFecha) {
    if (typeof SelectorFunciones === 'undefined') return;
    const list = SelectorFunciones.filtrarFunciones(state.funciones, { excluir: excluirFecha, futuras: true });
    [
      { grid: 'ops-reag-dest-grid', hidden: 'ops-reag-dest' },
      { grid: 'dv-reag-dest-grid', hidden: 'dv-reag-dest' },
      { grid: 'reag-destino-grid', hidden: 'reag-destino' },
    ].forEach(({ grid, hidden }) => {
      const gridEl = document.getElementById(grid);
      const hiddenEl = document.getElementById(hidden);
      if (!gridEl) return;
      SelectorFunciones.wireHidden(gridEl, hiddenEl, state.funciones, {
        excluir: excluirFecha,
        futuras: true,
        showDisponibles: true,
      });
    });
  }

  function v4PoblarDrawer(v) {
    state.drawerVenta = v;
    const cert = certVenta(v);
    v4SetText('dv-cert', cert);
    const sub = document.getElementById('dv-sub');
    if (sub) sub.textContent = fmtFecha(v.fechaCompra) + (v.funcionNombre ? ` · ${v.funcionNombre}` : '');
    v4SetText('dv-nombre', v.nombre || '—');
    v4SetText('dv-email', v.email || '—');
    v4SetText('dv-tel', v.telefono || '—');
    const items = (v.items || []).map(it => `${it.cantidad || 1}× ${it.nombre || it.seccion || 'entrada'}`).join(', ');
    v4SetText('dv-cant', items || String(v.cantidad || 0));
    v4SetText('dv-total', fmtMXN(v.total));
    v4SetText('dv-metodo', v.metodoPago || '—');
    const cup = v.codigoCupon ? `${v.codigoCupon}${v.cuponPct != null ? ` (−${v.cuponPct}%)` : ''}` : '—';
    v4SetText('dv-cupon', cup);
    v4SetText('dv-utm', utmResumen(v.utm));
    const estEl = document.getElementById('dv-estado');
    if (estEl) estEl.innerHTML = v4EstadoBadge(v);
    const fn = state.funciones.find(f => f.fecha_iso === v.fecha);
    v4SetText('dv-fecha', fn ? fn.nombre : (v.fecha || '—'));
    v4SetText('dv-usado', v.usado ? 'Sí' : 'No');
    v4SetText('dv-referido', v.referidoDe || '—');
    const bol = document.getElementById('dv-boletos');
    if (bol) {
      const lines = (v.boletos || []).map(b =>
        `<div class="boleto-row"><span>${esc(b.cert)} · folio ${esc(b.folio || '—')} · ${esc(b.tipo || '—')}</span>${v4BoletoEstadoBadge(!!b.usado)}</div>`
      );
      bol.innerHTML = lines.length ? lines.join('') : 'Sin desglose por boleto';
    }
    const dest = document.getElementById('dv-reag-dest-grid');
    if (dest) v4RenderReagDest(v.fecha);
    const emailInp = document.getElementById('dv-email-nuevo');
    if (emailInp) emailInp.value = v.email || '';
    const preview = document.getElementById('dv-btn-preview');
    if (preview) {
      preview.onclick = () => v4PreviewBoleto(cert);
      preview.style.display = 'block';
    }
    state.drawerVenta = v;
    const esStripe = v.metodoPago && v.metodoPago !== 'efectivo' && !String(v.sessionId || '').startsWith('manual_');
    v4Toggle('dv-btn-reagenda', perm('reagendar') && !v.usado && v.estado !== 'reembolsada');
    v4Toggle('dv-btn-reenvio', perm('reenviarBoleto') && v.estado !== 'reembolsada' && !!v.email);
    v4Toggle('dv-btn-email', perm('corregirEmail') && v.estado !== 'reembolsada');
    v4Toggle('dv-btn-reembolso', perm('reembolsar') && v.estado === 'completada' && !v.usado);
    const btnReemb = document.getElementById('dv-btn-reembolso');
    if (btnReemb) btnReemb.textContent = esStripe ? 'Reembolso' : 'Anular venta';
    // Eliminar (limpieza de pruebas): solo admin. Borra la venta y la saca de stats.
    v4Toggle('dv-btn-eliminar', perm('eliminarVenta'));
    v4Toggle('dv-reag-panel', false);
    v4Toggle('dv-email-panel', false);
    v4Toggle('dv-msg', false);
  }

  async function v4AbrirDrawer(cert) {
    try {
      const v = await api(window.teatroAdminApi(`venta/${encodeURIComponent(cert)}`));
      v4PoblarDrawer(v);
      document.getElementById('drawer-overlay')?.classList.add('open');
      document.getElementById('drawer-venta')?.classList.add('open');
    } catch (e) {
      alert(e.message);
    }
  }

  function v4CerrarDrawer() {
    document.getElementById('drawer-overlay')?.classList.remove('open');
    document.getElementById('drawer-venta')?.classList.remove('open');
    state.drawerVenta = null;
  }

  function v4PoblarOps(v) {
    state.opsVenta = v;
    const cert = certVenta(v);
    v4SetText('ops-res-name', v.nombre || '—');
    v4SetText('ops-res-cert', cert);
    const fn = state.funciones.find(f => f.fecha_iso === v.fecha);
    v4SetText('ops-res-fecha', fn ? fn.nombre : (v.fecha || '—'));
    v4SetText('ops-res-cant', `${v.cantidad || 0} entrada(s)`);
    v4SetText('ops-res-total', fmtMXN(v.total));
    const estEl = document.getElementById('ops-res-estado');
    if (estEl) estEl.innerHTML = v4EstadoBadge(v);
    v4Toggle('ops-result-wrap', true);
    const dest = document.getElementById('ops-reag-dest-grid');
    if (dest) v4RenderReagDest(v.fecha);
    const emailInp = document.getElementById('ops-email-nuevo');
    if (emailInp) emailInp.value = v.email || '';
    const esStripe = v.metodoPago && v.metodoPago !== 'efectivo' && !String(v.sessionId || '').startsWith('manual_');
    v4Toggle('ops-btn-reagenda', perm('reagendar') && !v.usado && v.estado !== 'reembolsada');
    v4Toggle('ops-btn-reenvio', perm('reenviarBoleto') && v.estado !== 'reembolsada' && !!v.email);
    v4Toggle('ops-btn-email', perm('corregirEmail') && v.estado !== 'reembolsada');
    v4Toggle('ops-btn-reembolso', perm('reembolsar') && v.estado === 'completada' && !v.usado);
    const btnReemb = document.getElementById('ops-btn-reembolso');
    if (btnReemb) btnReemb.textContent = esStripe ? 'Reembolso' : 'Anular venta';
    v4Toggle('ops-reag-panel', false);
    v4Toggle('ops-email-panel', false);
    v4Toggle('ops-msg', false);
  }

  async function v4BuscarVenta(q) {
    const term = (q ?? document.getElementById('ops-input')?.value ?? '').trim();
    if (!term) return;
    try {
      try {
        const v = await api(window.teatroAdminApi(`venta/${encodeURIComponent(term)}`));
        v4PoblarOps(v);
        return;
      } catch { /* buscar en listado */ }
      await cargarVentas(null, term);
      if (!state.ventas.length) throw new Error('Sin resultados para esa búsqueda.');
      if (state.ventas.length > 1) {
        const cert = state.ventas[0] && certVenta(state.ventas[0]);
        const v = await api(window.teatroAdminApi(`venta/${encodeURIComponent(cert)}`));
        v4PoblarOps(v);
        v4OpsMsg(`${state.ventas.length} coincidencias — mostrando la primera.`, 'soft');
      } else {
        const v = await api(window.teatroAdminApi(`venta/${encodeURIComponent(certVenta(state.ventas[0]))}`));
        v4PoblarOps(v);
      }
    } catch (e) {
      v4Toggle('ops-result-wrap', false);
      v4OpsMsg(e.message, 'red');
    }
  }

  function v4OpsMsg(text, tone) {
    const m = document.getElementById('ops-msg');
    if (!m) return;
    m.textContent = text;
    m.style.color = tone === 'red' ? '#f87171' : tone === 'green' ? 'var(--green)' : 'var(--soft)';
    m.classList.remove('hidden');
  }

  function v4DrawerMsg(text, tone) {
    const m = document.getElementById('dv-msg');
    if (!m) return;
    m.textContent = text;
    m.style.color = tone === 'red' ? '#f87171' : 'var(--green)';
    m.classList.remove('hidden');
  }

  function v4RenderFunciones() {
    const wrap = document.getElementById('fn-cards');
    if (!wrap) return;
    const puedeToggle = perm('editarSitio');
    wrap.innerHTML = state.funciones.map(f => {
      const inv = state.inv[f.fecha_iso] || {};
      const disp = typeof window.disponiblesAforoTotal === 'function'
        ? window.disponiblesAforoTotal(inv)
        : (inv.disponibles ?? '—');
      const enVenta = f.activa !== false;
      const ocultaCls = enVenta ? '' : ' fn-oculta';
      const toggleBtn = puedeToggle
        ? `<button type="button" class="fn-toggle ${enVenta ? 'on' : 'off'}" data-fn-toggle="${esc(f.fecha_iso)}" data-activa="${enVenta ? '1' : '0'}">${enVenta ? 'En venta' : 'Oculta'}</button>`
        : `<span class="badge ${enVenta ? 'badge-ok' : 'badge-pend'}">${enVenta ? 'en venta' : 'oculta'}</span>`;
      return `<div class="fn-card${ocultaCls}" data-fn="${esc(f.fecha_iso)}">
        <span class="fn-date">${esc(f.fecha_iso)}</span>
        <span class="fn-name">${esc(f.nombre)}</span>
        <span class="fn-avail">~${disp} disponibles · ${f.vendidos ?? '—'} vendidos</span>
        <div class="fn-card-actions">
          ${toggleBtn}
          <button type="button" class="fn-toggle" data-fn-ver="${esc(f.fecha_iso)}">Ver ventas</button>
        </div>
      </div>`;
    }).join('') || '<p style="color:var(--soft)">Sin funciones en KV. Ejecuta init-funciones.js y sube a KV.</p>';

    wrap.querySelectorAll('[data-fn-ver]').forEach(btn => {
      btn.onclick = async (e) => {
        e.stopPropagation();
        state.chipFuncion = btn.dataset.fnVer;
        state.view = 'hub';
        v4ShowView('hub');
        await v4RenderHub();
      };
    });
    wrap.querySelectorAll('[data-fn-toggle]').forEach(btn => {
      btn.onclick = async (e) => {
        e.stopPropagation();
        const iso = btn.dataset.fnToggle;
        const activa = btn.dataset.activa !== '1';
        const ok = await v4ConfirmarAccion({
          titulo: activa ? 'Activar función en venta' : 'Ocultar función de la venta',
          resumenHtml: `<dl class="confirm-summary">
            <dt>Función</dt><dd><strong>${esc(v4FnLabel(iso))}</strong></dd>
            <dt>Efecto</dt><dd>${activa ? 'Aparecerá en boletos.html y checkout.' : 'Dejará de mostrarse al público (admin y taquilla siguen viéndola).'}</dd>
          </dl>`,
          btnOk: activa ? 'Activar' : 'Ocultar',
        });
        if (!ok) return;
        try {
          await api(window.teatroAdminApi('funciones/toggle'), {
            method: 'POST',
            body: JSON.stringify({ fecha_iso: iso, activa }),
          });
          await cargarFunciones(false);
          await Promise.all(state.funciones.map(async (f) => {
            try {
              state.inv[f.fecha_iso] = await api(window.teatroApi(`disponibilidad?fecha=${f.fecha_iso}`));
            } catch { /* */ }
          }));
          v4RenderFunciones();
        } catch (err) { alert(err.message); }
      };
    });
  }

  function v4RenderInformeFn() {
    const tbody = document.getElementById('informe-fn-tbody');
    if (!tbody) return;
    const fnRows = (state.informeFunciones || []).map(f => {
      const sel = state.informeFuncionSel === f.fecha_iso ? ' sel' : '';
      return `<tr class="informe-row${sel}" data-informe-fn="${esc(f.fecha_iso)}">
        <td class="td-mono">${esc(f.fecha_iso)}</td>
        <td>${esc(f.nombre)}</td>
        <td class="td-num">${f.entradasVendidas}</td>
        <td class="td-num">${f.asisten}</td>
        <td class="td-num">${fmtMXN(f.revenue)}</td>
        <td class="td-num" style="font-size:11px;color:var(--soft)">${f.reembolsos ? `${f.reembolsos} reemb.` : '—'}</td>
      </tr>`;
    }).join('');
    const tot = state.informeTotales || {};
    tbody.innerHTML = fnRows
      ? fnRows + `<tr class="total-row"><td colspan="2">Total temporada</td>
          <td class="td-num">${tot.entradas || 0}</td><td class="td-num">—</td>
          <td class="td-num">${fmtMXN(tot.revenue)}</td><td></td></tr>`
      : '<tr><td colspan="6" style="padding:24px;text-align:center;color:var(--soft)">Sin ventas registradas</td></tr>';
    tbody.querySelectorAll('[data-informe-fn]').forEach(row => {
      row.onclick = async () => {
        state.informeFuncionSel = row.dataset.informeFn;
        await cargarVentasFuncion(state.informeFuncionSel);
        v4RenderInformeFn();
        v4RenderInformeVentas();
      };
    });
  }

  function v4RenderInformeVentas() {
    const wrap = document.getElementById('informe-ventas-wrap');
    if (!wrap) return;
    if (!state.informeFuncionSel) { wrap.innerHTML = ''; return; }
    const fn = state.funciones.find(x => x.fecha_iso === state.informeFuncionSel);
    const nombre = fn ? fn.nombre : state.informeFuncionSel;
    const rows = (state.informeVentas || []).map(v => {
      const cert = certVenta(v);
      return `<tr>
        <td class="td-mono"><button type="button" class="td-btn ops-pick-venta" data-cert="${esc(cert)}">${esc(cert)}</button></td>
        <td>${esc(v.nombre || '—')}</td>
        <td class="td-email">${esc(v.email || '—')}</td>
        <td class="td-num">${v.cantidad || 0}</td>
        <td class="td-num">${fmtMXN(v.total)}</td>
        <td>${v4EstadoBadge(v)}</td>
      </tr>`;
    }).join('');
    wrap.innerHTML = `<div class="page-hd" style="border:none;padding-bottom:8px;margin-top:8px">
        <h2 style="font-family:var(--display);font-size:22px;color:var(--fg)">Ventas — ${esc(nombre)}</h2>
      </div>
      <div class="table-wrap"><table>
        <thead><tr>
          <th>Certificado</th><th>Nombre</th><th>Email</th>
          <th style="text-align:right">Cant.</th><th style="text-align:right">Total</th><th>Estado</th>
        </tr></thead>
        <tbody>${rows || '<tr><td colspan="6" style="padding:20px;text-align:center;color:var(--soft)">Sin ventas</td></tr>'}</tbody>
      </table></div>`;
    wrap.querySelectorAll('.ops-pick-venta').forEach(btn => {
      btn.onclick = () => {
        state.view = 'ops';
        v4ShowView('ops');
        v4BuscarVenta(btn.dataset.cert);
      };
    });
  }

  function v4BadgeAccion(a) {
    const t = accionTipo(a);
    const map = {
      'text-blue-400': 'badge-reagend',
      'text-red-400': 'badge-refund',
      'text-green-400': 'badge-ok',
      'text-yellow-400': 'badge-audit',
      'text-primary': 'badge-ok',
    };
    let cls = 'badge-audit';
    for (const [k, v] of Object.entries(map)) { if (t.cls.includes(k)) { cls = v; break; } }
    return `<span class="badge ${cls}">${esc(t.label)}</span>`;
  }

  function v4RenderAuditoriaFixed(targetId, countId, filtro) {
    const tbody = document.getElementById(targetId);
    if (!tbody) return;
    const filtradas = state.auditoria.filter(a => accionCoincideFiltro(a, filtro));
    tbody.innerHTML = filtradas.map(a => `<tr>
      <td class="td-mono">${esc(a.id)}</td>
      <td style="font-family:var(--mono);font-size:10px;white-space:nowrap">${fmtFecha(a.ts)}</td>
      <td>${esc(a.usuario)} <span style="opacity:.45;font-size:10px">(${esc(a.rol)})</span></td>
      <td>${v4BadgeAccion(a)}</td>
      <td style="font-size:13px;color:var(--soft)">${esc(a.detalles)}</td>
    </tr>`).join('') || '<tr><td colspan="5" style="padding:24px;text-align:center;color:var(--soft)">Sin registros</td></tr>';
    const cnt = document.getElementById(countId);
    if (cnt) cnt.textContent = `${filtradas.length} registro${filtradas.length === 1 ? '' : 's'}`;
  }

  function v4RenderEquipo() {
    const wrap = document.getElementById('equipo-list');
    if (!wrap) return;
    if (!esAdmin()) {
      wrap.innerHTML = '<p style="color:#f87171">Solo el administrador gestiona el equipo.</p>';
      return;
    }
    wrap.innerHTML = state.usuarios.map(u => {
      const ini = (u.nombre || u.id || '?').charAt(0).toUpperCase();
      const rolCls = u.rol === 'admin' ? ' admin' : '';
      return `<div class="user-card">
        <div class="user-avatar">${esc(ini)}</div>
        <div><div class="user-name">${esc(u.nombre)}</div><div class="user-id">${esc(u.id)} · ${u.activo !== false ? 'activo' : 'inactivo'}</div></div>
        <span class="user-role${rolCls}">${esc(u.rol)}</span>
        <button type="button" class="td-btn" data-edit-user="${esc(u.id)}" style="margin-left:8px">Editar</button>
      </div>`;
    }).join('') || '<p style="color:var(--soft)">Sin usuarios — crea el primero</p>';
    wrap.querySelectorAll('[data-edit-user]').forEach(btn => {
      btn.onclick = () => openUserModal(btn.dataset.editUser);
    });
  }

  function v4RenderSitio() {
    const s = state.sitio;
    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val ?? ''; };
    setVal('sitio-instagram', s.instagram);
    setVal('sitio-whatsapp', s.whatsapp);
    setVal('sitio-email', s.email);
    setVal('sitio-sinopsis', s.sinopsis);
    const foot = document.getElementById('sitio-footer-admin');
    if (foot) foot.checked = !!s.mostrarAdminFooter;
  }

  function v4ShowView(view) {
    state.view = view;
    ['hub', 'ops', 'funciones', 'informes', 'equipo', 'auditoria', 'sitio', 'boletera', 'verificar'].forEach(v => {
      v4Toggle(`view-${v}`, v === view);
    });
    document.querySelectorAll('.nav-item[data-nav]').forEach(el => {
      el.classList.toggle('active', el.dataset.nav === view);
    });
    const main = document.getElementById('admin-app');
    if (main) {
      const mob = window.matchMedia('(max-width: 900px)').matches;
      main.style.overflow = mob ? '' : (view === 'boletera' ? 'hidden' : '');
    }
  }

  function v4CargarIframeBoletera() {
    window.BoleteraPanel?.init?.();
  }

  function v4CargarVerificar() {
    window.VerificarPanel?.init?.();
  }

  async function v4PreviewBoleto(cert) {
    const modal = document.getElementById('modal-preview-boleto');
    const img = document.getElementById('preview-boleto-img');
    const loading = document.getElementById('preview-boleto-loading');
    const errEl = document.getElementById('preview-boleto-error');
    if (!modal || !window.GenerarImagenBoleto) {
      window.open(`compartir-boleto.html?c=${encodeURIComponent(cert)}`, '_blank', 'noopener');
      return;
    }
    modal.classList.add('open');
    if (loading) loading.classList.remove('hidden');
    if (errEl) { errEl.classList.add('hidden'); errEl.textContent = ''; }
    if (img) img.style.display = 'none';
    try {
      const v = state.drawerVenta?.certificado === cert ? state.drawerVenta : await api(window.teatroAdminApi(`venta/${encodeURIComponent(cert)}`));
      const boletos = v.boletos || [];
      const certificado = v.certificado || cert;
      const n = v.cantidad || boletos.length || 1;
      const b0 = boletos[0];
      const qrCodigo = n === 1 && b0?.cert ? b0.cert : certificado;
      const qrUrl = window.ElGorilaQr?.codigoQrPayload?.(qrCodigo) || qrCodigo;
      const canvas = await GenerarImagenBoleto.generar({
        funcion: v.funcionNombre || v.fecha || '',
        entradas: n === 1 ? '1 entrada' : `${n} entradas`,
        modo: 'certificado',
        codigoLabel: 'Certificado',
        codigo: certificado,
        folio: boletos.map(b => b.folio).filter(Boolean).join(' · ') || null,
        qrUrl,
        logoUrl: 'img/LOGO/1.jpg',
        arteUrl: 'img/programa/portada-v4.jpg',
      });
      if (img) {
        img.src = canvas.toDataURL('image/png');
        img.style.display = 'block';
      }
      if (loading) loading.classList.add('hidden');
    } catch (e) {
      if (loading) loading.classList.add('hidden');
      if (errEl) {
        errEl.textContent = (e.message || 'No se pudo generar.') + ' Abre compartir-boleto.html si persiste.';
        errEl.classList.remove('hidden');
      }
    }
  }

  async function cargarOxxoPendientes() {
    try {
      const d = await api(window.teatroAdminApi('oxxo-pendientes'));
      state.oxxoPendientes = d.pendientes || [];
    } catch { state.oxxoPendientes = []; }
  }

  async function cargarOxxoHistorial() {
    try {
      const d = await api(window.teatroAdminApi('oxxo-historial'));
      state.oxxoHistorial = d.historial || [];
    } catch { state.oxxoHistorial = []; }
  }

  function v4RenderOxxoPendientes() {
    const wrap = document.getElementById('oxxo-pendientes');
    if (!wrap) return;
    const items = state.oxxoPendientes || [];
    if (!items.length) { wrap.innerHTML = ''; return; }
    const filas = items.map(p => {
      const fn = state.funciones.find(f => f.fecha_iso === p.fecha);
      const nombre = (fn && fn.nombre) || p.funcionNombre || p.fecha || '—';
      return `<tr>
        <td>${esc(nombre)}</td>
        <td>${esc(p.nombre || '—')}</td>
        <td class="td-email">${esc(p.email || '—')}</td>
        <td class="td-num">${p.cantidad || '—'}</td>
        <td class="td-num">${p.total != null ? fmtMXN(p.total) : '—'}</td>
        <td class="td-metodo">${p.creadoEn ? esc(fmtFecha(p.creadoEn)) : '—'}</td>
      </tr>`;
    }).join('');
    wrap.innerHTML = `<div style="margin-bottom:16px;border:1px solid #d99b3a55;background:#d99b3a12;padding:12px 14px">
      <div style="font-family:var(--mono);font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#d99b3a;margin-bottom:6px">
        Reservas OXXO pendientes de pago · ${items.length}
      </div>
      <p style="font-family:var(--mono);font-size:10px;color:var(--soft);margin-bottom:10px;line-height:1.5">
        Ficha generada, aún sin pagar. El boleto se emite y aparece como venta cuando cae el pago (1–3 días). Desaparecen solas al pagarse o vencer la ficha.
      </p>
      <div class="table-wrap"><table><thead><tr>
        <th>Función</th><th>Comprador</th><th>Email</th>
        <th style="text-align:right">Cant.</th><th style="text-align:right">Total</th><th>Generada</th>
      </tr></thead><tbody>${filas}</tbody></table></div>
    </div>`;
  }

  function v4RenderOxxoHistorial() {
    const wrap = document.getElementById('oxxo-historial');
    if (!wrap) return;
    const items = state.oxxoHistorial || [];
    if (!items.length) { wrap.innerHTML = ''; return; }
    const filas = items.map(p => {
      const fn = state.funciones.find(f => f.fecha_iso === p.fecha);
      const nombre = (fn && fn.nombre) || p.funcionNombre || p.fecha || '—';
      const completada = p.estado === 'completada';
      const badge = completada
        ? `<span style="color:var(--green,#3ba55d)">Completada</span>`
        : `<span style="color:#f87171">Fallida</span>`;
      return `<tr>
        <td>${badge}</td>
        <td>${esc(nombre)}</td>
        <td>${esc(p.nombre || '—')}</td>
        <td class="td-email">${esc(p.email || '—')}</td>
        <td class="td-num">${p.cantidad || '—'}</td>
        <td class="td-num">${p.total != null ? fmtMXN(p.total) : '—'}</td>
        <td class="td-metodo">${p.creadoEn ? esc(fmtFecha(p.creadoEn)) : '—'}</td>
        <td class="td-metodo">${p.resueltoEn ? esc(fmtFecha(p.resueltoEn)) : '—'}</td>
      </tr>`;
    }).join('');
    wrap.innerHTML = `<details style="margin-bottom:16px;border:1px solid var(--faint2,#3332);padding:12px 14px">
      <summary style="cursor:pointer;font-family:var(--mono);font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--soft)">
        Historial de fichas OXXO (completadas y fallidas) · ${items.length}
      </summary>
      <div class="table-wrap" style="margin-top:10px"><table><thead><tr>
        <th>Estado</th><th>Función</th><th>Comprador</th><th>Email</th>
        <th style="text-align:right">Cant.</th><th style="text-align:right">Total</th>
        <th>Generada</th><th>Resuelta</th>
      </tr></thead><tbody>${filas}</tbody></table></div>
    </details>`;
  }

  async function v4RenderHub() {
    if (!perm('verVentas')) return;
    let ventasError = null;
    const [, ventasResult] = await Promise.allSettled([
      cargarFunciones(true),
      cargarVentas(),  // TODAS las ventas; el chip filtra en el cliente
      cargarOxxoPendientes(),
      cargarOxxoHistorial(),
    ]);
    if (ventasResult.status === 'rejected') {
      ventasError = ventasResult.reason?.message || 'Error al cargar ventas';
      state.ventas = [];
    }
    v4RenderFnChips();
    v4RenderVentasTable();
    v4RenderOxxoPendientes();
    v4RenderOxxoHistorial();
    v4Toggle('btn-export-todo', perm('exportarDatos'));
    v4Toggle('btn-venta-manual', perm('venderEfectivo'));
    const errEl = document.getElementById('ventas-api-error');
    if (errEl) {
      errEl.textContent = ventasError || '';
      errEl.style.display = ventasError ? '' : 'none';
    }
  }

  async function v4PaintView(view) {
    try {
      if (view === 'hub') await v4RenderHub();
      else if (view === 'ops') { /* búsqueda bajo demanda */ }
      else if (view === 'funciones') {
        await cargarFunciones(false);
        // En paralelo (antes iba en serie y trababa con muchas funciones).
        await Promise.all(state.funciones.map(async (f) => {
          try {
            state.inv[f.fecha_iso] = await api(window.teatroApi(`disponibilidad?fecha=${f.fecha_iso}`));
          } catch { /* */ }
        }));
        v4RenderFunciones();
      } else if (view === 'informes') {
        const jobs = [];
        if (perm('verFiscal')) jobs.push(cargarFiscal().catch(() => { state.fiscal = 0; }));
        if (perm('verVentas')) jobs.push(cargarFunciones(false), cargarInformeFunciones());
        if (perm('verAuditoria')) jobs.push(cargarAuditoria().catch(() => { state.auditoria = []; }));
        if (state.informeFuncionSel && perm('verVentas')) {
          jobs.push(cargarVentasFuncion(state.informeFuncionSel).catch(() => { state.informeVentas = []; }));
        }
        await Promise.allSettled(jobs);
        v4Toggle('informes-fiscal-wrap', perm('verFiscal'));
        v4SetText('stat-fiscal', fmtMXN(state.fiscal));
        v4Toggle('btn-fiscal-reset', perm('fiscalReset'));
        v4Toggle('btn-export-todo-inf', perm('exportarDatos'));
        v4Toggle('btn-refrescar-informes', true);
        const err = document.getElementById('informe-error-msg');
        if (err) {
          if (state.informeError) { err.textContent = state.informeError; err.classList.remove('hidden'); }
          else err.classList.add('hidden');
        }
        v4RenderInformeFn();
        v4RenderInformeVentas();
        v4FillCompFuncionesSelect();
        v4RenderAuditoriaFixed('audit-tbody-inf', 'audit-count-inf', document.getElementById('audit-filtro-inf')?.value || '');
        v4RenderOpsInformes();
      } else if (view === 'equipo') {
        if (!perm('gestionarEquipo')) { v4ShowView('hub'); return v4PaintView('hub'); }
        await cargarUsuarios();
        v4RenderEquipo();
      } else if (view === 'auditoria') {
        if (!perm('verAuditoria')) { v4ShowView('hub'); return v4PaintView('hub'); }
        await cargarAuditoria().catch(() => { state.auditoria = []; });
        v4RenderAuditoriaFixed('audit-tbody', 'audit-count', document.getElementById('audit-filtro')?.value || state.auditFilter);
      } else if (view === 'sitio') {
        if (!perm('editarSitio')) { v4ShowView('hub'); return v4PaintView('hub'); }
        await cargarSitio();
        v4RenderSitio();
      } else if (view === 'boletera') {
        if (!perm('venderEfectivo')) { v4ShowView('hub'); return v4PaintView('hub'); }
        v4CargarIframeBoletera();
      } else if (view === 'verificar') {
        if (!perm('verificarBoletos')) { v4ShowView('hub'); return v4PaintView('hub'); }
        v4CargarVerificar();
      }
    } catch (e) {
      alert(e.message);
    }
  }

  async function v4Paint() {
    v4SetupNav();
    v4ShowView(state.view);
    await v4PaintView(state.view);
    if (!state.v4Bound) {
      v4BindEvents();
      state.v4Bound = true;
    }
  }

  function v4SetupNav() {
    const map = {
      hub: perm('verVentas'),
      ops: perm('verVentas'),
      funciones: perm('verInventario') || perm('verVentas'),
      informes: perm('verVentas') || perm('verAuditoria') || perm('verFiscal') || perm('exportarDatos'),
      equipo: perm('gestionarEquipo'),
      auditoria: perm('verAuditoria'),
      sitio: perm('editarSitio'),
      boletera: perm('venderEfectivo'),
      verificar: perm('verificarBoletos'),
    };
    let first = null;
    document.querySelectorAll('.nav-item[data-nav]').forEach(el => {
      const ok = !!map[el.dataset.nav];
      el.style.display = ok ? '' : 'none';
      if (ok && !first) first = el.dataset.nav;
    });
    if (!map[state.view]) state.view = first || 'hub';
  }

  function v4BindEvents() {
    v4CargarInformesGuardados();
    document.getElementById('ventas-search')?.addEventListener('input', () => v4RenderVentasTable());
    document.getElementById('ventas-estado-filter')?.addEventListener('change', (e) => {
      state.ventasEstado = e.target.value;
      v4RenderVentasTable();
    });
    document.getElementById('btn-export-todo')?.addEventListener('click', () => {
      exportCsv(v4VentasFiltradas(), `ventas_${TID()}_${Date.now()}.csv`);
    });
    document.getElementById('btn-venta-manual')?.addEventListener('click', () => { abrirBoletera(); });
    document.getElementById('btn-email-post-funcion')?.addEventListener('click', async () => {
      if (!state.chipFuncion) return;
      const fn = state.funciones.find(f => f.fecha_iso === state.chipFuncion);
      const conEmail = state.ventas.filter(v => v.email && v.estado !== 'reembolsada' && (v.fecha === state.chipFuncion || v.fechaContable === state.chipFuncion)).length;
      const ok = await v4ConfirmarAccion({
        titulo: 'Enviar correo post-función',
        resumenHtml: `<dl class="confirm-summary">
          <dt>Función</dt><dd>${esc(fn?.nombre || state.chipFuncion)}</dd>
          <dt>Destinatarios</dt><dd>${conEmail} asistente(s) con email</dd>
          <dt>Contenido</dt><dd>Encuesta / acta privada tras la función</dd>
        </dl>`,
      });
      if (!ok) return;
      try {
        const r = await api(window.teatroAdminApi('email-post-funcion'), { method: 'POST', body: JSON.stringify({ fecha: state.chipFuncion }) });
        v4GuardarInforme(v4CrearInforme('email_post', 'Email post-función', `Función: ${fn?.nombre}\nEnviados: ${r.enviados}`, `${r.enviados} enviados`, JSON.stringify(r)));
        alert(`Post-función: ${r.enviados} enviados${r.fallidos ? `, ${r.fallidos} fallidos` : ''}${r.omitidos ? `, ${r.omitidos} omitidos` : ''}.`);
      } catch (e) { alert(e.message); }
    });

    document.getElementById('btn-email-dia-funcion')?.addEventListener('click', async () => {
      if (!state.chipFuncion) return;
      const fn = state.funciones.find(f => f.fecha_iso === state.chipFuncion);
      const conEmail = state.ventas.filter(v => v.email && v.estado !== 'reembolsada' && v.fecha === state.chipFuncion).length;
      const ok = await v4ConfirmarAccion({
        titulo: 'Enviar correo del día (programa v2)',
        resumenHtml: `<dl class="confirm-summary">
          <dt>Función</dt><dd>${esc(fn?.nombre || state.chipFuncion)}</dd>
          <dt>Destinatarios</dt><dd>${conEmail} comprador(es) con email</dd>
          <dt>Contenido</dt><dd>Indicaciones de llegada + enlace al programa de mano v2</dd>
        </dl>`,
      });
      if (!ok) return;
      try {
        const r = await api(window.teatroAdminApi('email-dia-funcion'), {
          method: 'POST',
          body: JSON.stringify({ fecha: state.chipFuncion, forzar: true }),
        });
        v4GuardarInforme(v4CrearInforme('email_dia', 'Email día de función', `Función: ${fn?.nombre}\nEnviados: ${r.enviados}`, `${r.enviados} enviados`, JSON.stringify(r)));
        alert(`Día de función: ${r.enviados} enviados${r.fallidos ? `, ${r.fallidos} fallidos` : ''}${r.omitidos ? `, ${r.omitidos} omitidos` : ''}.`);
      } catch (e) { alert(e.message); }
    });

    document.getElementById('ops-input')?.addEventListener('keydown', e => { if (e.key === 'Enter') v4BuscarVenta(); });
    document.getElementById('ops-btn-reagenda')?.addEventListener('click', () => {
      if (state.opsVenta?.fecha) v4RenderReagDest(state.opsVenta.fecha);
      v4Toggle('ops-reag-panel', true);
    });
    document.getElementById('ops-reag-cancel')?.addEventListener('click', () => v4Toggle('ops-reag-panel', false));
    document.getElementById('ops-reag-ok')?.addEventListener('click', async () => {
      const v = state.opsVenta;
      const cert = v && certVenta(v);
      const dest = document.getElementById('ops-reag-dest')?.value;
      if (!cert || !dest) return;
      const ok = await v4ConfirmarAccion({
        titulo: 'Confirmar reagendamiento',
        resumenHtml: v4HtmlResumenReagenda(v, dest),
        peligro: true,
        btnOk: 'Reagendar',
      });
      if (!ok) return;
      try {
        const data = await api(window.teatroAdminApi('reagendar'), { method: 'POST', body: JSON.stringify({ codigo: cert, fechaDestino: dest }) });
        v4GuardarInforme(v4InformeReagenda(v, dest, data));
        await v4BuscarVenta(cert);
        v4OpsMsg(msgReagendarOk(data), 'green');
        if (state.view === 'hub') await v4RenderHub();
      } catch (e) { v4OpsMsg(e.message, 'red'); }
    });
    document.getElementById('ops-btn-reenvio')?.addEventListener('click', async () => {
      const v = state.opsVenta;
      const cert = v && certVenta(v);
      if (!cert) return;
      const ok = await v4ConfirmarAccion({
        titulo: 'Reenviar boleto por correo',
        resumenHtml: v4HtmlResumenReenvio(v),
      });
      if (!ok) return;
      try {
        await reenviarEmailVenta(cert);
        v4GuardarInforme(v4CrearInforme('reenvio', 'Reenvío de boleto', `Certificado: ${cert}\nEmail: ${v.email}`, cert, 'Enviado.'));
        v4OpsMsg('Boleto reenviado.', 'green');
      } catch (e) { v4OpsMsg(e.message, 'red'); }
    });
    document.getElementById('ops-btn-email')?.addEventListener('click', () => v4Toggle('ops-email-panel', true));
    document.getElementById('ops-corregir-ok')?.addEventListener('click', async () => {
      const v = state.opsVenta;
      const cert = v && certVenta(v);
      const email = document.getElementById('ops-email-nuevo')?.value?.trim();
      if (!cert || !email) return;
      const ok = await v4ConfirmarAccion({
        titulo: 'Corregir correo y reenviar',
        resumenHtml: v4HtmlResumenEmail(v, email),
      });
      if (!ok) return;
      try {
        await reenviarEmailVenta(cert, email);
        v4GuardarInforme(v4CrearInforme('email_corregido', 'Correo corregido', `Certificado: ${cert}\nNuevo email: ${email}`, cert, 'Actualizado y enviado.'));
        v4OpsMsg('Correo corregido y boleto enviado.', 'green');
        await v4BuscarVenta(cert);
      } catch (e) { v4OpsMsg(e.message, 'red'); }
    });
    document.getElementById('ops-btn-reembolso')?.addEventListener('click', async () => {
      const v = state.opsVenta;
      const cert = v && certVenta(v);
      if (!cert) return;
      const ok = await v4ConfirmarAccion({
        titulo: v?.metodoPago && v.metodoPago !== 'efectivo' ? 'Confirmar reembolso' : 'Confirmar anulación',
        resumenHtml: v4HtmlResumenReembolso(v),
        peligro: true,
        requierePin: true,
        btnOk: v?.metodoPago && v.metodoPago !== 'efectivo' ? 'Reembolsar' : 'Anular',
      });
      if (!ok) return;
      try {
        const data = await api(window.teatroAdminApi('reembolso'), {
          method: 'POST',
          body: JSON.stringify({ codigo: cert, pinFinanciero: v4PinFinanciero() }),
        });
        v4GuardarInforme(v4InformeReembolso(v, data));
        v4OpsMsg('Reembolso procesado.', 'green');
        if (state.view === 'hub') await v4RenderHub();
        await cargarAuditoria().catch(() => {});
      } catch (e) { v4OpsMsg(e.message, 'red'); }
    });

    document.getElementById('dv-btn-reagenda')?.addEventListener('click', () => {
      if (state.drawerVenta?.fecha) v4RenderReagDest(state.drawerVenta.fecha);
      v4Toggle('dv-reag-panel', true);
    });
    document.getElementById('dv-reag-cancel')?.addEventListener('click', () => v4Toggle('dv-reag-panel', false));
    document.getElementById('dv-reag-ok')?.addEventListener('click', async () => {
      const v = state.drawerVenta;
      const cert = v && certVenta(v);
      const dest = document.getElementById('dv-reag-dest')?.value;
      if (!cert || !dest) return;
      const ok = await v4ConfirmarAccion({
        titulo: 'Confirmar reagendamiento',
        resumenHtml: v4HtmlResumenReagenda(v, dest),
        peligro: true,
        btnOk: 'Reagendar',
      });
      if (!ok) return;
      try {
        const data = await api(window.teatroAdminApi('reagendar'), { method: 'POST', body: JSON.stringify({ codigo: cert, fechaDestino: dest }) });
        v4GuardarInforme(v4InformeReagenda(v, dest, data));
        const fresh = await api(window.teatroAdminApi(`venta/${encodeURIComponent(cert)}`));
        v4PoblarDrawer(fresh);
        v4Toggle('dv-reag-panel', false);
        v4DrawerMsg(msgReagendarOk(data), 'green');
        if (state.view === 'hub') await v4RenderHub();
      } catch (e) { v4DrawerMsg(e.message, 'red'); }
    });
    document.getElementById('dv-btn-reenvio')?.addEventListener('click', async () => {
      const v = state.drawerVenta;
      const cert = v && certVenta(v);
      if (!cert) return;
      const ok = await v4ConfirmarAccion({
        titulo: 'Reenviar boleto por correo',
        resumenHtml: v4HtmlResumenReenvio(v),
      });
      if (!ok) return;
      try {
        await reenviarEmailVenta(cert);
        v4GuardarInforme(v4CrearInforme('reenvio', 'Reenvío de boleto', `Certificado: ${cert}`, cert, 'Enviado.'));
        v4DrawerMsg('Boleto reenviado.', 'green');
      } catch (e) { v4DrawerMsg(e.message, 'red'); }
    });
    document.getElementById('dv-btn-email')?.addEventListener('click', () => v4Toggle('dv-email-panel', true));
    document.getElementById('dv-corregir-ok')?.addEventListener('click', async () => {
      const v = state.drawerVenta;
      const cert = v && certVenta(v);
      const email = document.getElementById('dv-email-nuevo')?.value?.trim();
      if (!cert || !email) return;
      const ok = await v4ConfirmarAccion({
        titulo: 'Corregir correo y reenviar',
        resumenHtml: v4HtmlResumenEmail(v, email),
      });
      if (!ok) return;
      try {
        const r = await reenviarEmailVenta(cert, email);
        v4GuardarInforme(v4CrearInforme('email_corregido', 'Correo corregido', `Certificado: ${cert}\nNuevo: ${email}`, cert, 'Enviado.'));
        v4SetText('dv-email', r.emailEnviado || email);
        v4DrawerMsg('Correo actualizado y boleto enviado.', 'green');
        if (state.view === 'hub') await v4RenderHub();
      } catch (e) { v4DrawerMsg(e.message, 'red'); }
    });
    document.getElementById('dv-btn-reembolso')?.addEventListener('click', async () => {
      const v = state.drawerVenta;
      const cert = v && certVenta(v);
      if (!cert) return;
      const ok = await v4ConfirmarAccion({
        titulo: v?.metodoPago && v.metodoPago !== 'efectivo' ? 'Confirmar reembolso' : 'Confirmar anulación',
        resumenHtml: v4HtmlResumenReembolso(v),
        peligro: true,
        requierePin: true,
        btnOk: v?.metodoPago && v.metodoPago !== 'efectivo' ? 'Reembolsar' : 'Anular',
      });
      if (!ok) return;
      try {
        const data = await api(window.teatroAdminApi('reembolso'), {
          method: 'POST',
          body: JSON.stringify({ codigo: cert, pinFinanciero: v4PinFinanciero() }),
        });
        v4GuardarInforme(v4InformeReembolso(v, data));
        v4CerrarDrawer();
        if (state.view === 'hub') await v4RenderHub();
      } catch (e) { v4DrawerMsg(e.message, 'red'); }
    });

    document.getElementById('dv-btn-eliminar')?.addEventListener('click', async () => {
      const v = state.drawerVenta;
      const cert = v && certVenta(v);
      if (!cert) return;
      const ok = await v4ConfirmarAccion({
        titulo: 'Eliminar venta de prueba',
        resumenHtml: v4HtmlResumenEliminar(v),
        peligro: true,
        requierePin: true,
        btnOk: 'Eliminar',
      });
      if (!ok) return;
      try {
        await api(window.teatroAdminApi(`venta/${encodeURIComponent(cert)}/eliminar`), {
          method: 'POST',
          body: JSON.stringify({ pinFinanciero: v4PinFinanciero() }),
        });
        v4CerrarDrawer();
        if (state.view === 'hub') await v4RenderHub();
      } catch (e) { v4DrawerMsg(e.message, 'red'); }
    });

    document.getElementById('confirm-op-cancel')?.addEventListener('click', () => v4CerrarConfirm(false));
    document.getElementById('confirm-op-cancel2')?.addEventListener('click', () => v4CerrarConfirm(false));
    document.getElementById('confirm-op-ok')?.addEventListener('click', () => v4CerrarConfirm(true));
    document.getElementById('modal-confirm-op')?.addEventListener('click', (e) => {
      if (e.target.id === 'modal-confirm-op') v4CerrarConfirm(false);
    });

    document.getElementById('modal-enlace-close')?.addEventListener('click', () => {
      document.getElementById('modal-enlace-taquilla')?.classList.remove('open');
    });
    document.getElementById('modal-enlace-cancel')?.addEventListener('click', () => {
      document.getElementById('modal-enlace-taquilla')?.classList.remove('open');
    });
    document.getElementById('modal-enlace-ok')?.addEventListener('click', () => { copiarEnlaceBoletera(); });
    document.getElementById('modal-enlace-taquilla')?.addEventListener('click', (e) => {
      if (e.target.id === 'modal-enlace-taquilla') e.currentTarget.classList.remove('open');
    });

    document.getElementById('modal-preview-close')?.addEventListener('click', () => {
      document.getElementById('modal-preview-boleto')?.classList.remove('open');
    });
    document.getElementById('modal-preview-boleto')?.addEventListener('click', (e) => {
      if (e.target.id === 'modal-preview-boleto') e.currentTarget.classList.remove('open');
    });

    document.getElementById('audit-filtro')?.addEventListener('change', e => {
      state.auditFilter = e.target.value;
      v4RenderAuditoriaFixed('audit-tbody', 'audit-count', state.auditFilter);
    });
    document.getElementById('audit-filtro-inf')?.addEventListener('change', e => {
      v4RenderAuditoriaFixed('audit-tbody-inf', 'audit-count-inf', e.target.value);
    });

    document.getElementById('btn-export-todo-inf')?.addEventListener('click', async () => {
      await cargarVentas();
      const blob = new Blob([JSON.stringify(state.ventas, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `ventas_${TID()}_${Date.now()}.json`;
      a.click();
    });
    document.getElementById('btn-refrescar-informes')?.addEventListener('click', async () => {
      await v4PaintView('informes');
    });
    document.getElementById('btn-comp-buscar')?.addEventListener('click', () => v4BuscarCompradores());
    document.getElementById('comp-buscar')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') v4BuscarCompradores();
    });
    document.getElementById('btn-comp-export')?.addEventListener('click', () => {
      const desde = document.getElementById('comp-desde')?.value || 'todas';
      const hasta = document.getElementById('comp-hasta')?.value || 'fechas';
      exportCsv(state.compradores, `compradores_${TID()}_${desde}_${hasta}_${Date.now()}.csv`);
    });
    document.getElementById('btn-fiscal-reset')?.addEventListener('click', async () => {
      const ok = await v4ConfirmarAccion({
        titulo: 'Resetear reserva fiscal',
        resumenHtml: `<dl class="confirm-summary"><dt>Acción</dt><dd>Poner la reserva fiscal acumulada (8%) en <strong>$0</strong> tras pago de impuesto.</dd></dl>`,
        peligro: true,
        requierePin: true,
        btnOk: 'Resetear',
      });
      if (!ok) return;
      try {
        await api(window.teatroAdminApi('fiscal/reset'), {
          method: 'POST',
          body: JSON.stringify({ pinFinanciero: v4PinFinanciero() }),
        });
        await v4PaintView('informes');
      } catch (e) { alert(e.message); }
    });

    document.getElementById('btn-nuevo-usuario')?.addEventListener('click', () => openUserModal());
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

  window.navGo = function navGo(el, view) {
    if (el?.dataset?.nav) view = el.dataset.nav;
    v4ShowView(view);
    v4PaintView(view);
    window.AdminMobile?.onNav?.(view);
  };

  window.closeDrawer = v4CerrarDrawer;

  function abrirBoletera() {
    const nav = document.getElementById('nav-boletera') || document.querySelector('[data-nav=boletera]');
    navGo(nav, 'boletera');
  }

  function abrirVerificar(abrirScan) {
    const nav = document.getElementById('nav-verificar') || document.querySelector('[data-nav=verificar]');
    navGo(nav, 'verificar');
    if (abrirScan || new URLSearchParams(location.search).get('scan') === '1') {
      setTimeout(() => window.abrirScanner?.(), 500);
    }
  }

  function abrirModalEnlaceTaquilla() {
    document.getElementById('enlace-nombre')?.focus();
    document.getElementById('enlace-error')?.classList.add('hidden');
    document.getElementById('modal-enlace-taquilla')?.classList.add('open');
  }

  async function copiarEnlaceBoletera() {
    const nombre = document.getElementById('enlace-nombre')?.value?.trim();
    const email = document.getElementById('enlace-email')?.value?.trim();
    const errEl = document.getElementById('enlace-error');
    if (!nombre || !email) {
      if (errEl) { errEl.textContent = 'Nombre y correo son obligatorios.'; errEl.classList.remove('hidden'); }
      return;
    }
    try {
      const data = await api(`${window.API_BASE}/api/admin/acceso/crear`, {
        method: 'POST',
        body: JSON.stringify({ nombre, email }),
      });
      document.getElementById('modal-enlace-taquilla')?.classList.remove('open');
      if (data.emailEnviado) {
        alert(`Correo enviado a ${data.email}. Válido 4 h.`);
      } else if (data.url) {
        await navigator.clipboard.writeText(data.url);
        alert(`No se pudo enviar el correo. Enlace copiado para ${data.nombre} (válido 4 h).`);
      }
    } catch (e) {
      if (errEl) { errEl.textContent = e.message || 'No se pudo generar el acceso.'; errEl.classList.remove('hidden'); }
    }
  }

  window.abrirBoletera = abrirBoletera;
  window.abrirVerificar = abrirVerificar;
  window.abrirModalEnlaceTaquilla = abrirModalEnlaceTaquilla;
  window.copiarEnlaceBoletera = copiarEnlaceBoletera;
  window.v4PreviewBoleto = v4PreviewBoleto;

  window.switchTab = function switchTab(btn, tabId) {
    btn.parentElement?.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    v4Toggle('tab-resumen', tabId === 'tab-resumen');
    v4Toggle('tab-compradores', tabId === 'tab-compradores');
    v4Toggle('tab-audit2', tabId === 'tab-audit2');
    v4Toggle('tab-informes-ops', tabId === 'tab-informes-ops');
    if (tabId === 'tab-informes-ops') v4RenderOpsInformes();
    if (tabId === 'tab-compradores') {
      v4FillCompFuncionesSelect();
      if (!state.compradores.length) v4BuscarCompradores();
      else v4RenderCompradores();
    }
  };

  window.opsBuscarVenta = function opsBuscarVenta(q) {
    return v4BuscarVenta(q);
  };

  function openUserModal(editId) {
    const m = document.getElementById('modal-user');
    if (!m) return;
    if (IS_V4()) m.classList.add('open');
    else m.classList.remove('hidden');
    const errEl = document.getElementById('mu-error');
    if (errEl) {
      errEl.textContent = '';
      if (IS_V4()) errEl.style.display = 'none';
      else errEl.classList.add('hidden');
    }
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
      if (IS_V4()) document.getElementById('modal-user')?.classList.remove('open');
      else document.getElementById('modal-user')?.classList.add('hidden');
      paint();
    } catch (e) {
      if (err) {
        err.textContent = e.message;
        if (IS_V4()) err.style.display = 'block';
        else err.classList.remove('hidden');
      }
    }
  }

  function v4AplicarUiAcceso(usuario) {
    const viaEmail = !!usuario.viaEmail;
    document.querySelectorAll('.nav-item[data-nav]').forEach(el => {
      const nav = el.dataset.nav;
      if (!viaEmail) return;
      const ok = nav === 'boletera' || nav === 'verificar';
      el.classList.toggle('hidden', !ok);
    });
    document.querySelectorAll('.sidebar-section').forEach(el => { if (viaEmail) el.classList.add('hidden'); });
    const topSite = document.getElementById('link-sitio')
      || document.querySelector('.topbar-btn[href="/"], .topbar-btn[href="index.html"]');
    if (topSite && viaEmail) topSite.classList.add('hidden');
    v4Toggle('link-boletera', !viaEmail && perm('venderEfectivo'));
    v4Toggle('btn-copiar-boletera', !viaEmail && (usuario.rol === 'admin' || usuario.rol === 'gerente'));
    v4Toggle('link-verificar', !viaEmail && perm('verificarBoletos'));
    v4Toggle('nav-boletera', perm('venderEfectivo'));
    v4Toggle('nav-verificar', perm('verificarBoletos'));
    v4Toggle('mob-nav-boletera', perm('venderEfectivo'));
    v4Toggle('mob-nav-verificar', perm('verificarBoletos'));
  }

  window.AdminPanel = {
    iniciar(usuario, viewInicial) {
      if (window.ElGorilaApi?.iniciarMonitorRed) ElGorilaApi.iniciarMonitorRed();
      if (usuario.rol === 'validacion' && !usuario.viaEmail) {
        state.view = 'verificar';
      }

      const elU = document.getElementById('usuario-actual');
      const elR = document.getElementById('rol-actual');
      const label = usuario.viaEmail && (usuario.email || usuario.telefono)
        ? `${usuario.nombre} · ${usuario.email || usuario.telefono}`
        : (usuario.nombre || usuario.usuarioId);
      if (elU) elU.textContent = label;
      if (elR) elR.textContent = usuario.viaEmail ? 'TAQUILLA · ENLACE' : (usuario.rol || 'admin').toUpperCase();

      v4Toggle('link-boletera', !usuario.viaEmail && perm('venderEfectivo'));
      v4Toggle('btn-copiar-boletera', !usuario.viaEmail && (usuario.rol === 'admin' || usuario.rol === 'gerente'));
      v4Toggle('link-verificar', !usuario.viaEmail && perm('verificarBoletos'));
      v4Toggle('nav-boletera', perm('venderEfectivo'));
      v4Toggle('nav-verificar', perm('verificarBoletos'));

      v4AplicarUiAcceso(usuario);

      if (usuario.viaEmail) state.view = 'boletera';
      else if (viewInicial === 'boletera' && perm('venderEfectivo')) state.view = 'boletera';
      else if (viewInicial === 'verificar' && perm('verificarBoletos')) state.view = 'verificar';
      else if (usuario.rol === 'validacion') state.view = 'verificar';
      else if (!perm('verVentas') && IS_V4()) {
        if (perm('verAuditoria')) state.view = 'auditoria';
        else if (perm('editarSitio')) state.view = 'sitio';
        else if (perm('gestionarEquipo')) state.view = 'equipo';
      }
      paint();
      window.AdminMobile?.configure?.(usuario);
      window.AdminMobile?.onNav?.(state.view);
    },
  };

  let loginTaquillaMode = false;

  window.toggleLoginTaquilla = function toggleLoginTaquilla() {
    loginTaquillaMode = !loginTaquillaMode;
    document.getElementById('login-admin-fields')?.classList.toggle('hidden', loginTaquillaMode);
    document.getElementById('login-taquilla-fields')?.classList.toggle('hidden', !loginTaquillaMode);
    const btn = document.getElementById('login-submit-btn');
    const toggle = document.getElementById('login-toggle-taquilla');
    if (btn) btn.textContent = loginTaquillaMode ? 'Entrar taquilla' : 'Entrar';
    if (toggle) {
      toggle.textContent = loginTaquillaMode
        ? 'Volver a acceso administrador'
        : 'Acceso taquilla (nombre + correo)';
    }
    const err = document.getElementById('error-login');
    if (err) loginErrorShow('');
  };

  window.verificarAcceso = async function verificarAcceso() {
    loginErrorShow('');

    if (loginTaquillaMode) {
      const nombre = document.getElementById('taquilla-nombre-input')?.value?.trim();
      const email  = document.getElementById('taquilla-email-input')?.value?.trim();
      if (!nombre || !email) {
        loginErrorShow('Ingresa nombre y correo autorizados');
        return;
      }
      const r = await AuthManager.autenticarAccesoTaquilla(nombre, email);
      if (!r.ok) {
        loginErrorShow(r.error || 'Acceso denegado');
        return;
      }
      document.getElementById('login-screen')?.classList.add('hidden');
      document.getElementById('admin-panel')?.classList.remove('hidden');
      AdminPanel.iniciar(r.usuario, 'boletera');
      return;
    }

    const usuarioId = document.getElementById('usuario-input')?.value?.trim();
    const password  = document.getElementById('password-input')?.value;
    if (!usuarioId || !password) {
      loginErrorShow('Ingresa usuario y contraseña');
      return;
    }
    const resultado = await AuthManager.autenticarAdmin(usuarioId, password);
    if (!resultado.exito) {
      loginErrorShow(resultado.error || 'Credenciales incorrectas');
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

  document.addEventListener('DOMContentLoaded', async () => {
    const params = new URLSearchParams(location.search);
    const acceso = params.get('acceso');
    const viewParam = params.get('view');

    if (acceso) {
      const r = await AuthManager.validarAccesoEmail(acceso);
      if (r.ok) {
        params.delete('acceso');
        const qs = params.toString();
        history.replaceState(null, '', location.pathname + (qs ? `?${qs}` : ''));
        document.getElementById('login-screen')?.classList.add('hidden');
        document.getElementById('admin-panel')?.classList.remove('hidden');
        AdminPanel.iniciar(r.usuario, viewParam || 'boletera');
        return;
      }
      const err = document.getElementById('error-login');
      if (err) loginErrorShow(r.error || 'Enlace inválido o expirado.');
    }

    const u = AuthManager.obtenerUsuarioActual();
    if (u) {
      document.getElementById('login-screen')?.classList.add('hidden');
      document.getElementById('admin-panel')?.classList.remove('hidden');
      AdminPanel.iniciar(u, viewParam === 'boletera' || viewParam === 'verificar' ? viewParam : undefined);
      if (viewParam === 'verificar' && params.get('scan') === '1') {
        setTimeout(() => window.abrirScanner?.(), 700);
      }
      return;
    }

    document.addEventListener('keypress', e => {
      if (e.key === 'Enter' && !document.getElementById('login-screen')?.classList.contains('hidden')) {
        verificarAcceso();
      }
    });
  });
})();
