# ChordQuest

Adaptive piano chord runner game scripted in Python with a browser UI.

## Features

- Select one or more chord categories: Major, Minor, 7th Chords, Suspensions, Inversions, Extensions.
- Play with a USB MIDI keyboard through the browser Web MIDI API.
- Play piano sounds with a QWERTZ computer keyboard using `A W S E D F T G Z H U J K`.
- Choose one input mode at a time: USB MIDI or computer keyboard.
- Choose a recognition mode: held chord or arpeggio.
- Choose the runner speed with a slider before or during the game.
- Runner game: the arriving chord is the obstacle, and the boy jumps when the requested chord is correct.
- Interactive frontend with target-note highlighting and playable on-screen piano keys.
- Score points for correct chords without a life limit.
- Play an "error" sound when the played chord is wrong.
- Play a short "ouch" sound when the runner hits the arriving chord.
- Stop the game at any time with the stop button.
- Python backend in `app.py` serves prompts and recognizes chords from MIDI-style note numbers.
- Unit tests for chord recognition.

## USB MIDI

USB MIDI works in Chrome or Edge from `http://127.0.0.1:8000`. Click `Use USB MIDI` after connecting and powering on the keyboard. If the page says no input is detected, reconnect the cable or power-cycle the keyboard, then click `Retry USB MIDI`; the game also refreshes automatically when the browser reports a MIDI connection change.

## Computer Keyboard

Click `Use computer keyboard` to play piano sounds with the QWERTZ computer keyboard. The game listens to `A W S E D F T G Z H U J K` only while this mode is selected.

## Recognition Mode

Use `Held chord` when you want to hold all notes at the same time. Use `Arpeggio` when you want to play the notes one after another; the game keeps notes in memory briefly so the chord can still be recognized.

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
2. Choose `Held chord` or `Arpeggio`.
3. Click `Use USB MIDI` or `Use computer keyboard`.
4. Choose the speed with the slider.
5. Click `Start game`.
6. Play the displayed chord before the arriving chord reaches the boy.
7. Click `Stop game` when you want to end the run.

Run Python tests:

```bash
python -m unittest discover -s tests
```
