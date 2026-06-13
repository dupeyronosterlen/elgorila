/**
 * Apple Wallet (.pkpass) y Google Wallet (Save to Wallet).
 * Secrets: ver CAPACIDAD-TEATRO.template.txt sección Wallet.
 */
import { SignJWT, importPKCS8 } from 'jose';

const SITE_ORIGIN = 'https://elgorilateatro.com.mx';
const ISSUER_NAME = 'EL GORILA';
const CLASS_SUFFIX = 'elgorila_boleto';
const WALLET_BG = '#0a0706';
const LOGO_URI = `${SITE_ORIGIN}/img/LOGO/1.jpg`;
const HERO_URI = `${SITE_ORIGIN}/img/programa/portada-v4.jpg`;

function localizedEs(value) {
  return { defaultValue: { language: 'es', value } };
}

function walletLogo() {
  return {
    sourceUri: { uri: LOGO_URI },
    contentDescription: localizedEs(ISSUER_NAME),
  };
}

function genericClassDefinition(issuerId) {
  return {
    id: `${issuerId}.${CLASS_SUFFIX}`,
    issuerName: ISSUER_NAME,
    hexBackgroundColor: WALLET_BG,
    logo: walletLogo(),
    heroImage: {
      sourceUri: { uri: HERO_URI },
      contentDescription: localizedEs('EL GORILA — Teatro'),
    },
    reviewStatus: 'UNDER_REVIEW',
  };
}

function safeWalletId(raw) {
  return (raw || '').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 64);
}

function folioPrincipal(venta) {
  const boletos = venta.boletos || [];
  if (boletos.length === 1 && boletos[0]?.folio) return boletos[0].folio;
  return boletos.map(b => b.folio).filter(Boolean).join(' · ') || null;
}

function qrCodigoWallet(venta, boletoIdx = null) {
  const boletos = venta.boletos || [];
  if (boletoIdx != null && boletos[boletoIdx]?.cert) return boletos[boletoIdx].cert;
  if (boletos.length === 1 && boletos[0]?.cert) return boletos[0].cert;
  return venta.certificado || venta.codigo || '';
}

function parseGoogleSa(env) {
  if (!env.GOOGLE_WALLET_SA_JSON) return null;
  try { return JSON.parse(env.GOOGLE_WALLET_SA_JSON); } catch { return null; }
}

function googleConfigured(env) {
  return !!(env.GOOGLE_WALLET_ISSUER_ID && parseGoogleSa(env)?.client_email && parseGoogleSa(env)?.private_key);
}

function appleConfigured(env) {
  return !!(env.APPLE_PASS_TYPE_ID && env.APPLE_TEAM_ID && env.APPLE_PASS_P12_BASE64 && env.APPLE_WWDR_PEM);
}

/** Google Wallet — enlace «Save to Google Wallet» (JWT). */
export async function googleWalletSaveUrl(venta, config, env, boletoIdx = null) {
  if (!googleConfigured(env)) return { ok: false, error: 'Google Wallet no configurado en el Worker.' };

  const sa       = parseGoogleSa(env);
  const issuerId = env.GOOGLE_WALLET_ISSUER_ID;
  const cert     = venta.certificado || venta.codigo;
  const qr       = qrCodigoWallet(venta, boletoIdx);
  const folio    = folioPrincipal(venta);
  const idx      = boletoIdx != null ? boletoIdx : (venta.boletos?.length === 1 ? 0 : null);
  const objectId = safeWalletId(idx != null ? `${cert}-${idx}` : cert);
  const classId  = `${issuerId}.${CLASS_SUFFIX}`;
  const fn       = venta.funcionNombre || venta.fecha || 'EL GORILA';

  const genericObject = {
    id: `${issuerId}.${objectId}`,
    classId,
    state: 'ACTIVE',
    hexBackgroundColor: WALLET_BG,
    logo: walletLogo(),
    cardTitle: localizedEs(ISSUER_NAME),
    header: localizedEs(fn),
    subheader: localizedEs(
      folio ? `Folio ${folio}` : (venta.cantidad === 1 ? '1 entrada' : `${venta.cantidad} entradas`),
    ),
    barcode: {
      type: 'QR_CODE',
      value: qr,
      alternateText: folio || cert,
    },
    textModulesData: [
      { id: 'venue', header: 'Teatro', body: config.venue || 'Teatro Wilberto Cantón' },
      { id: 'instrucciones', header: 'Entrada', body: 'Presenta este pase en puerta. Llega 30 min antes.' },
    ].concat(folio ? [{ id: 'folio', header: 'Folio taquilla', body: folio }] : []),
  };

  const pk = await importPKCS8(sa.private_key.replace(/\\n/g, '\n'), 'RS256');
  const now = Math.floor(Date.now() / 1000);
  const token = await new SignJWT({
    origins: ['elgorilateatro.com.mx'],
    typ: 'savetowallet',
    payload: {
      genericClasses: [genericClassDefinition(issuerId)],
      genericObjects: [genericObject],
    },
  })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(sa.client_email)
    .setAudience('google')
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(pk);

  return {
    ok: true,
    saveUrl: `https://pay.google.com/gp/v/save/${token}`,
  };
}

/** Apple Wallet — requiere certificados Pass Type ID (ver secrets). */
export async function appleWalletPkpass(venta, config, env, boletoIdx = null) {
  if (!appleConfigured(env)) {
    return { ok: false, error: 'Apple Wallet no configurado. Sube APPLE_PASS_* en Cloudflare Secrets.' };
  }
  // Firma .pkpass con node-forge requiere bundle adicional; placeholder hasta cargar cert P12.
  return {
    ok: false,
    error: 'Apple Wallet: falta activar firma pkpass. Configura secrets APPLE_* y despliega worker/wallet-apple.js.',
    configured: true,
  };
}

export function walletStatus(env) {
  return {
    google: googleConfigured(env),
    apple:  appleConfigured(env),
  };
}
