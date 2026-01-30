# Optimizaciones para producción

Recomendaciones al subir el sitio a un servidor real. No cambian el diseño ni la funcionalidad.

## Cache (headers HTTP)

En desarrollo el sitio usa `Cache-Control: no-cache` para ver cambios al instante. En producción conviene cachear recursos estáticos:

- **Páginas HTML**: `Cache-Control: max-age=300, must-revalidate` (5 min) o `max-age=3600` (1 h) si no actualizas a cada rato.
- **Imágenes, CSS, JS**: `Cache-Control: max-age=86400, public` (1 día) o más.

Ejemplo para Apache (`.htaccess` en la raíz):

```apache
# Cache para imágenes, fuentes y assets
<FilesMatch "\.(jpg|jpeg|png|gif|webp|ico|css|js|woff2?)$">
    Header set Cache-Control "max-age=86400, public"
</FilesMatch>
```

Ejemplo para Nginx:

```nginx
location ~* \.(jpg|jpeg|png|gif|webp|ico|css|js|woff2?)$ {
    expires 1d;
    add_header Cache-Control "public";
}
```

## Open Graph (compartir en redes)

En `index.html` ya están configurados `og:image` y `og:url` con el dominio **elgorilateatro.com.mx**:

- `og:url`: `https://elgorilateatro.com.mx/`
- `og:image`: `https://elgorilateatro.com.mx/img/LOGO/1.jpg`

Así Facebook, Twitter, WhatsApp, etc. mostrarán bien la imagen y la URL al compartir. Si cambias de dominio, actualiza esas dos meta en el `<head>` de index.html.

## Seguridad antes de subir

1. **Contraseñas por defecto**  
   En `js/auth.js` los usuarios de prueba tienen contraseñas como `admin2024`, `taquilla2024`, etc. **Antes de publicar**: entra al panel como admin, cambia las contraseñas de todos los usuarios o crea usuarios nuevos y elimina los de prueba.
2. **Panel de admin**  
   La ruta `admin.html` es pública. Si el servidor lo permite, considera protegerla con contraseña a nivel de servidor (por ejemplo, HTTP Basic Auth o restricción por IP) además del login de la aplicación.
3. **HTTPS**  
   Usa siempre HTTPS en producción para que las contraseñas y los datos no viajen en claro.

## Rendimiento ya aplicado en el código

- Precarga de imágenes críticas (logo, carteles) en Index.
- `loading="lazy"` en imágenes que están más abajo o en modales.
- `decoding="async"` en imágenes para no bloquear el hilo principal.
- `preconnect` a Google Fonts en Index, admin y taquilla.
- Meta description y Open Graph básico en Index; descripción en admin y taquilla.

## Accesibilidad ya aplicada

- `aria-label` en enlaces y botones clave (logo, navegación, modales).
- Enlace "Saltar al contenido" en Index.
- Atributos `alt` en imágenes.
