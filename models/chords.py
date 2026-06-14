from __future__ import annotations

from dataclasses import dataclass
import random
from typing import TypedDict


NOTE_NAMES = ("C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B")


class RecognizedChord(TypedDict):
    root: str
    family_id: str
    quality: str
    symbol: str
    notes: list[str]
    inversion: int


class ChordPrompt(TypedDict):
    root: str
    family_id: str
    category: str
    symbol: str
    notes: list[str]
    midi_notes: list[int]
    inversion: int
    formula: str


@dataclass(frozen=True)
class ChordFamily:
    id: str
    category: str
    label: str
    suffix: str
    intervals: tuple[int, ...]
    formula: str


CHORD_FAMILIES = (
    ChordFamily("major", "major", "Major", "", (0, 4, 7), "1-3-5"),
    ChordFamily("minor", "minor", "Minor", "m", (0, 3, 7), "1-b3-5"),
    ChordFamily("dominant7", "sevenths", "Dominant 7", "7", (0, 4, 7, 10), "1-3-5-b7"),
    ChordFamily("major7", "sevenths", "Major 7", "maj7", (0, 4, 7, 11), "1-3-5-7"),
    ChordFamily("minor7", "sevenths", "Minor 7", "m7", (0, 3, 7, 10), "1-b3-5-b7"),
    ChordFamily("halfDiminished", "sevenths", "Half-diminished", "m7b5", (0, 3, 6, 10), "1-b3-b5-b7"),
    ChordFamily("sus2", "suspensions", "Suspended 2", "sus2", (0, 2, 7), "1-2-5"),
    ChordFamily("sus4", "suspensions", "Suspended 4", "sus4", (0, 5, 7), "1-4-5"),
    ChordFamily("add9", "extensions", "Add9", "add9", (0, 4, 7, 14), "1-3-5-9"),
    ChordFamily("ninth", "extensions", "9th", "9", (0, 4, 7, 10, 14), "1-3-5-b7-9"),
    ChordFamily("eleventh", "extensions", "11th", "11", (0, 4, 7, 10, 14, 17), "1-3-5-b7-9-11"),
    ChordFamily("thirteenth", "extensions", "13th", "13", (0, 4, 7, 10, 14, 17, 21), "1-3-5-b7-9-11-13"),
)

ROOTS = ("C", "D", "E", "F", "G", "A", "B")
CATEGORY_LABELS = {
    "major": "Major",
    "minor": "Minor",
    "sevenths": "7th Chords",
    "suspensions": "Suspensions",
    "inversions": "Inversions",
    "extensions": "Extensions",
}

LEARNING_MODULES = [
    {
        "id": module_id,
        "label": CATEGORY_LABELS[module_id],
        "families": [
            {
                "id": family.id,
                "label": family.label,
                "suffix": family.suffix,
                "formula": family.formula,
            }
            for family in CHORD_FAMILIES
            if family.category == module_id
        ],
    }
    for module_id in ("major", "minor", "sevenths", "suspensions", "extensions")
] + [
    {
        "id": "inversions",
        "label": CATEGORY_LABELS["inversions"],
        "families": [
            {"id": "major", "label": "Major inversions", "suffix": "", "formula": "1-3-5"},
            {"id": "minor", "label": "Minor inversions", "suffix": "m", "formula": "1-b3-5"},
        ],
    }
]


def normalize_midi_note(midi_note: int) -> int:
    return midi_note % 12


def unique_pitch_classes(midi_notes: list[int]) -> list[int]:
    return sorted({normalize_midi_note(note) for note in midi_notes})


def compact_intervals(intervals: tuple[int, ...]) -> list[int]:
    return sorted({interval % 12 for interval in intervals})


def pitch_class(note_name: str) -> int:
    return NOTE_NAMES.index(note_name)


def family_by_id(family_id: str) -> ChordFamily:
    return next(family for family in CHORD_FAMILIES if family.id == family_id)


