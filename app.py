from __future__ import annotations

import json
import os
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from models.chords import LEARNING_MODULES, random_prompt, recognize_chord


ROOT = Path(__file__).parent
STATIC_DIR = ROOT / "static"


class ChordQuestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(STATIC_DIR), **kwargs)

    def do_GET(self) -> None:
        parsed = urlparse(self.path)

        if parsed.path == "/api/modules":
            self._send_json(LEARNING_MODULES)
            return

        if parsed.path == "/api/recognize":
            query = parse_qs(parsed.query)
            raw_notes = query.get("notes", [""])[0]
            notes = [int(note) for note in raw_notes.split(",") if note.strip()]
            self._send_json({"chord": recognize_chord(notes)})
            return

        if parsed.path == "/api/prompt":
            query = parse_qs(parsed.query)
            categories = [
                category
                for category in query.get("categories", ["major"])[0].split(",")
                if category.strip()
            ]
            self._send_json({"prompt": random_prompt(categories)})
            return

        if parsed.path == "/":
            self.path = "/index.html"

        super().do_GET()

    def _send_json(self, payload: object, status: HTTPStatus = HTTPStatus.OK) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def run(host: str = "127.0.0.1", port: int = 8000) -> None:
    server = ThreadingHTTPServer((host, port), ChordQuestHandler)
    print(f"ChordQuest Python server running at http://{host}:{port}")
    server.serve_forever()


if __name__ == "__main__":
    run(
        host=os.environ.get("CHORDQUEST_HOST", "127.0.0.1"),
        port=int(os.environ.get("CHORDQUEST_PORT", "8000")),
    )
