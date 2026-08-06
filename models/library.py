from __future__ import annotations

import json
import re
import secrets
from dataclasses import dataclass, field
from pathlib import Path
from typing import TypedDict

from models.chords import ChordPrompt, parse_progression

MAX_TITLE_LENGTH = 80
MAX_UPLOADED_SONGS = 200  # defensive cap so unattended uploads can't grow the library file without bound

DEFAULT_TEMPO_BPM = 90
MIN_TEMPO_BPM = 20
MAX_TEMPO_BPM = 300


class SongSummary(TypedDict):
    id: str
    title: str
    artist: str
    chord_count: int
    tempo_bpm: int


class SongDetail(SongSummary):
    prompts: list[ChordPrompt]


def is_valid_song_title(title: str) -> bool:
    """Check whether a string is acceptable as a song title.

    Args:
        title: The candidate title.

    Returns:
        True if, after trimming whitespace, the title is non-empty, at
        most MAX_TITLE_LENGTH characters, and contains no control
        characters.
    """
    stripped = title.strip()
    if not stripped or len(stripped) > MAX_TITLE_LENGTH:
        return False
    return all(char.isprintable() for char in stripped)


def sanitize_tempo(value: object) -> int:
    """Coerce arbitrary input into a valid tempo, falling back to the default.

    Args:
        value: Untrusted input, ideally an int/float beats-per-minute.

    Returns:
        `value` rounded to the nearest int and clamped to
        [MIN_TEMPO_BPM, MAX_TEMPO_BPM] if it's a finite number; otherwise
        DEFAULT_TEMPO_BPM.
    """
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return DEFAULT_TEMPO_BPM
    try:
        rounded = round(value)
    except (ValueError, OverflowError):
        return DEFAULT_TEMPO_BPM
    return max(MIN_TEMPO_BPM, min(MAX_TEMPO_BPM, rounded))


def _slugify(text: str) -> str:
    """Turn arbitrary text into a lowercase, hyphenated id fragment.

    Args:
        text: Any text, e.g. a song title.

    Returns:
        A slug containing only a-z, 0-9 and hyphens; "song" if that would
        otherwise be empty (e.g. the input was all punctuation/accents).
    """
    slug = re.sub(r"[^a-z0-9]+", "-", text.strip().lower()).strip("-")
    return slug or "song"


@dataclass
class Song:
    """One song's chord progression, stored as raw chord symbols so it can
    always be re-parsed (and so a change to the chord vocabulary in
    models.chords doesn't require migrating stored data). Each chord
    symbol may carry its own duration (see parse_chord_symbol); tempo_bpm
    is the song-level speed those durations are played at.
    """

    id: str
    title: str
    artist: str
    chords: list[str]
    tempo_bpm: int = DEFAULT_TEMPO_BPM

    @property
    def prompts(self) -> list[ChordPrompt]:
        """Parse this song's raw chord symbols into playable prompts.

        Returns:
            The successfully parsed ChordPrompts, in order (unparsable
            entries, if any, are silently dropped here — see
            parse_progression for per-entry error detail).
        """
        prompts, _errors = parse_progression(self.chords)
        return prompts

    def summary(self) -> SongSummary:
        """Build a lightweight summary of this song, e.g. for a picker list.

        Returns:
            A SongSummary (id, title, artist, chord_count, tempo_bpm).
        """
        return {
            "id": self.id,
            "title": self.title,
            "artist": self.artist,
            "chord_count": len(self.prompts),
            "tempo_bpm": self.tempo_bpm,
        }

    def detail(self) -> SongDetail:
        """Build the full playable representation of this song.

        Returns:
            A SongDetail: this song's summary plus its parsed prompts.
        """
        return {**self.summary(), "prompts": self.prompts}


