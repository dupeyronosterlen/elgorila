# Protección contra abuso con Cloudflare

Este sitio está pensado para usarse detrás de **Cloudflare**. Para acercarse al 99% de protección frente a abuso (clic masivo, bots, sobresaturación) sin bloquear a usuarios normales o con uso torpe, configura lo siguiente en el dashboard de Cloudflare.

---

## 1. Rate limiting por IP

Limita cuántas peticiones puede hacer una misma IP en un periodo corto. Así se frena a quien recarga o hace clic masivamente desde la misma IP.

**Pasos (dashboard Cloudflare):**

1. Entra en **Security** → **WAF** (o **Rules** según tu plan).
2. Crea una **Custom rule** (o **Rate limiting rule** si está disponible).
3. Configura algo como:
   - **Nombre:** "Limitar peticiones por IP"
   - **Expresión (Expression):** `(http.request.uri.path contains "/")` o deja "All incoming requests".
   - **Acción:** "Block" o "Managed Challenge" (CAPTCHA/Turnstile).
   - **Rate limiting:**
     - Ejemplo: **60 requests per 1 minute** por IP (ajusta según tráfico: 60–120 req/min suele ser suficiente para uso normal).
     - Ventana: 1 minuto.
4. Guarda y activa la regla.

**Calibración:** Si usuarios legítimos reciben bloqueo o desafío, sube el límite (p. ej. 90 o 120 req/min). Si sigues viendo abuso, bájalo o reduce la ventana.

---

## 2. Bot Fight Mode / Super Bot Fight Mode

Ayuda a filtrar tráfico automatizado (bots) sin que tengas que tocar código.

**Pasos:**

1. Entra en **Security** → **Bots**.
2. Activa **Bot Fight Mode** (plan Free) o **Super Bot Fight Mode** (plan de pago).
3. Con Super Bot Fight Mode puedes elegir qué hacer con bots detectados (log, challenge, block).

Con esto Cloudflare aplica reglas propias para detectar y gestionar bots; no hace falta configurar nada más en la página.

---

## 3. Opcional: reglas WAF adicionales

Si tienes plan de pago:

- Puedes crear reglas que bloqueen o desafíen cuando haya **muchas peticiones al mismo recurso** (p. ej. la misma URL) en poco tiempo.
- En **Security** → **WAF** → **Custom rules** puedes usar expresiones como `count(*)` por URI o por IP para definir umbrales y acciones.

---

## 4. Resumen

| Capa | Dónde | Qué hace |
|------|--------|----------|
| Cliente | Index.html | Throttle de clics (umbral alto, enfriamiento corto, mensaje "Demasiados clics; espere un momento"). Reduce impacto de scripts simples. |
| Cloudflare | Rate limiting | Limita peticiones por IP (p. ej. 60–120/min). Frena sobresaturación y abuso desde una misma IP. |
| Cloudflare | Bot Fight Mode | Filtra tráfico automatizado. |

No conviene confiar solo en el cliente (un atacante puede desactivar JavaScript). La capa fuerte es Cloudflare; el throttle en la página mejora la experiencia y frena abusos básicos.

Documentación oficial:

- [Rate limiting](https://developers.cloudflare.com/waf/rate-limiting-rules/)
- [Bot Fight Mode](https://developers.cloudflare.com/bots/get-started/)
