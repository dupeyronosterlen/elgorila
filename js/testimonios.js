/**
 * Banco de testimonios del público.
 *
 * tono:
 *   calma    — recomendación serena (taquilla)
 *   calida   — personal, trayectoria, ganas de ir
 *   intensa  — superlativo / “me cambió la vida” (nunca agrupadas, nunca en boletos)
 *
 * Uso: cualquier nodo con data-testimonios="boletos|home|obra|obra-mas|franja"
 */
(function () {
  'use strict';

  var BANCO = [
    { id: 'hector', autor: 'Héctor Huerta', tono: 'calma',
      texto: 'Es una obra con mucha profundidad, súper recomendada.',
      corto: 'Es una obra con mucha profundidad, súper recomendada.' },
    { id: 'valencia', autor: 'Valencia Beatriz', tono: 'calma',
      texto: 'Excelente y muy reflexiva obra, vayan a verla.',
      corto: 'Excelente y muy reflexiva obra, vayan a verla.' },
    { id: 'sandra', autor: 'Sandra Ruedas', tono: 'calma',
      texto: 'Reí mucho y también lloré.',
      corto: 'Reí mucho y también lloré.' },
    { id: 'alejandra', autor: 'Alejandra Núñez', tono: 'calma',
      texto: 'Una obra bastante reflexiva y excelentemente representada por el maestro Dupeyrón.',
      corto: 'Una obra bastante reflexiva y excelentemente representada.' },
    { id: 'laura', autor: 'Laura Jiménez', tono: 'calma',
      texto: 'Excelente obra. Un artista en toda la extensión de la palabra: te olvidas del actor y ves realmente al gorila.',
      corto: 'Te olvidas del actor y ves realmente al gorila.' },
    { id: 'daniel-corto', autor: 'Daniel Compeán Pérez', tono: 'calma',
      texto: 'Excelente obra. Imperdible.',
      corto: 'Excelente obra. Imperdible.' },
    { id: 'nestor', autor: 'Nestor Torres', tono: 'calma',
      texto: 'Increíble función la de hoy.',
      corto: 'Increíble función la de hoy.' },
    { id: 'palafox', autor: 'Carlos Palafox Gamboa', tono: 'calma',
      texto: 'Qué actorazo, recomendable.',
      corto: 'Qué actorazo, recomendable.' },
    { id: 'arturo-t', autor: 'Arturo Tirado', tono: 'calma',
      texto: 'Chulada de monólogo. Me encantó.',
      corto: 'Chulada de monólogo. Me encantó.' },
    { id: 'mariana', autor: 'Mariana San', tono: 'calma',
      texto: 'Buenísima.',
      corto: 'Buenísima.' },

    { id: 'daniel-largo', autor: 'Daniel Compeán Pérez', tono: 'calida',
      texto: 'Gran obra de Kafka y mejor actuación. La he visto 2 veces y voy por la 3a. Gran reflexión.',
      corto: 'La he visto 2 veces y voy por la 3a.' },
    { id: 'michelle', autor: 'Michelle Angel QG', tono: 'calida',
      texto: 'Buenísima obra, y excelente actor. La vi varias veces en la secundaria y en la prepa.',
      corto: 'La vi en la secundaria y en la prepa.' },
    { id: 'america', autor: 'America Lara', tono: 'calida',
      texto: 'Fui con mi novio y se quedó en mi top 3 obras.',
      corto: 'Fui con mi novio y se quedó en mi top 3 obras.' },
    { id: 'mirian', autor: 'mirianmaiwa', tono: 'calida',
      texto: 'Me encantó. Excelente actuación, se notan las tablas y la experiencia para interactuar con el público.',
      corto: 'Excelente actuación: se notan las tablas.' },
    { id: 'lupita', autor: 'Lupita Medel', tono: 'calida',
      texto: 'Hoy fui. Genial la obra, Humberto Dupeyrón es lo máximo. Me gustó mucho.',
      corto: 'Hoy fui. Genial la obra. Me gustó mucho.' },
    { id: 'mozo', autor: 'Arturo Mozo', tono: 'calida',
      texto: 'Es una experiencia en la que tus sentimientos y emociones están en un constante sube y baja.',
      corto: 'Los sentimientos van en un constante sube y baja.' },
    { id: 'alfredo', autor: 'Alfredo Aranda', tono: 'calida',
      texto: 'Una adaptación más que sublime de El Gorila de Kafka. Lleven sus cacahuetes por si no alcanzan lugar en las primeras filas.',
      corto: 'Lleven sus cacahuetes por si no alcanzan las primeras filas.' },
    { id: 'alex', autor: 'Alex Mp', tono: 'calida',
      texto: 'Excelente oportunidad para disfrutar de una función de teatro de muy alta calidad.',
      corto: 'Una función de muy alta calidad.' },
    { id: 'felix', autor: 'Felix Fesb', tono: 'calida',
      texto: 'Esa obra la vi hace casi 30 años. Sí es muy recomendable.',
      corto: 'La vi hace casi 30 años. Muy recomendable.' },
    { id: 'juan-carlos', autor: 'Juan Carlos Plata', tono: 'calida',
      texto: 'Esa obra la vi hace 27 años.',
      corto: 'Esa obra la vi hace 27 años.' },
    { id: 'jorge', autor: 'Jorge Granados', tono: 'calida',
      texto: 'Recuerdo cuando fui a verla: me llevaron de la primaria. Estoy sorprendido por tan brutal trayectoria.',
      corto: 'Me llevaron de la primaria. Qué trayectoria.' },
    { id: 'clio', autor: 'Clio Blue', tono: 'calida',
      texto: 'Maestro Dupeyron, gracias por su talento todo este tiempo.',
      corto: 'Gracias por su talento todo este tiempo.' },
    { id: 'german', autor: 'Germán Benítez Giles', tono: 'calida',
      texto: 'Hace 28 años en el Centro Cultural Veracruzano me regaló dos cortesías. Le tengo un gran cariño a esa representación.',
      corto: 'Hace 28 años. Le tengo un gran cariño.' },

    { id: 'bernardo', autor: 'Bernardo Hernandez', tono: 'intensa',
      texto: 'La mejor obra de teatro que he visto en mi vida.',
      corto: 'La mejor obra de teatro que he visto en mi vida.' },
    { id: 'carlos-j', autor: 'Carlos E. Juárez', tono: 'intensa',
      texto: 'La vi hace muchos años con Humberto Dupeyrón. Fue de lo mejor que me pasó: me cambió la vida y desde entonces me gusta el teatro.',
      corto: 'Me cambió la vida y desde entonces me gusta el teatro.' },
    { id: 'angie', autor: 'Angie Vega', tono: 'intensa',
      texto: 'Ya vi el monólogo, es extraordinario. Grande, Sr. Dupeyron.',
      corto: 'El monólogo es extraordinario.' },
    { id: 'irene', autor: 'Irene Arcila', tono: 'intensa',
      texto: 'Gran actor, eres lo máximo, te admiro.',
      corto: 'Gran actor, eres lo máximo.' },
    { id: 'victor', autor: 'Victor Manuel Ordaz', tono: 'intensa',
      texto: 'He tenido la fortuna de verlo casi una media docena de veces y llevarlo a 3 escuelas. Lo recuerdo con admiración.',
      corto: 'Lo he visto casi una media docena de veces.' }
  ];

  var PRESETS = {
    boletos:   { tonos: ['calma'], count: 2, maxIntensa: 0, rotarMs: 9000, formato: 'boletos' },
    home:      { tonos: ['calma', 'calida', 'intensa'], count: 10, maxIntensa: 2, formato: 'home' },
    obra:      { tonos: ['calma', 'calida', 'intensa'], count: 3, maxIntensa: 1, formato: 'cards' },
    'obra-mas':{ tonos: ['calma', 'calida', 'intensa'], count: 4, maxIntensa: 1, formato: 'cards' },
    franja:    { tonos: ['calma', 'calida'], count: 8, maxIntensa: 0, rotarMs: 5200, formato: 'franja' }
  };

  var usadosSesion = {};

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function barajar(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function porTono(tono) {
    return BANCO.filter(function (x) { return x.tono === tono; });
  }

  function mezclar(opts, excluirIds) {
    var skip = {};
    (excluirIds || []).forEach(function (id) { skip[id] = true; });
    var count = opts.count || 2;
    var maxI = opts.maxIntensa != null ? opts.maxIntensa : 1;
    var tonos = opts.tonos || ['calma', 'calida'];

    var pools = {
      calma: barajar(porTono('calma').filter(function (x) { return !skip[x.id]; })),
      calida: barajar(porTono('calida').filter(function (x) { return !skip[x.id]; })),
      intensa: barajar(porTono('intensa').filter(function (x) { return !skip[x.id]; }))
    };

    var out = [];
    var intensas = 0;
    var vistos = {};

    function tomar(tono) {
      if (tonos.indexOf(tono) < 0) return null;
      if (tono === 'intensa' && intensas >= maxI) return null;
      var pool = pools[tono];
      while (pool.length) {
        var q = pool.shift();
        if (!vistos[q.id]) return q;
      }
      return null;
    }

    function siguienteTono() {
      var last = out.length ? out[out.length - 1].tono : null;
      if (out.length === 0) return 'calma';
      if (out.length === count - 1 && last === 'intensa') return 'calma';
      if (last === 'intensa') return Math.random() < 0.5 ? 'calma' : 'calida';
      // Una intensa hacia la mitad, nunca al inicio ni pegada a otra.
      var huecoIntensa = count >= 4 && intensas < maxI && out.length >= 2 && out.length < count - 1;
      if (huecoIntensa && last !== 'intensa' && Math.random() < 0.22) return 'intensa';
      if (last === 'calma') return pools.calida.length ? 'calida' : 'calma';
      return pools.calma.length ? 'calma' : 'calida';
    }

    var guard = 0;
    while (out.length < count && guard < 80) {
      guard++;
      var tono = siguienteTono();
      var q = tomar(tono) || tomar('calma') || tomar('calida') || tomar('intensa');
      if (!q) break;
      vistos[q.id] = true;
      if (q.tono === 'intensa') intensas++;
      out.push(q);
    }
    return out;
  }

  function idsDe(lista) {
    return lista.map(function (x) { return x.id; });
  }

  function elegir(presetName, extra) {
    var opts = Object.assign({}, PRESETS[presetName] || PRESETS.boletos, extra || {});
    var excluir = opts.exclude || [];
    if (presetName === 'obra-mas') {
      excluir = excluir.concat(usadosSesion.obra || []);
    }
    var lista = mezclar(opts, excluir);
    usadosSesion[presetName] = idsDe(lista);
    return lista;
  }

  function firmaCorta(autor) {
    var parts = String(autor || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '';
    var inicial = parts[0].charAt(0).toUpperCase();
    var i = 1;
    while (i < parts.length && /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]\.?$/.test(parts[i])) i++;
    if (i >= parts.length) return inicial + '.';
    return inicial + '. ' + parts[i];
  }

  function pintarBoletos(root, quotes) {
    root.innerHTML = quotes.map(function (q) {
      var firma = firmaCorta(q.autor);
      return '<div class="bofu-review">' +
        '<span class="bofu-review-cita">«' + esc(q.corto || q.texto) + '»</span>' +
        (firma ? '<cite class="bofu-review-firma">— ' + esc(firma) + '</cite>' : '') +
        '</div>';
    }).join('');
  }

  function pintarHome(root, quotes) {
    root.innerHTML = quotes.map(function (q) {
      return '<blockquote class="comentarios-casilla font-body text-text-dark/90">' +
        '<p class="italic">' + esc(q.texto) + '</p>' +
        '<cite class="comentarios-autor">— ' + esc(q.autor) + '</cite></blockquote>';
    }).join('');
  }

  function pintarCards(root, quotes) {
    root.innerHTML = quotes.map(function (q) {
      return '<div class="review-card">' +
        '<div class="review-stars" aria-label="5 estrellas">★★★★★</div>' +
        '<p class="review-text">«' + esc(q.texto) + '»</p>' +
        '<p class="review-author">— ' + esc(q.autor) + '</p></div>';
    }).join('');
  }

  function pintarFranja(root, quotes) {
    var textEl = root.querySelector('.proof-quote-text');
    var authorEl = root.querySelector('.proof-quote-author');
    if (!textEl || !authorEl || !quotes.length) return;
    var idx = 0;
    function mostrar(i) {
      textEl.textContent = '«' + quotes[i].texto + '»';
      authorEl.textContent = '— ' + quotes[i].autor;
    }
    mostrar(0);
    var ms = Number(root.getAttribute('data-testimonios-rotar')) || PRESETS.franja.rotarMs;
    if (quotes.length < 2) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    setInterval(function () {
      idx = (idx + 1) % quotes.length;
      root.classList.add('is-fading');
      setTimeout(function () {
        mostrar(idx);
        root.classList.remove('is-fading');
      }, 360);
    }, ms);
  }

  function rotarBoletos(root, pool, count, ms) {
    if (pool.length <= count) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var cursor = 0;
    setInterval(function () {
      cursor = (cursor + count) % pool.length;
      var slice = [];
      for (var i = 0; i < count; i++) slice.push(pool[(cursor + i) % pool.length]);
      root.classList.add('is-fading');
      setTimeout(function () {
        pintarBoletos(root, slice);
        root.classList.remove('is-fading');
      }, 280);
    }, ms);
  }

  function pintarNodo(root) {
    var preset = root.getAttribute('data-testimonios');
    if (!preset || !PRESETS[preset]) return;
    var opts = PRESETS[preset];
    var extraCount = Number(root.getAttribute('data-testimonios-count'));
    if (extraCount > 0) opts = Object.assign({}, opts, { count: extraCount });

    if (opts.formato === 'boletos') {
      var pool = barajar(porTono('calma').filter(function (x) {
        return (x.corto || x.texto || '').length > 22;
      }));
      var slice = pool.slice(0, opts.count);
      usadosSesion.boletos = idsDe(slice);
      pintarBoletos(root, slice);
      rotarBoletos(root, pool, opts.count, opts.rotarMs);
      return;
    }

    var extra = extraCount > 0 ? { count: extraCount } : {};
    var quotes = elegir(preset, extra);
    if (!quotes.length) return;

    if (opts.formato === 'home') {
      pintarHome(root, quotes);
    } else if (opts.formato === 'cards') {
      pintarCards(root, quotes);
    } else if (opts.formato === 'franja') {
      pintarFranja(root, quotes);
    }
  }

  function init() {
    var nodos = document.querySelectorAll('[data-testimonios]');
    var orden = ['obra', 'obra-mas', 'boletos', 'home', 'franja'];
    orden.forEach(function (p) {
      nodos.forEach(function (el) {
        if (el.getAttribute('data-testimonios') === p) pintarNodo(el);
      });
    });
    nodos.forEach(function (el) {
      var p = el.getAttribute('data-testimonios');
      if (orden.indexOf(p) < 0) pintarNodo(el);
    });
  }

  window.ElGorilaTestimonios = {
    banco: BANCO,
    elegir: elegir,
    init: init
  };

  init();
})();
