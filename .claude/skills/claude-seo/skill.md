# claude-seo

Skill de análisis y mejora SEO para **El Gorila Boletaje** (elgorilateatro.com.mx).

## Cuándo usar este skill

Úsalo cuando el usuario pida:
- Analizar el SEO de una página o de todo el sitio
- Mejorar títulos, meta descripciones, og tags
- Revisar estructura de headings (h1–h6)
- Verificar `alt` en imágenes
- Generar o mejorar datos estructurados (schema.org)
- Crear o revisar `sitemap.xml`, `robots.txt`, `_redirects`, `_headers`
- Sugerir keywords o mejorar densidad de palabras clave
- Auditar rendimiento básico en HTML (lazy loading, preload, CLS)

## Contexto del proyecto

- **Sitio:** https://elgorilateatro.com.mx
- **Tipo:** Landing + funnel de boletos para monólogo teatral (temporada Wilberto Cantón, CDMX)
- **API:** Cloudflare Worker `elgorila-api` (no indexar)
- **Hosting:** GitHub Pages + Netlify-style `_redirects` / `_headers` / `CNAME`
- **Panel operativo único:** `admin.html` (ventas, boletera, verificar) — **no indexar**

### Mapa de páginas (2026-06)

| Rol | Archivos | Indexación |
|-----|----------|------------|
| **Público SEO** | `index.html`, `terminos.html` (+ slugs en `_redirects`) | index |
| **Press** | `presskit/presskit2026.html` (`/presskit` rewrite) | noindex vía `robots.txt` `/presskit/` |
| **Programa de mano** | `programa/v1.html` … `v5.html` (QR/email según canal) | index salvo `mano-v2.html` (noindex, impresión) |
| **Funnel compra** | `boletos.html` → checkout inline o `checkout.html` → `confirmacion.html` → `gracias.html` | **noindex** (CTA desde index) |
| **Post-compra / referidos** | `compartir-boleto.html`, `enviar-boleto.html`, `invitacion.html`, `cupon-invitado.html` | noindex |
| **Post-función** | `acta.html` (`?t=token`); legacy `/encuesta*` → 301 acta | noindex |
| **Staff** | `admin.html` | noindex |

### URLs legacy (301 en `_redirects`)

No crear páginas nuevas para estas rutas; redirigen a admin o acta:

- `/boletera`, `/verificar`, `/taquilla`, `/acomodadores` → `admin.html?view=…`
- `/admin-panel-v4` → `admin.html`
- `/encuesta`, `/encuesta.html` → `acta.html` (conserva `?t=`)

### Slugs amigables (200 rewrite → mismo contenido)

- `/el-gorila-el-monologo-sobre-la-domesticacion-del-hombre` → `index.html`
- `/terminos`, `/terminos-y-condiciones`, `/privacidad` → `terminos.html`
- `/presskit`, `/presskit2026` → `presskit/presskit2026.html`

## Protocolo de auditoría SEO

Revisar en este orden:

### 1. Meta tags esenciales

```
<title>            → único, ~50–60 chars, keyword principal al inicio
<meta description> → única, ~150–160 chars, CTA clara
<meta robots>      → index,follow solo en páginas públicas
<link rel="canonical"> → URL absoluta https://elgorilateatro.com.mx/…
```

### 2. Open Graph y Twitter Cards

En **`index.html`** (y páginas públicas que compartan en redes):

```
og:title, og:description, og:image (1200×630), og:url, og:type, og:locale
twitter:card (summary_large_image), twitter:title, twitter:description, twitter:image
```

Imagen OG principal del sitio: `img/programa/portada-v4.jpg` (también usada en wallet/social).

### 3. Estructura de headings

- Un solo `<h1>` por página con la keyword principal
- `<h2>` para secciones principales
- Sin saltar niveles (h1 → h3 sin h2)

### 4. Imágenes

- Todo `<img>` con `alt` descriptivo (no vacío, no genérico)
- `loading="lazy"` fuera del viewport inicial
- `width` / `height` o aspect-ratio cuando sea posible (CLS)
- Variantes móvil en `img/**/mobile/*.webp` vía `js/imagenes.js`

### 5. Datos estructurados (schema.org)

En **`index.html`**: `Event`, `Organization`, `FAQPage` (si aplica). Ejemplo Event:

