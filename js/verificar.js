// --- VERIFICACIÓN DE BOLETOS (Worker API) ---

let _verRoot = null;
function v$(id) {
  if (_verRoot) {
    const el = _verRoot.querySelector('#' + id);
    if (el) return el;
  }
  return document.getElementById(id);
}

let _ventaActual  = null;
let _codigoActual = null;

async function verificarBoleto() {
    const input    = v$('codigo-qr-input');
    const codigo   = (input?.value || '').trim().toUpperCase();
    if (!codigo) { alert('Ingresa un código de folio'); return; }
    if (!window.API_BASE) { alert('API no configurada'); return; }

    _codigoActual = codigo;
    _ventaActual  = null;

    const btnV = v$('btn-verificar');
    if (btnV) { btnV.disabled = true; btnV.textContent = 'Verificando…'; }

    try {
        const res  = await fetch(window.teatroApi(`venta/${encodeURIComponent(codigo)}`));
        const data = await res.json();

        if (!res.ok) {
            mostrarInvalido(data.error || 'Folio no encontrado.');
            return;
        }

        _ventaActual = data;

        if (data.usado) {
            const cuandoMX = new Date(data.usadoEn).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });
            mostrarYaCanjeado(data, cuandoMX);
        } else {
            mostrarValido(data);
        }
    } catch (err) {
        mostrarInvalido('Error de conexión. Intenta de nuevo.');
    } finally {
        if (btnV) { btnV.disabled = false; btnV.textContent = 'Verificar'; }
    }
}

function mostrarValido(venta) {
    v$('resultado-verificacion').classList.remove('hidden');
    v$('resultado-valido').classList.remove('hidden');
    v$('resultado-invalido').classList.add('hidden');

    const entradaLbl = venta.totalBoletos > 1
        ? (venta.esCertificado && venta.pendientes != null
            ? `Certificado · ${venta.pendientes} entrada(s) pendiente(s)`
            : `Entrada ${venta.boletoNum || 1} de ${venta.totalBoletos}`)
        : '1 entrada';

    v$('resultado-codigo').textContent  = venta.codigo;
    v$('resultado-fecha').textContent   =
        `${venta.funcionNombre || venta.fecha || '—'} · ${entradaLbl}`;
    const filaComprador = v$('fila-comprador');
    const filaEmail     = v$('fila-email');
    const mostrarPii    = _puedeVerComprador() && (venta.nombre || venta.email);
    if (filaComprador) {
        filaComprador.classList.toggle('hidden', !mostrarPii);
        v$('resultado-orden').textContent = venta.nombre || venta.email || '—';
    }
    if (filaEmail) {
        filaEmail.classList.toggle('hidden', !(mostrarPii && venta.email));
        v$('resultado-email').textContent = venta.email || '—';
    }

    const estadoEl = v$('resultado-estado');
    estadoEl.textContent = 'VÁLIDO — No canjeado';
    estadoEl.className   = 'font-semibold text-green-400';

    const btnU = v$('btn-marcar-usado');
    if (btnU) {
        btnU.classList.toggle('hidden', !_puedeCanjear());
        btnU.disabled = false;
    }
}

function mostrarYaCanjeado(venta, cuandoMX) {
    v$('resultado-verificacion').classList.remove('hidden');
    v$('resultado-valido').classList.add('hidden');
    v$('resultado-invalido').classList.remove('hidden');

    v$('resultado-error').textContent = `Ya fue canjeado el ${cuandoMX}.`;

    const info = v$('resultado-info-adicional');
    info.classList.remove('hidden');
    const emailRow = (_puedeVerComprador() && venta.email)
        ? `<div class="resultado-fila"><span>Email</span><span>${venta.email}</span></div>` : '';
    info.innerHTML = `
        <div class="resultado-fila"><span>Función</span><span>${venta.funcionNombre || venta.fecha || '—'}</span></div>
        ${emailRow}
        <div class="resultado-fila"><span>Folio</span><span>${venta.codigo}</span></div>`;
}

