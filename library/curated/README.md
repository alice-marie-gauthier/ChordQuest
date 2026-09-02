# My Library (curated songs)

This folder is ChordQuest's "My Library" — chord progressions *you* choose
to add, tracked in git, separate from the automatically-populated
"Uploaded Songs" library (which grows from whatever anyone uploads
through the app and lives in `data/`, untracked). This separation exists
so this library only ever contains what you deliberately put here.

## Adding a song

Add one `.json` file per song. The filename (without `.json`) becomes the
song's id in the app, so keep it short and URL-safe (lowercase,
hyphens instead of spaces — e.g. `my-song-title.json`).

File format:

```json
{
  "title": "Song Title",
  "artist": "Optional Artist Name",
  "tempo_bpm": 96,
  "chords": ["C", "G", "Am:2", "F", "C:/2", "C:/2"]
}
```

- `title` (required): shown in the in-app song picker.
- `artist` (optional): shown alongside the title if present.
- `tempo_bpm` (optional, default `90`): playback speed in beats per
  minute; out-of-range or malformed values are clamped/replaced rather
  than rejected.
- `chords` (required): the progression, one chord symbol per entry, in
  playing order. Use the exact vocabulary ChordQuest itself teaches: a
  root letter A-G with an optional `#`/`b`, followed by one of `""`
  (major), `+`, `majb5`, `m`, `dim`, `7`, `7b5`, `7#5`, `maj7`, `maj7b5`,
  `maj7#5`, `m7`, `m7b5`, `dim7`, `mMaj7`, `sus2`, `sus4`, `7sus4`,
  `add4`, `add9`, `6`, `m6`, `9`, `9sus4`, `11`, `13` — e.g. `C`, `F#m`,
  `Bbmaj7`, `Dsus4`, `A7sus4`. Unrecognized entries are silently dropped
  when the song loads (check the chord count shown in the picker matches
  what you expect).

### Rhythm (note duration)

Append `:<duration>` to a chord to give it a length other than one beat
(a quarter note/noire), relative to `tempo_bpm`:

| Suffix | Note value | Example |
| --- | --- | --- |
| *(none)* | quarter note (noire) — 1 beat | `C` |
| `:2` | half note (blanche) — 2 beats | `C:2` |
| `:4` | whole note (ronde) — 4 beats | `C:4` |
| `:/2` | eighth note (croche) — half a beat | `C:/2` |
| `:/4` | sixteenth note — a quarter beat | `C:/4` |

The `:` is required — without it, a trailing digit is read as part of
the chord quality instead (`G7` is a G dominant-7th chord, not "G for 7
beats"). This is a manual rhythm notation, not automatic sheet-music
recognition: there's no OCR/image-to-chords step, so a PNG of a score
still needs to be transcribed by hand into this format.

No restart needed — the app reloads this folder on every request, so a
new or edited file shows up the next time you open the library picker.

## A note on copyright

A chord progression on its own (root + quality, no melody/lyrics/audio)
is generally considered less protectable than the song itself, but the
safest approach is still to only add progressions you have the right to
use — your own transcriptions for personal practice, public-domain works,
or anything you've written yourself. ChordQuest doesn't publish this
folder anywhere; it's local to your own copy of the repo.
