// Player avatars are built from small enumerated trait IDs (never free
// text) so they can be validated with a whitelist on the backend
// (models/players.py mirrors these same IDs) and drawn as inline SVG here
// with no image assets or external libraries. Every color/shape a trait ID
// maps to lives in this file — the id itself is never trusted as markup.

export const AVATAR_TRAITS = {
  skin: [
    { id: "s1", color: "#f6e0c6", label: "Fair" },
    { id: "s2", color: "#f0c19a", label: "Light" },
    { id: "s3", color: "#d9a066", label: "Medium" },
    { id: "s4", color: "#b97a45", label: "Tan" },
    { id: "s5", color: "#8a5730", label: "Deep" },
    { id: "s6", color: "#5c3a21", label: "Espresso" }
  ],
  hairStyle: [
    { id: "bald", label: "Bald" },
    { id: "short", label: "Short" },
    { id: "curly", label: "Curly" },
    { id: "long", label: "Long" },
    { id: "mohawk", label: "Mohawk" }
  ],
  hairColor: [
    { id: "c1", color: "#2b2016", label: "Ebony" },
    { id: "c2", color: "#6b4423", label: "Brown" },
    { id: "c3", color: "#b17f26", label: "Brass" },
    { id: "c4", color: "#7c2d3a", label: "Wine" },
    { id: "c5", color: "#9c9c9c", label: "Silver" },
    { id: "c6", color: "#f2dadd", label: "Rose" }
  ],
  accessory: [
    { id: "none", label: "None" },
    { id: "glasses", label: "Glasses" },
    { id: "headphones", label: "Headphones" },
    { id: "cap", label: "Cap" }
  ],
  outfit: [
    { id: "o1", color: "#b17f26", label: "Brass" },
    { id: "o2", color: "#7c2d3a", label: "Wine" },
    { id: "o3", color: "#3c6e58", label: "Forest" },
    { id: "o4", color: "#2b2016", label: "Ebony" },
    { id: "o5", color: "#2f6f8a", label: "Sky" },
    { id: "o6", color: "#a1447a", label: "Berry" }
  ],
  background: [
    { id: "b1", color: "#faf1dc", label: "Parchment" },
    { id: "b2", color: "#f1dfa9", label: "Brass tint" },
    { id: "b3", color: "#f2dadd", label: "Wine tint" },
    { id: "b4", color: "#dcefe3", label: "Mint" },
    { id: "b5", color: "#dbe9f2", label: "Sky tint" },
    { id: "b6", color: "#e6e2da", label: "Stone" }
  ]
};

export const DEFAULT_AVATAR = {
  skin: "s3",
  hairStyle: "short",
  hairColor: "c1",
  accessory: "none",
  outfit: "o1",
  background: "b1"
};

const INK = "#2b2016";

/**
 * Look up the color a trait ID maps to, falling back to that field's
 * default trait (and then to plain ink) if the ID isn't recognized.
 * @param {string} field - One of the AVATAR_TRAITS keys, e.g. "skin".
 * @param {string} id - The trait ID to look up, e.g. "s3".
 * @returns {string} A CSS color string.
 */
function traitColor(field, id) {
  const options = AVATAR_TRAITS[field];
  const match = options.find((option) => option.id === id) || options.find((option) => option.id === DEFAULT_AVATAR[field]);
  return match?.color || INK;
}

/**
 * Check whether a value is a known trait ID for a given field.
 * @param {string} field - One of the AVATAR_TRAITS keys.
 * @param {*} value - The candidate value.
 * @returns {boolean} True if `value` is a defined trait ID for `field`.
 */
function isValidTrait(field, value) {
  return AVATAR_TRAITS[field].some((option) => option.id === value);
}

/**
 * Coerce arbitrary input into a safe, complete avatar object; unknown or
 * missing fields fall back to DEFAULT_AVATAR rather than throwing.
 * @param {*} avatar - Untrusted input, ideally an object with skin,
 *   hairStyle, hairColor, accessory, outfit and background trait IDs.
 * @returns {object} A complete avatar object with every field set to a
 *   valid trait ID.
 */
