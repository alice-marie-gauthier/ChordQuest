import { RunnerScene } from "./game/scene.js";
import { AVATAR_TRAITS, DEFAULT_AVATAR, avatarHeadImageSrc, renderAvatarMarkup, sanitizeAvatar } from "./avatar.js";

// Mirrors models/library.py's DEFAULT_TEMPO_BPM; used whenever a custom
// progression doesn't specify (or hasn't yet loaded) its own tempo.
const DEFAULT_TEMPO_BPM = 90;

// The speed slider itself stays a plain 0.5-7 multiplier (unchanged — see
// its min/max/step in index.html, and scene.js's own DEFAULT_SPEED, the
// "1x" reference point it scales a custom progression's real tempo by);
// this only maps that value onto a real musical BPM number for display
// (see updateHud()), so "Speed" reads like an actual tempo instead of an
// arbitrary decimal. The slider's own default (2.8) maps onto
// DEFAULT_TEMPO_BPM (90, a moderato) — matches the exact BPM a fresh page
// load's default custom-progression tempo already uses, so the two only
// ever look inconsistent once a song specifies its own different tempo.
const SPEED_SLIDER_DEFAULT = 2.8;

/**
 * Convert a speed-slider value to a displayable tempo in BPM (see
 * SPEED_SLIDER_DEFAULT).
 * @param {number} speedValue - Raw speed-slider value (0.5-7).
 * @returns {number} An equivalent whole-number BPM for display.
 */
function speedToBpm(speedValue) {
  return Math.round((speedValue / SPEED_SLIDER_DEFAULT) * DEFAULT_TEMPO_BPM);
}

// Mirrors models/chords.py's NOTE_NAMES: flats for every black key except
// F# (matching real fake-book practice), rather than a strict all-sharp or
// all-flat chromatic scale — see that file's own comment for why.
const noteNames = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
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
// "Held" mode recognition works off this rather than activeNotes directly:
// it accumulates every note pressed since the last time all keys were
// released, so releasing one note slightly early (very common on real
// hardware — fingers rarely lift in perfect unison) doesn't drop a
// chord that genuinely was played together. Cleared whenever activeNotes
// goes back to empty, so it never bleeds into the next, unrelated attempt.
const heldPeakNotes = new Set();
// Progressive wrong-chord penalty (see recognize()'s wrong-chord branch):
// each genuinely new wrong attempt on the current prompt costs more than
// the last. wrongAttemptStreak resets every new prompt (fetchPrompt());
// lastWrongSignature is what makes an attempt "new" — it only advances the
// streak when the played notes actually change, so holding one wrong
// chord doesn't rack up penalties every ~180ms just for sitting there.
const WRONG_CHORD_PENALTY_STEP = 10;
let wrongAttemptStreak = 0;
let lastWrongSignature = null;
const categoriesEl = document.querySelector("#categories");
const recognitionModeEl = document.querySelector("#recognitionMode");
const playAreaEl = document.querySelector("#playArea");
const notesEl = document.querySelector("#notes");
const chordEl = document.querySelector("#chord");
const keysEl = document.querySelector("#keys");
const keyboardGuideEl = document.querySelector("#keyboardGuide");
const statusEl = document.querySelector("#status");
const arrivalMeterEl = document.querySelector("#arrivalMeter");
const scoreEl = document.querySelector("#score");
const metaEl = document.querySelector("#meta");
const bestScoreEl = document.querySelector("#bestScore");
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
const progressionFileInput = document.querySelector("#progressionFileInput");
const progressionTitleInput = document.querySelector("#progressionTitleInput");
const progressionTempoInput = document.querySelector("#progressionTempoInput");
const progressionClearButton = document.querySelector("#progressionClearButton");
const progressionStatusEl = document.querySelector("#progressionStatus");
const progressionModeEl = document.querySelector("#progressionMode");
const progressionConfigEl = document.querySelector("#progressionConfig");
const randomPracticeConfigEl = document.querySelector("#randomPracticeConfig");
const progressionSummaryEl = document.querySelector("#progressionSummary");
const librarySourceSelect = document.querySelector("#librarySourceSelect");
const librarySongSelect = document.querySelector("#librarySongSelect");
const libraryLoadButton = document.querySelector("#libraryLoadButton");
const canvas = document.querySelector("#game");
// Place `photo_tete_bonhomme.png` in `static/images/` to use your own
// photo as the runner's head — a personal picture that's deliberately
// git-ignored (see .gitignore), so it's only ever present on a machine
// that put it there and never on a fresh clone or a deployment like
// Render. Root-relative because Image.src resolves against the page's
// URL, not this module's location.
const PERSONAL_HEAD_PHOTO_SRC = "/images/photo_tete_bonhomme.png";

// Picked once per page load and used as the runner's head whenever no
// personal photo is available and the player isn't in the Chord League
// (see updateRunnerHead) — a bit of fun instead of a plain placeholder,
// built from the same SVG avatar system as the League avatar builder
// rather than hotlinking an actual photo from elsewhere on the internet
// (unreliable if the link dies, and murky rights/consent for a public
// deployment).
function randomAvatar() {
  const pickTrait = (field) => {
    const options = AVATAR_TRAITS[field];
    return options[Math.floor(Math.random() * options.length)].id;
  };
  return {
    skin: pickTrait("skin"),
    hairStyle: pickTrait("hairStyle"),
    hairColor: pickTrait("hairColor"),
    accessory: pickTrait("accessory"),
    outfit: pickTrait("outfit"),
    background: pickTrait("background")
  };
}
const sessionRandomAvatar = randomAvatar();

// The runner, the arriving obstacle, particle effects and the parallax
// ground all live in the game/ modules; this scene is the single canvas
// entity the rest of app.js talks to.
const scene = new RunnerScene(canvas, {
  arrivalMeterEl,
  headImageSrc: PERSONAL_HEAD_PHOTO_SRC,
  // The personal photo is missing on any machine that hasn't put one at
  // PERSONAL_HEAD_PHOTO_SRC (Render included) — fall back to the random
  // avatar rather than Runner's own generic placeholder SVG.
  onHeadImageError: () => scene.setHeadImage(avatarHeadImageSrc(sessionRandomAvatar))
});

