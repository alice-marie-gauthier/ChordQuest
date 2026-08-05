import { RunnerScene } from "./game/scene.js";
import { AVATAR_TRAITS, DEFAULT_AVATAR, renderAvatarMarkup, sanitizeAvatar } from "./avatar.js";

const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const keyMap = {
  a: 60,
  w: 61,
  s: 62,
  e: 63,
  d: 64,
  f: 65,
  t: 66,
  g: 67,
  z: 68,
  h: 69,
  u: 70,
  j: 71,
  k: 72
};
// Used only if the /api/modules fetch fails, so category checkboxes still
// render something usable while offline from the backend.
const FALLBACK_CATEGORIES = [
  ["major", "Major"],
  ["minor", "Minor"],
  ["sevenths", "7th Chords"],
  ["suspensions", "Suspensions"],
  ["inversions", "Inversions"],
  ["extensions", "Extensions"]
];

const activeNotes = new Set();
const activeNoteOrder = [];
const arpeggioNotes = new Map();
const categoriesEl = document.querySelector("#categories");
const recognitionModeEl = document.querySelector("#recognitionMode");
const notesEl = document.querySelector("#notes");
const chordEl = document.querySelector("#chord");
const keysEl = document.querySelector("#keys");
const statusEl = document.querySelector("#status");
const targetEl = document.querySelector("#target");
const arrivalChordEl = document.querySelector("#arrivalChord");
const arrivalMeterEl = document.querySelector("#arrivalMeter");
const formulaEl = document.querySelector("#formula");
const scoreEl = document.querySelector("#score");
const metaEl = document.querySelector("#meta");
const startButton = document.querySelector("#startButton");
const pauseButton = document.querySelector("#pauseButton");
const stopButton = document.querySelector("#stopButton");
const midiButton = document.querySelector("#midiButton");
const midiButtonLabel = document.querySelector("#midiButtonLabel");
const keyboardButton = document.querySelector("#keyboardButton");
const inputStatusEl = document.querySelector("#inputStatus");
const speedSlider = document.querySelector("#speedSlider");
const speedValueEl = document.querySelector("#speedValue");
const masteryGridEl = document.querySelector("#masteryGrid");
const resetStatsButton = document.querySelector("#resetStatsButton");
const playerModeEl = document.querySelector("#playerMode");
const playerJoinEl = document.querySelector("#playerJoin");
const playerNameInput = document.querySelector("#playerNameInput");
const joinLeagueButton = document.querySelector("#joinLeagueButton");
const playerStatusEl = document.querySelector("#playerStatus");
const leaderboardGridEl = document.querySelector("#leaderboardGrid");
const leaderboardPodiumEl = document.querySelector("#leaderboardPodium");
const avatarPreviewEl = document.querySelector("#avatarPreview");
const avatarRows = {
  skin: document.querySelector("#avatarSkinRow"),
  hairStyle: document.querySelector("#avatarHairStyleRow"),
  hairColor: document.querySelector("#avatarHairColorRow"),
  accessory: document.querySelector("#avatarAccessoryRow"),
  outfit: document.querySelector("#avatarOutfitRow"),
  background: document.querySelector("#avatarBackgroundRow")
};
const canvas = document.querySelector("#game");
// The runner, the arriving obstacle, particle effects and the parallax
// ground all live in the game/ modules; this scene is the single canvas
// entity the rest of app.js talks to. Place `photo_tete_bonhomme.png` in
// `static/images/` to use your photo as the runner's head — if it's
// missing, Runner falls back to a built-in placeholder head automatically.
// Root-relative because Image.src resolves against the page's URL, not
// this module's location.
const scene = new RunnerScene(canvas, {
  arrivalMeterEl,
  headImageSrc: "/images/photo_tete_bonhomme.png"
});

let targetPrompt = null;
let promptShownAt = 0;
let detectedChord = null;
let gameRunning = false;
let resolving = false;
let paused = false;
let score = 0;
let speed = Number(speedSlider.value);
let lastRecognitionAt = 0;
let recognitionTimer = null;
let midiAccess = null;
let inputMode = null;
let midiReady = false;
let keyboardAudioContext = null;
let keyboardMasterGain = null;
let lastWrongSoundAt = 0;
let arpeggioResetTimer = null;
// Display name of the joined Chord League player, or null while practicing
// solo. Solo practice never touches the leaderboard.
let activePlayer = null;
// The avatar currently being built in the Chord League panel; sent along
// when joining and mirrored into localStorage so it's remembered.
let currentAvatar = { ...DEFAULT_AVATAR };
const PLAYER_NAME_STORAGE_KEY = "chordquest_player_name";
const PLAYER_MODE_STORAGE_KEY = "chordquest_player_mode";
const PLAYER_AVATAR_STORAGE_KEY = "chordquest_player_avatar";
// Maps "category:family_id" (the mastery stats key) to a readable label,
// filled in once /api/modules loads.
const familyLabelByKey = new Map();
const keyboardTones = new Map();
const ARPEGGIO_WINDOW_MS = 1800;
const WRONG_PHRASES = [
  "LOL - try again.",
  "Close! Loser.",
  "Almost there ! ... or not.",
  "That wasn't it at all bitch.",
  "Nice attempt ... for a retard.",
  "You're so bad !",
  "Maybe music isn't for you",
  "Nope.",
  "Try again with the good notes.",
  "You have no talent."
];

const noteNameToPitchClass = {
  C: 0,
  "C#": 1,
  Db: 1,
  D: 2,
  "D#": 3,
  Eb: 3,
  E: 4,
  F: 5,
  "F#": 6,
  Gb: 6,
  G: 7,
  "G#": 8,
  Ab: 8,
  A: 9,
  "A#": 10,
  Bb: 10,
  B: 11
};

