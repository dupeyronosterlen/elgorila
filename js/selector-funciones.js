/**
 * Selector de funciones — grid tipo admin (fn-card).
 * Filtra funciones pasadas; opcionalmente excluye la fecha actual (reagendar).
 */
(function (global) {
  const HORA_FUNCION = 20;
  const MIN_FUNCION = 30;
  const TZ = 'America/Mexico_City';

  function ahoraMx() {
    return new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
  }

  function inicioFuncion(fechaIso) {
    const [y, m, d] = fechaIso.split('-').map(Number);
    return new Date(y, m - 1, d, HORA_FUNCION, MIN_FUNCION, 0);
  }

  function finDiaFuncion(fechaIso) {
    const [y, m, d] = fechaIso.split('-').map(Number);
    return new Date(y, m - 1, d, 23, 59, 59);
  }

  /** true cuando ya no aplica vender / reagendar hacia esa función */
  function funcionYaPaso(fechaIso) {
    if (!fechaIso || !/^\d{4}-\d{2}-\d{2}$/.test(fechaIso)) return true;
    return ahoraMx() >= inicioFuncion(fechaIso);
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
      } else if (futuras && funcionYaPaso(iso)) {
        return false;
      }
      return true;
    });
  }

  function partesNombre(nombre, fechaIso) {
    const partes = (nombre || fechaIso || '').split(/\s*[—–-]\s*/);
    return {
      fecha: partes[0] || nombre || fechaIso,
      hora: partes[1] || '20:30 hrs',
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

  global.SelectorFunciones = {
    filtrarFunciones,
    funcionYaPaso,
    funcionDiaTerminado,
    normalizarLista,
    htmlGrid,
    bindGrid,
    renderEn,
    wireHidden,
    partesNombre,
  };
})(window);
