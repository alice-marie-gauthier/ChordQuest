import json
import tempfile
import unittest
from pathlib import Path

from models.library import (
    DEFAULT_TEMPO_BPM,
    MAX_TEMPO_BPM,
    MIN_TEMPO_BPM,
    CuratedLibrary,
    UploadedLibrary,
    is_valid_song_title,
    sanitize_tempo,
)


class SongTitleValidationTests(unittest.TestCase):
    def test_rejects_empty_or_whitespace_only_titles(self):
        self.assertFalse(is_valid_song_title(""))
        self.assertFalse(is_valid_song_title("   "))

    def test_rejects_titles_over_the_length_limit(self):
        self.assertFalse(is_valid_song_title("x" * 81))
        self.assertTrue(is_valid_song_title("x" * 80))

    def test_rejects_control_characters(self):
        self.assertFalse(is_valid_song_title("Song\nTitle"))

    def test_accepts_accented_titles(self):
        self.assertTrue(is_valid_song_title("Prélude en Ut Majeur"))


class SanitizeTempoTests(unittest.TestCase):
    def test_accepts_a_valid_tempo(self):
        self.assertEqual(sanitize_tempo(120), 120)
        self.assertEqual(sanitize_tempo(96.4), 96)

    def test_falls_back_to_default_for_non_numeric_input(self):
        self.assertEqual(sanitize_tempo("fast"), DEFAULT_TEMPO_BPM)
        self.assertEqual(sanitize_tempo(None), DEFAULT_TEMPO_BPM)
        self.assertEqual(sanitize_tempo([120]), DEFAULT_TEMPO_BPM)

    def test_rejects_booleans_despite_being_ints_in_python(self):
        self.assertEqual(sanitize_tempo(True), DEFAULT_TEMPO_BPM)

    def test_clamps_out_of_range_values(self):
        self.assertEqual(sanitize_tempo(1), MIN_TEMPO_BPM)
        self.assertEqual(sanitize_tempo(10000), MAX_TEMPO_BPM)
        self.assertEqual(sanitize_tempo(-50), MIN_TEMPO_BPM)


