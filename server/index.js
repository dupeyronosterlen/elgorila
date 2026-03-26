/**
 * API de boletera EL GORILA - Stripe Checkout + inventario
 * Endpoints: disponibilidad, crear sesión Stripe, webhook
 */
import express from 'express';
import Stripe from 'stripe';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || '3001', 10);
const TOTAL_BOLETOS = 200;

// Cargar Stripe (en producción usar env vars)
const stripeSecret = process.env.STRIPE_SECRET_KEY || '';
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
const baseUrl = process.env.BASE_URL || 'http://localhost:5500'; // URL del frontend

const app = express();
const stripe = stripeSecret ? new Stripe(stripeSecret) : null;

// Carpeta de datos
const dataDir = join(__dirname, 'data');
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

const inventarioPath = join(dataDir, 'inventario.json');
const ventasPath = join(dataDir, 'ventas.json');

function leerInventario() {
  if (!existsSync(inventarioPath)) return {};
  try {
    return JSON.parse(readFileSync(inventarioPath, 'utf8'));
  } catch {
    return {};
  }
}

function guardarInventario(inv) {
  writeFileSync(inventarioPath, JSON.stringify(inv, null, 2), 'utf8');
}

function leerVentas() {
  if (!existsSync(ventasPath)) return [];
  try {
    return JSON.parse(readFileSync(ventasPath, 'utf8'));
  } catch {
    return [];
  }
}

function guardarVenta(venta) {
  const ventas = leerVentas();
  ventas.push(venta);
  writeFileSync(ventasPath, JSON.stringify(ventas, null, 2), 'utf8');
}

function obtenerVentaPorSessionId(sessionId) {
  return leerVentas().find(v => v.sessionId === sessionId);
}

// Inicializar inventario para una clave si no existe
function asegurarInventario(clave) {
  const inv = leerInventario();
  if (!inv[clave]) {
    inv[clave] = { total: TOTAL_BOLETOS, vendidos: 0 };
    guardarInventario(inv);
  }
  return inv[clave];
}

// CORS
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Webhook DEBE usar raw body (antes de express.json)
app.post('/api/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe || !stripeWebhookSecret) {
    return res.status(200).send('ok');
  }
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, stripeWebhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    if (obtenerVentaPorSessionId(session.id)) {
      return res.status(200).send('ok'); // Ya procesada (ej. por GET /api/venta)
    }
    const { clave, cantidad, fecha, numeroOrden } = session.metadata || {};
    if (!clave || !cantidad) {
      console.error('Metadata incompleta en webhook');
      return res.status(200).send('ok');
    }
    const qty = parseInt(cantidad, 10);
    const inv = leerInventario();
    asegurarInventario(clave);
    if (inv[clave].vendidos + qty > inv[clave].total) {
      console.warn(`Posible oversell: ${clave}`);
    }
    inv[clave].vendidos = (inv[clave].vendidos || 0) + qty;
    guardarInventario(inv);
    const venta = {
      sessionId: session.id,
      numeroOrden: numeroOrden || `ORD-${Date.now()}`,
      email: session.customer_email || session.customer_details?.email,
      clave,
      cantidad: qty,
      fecha,
      total: session.amount_total ? session.amount_total / 100 : 0,
      fechaCompra: new Date().toISOString(),
      estado: 'completada'
    };
    guardarVenta(venta);
    console.log(`Venta registrada: ${venta.numeroOrden} - ${venta.cantidad} boletos`);
  }
  res.status(200).send('ok');
});

app.use(express.json());

// GET /api/availability - disponibilidad por clave
app.get('/api/availability', (req, res) => {
  const inv = leerInventario();
  const result = {};
  for (const [clave, datos] of Object.entries(inv)) {
    result[clave] = Math.max(0, datos.total - (datos.vendidos || 0));
  }
  res.json(result);
});

