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
    duration_beats: float


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
    ChordFamily("augmented", "major", "Augmented", "+", (0, 4, 8), "1-3-#5"),
    # "majb5" rather than a bare "b5" suffix: parse_chord_symbol reads a
    # suffix's own leading "b" as a flat-root accidental (that's how
    # "Bbm7" parses "Bb" as the root), so a suffix starting with "b" would
    # make "Cb5" misparse as root "Cb" with a leftover, unrecognized "5".
    ChordFamily("majorFlat5", "major", "Major b5", "majb5", (0, 4, 6), "1-3-b5"),
    ChordFamily("minor", "minor", "Minor", "m", (0, 3, 7), "1-b3-5"),
    ChordFamily("diminished", "minor", "Diminished", "dim", (0, 3, 6), "1-b3-b5"),
    ChordFamily("dominant7", "sevenths", "Dominant 7", "7", (0, 4, 7, 10), "1-3-5-b7"),
    ChordFamily("dominant7Flat5", "sevenths", "Dominant 7 b5", "7b5", (0, 4, 6, 10), "1-3-b5-b7"),
    ChordFamily("dominant7Sharp5", "sevenths", "Dominant 7 #5", "7#5", (0, 4, 8, 10), "1-3-#5-b7"),
    ChordFamily("major7", "sevenths", "Major 7", "maj7", (0, 4, 7, 11), "1-3-5-7"),
    ChordFamily("major7Flat5", "sevenths", "Major 7 b5", "maj7b5", (0, 4, 6, 11), "1-3-b5-7"),
    ChordFamily("major7Sharp5", "sevenths", "Major 7 #5", "maj7#5", (0, 4, 8, 11), "1-3-#5-7"),
    ChordFamily("minor7", "sevenths", "Minor 7", "m7", (0, 3, 7, 10), "1-b3-5-b7"),
    ChordFamily("halfDiminished", "sevenths", "Half-diminished", "m7b5", (0, 3, 6, 10), "1-b3-b5-b7"),
    ChordFamily("diminished7", "sevenths", "Diminished 7", "dim7", (0, 3, 6, 9), "1-b3-b5-bb7"),
    ChordFamily("minorMajor7", "sevenths", "Minor-major 7", "mMaj7", (0, 3, 7, 11), "1-b3-5-7"),
    ChordFamily("dominant7sus4", "sevenths", "7sus4", "7sus4", (0, 5, 7, 10), "1-4-5-b7"),
    ChordFamily("sus2", "suspensions", "Suspended 2", "sus2", (0, 2, 7), "1-2-5"),
    ChordFamily("sus4", "suspensions", "Suspended 4", "sus4", (0, 5, 7), "1-4-5"),
    ChordFamily("add4", "extensions", "Add4", "add4", (0, 4, 5, 7), "1-3-4-5"),
    ChordFamily("add9", "extensions", "Add9", "add9", (0, 4, 7, 14), "1-3-5-9"),
    ChordFamily("sixth", "extensions", "6th", "6", (0, 4, 7, 9), "1-3-5-6"),
    ChordFamily("minorSixth", "extensions", "Minor 6th", "m6", (0, 3, 7, 9), "1-b3-5-6"),
    ChordFamily("ninth", "extensions", "9th", "9", (0, 4, 7, 10, 14), "1-3-5-b7-9"),
    ChordFamily("ninthSus4", "extensions", "9sus4", "9sus4", (0, 5, 7, 10, 14), "1-4-5-b7-9"),
    ChordFamily("eleventh", "extensions", "11th", "11", (0, 4, 7, 10, 14, 17), "1-3-5-b7-9-11"),
    ChordFamily("thirteenth", "extensions", "13th", "13", (0, 4, 7, 10, 14, 17, 21), "1-3-5-b7-9-11-13"),
)

