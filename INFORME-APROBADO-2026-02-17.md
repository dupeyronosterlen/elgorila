# Informe de aprobado — El Gorila Boletaje

**Fecha:** 17 de febrero de 2026  
**Rama:** `deploy-clean`  
**Repositorio:** ElGorila-Boletaje (origin: github.com/dupeyronosterlen/elgorila.git)

---

## Resumen

Despliegue aprobado. Cambios subidos al remoto en dos commits.

---

## Commits desplegados

1. **d8d350a** — *Año 2026, temporada en curso, accesibilidad y rendimiento*
   - Footer y temporada: © 2026
   - CTA: «Temporada en curso» con `role="status"` para accesibilidad
   - Rendimiento: blur móvil 24px, sin `will-change` en imagen La Obra
   - `boletos.html`: script corregido `mian.js` → `main.js`

2. **a3c4370** — *Cartel informativo: imagen actualizada, móvil regenerado, caché v5*
   - Imagen del cartel informativo actualizada (1.png, 2.png)
   - Versiones móvil regeneradas: `img/CARTEL INFORMATIVO/mobile/1.webp`, `2.webp`
   - Cartel rotatorio 01.png y mobile/01.webp incluidos
   - Cache del cartel en `index.html`: `?v=4` → `?v=5` (recarga en navegadores)

---

## Archivos modificados (último push)

| Archivo | Cambio |
|--------|--------|
| `index.html` | Referencias cartel `?v=5` |
| `img/CARTEL INFORMATIVO/1.png` | Imagen actualizada |
| `img/CARTEL INFORMATIVO/2.png` | Imagen actualizada |
| `img/CARTEL INFORMATIVO/mobile/1.webp` | Regenerado desde 1.png |
| `img/CARTEL INFORMATIVO/mobile/2.webp` | Regenerado desde 2.png |
| `img/CARTEL ROTATORIO/01.png` | Incluido en commit |
| `img/CARTEL ROTATORIO/mobile/01.webp` | Incluido en commit |

*No se han subido archivos `.DS_Store` (ignorados).*

---

## Estado del remoto

- **Push:** `deploy-clean` → `origin/deploy-clean` (d8d350a..a3c4370)
- **Resultado:** OK

---

**Aprobado para producción.**  
Si el sitio está desplegado desde `deploy-clean`, los cambios ya están disponibles tras el siguiente despliegue desde el remoto.
