# Configurar la API de config en Render (Cloudflare + backend)

Para que el admin pueda cambiar links/redes desde el panel y que todos los visitantes vean los cambios (con la web en Cloudflare), la API debe estar en un servidor. Esta guía usa **Render** (gratis).

---

## 1. Qué hace la API

- **GET /api/config** → devuelve el JSON con Instagram, WhatsApp, email, URL venta, etc.
- **POST /api/config** → recibe un JSON y actualiza `config.json`.

La web en Cloudflare hará `fetch` a la URL de Render en lugar de `/api/config`.

---

## 2. Crear el servicio en Render

1. Entra en **[render.com](https://render.com)** e inicia sesión (con GitHub es más fácil).
2. **New → Web Service**.
3. Conecta tu **repositorio de GitHub** (el de El Gorila).
4. Configuración:
   - **Name:** `elgorila-config-api` (o el que quieras).
   - **Region:** el más cercano a tu audiencia.
   - **Branch:** la rama que usas (ej. `deploy-clean` o `main`).
   - **Root Directory:** dejar vacío (o la carpeta del proyecto si está en un monorepo).
   - **Runtime:** Python 3.
   - **Build Command:**  
     `pip install -r requirements.txt`  
     (Si no tienes `requirements.txt`, déjalo vacío; el servidor usa solo la librería estándar.)
   - **Start Command:**  
     `python server_no_cache.py`
   - **Plan:** Free.

5. En **Environment** (variables de entorno), no hace falta nada para lo básico. Si más adelante añades un token de seguridad, lo pones aquí.

6. **Create Web Service**. Render construye y despliega. Al terminar te da una URL como:  
   `https://elgorila-config-api.onrender.com`

---

## 3. Ajustar el servidor para Render

- Render asigna el **puerto** por la variable de entorno **PORT**. Tu `server_no_cache.py` debe usar ese puerto en producción. En el código actual suele estar fijo en 8000; hay que cambiarlo a algo como:
  ```python
  PORT = int(os.environ.get("PORT", 8000))
  ```
- Añadir **CORS** para que la web en Cloudflare pueda llamar a la API. En las respuestas de `/api/config` (GET y POST) incluir el header:
  ```http
  Access-Control-allow-Origin: *
  ```
  (O tu dominio de Cloudflare en lugar de `*` si quieres restringir.)

---

## 4. Cambios en la web (Cloudflare)

En tu repo, en los archivos que usan la API:

- **index.html**  
  Donde pone `fetch('/api/config')`, cambiar a:
  ```javascript
  fetch('https://TU-SERVICIO.onrender.com/api/config')
  ```

- **js/admin.js**  
  - En `syncConfigToServer()`: la URL del `fetch` debe ser  
    `https://TU-SERVICIO.onrender.com/api/config`
  - En `loadConfigFromServer()`: igual, usar esa URL en lugar de `'/api/config'`.

Recomendación: definir una sola variable al inicio (ej. `var API_CONFIG_URL = 'https://...';`) y usarla en los tres sitios, para no repetir la URL.

---

## 5. Después del deploy

- **Web en Cloudflare:** sube los cambios (index.html y admin.js con la nueva URL).
- **Admin:** al guardar Instagram, WhatsApp, email, etc., se envía el POST a Render y se actualiza `config.json` en el servidor.
- **Visitantes:** al cargar la página, el GET a Render devuelve la config actual; los botones y enlaces se muestran según lo configurado.

---

## 6. Notas

- **Plan Free de Render:** el servicio puede “dormirse” tras inactividad; la primera petición puede tardar unos segundos. Para uso bajo, suele ser suficiente.
- **Seguridad:** hoy el POST no tiene autenticación. Si quieres protegerlo, se puede añadir un token en el header y comprobarlo en el servidor (variable de entorno en Render).
- **config.json:** en Render el sistema de archivos puede ser efímero. Para que la config persista entre reinicios, Render permite **disco persistente** (en planes de pago) o guardar la config en una base de datos/servicio externo; para empezar, el archivo suele bastar.