/**
 * Refresh the runner's on-canvas head to match the active avatar: the
 * Chord League player's own avatar while that mode is selected (live,
 * even before clicking Join, so building the avatar previews it
 * immediately), or the personal photo otherwise — which itself falls back
 * to the random session avatar if it fails to load (see the scene's
 * onHeadImageError above).
 */
function updateRunnerHead() {
  if (playerMode() === "league") {
    scene.setHeadImage(avatarHeadImageSrc(currentAvatar));
  } else {
    scene.setHeadImage(PERSONAL_HEAD_PHOTO_SRC);
  }
}

let targetPrompt = null;
let promptShownAt = 0;
let detectedChord = null;
let gameRunning = false;
let resolving = false;
let paused = false;
let score = 0;
let speed = Number(speedSlider.value);
// Level rises with the current run's score — see levelForScore() — and
// adds a proportional bonus on top of the chosen Speed slider value (see
// effectiveSpeed()), so a longer streak gets progressively harder to keep
// up with instead of staying at one flat pace all run.
let level = 1;
// The highest score reached in any single run on this device — not
// cumulative across runs, just the peak, since a miss resets `score`
// itself back to 0 (see missChord()). Persisted so it survives a reload.
const BEST_SCORE_STORAGE_KEY = "chordquest_best_score";
let bestScore = Number(localStorage.getItem(BEST_SCORE_STORAGE_KEY)) || 0;
let lastRecognitionAt = 0;
let recognitionTimer = null;
let midiAccess = null;
let inputMode = null;
let midiReady = false;
let keyboardAudioContext = null;
let keyboardMasterGain = null;
let lastWrongSoundAt = 0;
let arpeggioResetTimer = null;
// "random" picks prompts from the selected categories; "custom" steps
// sequentially through an uploaded chord progression instead. Starts
// unset (neither radio pre-checked, matching #playerMode) until the
// player actively picks one; every comparison below treats null the
// same as "not custom", i.e. random-practice behavior.
let progressionPracticeMode = null;
let customProgression = [];
let customIndex = -1;
let customProgressionTitle = "";
// Playback speed (beats per minute) for the loaded custom progression; each
// prompt's own duration_beats (see models/chords.py) is converted to
// seconds against this so a half note takes twice as long as a quarter,
// matching the song's actual rhythm rather than a uniform obstacle speed.
let customProgressionTempo = DEFAULT_TEMPO_BPM;
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
  B: 11,
  Cb: 11
};

// Per-category fine-tune state: categoryId -> Set of option ids checked in
// that category's own section of the subtypes drawer (see
// updateSubtypesDrawer). For every category except Inversions these are
// ChordFamily ids; for Inversions they're models/chords.py's
// INVERSION_POSITION_TOKENS ids ("inversionsRoot" etc. — see
// categoryFineTuneOptions), since narrowing Inversions down means picking
// WHICH inversion position, not which chord family. A category only gets
// an entry here once it's checked — and starts with every one of its
// options in the Set (every chip checked), so the drawer reads as
// "everything, uncheck what you don't want" rather than an empty picker
// to build up from scratch (see buildCategoryInputs/the categoriesEl
// "change" handler). Absent entirely for a category with no drawer at all
// (nothing to narrow down) — selectedCategories() falls back to that
// category's plain id only in that case.
const fineTunedFamiliesByCategory = new Map();

// categoryId -> { options: Array<{id, label}> } for every category that
// has a fine-tune breakdown at all — populated by buildCategoryInputs from
// /api/modules ("positions" for Inversions, "families" for every other
// category), and read by updateSubtypesDrawer() to build each checked
// category's drawer.
const categoryFineTuneOptions = new Map();

// categoryId -> that category's own drawer element (see
// buildCategoryInputs, which inserts it as the very next grid item right
// after that category's card), read and toggled by updateSubtypesDrawer().
const categoryDrawers = new Map();

/**
 * Render the 6 main category cards — plain checkbox cards, no icon, one
 * shared accent color like every other card on the page (see .category in
 * styles.css). Each category lives in its own .category-cell (a grid item
 * that stacks the card and, once checked, its .category-subtypes-drawer
 * vertically via flexbox — see styles.css), so a category's drawer always
 * attaches directly under its own card, flush against it, without
 * affecting any other category's position in the grid. The first category
 * starts checked so a prompt can always be produced.
 * @param {Array<{id: string, label: string, families?: Array<{id: string, label: string}>, positions?: Array<{id: string, label: string}>}>|Array<[string, string]>} modules
 *   Either full module objects from /api/modules — "positions" for
 *   Inversions (which inversion index), "families" for every other
 *   category (which chord quality) — or plain [id, label] pairs (the
 *   offline FALLBACK_CATEGORIES shape — no fine-tune breakdown then).
 */
function buildCategoryInputs(modules) {
  categoriesEl.innerHTML = "";
  fineTunedFamiliesByCategory.clear();
  categoryFineTuneOptions.clear();
  categoryDrawers.clear();

  modules.forEach((entry, index) => {
    const isPlainPair = Array.isArray(entry);
    const id = isPlainPair ? entry[0] : entry.id;
    const label = isPlainPair ? entry[1] : entry.label;
    const options = isPlainPair ? undefined : entry.positions || entry.families;
    const checked = index === 0;

    const cell = document.createElement("div");
    cell.className = "category-cell";

    const item = document.createElement("label");
    item.className = "category";
    item.dataset.id = id;
    item.innerHTML = `<input type="checkbox" value="${id}" ${checked ? "checked" : ""} /> <span>${label}</span>`;
    cell.appendChild(item);
    categoriesEl.appendChild(cell);

    if (!Array.isArray(options) || options.length <= 1) {
      return;
    }

    categoryFineTuneOptions.set(id, { options });
    // Starts fully selected — every option checked — so a checked
    // category's drawer reads as "everything, uncheck what you don't
    // want" rather than an empty picker you have to build up from
    // scratch. Only matters here for the category that starts checked
    // (index 0); the "change" handler below does the same for every other
    // category the moment it's checked.
    if (checked) {
      fineTunedFamiliesByCategory.set(id, new Set(options.map((option) => option.id)));
    }

    const drawer = document.createElement("div");
    drawer.className = "category-subtypes-drawer";
    drawer.dataset.category = id;
    drawer.hidden = !checked;
    cell.appendChild(drawer);
    categoryDrawers.set(id, drawer);
  });

  updateSubtypesDrawer();
}

