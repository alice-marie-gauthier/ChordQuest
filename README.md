# ChordQuest

Adaptive piano chord runner game scripted in Python with a browser UI.

## Features

- Select one or more chord categories: Major, Minor, 7th Chords, Suspensions, Inversions, Extensions.
- Play with a USB MIDI keyboard through the browser Web MIDI API.
- Play through the computer microphone using browser Web Audio pitch-class estimation.
- Computer-keyboard fallback using `A W S E D F T G Y H U J K`.
- Runner game: the arriving chord is the obstacle, and the boy jumps when the requested chord is correct.
- Interactive frontend with target-note highlighting and playable on-screen piano keys.
- Levels increase the running speed after each success.
- The player has 3 lives before game over.
- Python backend in `app.py` serves prompts and recognizes chords from MIDI-style note numbers.
- Unit tests for chord recognition.

Microphone recognition works best with the computer close to the piano and a quiet room. USB MIDI is more accurate.

## USB MIDI

USB MIDI works in Chrome or Edge from `http://127.0.0.1:8000`. Click `Use USB MIDI` after connecting and powering on the keyboard. If the page says no input is detected, reconnect the cable or power-cycle the keyboard, then click `Retry USB MIDI`; the game also refreshes automatically when the browser reports a MIDI connection change.

## Development

Project layout:

```text
app.py              Python backend API and static frontend server
models/             Chord recognition, prompts, and progress logic
static/
  index.html        Frontend browser UI
  app.js            Game, input, and interaction logic
  styles.css        Frontend styling
tests/
  test_chords.py    Backend model tests
```

Create and activate a local environment:

```bash
python -m venv env
env\Scripts\activate
```

Run the app:

```bash
python app.py
```

Then open `http://127.0.0.1:8000`.

In the browser:

1. Select the chord categories to practice.
2. Click `Use USB MIDI` or `Use microphone`.
3. Click `Start game`.
4. Play the displayed chord before the arriving chord reaches the boy.

Run Python tests:

```bash
python -m unittest discover -s tests
```
