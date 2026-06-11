# Prompt para Claude — Reset de secretos + logs Cloudflare

Copia **todo el bloque entre las líneas** y pégalo en una conversación nueva con Claude (o en Cursor).  
Claude no puede entrar a tu Cloudflare por ti: te guiará paso a paso y te dará las contraseñas nuevas para que tú las pegues en el Dashboard.

---

## INICIO DEL PROMPT (copiar desde aquí)

Eres mi asistente técnico para el proyecto **El Gorila Teatro** (boletaje). Necesito **regenerar y documentar todas las credenciales** porque no recuerdo ninguna. Trabajo en el Dashboard de Cloudflare que ya tengo abierto.

### Contexto del proyecto

- **Worker:** `elgorila-api` en Cloudflare  
- **URL API:** `https://elgorila-api.dupeyronosterlen.workers.dev`  
- **Sitio:** `https://elgorilateatro.com.mx`  
- **Login admin/boletera:** `POST /api/admin/login` usa secretos `ADMIN_USER` + `ADMIN_PASS` (y opcional `_2`)  
- **Aún NO estamos en venta pública** — no tocar `index.html`

### Secretos actuales en Cloudflare (Variables and Secrets)

1. `ADMIN_USER` / `ADMIN_PASS`  
2. `ADMIN_USER_2` / `ADMIN_PASS_2` (opcional)  
3. `JWT_SECRET`  
4. `REPORTE_TOKEN`  
5. `RESEND_API_KEY`  
6. `STRIPE_SECRET_KEY`  
7. `STRIPE_WEBHOOK_SECRET`

### Lo que necesito que hagas

**A) Generar contraseñas nuevas (solo las que PODEMOS inventar)**

Genera valores seguros y únicos para:

| Secreto | Formato sugerido |
|---------|------------------|
| `ADMIN_USER` | texto corto, ej. `gorila-admin` o `osterlen` |
| `ADMIN_PASS` | 20+ caracteres, letras+números+símbolos |
| `ADMIN_USER_2` | opcional, ej. `taquilla-wilberto` |
| `ADMIN_PASS_2` | opcional, distinta a la principal |
| `JWT_SECRET` | 64 caracteres hex aleatorios |
| `REPORTE_TOKEN` | 32 caracteres hex aleatorios |

**NO inventes** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` ni `RESEND_API_KEY` — dime exactamente dónde copiarlos en Stripe y Resend.

**B) Entregarme una lista lista para guardar**

Formato tabla o bloque de texto para pegar en un archivo local `CREDENCIALES-ELGORILA.txt` en mi Mac (fuera de git). Incluye:

- Usuario y contraseña admin  
- JWT_SECRET y REPORTE_TOKEN  
- Instrucción de dónde pegar cada uno en Cloudflare (Edit en cada fila)  
- URLs de admin, boletera, verificar  
- Recordatorio: webhook Stripe = `https://elgorila-api.dupeyronosterlen.workers.dev/api/webhook`

**C) Guía clic a clic en Cloudflare Dashboard**

Para cada secreto que yo deba pegar:

1. Workers & Pages → **elgorila-api** → **Settings**  
2. **Variables and secrets** → lápiz **Edit** en cada fila  
3. Pegar valor nuevo → Save  

Orden recomendado de actualización (para no romper nada):

1. Primero `JWT_SECRET` + `ADMIN_USER` + `ADMIN_PASS` → probar login en admin.html  
2. Luego `REPORTE_TOKEN`  
3. Verificar que `STRIPE_*` y `RESEND_*` siguen válidos (no borrar si no tengo los valores nuevos en Stripe/Resend)  
4. Si falta Resend o Stripe, dime cómo obtener cada clave sin perder ventas

**D) Activar logs (foto 2 — Observability)**

En **elgorila-api → Settings → Observability**, dime exactamente qué activar **ahora** (pre-estreno):

- ¿Activar **Logs**? (sí/no y por qué)  
- ¿Dejar Traces/Exports desactivados al inicio?  
- Si hay botón **Enable** o toggle, descríbelo  

También dime si conviene usar en terminal `npx wrangler tail` el día del estreno para ver errores en vivo.

**E) Otras secciones de la foto 2**

- **Runtime:** ¿tocar Placement o Compatibility date? (debe quedar Jun 1, 2025)  
- **Build → Connect Git:** ¿conviene ahora o después de abrir venta?  
- **General:** confirmar que el nombre sigue `elgorila-api`

**F) Checklist final**

Después de que yo pegue todo, dame una lista de pruebas:

- [ ] Login `admin.html`  
- [ ] Login `boletera.html`  
- [ ] `node scripts/verify-sistema.js` (si tengo el repo)  
- [ ] Venta manual 1 boleto en boletera con mi correo  
- [ ] (Cuando abramos venta) 1 compra Stripe de prueba  

### Restricciones

- No subas contraseñas a GitHub ni al repositorio.  
- No modifiques `index.html` (venta cerrada al público).  
- Si un secreto de Stripe/Resend no se puede rotar sin romper producción, dilo claramente antes de pedirme que lo borre.

Empieza generando las contraseñas nuevas y la guía paso a paso para el Dashboard que tengo abierto.

## FIN DEL PROMPT (copiar hasta aquí)
