# PENDIENTES — El Gorila Boletaje

Actualizado: **2026-06-13**

---

## 🟢 Estado actual

**Venta pública ABIERTA** (`VENTA_PUBLICA_ABIERTA = true`):
- Portada → `boletos.html` · «Adquiere tus boletos»
- Stripe online + boletera efectivo operativos
- Resend verificado · emails operativos

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
- Lista visitantes en boletera (check-in por función)
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

---

## ✅ Hecho

| Área | Detalle |
|------|---------|
| Venta online | Abierta · Resend · QR · emails · confirmación |
| Boletera taquilla | Venta efectivo, verificar, canje puerta |
| Post-función | Email batch, acta, cupones REGALO25/OTRA50/MANADA15 |
| WhatsApp boleto | `enviar-boleto.html` |
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