# Fast lookup by id, e.g. for family_by_id() and create_prompt_pool()'s
# fine-grained (single-quality) selection.
FAMILIES_BY_ID = {family.id: family for family in CHORD_FAMILIES}

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
        # Only triads where every inversion is unambiguously identifiable
        # from the notes alone: augmented is excluded because its
        # inversions are acoustically identical to some other augmented
        # triad in root position (it's a symmetric/equal-interval chord),
        # and sus2/sus4 are excluded because one of their inversions
        # always reads back as the other suspended chord's root position
        # (the same ambiguity root_candidates already resolves for a
        # root-position sus2/sus4 — see recognize_chord). Practicing an
        # "inversion" the recognizer can never actually confirm would just
        # be a broken exercise, so those stay available for root-position
        # practice (Suspensions/Major) without an inversions option.
        "families": [
            {"id": "major", "label": "Major inversions", "suffix": "", "formula": "1-3-5"},
            {"id": "minor", "label": "Minor inversions", "suffix": "m", "formula": "1-b3-5"},
            {"id": "diminished", "label": "Diminished inversions", "suffix": "dim", "formula": "1-b3-b5"},
            {"id": "majorFlat5", "label": "Major b5 inversions", "suffix": "majb5", "formula": "1-3-b5"},
        ],
        # A second, orthogonal axis for the same "inversions" category: not
        # which chord family, but which inversion POSITION — the fine-tune
        # picker's Inversions column uses this instead of "families" above.
        # See INVERSION_POSITION_TOKENS for how create_prompt_pool resolves
        # these ids back into an inversion index.
        "positions": [
            {"id": "inversionsRoot", "label": "Root position"},
            {"id": "inversionsFirst", "label": "First inversion"},
            {"id": "inversionsSecond", "label": "Second inversion"},
        ],
    }
]

KNOWN_MODULE_IDS = frozenset(module["id"] for module in LEARNING_MODULES)

# Resolves one of "inversions"' position ids (see the "inversions" module's
# "positions" above) to the inversion index create_prompt_pool should
# restrict its pool to, letting the fine-tune picker narrow Inversions down
# to e.g. "just first inversion" instead of always all three.
INVERSION_POSITION_TOKENS = {
    "inversionsRoot": 0,
    "inversionsFirst": 1,
    "inversionsSecond": 2,
}


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


def _build_recognized_chord(
    midi_notes: list[int], root: int, family: ChordFamily, notes: list[int]
) -> RecognizedChord:
    """Build the RecognizedChord result for a matched root/family pair.

    The symbol gets a "/<bass note>" suffix whenever the actual lowest
    sounding key isn't the chord's root — e.g. playing A-C#-E on the piano
    (A major with its third, C#, physically at the bottom) is reported as
    "A/C#", not just "A", matching standard slash-chord notation and how
    the chord genuinely sits on the keyboard. This mirrors `inversion`
    (computed the same way, from the same bass note) rather than which
    pitch class ended up chosen as the root for matching purposes.

    Args:
        midi_notes: The raw MIDI notes played, in any order/octave — used
            to find the actual bass (lowest sounding) note.
        root: Pitch class (0-11) of the matched chord's root.
        family: The matched ChordFamily.
        notes: The chord's distinct pitch classes (0-11), including the root.

    Returns:
        A RecognizedChord with root, family_id, quality, symbol, notes and
        inversion.
    """
    root_name = NOTE_NAMES[root]
    symbol = f"{root_name}{family.suffix or ''}"

    bass = normalize_midi_note(min(midi_notes)) if midi_notes else root
    if bass != root:
        symbol = f"{symbol}/{NOTE_NAMES[bass]}"

    return {
        "root": root_name,
        "family_id": family.id,
        "quality": family.label,
        "symbol": symbol,
        "notes": [NOTE_NAMES[note] for note in notes],
        "inversion": detect_inversion(midi_notes, root, notes),
    }


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
        played or no chord family matches. `symbol` carries a "/<bass>"
        slash-chord suffix whenever the lowest sounding note isn't the
        root (see `_build_recognized_chord`), e.g. "A/C#" for A major
        voiced with its third at the bottom.
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
            return _build_recognized_chord(midi_notes, root, family, notes)

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
            return _build_recognized_chord(midi_notes, root, family, notes)

    return None


