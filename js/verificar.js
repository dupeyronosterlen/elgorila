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

function _fechaPuertaSeleccionada() {
  return v$('lista-funcion')?.value || null;
}

function _canjeBodyExtra() {
  const fecha = _fechaPuertaSeleccionada();
  return fecha ? JSON.stringify({ fecha }) : undefined;
}

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
        const fecha = _fechaPuertaSeleccionada();
        const qs = fecha ? `?fecha=${encodeURIComponent(fecha)}` : '';
        const res  = await fetch(window.teatroApi(`venta/${encodeURIComponent(codigo)}${qs}`));
        const data = await res.json();

        if (!res.ok) {
            mostrarInvalido(data.error || 'Folio no encontrado.');
            return;
        }

        _ventaActual = data;

        if (data.estado === 'reembolsada' || data.estado === 'cancelada') {
            mostrarInvalido(data.error || 'Este boleto ya no tiene validez.');
            return;
        }

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

function _etiquetaPapelVerificar(venta) {
  if (!venta) return '—';
  if (venta.cortesia || (venta.metodoPago || '').toLowerCase() === 'cortesia') {
    const n = venta.pendientes != null ? venta.pendientes : (venta.totalBoletos || venta.cantidad || 1);
    return `${n} × Cortesía`;
  }
  const items = venta.items || [];
  if (items.length) {
    const partes = items.map(i => {
      const t = i.tipo === 'estudiante' || i.tipo === 'inapam' || i.tipo === 'maestro' ? 'Credencial' : 'General';
      return `${i.cantidad || 0} × ${t}`;
    });
    let txt = partes.join(' · ');
    if (venta.codigoCupon) txt += ` · ${venta.codigoCupon}`;
    return txt;
  }
  if (venta.tipo) {
    const t = venta.tipo === 'estudiante' || venta.tipo === 'inapam' || venta.tipo === 'maestro' ? 'Credencial' : 'General';
    return `1 × ${t}`;
  }
  const n = venta.pendientes != null ? venta.pendientes : (venta.totalBoletos || 1);
  return `${n} × General`;
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

    const papelEl = v$('resultado-papel');
    if (papelEl) papelEl.textContent = _etiquetaPapelVerificar(venta);

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
        btnU.textContent = '';
        btnU.innerHTML = '<span class="material-symbols-outlined" style="font-size:18px;vertical-align:middle;">done</span> Marcar entrada';
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

    const btnU = v$('btn-marcar-usado');
    if (btnU) { btnU.disabled = true; btnU.textContent = 'Canjeando…'; }

    try {
        const res  = await fetch(window.teatroAdminApi(`canjear/${encodeURIComponent(_codigoActual)}`), {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                ...( _canjeBodyExtra() ? { 'Content-Type': 'application/json' } : {}),
            },
            body: _canjeBodyExtra(),
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
let _scannerActivo = false;
let _modoEmergencia = false;
let _emergenciaPausa = false;
let _emergenciaUltimoCodigo = '';
let _emergenciaUltimoTs = 0;

/** Extrae CERT-… de texto crudo, URL de boleto o enlace de verificación. */
function extraerCodigoDeQr(raw) {
    const s = String(raw || '').trim();
    if (!s) return '';

    const certInline = s.match(/CERT-[A-Z0-9-]+/i);
    if (certInline) return certInline[0].toUpperCase();

    try {
        const url = s.startsWith('http') ? new URL(s) : new URL(s, location.origin);
        for (const key of ['codigo', 'c', 'cert', 'certificado']) {
            const v = url.searchParams.get(key);
            if (v) return v.trim().toUpperCase();
        }
        const pathCert = url.pathname.match(/\/(CERT-[A-Z0-9-]+)/i);
        if (pathCert) return pathCert[1].toUpperCase();
    } catch { /* no es URL */ }

    return s.toUpperCase();
}

function _actualizarUIScannerModo() {
    const modal = document.getElementById('modal-scanner') || v$('modal-scanner');
    const label = document.getElementById('scanner-modo-label');
    const hint = document.getElementById('scanner-hint');
    modal?.classList.toggle('emergencia', _modoEmergencia);
    if (label) label.classList.toggle('hidden', !_modoEmergencia);
    if (hint) {
        hint.textContent = _modoEmergencia
            ? 'Apunta al QR · se valida solo · OK para seguir'
            : 'Apunta al QR del boleto (CERT-…)';
    }
}

function _ocultarResultadoEmergencia() {
    const box = document.getElementById('scanner-emergencia-resultado');
    box?.classList.add('hidden');
}

function abrirScanner(opts = {}) {
    if (!window.isSecureContext) {
        alert('La cámara requiere HTTPS. Abre el panel desde https://elgorilateatro.com.mx');
        return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
        alert('Este navegador no soporta acceso a la cámara.');
        return;
    }
    _modoEmergencia = !!opts.emergencia;
    _emergenciaPausa = false;
    _ocultarResultadoEmergencia();
    const modal = document.getElementById('modal-scanner') || v$('modal-scanner');
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('open');
        modal.style.display = 'flex';
    }
    _actualizarUIScannerModo();
    _scannerActivo = true;
    iniciarCamara();
}

function abrirScannerEmergencia() {
    if (!_puedeCanjear()) {
        alert('Necesitas sesión con permiso de puerta para validación de emergencia.');
        return;
    }
    abrirScanner({ emergencia: true });
}

function cerrarScanner() {
    _scannerActivo = false;
    _emergenciaPausa = false;
    _modoEmergencia = false;
    _ocultarResultadoEmergencia();
    pararCamara();
    const modal = document.getElementById('modal-scanner') || v$('modal-scanner');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('open', 'emergencia');
        modal.style.display = 'none';
    }
    _actualizarUIScannerModo();
}

async function iniciarCamara() {
    try {
        pararCamara();
        _scannerStream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: { ideal: 'environment' },
                width: { ideal: 1280 },
                height: { ideal: 720 },
            },
            audio: false,
        });
        const video = document.getElementById('scanner-video') || v$('scanner-video');
        if (video) {
            video.setAttribute('playsinline', '');
            video.setAttribute('webkit-playsinline', '');
            video.srcObject = _scannerStream;
            await video.play();
        }
        requestAnimationFrame(escanearFrame);
    } catch (err) {
        console.error('Scanner:', err);
        alert('No se pudo acceder a la cámara. Revisa permisos del navegador.');
        cerrarScanner();
    }
}