def detect_inversion(midi_notes: list[int], root: int, chord_notes: list[int]) -> int:
    if not midi_notes:
        return 0

    lowest = min(midi_notes) % 12
    ordered = sorted(chord_notes, key=lambda note: (note - root) % 12)

    try:
        index = ordered.index(lowest)
    except ValueError:
        return 0

    # Return a non-zero inversion index when the lowest pitch class
    # corresponds to a non-root chord tone. Support any inversion
    # index up to the number of chord tones (e.g. 1..len(chord_notes)-1).
    return index if 0 < index < len(ordered) else 0


def recognize_chord(midi_notes: list[int]) -> RecognizedChord | None:
    notes = unique_pitch_classes(midi_notes)

    if len(notes) < 3:
        return None

    # First try exact interval set matches using each played pitch-class as root.
    for root in notes:
        intervals = sorted((note - root) % 12 for note in notes)
        family = next(
            (candidate for candidate in CHORD_FAMILIES if compact_intervals(candidate.intervals) == intervals),
            None,
        )

        if family:
            root_name = NOTE_NAMES[root]
            symbol = f"{root_name}{family.suffix or ''}"

            return {
                "root": root_name,
                "family_id": family.id,
                "quality": family.label,
                "symbol": symbol,
                "notes": [NOTE_NAMES[note] for note in notes],
                "inversion": detect_inversion(midi_notes, root, notes),
            }

    # If no exact match, fall back to tolerant matching. This handles cases
    # where an extension is present (extra pitch-classes) or the root tone
    # is omitted from the played notes. Try all possible roots and accept
    # a family when its compact intervals are a subset of the detected intervals.
    for root in range(12):
        intervals_set = {((note - root) % 12) for note in notes}
        family = next(
            (
                candidate
                for candidate in CHORD_FAMILIES
                if set(compact_intervals(candidate.intervals)).issubset(intervals_set)
            ),
            None,
        )

        if family:
            root_name = NOTE_NAMES[root]
            symbol = f"{root_name}{family.suffix or ''}"

            return {
                "root": root_name,
                "family_id": family.id,
                "quality": family.label,
                "symbol": symbol,
                "notes": [NOTE_NAMES[note] for note in notes],
                "inversion": detect_inversion(midi_notes, root, notes),
            }

    return None


def build_prompt(root_name: str, family: ChordFamily, category: str | None = None, inversion: int = 0) -> ChordPrompt:
    root = pitch_class(root_name)
    pitch_classes = [(root + interval) % 12 for interval in family.intervals]
    base_midi_notes = [60 + ((pitch_class_value - 0) % 12) for pitch_class_value in pitch_classes]
    ordered_midi_notes = sorted(base_midi_notes, key=lambda note: (note - (60 + root)) % 12)

    if inversion and len(ordered_midi_notes) == 3:
        ordered_midi_notes = ordered_midi_notes[inversion:] + [note + 12 for note in ordered_midi_notes[:inversion]]

    inversion_label = "" if inversion == 0 else f" - {'1st' if inversion == 1 else '2nd'} inversion"
    return {
        "root": root_name,
        "family_id": family.id,
        "category": category or family.category,
        "symbol": f"{root_name}{family.suffix or ''}{inversion_label}",
        "notes": [NOTE_NAMES[note % 12] for note in ordered_midi_notes],
        "midi_notes": ordered_midi_notes,
        "inversion": inversion,
        "formula": family.formula,
    }


def create_prompt_pool(categories: list[str]) -> list[ChordPrompt]:
    selected = categories or ["major"]
    prompts: list[ChordPrompt] = []

    for category in selected:
        if category == "inversions":
            inversion_families = [family_by_id("major"), family_by_id("minor")]
            for root_name in ROOTS:
                for family in inversion_families:
                    for inversion in (0, 1, 2):
                        prompts.append(build_prompt(root_name, family, category="inversions", inversion=inversion))
            continue

        for root_name in ROOTS:
            for family in CHORD_FAMILIES:
                if family.category == category:
                    prompts.append(build_prompt(root_name, family))

    return prompts


def random_prompt(categories: list[str]) -> ChordPrompt:
    return random.choice(create_prompt_pool(categories))
