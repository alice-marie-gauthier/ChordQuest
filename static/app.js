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
  y: 68,
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
const midiButton = document.querySelector("#midiButton");
const micButton = document.querySelector("#micButton");
const midiStatusEl = document.querySelector("#midiStatus");
const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");

let targetPrompt = null;
let detectedChord = null;
let gameRunning = false;
let resolving = false;
let score = 0;
let level = 1;
let lives = 3;
let speed = 2.8;
let obstacleX = canvas.width + 80;
let boyY = 0;
let jumpVelocity = 0;
let lastFrame = performance.now();
let lastRecognitionAt = 0;
let micAnimation = null;
let audioContext = null;
let analyser = null;
let frequencyData = null;
let midiAccess = null;

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
    return;
  }

  recognize(notes);
}

function noteOn(note) {
  activeNotes.add(note);
  renderNotes();
}

function noteOff(note) {
  activeNotes.delete(note);
  renderNotes();
}

function clearActiveNotes() {
  activeNotes.clear();
  renderNotes();
}

function correctAnswer() {
  resolving = true;
  score += 100 + level * 15;
  level += 1;
  speed += 0.45;
  jumpVelocity = -12;
  statusEl.textContent = "Correct chord. Clean jump!";
  updateHud();

  window.setTimeout(async () => {
    activeNotes.clear();
    renderNotes();
    obstacleX = canvas.width + 120;
    await fetchPrompt();
    resolving = false;
  }, 650);
}

function loseLife() {
  if (resolving || !gameRunning) {
    return;
  }

  lives -= 1;
  resolving = true;
  statusEl.textContent = lives > 0 ? "Missed obstacle. Try the next chord." : "Game over. Start again when ready.";
  updateHud();

  if (lives <= 0) {
    gameRunning = false;
    window.setTimeout(() => {
      resolving = false;
    }, 700);
    return;
  }

  window.setTimeout(async () => {
    obstacleX = canvas.width + 120;
    await fetchPrompt();
    resolving = false;
  }, 700);
}

function updateHud() {
  scoreEl.textContent = `${score} pts`;
  metaEl.textContent = `Level ${level} - Lives ${lives} - Speed ${speed.toFixed(1)}`;
}

async function startGame() {
  score = 0;
  level = 1;
  lives = 3;
  speed = 2.8;
  obstacleX = canvas.width + 120;
  boyY = 0;
  jumpVelocity = 0;
  resolving = false;
  gameRunning = true;
  statusEl.textContent = "Run started. Play the displayed chord before the obstacle arrives.";
  updateHud();
  await fetchPrompt();
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
      loseLife();
    }
    if (obstacleX < -50) {
      loseLife();
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
  const inputs = connectMidiInputs();

  if (!inputs.length) {
    midiStatusEl.textContent = "USB MIDI: no input detected";
    statusEl.textContent =
      "No USB MIDI input detected. Plug in the keyboard, keep it powered on, then click Use USB MIDI again.";
    midiButton.textContent = "Retry USB MIDI";
    clearActiveNotes();
    return;
  }

  const names = inputs.map(midiInputName).join(", ");
  midiStatusEl.textContent = `USB MIDI: ${inputs.length} input${inputs.length === 1 ? "" : "s"} connected`;
  statusEl.textContent = `USB MIDI ready: ${names}. Play your piano keyboard.`;
  midiButton.textContent = "Refresh USB MIDI";
}

async function enableMidi() {
  if (!navigator.requestMIDIAccess) {
    statusEl.textContent = "Web MIDI is not supported by this browser. Try Chrome or Edge.";
    midiStatusEl.textContent = "USB MIDI: unsupported browser";
    return;
  }

  midiStatusEl.textContent = "USB MIDI: requesting access";

  try {
    midiAccess = await navigator.requestMIDIAccess({ sysex: false });
    midiAccess.onstatechange = () => {
      updateMidiStatus();
    };
    updateMidiStatus();
  } catch (error) {
    const denied = error?.name === "SecurityError" || error?.name === "NotAllowedError";
    midiStatusEl.textContent = denied ? "USB MIDI: permission denied" : "USB MIDI: connection failed";
    statusEl.textContent = denied
      ? "USB MIDI permission was blocked. Allow MIDI access in the browser prompt or site settings, then retry."
      : "USB MIDI could not start. Check the cable, keyboard power, and browser MIDI permissions, then retry.";
  }
}

function frequencyForMidi(note) {
  return 440 * 2 ** ((note - 69) / 12);
}

function estimateMicNotes() {
  if (!analyser || !frequencyData || !audioContext) {
    return;
  }

  analyser.getByteFrequencyData(frequencyData);
  const sampleRate = audioContext.sampleRate;
  const nyquist = sampleRate / 2;
  const candidates = [];

  for (let midi = 48; midi <= 84; midi += 1) {
    const frequency = frequencyForMidi(midi);
    const bin = Math.round((frequency / nyquist) * frequencyData.length);
    const energy =
      (frequencyData[bin - 1] || 0) + frequencyData[bin] + (frequencyData[bin + 1] || 0);

    if (energy > 95) {
      candidates.push({ midi, pitchClass: midi % 12, energy });
    }
  }

  candidates.sort((a, b) => b.energy - a.energy);
  const notes = [];
  const pitchClasses = [];

  for (const candidate of candidates) {
    if (!pitchClasses.includes(candidate.pitchClass)) {
      pitchClasses.push(candidate.pitchClass);
      notes.push(candidate.midi);
    }
    if (pitchClasses.length >= 5) {
      break;
    }
  }

  notes.sort((a, b) => a - b);
  notesEl.textContent = `Notes: ${notesText(notes)}`;
  recognize(notes);
  micAnimation = requestAnimationFrame(estimateMicNotes);
}

async function enableMicrophone() {
  if (!navigator.mediaDevices?.getUserMedia) {
    statusEl.textContent = "Microphone input is not supported by this browser.";
    return;
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false
    }
  });
  audioContext = new AudioContext();
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 16384;
  frequencyData = new Uint8Array(analyser.frequencyBinCount);
  audioContext.createMediaStreamSource(stream).connect(analyser);
  statusEl.textContent = "Microphone listening. Put the computer close to the piano for best results.";

  if (micAnimation) {
    cancelAnimationFrame(micAnimation);
  }
  estimateMicNotes();
}

window.addEventListener("keydown", (event) => {
  const note = keyMap[event.key.toLowerCase()];
  if (note !== undefined && !event.repeat) {
    noteOn(note);
  }
});

window.addEventListener("keyup", (event) => {
  const note = keyMap[event.key.toLowerCase()];
  if (note !== undefined) {
    noteOff(note);
  }
});

keysEl.addEventListener("pointerdown", (event) => {
  const button = event.target.closest("[data-note]");
  if (!button) {
    return;
  }

  button.setPointerCapture(event.pointerId);
  noteOn(Number(button.dataset.note));
});

keysEl.addEventListener("pointerup", (event) => {
  const button = event.target.closest("[data-note]");
  if (button) {
    noteOff(Number(button.dataset.note));
  }
});

keysEl.addEventListener("pointercancel", (event) => {
  const button = event.target.closest("[data-note]");
  if (button) {
    noteOff(Number(button.dataset.note));
  }
});

startButton.addEventListener("click", startGame);
midiButton.addEventListener("click", enableMidi);
micButton.addEventListener("click", enableMicrophone);

updateHud();
renderTargetPrompt();
requestAnimationFrame(drawGame);