function pararCamara() {
    if (_scannerStream) { _scannerStream.getTracks().forEach(t => t.stop()); _scannerStream = null; }
}

function _precioTipoEmergencia(tipo, fechaCompra) {
    const t = (tipo || 'general').toLowerCase();
    if (t === 'estudiante' || t === 'inapam' || t === 'maestro') {
        return typeof window.PRECIO_CREDENCIAL === 'number' ? window.PRECIO_CREDENCIAL : 280;
    }
    const compraMs = fechaCompra ? Date.parse(fechaCompra) : NaN;
    const finPrev = window.FIN_PREVENTA_UTC_MS || Date.parse('2026-07-26T21:00:00.000Z');
    if (Number.isFinite(compraMs) && compraMs < finPrev) {
        return typeof window.PRECIO_GENERAL_PREVENTA === 'number' ? window.PRECIO_GENERAL_PREVENTA : 350;
    }
    return typeof window.PRECIO_GENERAL_TEMPORADA === 'number' ? window.PRECIO_GENERAL_TEMPORADA : 400;
}

function _nombreTipoEmergencia(tipo, precio) {
    const t = (tipo || 'general').toLowerCase();
    if (t === 'estudiante' || t === 'inapam' || t === 'maestro') return 'especial';
    if (precio === 350) return 'preventa';
    return 'general';
}

/** Resumen legible para taquilla: "1 boleto general ($400) · 1 boleto especial ($280)" */
function _resumenEmergencia(venta) {
    if (!venta) return { total: 0, lineas: ['Sin datos'], texto: 'Sin datos' };

    if (venta.cortesia || (venta.metodoPago || '').toLowerCase() === 'cortesia') {
        const n = venta.esCertificado && venta.pendientes != null
            ? venta.pendientes
            : (venta.pendientes != null ? venta.pendientes : (venta.totalBoletos || venta.cantidad || 1));
        const lineas = [`${n} boleto${n === 1 ? '' : 's'} cortesía`];
        return { total: n, lineas, texto: lineas.join(' · ') };
    }

    // Orden (CERT-ORD): desglose de items; boleto individual: 1 × su tipo
    if (venta.esCertificado || (!venta.tipo && (venta.items || []).length)) {
        const items = venta.items || [];
        if (items.length) {
            const lineas = items.map(i => {
                const cant = i.cantidad || 0;
                const precio = _precioTipoEmergencia(i.tipo, venta.fechaCompra);
                const nombre = _nombreTipoEmergencia(i.tipo, precio);
                return `${cant} boleto${cant === 1 ? '' : 's'} ${nombre} ($${precio})`;
            }).filter(Boolean);
            const totalItems = items.reduce((s, i) => s + (i.cantidad || 0), 0);
            const total = venta.pendientes != null ? venta.pendientes : totalItems;
            if (venta.pendientes != null && venta.pendientes < totalItems) {
                lineas.push(`${venta.pendientes} pendiente(s) de esta orden`);
            }
            return { total, lineas, texto: lineas.join(' · ') };
        }
    }

    if (venta.tipo) {
        const precio = _precioTipoEmergencia(venta.tipo, venta.fechaCompra);
        const nombre = _nombreTipoEmergencia(venta.tipo, precio);
        return {
            total: 1,
            lineas: [`1 boleto ${nombre} ($${precio})`],
            texto: `1 boleto ${nombre} ($${precio})`,
        };
    }

    const n = venta.pendientes != null ? venta.pendientes : (venta.totalBoletos || venta.cantidad || 1);
    const precio = _precioTipoEmergencia('general', venta.fechaCompra);
    const nombre = _nombreTipoEmergencia('general', precio);
    const lineas = [`${n} boleto${n === 1 ? '' : 's'} ${nombre} ($${precio})`];
    return { total: n, lineas, texto: lineas.join(' · ') };
}

