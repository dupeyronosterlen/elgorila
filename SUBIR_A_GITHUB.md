# Subir el sitio a GitHub / Notion (sin error de 25 MB)

## Qué se hizo

1. **Imágenes optimizadas**  
   Se ejecutó `node scripts/optimize-images.js`. Todas las imágenes en `img/` quedaron por debajo de 25 MB (por ejemplo, `img/37/4.png` pasó de 39 MB a 3.6 MB).

2. **Historial de Git limpio**  
   Los 27 archivos que fallaban al subir venían del **historial** (versiones antiguas en `.git/objects/`). Se creó una rama nueva **sin ese historial**, con un solo commit que tiene el estado actual del proyecto. En esa rama no hay ningún archivo > 25 MB.

3. **Rama lista para subir**  
   La rama se llama **`deploy-clean`**. Tiene un único commit: "Deploy: sitio optimizado, sin archivos >25 MB".

---

## Cómo subir (elegir una opción)

### Opción A: Subir la rama `deploy-clean` y usarla como principal

```bash
git push -u origin deploy-clean
```

Luego en GitHub (o donde conectes Notion):
- Ve a **Settings** → **Branches** y pon **Default branch** = `deploy-clean`,  
  **o**
- Conecta Notion / Cloudflare Pages a la rama `deploy-clean`.

### Opción B: Sustituir tu rama actual (`2026-01-28-sfkr`) por el contenido limpio

Si quieres seguir usando el nombre de rama `2026-01-28-sfkr`:

```bash
git branch -D 2026-01-28-sfkr
git branch -m 2026-01-28-sfkr
git push -f origin 2026-01-28-sfkr
```

**Nota:** `git push -f` reescribe el historial en el remoto. Si alguien más clona el repo, tendrá que hacer `git fetch` y `git reset --hard origin/2026-01-28-sfkr`.

### Opción C: Sustituir `main` por el contenido limpio

Si en GitHub tu rama principal es `main`:

```bash
git branch -D main
git branch -m main
git push -f origin main
```

---

## Resumen

- Estás en la rama **`deploy-clean`** con un solo commit.
- Ese commit incluye todo el proyecto actual; **ningún archivo supera 25 MB**.
- Solo tienes que hacer **push** de esta rama (Opción A, B o C) para que GitHub/Notion acepte la subida sin el error de los 27 archivos.
