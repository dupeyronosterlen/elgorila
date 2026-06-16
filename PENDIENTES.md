# PENDIENTES — El Gorila Boletaje

Actualizado: **2026-06-16**

---

## 🟢 Estado actual

**Venta pública ABIERTA** (`VENTA_PUBLICA_ABIERTA = true`):
- Portada → `boletos.html` · «Adquiere tus boletos»
- Stripe online + boletera efectivo operativos (panel único: `admin.html`)
- Resend verificado · emails operativos
- **Confirmación con QR visible** · compartir boleto por WhatsApp con imagen (desplegado 2026-06-15)

**Panel operativo único:** `admin.html` (ventas, boletera, verificar, auditoría).  
URLs legacy (`boletera.html`, `verificar.html`, `taquilla.html`, etc.) → 301 en `_redirects`.

---

## Sesión 2026-06-16 — auditoría y limpieza repo

### Qué se hizo
| Área | Cambio |
|------|--------|
| JS muerto | Eliminado `js/admin.js` (reemplazado por `admin-panel.js`; sin referencias) |
| Docs ops | `CAPACIDAD-TEATRO.template.txt` y `verify-sistema.js` apuntan a `admin.html` |
| Redirects (P-17) | `_redirects`: rutas sin `.html`, `/admin`, `/encuesta*` → `acta.html` |
| Legacy HTML (P-19) | Deletes en `b36be76` (`boletera`, `verificar`, `taquilla`, `acomodadores`, `admin-panel-v4`, `boletera-gate.js`) |
| Skill SEO (P-20) | `.claude/skills/claude-seo/skill.md` alineado a panel único + robots/sitemap actuales |
| Encuesta UI | **No se tocó** — ver P-16 abajo |

### Qué NO borrar (aunque parezca huérfano)
| Archivo | Motivo |
|---------|--------|
| `js/encuesta.js` + `css/encuesta.css` | UI de encuesta + tarjetas de cupón; desconectada de HTML, pendiente P-16 |
| `encuesta.html` | Redirect a `acta.html` (emails viejos / bookmarks) |
| `checkout.html` + `checkout.js` | Fallback si `boletos.html` no tiene panel inline |
| `cupon-invitado.html` | Normaliza `?c=` → `invitacion.html?de=` |

### Limpieza repo — pendiente (PRs pequeños, no urgente)

_Ninguno pendiente de la auditoría 2026-06-16._

**Decisión 2026-06-16:** `programa/v1`–`v5` y `mano-v2` **se mantienen** — cada versión se usa en distintos momentos/canales (QR impreso, email, gracias, promo). P-18 cancelado.

---

## 📋 SEO — checklist (auditoría 2026-06-16)

Ir en orden. Marcar ✅ al desplegar.

| # | Tarea | Archivo(s) | Estado |
|---|--------|------------|--------|
| SEO-01 | Imagen OG/Twitter → `portada-v4.jpg` + `og:image:alt` | `index.html` | ✅ |
| SEO-02 | Meta description ~130 chars (13 funciones jul–sep) | `index.html` | ✅ |
| SEO-03 | Schema `TheaterEvent` único + `price: 350` + fechas jul–sep | `index.html` | ✅ |
| SEO-04 | Open Graph en términos legales | `terminos.html` | ✅ |
| SEO-05 | `sitemap.xml`: home, terminos, programa v1–v5 + `lastmod` | `sitemap.xml` | ✅ |
| SEO-06 | `robots index,follow` explícito en programas v1–v5 | `programa/v*.html` | ✅ |
| SEO-07 | Skill SEO interno + este checklist | `.claude/skills/…`, `PENDIENTES.md` | ✅ |
| SEO-08 | Tailwind: CDN → `css/tailwind.css` compilado (`npm run build:css`) | `index`, funnel, `tailwind.config.js` | ✅ |
| SEO-10 | OG en programas v1–v5 + preload hero `portada-v4` | `programa/`, `index.html` | ✅ |
| SEO-09 | Validar en producción: Facebook Debugger + Rich Results Test | — | ⬜ post-deploy |
| SEO-11 | GTM en funnel + público; **excluido** `admin.html` | 20 páginas | ✅ |

