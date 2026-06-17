/**
 * Selector de funciones — grid tipo admin (fn-card).
 * Filtra funciones pasadas; opcionalmente excluye la fecha actual (reagendar).
 */
(function (global) {
  const HORA_FUNCION = 18;
  const MIN_FUNCION = 0;
  const TZ = 'America/Mexico_City';

  function ahoraMx() {
    return new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
  }

  function horaDesdeFn(fn) {
    const nombre = typeof fn === 'string' ? '' : (fn?.nombre || '');
    const m = nombre.match(/(\d{1,2}):(\d{2})/);
    return { h: m ? +m[1] : HORA_FUNCION, min: m ? +m[2] : MIN_FUNCION };
  }

  function inicioFuncion(fechaIso, fn) {
    const [y, m, d] = fechaIso.split('-').map(Number);
    const { h, min } = horaDesdeFn(fn);
    return new Date(y, m - 1, d, h, min, 0);
  }

  function finDiaFuncion(fechaIso) {
    const [y, m, d] = fechaIso.split('-').map(Number);
    return new Date(y, m - 1, d, 23, 59, 59);
  }

  /** true cuando ya no aplica vender / reagendar hacia esa función */
  function funcionYaPaso(fn) {
    const fechaIso = typeof fn === 'string' ? fn : fn?.fecha_iso;
    if (!fechaIso || !/^\d{4}-\d{2}-\d{2}$/.test(fechaIso)) return true;
    return ahoraMx() >= inicioFuncion(fechaIso, fn);
  }

  /** true al terminar el día (lista de visitantes / check-in) */
  function funcionDiaTerminado(fechaIso) {
    if (!fechaIso || !/^\d{4}-\d{2}-\d{2}$/.test(fechaIso)) return true;
    return ahoraMx() > finDiaFuncion(fechaIso);
  }

  function normalizarLista(raw) {
    if (Array.isArray(raw)) return raw;
    if (raw && Array.isArray(raw.funciones)) return raw.funciones;
    return [];
  }

  function filtrarFunciones(funciones, opts = {}) {
    const {
      excluir = null,
      futuras = true,
      modoLista = false,
      soloActivas = true,
    } = opts;

    return normalizarLista(funciones).filter(f => {
      const iso = f.fecha_iso;
      if (!iso) return false;
      if (soloActivas && f.activa === false) return false;
      if (excluir && iso === excluir) return false;
      if (modoLista) {
        if (funcionDiaTerminado(iso)) return false;
      } else if (futuras && funcionYaPaso(f)) {
        return false;
      }
      return true;
    });
  }

  function partesNombre(nombre, fechaIso) {
    const partes = (nombre || fechaIso || '').split(/\s*[—–-]\s*/);
    return {
      fecha: partes[0] || nombre || fechaIso,
      hora: partes[1] || '18:00 hrs',
    };
  }

  function htmlGrid(funciones, opts = {}) {
    const { selected, showDisponibles = false } = opts;
    if (!funciones.length) {
      return '<p class="sel-fn-vacio">No hay funciones disponibles.</p>';
    }
    return `<div class="fn-grid sel-fn-grid">${funciones.map(f => {
      const sel = selected === f.fecha_iso ? ' active' : '';
      const { fecha, hora } = partesNombre(f.nombre, f.fecha_iso);
      const disp = showDisponibles && typeof f.disponibles === 'number'
        ? `<span class="fn-avail">${f.disponibles} disp.</span>`
        : '';
      const agot = f.disponibles === 0
        ? '<span class="fn-avail fn-avail-warn">Agotada</span>'
        : '';
      return `<button type="button" class="fn-card sel-fn-card${sel}" data-fecha-iso="${f.fecha_iso}">
        <span class="fn-date">${fecha}</span>
        <span class="fn-name">${hora}</span>
        ${disp || agot}
      </button>`;
    }).join('')}</div>`;
  }

  function bindGrid(container, opts = {}) {
    if (!container) return null;
    const { onSelect, selected } = opts;
    let valor = selected || container.querySelector('.sel-fn-card.active')?.dataset.fechaIso || '';

    container.querySelectorAll('.sel-fn-card').forEach(btn => {
      btn.onclick = () => {
        container.querySelectorAll('.sel-fn-card').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        valor = btn.dataset.fechaIso || '';
        if (onSelect) onSelect(valor, btn);
      };
    });

    if (!valor && container.querySelector('.sel-fn-card')) {
      const first = container.querySelector('.sel-fn-card');
      first.classList.add('active');
      valor = first.dataset.fechaIso || '';
      if (onSelect) onSelect(valor, first);
    }

    return valor;
  }

  function renderEn(container, funciones, opts = {}) {
    if (!container) return '';
    container.innerHTML = htmlGrid(funciones, opts);
    return bindGrid(container, opts);
  }

  function wireHidden(gridEl, hiddenEl, funciones, opts = {}) {
    const prev = hiddenEl?.value;
    const list = filtrarFunciones(funciones, opts);
    const selected = prev && list.some(f => f.fecha_iso === prev) ? prev : (list[0]?.fecha_iso || '');
    const userOnSelect = opts.onSelect;
    const onSelect = iso => {
      if (hiddenEl) hiddenEl.value = iso;
      if (userOnSelect) userOnSelect(iso);
    };
    renderEn(gridEl, list, { ...opts, selected, onSelect });
    if (hiddenEl) hiddenEl.value = selected;
    if (selected && userOnSelect) userOnSelect(selected);
    return selected;
  }

  /** Muestra 3 funciones; «Ver más» abre de 3 en 3; «Ver menos» colapsa tras elegir fecha. */
  function wireHiddenProgressive(gridEl, uiEl, hiddenEl, funciones, opts = {}) {
    const batch = opts.batchSize || 3;
    const prev = hiddenEl?.value;
    const list = filtrarFunciones(funciones, opts);
    const selected = prev && list.some(f => f.fecha_iso === prev) ? prev : (list[0]?.fecha_iso || '');
    const userOnSelect = opts.onSelect;
    const onSelect = iso => {
      if (hiddenEl) hiddenEl.value = iso;
      if (userOnSelect) userOnSelect(iso);
      renderControls();
    };

    renderEn(gridEl, list, { ...opts, selected, onSelect });
    if (hiddenEl) hiddenEl.value = selected;
    if (selected && userOnSelect) userOnSelect(selected);

    const cards = gridEl ? Array.from(gridEl.querySelectorAll('.sel-fn-card')) : [];
    let visibleMax = Math.min(batch - 1, cards.length - 1);
    let colapsado = false;

    function applyVisibility() {
      if (colapsado) {
        cards.forEach(card => { card.style.display = 'none'; });
        if (gridEl) gridEl.style.display = 'none';
        return;
      }
      if (gridEl) gridEl.style.display = '';
      cards.forEach((card, i) => {
        card.style.display = i <= visibleMax ? '' : 'none';
      });
    }

    function renderControls() {
      if (!uiEl) return;
      uiEl.innerHTML = '';

      if (colapsado) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'sel-fn-ver-mas';
        btn.textContent = 'Ver fechas \u2192';
        btn.addEventListener('click', () => {
          colapsado = false;
          applyVisibility();
          renderControls();
        });
        uiEl.appendChild(btn);
        return;
      }

      if (visibleMax < cards.length - 1) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'sel-fn-ver-mas';
        btn.textContent = 'Ver más fechas \u2192';
        btn.addEventListener('click', () => {
          visibleMax = Math.min(visibleMax + batch, cards.length - 1);
          applyVisibility();
          renderControls();
        });
        uiEl.appendChild(btn);
      }

      if (hiddenEl?.value) {
        const btnMenos = document.createElement('button');
        btnMenos.type = 'button';
        btnMenos.className = 'sel-fn-ver-mas sel-fn-ver-menos';
        btnMenos.textContent = 'Ver menos';
        btnMenos.addEventListener('click', () => {
          colapsado = true;
          applyVisibility();
          renderControls();
        });
        uiEl.appendChild(btnMenos);
      }
    }

    applyVisibility();
    renderControls();
    return selected;
  }

  global.SelectorFunciones = {
    filtrarFunciones,
    funcionYaPaso,
    funcionDiaTerminado,
    normalizarLista,
    htmlGrid,
    bindGrid,
    renderEn,
    wireHidden,
    wireHiddenProgressive,
    partesNombre,
  };
})(window);
