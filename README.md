# ChordQuest

Adaptive piano chord runner game scripted in Python with a browser UI.

## Features

- Select one or more chord categories: Major, Minor, 7th Chords, Suspensions, Extensions, Inversions — each with an optional drawer for a precise pick of individual qualities (e.g. just Augmented, or just Dominant 7 b5) or, for Inversions, individual positions (Root/First/Second), modeled on [teoria.com](https://www.teoria.com/en/exercises/c34e.php)'s own chord ear-training breakdown.
- Practice chords rooted on natural notes, sharps, and flats.
- Play with a MIDI keyboard (USB or Bluetooth alike) through the browser Web MIDI API.
- Play piano sounds with a QWERTZ computer keyboard using `A W S E D F T G Z H U J K`.
- Choose one input mode at a time: MIDI or computer keyboard.
- Choose a recognition mode: held chord or arpeggio.
- Choose the runner speed with a slider before or during the game.
- Runner game: the arriving chord is the obstacle, and the boy jumps when the requested chord is correct.
- Procedurally animated runner (small canvas game framework: state machine, squash-and-stretch jump, run-cycle limb swing, hit recoil with camera shake, particle bursts, parallax ground) — see `static/js/game/`.
- Interactive frontend with playable on-screen piano keys.
- Score points for correct chords without a life limit.
- Say "error" when the played chord is wrong.
- Say "game over" when the runner hits the arriving chord.
- Start, Pause/Resume, and Stop a run at any time from one control bar.
- `Song progression`: upload a CSV of chord symbols (one per line, e.g. a real song's progression you've transcribed yourself) to practice it in order instead of random chords; a downloadable template shows the expected format. Each chord can carry its own note duration and the song a tempo, so a loaded progression plays back in that actual rhythm (see "Rhythm and tempo" below).
- Python backend in `app.py` serves prompts and recognizes chords from MIDI-style note numbers.
- Per-chord-type mastery tracking (accuracy, speed, and practice count) with a reset control.
- `Chord League`: pick a name, build a small avatar, and your scores are ranked on a persistent leaderboard (podium for the top 3) against everyone else who's played on this server; `Practice solo` keeps a session fully local and off the leaderboard.
- A visual theme matched to the Swiss Cat+ tools (white/grey-beige, cards on a soft shadow with a thin grey line, a brown accent, a bold plain sans-serif) shared by the page and the canvas game.
- Unit tests for chord recognition, mastery tracking, and the Chord League leaderboard/avatars.

## MIDI (USB or Bluetooth)

The Web MIDI API doesn't distinguish transport — a MIDI keyboard connected by USB and one connected over Bluetooth both just show up as an "input" once the browser has access, so the `MIDI` card covers both. It works in Chrome, Edge, and **Safari 17+ / iOS or iPadOS 17+** (WebKit added Web MIDI support there; older Safari versions don't have it) from `http://127.0.0.1:8000` or any `https://` URL, e.g. a deployed instance — see "Play from a phone or tablet" below; the Web MIDI API requires one of those two, plain `http://` on any other host won't work. Click `MIDI`, allow the permission prompt, and connect/power on the keyboard. If the page says no input is detected, reconnect the cable or power-cycle the keyboard (or re-pair over Bluetooth), then click `Retry MIDI`; the game also refreshes automatically when the browser reports a MIDI connection change.

**Bluetooth on a Yamaha P-225 (and similar P-series pianos) is audio-only, not MIDI.** Its built-in Bluetooth pairs as `P-225 AUDIO` and exists to stream music *into* the piano's speakers — it doesn't transmit the notes you play, so it will never show up on the `MIDI` card no matter how it's paired. This is a hardware limitation of the piano, not something the browser or ChordQuest can work around. Two ways to get real note data out of a P-225:

- **USB cable (free, most reliable)**: the piano's `USB TO HOST` port carries both MIDI and audio over one cable. Connect it to the tablet (with a USB-C/Lightning adapter if needed) and the `MIDI` card will detect it directly — no Bluetooth involved.
- **Yamaha UD-BT01 wireless MIDI adaptor (iOS only, sold separately)**: plugs into the same `USB TO HOST` port and adds an actual Bluetooth *MIDI* connection (distinct from the built-in Bluetooth *Audio*). With that adaptor connected, the piano shows up in iOS's built-in Bluetooth MIDI pairing screen — open `bluetooth-midi://` in Safari to reach it — and from there the `MIDI` card can see it wirelessly, the same as a USB keyboard.

If you can see the P-225 from Yamaha Smart Pianist, check which of these two it's actually using (a USB cable, or a UD-BT01 adaptor) — Smart Pianist needs a real MIDI link too, so whichever one it's riding on is the one that'll also work for ChordQuest.

## Chord Categories

`Chord categories` picks random-practice prompts from 6 broad groups — Major, Minor, 7th Chords, Suspensions, Extensions, Inversions — in a grid that fluidly fits as many ~300px cards per row as the page is wide (3 on a normal desktop window, fewer as it narrows, 1 on a phone). Checking one of these pulls in every chord quality that belongs to it — e.g. `Major` covers plain major triads, augmented triads, and major-b5 triads all together. For what each category actually means, click (or on desktop, just hover) the small `i` in the "Song progression" card's own top-right corner — its tooltip groups "Practice mode" (Random practice, Custom progression, Recognition mode) and "Chord categories" as two clearly separated bulleted sections, one line per option, rather than one wall of text. The same `i` pattern appears once per section across the rest of the page too (Player, Input device), each as a plain bulleted list of that section's own options.

