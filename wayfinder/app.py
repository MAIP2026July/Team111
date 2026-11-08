"""Wayfinder AI MVP - HTTP server (stdlib). Run: python -m wayfinder.app  ->  http://localhost:8765"""
from __future__ import annotations

import base64
import json
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from .engine import Engine

STATIC = Path(__file__).parent / "static"
ENGINE: Engine | None = None


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):  # quieter logs
        sys.stderr.write("%s %s\n" % (self.command, self.path))

    def _send(self, code: int, payload, ctype: str = "application/json"):
        body = payload if isinstance(payload, bytes) else json.dumps(payload, default=str).encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _body(self) -> dict:
        n = int(self.headers.get("Content-Length") or 0)
        if n > 15 * 1024 * 1024:
            raise ValueError("Payload too large")
        return json.loads(self.rfile.read(n) or b"{}")

    def do_GET(self):
        u = urlparse(self.path)
        q = {k: v[0] for k, v in parse_qs(u.query).items()}
        e = ENGINE
        try:
            if u.path in ("/", "/index.html"):
                return self._send(200, (STATIC / "index.html").read_bytes(), "text/html; charset=utf-8")
            routes = {
                "/api/health": lambda: e.health(),
                "/api/docs": lambda: [d.to_dict() for d in sorted(e.docs.values(), key=lambda d: (d.type, d.id))],
                "/api/doc": lambda: e.docs[q["id"]].to_dict(full=True),
                "/api/flags": lambda: e.flags(),
                "/api/drafts": lambda: e.list_drafts(),
                "/api/draft": lambda: e.get_draft(int(q["id"])),
                "/api/gaps": lambda: e.gaps(),
                "/api/audit": lambda: {"events": e.audit_log(), "answers": e.recent_answers()},
            }
            if u.path in routes:
                return self._send(200, routes[u.path]())
            self._send(404, {"error": "not found"})
        except KeyError as ex:
            self._send(404, {"error": f"not found: {ex}"})
        except Exception as ex:  # noqa: BLE001
            self._send(400, {"error": str(ex)})

    def do_POST(self):
        e = ENGINE
        try:
            b = self._body()
            p = urlparse(self.path).path
            if p == "/api/ask":
                return self._send(200, e.ask(b["question"], b.get("worker", "anonymous")))
            if p == "/api/feedback":
                return self._send(200, e.feedback(int(b["query_id"]), b["rating"], b.get("reason", "")))
            if p == "/api/drafts":
                return self._send(200, e.create_draft(b["sop_id"], b.get("replaces"), b.get("actor", "L&D Owner")))
            if p == "/api/drafts/decide":
                return self._send(200, e.decide_draft(int(b["id"]), b.get("approver", ""), b["decision"], b.get("content")))
            if p == "/api/flags/resolve":
                return self._send(200, e.resolve_flag(b["flag_id"], b.get("actor", "L&D Owner"), b.get("status", "resolved")))
            if p == "/api/upload":
                return self._send(200, e.upload(b["filename"], base64.b64decode(b["content_b64"]), b.get("actor", "L&D Owner")))
            if p == "/api/upload/approve":
                return self._send(200, e.approve_upload(b["id"], b["approver"]))
            if p == "/api/gaps/task":
                return self._send(200, e.create_task(b["topic"], b["ids"], b.get("actor", "L&D Owner")))
            self._send(404, {"error": "not found"})
        except Exception as ex:  # noqa: BLE001
            self._send(400, {"error": str(ex)})


def main():
    global ENGINE
    ENGINE = Engine()
    port = int(os.environ.get("PORT", "8765"))
    print(f"Wayfinder AI MVP on http://localhost:{port}  (mode: {ENGINE.health()['mode']})")
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()


if __name__ == "__main__":
    main()