/**
 * Render the chord category checkboxes.
 * @param {Array<[string, string]>} entries - [id, label] pairs; the first
 *   entry starts checked so a prompt can always be produced.
 */
function buildCategoryInputs(entries) {
  categoriesEl.innerHTML = "";
  entries.forEach(([id, label], index) => {
    const item = document.createElement("label");
    item.className = "category";
    item.innerHTML = `<input type="checkbox" value="${id}" ${index === 0 ? "checked" : ""} /> <span>${label}</span>`;
    categoriesEl.appendChild(item);
  });
}

/**
 * Fetch the chord categories/families from the backend and build the
 * category checkboxes and mastery-label lookup from them; falls back to
 * FALLBACK_CATEGORIES if the request fails.
 * @returns {Promise<void>}
 */
async function loadModules() {
  try {
    const response = await fetch("/api/modules");
    if (!response.ok) {
      throw new Error(`status ${response.status}`);
    }
    const modules = await response.json();
    if (!Array.isArray(modules) || !modules.length) {
      throw new Error("empty modules response");
    }

    buildCategoryInputs(modules.map((module) => [module.id, module.label]));
    modules.forEach((module) => {
      module.families.forEach((family) => {
        familyLabelByKey.set(`${module.id}:${family.id}`, `${module.label} · ${family.label}`);
      });
    });
  } catch (error) {
    buildCategoryInputs(FALLBACK_CATEGORIES);
    statusEl.textContent = "Could not load chord categories from the server; using defaults.";
  }
}

categoriesEl.addEventListener("change", (event) => {
  const stillChecked = categoriesEl.querySelectorAll("input:checked").length > 0;
  if (!stillChecked && event.target instanceof HTMLInputElement) {
    // Keep the game always able to produce a prompt: never allow the last
    // checked category to be unchecked.
    event.target.checked = true;
    statusEl.textContent = "Keep at least one chord category selected.";
  }
});

/**
 * Read which player mode radio is currently selected.
 * @returns {"solo"|"league"} "solo" if none is checked yet.
 */
function playerMode() {
  return playerModeEl.querySelector("input:checked")?.value || "solo";
}

/**
 * Update the player-panel status line.
 * @param {string} text - Message to display.
 * @param {boolean} [isError] - Whether to style it as an error.
 */
function setPlayerStatus(text, isError = false) {
  playerStatusEl.textContent = text;
  playerStatusEl.classList.toggle("is-error", isError);
}

/** Show/hide the name + avatar builder panel based on the selected player mode. */
function updatePlayerJoinVisibility() {
  playerJoinEl.hidden = playerMode() !== "league";
}

/** Redraw the live avatar preview from the current in-progress avatar. */
function renderAvatarPreview() {
  avatarPreviewEl.innerHTML = renderAvatarMarkup(currentAvatar, 90);
}

/**
 * Sync one trait row's swatch buttons to reflect the current avatar's
 * choice for that field.
 * @param {string} field - Avatar field, e.g. "skin".
 */
function updateSwatchSelection(field) {
  const row = avatarRows[field];
  if (!row) {
    return;
  }
  row.querySelectorAll("[data-value]").forEach((button) => {
    button.classList.toggle("is-selected", button.dataset.value === currentAvatar[field]);
  });
}

/**
 * Update one field of the in-progress avatar and refresh its swatch row
 * and the live preview.
 * @param {string} field - Avatar field to update, e.g. "hairStyle".
 * @param {string} value - New trait ID for that field.
 */
function setAvatarTrait(field, value) {
  currentAvatar = { ...currentAvatar, [field]: value };
  updateSwatchSelection(field);
  renderAvatarPreview();
}

/**
 * Build the clickable swatch/label buttons for every avatar trait row,
 * from AVATAR_TRAITS, and select whichever matches the current avatar.
 */
function buildAvatarSwatches() {
  Object.entries(avatarRows).forEach(([field, row]) => {
    if (!row) {
      return;
    }
    row.innerHTML = "";
    AVATAR_TRAITS[field].forEach((option) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.value = option.id;
      button.title = option.label;
      button.setAttribute("aria-label", option.label);

      if (option.color) {
        button.className = "swatch";
        button.style.background = option.color;
      } else {
        button.className = "swatch-label";
        button.textContent = option.label;
      }

      button.addEventListener("click", () => setAvatarTrait(field, option.id));
      row.appendChild(button);
    });
    updateSwatchSelection(field);
  });
}

/**
 * Join (or re-join) the Chord League with the current name/avatar.
 * @param {string} name - Player display name.
 * @param {object} [options]
 * @param {boolean} [options.silent] - If true, skip the "Joining…" status
 *   message (used for the automatic rejoin on page load).
 * @returns {Promise<void>}
 */
async function joinLeague(name, { silent = false } = {}) {
  if (!silent) {
    setPlayerStatus("Joining the Chord League…");
  }

  try {
    const response = await fetch("/api/players", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, avatar: currentAvatar })
    });
    if (!response.ok) {
      throw new Error(`status ${response.status}`);
    }

    const player = await response.json();
    activePlayer = player.name;
    // Adopt the server's sanitized avatar as canonical, in case anything
    // was normalized, then reflect it back in the builder.
    currentAvatar = sanitizeAvatar(player.avatar);
    buildAvatarSwatches();
    renderAvatarPreview();
    playerNameInput.value = player.name;
    localStorage.setItem(PLAYER_NAME_STORAGE_KEY, player.name);
    localStorage.setItem(PLAYER_MODE_STORAGE_KEY, "league");
    localStorage.setItem(PLAYER_AVATAR_STORAGE_KEY, JSON.stringify(currentAvatar));
    setPlayerStatus(`Playing as ${player.name} — scores count toward the Chord League.`);
    loadStats();
    loadLeaderboard();
  } catch (error) {
    activePlayer = null;
    setPlayerStatus("Could not join the Chord League; check the server connection.", true);
  }
}

