# Checklist de cambio de precio ($350 → $400)

> Generado el 2026-06-21. El precio general sube de **$350 a $400**.
> ⚠️ NO es un buscar-reemplazar: hay precio real (cobro), display, SEO y descuentos.
> Haz los grupos en orden. Marca cada casilla. Despliega y verifica una compra de prueba.

---

## 0. DECISIONES DE NEGOCIO antes de tocar nada
Define esto primero (afecta varios lugares):
- [ ] **General:** $350 → **$400** (confirmado).
- [ ] **Credencial** (INAPAM/estudiante/maestro): ¿sigue **$245** o cambia?
- [ ] **ESPEJO** (2 generales): hoy "= $600". A $400 c/u el valor normal sería $800.
      ¿ESPEJO se queda en $600 o sube? (define el ahorro que anuncias)
- [ ] **GRUPO20** (−20%): es porcentaje, se ajusta solo. Sin acción.
- [ ] **Promo tachado:** hoy el sitio muestra "$400 tachado → $350 promo".
      Al subir a $400 real, ¿se elimina el tachado o se pone un nuevo precio promo?

---

## 1. PRECIO REAL COBRADO  ⛔ FUNNEL — lo hace tu dev, con prueba de compra
Es lo único crítico. NO lo toques sin probar checkout end-to-end.
- [ ] **Worker / Cloudflare KV:** el cobro online se calcula en el Worker. El grep NO
      encontró "350" hardcodeado en `worker/index.js`, así que **el precio probablemente
      vive en KV (INVENTARIO) o en config** → confírmalo con el dev y cámbialo ahí.
- [ ] `js/boletera-venta.js:6` → `const PRECIOS = { general: 350, credencial: 245 }`
      (precio de **taquilla manual**). Cambiar general a 400.
- [ ] `js/analytics.js:32` → `precio = i.tipo === 'general' ? 350 : 245`
      (fallback de **tracking**; para que GA4/Ads reporten el valor correcto).

> Tras cambiar esto: hacer **1 compra de prueba real** (online) y **1 venta de prueba en
> taquilla**, y revisar que el correo, el QR y el monto en Stripe sean $400.

---

## 2. DISPLAY VISIBLE (HTML) — seguro, no es funnel
- [ ] `boletos.html:968` `$350 MXN` (precio general visible)
- [ ] `boletos.html:982` `$350` (tachado de la fila credencial)
- [ ] `admin.html:850` `$350 MXN`
- [ ] `admin.html:864` `$350` (tachado credencial)
- [ ] `index.html:4023` aria-label "desde $350"
- [ ] `index.html:4027` `$350` (barra de compra fija)
- [ ] `index.html:4219` aria-label "desde $350" (JS)
- [ ] `index.html:4225` `$400 tachado / $350 promo` (JS de la barra) ← revisar la lógica del promo
- [ ] `funciones.html:740` `desde $350 MXN`
- [ ] `funciones.html:769` `Desde $350 MXN`

## 3. SEO / SCHEMA / META — seguro (yo lo puedo hacer cuando digas "ya")
- [ ] `index.html` JSON-LD: 11× `"price": "350"` (líneas 2457–3087)
- [ ] `funciones.html` JSON-LD: 11× `"price": "350"` (líneas 181–501)
- [ ] `funciones.html:13` meta description `Boletos desde $350 MXN`
- [ ] `funciones.html:43` WebPage description `Boletos desde $350 MXN`
- [ ] `index.html:3227` FAQ schema (menciona $245 y ESPEJO $600)
- [ ] `index.html:3816` FAQ visible ($350 / $245 / ESPEJO $600)
- [ ] (El `<title>` y la meta del home ya NO llevan precio — no hay que tocarlos.)

## 4. TEXTOS / DOCS — seguro
- [ ] `llms.txt:27` `Precio desde: $350 MXN`
- [ ] `boletos.html:1182-1183` ($245 credencial, ESPEJO $600)
- [ ] `CAPACIDAD-TEATRO.template.txt:13-14`
- [ ] `CUPONES-AGENCIA.template.txt:9-10, 31, 56, 62`

---

## 5. Después de desplegar
- [ ] Compra de prueba online ($400 en Stripe + correo + QR correctos)
- [ ] Venta de prueba en taquilla ($400)
- [ ] Revisar GA4/Ads que reporten value=400
- [ ] (Search Console) la nueva info de precio se reindexa sola; opcional "Solicitar indexación" de `/` y `/funciones.html`