def build_prompt(
    root_name: str,
    family: ChordFamily,
    category: str | None = None,
    inversion: int = 0,
    duration_beats: float = 1.0,
) -> ChordPrompt:
    """Build a chord prompt (the "play this chord" target) for one root/family.

    Args:
        root_name: Root note name, e.g. "C", "F#", "Bb".
        family: The chord family (interval formula) to build.
        category: Category label to tag the prompt with; defaults to
            `family.category` (used to tag inversion prompts as
            "inversions" even though they reuse the major/minor family).
        inversion: 0 for root position; for a 3-note family, 1 or 2 to
            voice that many chord tones below the root, an octave up.
        duration_beats: How long this chord should be held, in
            quarter-note beats (1.0 = quarter/noire, 2.0 = half/blanche,
            0.5 = eighth/croche). Only meaningful for a timed custom
            progression; random/category practice prompts use the default.

    Returns:
        A ChordPrompt with the root, family, symbol, notes, MIDI notes,
        inversion, formula and duration. `symbol` uses standard slash-chord
        notation for a non-root-position prompt (e.g. "A/C#" for A major
        voiced with its third at the bottom) rather than a wordy "- 1st
        inversion" suffix, matching what `recognize_chord` reports once the
        same chord is actually played (see `_build_recognized_chord`).
    """
    root = pitch_class(root_name)
    pitch_classes = [(root + interval) % 12 for interval in family.intervals]
    base_midi_notes = [60 + ((pitch_class_value - 0) % 12) for pitch_class_value in pitch_classes]
    ordered_midi_notes = sorted(base_midi_notes, key=lambda note: (note - (60 + root)) % 12)

    if inversion and len(ordered_midi_notes) == 3:
        ordered_midi_notes = ordered_midi_notes[inversion:] + [note + 12 for note in ordered_midi_notes[:inversion]]

    # ordered_midi_notes[0] is whichever chord tone is now voiced lowest
    # (the root itself when inversion is 0, since the rotation above only
    # runs when inversion is non-zero) — comparing pitch classes rather
    # than note-name strings since root_name may spell it with a flat
    # (e.g. "Bb") while NOTE_NAMES only has sharps.
    bass_pitch_class = ordered_midi_notes[0] % 12
    symbol = f"{root_name}{family.suffix or ''}"
    if bass_pitch_class != root:
        symbol = f"{symbol}/{NOTE_NAMES[bass_pitch_class]}"

    return {
        "root": root_name,
        "family_id": family.id,
        "category": category or family.category,
        "symbol": symbol,
        "notes": [NOTE_NAMES[note % 12] for note in ordered_midi_notes],
        "midi_notes": ordered_midi_notes,
        "inversion": inversion,
        "formula": family.formula,
        "duration_beats": duration_beats,
    }


