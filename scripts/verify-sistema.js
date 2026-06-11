#!/usr/bin/env node
/**
 * Verificación de salud del funnel de boletos (solo lectura + checkout sin pago).
 *
 * USO:
 *   node scripts/verify-sistema.js
 *   node scripts/verify-sistema.js --api https://elgorila-api.dupeyronosterlen.workers.dev
 *   node scripts/verify-sistema.js --fecha 2026-07-08 --checkout
 *
 * --checkout  Crea sesión Stripe real (1 boleto general platea). Cancela en Stripe si no quieres pagar.
 */

'use strict';

const API = (() => {
  const i = process.argv.indexOf('--api');
  return (i >= 0 && process.argv[i + 1]) || 'https://elgorila-api.dupeyronosterlen.workers.dev';
})();

const FECHA = (() => {
  const i = process.argv.indexOf('--fecha');
  return (i >= 0 && process.argv[i + 1]) || '2026-07-08';
})();

const DO_CHECKOUT = process.argv.includes('--checkout');

const ok   = (m) => console.log(`  ✅ ${m}`);
const warn = (m) => console.log(`  ⚠️  ${m}`);
const fail = (m) => { console.log(`  ❌ ${m}`); process.exitCode = 1; };

async function get(path) {
  const res = await fetch(`${API}${path}`);
  let body = null;
  try { body = await res.json(); } catch { body = null; }
  return { res, body };
}

