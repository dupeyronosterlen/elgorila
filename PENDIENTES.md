# PENDIENTES — El Gorila Boletaje

Archivo de tareas pendientes para el equipo técnico / IA.
Actualizar con fecha al resolver cada ítem.

---

## ⛔ ALERTA CRÍTICA — CONFLICTO DE ARQUITECTURA SIN COMMITEAR (2026-06-10)

**Hay DOS líneas de trabajo divergentes en el working tree, ninguna commiteada.** El último
commit (`cb71cd4`) es single-venue, pero el working tree tiene cambios mayores encima.

1. **Worker reescrito a MULTI-VENUE (v3.0)** con `teatroId`, secciones y rutas
   `/api/{teatro}/...`. Esto **contradice** la decisión previa ("NO multi-tenant; una copia
   por obra"). 
2. **El frontend NO usa las rutas nuevas** → si se despliega el Worker, el flujo de compra
   se ROMPE (404):
   - `main.js` → `/api/disponibilidad` ❌ (Worker espera `/api/gorila/disponibilidad`)
   - `checkout.js` → `/api/checkout` ❌ (`/api/gorila/checkout`)
   - `confirmacion.js` / `verificar.js` → `/api/venta/{id}` ❌ (`/api/gorila/venta/{id}`)
   - `admin.js` → ventas/fiscal/canjear ahora bajo `/api/admin/gorila/...`
   - Globales OK: `/api/health`, `/api/admin/login`, `/api/webhook`, `/api/reporte`
   ➡️ **NO DESPLEGAR el Worker hasta decidir dirección y alinear frontend↔rutas.**
3. ⚠️ **NO correr `git checkout` / `reset` / `stash`** sin guardar antes el working tree en
   una rama, o se pierde TODO el trabajo no commiteado (multi-venue + flujo inline + UI).

**DECISIÓN PENDIENTE (del dueño):**
- (A) Revertir a single-venue (lo acordado) — descarta el trabajo multi-venue.
- (B) Adoptar multi-venue — conservar Worker nuevo y actualizar TODO el frontend a
  `/api/{teatro}/...`.

**Seguridad ya aplicada al Worker actual (portable a cualquier dirección):** folio cripto
(`crypto.randomUUID`), `/api/venta` sin `sessionId`, rate-limit anti-enumeración sobre folios
no encontrados (`VENTA_404_MAX`). Pendiente (depende de dirección): mostrar boleto real en
`confirmacion.js`.

> Nota: el checklist de despliegue Cloudflare/Stripe (login, deploy, secrets REPORTE_TOKEN /
> MAKE_WEBHOOK_URL, Stripe live + webhook prod) sigue vigente — estaba en una versión previa
> de este archivo que fue reemplazada.

---

## 🔴 Alta prioridad

### P-01 — Guardar email en localStorage antes del redirect a Stripe
**Contexto:** En el nuevo flujo inline (boletos.html → panel de confirmación → Stripe), el email
se envía al Worker pero **no se guarda en `localStorage`** antes de redirigir.
Si `confirmacion.html` muestra el correo del comprador, lo encontrará vacío.

**Archivo:** `boletos.html` → función `procesarPagoInline()`
**Fix:** Agregar antes del `fetch` al Worker:
```js
orden.email = email;
localStorage.setItem('orden_compra', JSON.stringify(orden));
```
**Impacto si no se resuelve:** Confirmación de compra puede mostrar correo en blanco.

---

### P-02 — Verificar que `window.API_BASE` esté disponible en boletos.html
**Contexto:** `procesarPagoInline()` usa `window.API_BASE` para llamar al Worker.
`boletos.html` carga `js/config.js`, pero no está confirmado que este archivo
lea el `<meta name="api-base">` y asigne `window.API_BASE`.

**Archivo:** `js/config.js` (o `js/api-config.js`)
**Verificación:** Abrir boletos.html en el navegador, abrir consola, escribir `window.API_BASE`.
Debe devolver `'https://elgorila-api.dupeyronosterlen.workers.dev'`.
Si devuelve `undefined`, agregar `<script src="js/api-config.js"></script>` al script list
de `boletos.html`.
**Impacto si no se resuelve:** Pago siempre cae en modo simulado (sin Stripe real).

---

## 🟡 Media prioridad

### P-03 — Reutilizar checkout.html como "Taquilla de Enlace Directo"
**Contexto:** Con el nuevo flujo inline, `checkout.html` es una página huérfana.
En vez de eliminarla, puede convertirse en una **taquilla especializada de links directos**:
links prearmados para grupos, escuelas, empresas, medios, influencers, etc.

**Concepto:**
- Un link como `checkout.html?tipo=grupo&cantidad=10&descuento=15` llegaría ya
  pre-configurado con fecha, tipo y cantidad de boletos y un descuento especial.
- Útil para: ventas a grupos corporativos, escuelas, medios de comunicación,
  colaboraciones con influencers, boletos de prensa, funciones privadas.
- La IA puede generar estos links personalizados bajo demanda.

**Trabajo estimado:** 1–2 sesiones. Requiere:
1. Rediseñar checkout.html para leer query params y pre-poblar el carrito
2. Ajustar el Worker para aceptar descuentos especiales por parámetro (o código)
3. Definir los tipos de promo y sus reglas de negocio

---

### P-06 — Prueba extremo a extremo con Stripe real
**Contexto:** El flujo `boletos → panel inline → Stripe → confirmacion.html` fue
implementado pero no probado con el API real de producción.

**Verificar:**
1. El Worker acepta el campo `email` en el body de `/api/checkout` y lo pasa a Stripe
   como `customer_email` (mejora: Stripe pre-llena el correo en su formulario)
2. Stripe redirige correctamente a `confirmacion.html?session_id=...`
3. `confirmacion.html` procesa el `session_id` y muestra la info correcta
4. El caso de cancelación (`boletos.html?cancelado=1`) abre el panel inline como se espera

**Ambiente de prueba:** Usar claves Stripe en modo `test` antes de validar en producción.

---

## ✅ Resueltos

| ID | Descripción | Fecha |
|----|-------------|-------|
| — | Panel inline de confirmación/pago en boletos.html | Jun 9 2026 |
| — | Descuento Manada 29% + condición correcta | Jun 9 2026 |
| — | Fila unificada INAPAM/Estudiante/Maestro | Jun 9 2026 |
| — | Tipografía v4 en index.html (Cormorant + EB Garamond) | Jun 9 2026 |
| — | Cartel rotatorio móvil: fix min-width + umbrales de zoom | Jun 9 2026 |
| — | GA4 begin_checkout inline | Jun 9 2026 |
| — | URL limpia tras cancelación Stripe (?cancelado=1) | Jun 9 2026 |