playerModeEl.addEventListener("change", () => {
  const mode = playerMode();
  updatePlayerJoinVisibility();
  localStorage.setItem(PLAYER_MODE_STORAGE_KEY, mode);

  if (mode === "solo") {
    activePlayer = null;
    setPlayerStatus("Practice mode: scores stay local and off the leaderboard.");
    loadStats();
    return;
  }

  playerNameInput.focus();
  const savedName = playerNameInput.value.trim();
  if (savedName) {
    joinLeague(savedName, { silent: true });
  } else {
    setPlayerStatus("Enter a name and click Join to add your scores to the Chord League.");
  }
});

joinLeagueButton.addEventListener("click", () => {
  const name = playerNameInput.value.trim();
  if (!name) {
    setPlayerStatus("Enter a name first.", true);
    return;
  }
  joinLeague(name);
});

playerNameInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    joinLeagueButton.click();
  }
});

Object.entries(keyMap).forEach(([key, note]) => {
  const button = document.createElement("button");
  button.textContent = `${noteNames[note % 12]} ${key.toUpperCase()}`;
  button.dataset.note = String(note);
  button.type = "button";
  button.setAttribute("aria-label", `Play ${noteNames[note % 12]}`);
  keysEl.appendChild(button);
});

/**
 * Read which chord category checkboxes are currently checked.
 * @returns {string[]} The checked category ids, in DOM order.
 */
function selectedCategories() {
  return [...categoriesEl.querySelectorAll("input:checked")].map((input) => input.value);
}

/**
 * Read which recognition mode radio is currently selected.
 * @returns {"held"|"arpeggio"} "held" if none is checked yet.
 */
function recognitionMode() {
  return recognitionModeEl.querySelector("input:checked")?.value || "held";
}

/**
 * Get the note name for a MIDI note number, ignoring octave.
 * @param {number} note - A MIDI note number.
 * @returns {string} The note name, e.g. "C#".
 */
function midiToName(note) {
  return noteNames[((note % 12) + 12) % 12];
}

/**
 * Convert a MIDI note number to its frequency in Hz (A4 = 69 = 440Hz).
 * @param {number} note - A MIDI note number.
 * @returns {number} Frequency in Hz.
 */
function midiToFrequency(note) {
  return 440 * 2 ** ((note - 69) / 12);
}

/**
 * Format a list of MIDI notes as a human-readable string.
 * @param {number[]} notes - MIDI note numbers.
 * @returns {string} Note names joined by " - ", or "none" if empty.
 */
function notesText(notes) {
  return notes.map(midiToName).join(" - ") || "none";
}

/**
 * Check whether two note names share the same pitch class (e.g. "C#" and
 * "Db").
 * @param {string} left - A note name.
 * @param {string} right - Another note name.
 * @returns {boolean} True if they're enharmonically the same pitch class.
 */
function sameRoot(left, right) {
  return noteNameToPitchClass[left] === noteNameToPitchClass[right];
}

/** Refresh the target-chord HUD (symbol, formula) from the current prompt, and re-render the notes line. */
function renderTargetPrompt() {
  if (!targetPrompt) {
    targetEl.textContent = "Select and start";
    arrivalChordEl.textContent = "Waiting";
    formulaEl.textContent = "";
    return;
  }

  targetEl.textContent = targetPrompt.symbol;
  arrivalChordEl.textContent = targetPrompt.symbol;
  formulaEl.textContent = targetPrompt.formula ? `Formula ${targetPrompt.formula}` : "";
  renderNotes();
}

/**
 * Fetch a new random chord prompt for the selected categories and render it.
 * @returns {Promise<void>}
 */
async function fetchPrompt() {
  const categories = selectedCategories();
  const query = encodeURIComponent(categories.length ? categories.join(",") : "major");
  const response = await fetch(`/api/prompt?categories=${query}`);
  const data = await response.json();
  targetPrompt = data.prompt;
  promptShownAt = performance.now();
  renderTargetPrompt();
}

/**
 * Check whether a recognized chord matches the current target prompt.
 * @param {object|null} chord - Result from /api/recognize (or null).
 * @returns {boolean} True if the family, root, and (for inversion
 *   prompts) inversion all match.
 */
function isCorrectChord(chord) {
  if (!chord || !targetPrompt) {
    return false;
  }

  const familyMatches = chord.family_id === targetPrompt.family_id;
  const rootMatches = sameRoot(chord.root, targetPrompt.root);
  const inversionMatches =
    targetPrompt.category !== "inversions" || chord.inversion === targetPrompt.inversion;

  return familyMatches && rootMatches && inversionMatches;
}

/**
 * Ask the backend to recognize the currently held/played notes, update the
 * "Detected" HUD, and (while a game is active) score it as correct/wrong.
 * Debounced/rate-limited by the caller (renderNotes) and internally
 * throttled to at most one request per 180ms.
 * @param {number[]} notes - MIDI notes currently considered "played" for
 *   the active recognition mode.
 * @returns {Promise<void>}
 */
async function recognize(notes) {
  const neededNotes = Math.max(3, targetPrompt?.midi_notes?.length || 3);
  if (notes.length < neededNotes || performance.now() - lastRecognitionAt < 180) {
    return;
  }

  lastRecognitionAt = performance.now();
  const response = await fetch(`/api/recognize?notes=${notes.join(",")}&mode=${recognitionMode()}`);
  const data = await response.json();
  detectedChord = data.chord;
  chordEl.textContent = detectedChord ? detectedChord.symbol : "Unknown";
  notesEl.textContent = `Notes: ${notesText(notes)}`;

  if (gameRunning && !resolving && !paused) {
    if (isCorrectChord(detectedChord)) {
      correctAnswer();
      return;
    }

    playWrongChordSound();
    statusEl.textContent = "Try again before it arrives.";
  }
}

