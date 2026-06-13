# PENDIENTES — El Gorila Boletaje

Actualizado: **2026-06-10** (venta pausada · plan boletera → QR → emails)

---

## 🛑 Estado actual (10 jun 2026)

**Venta pública CERRADA** hasta resolver post-compra:
- `index.html`: botón fijo **«Próximamente»** → Instagram `@elgorilateatro`
- `boletos.html`: redirige a Instagram (bypass: `?preview=1` para pruebas internas)
- `js/config.js`: `VENTA_PUBLICA_ABIERTA = false`
- **boletera.html / admin.html** siguen operativos para taquilla y operaciones

---

## 📐 Plan acordado (orden de trabajo)

> Referencia visual: emails Ticket Tailor (aviso admin con detalle de orden + tabla de ítems).  
> **Admin** = aviso completo tipo «Nueva orden». **Comprador** = solo boleto aprobado con QR que funcione.

### Fase 1 — Boletera como fuente de verdad (P-25)
1. Venta en **boletera.html** (efectivo) → Worker `generarBoletosVenta` + `persistirCertificadosKv`
2. Verificar en KV: `wilberto:cert:CERT-ORD-…` → `{ sessionId }` y cada `cert:CERT-…` → `{ sessionId, boletoIdx }`
3. **verificar.html** escanea QR → VÁLIDO → **canjear** en puerta (boletera lista visitantes)
4. Solo cuando esto sea 100% estable, replicar el mismo flujo en Stripe online

### Fase 2 — QR único desde el certificado (P-26)
**Regla:** el QR siempre se **calca** del código registrado en KV — nunca se inventa en el frontend.

| Contexto | Código QR | URL codificada |
|----------|-----------|----------------|
| 1 boleto | `boletos[0].cert` | `verificar.html?codigo=CERT-…` |
| 2+ boletos | `certificado` (CERT-ORD-…) | misma URL |

**Unificar** la lógica hoy duplicada en:
- `worker/index.js` → `urlQrBoleto(codigo)` (email)
- `js/confirmacion.js` → `codigoQrBoleto()`
- `js/compartir-boleto.js` → `qrCodigo`
- → nuevo **`js/qr-boleto.js`** + helper Worker `codigoQrOficial(venta)`

QR = imagen de `verificar.html?codigo={codigoKv}` (api.qrserver.com en email; canvas en web).

### Fase 3 — Dos emails distintos (P-27)

**A) Comprador — boleto aprobado (simple)**
- Función, venue, tipo × cantidad, total
- Certificado + QR (del certificado KV)
- Sin bloques extra (programa v3, WA embebido, etc.) — enlace opcional «Compartir boleto»
- Archivo: `htmlBoleto()` en `worker/index.js` — **simplificar**

**B) Admin — nueva orden (estilo Ticket Tailor, sin TT)**
- Asunto: `{CERT-ORD-…} : Nueva orden — EL GORILA`
- «Nueva orden para:» + función + fecha/hora
- Botón **Ver esta orden** → `admin.html` (detalle venta / informes)
- Tabla **Detalle de orden:**
  - Certificado / ID orden
  - Fecha y hora de compra
  - Nombre, email
  - Método de pago (STRIPE / efectivo)
  - Transaction ID Stripe (`payment_intent` o `session_id`) + enlace Stripe Dashboard si aplica
  - Tabla ítems: Tipo · Precio unit. · Cant. · Subtotal
  - **Total** MXN
  - Folios puerta (interno)
  - Cupón / referido si aplica
- Archivo: `htmlAvisoAdmin()` — **rediseñar**

### Fase 4 — Resend + confirmación web (P-20–P-23)
Tras Fase 1–2 funcionando en boletera, arreglar envío y confirmacion.html.

---

## 🔴 URGENTE — Post-compra roto (bloquea reapertura)

