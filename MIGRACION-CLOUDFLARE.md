# Migración a Cloudflare Pages + cierre SEO/Performance/Seguridad

> Objetivo: pasar el sitio estático de **GitHub Pages** a **Cloudflare Pages** para
> activar `_redirects` + `_headers` (URLs bonitas, redirects, noindex y cache largo)
> y los headers de seguridad → cerrar Performance y Best Practices al 100%.
>
> Regla de oro: **el funnel de venta no se interrumpe.** El sitio actual sigue en
> vivo en GitHub Pages hasta el último paso (cambio de DNS), que es reversible.

---

## 0. Estado actual (verificado)

- **Hosting estático:** GitHub Pages (`server: GitHub.com`, DNS → `185.199.108–111.153`).
  Por eso hoy `_redirects` y `_headers` **NO se aplican**.
- **API:** Cloudflare Worker `elgorila-api` en `*.workers.dev`. El funnel la llama por
  **URL absoluta** (`<meta name="api-base">`), así que **la API es independiente del
  hosting del sitio** → migrar el sitio no afecta la API.
- **CORS del Worker:** solo acepta `elgorilateatro.com.mx`, `www` y `localhost`
  (`worker/index.js` → `ALLOWED_ORIGINS`). ⚠️ Clave para las pruebas (paso 2).
- **Repo ya preparado:** `_redirects`, `_headers` (con seguridad + cache) y favicon
  liviano ya están commiteados. No falta nada en código para migrar.

---

## 1. Crear el proyecto en Cloudflare Pages (sin impacto en el sitio vivo)

1. Cloudflare Dashboard → **Workers & Pages** → **Create** → **Pages** →
   **Connect to Git** → repo `dupeyronosterlen/elgorila`.
2. Configuración de build:
   - **Production branch:** `main` (NO `claude/...`; esa es la rama del PR).
   - **Framework preset:** None.
   - **Build command:** *(vacío)* — el sitio es estático y `css/tailwind.css` ya está commiteado.
   - **Build output directory:** `/` (raíz).
3. Deploy. Cloudflare te da una URL `https://<proyecto>.pages.dev`.

> En este punto el sitio en vivo (GitHub Pages) sigue intacto. Solo creaste una copia
> paralela en pages.dev.

---

## 2. Validar TODO en pages.dev ANTES de tocar el DNS

### 2a. Estático (no necesita API) — debe pasar tal cual
- [ ] Home, funciones, terminos, programa/v4, presskit cargan bien.
- [ ] **URLs bonitas / redirects** (esto es lo que GitHub Pages no hacía):
  ```
  curl -sI https://<proyecto>.pages.dev/funciones    # 200
  curl -sI https://<proyecto>.pages.dev/presskit     # 200 (rewrite a presskit2026.html)
  curl -sI https://<proyecto>.pages.dev/fechas       # 200 (→ funciones)
  curl -sI https://<proyecto>.pages.dev/privacidad   # 200 (→ terminos)
  curl -sI https://<proyecto>.pages.dev/boletera     # 200/redirect (→ admin)
  ```
- [ ] **Headers** activos:
  ```
  curl -sI https://<proyecto>.pages.dev/boletos.html | grep -i x-robots   # noindex
  curl -sI https://<proyecto>.pages.dev/ | grep -iE 'strict-transport|x-frame|x-content-type'
  ```
- [ ] Favicon liviano carga (`/img/favicon/favicon-32.png`).

### 2b. Funnel + API (CORS) — ⚠️ requiere un paso temporal
El funnel en pages.dev llamará al Worker desde el origen `<proyecto>.pages.dev`, que
**no está en `ALLOWED_ORIGINS`** → las llamadas fallarán por CORS. Para probar de verdad:

1. En `worker/index.js`, añade temporalmente tu URL exacta de pages.dev a
   `ALLOWED_ORIGINS` (commit en una rama, `wrangler deploy`).
2. Prueba **una compra real de prueba de punta a punta**:
   - [ ] `boletos` → selección → `checkout` → Stripe → `confirmacion` (con QR).
   - [ ] Llega el correo con el boleto/QR.
   - [ ] Tracking dispara (GA4/Ads/Meta) sin error de CSP en consola
         (la CSP está en Report-Only, no bloquea; revisa que no falte ningún dominio).
   - [ ] Admin: login, escáner QR (cámara), verificar boleto.
