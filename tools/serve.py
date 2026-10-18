#!/usr/bin/env python3
"""Serves this folder for local work, like GitHub Pages would, but tells the
browser not to cache — so an edited module is picked up on reload.

    python3 tools/serve.py [port]      (default 8000)
"""
import http.server
import os
import sys


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


if __name__ == '__main__':
    os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    print(f'http://localhost:{port}/')
    http.server.ThreadingHTTPServer(('', port), NoCache).serve_forever()