### P-25 — E2E boletera (efectivo) primero
**Checklist:**
1. `boletera.html` → venta 1 general efectivo
2. Copiar CERT-ORD-… impreso / pantalla
3. `verificar.html?codigo=CERT-ORD-…` → VÁLIDO
4. Canjear en boletera → YA CANJEADO en segundo intento
5. Admin informes → venta visible con folios

### P-26 — QR unificado desde certificado KV
Ver Fase 2 arriba. Bloquea emails y confirmación confiables.

### P-27 — Emails: admin detallado + comprador simple
Ver Fase 3 arriba. Referencia: screenshots Ticket Tailor (jun 2026).

### P-20 — Emails no llegan (comprador ni admin)
**Síntoma:** Tras pago Stripe OK, no llega boleto al comprador ni aviso admin.  
**Venta de prueba:** `CERT-ORD-15F11890F6FC` ($10, cupón prueba99).  
**Causa probable:** Resend — dominio `elgorilateatro.com.mx` pendiente de **Verified**.  
**Acciones:**
1. Resend → Domains → **Verified**
2. `curl -X POST "…/api/wilberto/venta/CERT-ORD-15F11890F6FC/enviar-boleto"`
3. Probar venta boletera → email admin nuevo formato
4. `wrangler tail` si falla tras Verified

### P-21 — QR no se muestra en confirmación
**Fix parcial:** `js/confirmacion.js` → `pintarQR()`. Falta deploy Pages + alinear con P-26.

### P-22 — Botón WhatsApp roto
**Archivos:** `confirmacion.js`, `compartir-boleto.html`. Probar tras P-26 (URL con certificado real).

### P-23 — Deploy frontend desincronizado
Push Pages; verificar `confirmacion.js` y `qr-boleto.js` en prod.

---

## 🟠 Reapertura venta (después de P-25–P-27 + P-20)

### P-24 — Reabrir venta pública
1. E2E boletera OK → E2E Stripe OK → emails OK
2. `VENTA_PUBLICA_ABIERTA = true` en `config.js` e `index.html`
3. Restaurar botón «Adquiere tus boletos»

---

## 🟡 Funnel / ops (después de reapertura)

| ID | Descripción |
|----|-------------|
| P-07 | Email post-función con invitación referida |
| P-08 | Autoreservicio «No recibí mi boleto» |
| P-09 | Rol reclamos en KV — flujo real |
| P-10 | Septiembre 2026 — 5 funciones `activa: false` |
| P-11 | Rotar contraseñas admin/boletera |
| P-12 | Secrets: `REPORTE_TOKEN`, webhook Stripe prod |
| P-13 | Admin Sitio → KV a index.html |

---

## ✅ Hecho (sesión anterior)

| Ítem | Detalle |
|------|---------|
| Venta pausada | Portada «Próximamente» → IG; boletos.html redirect |
| Panel reclamos | Detalle venta, reenviar/corregir email, CSV |
| Worker prod | Emails, `disponibles_total`, venta manual |
| Cupón prueba | `prueba99` — 1 general $10 MXN |
| Aforo 325 | `disponiblesAforoTotal()` frontend + Worker |
| Boletera | Reorganizada; permisos taquilla |
| Admin informes | Operaciones integradas |

---

## Referencia rápida

| Recurso | URL / valor |
|---------|-------------|
| API | `https://elgorila-api.dupeyronosterlen.workers.dev` |
| Sitio | `https://elgorilateatro.com.mx` |
| Admin | `admin.html` — usuario `gorila` |
| Boletera | `boletera.html` |
| Instagram | `https://www.instagram.com/elgorilateatro` |
| Resend | Dominio `elgorilateatro.com.mx` — solo **Sending** |

**Modelo KV certificado:**
```
wilberto:cert:CERT-ORD-XXXXXXXXXXXX  → { sessionId }
wilberto:cert:CERT-{uuid}            → { sessionId, boletoIdx }
wilberto:venta:{sessionId}           → venta JSON completa
```

