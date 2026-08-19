/**
 * Carrito de venta manual en boletera — misma lógica que boletos.html:
 * general + credencial combinables, cupones ESPEJO / GRUPO20 / etc.
 */
(function (global) {
  const PRECIOS = {
    get general() {
      return typeof window.precioGeneralVigente === 'function'
        ? window.precioGeneralVigente()
        : 400;
    },
    get credencial() {
      return window.PRECIO_CREDENCIAL || 280;
    },
  };
  const NOMBRE_CREDENCIAL = 'INAPAM · Estudiante · Maestro';
  const CUPON_GRUPO20_MIN = 5;
  const CUPON_GRUPO20_HINT_MIN = 3;

  let cantidades = { general: 0, estudiante: 0 };
  let cuponAplicado = null;
  let cuponManual = false;

  function totalCantidad() {
    return (cantidades.general || 0) + (cantidades.estudiante || 0);
  }

  function tieneCredencial() {
    return (cantidades.estudiante || 0) > 0;
  }

  function subtotalSinCupon() {
    return (cantidades.general || 0) * PRECIOS.general
      + (cantidades.estudiante || 0) * PRECIOS.credencial;
  }

  function itemsParaApi(seccion) {
    const sec = seccion || 'platea';
    const items = [];
    if (cantidades.general > 0) items.push({ tipo: 'general', cantidad: cantidades.general, seccion: sec });
    if (cantidades.estudiante > 0) items.push({ tipo: 'estudiante', cantidad: cantidades.estudiante, seccion: sec });
    return items;
  }

  function nombreTipo(tipo) {
    if (tipo === 'general') return 'General';
    if (tipo === 'estudiante') return NOMBRE_CREDENCIAL;
    return tipo;
  }

  function detectarPromoAutomatica() {
    return null;
  }

  function calcularTotalesPromo(promo) {
    const subtotal = subtotalSinCupon();
    if (!promo) return { subtotal, total: subtotal, descuentoMonto: 0 };
    let total = subtotal;
    if (promo.tipo === 'par_fijo') total = promo.totalMxn;
    else if (promo.tipo === 'porcentaje') total = subtotal * (1 - promo.porcentaje / 100);
    const descuentoMonto = Math.max(0, Math.round((subtotal - total) * 100) / 100);
    total = Math.round(total * 100) / 100;
    return { subtotal, total, descuentoMonto };
  }

  function aplicarPromoAutomaticaSiCorresponde() {
    if (cuponManual) return;
    const promo = detectarPromoAutomatica();
    if (!promo) {
      cuponAplicado = null;
      return;
    }
    const { total, descuentoMonto } = calcularTotalesPromo(promo);
    cuponAplicado = {
      codigo: promo.codigo,
      nombre: promo.nombre,
      tipo: promo.tipo,
      total,
      descuentoMonto,
      automatica: true,
    };
  }

  function esCortesiaSeleccionada() {
    return (document.getElementById('metodo-pago-efectivo')?.value || '') === 'cortesia';
  }

  function totalMostrado() {
    if (esCortesiaSeleccionada()) return 0;
    if (cuponAplicado && typeof cuponAplicado.total === 'number') return cuponAplicado.total;
    return subtotalSinCupon();
  }

  function limpiarCuponUi() {
    cuponManual = false;
    cuponAplicado = null;
    const input = document.getElementById('bol-cupon-input');
    const msg = document.getElementById('bol-cupon-msg');
    const desc = document.getElementById('bol-descuento-fila');
    if (input) input.value = '';
    if (msg) { msg.textContent = ''; msg.className = 'bol-cupon-msg'; }
    if (desc) desc.style.display = 'none';
  }

  function syncPreciosDisplay() {
    const g = PRECIOS.general;
    const c = PRECIOS.credencial;
    const filas = document.querySelectorAll('.bol-ticket-fila');
    if (filas[0]) {
      const precioEl = filas[0].querySelector('.bol-ticket-precio');
      if (precioEl) precioEl.textContent = `$${g} MXN`;
    }
    if (filas[1]) {
      const precioEl = filas[1].querySelector('.bol-ticket-precio');
      if (precioEl) {
        precioEl.innerHTML = `<span style="text-decoration:line-through;opacity:.45;">$${g}</span>
              <span> → </span>
              <span class="bol-ticket-promo">$${c} MXN</span>
              <span style="opacity:.55;"> · −30%</span>`;
      }
    }
  }

  function actualizarUi() {
    syncPreciosDisplay();
    aplicarPromoAutomaticaSiCorresponde();

    ['general', 'estudiante'].forEach(t => {
      const el = document.getElementById(`bol-cant-${t}`);
      if (el) el.textContent = String(cantidades[t] || 0);
    });

    const resumen = document.getElementById('bol-items-resumen');
    if (resumen) {
      const lineas = [];
      if (cantidades.general > 0) {
        lineas.push(`<div class="bol-resumen-linea"><span>General × ${cantidades.general}</span><span>$${(PRECIOS.general * cantidades.general).toFixed(2)}</span></div>`);
      }
      if (cantidades.estudiante > 0) {
        lineas.push(`<div class="bol-resumen-linea"><span>${NOMBRE_CREDENCIAL} × ${cantidades.estudiante}</span><span>$${(PRECIOS.credencial * cantidades.estudiante).toFixed(2)}</span></div>`);
      }
      resumen.innerHTML = lineas.join('') || '<div class="bol-resumen-vacio">Selecciona al menos un boleto</div>';
    }

    const sub = subtotalSinCupon();
    const total = totalMostrado();
    const descFila = document.getElementById('bol-descuento-fila');
    const descMonto = document.getElementById('bol-descuento-monto');
    if (descFila && descMonto) {
      const desc = cuponAplicado?.descuentoMonto || 0;
      if (cuponAplicado && desc > 0) {
        descFila.style.display = '';
        descMonto.textContent = `−$${desc.toFixed(2)} (${cuponAplicado.codigo})`;
      } else {
        descFila.style.display = 'none';
      }
    }

    const totalEl = document.getElementById('bol-total-precio');
    if (totalEl) {
      totalEl.textContent = `$${total.toFixed(2)} MXN`;
      if (cuponAplicado && total < sub) totalEl.classList.add('bol-total-promo');
      else totalEl.classList.remove('bol-total-promo');
    }

    const hint = document.getElementById('bol-promo-hint');
    if (hint) {
      const gen = cantidades.general || 0;
      const total = totalCantidad();
      if (cuponAplicado && !cuponAplicado.automatica) {
        hint.style.display = 'none';
        hint.innerHTML = '';
      } else if (gen === 2 && !tieneCredencial() && gen === total) {
        hint.style.display = '';
        hint.innerHTML = 'Pareja: código <strong>ESPEJO</strong> al pagar — 2 generales por <strong>$600</strong>';
      } else if (gen >= CUPON_GRUPO20_MIN && gen === total && !tieneCredencial()) {
        hint.style.display = '';
        hint.innerHTML = `Grupo: código <strong>GRUPO20</strong> al pagar — −20% en ${gen} generales`;
      } else if (gen >= CUPON_GRUPO20_HINT_MIN && gen < CUPON_GRUPO20_MIN && !tieneCredencial()) {
        hint.style.display = '';
        hint.innerHTML = `Con ${CUPON_GRUPO20_MIN} generales usa <strong>GRUPO20</strong> al pagar (−20%)`;
      } else if (gen >= CUPON_GRUPO20_MIN && tieneCredencial()) {
        hint.style.display = '';
        hint.innerHTML = '<strong>GRUPO20</strong> aplica solo cuando todos los boletos son generales.';
      } else {
        hint.style.display = 'none';
        hint.innerHTML = '';
      }
    }

    const btn = document.getElementById('btn-generar');
    if (btn) {
      const ok = totalCantidad() > 0 && document.getElementById('fecha-efectivo')?.value;
      btn.disabled = !ok;
    }
  }

  function cambiarCantidad(tipo, delta) {
    if (!(tipo in cantidades)) return;
    const nueva = (cantidades[tipo] || 0) + delta;
    if (nueva < 0) return;

    const totalNueva = totalCantidad() - (cantidades[tipo] || 0) + nueva;
    if (totalNueva > 50) {
      alert('Máximo 50 boletos por venta.');
      return;
    }

    cantidades[tipo] = nueva;
    if (cuponManual) limpiarCuponUi();
    actualizarUi();
  }

  function limpiarCarrito() {
    cantidades = { general: 0, estudiante: 0 };
    limpiarCuponUi();
    actualizarUi();
  }

  async function aplicarCupon() {
    const input = document.getElementById('bol-cupon-input');
    const btn = document.getElementById('bol-btn-cupon');
    const msg = document.getElementById('bol-cupon-msg');
    const codigo = (input?.value || '').trim();

    function setMsg(text, ok) {
      if (!msg) return;
      msg.textContent = text;
      msg.className = ok ? 'bol-cupon-msg ok' : 'bol-cupon-msg err';
    }

    if (!codigo) { setMsg('Escribe un código.', false); return; }
    if (totalCantidad() === 0) { setMsg('Selecciona boletos primero.', false); return; }

    let seccion = 'platea';
    const fechaIso = document.getElementById('fecha-efectivo')?.value;
    if (fechaIso) {
      try {
        const dr = await fetch(window.teatroApi(`disponibilidad?fecha=${encodeURIComponent(fechaIso)}`));
        if (dr.ok) {
          const d = await dr.json();
          if (d.galeria_abierta) seccion = 'galeria';
        }
      } catch (_) {}
    }

    if (btn) btn.disabled = true;
    setMsg('Verificando…', true);

    try {
      const payload = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo, items: itemsParaApi(seccion) }),
      };
      const fetchJson = window.egFetchJson;
      const { res, data } = fetchJson
        ? await fetchJson(window.teatroApi('validar-cupon'), payload, 12000)
        : await (async () => {
            const r = await fetch(window.teatroApi('validar-cupon'), payload);
            return { res: r, data: await r.json() };
          })();
      if (!res.ok) {
        setMsg(data.error || 'Código no válido.', false);
        cuponAplicado = null;
        actualizarUi();
        return;
      }

      cuponAplicado = {
        codigo: data.codigo,
        nombre: data.nombre,
        tipo: data.tipo,
        total: data.total,
        descuentoMonto: data.descuentoMonto,
        automatica: false,
      };
      cuponManual = true;
      if (input) input.value = data.codigo;
      const okMsg = data.tipo === 'par_fijo'
        ? `✓ ${data.nombre} — $${data.totalMxn} total`
        : `✓ ${data.nombre} (−${data.porcentaje}%)`;
      setMsg(okMsg, true);
      actualizarUi();
    } catch (err) {
      setMsg((err && err.message) || 'Error de conexión.', false);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function resumenVentaTexto(venta) {
    if (!venta?.items?.length) return '';
    return venta.items.map(i => `${i.cantidad} × ${nombreTipo(i.tipo)}`).join(' · ');
  }

  global.BoleteraVenta = {
    cambiarCantidad,
    aplicarCupon,
    limpiarCarrito,
    itemsParaApi,
    totalCantidad,
    getCupon: () => cuponAplicado,
    resumenVentaTexto,
    actualizarUi,
    onFechaChange() {
      if (cuponAplicado) limpiarCuponUi();
      actualizarUi();
    },
  };

  document.addEventListener('DOMContentLoaded', () => {
    actualizarUi();
    // Cortesía: al cambiar la forma de pago, refrescar el total mostrado ($0)
    document.getElementById('metodo-pago-efectivo')?.addEventListener('change', actualizarUi);
  });
})(window);
