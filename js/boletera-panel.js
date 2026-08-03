(function (global) {
  'use strict';
  let _inited = false;

function bolNavGo(btn, view) {
  const root = document.getElementById('view-boletera');
  if (!root) return;
  // "lista" quedó unida a En vivo
  if (view === 'lista') view = 'venta';
  root.querySelectorAll('.bol-tab').forEach(n => n.classList.toggle('active', n === btn));
  root.querySelectorAll('.bol-admin-view').forEach(v => v.classList.add('hidden'));
  root.querySelector('#view-bol-' + view)?.classList.remove('hidden');
}

function _boletaToken() {
  return typeof AuthManager !== 'undefined' ? AuthManager.obtenerAdminToken() : null;
}

function _hoyIsoMx() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
}

function _etiquetaTipoItem(tipo) {
  if (tipo === 'general') return 'General';
  if (tipo === 'estudiante' || tipo === 'inapam' || tipo === 'maestro') return 'Credencial';
  return tipo || 'General';
}

/** Resumen de papel a entregar (cortesía / general / cupón). */
function _resumenPapel(opts) {
  const metodo = (opts.metodoPago || '').toLowerCase();
  const items = opts.items || [];
  if (metodo === 'cortesia' || opts.cortesia) {
    const n = opts.cantidad || items.reduce((s, i) => s + (i.cantidad || 0), 0) || 1;
    return `${n} × Cortesía`;
  }
  const partes = [];
  if (items.length) {
    items.forEach(i => {
      partes.push(`${i.cantidad || 0} × ${_etiquetaTipoItem(i.tipo)}`);
    });
  } else if (opts.cantidad) {
    partes.push(`${opts.cantidad} × General`);
  }
  let txt = partes.join(' · ') || '—';
  if (opts.codigoCupon) txt += ` · ${opts.codigoCupon}`;
  return txt;
}

async function _boletaIniciar() {
  await Promise.all([
    _boletaCargarDisponibilidad(),
    _boletaCargarTablaDia(),
    _boletaCargarFuncionesGrids(),
  ]);
  document.getElementById('bol-lista-buscar')?.addEventListener('input', () => _boletaFiltrarLista());
}

let _bolFuncionesCache = [];

function _bolActualizarEtiquetaFuncion(iso) {
  const el = document.getElementById('bol-funcion-seleccionada');
  if (el) {
    const f = _bolFuncionesCache.find(x => x.fecha_iso === iso);
    el.textContent = f ? (f.nombre || iso) : (iso ? iso : 'Selecciona una función');
  }
  _bolActualizarAvisoFuncion(iso);
}

function _bolActualizarAvisoFuncion(iso) {
  const aviso = document.getElementById('bol-funcion-aviso');
  if (!aviso) return;
  if (!iso) {
    aviso.hidden = true;
    aviso.textContent = '';
    return;
  }
  const hoy = _hoyIsoMx();
  aviso.hidden = false;
  if (iso === hoy) {
    aviso.className = 'bol-funcion-aviso hoy';
    aviso.textContent = 'Función de hoy — al registrar se marca el ingreso.';
  } else {
    aviso.className = 'bol-funcion-aviso otra';
    aviso.textContent = 'Otra función — solo se reserva; no se valida el ingreso ahora.';
  }
}

function _bolSyncListaConVenta(iso) {
  const lista = document.getElementById('bol-lista-funcion');
  if (lista && iso && lista.value !== iso) {
    lista.value = iso;
  }
  if (iso) _boletaCargarListaPuerta();
}

async function _boletaCargarFuncionesGrids() {
  if (typeof SelectorFunciones === 'undefined') return;
  try {
    const res = await fetch(window.teatroApi('funciones'));
    if (!res.ok) return;
    _bolFuncionesCache = SelectorFunciones.normalizarLista(await res.json());

    const onVentaSelect = iso => {
      _bolActualizarEtiquetaFuncion(iso);
      BoleteraVenta?.onFechaChange?.();
      _bolSyncListaConVenta(iso);
    };

    const ventaIso = SelectorFunciones.wireHiddenProgressive
      ? SelectorFunciones.wireHiddenProgressive(
        document.getElementById('bol-venta-funciones-grid'),
        document.getElementById('bol-venta-funciones-ui'),
        document.getElementById('fecha-efectivo'),
        _bolFuncionesCache,
        {
          futuras: true,
          showDisponibles: true,
          batchSize: 3,
          onSelect: onVentaSelect,
        },
      )
      : SelectorFunciones.wireHidden(
        document.getElementById('bol-venta-funciones-grid'),
        document.getElementById('fecha-efectivo'),
        _bolFuncionesCache,
        {
          futuras: true,
          showDisponibles: true,
          onSelect: onVentaSelect,
        },
      );
    _bolActualizarEtiquetaFuncion(ventaIso);

    // Hidden grid para mantener API de lista; se sincroniza desde venta
    SelectorFunciones.wireHidden(
      document.getElementById('bol-lista-funciones-grid'),
      document.getElementById('bol-lista-funcion'),
      _bolFuncionesCache,
      { modoLista: true, onSelect: () => _boletaCargarListaPuerta() },
    );
    if (ventaIso) {
      _bolSyncListaConVenta(ventaIso);
    } else if (document.getElementById('bol-lista-funcion')?.value) {
      await _boletaCargarListaPuerta();
    }
  } catch (_) {}
}

/* ── Lista visitantes / check-in ─────────────────────────── */
const _GRUPO_COLORS = ['#D43A1A', '#2563eb', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#db2777'];
let _listaGruposRaw = [];

function _colorGrupo(cert) {
  let h = 0;
  for (let i = 0; i < (cert || '').length; i++) h = (h + cert.charCodeAt(i) * (i + 1)) % _GRUPO_COLORS.length;
  return _GRUPO_COLORS[h];
}

async function _boletaCargarListaFunciones() {
  await _boletaCargarFuncionesGrids();
}

function _boletaRenderGrupos(grupos) {
  const cont = document.getElementById('bol-lista-grupos');
  if (!cont) return;
  if (!grupos.length) {
    cont.innerHTML = '<p style="color:var(--d-soft);font-size:14px;">Sin ventas para esta función.</p>';
    return;
  }
  cont.innerHTML = grupos.map(g => {
    const color = _colorGrupo(g.certificado);
    const pend = (g.boletos || []).filter(b => !b.usado).length;
    const total = (g.boletos || []).length;
    const papel = _resumenPapel({
      metodoPago: g.metodoPago,
      cortesia: g.cortesia,
      items: g.items,
      cantidad: g.cantidad || total,
      codigoCupon: g.codigoCupon,
    });
    const boletosHtml = (g.boletos || []).map(b => `
      <div class="lista-boleto${b.usado ? ' usado' : ''}" data-cert="${b.cert}" role="button" tabindex="0" title="${b.usado ? 'Toca para quitar check-in' : 'Toca para marcar ingreso'}">
        <div>
          <div class="lista-boleto-folio">${b.folio || b.cert}</div>
          <div class="lista-boleto-meta">${_etiquetaTipoItem(b.tipo)} · #${b.numero || '—'}</div>
        </div>
        <div class="lista-boleto-check" aria-hidden="true">${b.usado ? '✓' : ''}</div>
      </div>`).join('');
    return `
      <div class="lista-grupo" style="border-left-color:${color}">
        <p class="lista-grupo-nombre">${g.nombre || '—'} <span style="font-size:12px;color:var(--d-soft);">(${pend}/${total} pend.)</span></p>
        <p class="lista-grupo-papel">${papel}</p>
        ${boletosHtml}
      </div>`;
  }).join('');
  cont.querySelectorAll('.lista-boleto:not(.usado)').forEach(el => {
    el.onclick = () => _boletaCanjear(el.dataset.cert);
  });
  cont.querySelectorAll('.lista-boleto.usado').forEach(el => {
    el.onclick = () => _boletaDescanjear(el.dataset.cert);
  });
}

function _boletaFiltrarLista() {
  const q = (document.getElementById('bol-lista-buscar')?.value || '').trim().toLowerCase();
  if (!q) { _boletaRenderGrupos(_listaGruposRaw); return; }
  const filtrados = _listaGruposRaw.filter(g => {
    const nombre = (g.nombre || '').toLowerCase();
    const cert = (g.certificado || '').toLowerCase();
    const email = (g.email || '').toLowerCase();
    if (nombre.includes(q) || cert.includes(q) || email.includes(q)) return true;
    return (g.boletos || []).some(b =>
      (b.folio || '').toLowerCase().includes(q) ||
      (b.cert || '').toLowerCase().includes(q)
    );
  });
  _boletaRenderGrupos(filtrados);
}

async function _boletaCargarListaPuerta() {
  const cont = document.getElementById('bol-lista-grupos');
  const resumen = document.getElementById('bol-lista-resumen');
  const fecha = document.getElementById('bol-lista-funcion')?.value;
  const token = _boletaToken();
  if (!cont || !fecha || !token) return;

  cont.innerHTML = '<p style="color:var(--d-soft);font-size:14px;">Cargando lista…</p>';
  try {
    const res = await fetch(window.teatroAdminApi(`lista-puerta?fecha=${encodeURIComponent(fecha)}`), {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error');

    _listaGruposRaw = data.grupos || [];
    if (resumen) {
      resumen.textContent = `${data.ingresados || 0} / ${data.total || 0} ingresados · ${data.pendientes || 0} pendientes`;
    }
    _boletaFiltrarLista();
  } catch (e) {
    cont.innerHTML = `<p style="color:#f87171;">${e.message}</p>`;
  }
}

async function _boletaCanjear(cert) {
  if (!cert) return;
  const token = _boletaToken();
  if (!token) return;
  const fecha = document.getElementById('bol-lista-funcion')?.value
    || document.getElementById('fecha-efectivo')?.value;
  const body = fecha ? JSON.stringify({ fecha }) : undefined;
  try {
    const res = await fetch(window.teatroAdminApi(`canjear/${encodeURIComponent(cert)}`), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body,
    });
    const data = await res.json();
    if (!res.ok) { alert(data.error || 'No se pudo marcar'); return; }
    // Actualización local rápida — sin recargar toda la lista
    const g = _listaGruposRaw.find(x => (x.boletos || []).some(b => b.cert === cert));
    if (g) {
      const b = g.boletos.find(x => x.cert === cert);
      if (b) { b.usado = true; b.usadoEn = data.usadoEn || new Date().toISOString(); }
      g.usado = (g.boletos || []).every(x => x.usado);
      _boletaFiltrarLista();
      const resumen = document.getElementById('bol-lista-resumen');
      if (resumen) {
        const total = _listaGruposRaw.reduce((s, x) => s + (x.boletos || []).length, 0);
        const ingresados = _listaGruposRaw.reduce((s, x) => s + (x.boletos || []).filter(b => b.usado).length, 0);
        resumen.textContent = `${ingresados} / ${total} ingresados · ${total - ingresados} pendientes`;
      }
    } else {
      await _boletaCargarListaPuerta();
    }
  } catch { alert('Error de conexión'); }
}

async function _boletaDescanjear(cert) {
  if (!cert || !confirm(`¿Quitar check-in de ${cert}?`)) return;
  const token = _boletaToken();
  if (!token) return;
  try {
    const res = await fetch(window.teatroAdminApi(`descanjear/${encodeURIComponent(cert)}`), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok) { alert(data.error || 'No se pudo quitar el check-in'); return; }
    await _boletaCargarListaPuerta();
  } catch { alert('Error de conexión'); }
}

/* Disponibilidad */
async function _boletaCargarDisponibilidad() {
  const cont = document.getElementById('disponibilidad-fechas');
  if (!cont) return;
  try {
    const res  = await fetch(window.teatroApi('funciones'));
    if (!res.ok) return;
    const fns  = await res.json();
    if (!fns.length) {
      cont.innerHTML = '<p style="font-size:14px;color:var(--d-soft);">Sin funciones activas.</p>';
      return;
    }
    cont.innerHTML = fns.map(f => {
      const dispFn = typeof window.disponiblesAforoTotal === 'function'
        ? window.disponiblesAforoTotal(f)
        : (typeof f.disponibles === 'number'
          ? f.disponibles
          : Math.max(0, (f.capacidad || 325) - (f.vendidos || 0)));
      const cls  = dispFn > 0 ? 'fecha-card-disponible' : 'fecha-card-agotada';
      const zona = f.galeria_abierta ? ' · venta galería' : '';
      const txt  = dispFn > 0 ? dispFn + ' disponibles (total)' + zona : 'Agotada';
      const secs = f.secciones || {};
      let desglose = '';
      if (secs.platea) {
        desglose += `Platea: ${secs.platea.disponibles ?? '—'} disp. · ${secs.platea.vendidos || 0} vend.`;
      }
      if (secs.galeria) {
        desglose += (desglose ? '<br>' : '') +
          `Galería: ${secs.galeria.disponibles ?? '—'} disp. · ${secs.galeria.vendidos || 0} vend.`;
      }
      if (f.reservados) desglose += (desglose ? '<br>' : '') + `${f.reservados} en carrito web`;
      const cap = f.capacidad || (typeof window.AFORO_TOTAL_WILBERTO === 'number' ? window.AFORO_TOTAL_WILBERTO : 325);
      return `<div class="fecha-card">
        <div class="fecha-card-nombre">${f.nombre || f.fecha_iso}</div>
        <div class="fecha-card-dato ${cls}">${txt}</div>
        <div class="fecha-card-dato">${f.vendidos || 0} vendidos · cap. ${cap}</div>
        ${desglose ? `<div class="fecha-card-dato" style="font-size:13px;margin-top:4px;">${desglose}</div>` : ''}
      </div>`;
    }).join('');
  } catch (e) { cont.innerHTML = '<p style="font-size:13px;color:#f87171;">Error de conexión</p>'; }
}

/* Llenar grids de funciones — ver _boletaCargarFuncionesGrids */
async function _boletaLlenarSelectFunciones() {
  await _boletaCargarFuncionesGrids();
}

/* Tabla de boletos del día */
async function _boletaCargarTablaDia() {
  if (typeof cargarBoletosHoy === 'function') {
    try { await cargarBoletosHoy(); } catch(e) {}
  }
}

async function generarCodigoEfectivo() {
  const errEl    = document.getElementById('venta-error');
  const btn      = document.getElementById('btn-generar');
  const token = _boletaToken();

  if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
  if (!token) { alert('Sesión expirada. Vuelve a entrar.'); return; }

  const fechaIso = document.getElementById('fecha-efectivo')?.value;
  const email    = (document.getElementById('email-efectivo')?.value || '').trim();
  const nombre   = (document.getElementById('nombre-efectivo')?.value || '').trim();
  const notas    = (document.getElementById('notas-efectivo')?.value || '').trim();
  const metodoPago = (document.getElementById('metodo-pago-efectivo')?.value || 'efectivo').trim();
  const cupon    = typeof BoleteraVenta !== 'undefined' ? BoleteraVenta.getCupon() : null;

  if (!fechaIso || !BoleteraVenta || BoleteraVenta.totalCantidad() < 1) {
    if (errEl) { errEl.textContent = 'Selecciona función y al menos un boleto.'; errEl.style.display = 'block'; }
    return;
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    if (errEl) { errEl.textContent = 'Correo inválido — déjalo vacío si no lo dan.'; errEl.style.display = 'block'; }
    return;
  }

  let seccion = 'platea';
  try {
    const dr = await fetch(window.teatroApi(`disponibilidad?fecha=${encodeURIComponent(fechaIso)}`));
    if (dr.ok) {
      const d = await dr.json();
      if (d.galeria_abierta) seccion = 'galeria';
    }
  } catch (_) {}

  const items = BoleteraVenta.itemsParaApi(seccion);

  if (btn) { btn.disabled = true; btn.textContent = 'Registrando…'; }

  const idemKey = window.ElGorilaApi?.crearIdempotencyKey?.() || null;

  const payloadBody = {
    fecha: fechaIso,
    items,
    codigoCupon: cupon?.codigo || undefined,
    email: email || undefined,
    nombre: nombre || undefined,
    metodoPago,
    notas: notas || undefined,
  };

  try {
    let data;
    if (window.ElGorilaApi?.fetchJson) {
      const out = await ElGorilaApi.fetchJson(window.teatroAdminApi('venta-manual'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payloadBody),
      }, { idempotencyKey: idemKey, retries: 3 });
      data = out.data;
    } else {
      const res = await fetch(window.teatroAdminApi('venta-manual'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...(idemKey ? { 'Idempotency-Key': idemKey } : {}),
        },
        body: JSON.stringify(payloadBody),
      });
      data = await res.json();
      if (!res.ok) {
        if (errEl) { errEl.textContent = data.error || 'No se pudo registrar la venta.'; errEl.style.display = 'block'; }
        return;
      }
    }

    const box = document.getElementById('codigo-generado');
    const txt = document.getElementById('codigo-texto');
    const inf = document.getElementById('codigo-info');
    const qr  = document.getElementById('qr-codigo-efectivo');
    const papelEl = document.getElementById('bol-resultado-papel');
    const estadoEl = document.getElementById('bol-resultado-estado');

    const papel = _resumenPapel({
      metodoPago: data.metodoPago || metodoPago,
      items: data.venta?.items || items,
      cantidad: data.venta?.cantidad,
      codigoCupon: data.venta?.codigoCupon || cupon?.codigo,
    });

    if (box) box.style.display = 'block';
    if (papelEl) papelEl.textContent = `A entregar: ${papel}`;
    if (estadoEl) {
      if (data.ingresoMarcado) {
        estadoEl.className = 'bol-resultado-estado ok';
        estadoEl.textContent = 'Ingreso marcado · ya entra';
      } else {
        estadoEl.className = 'bol-resultado-estado otra';
        estadoEl.textContent = `Reservado para ${data.funcionNombre || fechaIso} · no entra hoy`;
      }
    }
    if (txt) txt.textContent = data.codigo;
    if (inf) {
      const metodoLbl = metodoPago === 'cortesia' ? 'Cortesía'
        : metodoPago === 'tarjeta_taquilla' ? 'Tarjeta' : 'Efectivo';
      const mailNote = email
        ? (data.emailEnviado ? ` · enviado a ${email}` : ` · no se pudo enviar a ${email}`)
        : '';
      inf.textContent = `${data.funcionNombre || ''} · $${data.total} MXN · ${metodoLbl}${mailNote}`;
    }
    if (qr && typeof QRCode !== 'undefined') {
      qr.innerHTML = '';
      const qrCodigo = (data.boletos?.length === 1 && data.boletos[0]?.cert)
        ? data.boletos[0].cert
        : (data.codigo || data.certificado || '');
      if (qrCodigo) QRCode.toCanvas(qr, qrCodigo.trim().toUpperCase(), { width: 160, margin: 1 });
    }

    ['nombre-efectivo', 'email-efectivo', 'notas-efectivo'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    BoleteraVenta?.limpiarCarrito?.();

    await Promise.all([_boletaCargarDisponibilidad(), _boletaCargarTablaDia(), _boletaCargarListaPuerta()]);
  } catch (e) {
    const msg = window.ElGorilaApi?.mensajeError?.(e, null, e.data) || e.message || 'Error de conexión.';
    if (errEl) { errEl.textContent = msg; errEl.style.display = 'block'; }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Registrar venta';
      BoleteraVenta?.actualizarUi?.();
    }
  }
}

async function generarCodigo() { await generarCodigoEfectivo(); }

function _esVentaTaquilla(v) {
  const m = (v.metodoPago || '').toLowerCase();
  if (m === 'efectivo' || m === 'tarjeta_taquilla') return true;
  return String(v.sessionId || '').startsWith('manual_') || v.metodoPago === 'efectivo';
}

function _fmtMxn(n) {
  return '$' + (Number(n) || 0).toFixed(2);
}

async function cargarBoletosHoy() {
  const tbody = document.getElementById('tabla-efectivo');
  const token = _boletaToken();
  if (!tbody || !token) return;

  const hoyMx = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });

  try {
    const res = await fetch(window.teatroAdminApi('ventas'), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const { ventas } = await res.json();
    const hoy = (ventas || [])
      .filter(v => _esVentaTaquilla(v) && v.estado !== 'reembolsada' && (v.fechaCompra || '').slice(0, 10) === hoyMx)
      .sort((a, b) => new Date(b.fechaCompra) - new Date(a.fechaCompra));

    let efectivo = 0;
    let tarjeta = 0;
    hoy.forEach(v => {
      const t = Number(v.total) || 0;
      if ((v.metodoPago || '').toLowerCase() === 'tarjeta_taquilla') tarjeta += t;
      else efectivo += t;
    });
    const elEf = document.getElementById('bol-caja-efectivo');
    const elTa = document.getElementById('bol-caja-tarjeta');
    if (elEf) elEf.textContent = `Efectivo: ${_fmtMxn(efectivo)} MXN`;
    if (elTa) elTa.textContent = `Tarjeta en taquilla: ${_fmtMxn(tarjeta)} MXN`;

    if (!hoy.length) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--d-faint);font-family:var(--mono);font-size:10px;letter-spacing:.18em;">Sin ventas taquilla hoy</td></tr>';
      return;
    }
    tbody.innerHTML = hoy.map(v => {
      const st = v.usado ? 'badge-cancelado' : 'badge-activo';
      const lb = v.usado ? 'Canjeado' : 'Válido';
      const info = [v.nombre, v.email].filter(Boolean).join(' · ') || '—';
      const pago = (v.metodoPago || '').toLowerCase() === 'tarjeta_taquilla' ? 'Tarjeta' : 'Efectivo';
      return `<tr>
        <td class="td-code">${v.codigo}</td>
        <td>${v.funcionNombre || v.fecha}</td>
        <td>${v.cantidad}</td>
        <td class="${st}">${lb}</td>
        <td style="font-size:14px;">${pago} · ${info}</td>
      </tr>`;
    }).join('');
  } catch (_) {}
}

function copiarCodigo() {
  const txt = document.getElementById('codigo-texto')?.textContent;
  if (txt && txt !== '—') navigator.clipboard?.writeText(txt).catch(() => {});
}


  async function init() {
    if (_inited || !document.getElementById('view-boletera')) return;
    _inited = true;
    if (window.ElGorilaApi?.iniciarMonitorRed) ElGorilaApi.iniciarMonitorRed();
    await _boletaIniciar();
  }

  global.BoleteraPanel = { init, bolNavGo };
  global.bolNavGo = bolNavGo;
  global.generarCodigo = generarCodigo;
  global.copiarCodigo = copiarCodigo;
})(window);