async function post(path, payload) {
  const res = await fetch(`${API}${path}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  });
  let body = null;
  try { body = await res.json(); } catch { body = null; }
  return { res, body };
}

async function main() {
  console.log('\n🔍 Verificación El Gorila — Boletaje');
  console.log(`   API: ${API}`);
  console.log(`   Fecha prueba: ${FECHA}\n`);

  let errores = 0;
  const bump = () => { errores += 1; process.exitCode = 1; };

  // 1. Funciones wilberto
  console.log('1. Funciones activas (wilberto)');
  const { res: rFn, body: funciones } = await get('/api/wilberto/funciones');
  if (!rFn.ok || !Array.isArray(funciones)) {
    fail('No se pudo leer /api/wilberto/funciones');
    bump();
  } else {
    ok(`${funciones.length} funciones`);
    const primera = funciones.find(f => f.fecha_iso === FECHA);
    if (!primera) {
      fail(`Fecha ${FECHA} no está en funciones activas`);
      bump();
    } else {
      ok(`Fecha ${FECHA} activa: ${primera.nombre}`);
      if (typeof primera.capacidad === 'number') {
        ok(`Capacidad API: ${primera.capacidad} · vendidos: ${primera.vendidos ?? 0} · disp: ${primera.disponibles ?? '?'}`);
        if (primera.capacidad < 200) warn(`Capacidad ${primera.capacidad} — ¿falta deploy o config platea/galería en KV?`);
        if (primera.secciones?.platea) ok(`Secciones: platea ${primera.secciones.platea.disponibles} · galería ${primera.secciones.galeria?.disponibles ?? '—'}`);
      } else {
        warn('Endpoint funciones sin inventario enriquecido — despliega Worker actualizado');
      }
    }
  }

  // 2. Alias gorila → mismo inventario
  console.log('\n2. Alias gorila → wilberto');
  const { res: rG, body: fnG } = await get('/api/gorila/funciones');
  if (!rG.ok || !Array.isArray(fnG)) {
    fail('Alias /api/gorila/funciones no responde');
    bump();
  } else if (fnG.length !== funciones?.length) {
    fail(`gorila devuelve ${fnG.length} funciones, wilberto ${funciones?.length} — deben coincidir tras deploy`);
    bump();
  } else {
    ok(`gorila alias OK (${fnG.length} funciones)`);
  }

  // 3. Disponibilidad
  console.log('\n3. Disponibilidad por fecha');
  const { res: rD, body: disp } = await get(`/api/wilberto/disponibilidad?fecha=${FECHA}`);
  if (!rD.ok || !disp) {
    fail('disponibilidad falló');
    bump();
  } else {
    ok(`disponibles: ${disp.disponibles} · galería_abierta: ${!!disp.galeria_abierta}`);
    if (disp.secciones?.general && !disp.secciones?.platea) {
      warn('Config vieja (sección "general") — sube wilberto:config y despliega Worker');
    }
    if (disp.secciones?.platea) {
      ok(`platea: ${disp.secciones.platea.disponibles} · galería: ${disp.secciones.galeria?.disponibles ?? 0}`);
    }
  }

  // 4. Validaciones checkout (sin cobrar)
  console.log('\n4. Validaciones checkout (sin pago)');
  const vacio = await post('/api/wilberto/checkout', { items: [], fecha: FECHA, email: 'test@test.com' });
  if (vacio.res.status === 400) ok('Carrito vacío rechazado (400)');
  else { fail(`Carrito vacío debería ser 400, fue ${vacio.res.status}`); bump(); }

  const fechaMala = await post('/api/wilberto/checkout', {
    items: [{ tipo: 'general', cantidad: 1, seccion: 'platea' }],
    fecha: '2020-01-01',
    email: 'test@test.com',
  });
  if (fechaMala.res.status === 400) ok('Fecha inválida rechazada (400)');
  else { fail(`Fecha inválida debería ser 400, fue ${fechaMala.res.status}`); bump(); }

  const galeriaBloq = await post('/api/wilberto/checkout', {
    items: [{ tipo: 'general', cantidad: 1, seccion: 'galeria' }],
    fecha: FECHA,
    email: 'test@test.com',
  });
  if (disp?.secciones?.platea?.disponibles > 0 && galeriaBloq.res.status === 400) {
    ok('Galería bloqueada mientras hay platea (400)');
  } else if (disp?.secciones?.platea?.disponibles > 0) {
    warn('Galería no bloqueada con platea disponible — revisa Worker');
  }

  const noStripe = await post('/api/wilberto/checkout', {
    items: [{ tipo: 'general', cantidad: 1, seccion: 'platea' }],
    fecha: FECHA,
    email: 'verify+' + Date.now() + '@elgorilateatro.com.mx',
  });
  if (noStripe.res.status === 503 && noStripe.body?.error?.includes('Pagos no configurados')) {
    fail('STRIPE_SECRET_KEY no configurado en Worker');
    bump();
  } else if (noStripe.res.status === 200 && noStripe.body?.url) {
    ok('Stripe checkout session creada (URL devuelta)');
    console.log(`     URL (cancela si es prueba): ${noStripe.body.url.slice(0, 60)}…`);
    if (noStripe.body.sessionId) {
      warn('Hay reserva optimista activa ~15 min hasta que expire la sesión o canceles en Stripe');
    }
  } else if (DO_CHECKOUT) {
    fail(`Checkout inesperado: ${noStripe.res.status} ${JSON.stringify(noStripe.body)}`);
    bump();
  } else {
    ok(`Checkout respondió ${noStripe.res.status} (usa --checkout para forzar error detallado)`);
  }

  // 5. Folio inexistente
  console.log('\n5. Verificación de folio');
  const { res: rV } = await get('/api/wilberto/venta/CERT-FFFFFFFFFFFF');
  if (rV.status === 404) ok('Folio falso → 404 (anti-enumeración OK)');
  else { warn(`Folio falso devolvió ${rV.status}`); }

  // 6. CCC inactivo
  console.log('\n6. CCC (inactivo)');
  const { body: cccFn } = await get('/api/ccc/funciones');
  if (Array.isArray(cccFn) && cccFn.length === 0) ok('ccc sin funciones (correcto)');
  else warn(`ccc tiene ${cccFn?.length ?? '?'} funciones`);

  console.log('\n' + (errores ? `❌ ${errores} problema(s). Corrige antes de abrir venta.` : '✅ Verificación base OK.'));
  console.log('\nPrueba manual recomendada (después de deploy):');
  console.log('  1. Compra 1 boleto en boletos.html (tarjeta test o real)');
  console.log('  2. Copia folio CERT-… de confirmacion.html');
  console.log('  3. verificar.html → debe mostrar VÁLIDO');
  console.log('  4. Admin canjea → segundo escaneo debe decir YA CANJEADO');
  console.log('  5. Revisa email elgorilateatro@gmail.com con aviso de venta\n');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