/**
 * Rebuild every category's own drawer to match which main categories are
 * currently checked and, for a checked one, its fineTunedFamiliesByCategory
 * selection: shown (and filled with one .subtype-option row per option —
 * a plain checkbox + label, no title repeating the category's own name,
 * since the drawer already sits attached directly under that category's
 * card) while its category is checked, hidden and emptied otherwise.
 * Called once after buildCategoryInputs and again every time a main
 * category checkbox changes.
 */
function updateSubtypesDrawer() {
  categoryDrawers.forEach((drawer, id) => {
    const isChecked = categoriesEl.querySelector(`.category[data-id="${id}"] > input`)?.checked ?? false;
    drawer.hidden = !isChecked;
    drawer.innerHTML = "";
    if (!isChecked) {
      return;
    }

    const chosen = fineTunedFamiliesByCategory.get(id);
    categoryFineTuneOptions.get(id).options.forEach((option) => {
      const item = document.createElement("label");
      item.className = "subtype-option";
      const isOptionChecked = chosen?.has(option.id) ?? false;
      item.innerHTML = `<input type="checkbox" value="${option.id}" ${isOptionChecked ? "checked" : ""} /> <span>${option.label}</span>`;
      drawer.appendChild(item);
    });
  });
}

/**
 * Fetch the chord categories/families from the backend and build the
 * category grid (with its fine-tune drawer options) and the mastery-label
 * lookup from them; falls back to FALLBACK_CATEGORIES (a plain category
 * list, no fine-tune breakdown) if the request fails.
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

    buildCategoryInputs(modules);
    modules.forEach((module) => {
      module.families.forEach((family) => {
        familyLabelByKey.set(`${module.id}:${family.id}`, `${module.label} · ${family.label}`);
      });
    });
  } catch (error) {
    buildCategoryInputs(FALLBACK_CATEGORIES);
    statusEl.textContent = "Could not load categories; using defaults.";
  }
}

categoriesEl.addEventListener("change", (event) => {
  abandonRunOnSetupChange();
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) {
    return;
  }

  const drawer = input.closest(".category-subtypes-drawer");
  if (drawer) {
    // A fine-tune option inside some category's own drawer — no "keep at
    // least one checked" rule here: an empty set is the valid, expected
    // "nothing from this category" state (see fineTunedFamiliesByCategory).
    const categoryId = drawer.dataset.category;
    if (!categoryId) {
      return;
    }
    let chosen = fineTunedFamiliesByCategory.get(categoryId);
    if (!chosen) {
      chosen = new Set();
      fineTunedFamiliesByCategory.set(categoryId, chosen);
    }
    chosen[input.checked ? "add" : "delete"](input.value);
    return;
  }

  // A main category checkbox. Keep the game always able to produce a
  // prompt: never allow the last checked category to be unchecked.
  const stillChecked = categoriesEl.querySelectorAll(".category-cell > .category > input:checked").length > 0;
  if (!stillChecked) {
    input.checked = true;
    statusEl.textContent = "Keep at least one category.";
    return;
  }

  if (input.checked) {
    // Checking a category starts its drawer fully selected — every chip
    // checked — so it reads as "everything, uncheck what you don't want"
    // rather than an empty picker to build up from scratch.
    const entry = categoryFineTuneOptions.get(input.value);
    if (entry) {
      fineTunedFamiliesByCategory.set(input.value, new Set(entry.options.map((option) => option.id)));
    }
  } else {
    // Unchecking a category resets its fine-tune selection, so re-checking
    // it later starts fresh (fully selected again) rather than remembering
    // a stale narrowed pick.
    fineTunedFamiliesByCategory.delete(input.value);
  }
  updateSubtypesDrawer();
});

// Every "i" info button on the page — one per section header (Player,
// Song progression, Input device — fixed markup in index.html; Song
// progression's also covers the chord categories, folded into that one
// tooltip rather than each category card having its own) — shows/hides
// its explanation on click, for touch devices where a CSS-only :hover
// tooltip isn't reachable (desktop already gets it on hover for free —
// see .info-tooltip in styles.css). One delegated document-level listener
// covers all of them, wherever they live in the page, plus closes any
// open tooltip on a click outside it.
document.addEventListener("click", (event) => {
  const trigger = event.target.closest(".info-trigger");
  if (trigger) {
    // Stops the click from also landing on an enclosing <label>, which
    // would otherwise toggle that card's radio/checkbox — the player is
    // asking what it means, not choosing it.
    event.preventDefault();
    event.stopPropagation();

    const badge = trigger.closest(".info-badge");
    const wasOpen = badge.classList.contains("is-open");
    document.querySelectorAll(".info-badge.is-open").forEach((open) => {
      open.classList.remove("is-open");
    });
    badge.classList.toggle("is-open", !wasOpen);
    return;
  }

  if (!event.target.closest(".info-badge")) {
    document.querySelectorAll(".info-badge.is-open").forEach((open) => {
      open.classList.remove("is-open");
    });
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
  updateRunnerHead();
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
    updateRunnerHead();
    playerNameInput.value = player.name;
    localStorage.setItem(PLAYER_NAME_STORAGE_KEY, player.name);
    localStorage.setItem(PLAYER_MODE_STORAGE_KEY, "league");
    localStorage.setItem(PLAYER_AVATAR_STORAGE_KEY, JSON.stringify(currentAvatar));
    setPlayerStatus(`Playing as ${player.name} — ranked`);
    loadStats();
    loadLeaderboard();
  } catch (error) {
    activePlayer = null;
    setPlayerStatus("Could not join; check connection.", true);
  }
}

playerModeEl.addEventListener("change", () => {
  abandonRunOnSetupChange();
  const mode = playerMode();
  updatePlayerJoinVisibility();
  localStorage.setItem(PLAYER_MODE_STORAGE_KEY, mode);
  updateStartReadiness();

  if (mode === "solo") {
    activePlayer = null;
    setPlayerStatus("Local scores only");
    loadStats();
    updateRunnerHead();
    return;
  }

  playerNameInput.focus();
  const savedName = playerNameInput.value.trim();
  if (savedName) {
    joinLeague(savedName, { silent: true });
  } else {
    setPlayerStatus("Enter a name, then Join.");
    // Preview the in-progress avatar as the runner's head immediately —
    // even before Join is clicked — so building it feels live.
    updateRunnerHead();
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
 * Read which chord categories/families are currently selected for random
 * practice: for every checked main category, its own fine-tuned family ids
 * (see fineTunedFamiliesByCategory — a category with a drawer always has
 * an entry here the moment it's checked, starting with every chip
 * selected, so this reflects whatever the player has since unchecked) if
 * it has a drawer at all, otherwise the category id itself (a category
 * with only one quality, nothing to narrow down).
 * @returns {string[]} Category and/or ChordFamily ids understood by the
 *   backend's create_prompt_pool.
 */
