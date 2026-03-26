# Configuración Stripe - Boletera EL GORILA

## 1. Cuenta Stripe

1. Crea una cuenta en [stripe.com](https://stripe.com)
2. Activa tu cuenta (verificación de identidad, datos bancarios para recibir pagos)
3. En el Dashboard → Developers → API keys, copia:
   - **Secret key** (sk_test_... para pruebas, sk_live_... para producción)

## 2. Backend local

```bash
cd server
npm install
```

Crea un archivo `.env` (o exporta las variables):

```
STRIPE_SECRET_KEY=sk_test_xxxxx
BASE_URL=http://localhost:5500
```

Inicia el servidor:

```bash
npm run dev
```

El API corre en `http://localhost:3001`.

## 3. Frontend local

- Abre el sitio (Live Server, `python -m http.server 5500`, etc.) en el puerto que uses
- En `js/api-config.js`, si usas otro puerto para el frontend, `BASE_URL` en el backend debe coincidir
- Por defecto `api-config.js` usa `http://localhost:3001` cuando el host es localhost

## 4. Webhook (producción)

Para que Stripe notifique al backend cuando un pago se complete:

1. En Stripe Dashboard → Developers → Webhooks → Add endpoint
2. URL: `https://TU-API.onrender.com/api/webhook`
3. Eventos: `checkout.session.completed`
4. Copia el **Signing secret** (whsec_...)
5. En Render (o tu hosting): añade `STRIPE_WEBHOOK_SECRET=whsec_xxxxx`

## 5. Producción (Render)

1. Crea un Web Service en Render conectado al repo
2. Root directory: `server` (o el path donde está package.json del server)
3. Build: `npm install`
4. Start: `npm start`
5. Variables de entorno:
   - `STRIPE_SECRET_KEY`
   - `STRIPE_WEBHOOK_SECRET`
   - `BASE_URL` = URL de tu sitio (ej. `https://elgorila.com`)

## 6. URL del API en producción

En `js/api-config.js`, cambia la URL cuando no sea localhost:

```javascript
const API_BASE = window.API_BASE_URL || 
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3001'
    : 'https://tu-api.onrender.com');
```

O define `window.API_BASE_URL` antes de cargar los scripts (ej. desde config.json o un meta tag).

## 7. Flujo

1. Usuario elige fecha y cantidad en boletos.html
2. Va a checkout.html, ingresa email, "Continuar al pago"
3. Frontend llama `POST /api/create-checkout-session` → backend crea sesión Stripe
4. Usuario es redirigido a Stripe Checkout, paga
5. Stripe redirige a confirmacion.html?session_id=xxx
6. Stripe envía webhook a /api/webhook → backend actualiza inventario y guarda venta
7. confirmacion.html obtiene la venta con `GET /api/venta/:sessionId` y muestra éxito

## 8. Devoluciones

Desde el Dashboard de Stripe puedes hacer reembolsos (total o parcial) por cada pago. El inventario en el backend no se actualiza automáticamente; para eso habría que añadir un endpoint que procese `charge.refunded` en el webhook.