export function sanitizeAvatar(avatar) {
  const source = avatar && typeof avatar === "object" ? avatar : {};
  const result = {};
  Object.keys(DEFAULT_AVATAR).forEach((field) => {
    result[field] = isValidTrait(field, source[field]) ? source[field] : DEFAULT_AVATAR[field];
  });
  return result;
}

/**
 * Build the SVG markup for the hair layer.
 * @param {object} avatar - A sanitized avatar object.
 * @returns {string} SVG fragment (may be empty for "bald").
 */
function hairMarkup(avatar) {
  const color = traitColor("hairColor", avatar.hairColor);
  switch (avatar.hairStyle) {
    case "short":
      return `<rect x="17" y="9" width="30" height="17" rx="14" fill="${color}" />`;
    case "curly":
      return `
        <circle cx="20" cy="17" r="6.5" fill="${color}" />
        <circle cx="32" cy="12" r="7.5" fill="${color}" />
        <circle cx="44" cy="17" r="6.5" fill="${color}" />
      `;
    case "long":
      return `
        <rect x="17" y="9" width="30" height="17" rx="14" fill="${color}" />
        <rect x="13" y="18" width="8" height="28" rx="4" fill="${color}" />
        <rect x="43" y="18" width="8" height="28" rx="4" fill="${color}" />
      `;
    case "mohawk":
      return `<path d="M28 3 L36 3 L34.5 21 L29.5 21 Z" fill="${color}" />`;
    case "bald":
    default:
      return "";
  }
}

/**
 * Build the SVG markup for the accessory layer.
 * @param {object} avatar - A sanitized avatar object.
 * @returns {string} SVG fragment (may be empty for "none").
 */
function accessoryMarkup(avatar) {
  const outfit = traitColor("outfit", avatar.outfit);
  switch (avatar.accessory) {
    case "glasses":
      return `
        <circle cx="25" cy="29" r="6" fill="none" stroke="${INK}" stroke-width="2" />
        <circle cx="39" cy="29" r="6" fill="none" stroke="${INK}" stroke-width="2" />
        <line x1="31" y1="29" x2="33" y2="29" stroke="${INK}" stroke-width="2" />
      `;
    case "headphones":
      return `
        <path d="M16 27 A16 16 0 0 1 48 27" fill="none" stroke="${outfit}" stroke-width="3.5" />
        <circle cx="16" cy="31" r="5" fill="${outfit}" />
        <circle cx="48" cy="31" r="5" fill="${outfit}" />
      `;
    case "cap":
      return `
        <path d="M16 22 A16 16 0 0 1 48 22 Z" fill="${outfit}" />
        <rect x="40" y="18" width="17" height="6" rx="3" fill="${outfit}" />
      `;
    case "none":
    default:
      return "";
  }
}

/**
 * Build the full SVG markup for a player avatar. Every value comes from
 * the trait tables above (a fixed, code-controlled set), never from
 * `avatarInput` directly, so the result is safe to insert via innerHTML
 * even though the input avatar may have come from another player.
 * @param {*} avatarInput - Untrusted avatar object (sanitized internally).
 * @param {number} [size] - Rendered width/height in pixels.
 * @returns {string} A complete `<svg>...</svg>` string.
 */
export function renderAvatarMarkup(avatarInput, size = 64) {
  const avatar = sanitizeAvatar(avatarInput);
  const bg = traitColor("background", avatar.background);
  const skin = traitColor("skin", avatar.skin);
  const outfit = traitColor("outfit", avatar.outfit);

  return `
    <svg viewBox="0 0 64 64" width="${size}" height="${size}" role="img" aria-label="Player avatar">
      <circle cx="32" cy="32" r="32" fill="${bg}" />
      <path d="M10 62 Q10 43 32 43 Q54 43 54 62 Z" fill="${outfit}" />
      <circle cx="32" cy="29" r="15" fill="${skin}" />
      ${hairMarkup(avatar)}
      <circle cx="26" cy="30" r="1.6" fill="${INK}" />
      <circle cx="38" cy="30" r="1.6" fill="${INK}" />
      <path d="M25 35 Q32 40 39 35" stroke="${INK}" stroke-width="2" fill="none" stroke-linecap="round" />
      ${accessoryMarkup(avatar)}
    </svg>
  `;
}
