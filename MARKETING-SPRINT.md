# Marketing espejo — kit operativo (sprint 48h)

Actualizado: **2026-07-30**  
Sitio oficial: https://elgorilateatro.com.mx  
Temporada: **solo 9 sábados**, 18:00, 25 jul–19 sep 2026 · Teatro Wilberto Cantón  
Hook en hero (ejemplo vivo): pregunta filosófica tipo jaula / encajar  
CTA web: **Conseguir entradas** · Desde $400

**Estado:** web espejo + color escena. **Siguiente foco:** estrategia email (abajo). Video solo si hay material bueno; no forzar.

### Colorimetría de escena (tokens en `index.html`)

Muestreo de `portada-v1-hero`, `portada-v4`, GALERIA 03/04/07:

| Token | Hex | Origen en obra |
|-------|-----|----------------|
| `--scene-night` | `#120A07` | sombra cálida / jaula |
| `--scene-void` | `#0D0902` | fondo negro de escena |
| `--scene-blood` | `#F04818` | foco naranja-rojo (portada-v4) |
| `--scene-crimson` | `#900000` | telón / labios / sangre |
| `--scene-flesh` | `#C07848` | piel bajo luz |
| `--scene-earth` | `#604830` | madera / tierra |
| `--scene-skin` | `#F0D8C0` | highlight piel / camisa iluminada |

Uso actual: hero overlay, tagline, cita, barra CTA, botón de entradas.

---

## Peinado 2026 — ruido en página vs lo que falta afuera

### A. Qué SÍ trabaja (no tocar primero)
1. Hero + gancho filosófico + datos de función  
2. Sinopsis  
3. Testimonios de efecto  
4. Barra CTA + WhatsApp  
5. Escuelas/grupos + Contacto  
6. FAQ corto de compra (llegada, pago, boleto)

### B. Ruido / sobra en la página — ajuste 2026-07-30
- [x] Galería: solo 4 fotos  
- [x] FAQ: colapsado por defecto  
- [x] Sello 37: opacidad 50% (tamaños originales; no mover header)  
- [x] Flechas `indicador-mas`: quitadas  
- [x] Citas vacías: quitadas  
- [ ] Cuadros decorativos: **restaurados**  
- [ ] Scroll-indicator: **restaurado** (header)

### C. Qué falta en marketing 2026 (afuera de la web)
Hoy el comprador mira ~4 puntos antes de pagar (IG, Google, sitio, video). Ustedes tienen sitio fuerte; el resto está a medias.

| Canal 2026 | Ustedes | Gap |
|------------|---------|-----|
| Video corto (Reels/TikTok) ritmo fijo | Kit listo | No hay ejecución semanal |
| Email automatizado (abandono, pre-función, post-función, reactivación) | Resend transaccional | No hay lista de marketing ni drips |
| Escasez real visible (“quedan X”) | Copy “9 sábados” | Falta cupo vivo en UI/ads |
| UGC / reseñas frescas | Script puerta | No hay hábito post-función |
| Retargeting Meta | 3 textos listos | Campaña no armada |
| Marca en Google (`elgorila.mx`) | Defensa lateral | Dominio ajeno sigue vivo |
| Clip/tráiler en landing | Galería foto | Falta 15–30 s de escena en home |
| SMS / WA broadcast urgencia | WA soporte | No hay aviso “mañana función / últimos” |

### D. Prioridad práctica (acordada)
1. **Email de marketing** — estrategia abajo (usar Resend + lo ya armado)  
2. **Cortar ruido web** cuando toque  
3. **Retargeting Meta** (pixel ya existe)  
4. **Video / clip** solo con material bueno; si no, foto + texto  
5. **UGC sábado** (opcional)  
6. Defensa marca / Google Business vs `elgorila.mx`  

---

## Email marketing — estrategia (Resend + lo que ya existe)

### Qué YA está (no reinventar)

| Pieza | Dónde | Rol |
|-------|--------|-----|
| Boleto / confirmación | `enviarEmailsVenta` → Resend | Operación |
| Día de función | `enviarEmailsDiaFuncion` | Recordatorio pre-función |
| Post-función → acta | email nocturno + `acta.html?t=` | Experiencia + cupones (P-16 a medias) |
| Reenvío / OXXO | worker | Soporte |
| Agencia Make + Notion | `agencia/` | Reportes UTM/ocupación — **no** es mailing de venta |