```json
{
  "@context": "https://schema.org",
  "@type": "Event",
  "name": "El Gorila: El Monólogo sobre la Domesticación del Hombre",
  "url": "https://elgorilateatro.com.mx/",
  "image": "https://elgorilateatro.com.mx/img/programa/portada-v4.jpg",
  "startDate": "2026-07-08T20:30:00-06:00",
  "location": {
    "@type": "Place",
    "name": "Teatro Wilberto Cantón",
    "address": { "@type": "PostalAddress", "addressLocality": "Ciudad de México", "addressCountry": "MX" }
  },
  "offers": {
    "@type": "Offer",
    "url": "https://elgorilateatro.com.mx/boletos.html",
    "priceCurrency": "MXN",
    "availability": "https://schema.org/InStock"
  }
}
```

**Nota:** `boletos.html` está en `noindex`; el schema en index apunta ahí como CTA de compra — correcto para rich results sin indexar el checkout.

### 6. Rendimiento básico

- **Tailwind:** compilado en `css/tailwind.css` (`npm run build:css` tras cambiar clases en HTML/JS). **No usar** `cdn.tailwindcss.com` en producción.
- Fuentes de entrada: `css/tailwind-src.css`, config en `tailwind.config.js`.
- `<link rel="preload">` para fuentes WOFF2, `css/tailwind.css` e imagen hero (`portada-v4.jpg`).
- `<link rel="preconnect">` para Google Fonts; GTM/Pixel siguen en head (tracking).
- Tras editar clases Tailwind en funnel: `npm run build:css` y commitear `css/tailwind.css`.

### 7. Páginas que NO deben indexarse

Meta `noindex,nofollow` **y** refuerzo en `_headers` (`X-Robots-Tag`) donde exista:

- `admin.html` (incluye boletera + verificar embebidos)
- Funnel: `boletos.html`, `checkout.html`, `confirmacion.html`, `gracias.html`
- Operativas: `compartir-boleto.html`, `enviar-boleto.html`, `invitacion.html`, `cupon-invitado.html`, `acta.html`
- Legacy stub: `encuesta.html` (301 a acta en producción)

**No sugerir** recrear `boletera.html`, `verificar.html`, `taquilla.html` ni `acomodadores.html` — usar `admin.html` + `_redirects`.

### 8. robots.txt (estado actual)

Reflejar el archivo en raíz; no proponer indexar el funnel:

```
User-agent: *
Allow: /
Disallow: /admin.html
Disallow: /admin-panel-v4.html
Disallow: /checkout.html
Disallow: /confirmacion.html
Disallow: /gracias.html
Disallow: /boletos.html
Disallow: /invitacion.html
Disallow: /compartir-boleto.html
Disallow: /encuesta.html
Disallow: /enviar-boleto.html
Disallow: /cupon-invitado.html
Disallow: /acta.html
Disallow: /presskit/

Sitemap: https://elgorilateatro.com.mx/sitemap.xml
```

Mantener `Disallow: /admin-panel-v4.html` aunque ya no exista el archivo (URLs viejas en índice).

### 9. sitemap.xml

Solo URLs **indexables** y canónicas:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://elgorilateatro.com.mx/</loc><priority>1.0</priority></url>
  <url><loc>https://elgorilateatro.com.mx/terminos.html</loc><priority>0.5</priority></url>
  <url><loc>https://elgorilateatro.com.mx/programa/v2.html</loc><priority>0.4</priority></url>
  <!-- v1, v3, v4, v5 según checklist SEO-05 -->
</urlset>
```

**No incluir** `boletos.html` mientras siga en `Disallow`. Ver `sitemap.xml` en repo para lista completa.

### 10. Google Tag Manager (GTM-P4BDXRN9)

**Todas las páginas `.html` del sitio** (público, funnel, operativas, programas, redirects) llevan el snippet estándar en `<head>` + `<noscript>` tras abrir `<body>`.

Excepciones: `preview/` (mockups locales), `node_modules/`.

No quitar GTM de páginas `noindex` — el funnel (boletos, confirmación, acta, invitación) debe medirse en GA4 vía contenedor.

### 11. Cambios que requieren archivos extra

Si cambias rutas públicas, actualizar también cuando aplique:

- `_redirects` (301/200)
- `_headers` (X-Robots-Tag)
- `robots.txt`
- `sitemap.xml`
- `PENDIENTES.md` (decisiones de arquitectura)

## Cómo reportar resultados

```
✅ OK        → cumple el criterio
⚠️  MEJORAR  → funciona pero se puede optimizar
❌ FALTA     → ausente o incorrecto, requiere acción
```

Terminar con cambios priorizados (impacto alto primero). No proponer duplicar lógica de taquilla/verificar fuera de `admin.html`.
