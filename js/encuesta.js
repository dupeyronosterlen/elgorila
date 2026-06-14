(function () {
  const PREGUNTAS = [
    {
      id: 'nps',
      titulo: '¿Cómo estuvo esta noche?',
      tipo: 'nps',
      opciones: [
        { v: '1', l: '1' }, { v: '2', l: '2' }, { v: '3', l: '3' },
        { v: '4', l: '4' }, { v: '5', l: '5' },
      ],
      hint: '1 = regular · 5 = inolvidable',
    },
    {
      id: 'volveria',
      titulo: '¿Volverías a ver EL GORILA?',
      tipo: 'opciones',
      opciones: [
        { v: 'si', l: 'Sí — otra noche distinta' },
        { v: 'talvez', l: 'Tal vez' },
        { v: 'no', l: 'No por ahora' },
      ],
    },
    {
      id: 'acompanamiento',
      titulo: '¿Con quién viniste?',
      tipo: 'opciones',
      opciones: [
        { v: 'solo', l: 'Solo/a' },
        { v: 'pareja', l: 'Pareja' },
        { v: 'amigos', l: 'Amigos' },
        { v: 'familia', l: 'Familia' },
        { v: 'trabajo', l: 'Trabajo / empresa' },
        { v: 'otro', l: 'Otro' },
      ],
    },
    {
      id: 'origen',
      titulo: '¿Cómo te enteraste?',
      tipo: 'opciones',
      opciones: [
        { v: 'instagram', l: 'Instagram' },
        { v: 'boca', l: 'Boca a boca' },
        { v: 'google', l: 'Google / búsqueda' },
        { v: 'prensa', l: 'Prensa / medios' },
        { v: 'repeat', l: 'Ya había venido antes' },
        { v: 'otro', l: 'Otro' },
      ],
    },
    {
      id: 'comentario',
      titulo: '¿Qué te llevaste de esta función?',
      tipo: 'texto',
      placeholder: 'Opcional — una frase basta. El gorila nunca es igual dos veces…',
    },
  ];

  const PASOS = ['estado-carga', 'estado-error', 'paso-sobre', 'paso-acta', 'paso-encuesta', 'paso-regalos'];

  let token = '';
  let pasoIdx = -1;
  let respuestas = {};
  let acta = { libertad: '', jaulas: '', salidas: '', actitud: '' };
  let sessionData = null;

  function $(id) { return document.getElementById(id); }

  function tokenFromUrl() {
    return (new URLSearchParams(window.location.search).get('t') || '').trim();
  }

  function enlaceSobre() {
    return `${window.location.origin}${window.location.pathname}?t=${encodeURIComponent(token)}`;
  }

  function show(id) {
    PASOS.forEach(x => {
      const el = $(x);
      if (el) el.classList.toggle('hidden', x !== id);
    });
  }

  function showError(msg) {
    $('error-text').textContent = msg;
    show('estado-error');
  }

  async function apiGet() {
    const res = await fetch(window.teatroApi(`encuesta/${encodeURIComponent(token)}`));
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Enlace no válido.');
    return data;
  }

  async function apiPost(body) {
    const res = await fetch(window.teatroApi(`encuesta/${encodeURIComponent(token)}`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'No se pudo enviar.');
    return data;
  }

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function leerActaDelDom() {
    acta = {
      libertad: ($('acta-libertad')?.value || '').trim(),
      jaulas:   ($('acta-jaulas')?.value || '').trim(),
      salidas:  ($('acta-salidas')?.value || '').trim(),
      actitud:  ($('acta-actitud')?.value || '').trim(),
    };
  }

  function bindCopiarEnlace() {
    const btn = $('btn-copiar-enlace');
    if (!btn) return;
    btn.onclick = async () => {
      const url = enlaceSobre();
      try {
        await navigator.clipboard.writeText(url);
        btn.textContent = 'Enlace copiado ✓';
      } catch {
        prompt('Copia este enlace:', url);
      }
      setTimeout(() => { btn.textContent = 'Copiar enlace'; }, 2500);
    };
  }

  function renderRegalos(regalos) {
    const lista = $('regalos-lista');
    if (!lista) return;
    lista.innerHTML = (regalos || []).map(r => `
      <article class="regalo-card">
        <div class="regalo-head">
          <p class="regalo-pct">−${r.porcentaje}% · ${esc(r.cupon)}</p>
          <h2 class="regalo-titulo">${esc(r.titulo)}</h2>
          <p class="regalo-sub">${esc(r.subtitulo)}</p>
        </div>
        <div class="regalo-body">
          <img src="${esc(r.qrUrl)}" width="100" height="100" alt="QR">
          <p class="regalo-link">${esc(r.url)}</p>
        </div>
        <div class="regalo-actions">
          <a class="prim" href="${esc(r.url)}" target="_blank" rel="noopener">Usar / compartir →</a>
          <button type="button" data-copy="${esc(r.url)}">Copiar enlace</button>
        </div>
      </article>`).join('');

    lista.querySelectorAll('[data-copy]').forEach(b => {
      b.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(b.dataset.copy);
          b.textContent = 'Copiado ✓';
          setTimeout(() => { b.textContent = 'Copiar enlace'; }, 2000);
        } catch {
          prompt('Copia:', b.dataset.copy);
        }
      });
    });
    bindCopiarEnlace();
    show('paso-regalos');
  }

  function actualizarProg() {
    const dots = $('prog-dots');
    if (!dots) return;
    dots.innerHTML = PREGUNTAS.map((_, i) => {
      let cls = i === pasoIdx ? 'activo' : (i < pasoIdx ? 'hecho' : '');
      return `<span class="${cls}"></span>`;
    }).join('');
  }

  function valorActual() {
    const p = PREGUNTAS[pasoIdx];
    if (!p) return null;
    if (p.tipo === 'texto') return respuestas.comentario || '';
    return respuestas[p.id] || null;
  }

  function puedeAvanzar() {
    const p = PREGUNTAS[pasoIdx];
    if (!p) return false;
    if (p.tipo === 'texto') return true;
    return !!valorActual();
  }

  function renderPregunta() {
    const p = PREGUNTAS[pasoIdx];
    const panel = $('pregunta-panel');
    const btnSig = $('btn-siguiente');
    const btnAtras = $('btn-atras');
    if (!p || !panel) return;

    actualizarProg();
    if (btnAtras) btnAtras.classList.toggle('hidden', pasoIdx <= 0);

    let html = `<p class="pregunta-num">Encuesta · ${pasoIdx + 1} de ${PREGUNTAS.length}</p>
      <h2 class="pregunta-txt">${esc(p.titulo)}</h2>`;

    if (p.tipo === 'nps') {
      html += `<p class="sub compact">${esc(p.hint || '')}</p><div class="opciones opciones-nps">`;
      p.opciones.forEach(o => {
        const sel = respuestas.nps === o.v ? ' sel' : '';
        html += `<button type="button" class="opcion${sel}" data-v="${esc(o.v)}">${esc(o.l)}</button>`;
      });
      html += '</div>';
    } else if (p.tipo === 'opciones') {
      html += '<div class="opciones">';
      p.opciones.forEach(o => {
        const sel = respuestas[p.id] === o.v ? ' sel' : '';
        html += `<button type="button" class="opcion${sel}" data-v="${esc(o.v)}">${esc(o.l)}</button>`;
      });
      html += '</div>';
    } else if (p.tipo === 'texto') {
      html += `<textarea class="comentario" id="input-comentario" maxlength="800"
        placeholder="${esc(p.placeholder || '')}">${esc(respuestas.comentario || '')}</textarea>`;
    }

    panel.innerHTML = html;

    panel.querySelectorAll('.opcion[data-v]').forEach(btn => {
      btn.addEventListener('click', () => {
        const v = btn.dataset.v;
        if (p.tipo === 'nps') respuestas.nps = v;
        else respuestas[p.id] = v;
        renderPregunta();
        if (btnSig && p.tipo !== 'texto') {
          btnSig.disabled = false;
          setTimeout(() => btnSig.click(), 280);
        }
      });
    });

    const ta = $('input-comentario');
    if (ta) {
      ta.addEventListener('input', () => {
        respuestas.comentario = ta.value.trim();
        if (btnSig) btnSig.disabled = false;
      });
    }

    if (btnSig) {
      btnSig.textContent = pasoIdx === PREGUNTAS.length - 1 ? 'Ver obsequios →' : 'Siguiente';
      btnSig.disabled = !puedeAvanzar();
    }
  }

  function iniciarEncuesta() {
    pasoIdx = 0;
    show('paso-encuesta');
    renderPregunta();
  }

  async function enviarTodo() {
    const btn = $('btn-siguiente');
    if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }
    leerActaDelDom();
    try {
      const data = await apiPost({
        acta,
        nps: parseInt(respuestas.nps, 10),
        volveria: respuestas.volveria,
        acompanamiento: respuestas.acompanamiento,
        origen: respuestas.origen,
        comentario: respuestas.comentario || '',
      });
      renderRegalos(data.regalos);
    } catch (e) {
      alert(e.message || 'Error al enviar.');
      if (btn) { btn.disabled = false; btn.textContent = 'Ver obsequios →'; }
    }
  }

  function bindNav() {
    $('btn-abrir-sobre')?.addEventListener('click', () => {
      $('sobre-visual')?.classList.add('abierto');
      setTimeout(() => show('paso-acta'), 480);
    });

    $('btn-acta-atras')?.addEventListener('click', () => show('paso-sobre'));

    $('btn-acta-sig')?.addEventListener('click', () => {
      leerActaDelDom();
      iniciarEncuesta();
    });

    $('btn-atras')?.addEventListener('click', () => {
      if (pasoIdx > 0) {
        pasoIdx -= 1;
        renderPregunta();
      } else {
        show('paso-acta');
      }
    });

    $('btn-siguiente')?.addEventListener('click', () => {
      if (!puedeAvanzar()) return;
      if (pasoIdx < PREGUNTAS.length - 1) {
        pasoIdx += 1;
        renderPregunta();
      } else {
        enviarTodo();
      }
    });
  }

  async function init() {
    token = tokenFromUrl();
    if (!token || token.length < 32) {
      showError('Abre el sobre desde el correo que te enviamos esta noche.');
      return;
    }
    if (!window.API_BASE) {
      showError('Servicio no disponible.');
      return;
    }

    bindNav();

    try {
      sessionData = await apiGet();

      const fn = sessionData.funcionNombre || 'EL GORILA';
      const kicker = $('kicker-funcion');
      if (kicker) kicker.textContent = fn;

      const sal = sessionData.saludo;
      const sub = $('sub-sobre');
      if (sub && sal) {
        sub.textContent = `${sal}, ábrelo cuando puedas. Adentro: ejercicio, encuesta y obsequios.`;
      }

      if (sessionData.completada && sessionData.regalos) {
        renderRegalos(sessionData.regalos);
        return;
      }

      show('paso-sobre');
    } catch (e) {
      showError(e.message || 'Este sobre no está disponible.');
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