Remitente: `boletos@elgorilateatro.com.mx` (dominio verificado en Resend).

### Qué FALTA (marketing)

1. **Lista de interesados** (correo de quien no compró aún)  
2. **1–2 mails de empuje** a esa lista  
3. **Cerrar P-16** para que el post-función pida quote/referido de verdad  

### Tres secuencias (mínimo viable)

#### Secuencia A — Interesado / no compró (NUEVA)
**Quién:** dejó email en un form “Avísame / quiero ir” o abandonó boletos sin pagar.  
**Objetivo:** primera compra.

| # | Cuándo | Asunto (ejemplo) | Cuerpo (idea) | CTA |
|---|--------|------------------|---------------|-----|
| A1 | Al dejar el correo | El Gorila · Wilberto Cantón | Fecha, hora, desde $400, una línea filosófica de la obra (no sermón) | Conseguir entradas |
| A2 | +3 días si no compró | Quedan sábados en julio–sep | Escasez de **fechas** (no “quedan asientos vacíos”). Testimonio corto real | Elegir función |
| A3 | Jueves antes del sábado más cercano | Este sábado 18:00 | Práctico: Wilberto, llegar 17:30 | Boletos |

**Captura (elegir una, simple):**
- Bloque en home o `boletos.html`: “¿Sin decidir fecha? Déjanos tu correo y te avisamos.”  
- O solo quienes llegaron a checkout y no pagaron (si más adelante trackean abandono).

**Privacidad:** checkbox opt-in; no mezclar con spam; mismo dominio Resend.

#### Secuencia B — Ya compró (MEJORAR lo existente)
**Quién:** tiene venta en KV + email.

| # | Cuándo | Estado hoy | Qué hacer |
|---|--------|------------|-----------|
| B1 | Al comprar | ✅ boleto QR | Mantener; tono claro |
| B2 | Día de función (mañana / mismo día) | ✅ `enviarEmailsDiaFuncion` | Revisar copy: llegar 17:30, taquilla, mapa Wilberto |
| B3 | Noche post-función | ✅ link acta | Completar P-16: encuesta corta + REGALO25 visible |

No hace falta inventar B1–B2; solo pulir texto y cerrar referidos en B3.

#### Secuencia C — Reactivación (DESPUÉS, con lista)
**Quién:** vio una función esta temporada o compró hace años (si tienen correos).  
**Mail único:** “Temporada 2026 · 9 sábados · desde $400” + 1 testimonio + link.  
No bombardear; 1 toque por mes máx.

### Tonos (reglas)
- Hablarle al **público**, no al productor.  
- Filosofía = 1 frase máx; el resto = fecha, lugar, precio, CTA.  
- Escasez = **sábados / temporada**, nunca “sala vacía”.  
- Sin video obligatorio en el mail; foto del cartel basta.

### Implementación técnica (orden)
1. **Copy** de A1–A3 + revisar B2/B3 (este doc).  
2. **Form captura** en sitio → KV o Resend Audience / lista.  
3. **Job/cron o Make:** enviar A2/A3 según fecha.  
4. **P-16** en `acta.html` para referidos.  
5. Agencia Notion: opcional tag `email_campaign` en UTM (`utm_medium=email`).

### Métricas a mirar
- A1→compra %  
- A2/A3 opens + clicks  
- B3: % que abre acta / usa cupón  
- No vanidad de “likes”; boletos.

### No hacer ahora
- Newsletter semanal genérica  
- Mail con “quedan 8 asientos” si la ocupación es baja  
- Depender de video en el correo  

---

## 1. Reels / TikTok / Shorts (ritmo realista — opcional si hay material)

Lo que importa es el **formato**, no el volumen: **gancho (0–3 s) → pregunta espejo → CTA fecha/boleto**.

**Ritmo recomendado ahora:** **3–5 piezas por semana** (no 15 de golpe). Abajo hay banco de 15 ideas para no inventar en frío.

