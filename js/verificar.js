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

function _pareceCodigoCert(s) {
    return /^(CERT-|WIL-)/i.test((s || '').trim());
}

async function verificarBoleto() {
    const input = v$('codigo-qr-input');
    const raw   = (input?.value || '').trim();
    if (!raw) { alert('Ingresa un código de folio o el nombre del comprador'); return; }
    if (!window.API_BASE) { alert('API no configurada'); return; }

    // El buscador de caja también acepta el nombre del comprador: si lo que se
    // escribió no parece un código (CERT-… / WIL-…), se busca por nombre/email
    // en las ventas de la función seleccionada y, si hay una sola coincidencia,
    // se resuelve sola reusando este mismo verificarBoleto() con su certificado
    // — mismo endpoint público, misma vista, mismo botón de "Marcar entrada".
    if (!_pareceCodigoCert(raw)) {
        await _buscarPorNombreEnCaja(raw);
        return;
    }

    const codigo = raw.toUpperCase();

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

    // Sin folio ni "entrada X de Y" en pantalla (pedido de Os 19 sep) — con la
    // cantidad y el tipo de entrada (fila "A entregar", abajo) basta. La única
    // excepción es un certificado con entradas ya canjeadas parcialmente: ahí
    // sí importa cuántas quedan pendientes, no es un número de boleto.
    const entradaLbl = (venta.esCertificado && venta.pendientes != null && venta.pendientes < venta.totalBoletos)
        ? ` · ${venta.pendientes} pendiente(s)`
        : '';

    const papelEl = v$('resultado-papel');
    if (papelEl) papelEl.textContent = _etiquetaPapelVerificar(venta);

    v$('resultado-fecha').textContent   =
        `${venta.funcionNombre || venta.fecha || '—'}${entradaLbl}`;
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
        ${emailRow}`;
}

function mostrarInvalido(mensaje) {
    v$('resultado-verificacion').classList.remove('hidden');
    v$('resultado-valido').classList.add('hidden');
    v$('resultado-invalido').classList.remove('hidden');
    v$('resultado-error').textContent = mensaje;
    v$('resultado-info-adicional').classList.add('hidden');
}

// Busca por nombre/email dentro de las ventas de la función seleccionada (mismo
// filtro que ya usa "Lista de llamado") y resuelve sobre el mismo código de
// folio de siempre — no inventa una vista nueva para no duplicar reglas de qué
// se le puede mostrar a quién.
async function _buscarPorNombreEnCaja(query) {
    if (!_puedeBuscarNombre()) {
        mostrarInvalido(`"${query}" no parece un código (CERT-… / WIL-…) y tu rol no tiene permiso para buscar por nombre.`);
        return;
    }
    const fecha = _fechaPuertaSeleccionada();
    if (!fecha) {
        mostrarInvalido('Selecciona primero la función (arriba, en "Lista de llamado") para poder buscar por nombre.');
        return;
    }
    const token = obtenerTokenAdmin();
    if (!token) { mostrarInvalido('Sin sesión de administrador.'); return; }

    const btnV = v$('btn-verificar');
    if (btnV) { btnV.disabled = true; btnV.textContent = 'Buscando…'; }
    try {
        const res = await fetch(window.teatroAdminApi(`ventas?fecha=${encodeURIComponent(fecha)}&q=${encodeURIComponent(query)}`), {
            headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) { mostrarInvalido(data.error || 'Error al buscar por nombre.'); return; }

        const activas = (data.ventas || []).filter(v => v.estado !== 'reembolsada');
        if (!activas.length) {
            mostrarInvalido(`Sin resultados para "${query}" en esta función.`);
            return;
        }
        if (activas.length === 1) {
            v$('codigo-qr-input').value = activas[0].certificado || activas[0].codigo;
            await verificarBoleto();
            return;
        }
        _mostrarOpcionesNombreEnCaja(activas, query);
    } catch {
        mostrarInvalido('Error de conexión al buscar por nombre.');
    } finally {
        if (btnV) { btnV.disabled = false; btnV.textContent = 'Verificar'; }
    }
}

function _mostrarOpcionesNombreEnCaja(ventas, query) {
    mostrarInvalido(`${ventas.length} coincidencias para "${query}" — toca la orden correcta:`);
    const info = v$('resultado-info-adicional');
    info.classList.remove('hidden');
    info.innerHTML = ventas.slice(0, 12).map(v => {
        const cert = v.certificado || v.codigo;
        const cant = v.cantidad || (v.boletos || []).length || 1;
        const estadoTxt = v.usado ? 'ya canjeado' : 'pendiente';
        return `<div class="resultado-fila" data-opcion-cert="${cert}" role="button" tabindex="0"
                     style="cursor:pointer;border-top:1px solid var(--d-faint);padding-top:8px;margin-top:8px;">
                  <span>${v.nombre || v.email || '—'}</span>
                  <span>${cant} bol. · ${estadoTxt}</span>
                </div>`;
    }).join('');
    info.querySelectorAll('[data-opcion-cert]').forEach(el => {
        el.addEventListener('click', () => {
            v$('codigo-qr-input').value = el.dataset.opcionCert;
            verificarBoleto();
        });
    });
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
        if (_puedeCanjear()) _reflejarCanjeEnListaPuerta();
    } catch {
        alert('Error de conexión');
        if (btnU) { btnU.disabled = false; }
    }
}

// Refleja en la Lista de llamado un canje hecho desde el buscador de folio/nombre
// (marcarComoUsado) sin volver a pedir toda la lista al servidor — mismo patrón
// de actualización local que ya usa canjearGrupoDesdeLista() al tocar directo en
// la lista, así el scroll y el resto de las tarjetas no se mueven. _codigoActual
// puede ser el certificado de la orden completa (el worker marca TODOS los
// pendientes) o el de un boleto individual dentro de ella (marca solo ese uno) —
// ver handleCanjear en worker/index.js. Si el grupo no está en caché (lista aún
// no cargada, o la venta pertenece a otra función que la seleccionada arriba),
// se cae al reload completo de siempre como respaldo seguro.
function _reflejarCanjeEnListaPuerta() {
    const cod       = (_codigoActual || '').toUpperCase();
    const certGrupo = (_ventaActual?.certificado || cod || '').toUpperCase();
    const g = _grupoEnCache(certGrupo);
    if (!g) { cargarListaPuerta(); return; }

    let marcados = 0;
    const boletos = g.boletos || [];
    if (cod === certGrupo) {
        boletos.forEach(b => { if (!b.usado) { b.usado = true; marcados++; } });
    } else {
        const b = boletos.find(bb => bb.cert === cod);
        if (b && !b.usado) { b.usado = true; marcados = 1; }
    }
    if (!marcados) { cargarListaPuerta(); return; }

    if (_listaPuertaCache) {
        _listaPuertaCache.ingresados = (_listaPuertaCache.ingresados || 0) + marcados;
        _listaPuertaCache.pendientes = Math.max(0, (_listaPuertaCache.pendientes || 0) - marcados);
    }
    _actualizarGrupoEnDOM(certGrupo);
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

function _mostrarResultadoEmergencia({ kind, titulo, lineas, total, meta, nombre }) {
    const box = document.getElementById('scanner-emergencia-resultado');
    const card = document.getElementById('scanner-emergencia-card');
    const estado = document.getElementById('scanner-emergencia-estado');
    const nombreEl = document.getElementById('scanner-emergencia-nombre');
    const totalEl = document.getElementById('scanner-emergencia-total');
    const lineasEl = document.getElementById('scanner-emergencia-lineas');
    const metaEl = document.getElementById('scanner-emergencia-meta');
    if (!box || !card) return;

    card.classList.remove('ok', 'bad', 'warn');
    if (kind === 'ok') card.classList.add('ok');
    else if (kind === 'bad') card.classList.add('bad');
    else card.classList.add('warn');

    if (estado) estado.textContent = titulo || '—';
    // Línea propia para el comprador, arriba del total — nunca metida en la
    // misma fila que función/folio (eso es "meta", chico y monoespaciado) para
    // que no se encimen. Se respeta el mismo permiso de PII que el resto del
    // panel: el rol "validacion" (puerta) no ve nombre de comprador en ningún
    // lado, tampoco aquí.
    if (nombreEl) {
        const mostrarNombre = !!nombre && _puedeVerComprador();
        nombreEl.textContent = mostrarNombre ? nombre : '';
        nombreEl.classList.toggle('hidden', !mostrarNombre);
    }
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
        const nombreComprador = data.nombre || data.email || null;

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
                nombre: nombreComprador,
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
                nombre: nombreComprador,
            });
            return;
        }

        _mostrarResultadoEmergencia({
            kind: 'ok',
            titulo: 'Validado',
            total: resumen.total,
            lineas: resumen.lineas,
            meta,
            nombre: nombreComprador,
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

// La lista (arriba) sigue mostrando TODAS las funciones (Os la necesita para
// revisar fechas pasadas), pero el default seleccionado debe ser la función
// en producción — hoy, o si no hay función hoy, la próxima más cercana — no
// la primera de la lista (que sería la más vieja, ej. 25 jul).
function _seleccionarFuncionPorDefecto(sel, list) {
    if (!sel || !list.length) return;
    const hoyMx = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
    const deHoy = list.find(f => f.fecha_iso === hoyMx);
    const proxima = list
        .filter(f => f.fecha_iso >= hoyMx)
        .sort((a, b) => a.fecha_iso.localeCompare(b.fecha_iso))[0];
    const elegida = deHoy || proxima;
    if (elegida) sel.value = elegida.fecha_iso;
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
        _seleccionarFuncionPorDefecto(sel, list);
        await cargarListaPuerta();
    } catch { sel.innerHTML = '<option value="">—</option>'; }
}

let _listaPuertaCache = null;

async function cargarListaPuerta() {
    const cont   = v$('lista-grupos');
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

        _listaPuertaCache = data;
        _renderListaPuerta(data);
    } catch (e) {
        cont.innerHTML = `<p style="color:#f87171;">${e.message}</p>`;
    }
}

function _renderResumenPuerta(data) {
    const resumen = v$('lista-resumen');
    if (resumen) {
        resumen.textContent = `${data.ingresados || 0} / ${data.total || 0} ingresados · ${data.pendientes || 0} pendientes`;
    }
}

// Un solo control de check por ORDEN (certificado de grupo), no uno por boleto —
// mismo criterio que la lista impresa/PDF de taquilla: si son 2 o 14 entradas de
// la misma compra, es un solo toque. Si algunas ya entraron por QR (parcial), el
// toque marca únicamente las que faltan; si ya están todas, el toque las quita.
function _renderListaPuerta(data, { append = false } = {}) {
    const cont = v$('lista-grupos');
    if (!cont) return;

    // En modo "append" el resumen ya lo actualizó quien llama (con los totales
    // reales del servidor) — `data` aquí solo trae los grupos nuevos a pintar.
    if (!append) _renderResumenPuerta(data);

    if (!data.grupos?.length) {
        if (!append) cont.innerHTML = '<p style="color:var(--d-soft);">Sin ventas para esta función.</p>';
        return;
    }

    const html = data.grupos.map(g => _htmlGrupoPuerta(g, append)).join('');
    if (append) cont.insertAdjacentHTML('beforeend', html);
    else cont.innerHTML = html;

    _bindListaPuertaClicks(append ? data.grupos : null);
}

function _tipoLbl(tipo) {
    return (tipo === 'estudiante' || tipo === 'inapam' || tipo === 'maestro') ? 'Credencial' : 'General';
}

// Dos niveles de check (pedido de Os 19 sep):
// - Master, junto al nombre, color distinto (dorado) — un toque marca/quita
//   TODA la orden (mismo criterio de siempre: certificado de grupo).
// - Uno por entrada individual, abajo — para cuando llegan por separado o
//   hay que quitar solo una sin tocar el resto (ej. no llegó una persona del
//   grupo). Solo se pintan si hay más de 1 entrada; con 1 sola el master ya
//   cubre el caso y no hace falta duplicar el control.
function _htmlGrupoPuerta(g, esNuevo) {
    const color = _colorGrupo(g.certificado);
    const papel = (g.cortesia || (g.metodoPago || '').toLowerCase() === 'cortesia')
      ? `${g.cantidad || (g.boletos || []).length} × Cortesía`
      : ((g.items || []).length
        ? g.items.map(i => `${i.cantidad} × ${_tipoLbl(i.tipo)}`).join(' · ')
        : `${g.cantidad || (g.boletos || []).length} × General`);
    const boletos = g.boletos || [];
    const usadoCount = boletos.filter(b => b.usado).length;
    const totalCount = boletos.length;
    const completo = totalCount > 0 && usadoCount === totalCount;
    const metaTxt = (usadoCount > 0 && !completo)
      ? `${usadoCount}/${totalCount} ya adentro`
      : `${totalCount} entrada${totalCount === 1 ? '' : 's'}`;

    const individualesHtml = totalCount > 1 ? `
        <div class="lista-boletos-ind-wrap">
          ${boletos.map((b, i) => `
            <div class="lista-boleto-ind${b.usado ? ' usado' : ''}" data-cert-ind="${b.cert}" data-grupo="${g.certificado}" role="button" tabindex="0" title="${b.usado ? 'Toca para quitar el check-in de esta entrada' : 'Toca para marcar esta entrada'}">
              <span class="lista-boleto-ind-label">Entrada ${i + 1} · ${_tipoLbl(b.tipo)}</span>
              <div class="lista-boleto-check lista-boleto-check-ind" aria-hidden="true">${b.usado ? '✓' : ''}</div>
            </div>`).join('')}
        </div>` : '';

    return `
      <div class="lista-grupo" style="border-left-color:${esNuevo ? 'var(--gold)' : color}" data-grupo-cert="${g.certificado}">
        <div class="lista-grupo-head">
          <div class="lista-grupo-info">
            <p class="lista-grupo-nombre">${g.nombre || '—'}${esNuevo ? ' <span style="color:var(--gold);font-size:11px;font-weight:700;">· NUEVA</span>' : ''}</p>
            <p class="lista-grupo-papel">${papel}${g.codigoCupon ? ' · ' + g.codigoCupon : ''}</p>
            <p class="lista-boleto-meta">${metaTxt}</p>
          </div>
          <div class="lista-boleto-check lista-boleto-check-master${completo ? ' usado' : ''}" data-grupo-master="${g.certificado}" role="button" tabindex="0" title="${completo ? 'Toca para quitar check-in de toda la orden' : 'Toca para marcar entrada de toda la orden'}">${completo ? '✓' : ''}</div>
        </div>
        ${individualesHtml}
      </div>`;
}

function _bindListaPuertaClicks(soloGrupos) {
    const cont = v$('lista-grupos');
    if (!cont) return;
    const certs = soloGrupos ? new Set(soloGrupos.map(g => g.certificado)) : null;

    cont.querySelectorAll('[data-grupo-master]').forEach(el => {
        const cert = el.dataset.grupoMaster;
        if (certs && !certs.has(cert)) return; // ya tenía su listener de antes
        el.addEventListener('click', () => {
            if (el.classList.contains('usado')) descanjearGrupoDesdeLista(cert);
            else canjearGrupoDesdeLista(cert);
        });
    });

    cont.querySelectorAll('[data-cert-ind]').forEach(el => {
        const certGrupo = el.dataset.grupo;
        if (certs && !certs.has(certGrupo)) return;
        el.addEventListener('click', () => {
            const certInd = el.dataset.certInd;
            if (el.classList.contains('usado')) descanjearBoletoIndividual(certInd, certGrupo);
            else canjearBoletoIndividual(certInd, certGrupo);
        });
    });
}

function _grupoEnCache(certGrupo) {
    return (_listaPuertaCache?.grupos || []).find(g => g.certificado === certGrupo) || null;
}

// Repinta solo la tarjeta de ese grupo (folio/meta/check) y el resumen — nunca
// vuelve a pedir ni redibujar el resto de la lista, así el scroll no se mueve.
function _actualizarGrupoEnDOM(certGrupo) {
    const g = _grupoEnCache(certGrupo);
    const cont = v$('lista-grupos');
    const nodoViejo = cont?.querySelector(`.lista-grupo[data-grupo-cert="${CSS.escape(certGrupo)}"]`);
    if (!g || !nodoViejo) return false;

    const div = document.createElement('div');
    div.innerHTML = _htmlGrupoPuerta(g, false).trim();
    const nodoNuevo = div.firstElementChild;
    nodoViejo.replaceWith(nodoNuevo);
    _bindListaPuertaClicks([g]);

    if (_listaPuertaCache) _renderResumenPuerta(_listaPuertaCache);
    return true;
}

// Nota permisos: canjear-lote exige rol taquilla/gerente/admin (PUEDE_CANJEAR_LOTE
// en el worker) y el rol "validacion" (el de puerta, quien de hecho más usa este
// panel) NO lo tiene — le tira 403 "La puerta solo verifica por QR". Por eso el
// check de grupo NO usa canjear-lote: usa el mismo endpoint de canjear individual
// (`/canjear/{codigo}`, permiso PUEDE_CANJEAR, sí incluye validacion) pasando el
// CERTIFICADO DE LA ORDEN — el worker ya sabe que si ese código no corresponde a
// un boleto específico, marca de una vez todos los pendientes de esa venta
// (ver handleCanjear en worker/index.js). Un solo request, sin importar cuántos
// boletos traiga la orden.
async function canjearGrupoDesdeLista(certGrupo) {
    const g = _grupoEnCache(certGrupo);
    const token = obtenerTokenAdmin();
    if (!g || !token) return;
    const pendientes = (g.boletos || []).filter(b => !b.usado);
    if (!pendientes.length) return;
    try {
        const body = _canjeBodyExtra();
        const res = await fetch(window.teatroAdminApi(`canjear/${encodeURIComponent(certGrupo)}`), {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                ...(body ? { 'Content-Type': 'application/json' } : {}),
            },
            body,
        });
        const data = await res.json();
        if (!res.ok) { alert(data.error || 'No se pudo marcar la orden'); return; }

        pendientes.forEach(b => { b.usado = true; });
        if (_listaPuertaCache) {
            _listaPuertaCache.ingresados = (_listaPuertaCache.ingresados || 0) + pendientes.length;
            _listaPuertaCache.pendientes = Math.max(0, (_listaPuertaCache.pendientes || 0) - pendientes.length);
        }
        _actualizarGrupoEnDOM(certGrupo);
        _agregarIngreso(g.nombre || certGrupo, pendientes.length);
    } catch { alert('Error de conexión'); }
}

async function descanjearGrupoDesdeLista(certGrupo) {
    const g = _grupoEnCache(certGrupo);
    const token = obtenerTokenAdmin();
    if (!g || !token) return;
    const boletos = g.boletos || [];
    if (!confirm(`¿Quitar el check-in de toda la orden de ${g.nombre || certGrupo} (${boletos.length} boleto${boletos.length === 1 ? '' : 's'})?`)) return;
    try {
        let quitados = 0;
        for (const b of boletos) {
            if (!b.usado) continue;
            const res = await fetch(window.teatroAdminApi(`descanjear/${encodeURIComponent(b.cert)}`), {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            if (!res.ok) { alert(data.error || `No se pudo quitar ${b.cert}`); continue; }
            b.usado = false;
            quitados++;
        }
        if (_listaPuertaCache && quitados) {
            _listaPuertaCache.ingresados = Math.max(0, (_listaPuertaCache.ingresados || 0) - quitados);
            _listaPuertaCache.pendientes = (_listaPuertaCache.pendientes || 0) + quitados;
        }
        _actualizarGrupoEnDOM(certGrupo);
    } catch { alert('Error de conexión'); }
}

// Check por entrada individual (mismo endpoint /canjear|descanjear, pero con
// el cert del BOLETO, no el de la orden — el worker ya distingue los dos
// casos en handleCanjear/handleDescanjear). Para cuando llegan por separado
// o hay que quitar solo una entrada de una orden sin tocar el resto.
async function canjearBoletoIndividual(certInd, certGrupo) {
    const g = _grupoEnCache(certGrupo);
    const token = obtenerTokenAdmin();
    if (!g || !token) return;
    const b = g.boletos?.find(bb => bb.cert === certInd);
    if (!b || b.usado) return;
    try {
        const body = _canjeBodyExtra();
        const res = await fetch(window.teatroAdminApi(`canjear/${encodeURIComponent(certInd)}`), {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                ...(body ? { 'Content-Type': 'application/json' } : {}),
            },
            body,
        });
        const data = await res.json();
        if (!res.ok) { alert(data.error || 'No se pudo marcar esta entrada'); return; }

        b.usado = true;
        if (_listaPuertaCache) {
            _listaPuertaCache.ingresados = (_listaPuertaCache.ingresados || 0) + 1;
            _listaPuertaCache.pendientes = Math.max(0, (_listaPuertaCache.pendientes || 0) - 1);
        }
        _actualizarGrupoEnDOM(certGrupo);
        _agregarIngreso(g.nombre || certGrupo, 1);
    } catch { alert('Error de conexión'); }
}

async function descanjearBoletoIndividual(certInd, certGrupo) {
    const g = _grupoEnCache(certGrupo);
    const token = obtenerTokenAdmin();
    if (!g || !token) return;
    const b = g.boletos?.find(bb => bb.cert === certInd);
    if (!b || !b.usado) return;
    if (!confirm(`¿Quitar el check-in de esta entrada de ${g.nombre || certGrupo}?`)) return;
    try {
        const res = await fetch(window.teatroAdminApi(`descanjear/${encodeURIComponent(certInd)}`), {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) { alert(data.error || 'No se pudo quitar esta entrada'); return; }

        b.usado = false;
        if (_listaPuertaCache) {
            _listaPuertaCache.ingresados = Math.max(0, (_listaPuertaCache.ingresados || 0) - 1);
            _listaPuertaCache.pendientes = (_listaPuertaCache.pendientes || 0) + 1;
        }
        _actualizarGrupoEnDOM(certGrupo);
    } catch { alert('Error de conexión'); }
}

// Botón "Nuevas compras": trae la lista fresca del servidor y SOLO agrega al
// final las órdenes que no existían en la caché — nunca reordena ni toca las
// tarjetas ya pintadas, así quien esté a media búsqueda no pierde su lugar.
async function verNuevasComprasPuerta() {
    const fecha = v$('lista-funcion')?.value;
    const token = obtenerTokenAdmin();
    if (!fecha || !token || !_listaPuertaCache) return;
    try {
        const res = await fetch(window.teatroAdminApi(`lista-puerta?fecha=${encodeURIComponent(fecha)}`), {
            headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error');

        const certsActuales = new Set((_listaPuertaCache.grupos || []).map(g => g.certificado));
        const nuevos = (data.grupos || []).filter(g => !certsActuales.has(g.certificado));

        // El resumen (ingresados/total/pendientes) sí se toma completo del servidor:
        // es la fuente de verdad y no depende del orden en pantalla.
        _listaPuertaCache.ingresados = data.ingresados;
        _listaPuertaCache.total = data.total;
        _listaPuertaCache.pendientes = data.pendientes;
        _renderResumenPuerta(_listaPuertaCache);

        if (!nuevos.length) {
            alert('Sin compras nuevas desde la última carga.');
            return;
        }
        _listaPuertaCache.grupos = [...(_listaPuertaCache.grupos || []), ...nuevos];
        _renderListaPuerta({ grupos: nuevos }, { append: true });
    } catch (e) { alert(e.message); }
}
window.verNuevasComprasPuerta = verNuevasComprasPuerta;

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
        const list = (Array.isArray(data) ? data : (data.funciones || [])).filter(f => f.activa !== false);
        sel.innerHTML = list.map(f =>
            `<option value="${f.fecha_iso}">${f.nombre}</option>`
        ).join('');
        _seleccionarFuncionPorDefecto(sel, list);
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
    const btnSTop = document.getElementById('btn-escanear-top');
    const input = v$('codigo-qr-input');

    if (btnV) btnV.addEventListener('click', verificarBoleto);
    if (btnU) btnU.addEventListener('click', marcarComoUsado);
    // Único botón de cámara en esta vista (pedido de Os 19 sep): en vez del
    // lector "normal" (abrirScanner, que solo llenaba el input y llamaba a
    // verificarBoleto), ahora abre directo el que antes era el de emergencia
    // — valida y canjea solo, mostrando antes un preview de la orden. La
    // lógica de abrirScannerEmergencia/procesarScanEmergencia no se tocó en
    // nada, solo cambió qué botón la dispara.
    if (btnSTop) {
        btnSTop.addEventListener('click', abrirScannerEmergencia);
    }
    if (input) {
        input.addEventListener('keypress', e => { if (e.key === 'Enter') verificarBoleto(); });
        input.addEventListener('input', () => {
            v$('resultado-verificacion')?.classList.add('hidden');
            _ventaActual = null;
        });
        // Sin autofocus (pedido de Os 19 sep): en celular, enfocar el input
        // al abrir la página dispara el teclado de inmediato y tapa la
        // pantalla — que la persona elija QR o escribir, no que se le abra
        // solo.
    }

    // Auto-verificar si hay ?codigo= en la URL (desde admin o enlace legacy)
    const params = new URLSearchParams(window.location.search);
    const codigoURL = params.get('codigo');
    if (codigoURL && input) {
        input.value = codigoURL.toUpperCase();
        setTimeout(verificarBoleto, 300);
    } else if (params.get('emergencia') === '1' || params.get('scan') === '1') {
        // Un solo lector en esta vista (ver comentario en _bindVerificarUI) —
        // ambos parámetros de URL abren el mismo escáner.
        setTimeout(() => abrirScannerEmergencia(), 400);
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
    v$('btn-lista-nuevas')?.addEventListener('click', verNuevasComprasPuerta);

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