function selectedCategories() {
  const tokens = [];
  categoriesEl.querySelectorAll(".category-cell > .category > input:checked").forEach((input) => {
    const fineTuned = fineTunedFamiliesByCategory.get(input.value);
    if (fineTuned) {
      tokens.push(...fineTuned);
    } else {
      tokens.push(input.value);
    }
  });
  return tokens;
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
 * @returns {string} The note name, e.g. "Db".
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

/**
 * Advance to the next prompt: the next chord in the uploaded progression
 * (looping back to the start when it finishes) if "Custom progression" is
 * selected and loaded, otherwise a new random chord from the selected
 * categories. Also resets the wrong-attempt penalty streak, since it's
 * scoped to a single prompt (see WRONG_CHORD_PENALTY_STEP).
 * @returns {Promise<void>}
 */
async function fetchPrompt() {
  wrongAttemptStreak = 0;
  lastWrongSignature = null;

  if (progressionPracticeMode === "custom" && customProgression.length) {
    const wasLast = customIndex === customProgression.length - 1;
    customIndex = (customIndex + 1) % customProgression.length;
    if (wasLast) {
      statusEl.textContent = "Song complete! Looping back.";
    }
    targetPrompt = customProgression[customIndex];
    promptShownAt = performance.now();
    renderNotes();
    return;
  }

  const categories = selectedCategories();
  const query = encodeURIComponent(categories.length ? categories.join(",") : "major");
  const response = await fetch(`/api/prompt?categories=${query}`);
  const data = await response.json();
  targetPrompt = data.prompt;
  promptShownAt = performance.now();
  renderNotes();
}

/**
 * Read a raw CSV file's text into a flat list of candidate chord tokens:
 * one per non-empty, non-comment line, taking only the first
 * comma-separated column and stripping surrounding quotes/whitespace. Not
 * a full CSV parser — deliberately simple since the expected format is a
 * single "chord" column. Lines starting with "#" are skipped entirely
 * (after trimming), so the downloadable template
 * (static/templates/chord-progression-template.csv) can carry a
 * human-readable notation cheat-sheet as comments without those lines
 * being mistaken for chords.
 * @param {string} text - Raw file contents.
 * @returns {string[]} Non-empty candidate chord tokens, in file order.
 */
function parseCsvChordLines(text) {
  return text
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith("#"))
    .map((line) => line.split(",")[0].replace(/^["']|["']$/g, "").trim())
    .filter(Boolean);
}

/** Reset the progression panel to its empty state (no song loaded, random practice). */
function clearProgression() {
  abandonRunOnSetupChange();
  customProgression = [];
  customIndex = -1;
  customProgressionTitle = "";
  customProgressionTempo = DEFAULT_TEMPO_BPM;
  progressionPracticeMode = "random";
  progressionFileInput.value = "";
  progressionTitleInput.value = "";
  progressionTempoInput.value = "";
  progressionClearButton.hidden = true;
  const randomRadio = progressionModeEl.querySelector('input[value="random"]');
  if (randomRadio) {
    randomRadio.checked = true;
  }
  // The mode toggle (Random/Custom) stays visible; only the upload/library
  // config collapses back, and Chord categories/Recognition mode reappear,
  // matching the default "Random practice" state.
  progressionConfigEl.hidden = true;
  randomPracticeConfigEl.hidden = false;
  progressionStatusEl.textContent = "";
  progressionStatusEl.classList.remove("is-error");
}

/**
 * Adopt a parsed chord list as the active custom progression: resets
 * playback to the first chord and updates the practice-mode summary.
 * Reaching this function already implies "Custom progression" is selected
 * (the upload/library controls that call it only show once that radio is
 * checked), so the config panel doesn't need to be revealed here.
 * @param {object[]} prompts - Parsed ChordPrompt objects, in playing order.
 * @param {string} [title] - Display title, shown in the practice-mode summary.
 * @param {number} [tempoBpm] - Playback speed for these prompts' own
 *   duration_beats; falls back to DEFAULT_TEMPO_BPM if omitted/invalid.
 */
function setCustomProgression(prompts, title = "", tempoBpm) {
  customProgression = prompts;
  customIndex = -1;
  customProgressionTitle = title;
  customProgressionTempo = Number.isFinite(tempoBpm) && tempoBpm > 0 ? tempoBpm : DEFAULT_TEMPO_BPM;
  progressionTempoInput.value = customProgressionTempo;
  progressionClearButton.hidden = false;
  const label = title ? `"${title}" — ` : "";
  progressionSummaryEl.textContent = `${label}${prompts.length} chord${prompts.length === 1 ? "" : "s"} loaded`;
}

/**
 * Handle a newly chosen progression CSV file: read it, send the candidate
 * chord tokens (plus an optional title) to the backend for validation,
 * and reveal the practice-mode toggle on success. A title also
 * auto-saves the progression to the "Uploaded Songs" library.
 * @returns {Promise<void>}
 */
async function handleProgressionFile() {
  const file = progressionFileInput.files?.[0];
  if (!file) {
    return;
  }

  abandonRunOnSetupChange();
  progressionStatusEl.textContent = "Reading file…";
  progressionStatusEl.classList.remove("is-error");

  try {
    const text = await file.text();
    const lines = parseCsvChordLines(text);
    // Drop a header row like "chord" (matching the downloadable template)
    // if present, so users don't have to remember to remove it.
    const chords = lines[0]?.toLowerCase() === "chord" ? lines.slice(1) : lines;

    if (!chords.length) {
      throw new Error("empty");
    }

    const title = progressionTitleInput.value.trim() || file.name.replace(/\.csv$/i, "");
    const tempoInputValue = progressionTempoInput.value.trim();
    const tempoBpm = tempoInputValue ? Number(tempoInputValue) : undefined;
    const response = await fetch("/api/progressions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chords, title, tempo_bpm: tempoBpm })
    });
    if (!response.ok) {
      throw new Error(`status ${response.status}`);
    }

    const data = await response.json();
    if (!data.prompts.length) {
      progressionStatusEl.textContent = "No valid chords found. Check the template.";
      progressionStatusEl.classList.add("is-error");
      return;
    }

    setCustomProgression(data.prompts, title, data.saved?.tempo_bpm ?? tempoBpm);

    const skipped = data.errors.length
      ? ` (${data.errors.length} row${data.errors.length === 1 ? "" : "s"} skipped: ${data.errors
          .map((entry) => `"${entry.chord}"`)
          .join(", ")})`
      : "";
    const savedNote = data.saved ? ` Saved to "Uploaded Songs".` : "";
    progressionStatusEl.textContent = `Loaded "${title}": ${data.prompts.length} chords.${skipped}${savedNote}`;
    progressionStatusEl.classList.toggle("is-error", data.errors.length > 0);

    if (data.saved && librarySourceSelect.value === "uploaded") {
      loadLibrarySongOptions();
    }
  } catch (error) {
    progressionStatusEl.textContent = "Could not read that CSV.";
    progressionStatusEl.classList.add("is-error");
  }
}

/**
 * Populate the song picker for the currently selected library source.
 * @returns {Promise<void>}
 */
async function loadLibrarySongOptions() {
  const source = librarySourceSelect.value;
  librarySongSelect.innerHTML = '<option value="">Loading…</option>';

  try {
    const response = await fetch(`/api/library/${source}`);
    if (!response.ok) {
      throw new Error(`status ${response.status}`);
    }
    const songs = await response.json();

    librarySongSelect.innerHTML = "";
    if (!songs.length) {
      librarySongSelect.innerHTML = '<option value="">No songs yet</option>';
      return;
    }

    songs.forEach((song) => {
      const option = document.createElement("option");
      option.value = song.id;
      const artist = song.artist ? ` — ${song.artist}` : "";
      option.textContent = `${song.title}${artist} (${song.chord_count} chords)`;
      librarySongSelect.appendChild(option);
    });
  } catch (error) {
    librarySongSelect.innerHTML = '<option value="">Could not load library</option>';
  }
}

/**
 * Fetch the currently selected library song and adopt it as the active
 * custom progression.
 * @returns {Promise<void>}
 */
async function loadSelectedLibrarySong() {
  const source = librarySourceSelect.value;
  const songId = librarySongSelect.value;
  if (!songId) {
    progressionStatusEl.textContent = "Pick a song first.";
    progressionStatusEl.classList.add("is-error");
    return;
  }

  abandonRunOnSetupChange();
  try {
    const response = await fetch(`/api/library/${source}/${encodeURIComponent(songId)}`);
    if (!response.ok) {
      throw new Error(`status ${response.status}`);
    }
    const song = await response.json();
    if (!song.prompts.length) {
      progressionStatusEl.textContent = `"${song.title}" has no valid chords to play.`;
      progressionStatusEl.classList.add("is-error");
      return;
    }

    setCustomProgression(song.prompts, song.title, song.tempo_bpm);
    progressionStatusEl.textContent = `Loaded "${song.title}" from ${source === "curated" ? "My Library" : "Uploaded Songs"}: ${song.prompts.length} chords.`;
    progressionStatusEl.classList.remove("is-error");
  } catch (error) {
    progressionStatusEl.textContent = "Could not load song; check connection.";
    progressionStatusEl.classList.add("is-error");
  }
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
    // Only a genuinely new set of notes counts as a new wrong attempt —
    // otherwise just holding the same wrong chord down would keep
    // re-charging the penalty every ~180ms for no additional mistake.
    const signature = [...notes].sort((a, b) => a - b).join(",");
    if (signature !== lastWrongSignature) {
      lastWrongSignature = signature;
      wrongAttemptStreak += 1;
      const penalty = wrongAttemptStreak * WRONG_CHORD_PENALTY_STEP;
      score = Math.max(0, score - penalty);
      updateHud();
      statusEl.textContent = `Wrong chord (-${penalty}). Try again before it arrives.`;
    } else {
      statusEl.textContent = "Try again before it arrives.";
    }
  }
}

/**
 * Recompute which notes count toward recognition (depends on recognition
 * mode), update the notes/piano-key UI, and kick off a debounced
 * recognize() call once at least 3 notes are in play.
 */
function renderNotes() {
  const currentlyHeld = activeNoteOrder.filter((note) => activeNotes.has(note));
  // Held mode evaluates heldPeakNotes (everything pressed since the last
  // full release) rather than currentlyHeld, so a note released a beat
  // early doesn't drop an otherwise-correct plaqué chord — see
  // heldPeakNotes' declaration for the rationale.
  const recognitionNotes = recognitionMode() === "arpeggio" ? [...arpeggioNotes.keys()] : [...heldPeakNotes];
  const displayNotes = [...currentlyHeld].sort((a, b) => a - b);
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
  // staggered, and fingers rarely land in perfect unison). This helps
  // capture all 4 notes for seventh chords.
  if (recognitionTimer) {
    clearTimeout(recognitionTimer);
  }
  const notesToRecognize = [...recognitionNotes];
  recognitionTimer = setTimeout(() => {
    recognitionTimer = null;
    recognize(notesToRecognize);
  }, 80);
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
    statusEl.textContent = "Audio not supported.";
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
  } else {
    heldPeakNotes.add(note);
  }
  if (playSound) {
    startKeyboardTone(note);
  }
  renderNotes();
}