| # | Gancho en pantalla | Pregunta / giro | CTA |
|---|--------------------|-----------------|-----|
| 1 | Close-up de Humberto en escena | ¿Cuánto de lo que haces es para encajar? | Sábados 18:00 · boletos en bio |
| 2 | Texto: “No es solo Kafka” | ¿Y si el simio eres tú? | Solo 9 funciones · elgorilateatro.com.mx |
| 3 | Clip risa del público | Teatro que incomoda… y también hace reír | Wilberto Cantón · compra anticipada |
| 4 | “37 años” como sello chico | 37 años preguntándotelo. Llegó tu turno. | Ven a mirarte |
| 5 | Lista “Esta obra es para ti si…” (3 bullets) | ¿Te reconociste en alguna? | Link boletos |
| 6 | Testimonio: “Reí… y también lloré” / Valencia / Bernardo | Eso es El Gorila | Próximo sábado 18:00 |
| 7 | Pasillo del teatro / butacas | Solo 9 sábados. ¿Cuál es el tuyo? | Compra en línea sin cargo de servicio |
| 8 | “Desde $400” en frame limpio | Clásico vivo. Sin relleno. | Credencial $280 · 5+ = 20% |
| 9 | Frase: “aprendió a encajar para sobrevivir” | ¿Tú también? | Ven a mirarte |
| 10 | UGC o foto de función (si hay) | Ellos ya se miraron. Tú? | Boletos en bio |
| 11 | Escuelas / aula | Obra que se discute al salir | WhatsApp grupos |
| 12 | Antes/después emocional (texto) | Entras por el monólogo. Sales pensando en tu vida. | Temporada jul–sep |
| 13 | Mapa / dirección Wilberto | José María Velasco 59 · San José Insurgentes | Llega 30 min antes |
| 14 | “Si ya la viste hace años…” | Mírala otra vez. Ya no eres el mismo. | Compra tu fecha |
| 15 | Countdown a función cercana | Quedan X sábados | Último empujón → boletos |

**Hashtags base:** `#ElGorila` `#TeatroCDMX` `#HumbertoDupeyron` `#WilbertoCanton` `#Monologo`  
**Bio / sticker:** `/boletos.html` + UTM `utm_source=tiktok|instagram` + `utm_campaign=espejo48`.

---

## 2. Pitch prensa (siguiente ronda, no reabrir esta semana)

Ya hubo envíos recientes. **No rehacer fichas ni re-pitchear a los mismos en llamas.**

**Pasos cuando toque otra ronda:**
1. Lista: a quién se escribió → sí / no / silencio.
2. Solo silencios o “mándame más”: reenvío con el lead de abajo.
3. Si publican: guardar URL → Stories + bio.
4. Guardar este pitch para próxima temporada.

**Asunto:** El Gorila regresa a Wilberto Cantón: 37 años preguntando cuánto de nosotros es “para encajar”

**Lead:**  
El monólogo *El Gorila*, interpretado por Humberto Dupeyrón desde 1989 a partir de Kafka, abre temporada 2026 en el Teatro Wilberto Cantón (SOGEM): **solo nueve sábados a las 18:00**, del 25 de julio al 19 de septiembre. La obra no vende nostalgia: confronta la domesticación cotidiana —obedecer, encajar, sobrevivir— con humor crudo y una pregunta que el público se lleva a casa.

**Ángulos:** (1) domesticación hoy (2) longevidad viva (3) temporada corta / 9 funciones (4) grupos y escuelas.

**Datos:** general $400 · credencial $280 · 5+ = 20% · boletos elgorilateatro.com.mx/boletos.html · prensa elgorilateatro@gmail.com / WA +52 56 7131 1191 · @elgorilateatro

---

## 3. Copy unificado (para FUTURO — no tocar Cartelera/Teatrando/TM ahora)

Fichas ya enviadas esta semana. **Congelar.** Usar esto en la **próxima** actualización de ficha o temporada:

> ¿Cuánto de lo que haces es para encajar? *El Gorila*, monólogo con Humberto Dupeyrón basado en Kafka, lleva 37 años en escena. Temporada 2026: solo 9 sábados a las 18:00 en Teatro Wilberto Cantón (25 jul–19 sep). General $400. Boletos: elgorilateatro.com.mx

**Bio Instagram (sí se puede cambiar ya, es de ustedes):**  
¿Cuánto de lo que haces es para encajar?  
El Gorila · Humberto Dupeyrón · 9 sábados · Wilberto Cantón  
Ven a mirarte → link en bio

---

## 4. Dos flujos distintos (no confundir)