/**
 * Recompute which notes count toward recognition (depends on recognition
 * mode), update the notes/piano-key UI, and kick off a debounced
 * recognize() call once at least 3 notes are in play.
 */
function renderNotes() {
  const recognitionNotes =
    recognitionMode() === "arpeggio"
      ? [...arpeggioNotes.keys()]
      : activeNoteOrder.filter((note) => activeNotes.has(note));
  const displayNotes = [...recognitionNotes].sort((a, b) => a - b);
  notesEl.textContent = `Notes: ${notesText(displayNotes)}`;

  document.querySelectorAll("[data-note]").forEach((button) => {
    const note = Number(button.dataset.note);
    button.classList.toggle("active", activeNotes.has(note));
  });

  if (recognitionNotes.length < 3) {
    chordEl.textContent = "Listening";
    detectedChord = null;
    if (recognitionTimer) {
      clearTimeout(recognitionTimer);
      recognitionTimer = null;
    }
    return;
  }

  // Debounce recognition briefly to allow multiple near-simultaneous
  // MIDI note-on messages to arrive (many keyboards send notes slightly
  // staggered). This helps capture all 4 notes for seventh chords.
  if (recognitionTimer) {
    clearTimeout(recognitionTimer);
  }
  const notesToRecognize = [...recognitionNotes];
  recognitionTimer = setTimeout(() => {
    recognitionTimer = null;
    recognize(notesToRecognize);
  }, 50);
}

/**
 * Drop arpeggio notes older than ARPEGGIO_WINDOW_MS, so a chord "expires"
 * if its notes weren't all played close together.
 * @param {number} [now] - Current timestamp (performance.now()-style);
 *   overridable for testability.
 */
function pruneArpeggioNotes(now = performance.now()) {
  arpeggioNotes.forEach((playedAt, note) => {
    if (now - playedAt > ARPEGGIO_WINDOW_MS) {
      arpeggioNotes.delete(note);
    }
  });
}

/** (Re)schedule clearing all arpeggio notes once the arpeggio window has fully elapsed since the last note. */
function scheduleArpeggioReset() {
  if (arpeggioResetTimer) {
    window.clearTimeout(arpeggioResetTimer);
  }

  arpeggioResetTimer = window.setTimeout(() => {
    arpeggioNotes.clear();
    renderNotes();
  }, ARPEGGIO_WINDOW_MS + 80);
}

/**
 * Get (creating and resuming if needed) the shared AudioContext used for
 * the computer-keyboard piano sound and the correct/wrong/game-over cues.
 * @returns {AudioContext|null} The audio context, or null if the Web
 *   Audio API isn't supported by this browser.
 */
function createKeyboardAudio() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;

  if (!AudioContextClass) {
    statusEl.textContent = "Browser audio is not supported here.";
    return null;
  }

  if (!keyboardAudioContext) {
    keyboardAudioContext = new AudioContextClass();
    keyboardMasterGain = keyboardAudioContext.createGain();
    keyboardMasterGain.gain.value = 0.65;
    keyboardMasterGain.connect(keyboardAudioContext.destination);
  }

  if (keyboardAudioContext.state === "suspended") {
    keyboardAudioContext.resume();
  }

  return keyboardAudioContext;
}

/**
 * Start a synthesized piano-like tone for a note, if one isn't already
 * playing for it. Used for the computer-keyboard input mode.
 * @param {number} note - MIDI note number to play.
 */
function startKeyboardTone(note) {
  if (keyboardTones.has(note)) {
    return;
  }

  const audio = createKeyboardAudio();
  if (!audio || !keyboardMasterGain) {
    return;
  }

  const now = audio.currentTime;
  const frequency = midiToFrequency(note);
  const toneGain = audio.createGain();
  const filter = audio.createBiquadFilter();
  const body = audio.createOscillator();
  const sparkle = audio.createOscillator();
  const bodyGain = audio.createGain();
  const sparkleGain = audio.createGain();

  body.type = "triangle";
  body.frequency.setValueAtTime(frequency, now);

  sparkle.type = "sine";
  sparkle.frequency.setValueAtTime(frequency * 2.01, now);

  bodyGain.gain.value = 0.78;
  sparkleGain.gain.value = 0.22;

  filter.type = "lowpass";
  filter.frequency.setValueAtTime(4200, now);
  filter.frequency.exponentialRampToValueAtTime(1500, now + 0.35);

  toneGain.gain.setValueAtTime(0.0001, now);
  toneGain.gain.exponentialRampToValueAtTime(0.42, now + 0.012);
  toneGain.gain.exponentialRampToValueAtTime(0.18, now + 0.22);

  body.connect(bodyGain);
  sparkle.connect(sparkleGain);
  bodyGain.connect(filter);
  sparkleGain.connect(filter);
  filter.connect(toneGain);
  toneGain.connect(keyboardMasterGain);

  body.start(now);
  sparkle.start(now);
  keyboardTones.set(note, { body, sparkle, toneGain });
}

/**
 * Fade out and stop the synthesized tone for a note, if one is playing.
 * @param {number} note - MIDI note number to stop.
 */
function stopKeyboardTone(note) {
  const tone = keyboardTones.get(note);
  if (!tone || !keyboardAudioContext) {
    return;
  }

  const now = keyboardAudioContext.currentTime;
  tone.toneGain.gain.cancelScheduledValues(now);
  tone.toneGain.gain.setTargetAtTime(0.0001, now, 0.055);
  tone.body.stop(now + 0.28);
  tone.sparkle.stop(now + 0.28);
  keyboardTones.delete(note);
}

/** Stop every currently playing synthesized keyboard tone. */
function stopAllKeyboardTones() {
  [...keyboardTones.keys()].forEach(stopKeyboardTone);
}

