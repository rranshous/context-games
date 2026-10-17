# Serve the viewer to the LAN with caching off, so a reload always gets the latest build.
#   python3 serve.py [port]    (default 8765)
# /bakes.json lists the bakes in runs/bake (see src/bake.ts), for the viewer's runs list.
import glob, http.server, json, os, re, sys, time

def bakes():
    out = []
    num = lambda f: [int(s) if s.isdigit() else s for s in re.split(r'(\d+)', f)]  # (s2 before s13)
    for f in sorted(glob.glob('runs/bake/*/index.json'), key=num):
        try:
            with open(f) as fh: b = json.load(fh)
        except (OSError, ValueError): continue  # (mid-write: next time)
        marks = b.get('marks') or []
        if not marks: continue
        last = marks[-1]
        best = max(marks, key=lambda m: (m.get('biggest') or {}).get('cells', 0))
        age = time.time() - os.path.getmtime(f)
        # A run's own pace: the gap between its last two checkpoints (a crowded run takes
        # 15+ minutes per checkpoint), so a slow run isn't called stopped.
        d = os.path.dirname(f)
        try: gap = os.path.getmtime(f'{d}/{last["file"]}') - os.path.getmtime(f'{d}/{marks[-2]["file"]}') if len(marks) > 1 else 0
        except OSError: gap = 0
        out.append({
            'path': os.path.dirname(f), 'name': os.path.basename(os.path.dirname(f)), 'query': b['query'], 'rules': b.get('rules'),
            't': last['t'], 'alive': last['alive'], 'biggest': (last.get('biggest') or {}).get('cells', 0),
            'best': {'t': best['t'], 'cells': (best.get('biggest') or {}).get('cells', 0)},
            # live: still writing (the next checkpoint isn't overdue); else done or stopped
            'state': 'done' if b.get('done') else 'live' if age < max(600, 3 * gap) else 'stopped',
            'updated': int(age),
        })
    return out

class NoCache(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.split('?')[0] != '/bakes.json': return super().do_GET()
        body = json.dumps(bakes()).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

http.server.ThreadingHTTPServer(('0.0.0.0', int(sys.argv[1]) if len(sys.argv) > 1 else 8765), NoCache).serve_forever()