function _mostrarResultadoEmergencia({ kind, titulo, lineas, total, meta }) {
    const box = document.getElementById('scanner-emergencia-resultado');
    const card = document.getElementById('scanner-emergencia-card');
    const estado = document.getElementById('scanner-emergencia-estado');
    const totalEl = document.getElementById('scanner-emergencia-total');
    const lineasEl = document.getElementById('scanner-emergencia-lineas');
    const metaEl = document.getElementById('scanner-emergencia-meta');
    if (!box || !card) return;

    card.classList.remove('ok', 'bad', 'warn');
    if (kind === 'ok') card.classList.add('ok');
    else if (kind === 'bad') card.classList.add('bad');
    else card.classList.add('warn');

    if (estado) estado.textContent = titulo || '—';
    if (totalEl) {
        if (total != null && total > 0) {
            totalEl.textContent = total === 1 ? '1 boleto' : `${total} boletos`;
            totalEl.style.display = '';
        } else {
            totalEl.textContent = '';
            totalEl.style.display = 'none';
        }
    }
    if (lineasEl) {
        const arr = Array.isArray(lineas) ? lineas : (lineas ? [lineas] : []);
        lineasEl.innerHTML = arr.map(l => `<div class="scanner-emergencia-linea">${l}</div>`).join('');
    }
    if (metaEl) metaEl.textContent = meta || '';
    box.classList.remove('hidden');
}

function emergenciaOk() {
    _ocultarResultadoEmergencia();
    _emergenciaPausa = false;
    if (_scannerActivo && _modoEmergencia && _scannerStream) {
        requestAnimationFrame(escanearFrame);
    }
}

async function procesarScanEmergencia(codigo) {
    _emergenciaPausa = true;
    _emergenciaUltimoCodigo = codigo;
    _emergenciaUltimoTs = Date.now();

    const input = v$('codigo-qr-input');
    if (input) input.value = codigo;

    if (!window.API_BASE) {
        _mostrarResultadoEmergencia({ kind: 'bad', titulo: 'API no configurada', lineas: [], meta: codigo });
        return;
    }

    try {
        const fecha = _fechaPuertaSeleccionada();
        const qs = fecha ? `?fecha=${encodeURIComponent(fecha)}` : '';
        const res = await fetch(window.teatroApi(`venta/${encodeURIComponent(codigo)}${qs}`));
        const data = await res.json();

        if (!res.ok) {
            _mostrarResultadoEmergencia({
                kind: 'bad',
                titulo: 'No válido',
                lineas: [data.error || 'Folio no encontrado.'],
                meta: codigo,
            });
            return;
        }

        if (data.estado === 'reembolsada' || data.estado === 'cancelada') {
            _mostrarResultadoEmergencia({
                kind: 'bad',
                titulo: 'Sin validez',
                lineas: [data.error || 'Reembolsado o cancelado.'],
                meta: codigo,
            });
            return;
        }

        const resumen = _resumenEmergencia(data);
        const meta = `${data.funcionNombre || data.fecha || '—'} · ${codigo}`;

        if (data.usado) {
            const cuandoMX = data.usadoEn
                ? new Date(data.usadoEn).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })
                : '';
            _mostrarResultadoEmergencia({
                kind: 'warn',
                titulo: 'Ya canjeado',
                total: resumen.total,
                lineas: [...resumen.lineas, cuandoMX ? `Canjeado: ${cuandoMX}` : 'Ya tenía entrada'].filter(Boolean),
                meta,
            });
            return;
        }

        const token = obtenerTokenAdmin();
        if (!token) {
            _mostrarResultadoEmergencia({
                kind: 'bad',
                titulo: 'Sin sesión',
                lineas: ['Inicia sesión para validar.'],
                meta: codigo,
            });
            return;
        }

        const canjeRes = await fetch(window.teatroAdminApi(`canjear/${encodeURIComponent(codigo)}`), {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                ...(_canjeBodyExtra() ? { 'Content-Type': 'application/json' } : {}),
            },
            body: _canjeBodyExtra(),
        });
        const canjeData = await canjeRes.json();

        if (!canjeRes.ok) {
            _mostrarResultadoEmergencia({
                kind: 'bad',
                titulo: 'No se pudo validar',
                lineas: [canjeData.error || 'Error al canjear', ...resumen.lineas],
                total: resumen.total,
                meta,
            });
            return;
        }

        _mostrarResultadoEmergencia({
            kind: 'ok',
            titulo: 'Validado',
            total: resumen.total,
            lineas: resumen.lineas,
            meta,
        });

        if (_puedeCanjear()) cargarListaPuerta();
        _agregarIngreso(data.nombre || data.email || codigo, resumen.total || 1);
    } catch {
        _mostrarResultadoEmergencia({
            kind: 'bad',
            titulo: 'Error de conexión',
            lineas: ['Intenta de nuevo.'],
            meta: codigo,
        });
    }
}

