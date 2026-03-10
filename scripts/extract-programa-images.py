#!/usr/bin/env python3
"""
Extrae imágenes base64 de programa/v1.html … v4.html a img/programa/
y reemplaza en el HTML por rutas a archivos. Así se eliminan líneas largas
que traban el editor.
"""
import base64
import re
import os

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROGRAMA_DIR = os.path.join(BASE, "programa")
IMG_DIR = os.path.join(BASE, "img", "programa")

# Patrones: capturan el data URL completo (una línea muy larga)
PAT_PORTADA = re.compile(
    r'(<img\s+class="portada-foto"\s+)src="(data:image/jpeg;base64,[^"]+)"',
    re.DOTALL
)
PAT_BIO = re.compile(
    r'(<img\s+class="bio-foto"\s+)src="(data:image/jpeg;base64,[^"]+)"',
    re.DOTALL
)

def extract_and_save_dataurl(dataurl, outpath):
    """Extrae el base64 del data URL y escribe el archivo."""
    if not dataurl.startswith("data:image/jpeg;base64,"):
        raise ValueError("Solo data:image/jpeg;base64 soportado")
    b64 = dataurl.split(",", 1)[1]
    raw = base64.b64decode(b64)
    with open(outpath, "wb") as f:
        f.write(raw)

def process_file(version):
    """Procesa programa/vN.html: extrae imágenes y actualiza HTML."""
    html_path = os.path.join(PROGRAMA_DIR, f"{version}.html")
    with open(html_path, "r", encoding="utf-8") as f:
        html = f.read()

    # Portada
    m_portada = PAT_PORTADA.search(html)
    if m_portada:
        prefix, dataurl = m_portada.group(1), m_portada.group(2)
        portada_path = os.path.join(IMG_DIR, f"portada-{version}.jpg")
        extract_and_save_dataurl(dataurl, portada_path)
        html = PAT_PORTADA.sub(
            f'{prefix}src="../img/programa/portada-{version}.jpg"',
            html,
            count=1
        )
        print(f"  portada -> img/programa/portada-{version}.jpg")
    else:
        print(f"  [v{version}] No se encontró portada-foto")

    # Bio
    m_bio = PAT_BIO.search(html)
    if m_bio:
        prefix, dataurl = m_bio.group(1), m_bio.group(2)
        bio_path = os.path.join(IMG_DIR, f"bio-{version}.jpg")
        extract_and_save_dataurl(dataurl, bio_path)
        html = PAT_BIO.sub(
            f'{prefix}src="../img/programa/bio-{version}.jpg"',
            html,
            count=1
        )
        print(f"  bio -> img/programa/bio-{version}.jpg")
    else:
        print(f"  [v{version}] No se encontró bio-foto")

    with open(html_path, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"  {version}.html actualizado.")

def main():
    os.makedirs(IMG_DIR, exist_ok=True)
    for v in ("v1", "v2", "v3", "v4"):
        print(f"Procesando {v}...")
        process_file(v)
    print("Listo. Imágenes en img/programa/; HTML sin base64.")

if __name__ == "__main__":
    main()