3. Cuando todo pase, **revierte** el cambio temporal de CORS (lo añadirás definitivo en el paso 3).

> Si prefieres no tocar CORS con pages.dev, usa un subdominio de prueba
> `staging.elgorilateatro.com.mx` apuntado a Pages y añádelo a `ALLOWED_ORIGINS`.

---

## 3. Preparar CORS para producción (antes del cutover)

El dominio de producción `elgorilateatro.com.mx` **ya está** en `ALLOWED_ORIGINS`, así que
tras el cutover el funnel funciona sin cambios. Solo:
- [ ] Quita cualquier origen temporal de pages.dev que hayas añadido para pruebas.
- [ ] (Opcional) deja `https://<proyecto>.pages.dev` permitido si quieres un entorno de QA permanente.

---

## 4. Cutover de DNS (el único paso con efecto en vivo — reversible)

> Hazlo en horario de bajo tráfico. Ten lista la reversión.

1. **Pre-requisito:** el dominio `elgorilateatro.com.mx` debe estar gestionado en
   **Cloudflare DNS** (mismo lugar que el Worker). Si los nameservers aún están en el
   registrador, primero agrega el sitio a Cloudflare y cambia los NS (esto solo, sin
   tocar registros, no rompe nada: replicas los registros actuales).
2. En **Pages → tu proyecto → Custom domains** → añade `elgorilateatro.com.mx` y
   `www.elgorilateatro.com.mx`. Cloudflare crea/ajusta los registros automáticamente.
3. Esto reemplaza los registros que apuntan a GitHub Pages (`185.199.x.x`) por los de Pages.
4. **Valida en el dominio real** inmediatamente (repite checklist 2a + una compra de prueba 2b).

### Rollback (si algo falla)
- Restaura los registros DNS A/AAAA a las IPs de GitHub Pages
  (`185.199.108.153`, `.109.153`, `.110.153`, `.111.153`) y el CNAME `www` →
  `dupeyronosterlen.github.io`. El sitio vuelve a GitHub Pages en minutos.
- **No borres** el repo de GitHub Pages ni el archivo `CNAME` hasta confirmar Pages estable.

---

## 5. Endurecer seguridad (después de estabilizar)

- [ ] Revisar la consola con la **CSP en Report-Only**; añadir cualquier dominio que falte.
- [ ] Renombrar `Content-Security-Policy-Report-Only` → `Content-Security-Policy` en
      `_headers` para hacerla cumplir (solo cuando no haya violaciones del funnel).
- [ ] Confirmar que el webhook de Stripe valida firma (`STRIPE_WEBHOOK_SECRET`).
- [ ] (Opcional) HSTS preload: añadir `; preload` y registrar en hstspreload.org.

---

## 6. Search Console (post-migración)

- [ ] **Reenviar el sitemap** `https://elgorilateatro.com.mx/sitemap.xml` en GSC.
- [ ] **Inspeccionar URL** y "Solicitar indexación" para: `/`, `/funciones.html`,
      `/presskit/presskit2026.html`, `/programa/v4.html`.
- [ ] **Prueba de resultados enriquecidos** (search.google.com/test/rich-results) para
      `/` y `/funciones.html` → confirmar que detecta los 11 **Event** y el Breadcrumb.
- [ ] Revisar **Cobertura**: que `programa/v1–v3,v5` salgan como "Excluida por noindex"
      (correcto) y que no haya 404 de URLs viejas.
- [ ] Monitorear **Core Web Vitals** (datos de campo tardan ~28 días en reflejar mejoras).

---

## 7. Lo que queda para PSI 100% (opcional, bajo impacto)

- Convertir a **WebP/AVIF** los PNG pesados de galería/cartel (4–8 MB). NO se cargan en
  el home (usa variantes `mobile/webp`), así que es prioridad baja; ayuda a presskit/galería
  desktop y ahorra ancho de banda. Requiere extender `scripts/optimize-images.js` para
  emitir `.webp` en vez de recomprimir PNG.
- Considerar self-hostear las fuentes de Google (Cormorant/EB Garamond/JetBrains) para
  eliminar el CSS render-blocking de `fonts.googleapis.com`.
