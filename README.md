# ChordQuest

Adaptive piano chord runner game scripted in Python with a browser UI.

## Features

- Select one or more chord categories: Major, Minor, 7th Chords, Suspensions, Inversions, Extensions.
- Practice chords rooted on natural notes, sharps, and flats.
- Play with a USB MIDI keyboard through the browser Web MIDI API.
- Play piano sounds with a QWERTZ computer keyboard using `A W S E D F T G Z H U J K`.
- Choose one input mode at a time: USB MIDI or computer keyboard.
- Choose a recognition mode: held chord or arpeggio.
- Choose the runner speed with a slider before or during the game.
- Runner game: the arriving chord is the obstacle, and the boy jumps when the requested chord is correct.
- Procedurally animated runner (small canvas game framework: state machine, squash-and-stretch jump, run-cycle limb swing, hit recoil with camera shake, particle bursts, parallax ground) — see `static/game/`.
- Interactive frontend with playable on-screen piano keys.
- Score points for correct chords without a life limit.
- Say "error" when the played chord is wrong.
- Say "game over" when the runner hits the arriving chord.
- Start, Pause/Resume, and Stop a run at any time from one control bar.
- Python backend in `app.py` serves prompts and recognizes chords from MIDI-style note numbers.
- Per-chord-type mastery tracking (accuracy, speed, and practice count) with a reset control.
- `Chord League`: pick a name, build a small avatar, and your scores are ranked on a persistent leaderboard (podium for the top 3) against everyone else who's played on this server; `Practice solo` keeps a session fully local and off the leaderboard.
- A "sheet music" visual theme (parchment, ink, brass and wine accents, a staff-line motif, a bold plain sans-serif) shared by the page and the canvas game.
- Unit tests for chord recognition, mastery tracking, and the Chord League leaderboard/avatars.

## USB MIDI

USB MIDI works in Chrome or Edge from `http://127.0.0.1:8000`. Click `Use USB MIDI` after connecting and powering on the keyboard. If the page says no input is detected, reconnect the cable or power-cycle the keyboard, then click `Retry USB MIDI`; the game also refreshes automatically when the browser reports a MIDI connection change.

## Computer Keyboard

Click `Use computer keyboard` to play piano sounds with the QWERTZ computer keyboard. The game listens to `A W S E D F T G Z H U J K` only while this mode is selected.

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

## Development

Project layout:

```text
app.py              Python backend API and static frontend server
models/             Chord recognition, prompts, progress, and player logic
  chords.py         Chord recognition, prompt pools, learning modules
  progress.py       Per-chord-type mastery stats (ChordStats, ProgressStore)
  players.py        Chord League players and the leaderboard (PlayerStore)
data/                Runtime-only, git-ignored: players.json (Chord League)
static/
  index.html        Frontend browser UI
  app.js            Input handling, networking, HUD, and game/scene wiring
  styles.css        Frontend styling (the shared "sheet music" palette)
  avatar.js         Avatar trait tables + inline-SVG avatar renderer, shared
                     by the avatar builder and the leaderboard/podium
  game/             Small canvas game framework (ES modules, no build step)
    engine.js       Fixed-timestep GameLoop + easing/math helpers
    palette.js      Color constants mirroring styles.css's CSS variables
    runner.js       Runner entity: idle/run/jump/hit state machine with
                     procedural skeletal animation (squash-and-stretch,
                     run-cycle limb swing, camera shake on a miss)
    obstacle.js     The arriving chord tile, styled as a brass/wine plaque
                     with a proximity glow
    particles.js    Small pooled particle system (confetti, dust)
    scene.js        Composes the above + a staff-line/piano-key parallax
                     background into one scene; reads game state through
                     callbacks, has no game logic of its own (see
                     RunnerScene in the source for the hook contract
                     app.js wires up)
tests/
  test_chords.py    Chord recognition and prompt-pool tests
  test_progress.py  Mastery tracking tests
  test_players.py   Chord League player/leaderboard tests
```

The game canvas has no engine dependency and no build step: `game/*.js` are plain ES modules loaded directly by the browser (`static/index.html` loads `app.js` as `type="module"`), so any static file server works.

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
                              the default rather than erroring — see static/avatar.js for the
                              full trait ID tables
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
4. Click the `USB MIDI` or `Computer keyboard` card to pick your input device.
5. Choose the speed with the slider.
6. Click `Start game`.
7. Play the displayed chord before the arriving chord reaches the boy.
8. Use `Pause`/`Resume` to take a break without losing your run, and `Stop game` to end it.

Run Python tests:

```bash
python -m unittest discover -s tests
```
