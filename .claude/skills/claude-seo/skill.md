# claude-seo

Skill de análisis y mejora SEO para este proyecto web.

## Cuándo usar este skill

Úsalo cuando el usuario pida:
- Analizar el SEO de una página o de todo el sitio
- Mejorar títulos, meta descripciones, og tags
- Revisar estructura de headings (h1-h6)
- Verificar alt en imágenes
- Generar o mejorar datos estructurados (schema.org)
- Crear o revisar sitemap.xml y robots.txt
- Sugerir keywords o mejorar densidad de palabras clave
- Auditar Core Web Vitals en el HTML (lazy loading, tamaños de imagen, etc.)

## Contexto del proyecto

- **Sitio:** elgorilateatro.com.mx
- **Tipo:** Sitio de venta de boletos para espectáculo de teatro/comedia
- **Páginas principales:** index.html, boletos.html, checkout.html, confirmacion.html, gracias.html, verificar.html, admin.html, acomodadores.html, taquilla.html
- **Archivos estáticos:** css/, js/, img/, fonts/
- **Hosting:** Netlify (hay `_redirects` y `CNAME`)

## Protocolo de auditoría SEO

Al ejecutar una auditoría, revisar en este orden:

### 1. Meta tags esenciales
```
<title>          → único, 50-60 chars, keyword principal al inicio
<meta description> → única, 150-160 chars, llamada a la acción
<meta robots>    → index,follow (o noindex si es admin/taquilla)
<link canonical> → URL canónica absoluta
```

### 2. Open Graph & Twitter Cards
```
og:title, og:description, og:image (1200x630px), og:url, og:type
twitter:card, twitter:title, twitter:description, twitter:image
```

### 3. Estructura de headings
- Un solo `<h1>` por página con la keyword principal
- `<h2>` para secciones principales
- Sin saltar niveles (h1 → h3 sin h2)

### 4. Imágenes
- Todo `<img>` con `alt` descriptivo (no vacío, no "imagen")
- `loading="lazy"` en imágenes fuera del viewport inicial
- `width` y `height` definidos para evitar layout shift (CLS)

### 5. Datos estructurados (schema.org)
Para este sitio usar `Event` schema:
```json
{
  "@context": "https://schema.org",
  "@type": "Event",
  "name": "El Gorila: El Monólogo sobre la Domesticación del Hombre",
  "url": "https://elgorilateatro.com.mx",
  "image": "https://elgorilateatro.com.mx/img/...",
  "startDate": "...",
  "location": { "@type": "Place", "name": "...", "address": "..." },
  "offers": { "@type": "Offer", "url": "https://elgorilateatro.com.mx/boletos.html", "availability": "..." }
}
```

### 6. Rendimiento básico
- `<link rel="preload">` para fuentes e imagen hero
- `<link rel="preconnect">` para dominios externos (Stripe, Firebase, etc.)
- Minificación de CSS/JS si no está hecha

### 7. Páginas que NO deben indexarse
Agregar `<meta name="robots" content="noindex,nofollow">` en:
- admin.html
- taquilla.html
- acomodadores.html
- verificar.html (interno)
- checkout.html, confirmacion.html, gracias.html (flujo de pago)

### 8. robots.txt
Si no existe, crearlo en la raíz:
```
User-agent: *
Disallow: /admin.html
Disallow: /taquilla.html
Disallow: /acomodadores.html
Disallow: /verificar.html
Disallow: /checkout.html
Disallow: /confirmacion.html
Disallow: /gracias.html

Sitemap: https://elgorilateatro.com.mx/sitemap.xml
```

### 9. sitemap.xml
Solo incluir páginas indexables públicas:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://elgorilateatro.com.mx/</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://elgorilateatro.com.mx/boletos.html</loc>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
</urlset>
```

## Cómo reportar resultados

Usar este formato al auditar:

```
✅ OK        → cumple el criterio
⚠️  MEJORAR  → funciona pero se puede optimizar
❌ FALTA     → ausente o incorrecto, requiere acción
```

Terminar con un listado priorizado de cambios (impacto alto primero).