/** Play the "game over" cue (spoken via speech synthesis if available, else a synthesized falling tone) when the obstacle is missed. */
function playGameOverSound() {
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
    const gameOver = new SpeechSynthesisUtterance("game over");
    gameOver.lang = "en-US";
    gameOver.volume = 1;
    gameOver.rate = 0.92;
    gameOver.pitch = 0.8;
    window.speechSynthesis.speak(gameOver);
    return;
  }

  const audio = createKeyboardAudio();
  if (!audio || !keyboardMasterGain) {
    return;
  }

  const now = audio.currentTime;
  const voiceGain = audio.createGain();
  const cry = audio.createOscillator();
  const bump = audio.createOscillator();
  const filter = audio.createBiquadFilter();

  cry.type = "sawtooth";
  cry.frequency.setValueAtTime(520, now);
  cry.frequency.exponentialRampToValueAtTime(190, now + 0.28);

  bump.type = "triangle";
  bump.frequency.setValueAtTime(96, now);
  bump.frequency.exponentialRampToValueAtTime(58, now + 0.16);

  filter.type = "bandpass";
  filter.frequency.setValueAtTime(820, now);
  filter.Q.value = 5;

  voiceGain.gain.setValueAtTime(0.0001, now);
  voiceGain.gain.exponentialRampToValueAtTime(0.5, now + 0.015);
  voiceGain.gain.exponentialRampToValueAtTime(0.04, now + 0.32);

  cry.connect(filter);
  bump.connect(filter);
  filter.connect(voiceGain);
  voiceGain.connect(keyboardMasterGain);

  cry.start(now);
  bump.start(now);
  cry.stop(now + 0.34);
  bump.stop(now + 0.18);
}

/**
 * Play the "wrong chord" cue (a random spoken taunt via speech synthesis
 * if available, else a synthesized descending square-wave riff), rate
 * limited to once per 520ms so rapid wrong notes don't overlap it.
 */
function playWrongChordSound() {
  const nowMs = performance.now();
  if (nowMs - lastWrongSoundAt < 520) {
    return;
  }
  lastWrongSoundAt = nowMs;

  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
    const phrase = WRONG_PHRASES[Math.floor(Math.random() * WRONG_PHRASES.length)];
    const utterance = new SpeechSynthesisUtterance(phrase);
    utterance.lang = "en-US";
    utterance.volume = 1;
    utterance.rate = 1;
    utterance.pitch = 1.15;
    window.speechSynthesis.speak(utterance);
    return;
  }

  const audio = createKeyboardAudio();
  if (!audio || !keyboardMasterGain) {
    return;
  }

  const notes = [
    { start: 0, frequency: 360, duration: 0.1 },
    { start: 0.11, frequency: 260, duration: 0.09 },
    { start: 0.2, frequency: 220, duration: 0.09 },
    { start: 0.29, frequency: 180, duration: 0.12 }
  ];

  notes.forEach(({ start, frequency, duration }) => {
    const startAt = audio.currentTime + start;
    const endAt = startAt + duration;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    const filter = audio.createBiquadFilter();

    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(frequency, startAt);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.82, endAt);

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1400, startAt);
    filter.Q.value = 2;

    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(0.78, startAt + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, endAt);

    oscillator.connect(filter);
    filter.connect(gain);
    gain.connect(keyboardMasterGain);
    oscillator.start(startAt);
    oscillator.stop(endAt + 0.02);
  });
}

/**
 * Register a note as currently held/played: updates active-note tracking
 * (and the arpeggio window, if that mode is active), optionally plays a
 * synthesized tone, and re-renders the notes/recognition UI.
 * @param {number} note - MIDI note number.
 * @param {boolean} [playSound] - Whether to also start a synthesized tone
 *   (true for computer-keyboard input; MIDI input has its own sound).
 */
function noteOn(note, playSound = false) {
  activeNotes.add(note);
  if (!activeNoteOrder.includes(note)) {
    activeNoteOrder.push(note);
  }
  if (recognitionMode() === "arpeggio") {
    pruneArpeggioNotes();
    arpeggioNotes.set(note, performance.now());
    scheduleArpeggioReset();
  }
  if (playSound) {
    startKeyboardTone(note);
  }
  renderNotes();
}

/**
 * Register a note as released: stops tracking it, stops its tone, and
 * re-renders the notes/recognition UI.
 * @param {number} note - MIDI note number.
 */
function noteOff(note) {
  activeNotes.delete(note);
  const orderIndex = activeNoteOrder.indexOf(note);
  if (orderIndex !== -1) {
    activeNoteOrder.splice(orderIndex, 1);
  }
  stopKeyboardTone(note);
  renderNotes();
}

/**
 * Reset all note-tracking state: clears held/arpeggio notes, cancels
 * pending timers, stops every synthesized tone, and re-renders the notes
 * UI. Called on mode switches, window blur, and between rounds.
 */
function clearActiveNotes() {
  activeNotes.clear();
  activeNoteOrder.length = 0;
  arpeggioNotes.clear();
  if (arpeggioResetTimer) {
    window.clearTimeout(arpeggioResetTimer);
    arpeggioResetTimer = null;
  }
  stopAllKeyboardTones();
  if (recognitionTimer) {
    clearTimeout(recognitionTimer);
    recognitionTimer = null;
  }
  renderNotes();
}

/**
 * Build the mastery-tracking key for the current target prompt.
 * @returns {string|null} "category:family_id", or null if there's no
 *   active prompt yet.
 */
function attemptKey() {
  return targetPrompt ? `${targetPrompt.category}:${targetPrompt.family_id}` : null;
}

/**
 * Report one chord attempt to the backend: updates mastery stats for the
 * current prompt (scoped to the active player, or the shared solo bucket)
 * and, for a League player, their leaderboard total on a correct answer.
 * @param {boolean} correct - Whether the attempt was correct.
 * @param {number} [points] - Points to award on a correct attempt (only
 *   applied when a Chord League player is active).
 * @returns {Promise<void>}
 */