**No incluido a propósito:** `mano-v2.html` (noindex impresión), funnel (`boletos`, `checkout`, …), `presskit/` (noindex).

---

## 🔴 P-16 — Encuesta post-función + cupones (no urgente)

**Contexto:** Al salir del teatro, el comprador recibe email nocturno → `acta.html?t=TOKEN`. El worker guarda respuestas en KV (`encuesta:TOKEN`) y devuelve cupones referido.

**Qué funciona hoy:**
- Email post-función → `acta.html` (worker `urlEncuesta`)
- Acta imprimible + cuestionario del reverso (`acta.js`)
- API `GET/POST …/encuesta/{token}` + cupones **REGALO25** (siempre), **OTRA50**, **MANADA15** (condicionales)
- Invitar −25% desde boleto ya comprado: `compartir-boleto.html` → `invitacion.html` → **INVITADO25** en `boletos.html`

**Qué quedó a medias (regresión al migrar encuesta → acta):**
1. `js/encuesta.js` tiene el wizard completo (NPS, volvería, compañía, tarjetas regalo con QR) pero **ningún HTML lo carga**.
2. `acta.js` solo envía `{ acta, nombrePortador, nombreRegalo }` — no las preguntas de encuesta → **OTRA50** y **MANADA15** casi nunca se desbloquean.
3. UI de regalos reducida a un enlace en `#regalo-link-box`, no las tarjetas de `encuesta.js`.

**Tarea cuando toque:**
- Integrar paso encuesta + pantalla de regalos en `acta.html` (reutilizar `encuesta.js` + `encuesta.css`), **sin cambiar worker**.
- Probar flujo: email dry-run → acta → encuesta → copiar enlace REGALO25 → compra en `boletos.html`.

---

## Sesión 2026-06-15 — resumen

### Problemas que había
1. En **confirmación** no aparecía el QR tras comprar (librería CDN rota + canvas fallaba).
2. **WhatsApp** abría solo texto o una subpágina, sin la imagen del boleto.
3. Compras **online** no guardaban **nombre** → en boletera salía el correo en lugar del nombre.

### Qué se hizo
| Área | Cambio |
|------|--------|
| QR / confirmación | CDN `qrcode@1.5.1`; QR visible al instante (api.qrserver); boletito completo cuando el canvas genera bien; fallback si falla |
| Canvas / export | CORS corregido en `generar-imagen-boleto.js` (logo/portada ya no “taint” el PNG) |
| WhatsApp | `compartir-wa-boleto.js`: comparte **imagen** vía menú nativo; en desktop descarga PNG + abre WA con instrucción de adjuntar |
| Correo | Botón WA con `enviar-boleto.html?c=…&wa=1` → auto-comparte imagen al abrir |
| Checkout online | Campo **nombre** en `boletos.html` → metadata Stripe → KV → lista de puerta en boletera |
| Soporte | Botón flotante WhatsApp en `confirmacion.html` (mismo número que index) |
| Deploy | Worker `elgorila-api` + GitHub Pages (`640c139` en `main`) |

### Notas operativas
- **Celular:** Compartir → WhatsApp → elige la imagen del boleto.
- **Desktop:** WhatsApp Web no adjunta por enlace; se descarga `el-gorila-boleto.png` y el usuario la adjunta manualmente.
- **Ventas de prueba anteriores** al 2026-06-15 pueden no tener nombre (solo email en lista puerta).
- Tras deploy, recarga forzada (Ctrl+Shift+R) si el navegador cachea JS viejo.

---

## 🔐 Accesos admin / boletera

**Credenciales actuales:** archivo local `CREDENCIALES-ACCESO.local.txt` (gitignored, en la raíz del repo).

**Rate-limit login:** desactivado en pruebas (`DISABLE_LOGIN_RATE_LIMIT=true` en `wrangler.toml`). **Antes de temporada en vivo** → poner `"false"` y `wrangler deploy`.

**Rotar claves:** `wrangler secret put ADMIN_PASS` (etc.) o volver a generar con el script del historial de chat.