class CuratedLibraryTests(unittest.TestCase):
    def _write_song(self, tmp_dir: Path, filename: str, data: dict) -> None:
        (tmp_dir / filename).write_text(json.dumps(data), encoding="utf-8")

    def test_lists_songs_from_json_files_sorted_by_title(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp_dir = Path(tmp)
            self._write_song(tmp_dir, "b.json", {"title": "Zebra Song", "chords": ["C", "G"]})
            self._write_song(tmp_dir, "a.json", {"title": "Apple Song", "chords": ["Am", "F"]})

            library = CuratedLibrary(tmp_dir)
            titles = [song["title"] for song in library.list_songs()]

            self.assertEqual(titles, ["Apple Song", "Zebra Song"])

    def test_song_id_is_the_filename_stem(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp_dir = Path(tmp)
            self._write_song(tmp_dir, "my-song.json", {"title": "My Song", "chords": ["C"]})

            library = CuratedLibrary(tmp_dir)
            [summary] = library.list_songs()

            self.assertEqual(summary["id"], "my-song")

    def test_get_song_returns_parsed_prompts(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp_dir = Path(tmp)
            self._write_song(tmp_dir, "song.json", {"title": "Song", "chords": ["C", "G", "Am", "F"]})

            library = CuratedLibrary(tmp_dir)
            detail = library.get_song("song")

            self.assertIsNotNone(detail)
            self.assertEqual([prompt["symbol"] for prompt in detail["prompts"]], ["C", "G", "Am", "F"])

    def test_get_song_returns_none_for_unknown_id(self):
        with tempfile.TemporaryDirectory() as tmp:
            library = CuratedLibrary(Path(tmp))
            self.assertIsNone(library.get_song("does-not-exist"))

    def test_ignores_malformed_or_invalid_song_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp_dir = Path(tmp)
            (tmp_dir / "not-json.json").write_text("{not valid json", encoding="utf-8")
            self._write_song(tmp_dir, "missing-chords.json", {"title": "No Chords"})
            self._write_song(tmp_dir, "missing-title.json", {"chords": ["C"]})
            self._write_song(tmp_dir, "ok.json", {"title": "OK Song", "chords": ["C"]})

            library = CuratedLibrary(tmp_dir)

            self.assertEqual([song["id"] for song in library.list_songs()], ["ok"])

    def test_missing_directory_returns_an_empty_library(self):
        library = CuratedLibrary(Path("this/directory/does/not/exist"))
        self.assertEqual(library.list_songs(), [])

    def test_chord_count_reflects_only_successfully_parsed_chords(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp_dir = Path(tmp)
            self._write_song(tmp_dir, "song.json", {"title": "Song", "chords": ["C", "NotAChord", "G"]})

            library = CuratedLibrary(tmp_dir)
            [summary] = library.list_songs()

            self.assertEqual(summary["chord_count"], 2)

    def test_song_tempo_defaults_when_omitted(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp_dir = Path(tmp)
            self._write_song(tmp_dir, "song.json", {"title": "Song", "chords": ["C"]})

            library = CuratedLibrary(tmp_dir)
            [summary] = library.list_songs()

            self.assertEqual(summary["tempo_bpm"], DEFAULT_TEMPO_BPM)

    def test_song_tempo_is_read_and_sanitized(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp_dir = Path(tmp)
            self._write_song(tmp_dir, "song.json", {"title": "Song", "chords": ["C"], "tempo_bpm": 140})
            self._write_song(tmp_dir, "bad.json", {"title": "Bad Tempo", "chords": ["C"], "tempo_bpm": "fast"})

            library = CuratedLibrary(tmp_dir)
            tempos = {song["id"]: song["tempo_bpm"] for song in library.list_songs()}

            self.assertEqual(tempos["song"], 140)
            self.assertEqual(tempos["bad"], DEFAULT_TEMPO_BPM)


class UploadedLibraryTests(unittest.TestCase):
    def test_add_song_generates_a_slug_based_id(self):
        library = UploadedLibrary()
        song = library.add_song("My Great Song!", ["C", "G"])

        self.assertTrue(song.id.startswith("my-great-song-"))
        self.assertEqual(song.title, "My Great Song!")

    def test_added_songs_appear_in_list_and_get(self):
        library = UploadedLibrary()
        song = library.add_song("Test Song", ["C", "Am"])

        self.assertEqual([entry["id"] for entry in library.list_songs()], [song.id])
        self.assertIsNotNone(library.get_song(song.id))

    def test_evicts_oldest_song_once_over_the_cap(self):
        library = UploadedLibrary()
        first_id = library.add_song("First", ["C"]).id
        for i in range(200):
            library.add_song(f"Song {i}", ["C"])

        self.assertIsNone(library.get_song(first_id))
        self.assertEqual(len(library.songs), 200)

    def test_round_trips_through_state(self):
        library = UploadedLibrary()
        library.add_song("Round Trip Song", ["C", "G", "Am", "F"])

        restored = UploadedLibrary.from_state(library.to_state())

        self.assertEqual(restored.list_songs(), library.list_songs())

    def test_from_state_ignores_malformed_entries(self):
        restored = UploadedLibrary.from_state({
            "bad": {"title": 5, "chords": ["C"]},
            "missing-chords": {"title": "No Chords"},
            "ok": {"title": "OK Song", "chords": ["C"]},
        })

        self.assertEqual([song["id"] for song in restored.list_songs()], ["ok"])

    def test_add_song_defaults_tempo_when_omitted(self):
        library = UploadedLibrary()
        song = library.add_song("Song", ["C"])

        self.assertEqual(song.tempo_bpm, DEFAULT_TEMPO_BPM)

    def test_add_song_sanitizes_tempo(self):
        library = UploadedLibrary()
        in_range = library.add_song("Song A", ["C"], tempo_bpm=140)
        out_of_range = library.add_song("Song B", ["C"], tempo_bpm=9999)
        malformed = library.add_song("Song C", ["C"], tempo_bpm="fast")

        self.assertEqual(in_range.tempo_bpm, 140)
        self.assertEqual(out_of_range.tempo_bpm, MAX_TEMPO_BPM)
        self.assertEqual(malformed.tempo_bpm, DEFAULT_TEMPO_BPM)

    def test_tempo_round_trips_through_state(self):
        library = UploadedLibrary()
        library.add_song("Song", ["C"], tempo_bpm=132)

        restored = UploadedLibrary.from_state(library.to_state())

        self.assertEqual(restored.list_songs()[0]["tempo_bpm"], 132)


if __name__ == "__main__":
    unittest.main()