async function recordAttempt(correct, points = 0) {
  const key = attemptKey();
  if (!key) {
    return;
  }

  const responseMs = promptShownAt ? Math.round(performance.now() - promptShownAt) : 0;
  const body = { key, correct, response_ms: responseMs };
  if (activePlayer) {
    body.player = activePlayer;
    body.points = points;
  }

  try {
    const response = await fetch("/api/attempt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (response.ok) {
      renderMastery(await response.json());
      if (activePlayer) {
        loadLeaderboard();
      }
    }
  } catch (error) {
    // Practice can continue without the mastery panel; a network hiccup
    // here shouldn't interrupt the game.
  }
}

/**
 * Render the "Mastery by chord type" panel.
 * @param {object[]} stats - Mastery snapshot entries from /api/stats or
 *   /api/attempt, each with key, mastery, successes, attempts, and
 *   average_response_ms.
 */
function renderMastery(stats) {
  if (!masteryGridEl || !Array.isArray(stats)) {
    return;
  }

  if (!stats.length) {
    masteryGridEl.textContent = "Play a few chords to build your mastery stats.";
    return;
  }

  masteryGridEl.innerHTML = "";
  [...stats]
    .sort((a, b) => b.mastery - a.mastery)
    .forEach((entry) => {
      const label = familyLabelByKey.get(entry.key) || entry.key;
      const item = document.createElement("div");
      item.className = "mastery-item";
      item.innerHTML = `
        <span>${label}</span>
        <strong>${entry.mastery}%</strong>
        <small>${entry.successes}/${entry.attempts} correct · avg ${entry.average_response_ms} ms</small>
      `;
      masteryGridEl.appendChild(item);
    });
}

/**
 * Fetch and render the mastery snapshot for the active player (or the
 * shared solo bucket if practicing solo).
 * @returns {Promise<void>}
 */
async function loadStats() {
  try {
    const query = activePlayer ? `?player=${encodeURIComponent(activePlayer)}` : "";
    const response = await fetch(`/api/stats${query}`);
    if (response.ok) {
      renderMastery(await response.json());
    }
  } catch (error) {
    // Mastery panel just stays at its placeholder text.
  }
}

const PODIUM_MEDALS = ["🥇", "🥈", "🥉"];

/**
 * Check whether a leaderboard entry's name matches the active player (for
 * highlighting "your" row).
 * @param {string} entryName - Name on the leaderboard entry.
 * @returns {boolean} True if it's (approximately) the active player.
 */
function isYou(entryName) {
  if (!activePlayer) {
    return false;
  }
  return String(entryName).trim().toLowerCase() === activePlayer.trim().toLowerCase();
}

/**
 * Build a small element containing a leaderboard entry's rendered avatar.
 * @param {object} entry - A leaderboard entry with an `avatar` field.
 * @param {string} className - CSS class for the wrapper (also picks the
 *   rendered size: "podium-avatar" is larger than any other class).
 * @returns {HTMLSpanElement} The wrapper element, ready to append.
 */
function avatarThumb(entry, className) {
  const wrap = document.createElement("span");
  wrap.className = className;
  // Avatar traits are enumerated IDs looked up against a fixed table in
  // avatar.js — never raw entry data — so this innerHTML is safe even
  // though `entry` itself came from another player's join request.
  wrap.innerHTML = renderAvatarMarkup(entry.avatar, className === "podium-avatar" ? 56 : 32);
  return wrap;
}

/**
 * Render the top-3 podium (medal, avatar, name, score per place).
 * @param {object[]} topThree - Up to 3 leaderboard entries, ranked first.
 *   Missing places (fewer than 3 players) render as hidden slots.
 */
function renderPodium(topThree) {
  if (!leaderboardPodiumEl) {
    return;
  }

  leaderboardPodiumEl.innerHTML = "";
  if (!topThree.length) {
    leaderboardPodiumEl.hidden = true;
    return;
  }
  leaderboardPodiumEl.hidden = false;

  // Visual order is 2nd / 1st / 3rd (classic podium), controlled by the
  // podium-1/2/3 CSS classes regardless of DOM order.
  [0, 1, 2].forEach((rankIndex) => {
    const entry = topThree[rankIndex];
    const place = document.createElement("div");
    place.className = `podium-place podium-${rankIndex + 1}`;
    if (!entry) {
      place.hidden = true;
      leaderboardPodiumEl.appendChild(place);
      return;
    }
    if (isYou(entry.name)) {
      place.classList.add("is-you");
    }

    const medal = document.createElement("span");
    medal.className = "podium-medal";
    medal.textContent = PODIUM_MEDALS[rankIndex];

    const name = document.createElement("span");
    name.className = "podium-name";
    name.textContent = entry.name;

    const score = document.createElement("strong");
    score.className = "podium-score";
    score.textContent = `${entry.total_score} pts`;

    place.append(medal, avatarThumb(entry, "podium-avatar"), name, score);
    leaderboardPodiumEl.appendChild(place);
  });
}