For a more precise pick, checking a category opens a small white panel attached directly beneath its own card (its border flush against the card's, so it reads as that card's own dropdown rather than a separate box), listing every chord quality that belongs to it as a round checkbox in a lighter tan (visually one step down from the category's own square checkbox) — e.g. `7th Chords` opens Dominant 7, Dominant 7 b5, Dominant 7 #5, Major 7, Major 7 b5, Major 7 #5, Minor 7, Half-diminished, Diminished 7, Minor-major 7, 7sus4, matching the breakdown on [teoria.com's chord ear-training exercise](https://www.teoria.com/en/exercises/c34e.php). The panel starts with every quality checked (uncheck the ones you don't want); as long as at least one stays checked it narrows that category down to just those — check them all back in to return to practicing every quality in that category.

`Inversions` gets the same attached panel, but along a different axis: not which chord quality, but which inversion — `Root position`, `First inversion`, `Second inversion`. It deliberately doesn't cover every quality: only Major, Minor, Diminished and Major b5 have inversions that are unambiguously identifiable from the notes played. Augmented, Sus2 and Sus4 are left out — an augmented triad's inversions are acoustically identical to some other augmented triad in root position (its intervals are evenly spaced, so any inversion just relabels a different root), and one of sus2's/sus4's two inversions always reads back as the other one's root position (the same three-notes-two-readings ambiguity `Held chord`/`Arpeggio` mode already resolves for a root-position sus2/sus4 — see "Recognition Mode" below). Asking to identify an inversion the recognizer can never actually confirm would just be a broken exercise, so those three stay available for root-position practice (in their regular category) without an inversions option.

## Computer Keyboard

Click `Computer keyboard` to play piano sounds with the QWERTZ computer keyboard, or tap the on-screen piano keys shown once this mode is active (they respond to touch/mouse/pen alike). The game listens to `A W S E D F T G Z H U J K` only while this mode is selected.

## Recognition Mode

Use `Held chord` when you want to hold all notes at the same time (a plaque/block chord). Use `Arpeggio` when you want to play the notes one after another; the game keeps notes in memory briefly so the chord can still be recognized.

The two modes use different logic to resolve the chord's root when the notes played fit more than one interpretation (e.g. sus2/sus4 shapes sharing the same three notes a fourth apart):

- `Held chord` always trusts the lowest sounding note. MIDI note-on messages for a physically simultaneous chord arrive in a hardware-dependent, effectively random order, so play order is not usable there — only the bass note reliably tells you the root of a plaque chord.
- `Arpeggio` trusts the first note played, since that ordering is musically meaningful when notes are played one at a time.

Either way, the `Detected` readout reflects exactly which key is physically lowest on the keyboard: if the root isn't the bass note — e.g. playing A-C#-E with C# at the bottom — it's shown as a slash chord, `A/Db`, not just `A`. This uses standard slash-chord notation and matches how the chord actually sits on the keys, the same way it would if you looked it up in a real chord chart. Every accidental note the game displays (detected chords, prompts, the computer-keyboard key labels) follows one fixed spelling per pitch class rather than a strict all-sharp or all-flat chromatic scale — flats for every black key except F#, matching the circle of fifths' own practical convention (the same one real fake books/lead sheets settle on): `Db, Eb, F#, Ab, Bb`. Random practice can still ask for the other three enharmonic spellings genuinely used either way in real music — `C#`, `Gb`, `Cb` — alongside their more common counterpart.

## Mastery Tracking

The backend keeps an in-memory count of attempts, successes, and average response time per chord type (grouped by category + chord family, so inversions are tracked separately from root-position chords). The `Mastery by chord type` panel below the keyboard shows a percentage per chord type, combining accuracy, speed, and how many times you've practiced it. Click `Reset stats` to clear it.

Mastery is tracked per player: `Practice solo` (the default) uses one shared local bucket, and each Chord League name gets its own. Solo mastery stats live only in server memory and reset when `python app.py` restarts; a Chord League player's mastery and leaderboard totals are saved to disk instead (see below), so they survive a restart.

## Chord League

Pick `Join Chord League`, build a small avatar (skin tone, hair style and color, an accessory, an outfit color, a background), enter a name, then click `Join` (or press Enter) to start contributing to a shared leaderboard — everyone who has played on this server, ranked by lifetime score. The top three get a podium with medals; the rest are listed below it, each with their avatar. Scores only add up on correct chords; misses don't cost anything, matching the no-life-limit runner. Switch back to `Practice solo` at any time to keep playing without touching the leaderboard; your name and avatar are remembered (via `localStorage`) so rejoining the league later doesn't require rebuilding them.

League names are matched case/accent-insensitively (`Alice` and `alice` are the same player) and capped at 24 characters. Avatars are built from a small fixed set of trait choices (never free text or an uploaded image) — the backend whitelists every trait value, so a malformed or tampered request just falls back to the default look instead of erroring. Leaderboard, avatar, and mastery data for Chord League players is written to `data/players.json`, created on first join — this file is local to your machine and is git-ignored, so it's never committed.

### The runner's head

Building a Chord League avatar puts it directly on the runner in the game — live, as you pick each trait, not just after clicking `Join`. Switching back to `Practice solo` drops it again.

Outside of that, the head is whichever of these is available, in order:

1. Your own photo at `static/images/photo_tete_bonhomme.png`, if you've put one there — a personal picture, deliberately git-ignored (see `.gitignore`), so it's only ever present on a machine that added it and never on a fresh clone or a deployment like Render.
2. Otherwise, a random little avatar — the same inline-SVG system as the Chord League builder, picked once per page load. Deliberately not a photo pulled from elsewhere on the internet, which would be unreliable (dead links) and murky rights/consent-wise for something a public deployment serves to everyone.

## Pausing

Once a run is started, `Pause` freezes the obstacle and stops chords from being scored (right or wrong) without losing your progress; the runner and background animation settle to idle while paused. Click `Resume` to continue exactly where you left off, or `Stop game` to end the run and reset for a new one.

## Song Progression

By default the game asks for random chords from your selected categories. To practice a real chord progression instead — your own transcription of a known song, a progression from a lesson, anything — click `Download template` for a one-column CSV (`chord`, then one chord symbol per line), fill it in with your own progression, and click `Upload CSV`. The template itself carries a full notation cheat-sheet as `#`-prefixed comment lines (roots, every chord quality, the duration suffixes below) — those lines are ignored on upload, so you can leave them in or delete them.

Accepted chord symbols are exactly the vocabulary the game itself teaches: a root letter A-G with an optional `#`/`b`, followed by one of `""` (major), `+` (augmented), `majb5` (major b5), `m` (minor), `dim` (diminished), `7`, `7b5`, `7#5`, `maj7`, `maj7b5`, `maj7#5`, `m7`, `m7b5`, `dim7`, `mMaj7`, `sus2`, `sus4`, `7sus4`, `add4`, `add9`, `6`, `m6`, `9`, `9sus4`, `11`, `13` — e.g. `C`, `F#m`, `Bbmaj7`, `Dsus4`, `A7sus4`. Rows that don't match are skipped with a reason shown in the status line rather than failing the whole import; inversions aren't supported in a CSV (every chord loads in root position).

Give the upload a `Song title` and, once it parses successfully, it's automatically saved to the **Uploaded Songs** library (see below) so you don't have to re-upload the file next time. The `Random practice` / `Custom progression` choice sits at the top of the panel; picking `Custom progression` is what reveals the upload/library controls in the first place, and once a progression is loaded it steps through the chords in order, looping back to the start when it reaches the end. Click `Clear` to remove the loaded progression and go back to `Random practice`.

ChordQuest doesn't fetch progressions from any external site — sheet-music platforms (Noviscore, Quickpartitions, Oktav, Tomplay, etc.) sell copyrighted arrangements and don't offer a public API for this, so pulling from them isn't something this project does. The CSV is entirely yours to fill in.

### Rhythm and tempo

Append `:<duration>` to a chord to give it a length other than one beat (a quarter note/noire), relative to the song's tempo:

| Suffix | Note value | Example |
| --- | --- | --- |
| *(none)* | quarter note (noire) — 1 beat | `C` |
| `:2` | half note (blanche) — 2 beats | `C:2` |
| `:4` | whole note (ronde) — 4 beats | `C:4` |
| `:/2` | eighth note (croche) — half a beat | `C:/2` |
| `:/4` | sixteenth note — a quarter beat | `C:/4` |

The `:` is required — a bare trailing digit is read as part of the chord quality instead (`G7` is a G dominant-7th chord, not "G for 7 beats"), so `G7:2` is how you'd write a dominant 7th held for a half note. Set a `Tempo (BPM)` alongside the CSV upload (or bake `tempo_bpm` into a library JSON file — see `library/curated/README.md`) and, when `Custom progression` is active, each chord's on-screen arrival is paced to its actual note value at that tempo instead of a uniform speed; the `Speed` slider still applies on top, as a multiplier around its default rather than an absolute pace.

This is a manual notation, filled in by hand — ChordQuest does not read sheet music from an image or PDF (no OCR/OMR step). A scanned score still needs to be transcribed into a CSV/JSON progression using this format.

## Song Libraries

Below the upload controls, "Or load from a library" has two sources you can pick a song from without re-uploading a file:

- **My Library** — songs *you* curate as JSON files in `library/curated/`, tracked in git. This is deliberately separate from uploads so it only ever contains what you chose to put there — see `library/curated/README.md` for the file format and how to add a song. Ships with one example progression to show the format.
- **Uploaded Songs** — every CSV upload that includes a title and parses successfully is saved here automatically. Persisted to `data/uploaded_songs.json` (git-ignored, capped at 200 songs, oldest evicted first), so this grows from whatever anyone uploads through the app on this server.

Pick a source, pick a song, and click `Load` to make it the active custom progression — same as uploading a CSV, just without needing the file again.

## Development

Project layout:

```text
app.py              Python backend API; serves template/index.html and static/
models/             Chord recognition, prompts, progress, player, and library logic
  chords.py         Chord recognition, prompt pools, learning modules,
                     chord-symbol/CSV progression parsing
  progress.py       Per-chord-type mastery stats (ChordStats, ProgressStore)
  players.py        Chord League players and the leaderboard (PlayerStore)
  library.py        Song libraries: CuratedLibrary (reads library/curated/),
                     UploadedLibrary (auto-saved CSV uploads)
data/               Runtime-only, git-ignored: players.json (Chord League),
                     uploaded_songs.json (Uploaded Songs library)
library/
  curated/          "My Library": one JSON file per song, tracked in git —
                     see curated/README.md for the format
template/
  index.html        The one HTML page, kept outside static/ on purpose so
                     app.py serves it explicitly rather than as a static file
static/
  css/
    styles.css      Frontend styling (the shared "sheet music" palette)
  images/
    photo_tete_bonhomme.png   Optional personal photo for the runner's
                               head (git-ignored; see "The runner's head"
                               below for what's shown when it's missing)
  templates/
    chord-progression-template.csv   Downloadable starter file for the
                                      Song Progression CSV import
  js/
    app.js          Input handling, networking, HUD, and game/scene wiring
    avatar.js       Avatar trait tables + inline-SVG avatar renderer, shared
                     by the avatar builder, the leaderboard/podium, and the
                     runner's own head (see avatarHeadImageSrc)
    game/           Small canvas game framework (ES modules, no build step)
      engine.js     Fixed-timestep GameLoop + easing/math helpers
      palette.js    Color constants mirroring styles.css's CSS variables
      runner.js     Runner entity: idle/run/jump/hit state machine with
                     procedural skeletal animation (squash-and-stretch,
                     run-cycle limb swing, camera shake on a miss)
      obstacle.js   The arriving chord, styled as a racing pennant on a
                     pole (candy-colored per chord, see palette.js) with
                     a proximity glow
      particles.js  Small pooled particle system (confetti, dust)
      scene.js      Composes the above + a staff-line/piano-key parallax
                     background into one scene; reads game state through
                     callbacks, has no game logic of its own (see
                     RunnerScene in the source for the hook contract
                     app.js wires up)
tests/
  test_chords.py    Chord recognition, prompt-pool, and progression-CSV parsing tests
  test_progress.py  Mastery tracking tests
  test_players.py   Chord League player/leaderboard tests
  test_library.py   Curated/uploaded song library tests
```

Every Python function has a docstring (summary + Args/Returns), and every JavaScript function has an equivalent JSDoc comment (`@param`/`@returns`).

The game canvas has no engine dependency and no build step: `static/js/game/*.js` are plain ES modules loaded directly by the browser (`template/index.html` loads `/js/app.js` as `type="module"`), so any static file server works.

Backend API:

```text
GET  /api/modules            Chord categories and families (drives the checkboxes and mastery labels)
GET  /api/prompt?categories=major,minor
                              A random chord prompt from the selected categories; a token can
                              also be a specific ChordFamily id (e.g. "augmented") for the
                              category drawers, or one of "inversionsRoot"/"inversionsFirst"/
                              "inversionsSecond" for the Inversions drawer — any of these kinds
                              can be mixed in the same comma-separated list
GET  /api/recognize?notes=60,64,67&mode=held
                              Recognize a chord from MIDI-style note numbers; mode is "held" or "arpeggio"
GET  /api/stats[?player=Name] Mastery snapshot; omit `player` for the shared solo bucket
POST /api/attempt            Record one attempt:
                              {"key": "major:major", "correct": true, "response_ms": 900,
                               "player": "Alice", "points": 280}
                              `player`/`points` are optional — omit both for solo practice
POST /api/stats/reset[?player=Name]
                              Clear that player's (or solo's) mastery stats
GET  /api/leaderboard        Chord League standings (with avatars), ranked by lifetime score
POST /api/players            Join or re-join the Chord League:
                              {"name": "Alice", "avatar": {"skin": "s3", "hairStyle": "short",
                               "hairColor": "c1", "accessory": "none", "outfit": "o1", "background": "b1"}}
                              `avatar` is optional; unknown/missing trait values fall back to
                              the default rather than erroring — see static/js/avatar.js for
                              the full trait ID tables
POST /api/progressions       Parse an uploaded chord progression:
                              {"chords": ["C", "G:2", "Am:/2"], "title": "My Song", "tempo_bpm": 96}
                              Returns {"prompts": [...], "errors": [...], "saved": summary|null}
                              — unparsable entries are reported per-row instead of failing the
                              whole import; `title` and `tempo_bpm` are both optional, and when
                              `title` is given the progression auto-saves to the Uploaded Songs
                              library on success (with tempo_bpm, sanitized — see "Rhythm and
                              tempo" above); each chord may carry its own ":<duration>" suffix
GET  /api/library/curated    List "My Library" songs (id, title, artist, chord_count, tempo_bpm)
GET  /api/library/curated/<id>
                              One curated song's full detail (prompts included)
GET  /api/library/uploaded   List "Uploaded Songs" (same shape as curated)
GET  /api/library/uploaded/<id>
                              One uploaded song's full detail
```

Create and activate a local environment:

```bash
python -m venv env
env\Scripts\activate
```

On Windows PowerShell, activation can fail with `running scripts is disabled on this system` because of the default execution policy. Fix it for your user account once:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

then activate with `.\env\Scripts\Activate.ps1`. If you'd rather not change the policy, either run `env\Scripts\activate.bat` from `cmd.exe`, or skip activation and call `env\Scripts\python.exe app.py` directly.

Run the app:

```bash
python app.py
```

Then open `http://127.0.0.1:8000`.

In the browser:

1. Pick `Practice solo` or `Join Chord League` (build an avatar, enter a name, click `Join`).
2. Select the chord categories to practice.
3. Choose `Held chord` or `Arpeggio`.
4. Click the `MIDI` or `Computer keyboard` card to pick your input device.
5. Choose the speed with the slider.
6. Click `Start game`.
7. Play the displayed chord before the arriving chord reaches the boy.
8. Use `Pause`/`Resume` to take a break without losing your run, and `Stop game` to end it.

Run Python tests:

```bash
python -m unittest discover -s tests
```

## Play from a phone or tablet

`http://127.0.0.1:8000` only works from the same machine `python app.py` is running on. To open ChordQuest from a phone or tablet without starting the script yourself each time, deploy it to a free host that keeps `python app.py` running and gives you a stable `https://` URL instead.

This repo is ready to deploy as-is (zero dependencies, no build step) via **[Render](https://render.com)**, free tier:

1. Push this repo to GitHub if it isn't already there.
2. On Render, click **New → Blueprint**, pick this repo — it reads `render.yaml` automatically and fills in the build/start commands and the `CHORDQUEST_HOST=0.0.0.0` variable it needs to accept outside traffic (`127.0.0.1`, the default for local runs, only accepts connections from the same machine).
3. Click **Deploy**. Render gives you a `https://<something>.onrender.com` URL — open that on your phone/tablet and it behaves exactly like the local version.

A `Procfile` is also included for Railway or other Heroku-style buildpack hosts, if you'd rather use one of those instead.

Two free-tier things worth knowing before you rely on this:

- **The service sleeps after ~15 minutes idle** and takes a few seconds to wake up on the next request — normal for Render's free plan, not a bug.
- **The filesystem is ephemeral.** `data/players.json` (Chord League scores/avatars) and `data/uploaded_songs.json` (the Uploaded Songs library) reset on every redeploy or restart unless you add a paid persistent disk. `library/curated/` ("My Library") is unaffected, since that's part of the git-tracked code rather than runtime data.

MIDI needs a secure context to work at all (`https://` or `localhost`), which Render's URL satisfies automatically — no certificate setup needed. Web MIDI works in Chrome on Android and in Safari on iOS/iPadOS 17+ (see "MIDI (USB or Bluetooth)" above, including what it takes to get real MIDI — not just Bluetooth Audio — out of a piano like a Yamaha P-225). Without a MIDI keyboard on hand at all, pick `Computer keyboard` and tap the on-screen piano keys — they respond to touch/pointer input already.

### Installing it as a Home Screen icon

Once deployed, open the `https://...onrender.com` link in Safari on the iPad and use **Share → Add to Home Screen**. ChordQuest ships a web app manifest (`static/manifest.json`) and the Apple-specific `<meta>`/`<link>` tags it needs, so the resulting icon launches full-screen (no browser address bar) like an installed app, without going through the App Store. The device also won't dim or lock itself while a run is active — the app requests a screen wake lock the moment you click `Start game` and releases it on `Stop game` (supported on iPadOS 16.4+; on anything older it's a silent no-op, gameplay is unaffected).
