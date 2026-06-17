# Automatización agencia — Make + Notion (El Gorila)

Guía para montar **2 escenarios** en Make (gratis o Core) que alimentan **2 bases Notion**.  
Sin datos personales (no email, no nombre, no teléfono).

**Credenciales:** pide a producción el archivo `CREDENCIALES-AGENCIA.local.txt` (solo URL + `REPORTE_TOKEN`).

---

## Paso 0 — Notion (15 min)

Crea un workspace o página **「El Gorila — Temporada 2026」** con 2 bases de datos.

### Base 1: `Ventas por canal` (tiempo real)

Importa `notion-ventas-canal.csv` (Notion → Import → CSV) o crea columnas:

| Columna Notion | Tipo | Origen Make |
|----------------|------|-------------|
| Fecha compra | Date | `fechaCompra` |
| Fecha función | Date | `fecha` |
| Función | Title o Text | `funcionNombre` |
| Teatro | Select | `teatroId` |
| Cantidad | Number | `cantidad` |
| Total MXN | Number | `total` |
| Canal | Select | `canal` |
| UTM source | Text | `utm_source` |
| UTM medium | Text | `utm_medium` |
| UTM campaign | Text | `utm_campaign` |
| Código cupón | Text | `codigo_cupon` |
| Método pago | Select | `metodo_pago` |
| Certificado | Text | `codigo` |
| Tipos resumen | Text | serializar `tipos_resumen` |

Vistas útiles: **Tabla por canal**, **Board por UTM campaign**, **Filtro por fecha función**.

### Base 2: `Resumen por función` (diario)

Importa `notion-resumen-funciones.csv`:

| Columna | Tipo | Origen Make |
|---------|------|-------------|
| Fecha función | Title (YYYY-MM-DD) | `fecha` del iterator |
| Nombre función | Text | `nombre` |
| Teatro | Select | clave del teatro |
| Aforo | Number | `aforo` |
| Vendidos | Number | `vendidos` |
| Disponibles | Number | `disponibles` |
| Ocupación % | Number | `ocupacion_pct` |
| Ingreso MXN | Number | `ingreso_total` |
| Check-ins | Number | `checkins` |
| Lista espera | Number | `lista_espera` |
| General / INAPAM / Estudiante / Maestro | Number | `por_tipo.*` |
| Actualizado | Date | `generado` del reporte |

---

## Escenario A — Webhook venta online (Make)

**Nombre:** `El Gorila — venta → Notion`  
**Dispara:** cada compra Stripe confirmada (solo web; taquilla no pasa por aquí aún).

### Módulos

1. **Webhooks → Custom webhook**  
   - Create a webhook → copia la URL (ej. `https://hook.eu1.make.com/abc…`)  
   - **Envía esa URL a producción** para que la suban a Cloudflare:
     ```bash
     echo "URL_DEL_WEBHOOK" | npx wrangler secret put MAKE_WEBHOOK_URL
     ```
   - Prueba con `ejemplo-venta-webhook.json` (Postman o curl):
     ```bash
     curl -X POST "URL_DEL_WEBHOOK" \
       -H "Content-Type: application/json" \
       -d @agencia/ejemplo-venta-webhook.json
     ```

2. **Notion → Create a database item** (base *Ventas por canal*)  
   Mapeo directo de campos del webhook (ver tabla arriba).  
   Para **Tipos resumen**: usa expresión Make  
   `join(mapKeys(1.tipos_resumen); (k; k + ":" + get(1.tipos_resumen; k)); ", ")`

3. *(Opcional)* **Slack / Email** — aviso si `total` > X o `canal` = cupón agencia.

### Operaciones Make

~2–3 ops por venta. Plan gratis ≈ 1.000 ops/mes → ~300–400 ventas/mes. Si se agota, desactiva avisos opcionales o sube a Core.

---

## Escenario B — Reporte diario 8:00 CDMX (Make)

**Nombre:** `El Gorila — reporte diario → Notion`

### Módulos

1. **Schedule → Every day 08:00** — timezone `America/Mexico_City`

2. **HTTP → Make a request**
   - URL: `https://elgorila-api.dupeyronosterlen.workers.dev/api/reporte`
   - Method: GET  
   - Headers: `Authorization: Bearer {REPORTE_TOKEN}` (del archivo de credenciales)

3. **Iterator** sobre teatros  
   - Array: `por_teatro` → en Make suele ser necesario un **Parse JSON** previo y luego iterar claves.  
   - Patrón simple: **Array aggregator** no; usa **Repeater** o módulo **JSON → Parse** y luego **Iterator** en `funciones` de `wilberto` (principal).

   Estructura JSON (resumen):
   ```json
   {
     "generado": "2026-06-17T19:25:57.956Z",
     "por_teatro": {
       "wilberto": {
         "funciones": [ { "fecha", "nombre", "aforo", "vendidos", ... } ]
       }
     }
   }
   ```

4. **Iterator** → `por_teatro.wilberto.funciones[]` (ruta según parseo Make)

5. **Notion → Update database item** (base *Resumen por función*)  
   - **Search / filter** por propiedad Title = `fecha` (YYYY-MM-DD)  
   - Si no existe → Create; si existe → Update (upsert manual con router)

6. *(Opcional)* Resumen al final: total global `totales.vendidos` e `ingreso_total`.

### Operaciones Make

~15–25 ops/día (una pasada). Muy dentro del plan gratis.

---

## Checklist entrega agencia → producción

- [ ] URL webhook escenario A copiada → producción ejecuta `wrangler secret put MAKE_WEBHOOK_URL`
- [ ] Escenario A probado con `ejemplo-venta-webhook.json` → fila en Notion
- [ ] Escenario B probado con Run once → filas actualizadas en Notion
- [ ] Escenarios **ON** y programación 8:00 CDMX activa
- [ ] Notion compartido con equipo (Editor o Commenter según rol)

---

## Qué NO incluye (temporada)

- Ventas **taquilla/efectivo** en webhook A (solo Stripe online). Taquilla sigue en admin; el reporte B sí incluye todas las ventas en ocupación/ingresos.
- Emails o nombres de compradores (por diseño).
- Agente IA autónomo (P-14 completo → post-temporada).

---

## Soporte técnico

- Payload venta: `agencia/ejemplo-venta-webhook.json`  
- Probar API reporte: `scripts/test-reporte-api.sh` (requiere token local)  
- Subir webhook: `scripts/set-make-webhook.sh`