function renderLeaderboardList(rest, startingRank) {
  if (!rest.length) {
    if (startingRank === 1) {
      leaderboardGridEl.textContent = "No Chord League scores yet — be the first to join!";
    } else {
      leaderboardGridEl.innerHTML = "";
    }
    return;
  }

  // Player names are user-supplied, so every row is built with DOM APIs
  // and textContent (never innerHTML) for the name to keep it from being
  // interpreted as markup.
  leaderboardGridEl.innerHTML = "";

  rest.forEach((entry, index) => {
    const item = document.createElement("div");
    item.className = "leaderboard-item";
    if (isYou(entry.name)) {
      item.classList.add("is-you");
    }

    const rank = document.createElement("span");
    rank.className = "leaderboard-rank-badge";
    rank.textContent = String(startingRank + index);

    const info = document.createElement("div");
    info.className = "leaderboard-info";
    const name = document.createElement("span");
    name.className = "leaderboard-name";
    name.textContent = entry.name;
    const meta = document.createElement("small");
    meta.textContent = `${entry.chords_correct}/${entry.chords_played} correct · ${Math.round(entry.accuracy * 100)}% accuracy`;
    info.append(name, meta);

    const score = document.createElement("strong");
    score.className = "leaderboard-score";
    score.textContent = `${entry.total_score} pts`;

    item.append(rank, avatarThumb(entry, "leaderboard-avatar"), info, score);
    leaderboardGridEl.appendChild(item);
  });
}

function renderLeaderboard(entries) {
  if (!leaderboardGridEl || !Array.isArray(entries)) {
    return;
  }

  renderPodium(entries.slice(0, 3));
  renderLeaderboardList(entries.slice(3), 4);
}

async function loadLeaderboard() {
  try {
    const response = await fetch("/api/leaderboard");
    if (response.ok) {
      renderLeaderboard(await response.json());
    }
  } catch (error) {
    // Leaderboard panel just stays at its placeholder text.
  }
}

function correctAnswer() {
  resolving = true;
  const pointsEarned = Math.round(100 * speed);
  score += pointsEarned;
  statusEl.textContent = "Correct chord. Clean jump!";
  updateHud();
  recordAttempt(true, pointsEarned);
  scene.playCorrectAnswer();

  window.setTimeout(async () => {
    clearActiveNotes();
    scene.nextRound();
    await fetchPrompt();
    resolving = false;
  }, 650);
}

function missChord() {
  if (resolving || !gameRunning || paused) {
    return;
  }

  // The scene already played the hit reaction (recoil, screen-shake, dust)
  // the moment its own collision check fired; this just handles scoring,
  // status text and getting the next prompt.
  resolving = true;
  playGameOverSound();
  statusEl.textContent = "Missed chord. Try the next one.";
  updateHud();
  recordAttempt(false);

  window.setTimeout(async () => {
    scene.nextRound();
    await fetchPrompt();
    resolving = false;
  }, 700);
}

function updateHud() {
  scoreEl.textContent = `${score} pts`;
  metaEl.textContent = `Speed ${speed.toFixed(1)}`;
  speedValueEl.textContent = speed.toFixed(1);
}

function updateSpeedFromSlider() {
  speed = Number(speedSlider.value);
  updateHud();
}

function setPauseButtonState(isPaused) {
  pauseButton.innerHTML = isPaused
    ? '<span class="control-icon" aria-hidden="true">▶</span> Resume'
    : '<span class="control-icon" aria-hidden="true">❚❚</span> Pause';
  pauseButton.classList.toggle("is-paused", isPaused);
}

function togglePause() {
  if (!gameRunning) {
    return;
  }

  paused = !paused;
  setPauseButtonState(paused);
  statusEl.textContent = paused
    ? "Paused. Click Resume when you're ready to keep playing."
    : "Resumed. Play the displayed chord before the obstacle arrives.";
}

async function startGame() {
  if (!inputMode) {
    statusEl.textContent = "Choose USB MIDI or computer keyboard before starting.";
    return;
  }
  if (inputMode === "midi" && !midiReady) {
    statusEl.textContent = "USB MIDI is selected, but no MIDI input is detected yet.";
    return;
  }

  score = 0;
  updateSpeedFromSlider();
  createKeyboardAudio();
  resolving = false;
  paused = false;
  setPauseButtonState(false);
  pauseButton.disabled = false;
  gameRunning = true;
  scene.start();
  statusEl.textContent = "Run started. Play the displayed chord before the obstacle arrives.";
  updateHud();
  await fetchPrompt();
}

function stopGame() {
  gameRunning = false;
  resolving = false;
  paused = false;
  setPauseButtonState(false);
  pauseButton.disabled = true;
  clearActiveNotes();
  scene.stop();
  statusEl.textContent = "Game stopped. Start again when ready.";
  updateHud();
}

function setInputMode(mode) {
  inputMode = mode;
  midiButton.classList.toggle("selected", mode === "midi");
  keyboardButton.classList.toggle("selected", mode === "keyboard");
}

function midiInputName(input) {
  return input.name || input.manufacturer || "USB MIDI device";
}

function handleMidiMessage(event) {
  if (inputMode !== "midi") {
    return;
  }

  const [command, note, velocity] = event.data;
  const type = command & 0xf0;

  if (type === 0x90 && velocity > 0) {
    noteOn(note);
  }

  if (type === 0x80 || (type === 0x90 && velocity === 0)) {
    noteOff(note);
  }
}

function connectMidiInputs() {
  if (!midiAccess) {
    return [];
  }

  const inputs = [...midiAccess.inputs.values()];
  inputs.forEach((input) => {
    input.onmidimessage = handleMidiMessage;
  });

  return inputs;
}

function updateMidiStatus() {
  if (inputMode !== "midi") {
    return;
  }

  const inputs = connectMidiInputs();

  if (!inputs.length) {
    midiReady = false;
    inputStatusEl.textContent = "USB MIDI: no input detected";
    statusEl.textContent =
      "No USB MIDI input detected. Plug in the keyboard, keep it powered on, then click Use USB MIDI again.";
    midiButtonLabel.textContent = "Retry USB MIDI";
    clearActiveNotes();
    return;
  }

  const names = inputs.map(midiInputName).join(", ");
  midiReady = true;
  inputStatusEl.textContent = `USB MIDI: ${inputs.length} input${inputs.length === 1 ? "" : "s"} connected`;
  statusEl.textContent = `USB MIDI ready: ${names}. Play your piano keyboard.`;
  midiButtonLabel.textContent = "Refresh USB MIDI";
}

