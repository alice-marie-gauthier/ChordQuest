// Mirrors the CSS custom properties in styles.css: white/grey-beige
// neutrals, a thin grey line, and a single brown accent (matched to the
// Swiss Cat+ tools this project sits alongside), plus wine red kept for
// its danger/miss meaning. Kept in sync by hand since a <canvas> can't
// read CSS variables directly.
export const Palette = {
  paper: "#ffffff",
  paperCard: "#ffffff",
  paperChip: "#f4f3f0",
  ink: "#211a15",
  inkSoft: "#6b6862",
  line: "#d9d7d2",
  brown: "#895129",
  brownDeep: "#6b3f1f",
  brownSoft: "#f1e3d5",
  wine: "#7c2d3a",
  wineDeep: "#5c1f29",
  wineSoft: "#f2dadd",
  forest: "#3c6e58",
  forestDeep: "#274a3c",
  ivory: "#fffaf0",
  ebony: "#241a12"
};

// A small rotation of pastel/deep pairs for the arriving chord plaques
// (see game/obstacle.js) — each pair keeps the "pastel fill, matching
// dark trim + lettering" look the wine-only version had, just spread
// across a few playful hues instead of always wine, so the obstacles
// read as a fun, varied set of candy-colored signs rather than one
// repeated block.
export const CANDY_PALETTE = [
  { soft: "#f2dadd", deep: "#5c1f29" }, // wine
  { soft: "#d7ece7", deep: "#1f5c4e" }, // teal
  { soft: "#f7ecc9", deep: "#8a6a12" }, // mustard
  { soft: "#e6def5", deep: "#4a2f7c" }, // lavender
  { soft: "#fbe0d4", deep: "#a8431b" }, // coral
  { soft: "#d9e8f7", deep: "#1f4f7c" } // sky
];
