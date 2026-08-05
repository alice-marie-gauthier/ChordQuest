from __future__ import annotations

from dataclasses import dataclass
import random
from typing import TypedDict


NOTE_NAMES = ("C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B")
NOTE_ALIASES = {
    "C": 0,
    "C#": 1,
    "Db": 1,
    "D": 2,
    "D#": 3,
    "Eb": 3,
    "E": 4,
    "F": 5,
    "F#": 6,
    "Gb": 6,
    "G": 7,
    "G#": 8,
    "Ab": 8,
    "A": 9,
    "A#": 10,
    "Bb": 10,
    "B": 11,
}


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

ROOTS = ("C", "C#", "Db", "D", "D#", "Eb", "E", "F", "F#", "Gb", "G", "G#", "Ab", "A", "A#", "Bb", "B")
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

KNOWN_MODULE_IDS = frozenset(module["id"] for module in LEARNING_MODULES)


def normalize_midi_note(midi_note: int) -> int:
    """Reduce a MIDI note number to its pitch class, discarding octave.

    Args:
        midi_note: A MIDI note number (any octave, e.g. 60 for middle C).

    Returns:
        The pitch class in 0-11, where 0 is C.
    """
    return midi_note % 12


def unique_pitch_classes(midi_notes: list[int]) -> list[int]:
    """Collapse a list of MIDI notes to their distinct, sorted pitch classes.

    Args:
        midi_notes: MIDI note numbers, possibly across multiple octaves and
            with duplicates.

    Returns:
        The distinct pitch classes (0-11) present, sorted ascending.
    """
    return sorted({normalize_midi_note(note) for note in midi_notes})


def compact_intervals(intervals: tuple[int, ...]) -> list[int]:
    """Reduce a chord's interval formula to its distinct, sorted pitch classes.

    Args:
        intervals: Semitone offsets from the root, e.g. (0, 4, 7) for major;
            offsets may exceed an octave (e.g. 14 for a 9th).

    Returns:
        The distinct intervals modulo 12, sorted ascending.
    """
    return sorted({interval % 12 for interval in intervals})


def pitch_class(note_name: str) -> int:
    """Look up the pitch class for a note name.

    Args:
        note_name: A note name understood by NOTE_ALIASES, e.g. "C", "F#",
            "Bb".

    Returns:
        The pitch class in 0-11.
    """
    return NOTE_ALIASES[note_name]


def family_by_id(family_id: str) -> ChordFamily:
    """Look up a chord family by its id.

    Args:
        family_id: One of the ChordFamily.id values in CHORD_FAMILIES, e.g.
            "major", "minor7".

    Returns:
        The matching ChordFamily.

    Raises:
        StopIteration: If no family with that id exists.
    """
    return next(family for family in CHORD_FAMILIES if family.id == family_id)


def root_candidates(midi_notes: list[int], notes: list[int], mode: str = "held") -> list[int]:
    """Order pitch classes by how likely each is to be the chord root.

    In "held" (plaque/block) mode every note is meant to sound at the same
    instant, so the order in which MIDI note-on messages happen to arrive is
    hardware-dependent noise, not musical intent; the lowest sounding note
    (the bass) is the reliable signal for a root-position chord. In
    "arpeggio" mode the notes are played one after another and the first
    note played is the meaningful signal, so play order is tried first
    there instead.

    Args:
        midi_notes: The raw MIDI notes played, in the order they arrived.
        notes: The chord's distinct pitch classes (0-11).
        mode: "held" or "arpeggio"; anything else is treated as "held".

    Returns:
        `notes` reordered so the most likely root(s) come first.
    """
    candidates: list[int] = []

    if midi_notes:
        played_root = normalize_midi_note(midi_notes[0])
        bass_note = normalize_midi_note(min(midi_notes))
        ordered_hints = (played_root, bass_note) if mode == "arpeggio" else (bass_note, played_root)

        for hint in ordered_hints:
            if hint in notes and hint not in candidates:
                candidates.append(hint)

    candidates.extend(note for note in notes if note not in candidates)
    return candidates


def detect_inversion(midi_notes: list[int], root: int, chord_notes: list[int]) -> int:
    """Determine which chord tone is in the bass, as an inversion index.

    Args:
        midi_notes: The raw MIDI notes played, in any order/octave.
        root: Pitch class (0-11) of the chord's root.
        chord_notes: The chord's distinct pitch classes (0-11), including
            the root.

    Returns:
        0 for root position, 1 for first inversion (the bass is the second
        chord tone above the root), 2 for second inversion, and so on. 0 is
        also returned when the bass note isn't a recognized tone of this
        chord or no notes were played.
    """
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


def recognize_chord(midi_notes: list[int], mode: str = "held") -> RecognizedChord | None:
    """Identify the chord formed by a set of played MIDI notes.

    Tries an exact match against the known chord families first (root
    priority depends on `mode`, see root_candidates), then falls back to a
    tolerant match that accepts a family whose intervals are a subset of
    what was played (so extra/omitted notes still resolve to a chord).

    Args:
        midi_notes: The raw MIDI notes played, in any order/octave.
        mode: "held" for a block/plaque chord (root decided by the bass
            note) or "arpeggio" for notes played one at a time (root
            decided by the first note played).

    Returns:
        A RecognizedChord with root, family_id, quality, symbol, notes and
        inversion, or None if fewer than 3 distinct pitch classes were
        played or no chord family matches.
    """
    notes = unique_pitch_classes(midi_notes)

    if len(notes) < 3:
        return None

    # First try exact interval set matches. Root priority is mode-aware so
    # ambiguous sets such as D-E-A resolve consistently: by bass note for a
    # held/plaque chord (Dsus2), or by the first note played for an
    # arpeggio (Dsus2 or Asus4 depending on which note started it).
    for root in root_candidates(midi_notes, notes, mode):
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
    for root in root_candidates(midi_notes, notes, mode) + [root for root in range(12) if root not in notes]:
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
    """Build a chord prompt (the "play this chord" target) for one root/family.

    Args:
        root_name: Root note name, e.g. "C", "F#", "Bb".
        family: The chord family (interval formula) to build.
        category: Category label to tag the prompt with; defaults to
            `family.category` (used to tag inversion prompts as
            "inversions" even though they reuse the major/minor family).
        inversion: 0 for root position; for a 3-note family, 1 or 2 to
            voice that many chord tones below the root, an octave up.

    Returns:
        A ChordPrompt with the root, family, symbol, notes, MIDI notes,
        inversion and formula.
    """
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
    """Build every possible chord prompt for the given categories.

    Args:
        categories: Category ids to include, e.g. ["major", "inversions"].
            Unknown/typo'd ids are dropped; if none remain (or the input is
            empty), falls back to ["major"] so a prompt can always be
            produced.

    Returns:
        One ChordPrompt per root/family (and, for "inversions", per
        inversion) across the selected categories.
    """
    # Drop unknown/typo'd category ids instead of silently returning an
    # empty pool (which would crash random_prompt's random.choice); fall
    # back to Major so the game can always produce a prompt.
    selected = [category for category in categories if category in KNOWN_MODULE_IDS] or ["major"]
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
    """Pick one random chord prompt from the given categories.

    Args:
        categories: Category ids to choose from; see create_prompt_pool for
            how unknown/empty input is handled.

    Returns:
        A randomly chosen ChordPrompt.
    """
    return random.choice(create_prompt_pool(categories))
