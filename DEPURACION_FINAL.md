# Depuración final – Index (landing EL GORILA)

## Cambios aplicados en esta pasada

1. **imagenes.js – cartel rotatorio**  
   Fallback en `onerror` usaba `cartelRotatorioActual` sin cero a la izquierda; la carpeta tiene `01.png`, `02.png`, etc. Ahora se usa `padStart(2, '0')` para que el fallback sea correcto.

2. **Index.html – LOGO DOS**  
   El `onerror` del logo del header apuntaba a `img/LOGO DOS/1.png`, que no existe. Cambiado a `img/LOGO DOS/2.png` (sí existe).

3. **Formulario “Dejar un mensaje”**  
   Añadidos `autocomplete="name"` y `autocomplete="email"` en los inputs para mejor UX y rellenado por el navegador.

4. **Meta para redes**  
   Añadidos `og:title`, `og:description` y `og:type` para que al compartir el enlace se vea bien en redes (Facebook, WhatsApp, etc.).

---

## Checklist de revisión (ya cubierto)

- [x] Un solo `id="main-content"` y enlace “Saltar al contenido”.
- [x] Imágenes críticas con `preload` (header, cartel, informativo).
- [x] Galería y secundarias con `loading="lazy"`.
- [x] Modal con `role="dialog"`, `aria-labelledby`, `aria-modal`, botón cerrar con `aria-label`.
- [x] Carrusel de comentarios con `aria-label` en el contenedor.
- [x] Botones de compra con mismo estilo (granate terciopelo).
- [x] FAQ sin “el día de la función”; horario taquilla con texto genérico.
- [x] Comentarios con citas reales/variadas; sin InterEscena; Dupeyron y El Universal conservados.

---

## Pendiente por ti (antes de cerrar o al publicar)

1. **WhatsApp**  
   En Index.html hay un comentario: reemplaza `5215512345678` por tu número real (código país + número, sin espacios) en el `href` del enlace de WhatsApp.

2. **Email**  
   `info@elgorilateatro.com.mx` está en contacto, footer y formulario (mailto). Cámbialo si usas otro correo.

3. **Horario de taquilla**  
   En el FAQ sigue: “Horario de taquilla: consulta en la página de la Nueva Carpa Geodésica o en redes.” Cuando tengas el horario concreto, sustituye esa frase por el texto real.

4. **Enlace a taquilla**  
   “Adquiere tus entradas” y “Compra en Taquilla” llevan a `#contacto`. Si la venta es en otra URL (p. ej. taquilla de la Carpa), cambia esos `href` por la URL definitiva.

5. **Cache en producción**  
   Ahora tienes `Cache-Control: no-store` para evitar caché durante desarrollo. En producción puedes relajarlo (p. ej. cachear CSS/JS/imágenes) según tu servidor o hosting.

---

## ¿Falta algo?

- **Página 404**  
  Si alguien entra a una ruta que no existe, no hay 404 personalizado. Opcional: añadir `404.html` y configurarlo en el servidor.

- **Enlace “Términos y Condiciones” / “Política de Privacidad”**  
  En el footer apuntan a `#faq`. Si quieres páginas propias, crea esos HTML y actualiza los enlaces.

- **og:image**  
  No hay `og:image`; al compartir, la red elegirá una imagen o ninguna. Si quieres controlarlo, añade algo como:  
  `<meta property="og:image" content="https://tudominio.com/img/LOGO/1.jpg"/>` (con tu URL real).

- **Foco en el modal**  
  Al abrir “Dejar un mensaje” no se mueve el foco al primer campo ni se devuelve al botón al cerrar. Mejora opcional de accesibilidad.

Con esto, la landing queda depurada y optimizada para cierre; lo que “falta” es sobre todo configuración tuya (teléfono, email, horario, enlaces) y mejoras opcionales (404, términos, og:image, foco en modal).