class CuratedLibrary:
    """Read-only library of songs curated by the site owner as one JSON
    file per song (each with "title", optional "artist", optional
    "tempo_bpm", and a "chords" list of symbols) under a directory.
    Reloaded from disk on every call, so adding/editing a JSON file takes
    effect without restarting the server.
    """

    def __init__(self, library_dir: Path):
        """
        Args:
            library_dir: Directory to scan for "*.json" song files; each
                file's stem (filename without extension) becomes the song's
                id.
        """
        self._dir = library_dir

    def _load_all(self) -> dict[str, Song]:
        """Read and parse every song file in the library directory.

        Returns:
            Songs keyed by id (filename stem). Files that are missing,
            unreadable, not valid JSON, or missing a string "title"/list
            "chords" are silently skipped rather than raising, so one bad
            file doesn't take down the whole library.
        """
        songs: dict[str, Song] = {}
        if not self._dir.is_dir():
            return songs

        for path in sorted(self._dir.glob("*.json")):
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                continue
            if not isinstance(data, dict):
                continue

            title = data.get("title")
            chords = data.get("chords")
            if not isinstance(title, str) or not isinstance(chords, list):
                continue
            if not all(isinstance(chord, str) for chord in chords):
                continue

            artist = data.get("artist")
            song_id = path.stem
            songs[song_id] = Song(
                id=song_id,
                title=title,
                artist=artist if isinstance(artist, str) else "",
                chords=chords,
                tempo_bpm=sanitize_tempo(data.get("tempo_bpm")),
            )

        return songs

    def list_songs(self) -> list[SongSummary]:
        """List every song in the library, alphabetically by title.

        Returns:
            One SongSummary per valid song file.
        """
        return [song.summary() for song in sorted(self._load_all().values(), key=lambda song: song.title.casefold())]

    def get_song(self, song_id: str) -> SongDetail | None:
        """Look up one song's full playable detail.

        Args:
            song_id: A song id, as returned by list_songs().

        Returns:
            That song's SongDetail, or None if no such song exists.
        """
        song = self._load_all().get(song_id)
        return song.detail() if song else None


@dataclass
class UploadedLibrary:
    """In-memory library of songs auto-saved from successful CSV uploads,
    keyed by a generated id. Persistence to disk (if any) is the caller's
    responsibility — see to_state()/from_state().
    """

    songs: dict[str, Song] = field(default_factory=dict)

    def add_song(self, title: str, chords: list[str], tempo_bpm: object = DEFAULT_TEMPO_BPM) -> Song:
        """Save a new song, generating a unique id from its title.

        Args:
            title: Display title for the song (trimmed before storing).
            chords: Raw chord symbol strings, in playing order.
            tempo_bpm: Playback speed in beats per minute; sanitized (see
                sanitize_tempo) so invalid input falls back to the default
                rather than raising.

        Returns:
            The newly created Song.
        """
        song_id = f"{_slugify(title)}-{secrets.token_hex(3)}"
        song = Song(
            id=song_id,
            title=title.strip(),
            artist="",
            chords=chords,
            tempo_bpm=sanitize_tempo(tempo_bpm),
        )
        self.songs[song_id] = song

        # Evict the oldest entries (insertion order) once over the cap.
        while len(self.songs) > MAX_UPLOADED_SONGS:
            oldest_id = next(iter(self.songs))
            del self.songs[oldest_id]

        return song

    def list_songs(self) -> list[SongSummary]:
        """List every uploaded song, alphabetically by title.

        Returns:
            One SongSummary per stored song.
        """
        return [song.summary() for song in sorted(self.songs.values(), key=lambda song: song.title.casefold())]

    def get_song(self, song_id: str) -> SongDetail | None:
        """Look up one uploaded song's full playable detail.

        Args:
            song_id: A song id, as returned by add_song() or list_songs().

        Returns:
            That song's SongDetail, or None if no such song exists.
        """
        song = self.songs.get(song_id)
        return song.detail() if song else None

    def to_state(self) -> dict:
        """Build a plain-dict snapshot of every uploaded song, suitable for json.dumps.

        Returns:
            A dict keyed by song id, each value a plain dict of that
            song's title/artist/chords/tempo_bpm.
        """
        return {
            song_id: {
                "title": song.title,
                "artist": song.artist,
                "chords": song.chords,
                "tempo_bpm": song.tempo_bpm,
            }
            for song_id, song in self.songs.items()
        }

    @classmethod
    def from_state(cls, state: dict | None) -> "UploadedLibrary":
        """Rebuild an UploadedLibrary from a snapshot produced by to_state().

        Args:
            state: A dict as produced by to_state(), or None. Entries
                that aren't dicts, or are missing a string "title"/list of
                string "chords", are skipped rather than raising.

        Returns:
            A new UploadedLibrary containing every entry that parsed
            successfully.
        """
        library = cls()
        for song_id, data in (state or {}).items():
            if not isinstance(data, dict):
                continue
            title = data.get("title")
            chords = data.get("chords")
            if not isinstance(title, str) or not isinstance(chords, list):
                continue
            if not all(isinstance(chord, str) for chord in chords):
                continue
            artist = data.get("artist")
            library.songs[song_id] = Song(
                id=song_id,
                title=title,
                artist=artist if isinstance(artist, str) else "",
                chords=chords,
                tempo_bpm=sanitize_tempo(data.get("tempo_bpm")),
            )
        return library