async function enableMidi() {
  setInputMode("midi");
  midiReady = false;
  clearActiveNotes();

  if (!navigator.requestMIDIAccess) {
    statusEl.textContent = "Web MIDI is not supported by this browser. Try Chrome or Edge.";
    inputStatusEl.textContent = "USB MIDI: unsupported browser";
    return;
  }

  inputStatusEl.textContent = "USB MIDI: requesting access";

  try {
    midiAccess = await navigator.requestMIDIAccess({ sysex: false });
    midiAccess.onstatechange = () => {
      updateMidiStatus();
    };
    updateMidiStatus();
  } catch (error) {
    const denied = error?.name === "SecurityError" || error?.name === "NotAllowedError";
    inputStatusEl.textContent = denied ? "USB MIDI: permission denied" : "USB MIDI: connection failed";
    statusEl.textContent = denied
      ? "USB MIDI permission was blocked. Allow MIDI access in the browser prompt or site settings, then retry."
      : "USB MIDI could not start. Check the cable, keyboard power, and browser MIDI permissions, then retry.";
  }
}

function enableKeyboard() {
  setInputMode("keyboard");
  midiReady = false;
  clearActiveNotes();
  createKeyboardAudio();
  inputStatusEl.textContent = "Computer keyboard: QWERTZ mode active";
  statusEl.textContent = "Computer keyboard ready with piano sound. Use A W S E D F T G Z H U J K.";
}

window.addEventListener("keydown", (event) => {
  if (inputMode !== "keyboard") {
    return;
  }

  const note = keyMap[event.key.toLowerCase()];
  if (note !== undefined && !event.repeat) {
    event.preventDefault();
    noteOn(note, true);
  }
});

window.addEventListener("keyup", (event) => {
  if (inputMode !== "keyboard") {
    return;
  }

  const note = keyMap[event.key.toLowerCase()];
  if (note !== undefined) {
    event.preventDefault();
    noteOff(note);
  }
});

window.addEventListener("blur", clearActiveNotes);

keysEl.addEventListener("pointerdown", (event) => {
  if (inputMode !== "keyboard") {
    statusEl.textContent = "Select computer keyboard mode to use the on-screen keys.";
    return;
  }

  const button = event.target.closest("[data-note]");
  if (!button) {
    return;
  }

  button.setPointerCapture(event.pointerId);
  noteOn(Number(button.dataset.note), true);
});

keysEl.addEventListener("pointerup", (event) => {
  if (inputMode !== "keyboard") {
    return;
  }

  const button = event.target.closest("[data-note]");
  if (button) {
    noteOff(Number(button.dataset.note));
  }
});

keysEl.addEventListener("pointercancel", (event) => {
  if (inputMode !== "keyboard") {
    return;
  }

  const button = event.target.closest("[data-note]");
  if (button) {
    noteOff(Number(button.dataset.note));
  }
});

startButton.addEventListener("click", startGame);
pauseButton.addEventListener("click", togglePause);
stopButton.addEventListener("click", stopGame);
midiButton.addEventListener("click", enableMidi);
keyboardButton.addEventListener("click", enableKeyboard);
speedSlider.addEventListener("input", updateSpeedFromSlider);
resetStatsButton.addEventListener("click", async () => {
  if (!window.confirm("Reset your chord mastery stats?")) {
    return;
  }

  try {
    const query = activePlayer ? `?player=${encodeURIComponent(activePlayer)}` : "";
    const response = await fetch(`/api/stats/reset${query}`, { method: "POST" });
    if (response.ok) {
      renderMastery(await response.json());
    }
  } catch (error) {
    statusEl.textContent = "Could not reset stats; check the server connection.";
  }
});
recognitionModeEl.addEventListener("change", () => {
  clearActiveNotes();
  chordEl.textContent = "Listening";
  statusEl.textContent =
    recognitionMode() === "arpeggio"
      ? "Arpeggio recognition active. Play the notes one after another."
      : "Held chord recognition active. Hold the notes together.";
});

scene.configure({
  isRunning: () => gameRunning && !paused,
  isResolving: () => resolving,
  getSpeed: () => speed,
  getLabel: () => targetPrompt?.symbol || "Chord",
  getStatusLabel: () => {
    if (!gameRunning) {
      return "Press Start game";
    }
    return paused ? "Paused" : "Play the arriving chord";
  }
});
// The scene reports a miss the instant its own collision check fires (and
// plays the hit reaction itself); this just hands control back to the
// game/network logic above.
scene.onMiss = () => missChord();

// Restore the last-used player name/mode/avatar so a returning player
// doesn't have to rebuild their profile every session; solo stays the
// safe default.
const savedPlayerName = localStorage.getItem(PLAYER_NAME_STORAGE_KEY);
const savedPlayerMode = localStorage.getItem(PLAYER_MODE_STORAGE_KEY);
const savedAvatarRaw = localStorage.getItem(PLAYER_AVATAR_STORAGE_KEY);
if (savedAvatarRaw) {
  try {
    currentAvatar = sanitizeAvatar(JSON.parse(savedAvatarRaw));
  } catch (error) {
    currentAvatar = { ...DEFAULT_AVATAR };
  }
}
buildAvatarSwatches();
renderAvatarPreview();

if (savedPlayerName) {
  playerNameInput.value = savedPlayerName;
}
if (savedPlayerMode === "league") {
  const leagueRadio = playerModeEl.querySelector('input[value="league"]');
  if (leagueRadio) {
    leagueRadio.checked = true;
  }
}
updatePlayerJoinVisibility();
if (savedPlayerMode === "league" && savedPlayerName) {
  joinLeague(savedPlayerName, { silent: true });
}

updateHud();
renderTargetPrompt();
loadModules();
loadStats();
loadLeaderboard();
scene.begin();
