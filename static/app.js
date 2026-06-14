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
const categoryList = [
  ["major", "Major"],
  ["minor", "Minor"],
  ["sevenths", "7th Chords"],
  ["suspensions", "Suspensions"],
  ["inversions", "Inversions"],
  ["extensions", "Extensions"]
];

const activeNotes = new Set();
const categoriesEl = document.querySelector("#categories");
const notesEl = document.querySelector("#notes");
const chordEl = document.querySelector("#chord");
const keysEl = document.querySelector("#keys");
const statusEl = document.querySelector("#status");
const targetEl = document.querySelector("#target");
const arrivalChordEl = document.querySelector("#arrivalChord");
const targetNotesEl = document.querySelector("#targetNotes");
const arrivalMeterEl = document.querySelector("#arrivalMeter");
const formulaEl = document.querySelector("#formula");
const scoreEl = document.querySelector("#score");
const metaEl = document.querySelector("#meta");
const startButton = document.querySelector("#startButton");
const stopButton = document.querySelector("#stopButton");
const midiButton = document.querySelector("#midiButton");
const keyboardButton = document.querySelector("#keyboardButton");
const inputStatusEl = document.querySelector("#inputStatus");
const speedSlider = document.querySelector("#speedSlider");
const speedValueEl = document.querySelector("#speedValue");
const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");

let targetPrompt = null;
let detectedChord = null;
let gameRunning = false;
let resolving = false;
let score = 0;
let speed = Number(speedSlider.value);
let obstacleX = canvas.width + 80;
let boyY = 0;
let jumpVelocity = 0;
let lastFrame = performance.now();
let lastRecognitionAt = 0;
let recognitionTimer = null;
let midiAccess = null;
let inputMode = null;
let midiReady = false;
let keyboardAudioContext = null;
let keyboardMasterGain = null;
const keyboardTones = new Map();

categoryList.forEach(([id, label]) => {
  const item = document.createElement("label");
  item.className = "category";
  item.innerHTML = `<input type="checkbox" value="${id}" ${id === "major" ? "checked" : ""} /> <span>${label}</span>`;
  categoriesEl.appendChild(item);
});

Object.entries(keyMap).forEach(([key, note]) => {
  const button = document.createElement("button");
  button.textContent = `${noteNames[note % 12]} ${key.toUpperCase()}`;
  button.dataset.note = String(note);
  button.type = "button";
  button.setAttribute("aria-label", `Play ${noteNames[note % 12]}`);
  keysEl.appendChild(button);
});

function selectedCategories() {
  return [...categoriesEl.querySelectorAll("input:checked")].map((input) => input.value);
}

function midiToName(note) {
  return noteNames[((note % 12) + 12) % 12];
}

function midiToFrequency(note) {
  return 440 * 2 ** ((note - 69) / 12);
}

function notesText(notes) {
  return notes.map(midiToName).join(" - ") || "none";
}

function targetPitchClasses() {
  return new Set((targetPrompt?.midi_notes || []).map((note) => note % 12));
}

function renderTargetPrompt() {
  if (!targetPrompt) {
    targetEl.textContent = "Select and start";
    arrivalChordEl.textContent = "Waiting";
    formulaEl.textContent = "";
    targetNotesEl.innerHTML = "";
    return;
  }

  targetEl.textContent = targetPrompt.symbol;
  arrivalChordEl.textContent = targetPrompt.symbol;
  formulaEl.textContent = `${targetPrompt.notes.join(" - ")} | ${targetPrompt.formula}`;
  targetNotesEl.innerHTML = targetPrompt.notes
    .map((note) => `<span>${note}</span>`)
    .join("");
  renderNotes();
}

async function fetchPrompt() {
  const categories = selectedCategories();
  const query = encodeURIComponent(categories.length ? categories.join(",") : "major");
  const response = await fetch(`/api/prompt?categories=${query}`);
  const data = await response.json();
  targetPrompt = data.prompt;
  renderTargetPrompt();
}

