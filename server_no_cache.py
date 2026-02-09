#!/usr/bin/env python3
"""
Servidor HTTP simple con headers de no-cache para desarrollo.
Expone GET/POST /api/config para que la configuración (URLs de contacto, venta, etc.)
sea global: quien guarda en el admin actualiza config.json y todos los visitantes la ven.
"""
import http.server
import socketserver
import os
import json

CONFIG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'config.json')

def read_config():
    try:
        with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}

def write_config(data):
    with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

class NoCacheHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def send_json(self, data, status=200):
        body = json.dumps(data).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', len(body))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.rstrip('/') == '/api/config':
            data = read_config()
            self.send_json(data)
            return
        super().do_GET()

    def do_POST(self):
        if self.path.rstrip('/') == '/api/config':
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(content_length).decode('utf-8')
                payload = json.loads(body) if body else {}
            except (ValueError, json.JSONDecodeError):
                self.send_json({'ok': False, 'error': 'Invalid JSON'}, status=400)
                return
            current = read_config()
            for key in ('instagram', 'musica', 'whatsapp', 'email', 'mostrar_admin_footer',
                        'sinopsis', 'url_venta', 'venta_modo', 'venta_mensaje'):
                if key in payload:
                    current[key] = payload[key] if payload[key] is not None else ''
            write_config(current)
            self.send_json({'ok': True})
            return
        self.send_response(405)
        self.end_headers()

PORT = 8000

os.chdir(os.path.dirname(os.path.abspath(__file__)))

with socketserver.TCPServer(("", PORT), NoCacheHTTPRequestHandler) as httpd:
    print(f"🚀 Servidor iniciado en http://localhost:{PORT}")
    print(f"📁 Directorio: {os.getcwd()}")
    print("🔄 Sin caché - siempre carga la versión más reciente")
    print("⏹️  Presiona Ctrl+C para detener")
    httpd.serve_forever()