/**
 * Register a note as released: stops tracking it, stops its tone, and
 * re-renders the notes/recognition UI. heldPeakNotes is deliberately left
 * alone here (see its declaration) unless this was the very last held
 * note, in which case it's reset for the next attempt.
 * @param {number} note - MIDI note number.
 */
function noteOff(note) {
  activeNotes.delete(note);
  const orderIndex = activeNoteOrder.indexOf(note);
  if (orderIndex !== -1) {
    activeNoteOrder.splice(orderIndex, 1);
  }
  if (activeNotes.size === 0) {
    heldPeakNotes.clear();
    // Hands fully lifted: the next chord (even a repeat of the same wrong
    // one) is a genuinely new attempt, so it should be penalized again.
    lastWrongSignature = null;
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
  heldPeakNotes.clear();
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
    masteryGridEl.textContent = "No stats yet";
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

/**
 * Render the ranked list below the podium (ranks 4+).
 * @param {object[]} rest - Leaderboard entries after the top 3.
 * @param {number} startingRank - Rank number of the first entry in `rest`
 *   (i.e. 4, since the podium covers 1-3).
 */
function renderLeaderboardList(rest, startingRank) {
  if (!rest.length) {
    if (startingRank === 1) {
      leaderboardGridEl.textContent = "No rankings yet";
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

/**
 * Render the full Chord League leaderboard: podium for the top 3, list for the rest.
 * @param {object[]} entries - Leaderboard entries from /api/leaderboard,
 *   already ranked.
 */
function renderLeaderboard(entries) {
  if (!leaderboardGridEl || !Array.isArray(entries)) {
    return;
  }

  renderPodium(entries.slice(0, 3));
  renderLeaderboardList(entries.slice(3), 4);
}

/**
 * Fetch and render the current Chord League leaderboard.
 * @returns {Promise<void>}
 */
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

/**
 * Handle a correctly played chord: award points, play the jump/particle
 * celebration, report the attempt, then advance to the next prompt after
 * a short delay.
 */
function correctAnswer() {
  resolving = true;
  const pointsEarned = Math.round(100 * effectiveSpeed());
  score += pointsEarned;
  statusEl.textContent = "Correct! Clean jump.";
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

/**
 * Handle the obstacle reaching the runner (called via the scene's onMiss
 * hook): "game over" — report the attempt, reset the run's score to 0 (the
 * peak was already captured into bestScore by updateHud(), so it isn't
 * lost), then advance to the next prompt after a short delay. There's
 * still no life limit, so the run itself keeps going. A no-op if already
 * resolving, paused, or the game isn't running (defense in depth; the
 * scene shouldn't call this in those states).
 */
function missChord() {
  if (resolving || !gameRunning || paused) {
    return;
  }

  // The scene already played the hit reaction (recoil, screen-shake, dust)
  // the moment its own collision check fired; this just handles scoring,
  // status text and getting the next prompt.
  resolving = true;
  playGameOverSound();
  recordAttempt(false);
  score = 0;
  statusEl.textContent = "Game over — score reset. Try again.";
  updateHud();

  window.setTimeout(async () => {
    scene.nextRound();
    await fetchPrompt();
    resolving = false;
  }, 700);
}

// Score needed to REACH level n (n >= 1) is 250 * (n-1) * n: 0, 500, 1500,
// 3000, 5000, ... — a gap that itself grows by 500 each level, so leveling
// up keeps demanding a bigger streak rather than trickling by every round.
const LEVEL_SCORE_UNIT = 250;
// How much extra speed each level above 1 adds on top of the chosen Speed
// slider value (see effectiveSpeed()). Deliberately not capped at the
// slider's own 7 max — the whole point of leveling up is that a long run
// keeps getting harder, past whatever the slider alone could reach.
const LEVEL_SPEED_BONUS = 0.4;

/**
 * Compute the current level from a score, per LEVEL_SCORE_UNIT's
 * thresholds (500, 1500, 3000, 5000, ...).
 * @param {number} currentScore - The score to evaluate.
 * @returns {number} 1 or higher.
 */
function levelForScore(currentScore) {
  let candidateLevel = 1;
  while (LEVEL_SCORE_UNIT * candidateLevel * (candidateLevel + 1) <= currentScore) {
    candidateLevel += 1;
  }
  return candidateLevel;
}

/**
 * The Speed slider's value plus the current level's bonus — this is what
 * actually drives the obstacle/parallax pace and the points formula, while
 * the slider itself keeps showing the player's raw chosen value.
 * @returns {number}
 */
function effectiveSpeed() {
  return speed + (level - 1) * LEVEL_SPEED_BONUS;
}

/**
 * Refresh the score/speed/level/best-score HUD text from current state,
 * updating (and persisting) bestScore first if the current run just set a
 * new high — called after every score change, so the peak is captured
 * before missChord() can reset `score` back to 0.
 */
function updateHud() {
  level = levelForScore(score);
  scoreEl.textContent = `${score} pts`;
  metaEl.textContent = `Level ${level}`;
  speedValueEl.textContent = `${speedToBpm(speed)} BPM`;

  if (score > bestScore) {
    bestScore = score;
    localStorage.setItem(BEST_SCORE_STORAGE_KEY, String(bestScore));
  }
  bestScoreEl.textContent = `${bestScore} pts`;
}

/** Read the speed slider into `speed` and refresh the HUD. */
function updateSpeedFromSlider() {
  speed = Number(speedSlider.value);
  updateHud();
}

/**
 * Update the Pause button's icon/label/style to reflect the current state.
 * @param {boolean} isPaused - Whether the game is currently paused.
 */
function setPauseButtonState(isPaused) {
  pauseButton.innerHTML = isPaused
    ? '<span class="control-icon" aria-hidden="true">▶</span> Resume'
    : '<span class="control-icon" aria-hidden="true">❚❚</span> Pause';
  pauseButton.classList.toggle("is-paused", isPaused);
}

/**
 * Toggle the paused state; a no-op if no game is currently running.
 * While paused, the scene freezes and no chord is scored right or wrong.
 */
function togglePause() {
  if (!gameRunning) {
    return;
  }

  paused = !paused;
  setPauseButtonState(paused);
  statusEl.textContent = paused ? "Paused." : "Resumed.";
  if (paused) {
    releaseWakeLock();
  } else {
    requestWakeLock();
  }
}

// Holds the active Screen Wake Lock sentinel (see requestWakeLock()) while
// a run is active, so the device doesn't dim/sleep mid-song and cut MIDI
// input or the canvas animation. null whenever no lock is held — either
// because nothing requested one yet, the browser doesn't support the API
// (Safari before iOS 16.4, most non-Chromium desktop browsers as of this
// writing), or the OS/browser revoked it (e.g. the tab was hidden).
let wakeLockSentinel = null;

/**
 * Request a screen wake lock for the duration of an active run. Silently
 * does nothing if the Wake Lock API isn't supported or permission is
 * denied — gameplay works exactly the same either way, the device might
 * just dim/sleep on its own timeout.
 * @returns {Promise<void>}
 */
async function requestWakeLock() {
  if (!("wakeLock" in navigator)) {
    return;
  }
  try {
    wakeLockSentinel = await navigator.wakeLock.request("screen");
    wakeLockSentinel.addEventListener("release", () => {
      wakeLockSentinel = null;
    });
  } catch (error) {
    wakeLockSentinel = null;
  }
}

/** Release the screen wake lock, if one is currently held. */
function releaseWakeLock() {
  if (wakeLockSentinel) {
    wakeLockSentinel.release().catch(() => {});
    wakeLockSentinel = null;
  }
}

/**
 * Check whether every parameter required to start a run has been chosen.
 * @returns {string|null} A human-readable description of the first thing
 *   still missing, or null if everything required is set.
 */
function missingStartRequirement() {
  if (!playerModeEl.querySelector("input:checked")) {
    return "Choose Practice solo or Join Chord League first.";
  }
  if (!progressionModeEl.querySelector("input:checked")) {
    return "Choose Random practice or Custom progression first.";
  }
  if (!inputMode) {
    return "Choose an input device first.";
  }
  if (inputMode === "midi" && !midiReady) {
    return "No MIDI input detected yet.";
  }
  return null;
}

/**
 * Refresh the Start button's ready/not-ready styling (see .is-ready in
 * styles.css — dark green only once every required parameter above is
 * set, a muted look otherwise). Called after every change that could
 * affect readiness (player mode, progression mode, input device).
 * Deliberately doesn't touch the status line itself — every call site
 * that changes readiness already sets its own, more specific status
 * message (e.g. "Ready: Yamaha P-225."); startGame() is the one place
 * that surfaces missingStartRequirement()'s own message, when a click
 * needs to be refused.
 */
function updateStartReadiness() {
  startButton.classList.toggle("is-ready", !missingStartRequirement());
}

/** Refresh the Stop button's active/inactive styling to match whether a run is actually in progress. */
function updateStopReadiness() {
  stopButton.classList.toggle("is-active", gameRunning);
}

/**
 * Start a new run: validates every required parameter is set (see
 * missingStartRequirement), resets score/pause state, reveals the
 * game/HUD/keys/mastery/leaderboard area (hidden until now — see the
 * play-area comment below), starts the scene, and fetches the first
 * prompt.
 * @returns {Promise<void>}
 */
async function startGame() {
  const missing = missingStartRequirement();
  if (missing) {
    statusEl.textContent = missing;
    updateStartReadiness();
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
  // Start game stays unusable — same greyed-out look as any other
  // disabled button — for the entire run, Pause/Resume included (pause
  // doesn't clear gameRunning); only Stop (see stopGame) hands it back.
  startButton.disabled = true;
  // Always start a custom progression from its first chord, even if a
  // previous run was stopped partway through.
  customIndex = -1;
  // Everything required is set at this point (missingStartRequirement
  // just returned null), so this is the one moment the play area — the
  // arrival track included — actually appears; it stays hidden through
  // every setup step before this, with no placeholder text of its own.
  playAreaEl.hidden = false;
  scene.start();
  statusEl.textContent = "Run started!";
  updateHud();
  requestWakeLock();
  updateStopReadiness();
  await fetchPrompt();
}

/** End the current run: resets game/pause state, clears held notes, and stops the scene. */
function stopGame() {
  gameRunning = false;
  resolving = false;
  paused = false;
  setPauseButtonState(false);
  pauseButton.disabled = true;
  startButton.disabled = false;
  clearActiveNotes();
  scene.stop();
  statusEl.textContent = "Game stopped.";
  updateHud();
  releaseWakeLock();
  updateStopReadiness();
  updateStartReadiness();
}

/**
 * If a run is currently active (running or paused — see stopGame, called
 * either way), changing a setup parameter invalidates it: this bails back
 * to the pre-start state exactly like a fresh page load — stops the run,
 * re-hides the play area (arrival track included), and hands the Start
 * button back (re-enabled, re-colored by updateStartReadiness — every
 * call site below already calls that after its own change). A no-op
 * while no run is active, so it's safe to call unconditionally from every
 * setup control's change handler.
 */
function abandonRunOnSetupChange() {
  if (!gameRunning) {
    return;
  }
  stopGame();
  playAreaEl.hidden = true;
}

/**
 * Switch the active input device and update the two input-mode cards'
 * selected styling to match, then refresh Start-button readiness (see
 * updateStartReadiness) since the input device is one of its
 * requirements. The on-screen piano keys only make sense as an input
 * surface in "Computer keyboard" mode — with a real MIDI keyboard plugged
 * in they'd just be redundant — so they (and their "Keyboard: A W S..."
 * caption) are shown/hidden to match; this has no visible effect until
 * the play area itself is revealed, which only happens once Start game
 * actually runs (see startGame).
 * @param {"midi"|"keyboard"} mode - The input mode to switch to.
 */
function setInputMode(mode) {
  abandonRunOnSetupChange();
  inputMode = mode;
  midiButton.classList.toggle("selected", mode === "midi");
  keyboardButton.classList.toggle("selected", mode === "keyboard");
  keysEl.hidden = mode !== "keyboard";
  keyboardGuideEl.hidden = mode !== "keyboard";
  updateStartReadiness();
}

/**
 * Get a human-readable name for a Web MIDI input device. The Web MIDI API
 * itself doesn't distinguish USB from Bluetooth — a Bluetooth MIDI
 * keyboard that's already paired at the OS level (e.g. via Settings, or a
 * companion app like Yamaha Smart Pianist) shows up here exactly like a
 * USB one, no separate integration needed.
 * @param {MIDIInput} input - A Web MIDI API input device.
 * @returns {string} The device's name, manufacturer, or a generic fallback.
 */
function midiInputName(input) {
  return input.name || input.manufacturer || "MIDI device";
}

/**
 * Handle a raw Web MIDI message: translate note-on/note-off events into
 * noteOn()/noteOff() calls. Ignored unless MIDI is the active input mode.
 * @param {MIDIMessageEvent} event - The incoming MIDI message.
 */
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

/**
 * Wire handleMidiMessage onto every currently connected MIDI input (USB or
 * Bluetooth alike — see midiInputName).
 * @returns {MIDIInput[]} The connected inputs (empty if MIDI access hasn't
 *   been granted yet).
 */
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

/**
 * Re-check connected MIDI inputs and refresh the status text/button label
 * accordingly. Called after granting access and on every subsequent MIDI
 * connection change. A no-op unless MIDI is the active input mode.
 */
function updateMidiStatus() {
  if (inputMode !== "midi") {
    return;
  }

  const inputs = connectMidiInputs();

  if (!inputs.length) {
    midiReady = false;
    inputStatusEl.textContent = "No input detected";
    statusEl.textContent = "Connect (USB or Bluetooth) and power on the keyboard, then retry.";
    midiButtonLabel.textContent = "Retry MIDI";
    clearActiveNotes();
    updateStartReadiness();
    return;
  }

  const names = inputs.map(midiInputName).join(", ");
  midiReady = true;
  inputStatusEl.textContent = `${inputs.length} input${inputs.length === 1 ? "" : "s"} connected`;
  statusEl.textContent = `Ready: ${names}.`;
  midiButtonLabel.textContent = "Refresh MIDI";
  updateStartReadiness();
}

/**
 * Switch to MIDI input mode (USB or Bluetooth — the Web MIDI API doesn't
 * distinguish the two) and request access from the browser, updating
 * status text based on the outcome.
 * @returns {Promise<void>}
 */
async function enableMidi() {
  setInputMode("midi");
  midiReady = false;
  clearActiveNotes();

  if (!navigator.requestMIDIAccess) {
    statusEl.textContent = "Not supported. Try Chrome, Edge, or Safari 17+.";
    inputStatusEl.textContent = "Unsupported browser";
    updateStartReadiness();
    return;
  }

  inputStatusEl.textContent = "Requesting access…";

  try {
    midiAccess = await navigator.requestMIDIAccess({ sysex: false });
    midiAccess.onstatechange = () => {
      updateMidiStatus();
    };
    updateMidiStatus();
  } catch (error) {
    const denied = error?.name === "SecurityError" || error?.name === "NotAllowedError";
    inputStatusEl.textContent = denied ? "Permission denied" : "Connection failed";
    statusEl.textContent = denied ? "Allow MIDI access, then retry." : "Check the connection and retry.";
    updateStartReadiness();
  }
}

/** Switch to computer-keyboard input mode and prepare the audio context. */
function enableKeyboard() {
  setInputMode("keyboard");
  midiReady = false;
  clearActiveNotes();
  createKeyboardAudio();
  inputStatusEl.textContent = "Keyboard active";
  statusEl.textContent = "Keyboard ready.";
  updateStartReadiness();
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
    statusEl.textContent = "Select computer keyboard mode first.";
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

progressionFileInput.addEventListener("change", handleProgressionFile);
progressionClearButton.addEventListener("click", clearProgression);
librarySourceSelect.addEventListener("change", loadLibrarySongOptions);
libraryLoadButton.addEventListener("click", loadSelectedLibrarySong);
progressionModeEl.addEventListener("change", () => {
  abandonRunOnSetupChange();
  progressionPracticeMode = progressionModeEl.querySelector("input:checked")?.value || "random";
  // Exactly one of the two dropdown areas is shown at a time: the
  // upload/library config for "Custom progression", or Chord
  // categories/Recognition mode for "Random practice".
  progressionConfigEl.hidden = progressionPracticeMode !== "custom";
  randomPracticeConfigEl.hidden = progressionPracticeMode !== "random";
  statusEl.textContent = progressionPracticeMode === "custom" ? "Custom progression selected." : "Random practice selected.";
  updateStartReadiness();
});

startButton.addEventListener("click", startGame);
pauseButton.addEventListener("click", togglePause);
stopButton.addEventListener("click", stopGame);
midiButton.addEventListener("click", enableMidi);
keyboardButton.addEventListener("click", enableKeyboard);
speedSlider.addEventListener("input", updateSpeedFromSlider);
// The Wake Lock API auto-releases whenever the tab is hidden (switching
// apps, locking the screen); re-request it once the player comes back, but
// only if a run is still actually active and not paused — otherwise this
// would needlessly re-arm it for an idle or stopped game.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && gameRunning && !paused) {
    requestWakeLock();
  }
});
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
    statusEl.textContent = "Could not reset stats.";
  }
});
recognitionModeEl.addEventListener("change", () => {
  abandonRunOnSetupChange();
  clearActiveNotes();
  chordEl.textContent = "Listening";
  statusEl.textContent = recognitionMode() === "arpeggio" ? "Arpeggio mode." : "Held chord mode.";
});

scene.configure({
  isRunning: () => gameRunning && !paused,
  isResolving: () => resolving,
  getSpeed: () => effectiveSpeed(),
  // Only custom (uploaded/library) progressions carry real rhythm data; in
  // random practice this stays null and the scene falls back to a plain
  // speed-slider pace. See models/chords.py's duration_beats.
  getTargetDurationSeconds: () => {
    if (progressionPracticeMode !== "custom" || !targetPrompt?.duration_beats) {
      return null;
    }
    return (targetPrompt.duration_beats * 60) / customProgressionTempo;
  },
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
// Neither radio is checked by default (see template/index.html) so a
// first-time visitor sees no pre-selection; a returning visitor's own
// earlier explicit choice — solo or league — is restored either way.
if (savedPlayerMode === "league" || savedPlayerMode === "solo") {
  const savedRadio = playerModeEl.querySelector(`input[value="${savedPlayerMode}"]`);
  if (savedRadio) {
    savedRadio.checked = true;
  }
}
updatePlayerJoinVisibility();
if (savedPlayerMode === "league" && savedPlayerName) {
  joinLeague(savedPlayerName, { silent: true });
}

updateHud();
renderNotes();
loadModules();
loadStats();
loadLeaderboard();
loadLibrarySongOptions();
updateStartReadiness();
updateStopReadiness();
scene.begin();