| Flujo | Cuándo | Qué es |
|-------|--------|--------|
| **UGC en puerta** | Al salir del teatro | Pedir 10 s de video: “¿Con qué te quedas de El Gorila?” |
| **Mail post-función** | Email nocturno → `acta.html` | Encuesta / acta / cupones (P-16). Ahí también se puede pedir un quote escrito. |

**Script puerta:**  
Permiso: “¿Nos dejas 10 segundos? Solo una pregunta, sin spoiler.”  
Pregunta: “En una frase: ¿con qué te quedas de *El Gorila*?”  
Cierre en Stories: “Ellos ya se miraron. Próximo sábado 18:00 — link en bio.”

---

## 5. Dominio `elgorila.mx` — EN CURSO (prioridad)

### Hallazgos (2026-07-30)
- El dominio **sí responde** (HTTP 200). No redirige a elgorilateatro.com.mx.
- Hosting: WordPress + Cloudways + **Cloudflare** (NS: `aaron` / `paloma.ns.cloudflare.com`).
- Registrar: **Namecheap** · creado ~2025-03-15 · expira ~2027-03-15.
- Contenido actual: página de “remodelación” que menciona comprar en elgorilateatro.com.mx, pero el tráfico se queda en el dominio viejo (malo para marca/SEO).

### Checklist
- [ ] Contactar quien administra el dominio / Cloudflare / Namecheap
- [ ] Pedir **301** permanente: `elgorila.mx` + `www.elgorila.mx` → `https://elgorilateatro.com.mx/`
- [ ] Ideal: también transferir el dominio a la cuenta oficial (Namecheap o registrar propio)
- [ ] Si no hay 301: mínimo página intermedia solo “Sitio oficial” + un enlace (sin vender boletos ahí)
- [ ] Google Business Profile → URL = elgorilateatro.com.mx
- [ ] Bios IG / TikTok / WhatsApp Business → solo dominio oficial
- [ ] Search Console: consultas de marca “el gorila teatro”

### Mensaje listo para enviar (WhatsApp / mail)

```
Hola — te escribo por el dominio elgorila.mx.

El sitio oficial de boletos y temporada es https://elgorilateatro.com.mx
Hoy elgorila.mx sigue activo y confunde al público / Google.

¿Pueden configurar una redirección 301 de elgorila.mx y www.elgorila.mx
hacia https://elgorilateatro.com.mx/ ?

Si prefieren, también podemos hablar de transferir el dominio
a la cuenta de producción oficial.

Quedo atento — gracias.
```

En Cloudflare (si tienen acceso): Rules → Redirect Rules → `elgorila.mx/*` y `www.elgorila.mx/*` → `https://elgorilateatro.com.mx/$1` (301).

---

## 6. Copy retargeting Meta (visitó y no compró)

**Audiencia:** visitantes de elgorilateatro.com.mx (7–14 días) **sin** `purchase`.

| Variante | Primary text | Headline | Descripción | CTA |
|----------|--------------|----------|-------------|-----|
| A Espejo | ¿Cuánto de lo que haces es para encajar? El Gorila te lo pregunta en vivo. | Ven a mirarte | Solo 9 sábados · Wilberto Cantón | Comprar entradas |
| B Escasez | Solo 9 sábados a las 18:00. Temporada jul–sep. | Elige tu fecha | Desde $400 · sin cargo en taquilla propia | Comprar entradas |
| C Prueba social | “Reí mucho y también lloré.” — público real | Top de temporada | Humberto Dupeyrón · Kafka | Comprar entradas |

Creativo: `portada-v4` o clip corto. UTM: `utm_source=meta&utm_medium=retargeting&utm_campaign=espejo48`.

---

## 7. Qué ya quedó en la web (aprobado)

- Hook hero + cita + meta/OG espejo  
- Sección **Esta obra es para ti si…**  
- Testimonios FB nuevos + catarsis primero  
- CTA fijo **Ven a mirarte · Desde $400 · 9 sábados**  
- FAQ escasez / valor  
- Sección **Escuelas y grupos** + WhatsApp  

## 8. Cola después del dominio

- Bios IG con copy unificado (rápido, de ustedes)  
- Armar audiencia Meta + 3 creativos  
- UGC en puerta el próximo sábado  
- P-16 encuesta + cupones  
- TikTok Pixel (TRK-10)
