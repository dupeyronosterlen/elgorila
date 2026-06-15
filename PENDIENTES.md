# PENDIENTES — El Gorila Boletaje

Actualizado: **2026-06-15**

---

## 🟢 Estado actual

**Venta pública ABIERTA** (`VENTA_PUBLICA_ABIERTA = true`):
- Portada → `boletos.html` · «Adquiere tus boletos»
- Stripe online + boletera efectivo operativos
- Resend verificado · emails operativos
- **Confirmación con QR visible** · compartir boleto por WhatsApp con imagen (desplegado 2026-06-15)

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

### Archivos tocados
`confirmacion.html`, `confirmacion.js`, `compartir-wa-boleto.js`, `compartir-boleto.js`, `generar-imagen-boleto.js`, `qr-boleto.js`, `enviar-boleto.js`, `enviar-boleto.html`, `boletos.html`, `boletera.html`, `gracias.html`, `compartir-boleto.html`, `worker/index.js`

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

---

## ✅ Hecho

| Área | Detalle |
|------|---------|
| Venta online | Abierta · Resend · QR · emails · confirmación |
| QR confirmación | Visible al instante + boletito exportable (2026-06-15) |
| WhatsApp boleto | Imagen PNG nativa; correo con auto-share `&wa=1` |
| Nombre comprador online | Checkout → KV → lista puerta boletera |
| Boletera taquilla | Venta efectivo, verificar, canje puerta |
| Post-función | Email batch, acta, cupones REGALO25/OTRA50/MANADA15 |
| Soporte confirmación | Botón flotante WhatsApp |
| Admin | Informes, reenvío, anular ventas manuales |

---

## Referencia rápida

| Recurso | URL / valor |
|---------|-------------|
| API | `https://elgorila-api.dupeyronosterlen.workers.dev` |
| Sitio | `https://elgorilateatro.com.mx` |
| Reporte agencia | `GET /api/reporte` + header `Authorization: Bearer {REPORTE_TOKEN}` |
| Admin | `admin.html` |
| Boletera | `boletera.html` |
