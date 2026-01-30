#!/usr/bin/env python3
"""
Servidor HTTP simple con headers de no-cache para desarrollo
"""
import http.server
import socketserver
import os

class NoCacheHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Agregar headers de no-cache
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

PORT = 8000

os.chdir(os.path.dirname(os.path.abspath(__file__)))

with socketserver.TCPServer(("", PORT), NoCacheHTTPRequestHandler) as httpd:
    print(f"🚀 Servidor iniciado en http://localhost:{PORT}")
    print(f"📁 Directorio: {os.getcwd()}")
    print("🔄 Sin caché - siempre carga la versión más reciente")
    print("⏹️  Presiona Ctrl+C para detener")
    httpd.serve_forever()
