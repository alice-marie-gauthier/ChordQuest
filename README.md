# ChordQuest

Adaptive piano chord runner game scripted in Python with a browser UI.

## Features

- Select one or more chord categories: Major, Minor, 7th Chords, Suspensions, Inversions, Extensions.
- Practice chords rooted on natural notes, sharps, and flats.
- Play with a MIDI keyboard (USB or Bluetooth alike) through the browser Web MIDI API.
- Play piano sounds with a QWERTZ computer keyboard using `A W S E D F T G Z H U J K`.
- No MIDI keyboard? An experimental microphone mode listens to an acoustic piano and estimates the notes from the sound itself (see "Microphone" below for what to expect from it).
- Choose one input mode at a time: MIDI, computer keyboard, or microphone.
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

**Bluetooth MIDI on an iPad**, e.g. a Yamaha P-225 or similar: if you can already see the keyboard from a companion app like Yamaha Smart Pianist, it's paired over Bluetooth MIDI — but that pairing lives at the OS/CoreMIDI level, not inside that one app, so once it's connected, Safari's Web MIDI should see it too, the same as it would a USB keyboard. Bluetooth *MIDI* devices don't show up in the regular Settings → Bluetooth list on iOS/iPadOS the way headphones do; if the keyboard doesn't already show up as an input on the `MIDI` card, open `bluetooth-midi://` in Safari — this triggers iOS's built-in Bluetooth MIDI pairing screen (a system feature, not specific to any one app) where you can select and connect the keyboard directly, without needing Smart Pianist or any other app open.

## Computer Keyboard

Click `Computer keyboard` to play piano sounds with the QWERTZ computer keyboard, or tap the on-screen piano keys shown once this mode is active (they respond to touch/mouse/pen alike). The game listens to `A W S E D F T G Z H U J K` only while this mode is selected.

## Microphone

Click `Microphone` to try detecting chords from an acoustic piano's actual sound instead of a MIDI/keyboard connection — useful when neither is available. **This is experimental and meaningfully less reliable than MIDI or the on-screen keyboard**, so it's worth understanding what it's actually doing before relying on it:

- It analyzes the microphone's audio spectrum with a Harmonic Product Spectrum (a classic, simple DSP technique — not a trained model), looking for frequency peaks backed by a harmonic series and mapping them to the nearest piano notes. There's no dependency to install for this; it's built entirely on the browser's Web Audio API.
- A real piano note's own overtones can be mistaken for other chord tones, so a 3-4 note chord is meaningfully harder to detect correctly than one note played at a time — don't be surprised if it works better for practicing single notes/intervals than full held chords.
- Background noise, room acoustics, and how close/loud the piano is to the microphone all matter a lot in practice. A quiet room and a mic placed close to the piano give the best results.
- Like MIDI, it needs a secure context (`https://` or `localhost`) and an explicit microphone permission grant.

If you have an actual MIDI connection available (even Bluetooth — see above), it'll be far more accurate than the microphone.

## Recognition Mode

Use `Held chord` when you want to hold all notes at the same time (a plaque/block chord). Use `Arpeggio` when you want to play the notes one after another; the game keeps notes in memory briefly so the chord can still be recognized.

The two modes use different logic to resolve the chord's root when the notes played fit more than one interpretation (e.g. sus2/sus4 shapes sharing the same three notes a fourth apart):

- `Held chord` always trusts the lowest sounding note. MIDI note-on messages for a physically simultaneous chord arrive in a hardware-dependent, effectively random order, so play order is not usable there — only the bass note reliably tells you the root of a plaque chord.
- `Arpeggio` trusts the first note played, since that ordering is musically meaningful when notes are played one at a time.

## Mastery Tracking

The backend keeps an in-memory count of attempts, successes, and average response time per chord type (grouped by category + chord family, so inversions are tracked separately from root-position chords). The `Mastery by chord type` panel below the keyboard shows a percentage per chord type, combining accuracy, speed, and how many times you've practiced it. Click `Reset stats` to clear it.

Mastery is tracked per player: `Practice solo` (the default) uses one shared local bucket, and each Chord League name gets its own. Solo mastery stats live only in server memory and reset when `python app.py` restarts; a Chord League player's mastery and leaderboard totals are saved to disk instead (see below), so they survive a restart.

## Chord League