---

## 🧹 Limpiar ventas de prueba (manual)

En **admin.html → Informes → Operaciones**, busca cada certificado de prueba y pulsa:
- **Reembolsar** — ventas Stripe (devuelve pago + libera cupo)
- **Anular venta** — ventas efectivo/taquilla (libera cupo sin Stripe)

Ejemplo conocido: `CERT-ORD-15F11890F6FC` (prueba99, $10).

Tras anular/reembolsar, el inventario vuelve a estar disponible. Las ventas quedan marcadas `reembolsada` en KV (historial), no se borran del disco.

---

## 🔴 Boletera — datos para agencia IA (P-14, sin terminar)

**Qué hay hoy:**
- Ventas taquilla → KV (`wilberto:venta:{sessionId}`) con nombre, email, teléfono, folios
- Ventas **online** → nombre + email en KV (desde checkout 2026-06-15)
- Lista visitantes en boletera (check-in por función; búsqueda nombre / email / folio / cert)
- Admin exporta CSV por función
- API agregada read-only: `GET /api/reporte` (Bearer `REPORTE_TOKEN`) — ocupación, ingresos, tipos; **sin PII**

**Qué falta (bloquea agente IA de agencia):**
1. **Modelo de datos unificado** — visitantes, check-ins, UTM, cupones y taquilla en un esquema consultable (hoy disperso en KV sin joins)
2. **Pipeline de procesamiento** — jobs que agreguen por campaña/cupón/función (no solo CSV manual)
3. **Contrato para el agente** — endpoint o export JSON con reglas claras (qué puede leer la IA, qué no — PII)
4. **Boletera UI** — captura completa al vender (campos obligatorios, validación) y sync en tiempo real con informes

Hasta P-14, la agencia usa admin CSV + `/api/reporte` (stats sin nombres/emails).

---

## 🟡 Después (no urgente)

| ID | Descripción |
|----|-------------|
| P-08 | Autoreservicio «No recibí mi boleto» |
| P-09 | Rol reclamos en KV — flujo real |
| P-10 | Septiembre 2026 — 5 funciones `activa: false` |
| P-11 | Rotar contraseñas admin/boletera |
| P-12 | Secrets: `REPORTE_TOKEN`, webhook Stripe prod |
| P-13 | Admin Sitio → KV a index.html |
| P-14 | Boletera → base procesada → agente IA agencia |
| P-15 | Hacer **obligatorio** el nombre en checkout online (hoy opcional) |
| P-16 | Encuesta post-función + cupones en `acta.html` (ver sección arriba) |

---

## ✅ Hecho

| Área | Detalle |
|------|---------|
| Venta online | Abierta · Resend · QR · emails · confirmación |
| QR confirmación | Visible al instante + boletito exportable (2026-06-15) |
| WhatsApp boleto | Imagen PNG nativa; correo con auto-share `&wa=1` |
| Nombre comprador online | Checkout → KV → lista puerta boletera |
| Boletera taquilla | Venta efectivo, verificar, canje puerta (en `admin.html`) |
| Post-función | Email batch → acta; backend cupones REGALO25/OTRA50/MANADA15 |
| Invitación −25% | `invitacion.html` + INVITADO25 desde compartir boleto |
| Soporte confirmación | Botón flotante WhatsApp |
| Admin | Informes, reenvío, anular ventas manuales |
| Limpieza repo (P-19/P-20) | `js/admin.js` fuera; docs ops; redirects; skill SEO interno |
| SEO on-page (SEO-01–10) | OG, schema, sitemap, Tailwind compilado, programas OG |

---

## Referencia rápida

| Recurso | URL / valor |
|---------|-------------|
| API | `https://elgorila-api.dupeyronosterlen.workers.dev` |
| Sitio | `https://elgorilateatro.com.mx` |
| Reporte agencia | `GET /api/reporte` + header `Authorization: Bearer {REPORTE_TOKEN}` |
| Admin | `admin.html` |
| Boletera | `admin.html?view=boletera` |
| Verificar puerta | `admin.html?view=verificar` |
