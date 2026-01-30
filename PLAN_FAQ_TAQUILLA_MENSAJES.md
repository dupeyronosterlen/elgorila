# Plan: FAQ taquilla + Comentarios estáticos + Mensaje al correo

## 1. Cambios en el FAQ (taquilla, sin "el día de la función")

**Archivo:** `Index.html`

- En la respuesta **"¿Cómo compro boletos?"** (aprox. línea 730):
  - Quitar *"También puedes comprar directamente en taquilla el día de la función."*
  - Dejar que se pueda comprar **en taquilla** y añadir **horarios de taquilla** (placeholder para que reemplaces con los de la Carpa Geodésica en Google).
- Texto propuesto: *"Desde esta página puedes comprar en línea: al dar clic en «Adquiere tus entradas» o «Compra en Taquilla» serás redirigido a la taquilla de la **Nueva Carpa Geodésica**. También puedes comprar en taquilla. Horario de taquilla: [indicar según horario de la Carpa en Google]."*

---

## 2. Comentarios estáticos (solo lo que tú pones)

- **Qué es:** Un bloque de **comentarios/citas** que **solo tú editas** en el HTML: nombre de la persona + texto, copiados de redes (Google, Facebook, etc.). Ejemplo real: *"Una gran obra, no dudaría en volver."* — María G.
- **Qué no es:** No hay sistema para que el público escriba ni publique comentarios en la página.
- **Ubicación:** Sección entre Contacto y footer (o antes del formulario de mensaje).
- **Diseño:** Mismo estilo que el resto (bg-rich-dark/85, border-accent-gold/20): título tipo "Lo que dicen" y 2–4 tarjetas con nombre + cita. Tú pegas el texto real en el HTML.

---

## 3. "Dejar un mensaje" como modal (sin quitar nada de Contacto)

- **Conservar todo:** La sección de Contacto actual (Escribir a info@elgorilateatro.com.mx, WhatsApp) se mantiene tal cual. No se quita nada.
- **Cómo se abre:** Un enlace o botón tipo **"Dejar un mensaje"** que se ajuste al espacio (por ejemplo dentro de la sección Contacto, junto a Escríbenos y WhatsApp, o debajo). Al hacer clic:
  - **Fondo:** Todo lo de atrás se oscurece (overlay semitransparente sobre la página).
  - **Ventana:** Aparece una subventana (modal) centrada, con diseño acorde al sitio (bg-rich-dark, borde accent-gold, tipografía igual).
  - **Contenido del modal:** Formulario con **datos mínimos** para poder enviar el mensaje, por ejemplo:
    - Nombre (o cómo quieran firmar)
    - Mensaje
    - Opcional: email (para poder responderles)
  - **Cerrar:** Botón X o "Cerrar" y/o clic fuera del modal para cerrar.
- **Envío:** Al enviar, que el mensaje llegue a tu correo (mailto abriendo el cliente de correo con asunto y cuerpo, o Formspree si lo usas después).

Resumen: modal = fondo oscuro + ventana "Enviar un mensaje" con formulario mínimo, sin quitar correo ni WhatsApp.

---

## 4. Orden de tareas

1. Editar FAQ "¿Cómo compro boletos?": quitar "el día de la función", añadir horario de taquilla con placeholder.
2. Añadir sección de comentarios estáticos (nombre + cita, 2–4 ejemplos placeholder que tú sustituyes por textos reales de internet).
3. En la sección Contacto, añadir un trigger "Dejar un mensaje" y el modal (overlay oscuro + ventana con formulario mínimo que envíe al correo).

Cuando tengas el horario exacto de la taquilla, solo sustituir el placeholder en el FAQ.
