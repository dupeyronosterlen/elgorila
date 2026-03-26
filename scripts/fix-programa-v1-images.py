#!/usr/bin/env python3
"""Reemplaza las imágenes base64 grandes en programa/v1.html por las de v2 (más ligeras)."""
import re

BASE = "programa"
v1_path = f"{BASE}/v1.html"
v2_path = f"{BASE}/v2.html"

# Solo el valor del atributo src (desde src=" hasta la siguiente ")
SRC_BASE64 = re.compile(r'src="(data:image/jpeg;base64,[^"]+)"')

def get_src_values(html, class_name):
    """Encuentra el src del img con esta clase."""
    pat = re.compile(
        r'<img class="' + re.escape(class_name) + r'"\s+src="(data:image/jpeg;base64,[^"]+)"'
    )
    m = pat.search(html)
    return m.group(1) if m else None

with open(v2_path, "r", encoding="utf-8") as f:
    v2 = f.read()

with open(v1_path, "r", encoding="utf-8") as f:
    v1 = f.read()

portada_src_v2 = get_src_values(v2, "portada-foto")
bio_src_v2 = get_src_values(v2, "bio-foto")
if not portada_src_v2 or not bio_src_v2:
    raise SystemExit("No se encontraron las dos imágenes en v2.html")

# En v1 reemplazar solo el src de cada img (portada primero, luego bio)
v1_new = re.sub(
    r'(<img class="portada-foto"\s+)src="data:image/jpeg;base64,[^"]+"',
    r'\1src="' + portada_src_v2 + '"',
    v1,
    count=1,
)
v1_new = re.sub(
    r'(<img class="bio-foto"\s+)src="data:image/jpeg;base64,[^"]+"',
    r'\1src="' + bio_src_v2 + '"',
    v1_new,
    count=1,
)

with open(v1_path, "w", encoding="utf-8") as f:
    f.write(v1_new)

print("v1.html actualizado: imágenes reemplazadas por versiones ligeras de v2.")