function mostrarInvalido(mensaje) {
    v$('resultado-verificacion').classList.remove('hidden');
    v$('resultado-valido').classList.add('hidden');
    v$('resultado-invalido').classList.remove('hidden');
    v$('resultado-error').textContent = mensaje;
    v$('resultado-info-adicional').classList.add('hidden');
}

async function marcarComoUsado() {
    if (!_ventaActual || !_codigoActual) { alert('No hay boleto seleccionado'); return; }
    if (_ventaActual.usado) { alert('Este boleto ya fue canjeado'); return; }

    const token = obtenerTokenAdmin();
    if (!token) { alert('Necesitas iniciar sesión como admin para canjear boletos'); return; }

    if (!confirm('¿Marcar este boleto como canjeado? Esta acción no se puede deshacer.')) return;

    const btnU = v$('btn-marcar-usado');
    if (btnU) { btnU.disabled = true; btnU.textContent = 'Canjeando…'; }

    try {
        const res  = await fetch(window.teatroAdminApi(`canjear/${encodeURIComponent(_codigoActual)}`), {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();

        if (!res.ok) {
            alert(data.error || 'Error al canjear');
            if (btnU) { btnU.disabled = false; }
            return;
        }

        // Actualizar UI
        const estadoEl = v$('resultado-estado');
        estadoEl.textContent = '✓ CANJEADO';
        estadoEl.className   = 'font-semibold text-yellow-400';
        if (btnU) { btnU.disabled = true; btnU.classList.add('hidden'); }

        _ventaActual.usado   = true;
        _ventaActual.usadoEn = data.usadoEn;
        if (_puedeCanjear()) cargarListaPuerta();
    } catch {
        alert('Error de conexión');
        if (btnU) { btnU.disabled = false; }
    }
}

function obtenerTokenAdmin() {
    if (typeof AuthManager !== 'undefined') return AuthManager.obtenerAdminToken();
    return localStorage.getItem('elgorila_admin_token') || null;
}

// ── Cámara QR ──────────────────────────────────────────────────────────────────

let _scannerStream = null;

function abrirScanner() {
    const modal = v$('modal-scanner');
    if (modal) { modal.classList.remove('hidden'); modal.style.display = 'flex'; }
    iniciarCamara();
}

function cerrarScanner() {
    pararCamara();
    const modal = v$('modal-scanner');
    if (modal) { modal.classList.add('hidden'); modal.style.display = 'none'; }
}

async function iniciarCamara() {
    try {
        _scannerStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        const video = v$('scanner-video');
        if (video) { video.srcObject = _scannerStream; video.play(); }
        requestAnimationFrame(escanearFrame);
    } catch {
        alert('No se pudo acceder a la cámara. Verifica los permisos.');
        cerrarScanner();
    }
}

function pararCamara() {
    if (_scannerStream) { _scannerStream.getTracks().forEach(t => t.stop()); _scannerStream = null; }
}

function escanearFrame() {
    if (!_scannerStream) return;
    const video  = v$('scanner-video');
    const canvas = v$('scanner-canvas');
    if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
        requestAnimationFrame(escanearFrame);
        return;
    }
    const ctx = canvas.getContext('2d');
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    if (typeof jsQR !== 'undefined') {
        const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' });
        if (code && code.data) {
            // Extraer código del URL si es una URL de verificación
            let codigo = code.data;
            const urlMatch = codigo.match(/[?&]codigo=([^&]+)/);
            if (urlMatch) codigo = decodeURIComponent(urlMatch[1]);
            cerrarScanner();
            const input = v$('codigo-qr-input');
            if (input) { input.value = codigo.toUpperCase(); }
            verificarBoleto();
            return;
        }
    }
    requestAnimationFrame(escanearFrame);
}

function _puedeVerListaPuerta() {
    return _puedeCanjear();
}

const GRUPO_COLORS = ['#D43A1A', '#2563eb', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#db2777'];

function _colorGrupo(certificado) {
    let h = 0;
    for (let i = 0; i < (certificado || '').length; i++) h = (h + certificado.charCodeAt(i) * (i + 1)) % GRUPO_COLORS.length;
    return GRUPO_COLORS[h];
}

async function cargarFuncionesLista() {
    const sel = v$('lista-funcion');
    if (!sel || !window.API_BASE) return;
    try {
        const res = await fetch(window.teatroApi('funciones'));
        const data = await res.json();
        const list = (Array.isArray(data) ? data : (data.funciones || [])).filter(f => f.activa !== false);
        sel.innerHTML = list.map(f =>
            `<option value="${f.fecha_iso}">${f.nombre}${f.numero_obra ? ` · obra ${f.numero_obra}` : ''}</option>`
        ).join('');
        await cargarListaPuerta();
    } catch { sel.innerHTML = '<option value="">—</option>'; }
}

async function cargarListaPuerta() {
    const cont   = v$('lista-grupos');
    const resumen = v$('lista-resumen');
    const fecha  = v$('lista-funcion')?.value;
    const token  = obtenerTokenAdmin();
    if (!cont || !fecha || !token || !_puedeVerListaPuerta()) return;

    cont.innerHTML = '<p style="color:var(--d-soft);font-size:14px;">Cargando lista…</p>';
    try {
        const res = await fetch(window.teatroAdminApi(`lista-puerta?fecha=${encodeURIComponent(fecha)}`), {
            headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error');

        if (resumen) {
            resumen.textContent = `${data.ingresados || 0} / ${data.total || 0} ingresados · ${data.pendientes || 0} pendientes`;
        }

        if (!data.grupos?.length) {
            cont.innerHTML = '<p style="color:var(--d-soft);">Sin ventas para esta función.</p>';
            return;
        }

        cont.innerHTML = data.grupos.map(g => {
            const color = _colorGrupo(g.certificado);
            const boletosHtml = (g.boletos || []).map(b => `
              <div class="lista-boleto${b.usado ? ' usado' : ''}" data-cert="${b.cert}" role="button" tabindex="0" title="${b.usado ? 'Toca para quitar check-in' : 'Toca para marcar ingreso'}">
                <div>
                  <div class="lista-boleto-folio">${b.folio || b.cert}</div>
                  <div class="lista-boleto-meta">${b.tipo || 'entrada'} · #${b.numero || '—'}</div>
                </div>
                <div class="lista-boleto-check" aria-hidden="true">${b.usado ? '✓' : ''}</div>
              </div>`).join('');
            return `
              <div class="lista-grupo" style="border-left-color:${color}">
                <p class="lista-grupo-nombre">${g.nombre || '—'}</p>
                <p class="lista-grupo-cert">${g.certificado}</p>
                ${boletosHtml}
              </div>`;
        }).join('');

        cont.querySelectorAll('.lista-boleto:not(.usado)').forEach(el => {
            el.addEventListener('click', () => canjearDesdeLista(el.dataset.cert));
        });
        cont.querySelectorAll('.lista-boleto.usado').forEach(el => {
            el.addEventListener('click', () => descanjearDesdeLista(el.dataset.cert));
        });
    } catch (e) {
        cont.innerHTML = `<p style="color:#f87171;">${e.message}</p>`;
    }
}

async function canjearDesdeLista(cert) {
    if (!cert) return;
    const token = obtenerTokenAdmin();
    if (!token) return;
    try {
        const res = await fetch(window.teatroAdminApi(`canjear/${encodeURIComponent(cert)}`), {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) { alert(data.error || 'No se pudo marcar'); return; }
        await cargarListaPuerta();
        _agregarIngreso(data.folio || cert, 1);
    } catch { alert('Error de conexión'); }
}

async function descanjearDesdeLista(cert) {
    if (!cert || !confirm(`¿Quitar check-in de ${cert}?`)) return;
    const token = obtenerTokenAdmin();
    if (!token) return;
    try {
        const res = await fetch(window.teatroAdminApi(`descanjear/${encodeURIComponent(cert)}`), {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) { alert(data.error || 'No se pudo quitar el check-in'); return; }
        await cargarListaPuerta();
    } catch { alert('Error de conexión'); }
}

// ── Modo nombre / lote ─────────────────────────────────────────────────────────

let _ventasNombre = [];
const INGRESOS_KEY = 'elgorila_ingresos_puerta';

function _sesion() {
    return typeof AuthManager !== 'undefined' ? AuthManager.obtenerUsuarioActual() : null;
}

function _puedeCanjear() {
    const u = _sesion();
    return u && AuthManager.tienePermiso('verificarBoletos') && !!obtenerTokenAdmin();
}

function _puedeBuscarNombre() {
    const u = _sesion();
    return u && AuthManager.tienePermiso('verificarPorNombre');
}

function _puedeVerComprador() {
    const u = _sesion();
    return u && u.rol !== 'validacion' && AuthManager.tienePermiso('verVentas');
}

function _aplicarUIPermisos() {
    const buscar = _puedeBuscarNombre();
    const lista  = _puedeVerListaPuerta();
    v$('panel-nombre')?.classList.toggle('hidden', !buscar);
    v$('panel-ingresados')?.classList.toggle('hidden', !buscar);
    v$('panel-lista-puerta')?.classList.toggle('hidden', !lista);
    if (!lista) v$('lista-sin-sesion')?.classList.toggle('hidden', true);
}

function _cargarIngresados() {
    const ul = v$('lista-ingresados');
    if (!ul) return;
    let list = [];
    try { list = JSON.parse(sessionStorage.getItem(INGRESOS_KEY) || '[]'); } catch { list = []; }
    if (!list.length) {
        ul.innerHTML = '<li style="color:var(--d-faint);font-family:var(--mono);font-size:11px;">Nadie aún</li>';
        return;
    }
    ul.innerHTML = list.slice(0, 40).map(i =>
        `<li style="padding:6px 0;border-bottom:1px solid var(--d-faint);">${i.nombre || '—'} · ${i.cantidad || 1} · <span style="font-family:var(--mono);font-size:11px;">${i.hora}</span></li>`
    ).join('');
}

function _agregarIngreso(nombre, cantidad) {
    let list = [];
    try { list = JSON.parse(sessionStorage.getItem(INGRESOS_KEY) || '[]'); } catch { list = []; }
    list.unshift({
        nombre,
        cantidad,
        hora: new Date().toLocaleTimeString('es-MX', { timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit' }),
    });
    sessionStorage.setItem(INGRESOS_KEY, JSON.stringify(list.slice(0, 200)));
    _cargarIngresados();
}

async function cargarFuncionesNombre() {
    const sel = v$('nombre-funcion');
    if (!sel || !window.API_BASE) return;
    try {
        const res = await fetch(window.teatroApi('funciones'));
        const data = await res.json();
        const list = Array.isArray(data) ? data : (data.funciones || []);
        sel.innerHTML = list.map(f =>
            `<option value="${f.fecha_iso}">${f.nombre}</option>`
        ).join('');
    } catch { sel.innerHTML = '<option value="">—</option>'; }
}

async function buscarPorNombre() {
    const q = v$('nombre-buscar')?.value?.trim();
    const fecha = v$('nombre-funcion')?.value;
    const cont = v$('nombre-resultados');
    const btnLote = v$('btn-canjear-seleccion');
    if (!q || !fecha || !cont) return;
    if (!_puedeBuscarNombre()) {
        v$('nombre-sin-sesion')?.classList.remove('hidden');
        return;
    }
    const token = obtenerTokenAdmin();
    if (!token) {
        v$('nombre-sin-sesion')?.classList.remove('hidden');
        return;
    }
    cont.innerHTML = '<p style="color:var(--d-soft);font-size:14px;">Buscando…</p>';
    try {
        const url = window.teatroAdminApi(`ventas?fecha=${encodeURIComponent(fecha)}&q=${encodeURIComponent(q)}`);
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error');
        _ventasNombre = (data.ventas || []).filter(v => !v.usado);
        if (!_ventasNombre.length) {
            cont.innerHTML = '<p style="color:var(--d-soft);">Sin boletos activos para ese nombre.</p>';
            btnLote?.classList.add('hidden');
            return;
        }
        const total = _ventasNombre.reduce((s, v) => s + (v.cantidad || 1), 0);
        cont.innerHTML = `<p style="margin-bottom:10px;color:var(--gold);">${_ventasNombre[0].nombre || _ventasNombre[0].email} — <strong>${total}</strong> boleto(s)</p>` +
            _ventasNombre.map((v, i) => `
            <label style="display:flex;gap:8px;align-items:center;padding:8px 0;border-bottom:1px solid var(--d-faint);cursor:pointer;">
              <input type="checkbox" class="chk-nombre" data-idx="${i}" checked>
              <span style="font-family:var(--mono);font-size:11px;">${v.codigo}</span>
              <span>${v.cantidad || 1} · ${v.funcionNombre || v.fecha}</span>
            </label>`).join('');
        btnLote?.classList.remove('hidden');
    } catch (e) {
        cont.innerHTML = `<p style="color:#f87171;">${e.message}</p>`;
    }
}

async function canjearSeleccionados() {
    const token = obtenerTokenAdmin();
    if (!token) return;
    const checks = document.querySelectorAll('.chk-nombre:checked');
    const codigos = [];
    let nombre = '';
    let cant = 0;
    checks.forEach(ch => {
        const v = _ventasNombre[parseInt(ch.dataset.idx, 10)];
        if (v && !v.usado) {
            codigos.push(v.codigo);
            nombre = v.nombre || v.email || nombre;
            cant += v.cantidad || 1;
        }
    });
    if (!codigos.length) { alert('Selecciona al menos un boleto'); return; }
    if (!confirm(`¿Marcar entrada de ${cant} boleto(s)?`)) return;
    try {
        const res = await fetch(window.teatroAdminApi('canjear-lote'), {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ codigos }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error');
        _agregarIngreso(nombre, cant);
        v$('nombre-resultados').innerHTML = '<p style="color:#4ade80;">✓ Entrada registrada</p>';
        v$('btn-canjear-seleccion')?.classList.add('hidden');
        _ventasNombre = [];
    } catch (e) { alert(e.message); }
}

function _bindVerificarUI() {
    const btnV = v$('btn-verificar');
    const btnU = v$('btn-marcar-usado');
    const btnS = v$('btn-escanear');
    const input = v$('codigo-qr-input');

    if (btnV) btnV.addEventListener('click', verificarBoleto);
    if (btnU) btnU.addEventListener('click', marcarComoUsado);
    if (btnS) {
        btnS.disabled = false;
        btnS.addEventListener('click', abrirScanner);
    }
    if (input) {
        input.addEventListener('keypress', e => { if (e.key === 'Enter') verificarBoleto(); });
        input.addEventListener('input', () => {
            v$('resultado-verificacion')?.classList.add('hidden');
            _ventaActual = null;
        });
        input.focus();
    }

    // Auto-verificar si hay ?codigo= en la URL
    const params = new URLSearchParams(window.location.search);
    const codigoURL = params.get('codigo');
    if (codigoURL && input) {
        input.value = codigoURL.toUpperCase();
        setTimeout(verificarBoleto, 300);
    }

    _aplicarUIPermisos();
    if (_puedeVerListaPuerta() && obtenerTokenAdmin()) {
        cargarFuncionesLista();
    } else if (!obtenerTokenAdmin()) {
        v$('lista-sin-sesion')?.classList.remove('hidden');
    }
    if (_puedeBuscarNombre()) {
        cargarFuncionesNombre();
        _cargarIngresados();
    }
    v$('btn-buscar-nombre')?.addEventListener('click', buscarPorNombre);
    v$('btn-canjear-seleccion')?.addEventListener('click', canjearSeleccionados);
    v$('nombre-buscar')?.addEventListener('keypress', e => {
        if (e.key === 'Enter') buscarPorNombre();
    });
    v$('lista-funcion')?.addEventListener('change', cargarListaPuerta);

}

window.VerificarPanel = {
  _inited: false,
  init() {
    if (this._inited) return;
    const root = document.getElementById('view-verificar');
    if (!root && !document.getElementById('codigo-qr-input')) return;
    _verRoot = root;
    this._inited = true;
    _bindVerificarUI();
  },
};

if (!document.getElementById('admin-panel')) {
  document.addEventListener('DOMContentLoaded', () => window.VerificarPanel.init());
}