def create_prompt_pool(categories: list[str]) -> list[ChordPrompt]:
    """Build every possible chord prompt for the given categories.

    Args:
        categories: A mix of category ids (e.g. "major", "inversions" —
            pulls in every family under that category), specific
            ChordFamily ids (e.g. "augmented", "sus2", "dominant7Flat5" —
            pulls in just that one quality, root position only), and/or
            one of INVERSION_POSITION_TOKENS' ids (e.g. "inversionsFirst"
            — like "inversions" but restricted to just that inversion
            index) for finer-grained selection than a whole category — the
            "fine-tune chord types" picker sends these. The kinds of id
            share no names except "major"/"minor", which resolve as their
            category (every family under it) rather than just that one
            family, since a category match is checked first. Unknown/
            typo'd ids are dropped; if none remain (or the input is
            empty), falls back to ["major"] so a prompt can always be
            produced.

    Returns:
        One ChordPrompt per root/family (and, for "inversions" or an
        INVERSION_POSITION_TOKENS id, per inversion) across the selected
        categories/families.
    """
    # Drop unknown/typo'd ids instead of silently returning an empty pool
    # (which would crash random_prompt's random.choice); fall back to
    # Major so the game can always produce a prompt.
    selected = [
        token
        for token in categories
        if token in KNOWN_MODULE_IDS or token in FAMILIES_BY_ID or token in INVERSION_POSITION_TOKENS
    ] or ["major"]
    prompts: list[ChordPrompt] = []

    for token in selected:
        if token == "inversions" or token in INVERSION_POSITION_TOKENS:
            # Keep this in sync with LEARNING_MODULES' "inversions" entry
            # above — see its comment for why augmented/sus2/sus4 are
            # deliberately left out.
            inversion_families = [
                family_by_id("major"),
                family_by_id("minor"),
                family_by_id("diminished"),
                family_by_id("majorFlat5"),
            ]
            # Plain "inversions" still covers all three positions; a
            # specific INVERSION_POSITION_TOKENS id narrows the pool down
            # to just that one (e.g. "always practice first inversion").
            positions = (INVERSION_POSITION_TOKENS[token],) if token in INVERSION_POSITION_TOKENS else (0, 1, 2)
            for root_name in ROOTS:
                for family in inversion_families:
                    for inversion in positions:
                        prompts.append(build_prompt(root_name, family, category="inversions", inversion=inversion))
            continue

        if token in KNOWN_MODULE_IDS:
            for root_name in ROOTS:
                for family in CHORD_FAMILIES:
                    if family.category == token:
                        prompts.append(build_prompt(root_name, family))
            continue

        # A specific ChordFamily id (the fine-tune picker) rather than a
        # whole category — e.g. just "augmented" without also pulling in
        # every other Major-category family.
        family = FAMILIES_BY_ID[token]
        for root_name in ROOTS:
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


# Suffixes sorted longest-first so e.g. "m7b5" is tried before "m7" before
# "m" — an exact match on the shortest suffix first would misparse "m7b5"
# as minor ("m") with leftover "7b5".
_SUFFIXES_BY_LENGTH = tuple(sorted(CHORD_FAMILIES, key=lambda family: len(family.suffix), reverse=True))

DEFAULT_DURATION_BEATS = 1.0  # one quarter-note (noire) beat


class ProgressionEntryError(TypedDict):
    index: int
    chord: str
    message: str


def _parse_duration_token(token: str) -> float:
    """Parse a note-duration suffix into a number of quarter-note beats.

    Args:
        token: The text after a chord's ":" separator, e.g. "2" (half
            note/blanche), "4" (whole note/ronde), "/2" (eighth
            note/croche), "/4" (sixteenth note).

    Returns:
        Duration in quarter-note beats (1.0 = a quarter/noire).

    Raises:
        ValueError: If the token isn't a positive integer, or "/"
            followed by a positive integer.
    """
    if token.startswith("/"):
        divisor = token[1:]
        if not divisor.isdigit() or int(divisor) <= 0:
            raise ValueError(f"Invalid duration '/{divisor}'")
        return DEFAULT_DURATION_BEATS / int(divisor)

    if not token.isdigit() or int(token) <= 0:
        raise ValueError(f"Invalid duration '{token}'")
    return DEFAULT_DURATION_BEATS * int(token)


