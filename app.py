from __future__ import annotations

import json
import os
import re
import threading
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from models.chords import LEARNING_MODULES, random_prompt, recognize_chord
from models.players import PlayerStore, is_valid_player_name, normalize_player_key
from models.progress import ProgressStore


ROOT = Path(__file__).parent
TEMPLATE_DIR = ROOT / "template"
INDEX_TEMPLATE = TEMPLATE_DIR / "index.html"
STATIC_DIR = ROOT / "static"
DATA_DIR = ROOT / "data"
PLAYERS_FILE = DATA_DIR / "players.json"

RECOGNITION_MODES = ("held", "arpeggio")
ATTEMPT_KEY_PATTERN = re.compile(r"^[A-Za-z0-9_:.-]{1,80}$")
MAX_BODY_BYTES = 4096
MAX_ATTEMPT_POINTS = 1000  # headroom above the max session score per correct chord (100 * 7 speed)

# Chord mastery is tracked per player so each person's practice stats stay
# separate; solo/anonymous practice (no player picked) uses its own bucket
# and never touches the Chord League leaderboard.
SOLO_KEY = "__solo__"
PROGRESS_STORES: dict[str, ProgressStore] = {}
PROGRESS_LOCK = threading.Lock()

PLAYERS_LOCK = threading.Lock()