Pick `Join the Chord League`, build a small avatar (skin tone, hair style and color, an accessory, an outfit color, a background), enter a name, then click `Join` (or press Enter) to start contributing to a shared leaderboard — everyone who has played on this server, ranked by lifetime score. The top three get a podium with medals; the rest are listed below it, each with their avatar. Scores only add up on correct chords; misses don't cost anything, matching the no-life-limit runner. Switch back to `Practice solo` at any time to keep playing without touching the leaderboard; your name and avatar are remembered (via `localStorage`) so rejoining the league later doesn't require rebuilding them.

League names are matched case/accent-insensitively (`Alice` and `alice` are the same player) and capped at 24 characters. Avatars are built from a small fixed set of trait choices (never free text or an uploaded image) — the backend whitelists every trait value, so a malformed or tampered request just falls back to the default look instead of erroring. Leaderboard, avatar, and mastery data for Chord League players is written to `data/players.json`, created on first join — this file is local to your machine and is git-ignored, so it's never committed.

## Pausing

Once a run is started, `Pause` freezes the obstacle and stops chords from being scored (right or wrong) without losing your progress; the runner and background animation settle to idle while paused. Click `Resume` to continue exactly where you left off, or `Stop game` to end the run and reset for a new one.

## Song Progression

By default the game asks for random chords from your selected categories. To practice a real chord progression instead — your own transcription of a known song, a progression from a lesson, anything — click `Download template` for a one-column CSV (`chord`, then one chord symbol per line), fill it in with your own progression, and click `Upload CSV`. The template itself carries a full notation cheat-sheet as `#`-prefixed comment lines (roots, every chord quality, the duration suffixes below) — those lines are ignored on upload, so you can leave them in or delete them.

Accepted chord symbols are exactly the vocabulary the game itself teaches: a root letter A-G with an optional `#`/`b`, followed by one of `""` (major), `m` (minor), `7`, `maj7`, `m7`, `m7b5`, `dim7`, `mMaj7`, `sus2`, `sus4`, `7sus4`, `add9`, `9`, `9sus4`, `11`, `13` — e.g. `C`, `F#m`, `Bbmaj7`, `Dsus4`, `A7sus4`. Rows that don't match are skipped with a reason shown in the status line rather than failing the whole import; inversions aren't supported in a CSV (every chord loads in root position).

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
    photo_tete_bonhomme.png   Runner's head photo (optional; falls back to
                               a built-in placeholder if missing)
  templates/
    chord-progression-template.csv   Downloadable starter file for the
                                      Song Progression CSV import
  js/
    app.js          Input handling, networking, HUD, and game/scene wiring
    avatar.js       Avatar trait tables + inline-SVG avatar renderer, shared
                     by the avatar builder and the leaderboard/podium
    game/           Small canvas game framework (ES modules, no build step)
      engine.js     Fixed-timestep GameLoop + easing/math helpers
      palette.js    Color constants mirroring styles.css's CSS variables
      runner.js     Runner entity: idle/run/jump/hit state machine with
                     procedural skeletal animation (squash-and-stretch,
                     run-cycle limb swing, camera shake on a miss)
      obstacle.js   The arriving chord tile, styled as a brown/wine plaque
                     with a proximity glow
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
                              A random chord prompt from the selected categories
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

1. Pick `Practice solo` or `Join the Chord League` (build an avatar, enter a name, click `Join`).
2. Select the chord categories to practice.
3. Choose `Held chord` or `Arpeggio`.
4. Click the `MIDI`, `Computer keyboard`, or `Microphone` card to pick your input device.
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

MIDI needs a secure context to work at all (`https://` or `localhost`), which Render's URL satisfies automatically — no certificate setup needed. Web MIDI works in Chrome on Android and in Safari on iOS/iPadOS 17+ (see "MIDI (USB or Bluetooth)" above, including how to pair a Bluetooth keyboard like a Yamaha P-225). Without a MIDI keyboard on hand at all, pick `Computer keyboard` and tap the on-screen piano keys — they respond to touch/pointer input already — or try the experimental `Microphone` mode (see "Microphone" above).

### Installing it as a Home Screen icon

Once deployed, open the `https://...onrender.com` link in Safari on the iPad and use **Share → Add to Home Screen**. ChordQuest ships a web app manifest (`static/manifest.json`) and the Apple-specific `<meta>`/`<link>` tags it needs, so the resulting icon launches full-screen (no browser address bar) like an installed app, without going through the App Store. The device also won't dim or lock itself while a run is active — the app requests a screen wake lock the moment you click `Start game` and releases it on `Stop game` (supported on iPadOS 16.4+; on anything older it's a silent no-op, gameplay is unaffected).