def parse_chord_symbol(symbol: str) -> ChordPrompt:
    """Parse a chord symbol, with an optional duration, into a prompt.

    Only recognizes the exact vocabulary the game itself teaches: a root
    letter A-G, an optional "#"/"b" accidental, and one of the known
    ChordFamily suffixes ("", "+", "majb5", "m", "dim", "7", "7b5", "7#5",
    "maj7", "maj7b5", "maj7#5", "m7", "m7b5", "dim7", "mMaj7", "7sus4",
    "sus2", "sus4", "add4", "add9", "6", "m6", "9", "9sus4", "11", "13") —
    matching case-insensitively on the suffix. Inversions aren't
    supported; every parsed chord is root position.

    An optional ":<duration>" suffix sets how long the chord is held, in
    quarter-note beats: "C" (no suffix) is a quarter/noire, "C:2" a
    half/blanche, "C:4" a whole/ronde, "C:/2" an eighth/croche, "C:/4" a
    sixteenth. The colon is required (rather than appending the duration
    directly, e.g. "C2") because several chord qualities are themselves
    digits — "G7" already means "G dominant 7th", so a bare "G7" can't
    also mean "G major held for 7 beats" without ambiguity.

    Args:
        symbol: A chord symbol, optionally with a duration, e.g. "C",
            "Am7", "Bbmaj7:2", "F#sus4:/2".

    Returns:
        The corresponding ChordPrompt (category "custom", inversion 0).

    Raises:
        ValueError: If the symbol is empty, its root isn't a valid note
            name, its remaining suffix doesn't match a known chord family,
            or its duration suffix is malformed.
    """
    text = symbol.strip()
    if not text:
        raise ValueError("Empty chord symbol")

    chord_text, has_duration, duration_text = text.partition(":")
    duration_beats = DEFAULT_DURATION_BEATS
    if has_duration:
        duration_beats = _parse_duration_token(duration_text.strip())

    chord_text = chord_text.strip()
    if not chord_text:
        raise ValueError(f"'{symbol}' is missing a chord before ':'")

    letter = chord_text[0].upper()
    if letter not in "ABCDEFG":
        raise ValueError(f"'{symbol}' doesn't start with a note letter A-G")

    rest = chord_text[1:]
    if rest[:1] == "#":
        root_name, rest = f"{letter}#", rest[1:]
    elif rest[:1].lower() == "b":
        root_name, rest = f"{letter}b", rest[1:]
    else:
        root_name = letter

    if root_name not in NOTE_ALIASES:
        raise ValueError(f"'{symbol}' has no valid root note")

    quality = rest.strip().lower()
    # .lower() on both sides: every declared suffix so far happens to already
    # be lowercase ("maj7", "m7b5", ...), which made a bare `==` comparison
    # here look case-insensitive by coincidence — it silently stopped
    # matching the moment a mixed-case suffix (mMaj7, for its conventional
    # display casing) was declared. Comparing lowercased on both sides is
    # what the "matching case-insensitively" docstring promise actually
    # requires, independent of how any given suffix happens to be spelled.
    family = next((candidate for candidate in _SUFFIXES_BY_LENGTH if candidate.suffix.lower() == quality), None)
    if family is None:
        raise ValueError(f"'{symbol}' has an unrecognized chord quality '{rest.strip()}'")

    return build_prompt(root_name, family, category="custom", duration_beats=duration_beats)


def parse_progression(chords: list[str]) -> tuple[list[ChordPrompt], list[ProgressionEntryError]]:
    """Parse an ordered list of chord symbols into prompts, tolerating bad entries.

    Args:
        chords: Raw chord symbol strings, in the order they should be
            played (e.g. from an uploaded CSV column). Blank entries are
            silently skipped.

    Returns:
        A (prompts, errors) tuple: successfully parsed prompts in order,
        and a list of {index, chord, message} for entries that failed to
        parse — a bad line doesn't abort the rest of the import.
    """
    prompts: list[ChordPrompt] = []
    errors: list[ProgressionEntryError] = []

    for index, raw in enumerate(chords):
        text = raw.strip()
        if not text:
            continue
        try:
            prompts.append(parse_chord_symbol(text))
        except ValueError as error:
            errors.append({"index": index, "chord": text, "message": str(error)})

    return prompts, errors