def _load_players() -> PlayerStore:
    """Load the Chord League roster persisted from a previous run.

    Returns:
        A PlayerStore built from data/players.json, or an empty PlayerStore
        if the file is missing, unreadable, or not valid JSON.
    """
    try:
        raw = json.loads(PLAYERS_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        raw = {}
    return PlayerStore.from_state(raw)


PLAYERS = _load_players()


def _persist_players() -> None:
    """Write the current Chord League roster to data/players.json.

    Writes to a temporary file and renames it into place so a crash or
    concurrent read never sees a half-written file. Persistence is
    best-effort: a failed write just means the leaderboard stays in-memory
    for the rest of this process's life, which is a fine degradation for a
    local practice tool rather than a hard failure.
    """
    try:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        tmp_path = PLAYERS_FILE.with_suffix(".json.tmp")
        tmp_path.write_text(json.dumps(PLAYERS.to_state(), ensure_ascii=False, indent=2), encoding="utf-8")
        tmp_path.replace(PLAYERS_FILE)
    except OSError:
        pass


def _progress_store(player: str | None) -> ProgressStore:
    """Look up (creating if needed) the mastery store for a player.

    Args:
        player: Display name of a Chord League player, or None/blank for
            solo practice, which always shares one store regardless of
            casing/accents.

    Returns:
        The ProgressStore for that player (or the shared solo store).
    """
    key = normalize_player_key(player) if isinstance(player, str) and player.strip() else SOLO_KEY
    return PROGRESS_STORES.setdefault(key, ProgressStore())


def _parse_notes(raw_notes: str) -> list[int]:
    """Parse a comma-separated list of MIDI note numbers from a query string.

    Args:
        raw_notes: Raw "notes" query value, e.g. "60,64,67".

    Returns:
        The successfully parsed note numbers, in order. Blank and
        non-numeric tokens are silently skipped rather than raising, so a
        stray bad token doesn't fail the whole request.
    """
    notes: list[int] = []
    for token in raw_notes.split(","):
        token = token.strip()
        if not token:
            continue
        try:
            notes.append(int(token))
        except ValueError:
            # Ignore stray, non-numeric tokens instead of failing the whole
            # request; the recognizer just treats them as absent.
            continue
    return notes


class ChordQuestError(Exception):
    """Raised for malformed client input; always reported as HTTP 400."""


class ChordQuestHandler(SimpleHTTPRequestHandler):
    """HTTP handler serving the ChordQuest page, its static assets under
    static/, and the JSON API under /api/.

    The page template lives in template/index.html, outside the static
    root, so it's served explicitly by do_GET rather than through
    SimpleHTTPRequestHandler's directory listing.
    """

    def __init__(self, *args, **kwargs):
        """Bind this handler's static file serving to the static/ directory.

        Args:
            *args: Positional arguments forwarded to
                SimpleHTTPRequestHandler.
            **kwargs: Keyword arguments forwarded to
                SimpleHTTPRequestHandler.
        """
        super().__init__(*args, directory=str(STATIC_DIR), **kwargs)

    def do_GET(self) -> None:
        """Route a GET request to a JSON API handler, the page template, or
        a static file under static/ (css/js/images), in that order."""
        parsed = urlparse(self.path)

        try:
            if parsed.path == "/api/modules":
                self._send_json(LEARNING_MODULES)
                return

            if parsed.path == "/api/recognize":
                query = parse_qs(parsed.query)
                notes = _parse_notes(query.get("notes", [""])[0])
                mode = query.get("mode", ["held"])[0]
                if mode not in RECOGNITION_MODES:
                    mode = "held"
                self._send_json({"chord": recognize_chord(notes, mode)})
                return

            if parsed.path == "/api/prompt":
                query = parse_qs(parsed.query)
                categories = [
                    category.strip()
                    for category in query.get("categories", ["major"])[0].split(",")
                    if category.strip()
                ]
                self._send_json({"prompt": random_prompt(categories)})
                return

            if parsed.path == "/api/stats":
                query = parse_qs(parsed.query)
                player = query.get("player", [None])[0]
                with PROGRESS_LOCK:
                    self._send_json(_progress_store(player).snapshot())
                return

            if parsed.path == "/api/leaderboard":
                with PLAYERS_LOCK:
                    self._send_json(PLAYERS.leaderboard())
                return
        except ChordQuestError as error:
            self._send_error(HTTPStatus.BAD_REQUEST, str(error))
            return
        except Exception:
            self._send_error(HTTPStatus.INTERNAL_SERVER_ERROR, "Unexpected server error")
            return

        if parsed.path in ("/", "/index.html"):
            self._send_file(INDEX_TEMPLATE, "text/html")
            return

        # Anything else (e.g. /css/styles.css, /js/app.js, /images/...) is a
        # static asset served straight from static/ by the base class.
        super().do_GET()

    def do_POST(self) -> None:
        """Route a POST request to the matching JSON API handler."""
        parsed = urlparse(self.path)

        try:
            if parsed.path == "/api/attempt":
                self._handle_attempt(self._read_json_body())
                return

            if parsed.path == "/api/stats/reset":
                query = parse_qs(parsed.query)
                player = query.get("player", [None])[0]
                with PROGRESS_LOCK:
                    store = _progress_store(player)
                    store.reset()
                    self._send_json(store.snapshot())
                return

            if parsed.path == "/api/players":
                self._handle_join(self._read_json_body())
                return

            self._send_error(HTTPStatus.NOT_FOUND, "Unknown endpoint")
        except ChordQuestError as error:
            self._send_error(HTTPStatus.BAD_REQUEST, str(error))
        except Exception:
            self._send_error(HTTPStatus.INTERNAL_SERVER_ERROR, "Unexpected server error")

    def _read_json_body(self) -> dict:
        """Read and parse the request body as a JSON object.

        Returns:
            The parsed JSON object.

        Raises:
            ChordQuestError: If the Content-Length header is missing,
                invalid, or oversized, or the body isn't valid JSON
                representing an object.
        """
        try:
            length = int(self.headers.get("Content-Length", 0) or 0)
        except ValueError:
            raise ChordQuestError("Invalid Content-Length header")

        if length <= 0 or length > MAX_BODY_BYTES:
            raise ChordQuestError("Missing or oversized request body")

        raw = self.rfile.read(length)
        try:
            payload = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            raise ChordQuestError("Invalid JSON body")

        if not isinstance(payload, dict):
            raise ChordQuestError("Expected a JSON object")

        return payload

    def _handle_join(self, payload: dict) -> None:
        """Handle POST /api/players: join or re-join the Chord League.

        Args:
            payload: Parsed JSON body; expects a "name" string and an
                optional "avatar" object (see models.players.sanitize_avatar
                for the trait whitelist — malformed/missing avatar fields
                just fall back to the default look).

        Writes:
            The player's summary (name, totals, avatar) as the JSON
            response.

        Raises:
            ChordQuestError: If "name" is missing or invalid.
        """
        name = payload.get("name")
        if not isinstance(name, str) or not is_valid_player_name(name):
            raise ChordQuestError("Invalid player name")

        # avatar is optional and sanitized against a fixed trait whitelist by
        # PlayerStore itself, so malformed/missing input just falls back to
        # the default avatar rather than erroring.
        avatar = payload.get("avatar")

        with PLAYERS_LOCK:
            PLAYERS.get_or_create(name, avatar=avatar)
            _persist_players()
            self._send_json(PLAYERS.summary(name))

    def _handle_attempt(self, payload: dict) -> None:
        """Handle POST /api/attempt: record one chord recognition attempt.

        Args:
            payload: Parsed JSON body; expects "key" (str), "correct"
                (bool), and optionally "response_ms" (number, default 0),
                "player" (str, omit for solo practice), and "points"
                (number, default 0, only applied when "player" is set and
                "correct" is true).

        Writes:
            The mastery snapshot for that player/solo scope as the JSON
            response.

        Raises:
            ChordQuestError: If any field is missing or has an invalid type
                or value.
        """
        key = payload.get("key")
        correct = payload.get("correct")
        response_ms = payload.get("response_ms", 0)
        player = payload.get("player")
        points = payload.get("points", 0)

        if not isinstance(key, str) or not ATTEMPT_KEY_PATTERN.match(key):
            raise ChordQuestError("Invalid or missing 'key'")
        if not isinstance(correct, bool):
            raise ChordQuestError("'correct' must be a boolean")
        if isinstance(response_ms, bool) or not isinstance(response_ms, (int, float)) or response_ms < 0:
            raise ChordQuestError("'response_ms' must be a non-negative number")
        if player is not None and (not isinstance(player, str) or not is_valid_player_name(player)):
            raise ChordQuestError("Invalid 'player'")
        if (
            isinstance(points, bool)
            or not isinstance(points, (int, float))
            or points < 0
            or points > MAX_ATTEMPT_POINTS
        ):
            raise ChordQuestError("'points' must be a non-negative number")

        with PROGRESS_LOCK:
            store = _progress_store(player)
            store.record_attempt(key, correct, int(response_ms))
            stats_snapshot = store.snapshot()

        if player:
            with PLAYERS_LOCK:
                PLAYERS.record_attempt(player, correct, int(points))
                _persist_players()

        self._send_json(stats_snapshot)

    def _send_file(self, path: Path, content_type: str) -> None:
        """Send a file's contents as the full HTTP response.

        Args:
            path: Filesystem path of the file to send.
            content_type: Value for the Content-Type response header.

        Writes:
            The file's bytes with a 200 status, or a 404 JSON error if the
            file can't be read.
        """
        try:
            body = path.read_bytes()
        except OSError:
            self._send_error(HTTPStatus.NOT_FOUND, "File not found")
            return

        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_json(self, payload: object, status: HTTPStatus = HTTPStatus.OK) -> None:
        """Send a value as a JSON HTTP response.

        Args:
            payload: A JSON-serializable value to send as the response body.
            status: HTTP status code to respond with.
        """
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_error(self, status: HTTPStatus, message: str) -> None:
        """Send a JSON error response of the form {"error": message}.

        Args:
            status: HTTP status code to respond with.
            message: Human-readable error description.
        """
        self._send_json({"error": message}, status=status)


def run(host: str = "127.0.0.1", port: int = 8000) -> None:
    """Start the ChordQuest HTTP server and block forever.

    Args:
        host: Interface to bind to.
        port: TCP port to listen on.
    """
    server = ThreadingHTTPServer((host, port), ChordQuestHandler)
    print(f"ChordQuest Python server running at http://{host}:{port}")
    server.serve_forever()


if __name__ == "__main__":
    run(
        host=os.environ.get("CHORDQUEST_HOST", "127.0.0.1"),
        port=int(os.environ.get("CHORDQUEST_PORT", "8000")),
    )
