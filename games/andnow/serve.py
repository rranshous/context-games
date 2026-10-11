# Serve the viewer to the LAN with caching off, so a reload always gets the latest build.
#   python3 serve.py [port]    (default 8765)
import http.server, sys

class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

http.server.ThreadingHTTPServer(('0.0.0.0', int(sys.argv[1]) if len(sys.argv) > 1 else 8765), NoCache).serve_forever()
