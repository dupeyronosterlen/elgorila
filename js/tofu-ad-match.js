/**
 * Ad ↔ landing match para TOFU.
 * Lee UTMs de Meta y muestra en .ad-puente copy propio por línea
 * (pulido en landing; no repite el creativo del clic).
 */
(function () {
  'use strict';

  var LINEAS = {
    espejo: { label: 'ESPEJO' },
    jaulas: { label: 'JAULAS' },
    linaje: { label: 'LINAJE' },
  };

  var LINEA_DEFAULTS = {
    espejo: {
      pregunta: '«No es teatro, es tu espejo.»',
      sub: 'En vivo no hay pausa: la incomodidad llega entera — y te invita a reconocerte.',
    },
    jaulas: {
      pregunta: '«¿Cómo escapamos de las jaulas que no se pueden ver?»',
      sub: 'Las de barrotes se reconocen. Las otras las confundimos con libertad.',
    },
    linaje: {
      pregunta: '37 años en escena — en vivo, sin filtro.',
      sub: 'Más de mil funciones desde 1989 — y sigue en cartelera cada temporada.',
    },
  };

  var TERM_LINEA = {
    'as-tofu-espejo': 'espejo',
    'as-tofu-jaulas': 'jaulas',
    'as-tofu-linaje': 'linaje',
    'as-mofu-espejo': 'espejo',
    'as-mofu-jaulas': 'jaulas',
    'as-mofu-linaje': 'linaje',
  };

  // pregunta = texto del anuncio (tal cual en la imagen). sub = copy propio de la landing.
  var POR_CONTENT = {
    'espejo-tofu-1': {
      pregunta: '«No es teatro, es tu espejo.»',
      sub: 'En vivo no hay pausa: ves la actuación a pocos metros y la incomodidad llega entera.',
    },
    'espejo-tofu-2': {
      pregunta: '«¿Quién eres cuando dejas de fingir?»',
      sub: 'Todos tenemos una versión para el público. El Gorila habla de la otra.',
    },
    'espejo-tofu-3': {
      pregunta: '«¿Y tú, qué tan bueno eres para imitar?»',
      sub: 'Peter el Rojo lo hizo para sobrevivir. Le funcionó tan bien que ya no supo volver.',
    },
    'espejo-tofu-v1': {
      pregunta: '«Y yo, mono libre, acepté ese yugo.»',
      sub: 'Kafka sobre lo que dejamos de ser para encajar — en escena, sin filtro.',
    },
    'espejo-tofu-v2': {
      pregunta: '«¿Quién eres cuando dejas de fingir?»',
      sub: 'El mono que aprendió a parecer hombre para encontrar una salida.',
    },
    'jaulas-tofu-1': {
      pregunta: '«¿Cómo escapamos de las jaulas que no se pueden ver?»',
      sub: 'Las de barrotes se reconocen. Las otras las confundimos con libertad.',
    },
    'jaulas-tofu-2': {
      pregunta: '«¿A qué renuncias cada día para pertenecer?»',
      sub: 'El trabajo, la reunión, el tono correcto: cada mañana algo queda afuera.',
    },
    'jaulas-tofu-3': {
      pregunta: '«¿Y tú, a qué jaula llamas libertad?»',
      sub: 'Las jaulas más difíciles de ver son las que nosotros mismos nos construimos.',
    },
    'jaulas-tofu-v1': {
      pregunta: '«¿Ya soy un hombre?»',
      sub: 'Primero te encierran. Luego llamas casa a tu jaula.',
    },
    'linaje-tofu-1': {
      pregunta: '37 años en escena.',
      sub: 'El monólogo más longevo del teatro mexicano: más de mil funciones desde 1989.',
    },
  };

  /** Copy del puente entre Kafka y 37 años — uno por línea, no del catálogo de ads. */
  var PUENTE_POR_LINEA = {
    jaulas: {
      pregunta: '«¿A qué renuncias cada día para pertenecer?»',
      sub: 'No siempre te encierran. A veces aprendes a encerrarte tú solo.',
    },
    espejo: {
      pregunta: '«No es teatro, es tu reflejo.»',
      sub: 'Te invitamos a reconocerte.',
    },
    linaje: {
      pregunta: '37 años en escena.',
      sub: 'El monólogo más longevo del teatro mexicano: más de mil funciones desde 1989.',
    },
  };

  function norm(s) {
    return String(s || '')
      .toLowerCase()
      .trim()
      .replace(/_/g, '-')
      .replace(/\s+/g, '-');
  }

  /** espejo-tofu-01 → espejo-tofu-1 · jaulas-tofu-03 → jaulas-tofu-3 */
  function normContentKey(raw) {
    var s = norm(raw);
    if (!s) return '';
    s = s.replace(/-tofu-0+(\d+)(?=-|$)/g, '-tofu-$1');
    return s;
  }

  function lineaDesdeTerm(term) {
    var t = norm(term);
    return TERM_LINEA[t] || null;
  }

  function lineaDesdeCampaign(campaign) {
    var c = norm(campaign);
    if (LINEAS[c]) return c;
    if (c.indexOf('espejo') !== -1) return 'espejo';
    if (c.indexOf('jaulas') !== -1) return 'jaulas';
    if (c.indexOf('linaje') !== -1) return 'linaje';
    return null;
  }

  function leerUtm() {
    var out = {};
    try {
      var params = new URLSearchParams(window.location.search);
      ['source', 'medium', 'campaign', 'content', 'term'].forEach(function (k) {
        var v = params.get('utm_' + k);
        if (v) out[k] = v;
      });
    } catch (_) {}
    /* Solo UTMs en esta URL activan el puente del hero. localStorage
       sigue sirviendo para analytics (utm.js), no para cambiar el copy. */
    return out;
  }

  function resolver(utm) {
    var campaign = norm(utm.campaign);
    var contentKey = normContentKey(utm.content);
    var lineaKey = lineaDesdeTerm(utm.term) || lineaDesdeCampaign(campaign);
    var linea = lineaKey ? LINEAS[lineaKey] : null;

    if (!linea && contentKey) {
      var pref = contentKey.split('-')[0];
      if (LINEAS[pref]) {
        lineaKey = pref;
        linea = LINEAS[pref];
      }
    }

    var puente = lineaKey && PUENTE_POR_LINEA[lineaKey];
    var pregunta = puente && puente.pregunta;
    var sub = puente && puente.sub;
    if (!pregunta && lineaKey && LINEA_DEFAULTS[lineaKey]) {
      pregunta = LINEA_DEFAULTS[lineaKey].pregunta;
      sub = LINEA_DEFAULTS[lineaKey].sub;
    }

    return {
      campaign: campaign || 'default',
      content: contentKey,
      contentPuente: lineaKey ? 'puente-' + lineaKey : '',
      contentRaw: utm.content || '',
      lineaKey: lineaKey || '',
      linea: linea,
      especifico: puente || null,
      pregunta: pregunta || '',
      sub: sub || '',
    };
  }

  function aplicar(match) {
    var tieneGancho = !!(match.pregunta);
    document.querySelectorAll('[data-ad-match-block]').forEach(function (el) {
      el.hidden = !tieneGancho;
    });
    document.querySelectorAll('[data-ad-bridge]').forEach(function (el) {
      if (tieneGancho) {
        el.textContent = match.pregunta;
        el.hidden = false;
      } else {
        el.hidden = true;
      }
    });
    document.querySelectorAll('[data-ad-sub]').forEach(function (el) {
      if (tieneGancho && match.sub) {
        el.textContent = match.sub;
        el.hidden = false;
      } else {
        el.hidden = true;
      }
    });
    document.documentElement.classList.toggle('hero-has-ad-match', tieneGancho);
    var hero = document.getElementById('top');
    if (hero) hero.classList.toggle('hero-has-ad-match', tieneGancho);
    if (match.lineaKey) {
      document.documentElement.setAttribute('data-tofu-linea', match.lineaKey);
    }
  }

  function pushAttribution(match) {
    if (typeof window.egSinAnalytics === 'function' && window.egSinAnalytics()) return;
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
      event: 'tofu_ad_match',
      tofu_campaign: match.campaign,
      tofu_content: match.contentRaw || match.content,
      tofu_content_norm: match.content,
      tofu_content_puente: match.contentPuente || match.content,
      tofu_linea: match.linea ? match.linea.label : match.lineaKey,
      tofu_matched: !!(match.especifico || match.linea),
    });
  }

  window.aplicarTofuAdMatch = function () {
    var match = resolver(leerUtm());
    aplicar(match);
    pushAttribution(match);
    return match;
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', window.aplicarTofuAdMatch);
  } else {
    window.aplicarTofuAdMatch();
  }
})();
