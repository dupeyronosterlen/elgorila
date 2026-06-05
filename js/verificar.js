// --- VERIFICACIÓN DE BOLETOS (Worker API) ---

let _ventaActual  = null;
let _codigoActual = null;

async function verificarBoleto() {
    const input    = document.getElementById('codigo-qr-input');
    const codigo   = (input?.value || '').trim().toUpperCase();
    if (!codigo) { alert('Ingresa un código de folio'); return; }
    if (!window.API_BASE) { alert('API no configurada'); return; }

    _codigoActual = codigo;
    _ventaActual  = null;

    const btnV = document.getElementById('btn-verificar');
    if (btnV) { btnV.disabled = true; btnV.textContent = 'Verificando…'; }

    try {
        const res  = await fetch(`${window.API_BASE}/api/venta/${encodeURIComponent(codigo)}`);
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
    document.getElementById('resultado-verificacion').classList.remove('hidden');
    document.getElementById('resultado-valido').classList.remove('hidden');
    document.getElementById('resultado-invalido').classList.add('hidden');

    document.getElementById('resultado-codigo').textContent  = venta.codigo;
    document.getElementById('resultado-fecha').textContent   = venta.funcionNombre || venta.fecha || '—';
    document.getElementById('resultado-orden').textContent   = venta.nombre || venta.email || '—';
    document.getElementById('resultado-email').textContent   = venta.email || '—';

    const estadoEl = document.getElementById('resultado-estado');
    estadoEl.textContent = 'VÁLIDO — No canjeado';
    estadoEl.className   = 'font-semibold text-green-400';

    // Mostrar botón solo si hay sesión admin
    const btnU = document.getElementById('btn-marcar-usado');
    if (btnU) {
        const tieneAdmin = !!obtenerTokenAdmin();
        btnU.classList.toggle('hidden', !tieneAdmin);
        btnU.disabled = false;
        btnU.className = tieneAdmin
            ? 'w-full px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg transition-all duration-300'
            : 'hidden';
    }
}

function mostrarYaCanjeado(venta, cuandoMX) {
    document.getElementById('resultado-verificacion').classList.remove('hidden');
    document.getElementById('resultado-valido').classList.add('hidden');
    document.getElementById('resultado-invalido').classList.remove('hidden');

    document.getElementById('resultado-error').textContent = `Ya fue canjeado el ${cuandoMX}.`;

    const info = document.getElementById('resultado-info-adicional');
    info.classList.remove('hidden');
    info.innerHTML = `
        <div class="flex justify-between"><span>Función:</span><span>${venta.funcionNombre || venta.fecha || '—'}</span></div>
        <div class="flex justify-between"><span>Email:</span><span>${venta.email || '—'}</span></div>
        <div class="flex justify-between"><span>Folio:</span><span>${venta.codigo}</span></div>`;
}

function mostrarInvalido(mensaje) {
    document.getElementById('resultado-verificacion').classList.remove('hidden');
    document.getElementById('resultado-valido').classList.add('hidden');
    document.getElementById('resultado-invalido').classList.remove('hidden');
    document.getElementById('resultado-error').textContent = mensaje;
    document.getElementById('resultado-info-adicional').classList.add('hidden');
}

async function marcarComoUsado() {
    if (!_ventaActual || !_codigoActual) { alert('No hay boleto seleccionado'); return; }
    if (_ventaActual.usado) { alert('Este boleto ya fue canjeado'); return; }

    const token = obtenerTokenAdmin();
    if (!token) { alert('Necesitas iniciar sesión como admin para canjear boletos'); return; }

    if (!confirm('¿Marcar este boleto como canjeado? Esta acción no se puede deshacer.')) return;

    const btnU = document.getElementById('btn-marcar-usado');
    if (btnU) { btnU.disabled = true; btnU.textContent = 'Canjeando…'; }

    try {
        const res  = await fetch(`${window.API_BASE}/api/canjear/${encodeURIComponent(_codigoActual)}`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();

        if (!res.ok) {
            alert(data.error || 'Error al canjear');
            if (btnU) { btnU.disabled = false; btnU.textContent = 'Marcar como Usado (Entrada)'; }
            return;
        }

        // Actualizar UI
        const estadoEl = document.getElementById('resultado-estado');
        estadoEl.textContent = '✓ CANJEADO';
        estadoEl.className   = 'font-semibold text-yellow-400';
        if (btnU) { btnU.disabled = true; btnU.className = 'w-full px-6 py-3 bg-gray-700 text-gray-400 font-bold rounded-lg cursor-not-allowed'; btnU.textContent = 'Canjeado'; }

        _ventaActual.usado   = true;
        _ventaActual.usadoEn = data.usadoEn;
    } catch {
        alert('Error de conexión');
        if (btnU) { btnU.disabled = false; btnU.textContent = 'Marcar como Usado (Entrada)'; }
    }
}

function obtenerTokenAdmin() {
    if (typeof AuthManager !== 'undefined') return AuthManager.obtenerAdminToken();
    return localStorage.getItem('elgorila_admin_token') || null;
}

// ── Cámara QR ──────────────────────────────────────────────────────────────────

let _scannerStream = null;

function abrirScanner() {
    const modal = document.getElementById('modal-scanner');
    if (modal) { modal.classList.remove('hidden'); modal.classList.add('flex'); }
    iniciarCamara();
}

function cerrarScanner() {
    pararCamara();
    const modal = document.getElementById('modal-scanner');
    if (modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
}

async function iniciarCamara() {
    try {
        _scannerStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        const video = document.getElementById('scanner-video');
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
    const video  = document.getElementById('scanner-video');
    const canvas = document.getElementById('scanner-canvas');
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
            const input = document.getElementById('codigo-qr-input');
            if (input) { input.value = codigo.toUpperCase(); }
            verificarBoleto();
            return;
        }
    }
    requestAnimationFrame(escanearFrame);
}

// ── Inicialización ─────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function() {
    const btnV = document.getElementById('btn-verificar');
    const btnU = document.getElementById('btn-marcar-usado');
    const btnS = document.getElementById('btn-escanear');
    const input = document.getElementById('codigo-qr-input');

    if (btnV) btnV.addEventListener('click', verificarBoleto);
    if (btnU) btnU.addEventListener('click', marcarComoUsado);
    if (btnS) {
        btnS.disabled = false;
        btnS.addEventListener('click', abrirScanner);
    }
    if (input) {
        input.addEventListener('keypress', e => { if (e.key === 'Enter') verificarBoleto(); });
        input.addEventListener('input', () => {
            document.getElementById('resultado-verificacion')?.classList.add('hidden');
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
});