function isCorrectChord(chord) {
  if (!chord || !targetPrompt) {
    return false;
  }

  const familyMatches = chord.family_id === targetPrompt.family_id;
  const rootMatches = chord.root === targetPrompt.root;
  const inversionMatches =
    targetPrompt.category !== "inversions" || chord.inversion === targetPrompt.inversion;

  return familyMatches && rootMatches && inversionMatches;
}

async function recognize(notes) {
  if (notes.length < 3 || performance.now() - lastRecognitionAt < 180) {
    return;
  }

  lastRecognitionAt = performance.now();
  const response = await fetch(`/api/recognize?notes=${notes.join(",")}`);
  const data = await response.json();
  detectedChord = data.chord;
  chordEl.textContent = detectedChord ? detectedChord.symbol : "Unknown";
  notesEl.textContent = `Notes: ${notesText(notes)}`;

  if (gameRunning && !resolving && isCorrectChord(detectedChord)) {
    correctAnswer();
  }
}

function renderNotes() {
  const notes = [...activeNotes].sort((a, b) => a - b);
  notesEl.textContent = `Notes: ${notesText(notes)}`;

  document.querySelectorAll("[data-note]").forEach((button) => {
    const note = Number(button.dataset.note);
    button.classList.toggle("active", activeNotes.has(note));
    button.classList.toggle("target-note", targetPitchClasses().has(note % 12));
  });

  if (notes.length < 3) {
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
  recognitionTimer = setTimeout(() => {
    recognitionTimer = null;
    recognize(notes);
  }, 50);
}

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

function stopAllKeyboardTones() {
  [...keyboardTones.keys()].forEach(stopKeyboardTone);
}

function playOuchSound() {
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

function noteOn(note, playSound = false) {
  activeNotes.add(note);
  if (playSound) {
    startKeyboardTone(note);
  }
  renderNotes();
}

function noteOff(note) {
  activeNotes.delete(note);
  stopKeyboardTone(note);
  renderNotes();
}

function clearActiveNotes() {
  activeNotes.clear();
  stopAllKeyboardTones();
  if (recognitionTimer) {
    clearTimeout(recognitionTimer);
    recognitionTimer = null;
  }
  renderNotes();
}

function correctAnswer() {
  resolving = true;
  score += Math.round(100 * speed);
  jumpVelocity = -12;
  statusEl.textContent = "Correct chord. Clean jump!";
  updateHud();

  window.setTimeout(async () => {
    clearActiveNotes();
    obstacleX = canvas.width + 120;
    await fetchPrompt();
    resolving = false;
  }, 650);
}

function missChord() {
  if (resolving || !gameRunning) {
    return;
  }

  resolving = true;
  playOuchSound();
  statusEl.textContent = "Missed chord. Try the next one.";
  updateHud();

  window.setTimeout(async () => {
    obstacleX = canvas.width + 120;
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
  obstacleX = canvas.width + 120;
  boyY = 0;
  jumpVelocity = 0;
  resolving = false;
  gameRunning = true;
  statusEl.textContent = "Run started. Play the displayed chord before the obstacle arrives.";
  updateHud();
  await fetchPrompt();
}

function stopGame() {
  gameRunning = false;
  resolving = false;
  clearActiveNotes();
  obstacleX = canvas.width + 120;
  arrivalMeterEl.style.width = "0%";
  statusEl.textContent = "Game stopped. Start again when ready.";
  updateHud();
}

function drawBoy(x, groundY) {
  const y = groundY - 54 + boyY;
  ctx.fillStyle = "#2e6553";
  ctx.fillRect(x + 12, y + 20, 22, 32);
  ctx.fillStyle = "#f0b37e";
  ctx.beginPath();
  ctx.arc(x + 23, y + 10, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#17211c";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x + 17, y + 52);
  ctx.lineTo(x + 8, y + 72);
  ctx.moveTo(x + 31, y + 52);
  ctx.lineTo(x + 43, y + 72);
  ctx.moveTo(x + 14, y + 32);
  ctx.lineTo(x, y + 44);
  ctx.moveTo(x + 34, y + 32);
  ctx.lineTo(x + 50, y + 28);
  ctx.stroke();
}

function drawObstacle(x, groundY) {
  const label = targetPrompt?.symbol || "Chord";
  ctx.font = "800 20px system-ui";
  const width = Math.max(94, ctx.measureText(label).width + 34);
  const height = 58;
  const y = groundY - height;

  ctx.fillStyle = "#bc4034";
  ctx.fillRect(x, y, width, height);
  ctx.fillStyle = "#fffdf6";
  ctx.textAlign = "center";
  ctx.fillText(label, x + width / 2, y + 36);
  ctx.textAlign = "start";
  ctx.fillStyle = "#7a2e2a";
  ctx.fillRect(x + 10, y - 14, width - 20, 14);
}

function drawGame(now) {
  const delta = Math.min(32, now - lastFrame);
  lastFrame = now;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const groundY = canvas.height - 58;

  ctx.fillStyle = "#dfe7da";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#f8fff7";
  ctx.fillRect(0, groundY, canvas.width, 58);
  ctx.strokeStyle = "#17211c";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, groundY);
  ctx.lineTo(canvas.width, groundY);
  ctx.stroke();

  if (gameRunning) {
    obstacleX -= speed * (delta / 16);
    const start = canvas.width + 120;
    const end = 64;
    const progress = Math.max(0, Math.min(1, (start - obstacleX) / (start - end)));
    arrivalMeterEl.style.width = `${progress * 100}%`;

    if (obstacleX < 86 && obstacleX > 40 && boyY > -22) {
      missChord();
    }
    if (obstacleX < -50) {
      missChord();
      obstacleX = canvas.width + 120;
    }
  }
  if (!gameRunning) {
    arrivalMeterEl.style.width = "0%";
  }

  boyY += jumpVelocity;
  jumpVelocity += 0.72;
  if (boyY > 0) {
    boyY = 0;
    jumpVelocity = 0;
  }

  drawBoy(46, groundY);
  drawObstacle(obstacleX, groundY);

  ctx.fillStyle = "#17211c";
  ctx.font = "700 18px system-ui";
  ctx.fillText(gameRunning ? "Play the arriving chord" : "Press Start game", 24, 34);

  requestAnimationFrame(drawGame);
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
    midiButton.textContent = "Retry USB MIDI";
    clearActiveNotes();
    return;
  }

  const names = inputs.map(midiInputName).join(", ");
  midiReady = true;
  inputStatusEl.textContent = `USB MIDI: ${inputs.length} input${inputs.length === 1 ? "" : "s"} connected`;
  statusEl.textContent = `USB MIDI ready: ${names}. Play your piano keyboard.`;
  midiButton.textContent = "Refresh USB MIDI";
  midiButton.classList.add("selected");
  keyboardButton.classList.remove("selected");
}

async function enableMidi() {
  inputMode = "midi";
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
  inputMode = "keyboard";
  midiReady = false;
  clearActiveNotes();
  createKeyboardAudio();
  inputStatusEl.textContent = "Computer keyboard: QWERTZ mode active";
  statusEl.textContent = "Computer keyboard ready with piano sound. Use A W S E D F T G Z H U J K.";
  keyboardButton.classList.add("selected");
  midiButton.classList.remove("selected");
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
stopButton.addEventListener("click", stopGame);
midiButton.addEventListener("click", enableMidi);
keyboardButton.addEventListener("click", enableKeyboard);
speedSlider.addEventListener("input", updateSpeedFromSlider);

updateHud();
renderTargetPrompt();
requestAnimationFrame(drawGame);
