# Chequeo final antes del lanzamiento

Lista de optimizaciones y puntos a revisar antes de publicar **elgorilateatro.com.mx**.

---

## ✅ Ya aplicado en el proyecto

### SEO y redes
- [x] **Dominio** en meta y enlaces: `elgorilateatro.com.mx`
- [x] **Open Graph** en Index: `og:title`, `og:description`, `og:url`, `og:image`, `og:locale`
- [x] **Twitter Card**: `twitter:card`, `twitter:title`, `twitter:description`, `twitter:image`
- [x] **Canonical** en Index: `<link rel="canonical" href="https://elgorilateatro.com.mx/">`
- [x] **Meta description** en Index; descripción en admin y taquilla
- [x] **robots.txt** en la raíz (`Allow: /`)

### Rendimiento
- [x] Preload de imágenes críticas (logo, carteles) en Index
- [x] `loading="lazy"` en imágenes below-the-fold y modales
- [x] `decoding="async"` en imágenes
- [x] `preconnect` a Google Fonts en Index, admin y taquilla

### Accesibilidad
- [x] `aria-label` en botones y enlaces clave
- [x] Enlace "Saltar al contenido" en Index
- [x] Atributos `alt` en imágenes
- [x] `lang="es"` en `<html>`

### Seguridad (recordatorio)
- [ ] **Contraseñas por defecto**: En `js/auth.js` hay usuarios de prueba (`admin2024`, `taquilla2024`, etc.). **Antes de publicar**: entra al panel como admin y cambia todas las contraseñas o crea usuarios nuevos y elimina los de prueba.
- [ ] **HTTPS**: Servir el sitio siempre por HTTPS en producción.

---

## ⚠️ Pendiente o recomendado antes del lanzamiento

### 1. Seguridad (crítico)
| Tarea | Dónde | Acción |
|-------|--------|--------|
| Cambiar contraseñas por defecto | Panel admin → Mi cuenta / Usuarios | Cambiar o eliminar usuarios de prueba (`admin`, `gerente`, `taquilla1`, etc.). |
| Proteger ruta admin | Servidor | Opcional: HTTP Basic Auth o restricción por IP para `admin.html`. |
| HTTPS | Servidor/DNS | Certificado SSL activo y redirección HTTP → HTTPS. |

### 2. Servidor y caché
| Tarea | Acción |
|-------|--------|
| Headers de caché en producción | Ver `OPTIMIZACIONES_PRODUCCION.md`: configurar `Cache-Control` para HTML (ej. 5 min) y para imágenes/CSS/JS (ej. 1 día). |
| Quitar no-cache del HTML | En producción puedes cambiar en Index el comentario de caché o usar headers del servidor en lugar de `<meta http-equiv="Cache-Control">`. |

### 3. SEO opcional
| Tarea | Acción |
|-------|--------|
| Sitemap | Crear `sitemap.xml` con las URLs principales (Index, boletos, taquilla, etc.) y descomentar la línea `Sitemap` en `robots.txt`. |
| Google Search Console | Verificar el dominio y enviar el sitemap cuando exista. |

### 4. Consola y depuración
| Archivo | Qué hay | Recomendación |
|---------|---------|----------------|
| `js/mian.js` | Varios `console.log` (reserva, orden, redirección) | En producción: eliminar o envolver en `if (window.DEBUG)`. |
| `js/checkout.js`, `js/confirmacion.js` | `console.log` al generar certificados | Opcional: quitar o condicionar. |
| `js/verificar.js` | `console.log` de tiempo de verificación | Opcional: quitar. |
| `js/inventario.js` | `console.warn` en errores | Pueden dejarse; no exponen datos sensibles. |
| `js/auth.js` | `console.error` en errores de usuarios | Aceptable en producción para diagnóstico. |

Los `console.log` no rompen nada, pero en producción es mejor no dejar trazas innecesarias.

### 5. Páginas secundarias
| Página | Tiene | Recomendación |
|--------|--------|----------------|
| boletos.html | Título, favicon, fuentes | Opcional: añadir `meta description` y `canonical` si es URL pública. |
| checkout.html | Favicon, preconnect | Ok para flujo interno. |
| confirmacion.html | - | Revisar que título y mensajes sean los definitivos. |
| taquilla.html | description, favicon | Ok. |
| admin.html | - | No indexar (ya es lógico que sea área privada). |
| verificar.html, acomodadores.html | - | Revisar títulos y textos finales. |

### 6. Enlaces y contenido
| Revisar | Dónde |
|---------|--------|
| Enlace “Administrador” en footer | Index → `admin.html`. Decidir si se oculta en producción. |
| WhatsApp | Index: `https://wa.me/5215512037223`. Confirmar número final. |
| Email | `info@elgorilateatro.com.mx` ya está en todo el sitio. |
| Página del recinto | `nuevacarpageodesica.com.mx` en FAQ. Comprobar que siga vigente. |
| Google Maps | Enlace a Insurgentes Sur 2135. Verificar que la ubicación sea la correcta. |

### 7. Funcionalidad rápida
- [ ] Flujo completo: Index → Ventas/Boletos → Checkout → Confirmación (o redirección a Boletia) según tu flujo real.
- [ ] Taquilla: login, venta, códigos.
- [ ] Verificación de boletos (verificar.html).
- [ ] Modal 37 años: zoom en primera imagen (desktop).
- [ ] Formulario “Dejar un mensaje”: guardado en localStorage + mailto.
- [ ] Admin: login, permisos, mensajes de contacto, configuración (Instagram, música).

### 8. Errores 404
- No hay `404.html` en el proyecto. Si el servidor devuelve 404, se verá la página por defecto del servidor. Opcional: crear una página 404 amigable y configurarla en el servidor.

---

## Resumen de prioridades

1. **Obligatorio**: Cambiar contraseñas por defecto y usar HTTPS.
2. **Muy recomendable**: Caché en producción, revisar enlaces (WhatsApp, recinto, mapa).
3. **Recomendable**: Reducir/condicionar `console.log` en `mian.js` (y opcionalmente en checkout/confirmacion/verificar).
4. **Opcional**: Sitemap, Search Console, canonical en boletos si es URL pública, página 404, ocultar enlace “Administrador” en producción.

Si quieres, el siguiente paso puede ser: (a) limpiar los `console.log` de `mian.js`, o (b) esbozar un `sitemap.xml` con las URLs que uses en producción.