// POST /api/create-checkout-session - crear sesión Stripe
app.post('/api/create-checkout-session', async (req, res) => {
  if (!stripe) {
    return res.status(503).json({
      error: 'Stripe no configurado',
      mensaje: 'Configura STRIPE_SECRET_KEY en las variables de entorno.'
    });
  }

  const { orden, email } = req.body;
  if (!orden || !email) {
    return res.status(400).json({ error: 'Faltan orden o email' });
  }

  const { clave, cantidad, total, fecha: fechaTexto, descuento, codigoDescuento } = orden;

  if (!clave || !cantidad || cantidad < 1 || cantidad > 10) {
    return res.status(400).json({ error: 'Datos de orden inválidos' });
  }

  // Cargo por servicio 5%
  const cargoServicio = (orden.subtotal || total) * 0.05;
  const totalFinal = (total || 0) + cargoServicio;
  const montoCentavos = Math.round(totalFinal * 100); // MXN centavos

  if (montoCentavos < 100) {
    return res.status(400).json({ error: 'Monto inválido' });
  }

  // Verificar disponibilidad
  const datosInv = asegurarInventario(clave);
  const disponible = datosInv.total - (datosInv.vendidos || 0);
  if (disponible < cantidad) {
    return res.status(409).json({
      error: 'Sin disponibilidad',
      mensaje: `Solo hay ${disponible} boletos disponibles para esta función.`
    });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'mxn',
          product_data: {
            name: `EL GORILA - ${fechaTexto || 'Función'}`,
            description: `${cantidad} boleto(s) - EL GORILA de Franz Kafka`,
            images: []
          },
          unit_amount: montoCentavos
        },
        quantity: 1
      }],
      mode: 'payment',
      customer_email: email,
      success_url: `${baseUrl}/confirmacion.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/checkout.html?cancelado=1`,
      metadata: {
        clave,
        cantidad: String(cantidad),
        fecha: fechaTexto || '',
        numeroOrden: `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
        descuento: String(descuento || 0),
        codigoDescuento: codigoDescuento || ''
      }
    });

    res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('Stripe error:', err);
    res.status(500).json({
      error: 'Error al crear sesión de pago',
      mensaje: err.message || 'Intenta de nuevo.'
    });
  }
});

// GET /api/venta/:sessionId - obtener venta (desde BD o Stripe si webhook aún no llegó)
app.get('/api/venta/:sessionId', async (req, res) => {
  let venta = obtenerVentaPorSessionId(req.params.sessionId);
  if (venta) return res.json(venta);

  // Si no está en BD, el webhook puede no haber llegado; verificar en Stripe
  if (!stripe) return res.status(404).json({ error: 'Venta no encontrada' });
  try {
    const session = await stripe.checkout.sessions.retrieve(req.params.sessionId);
    if (session.payment_status === 'paid' && session.metadata) {
      const { clave, cantidad, fecha, numeroOrden } = session.metadata;
      if (clave && cantidad) {
        const qty = parseInt(cantidad, 10);
        venta = {
          sessionId: session.id,
          numeroOrden: numeroOrden || `ORD-${Date.now()}`,
          email: session.customer_email || session.customer_details?.email,
          clave,
          cantidad: qty,
          fecha: fecha || '',
          total: session.amount_total ? session.amount_total / 100 : 0,
          fechaCompra: new Date().toISOString(),
          estado: 'completada'
        };
        // Guardar venta e inventario (el webhook hará lo mismo si llega después, pero es idempotente)
        asegurarInventario(clave);
        const inv = leerInventario();
        inv[clave].vendidos = (inv[clave].vendidos || 0) + qty;
        guardarInventario(inv);
        guardarVenta(venta);
        return res.json(venta);
      }
    }
  } catch (err) {
    console.error('Error al recuperar sesión:', err.message);
  }
  res.status(404).json({ error: 'Venta no encontrada' });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`API boletera escuchando en puerto ${PORT}`);
  if (!stripeSecret) {
    console.warn('STRIPE_SECRET_KEY no configurada - pagos deshabilitados');
  }
});