function escanearFrame() {
    if (!_scannerStream || !_scannerActivo) return;
    if (_emergenciaPausa) return;
    const video  = document.getElementById('scanner-video') || v$('scanner-video');
    const canvas = document.getElementById('scanner-canvas') || v$('scanner-canvas');
    if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
        requestAnimationFrame(escanearFrame);
        return;
    }
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    if (typeof jsQR !== 'undefined') {
        const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
        if (code?.data) {
            const codigo = extraerCodigoDeQr(code.data);
            if (!codigo || !/^CERT-/i.test(codigo)) {
                requestAnimationFrame(escanearFrame);
                return;
            }
            if (_modoEmergencia) {
                // Evita re-leer el mismo QR mientras sigue en cámara
                if (codigo === _emergenciaUltimoCodigo && Date.now() - _emergenciaUltimoTs < 2500) {
                    requestAnimationFrame(escanearFrame);
                    return;
                }
                procesarScanEmergencia(codigo);
                return;
            }
            cerrarScanner();
            const input = v$('codigo-qr-input');
            if (input) input.value = codigo;
            verificarBoleto();
            return;
        }
    }
    requestAnimationFrame(escanearFrame);
}

window.abrirScanner = abrirScanner;
window.abrirScannerEmergencia = abrirScannerEmergencia;
window.cerrarScanner = cerrarScanner;
window.emergenciaOk = emergenciaOk;

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
            const papel = (g.cortesia || (g.metodoPago || '').toLowerCase() === 'cortesia')
              ? `${g.cantidad || (g.boletos || []).length} × Cortesía`
              : ((g.items || []).length
                ? g.items.map(i => `${i.cantidad} × ${(i.tipo === 'estudiante' || i.tipo === 'inapam' || i.tipo === 'maestro') ? 'Credencial' : 'General'}`).join(' · ')
                : `${g.cantidad || (g.boletos || []).length} × General`);
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
                <p class="lista-grupo-papel" style="margin:0 0 8px;font-size:14px;font-weight:600;color:var(--gold);">${papel}${g.codigoCupon ? ' · ' + g.codigoCupon : ''}</p>
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
        const body = _canjeBodyExtra();
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
        const fecha = _fechaPuertaSeleccionada();
        const res = await fetch(window.teatroAdminApi('canjear-lote'), {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ codigos, ...(fecha ? { fecha } : {}) }),
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
    const btnSTop = document.getElementById('btn-escanear-top');
    const input = v$('codigo-qr-input');

    if (btnV) btnV.addEventListener('click', verificarBoleto);
    if (btnU) btnU.addEventListener('click', marcarComoUsado);
    if (btnS) {
        btnS.disabled = false;
        btnS.addEventListener('click', abrirScanner);
    }
    if (btnSTop) {
        btnSTop.addEventListener('click', abrirScanner);
    }
    if (input) {
        input.addEventListener('keypress', e => { if (e.key === 'Enter') verificarBoleto(); });
        input.addEventListener('input', () => {
            v$('resultado-verificacion')?.classList.add('hidden');
            _ventaActual = null;
        });
        input.focus();
    }

    // Auto-verificar si hay ?codigo= en la URL (desde admin o enlace legacy)
    const params = new URLSearchParams(window.location.search);
    const codigoURL = params.get('codigo');
    if (codigoURL && input) {
        input.value = codigoURL.toUpperCase();
        setTimeout(verificarBoleto, 300);
    } else if (params.get('emergencia') === '1') {
        setTimeout(() => abrirScannerEmergencia(), 400);
    } else if (params.get('scan') === '1' && btnS) {
        setTimeout(abrirScanner, 400);
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
