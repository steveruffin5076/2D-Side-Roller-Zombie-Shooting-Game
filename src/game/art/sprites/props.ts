/**
 * Decor props, standing on the ground line in side view.
 *
 * The kinds and their per-theme spawn weights already existed in `themes.ts` —
 * only the draw path changes: every builder below anchors its silhouette to
 * the BOTTOM edge of its frame (the ground) and builds upward, the way a real
 * object standing beside a side-scrolling lane would.
 *
 * Per-instance variety is three authored variants per kind, not a scale
 * factor. Scaling a finished bitmap resamples it off the pixel grid and turns
 * the art to mush, which is why a tree gets three drawn variants instead of a
 * single one stretched by `s: R(0.7, 1.25)`.
 */
import { PixelBuf } from "../pixel";

/** tombstone-a, tombstone-b, tree, lamp, car, barrier, rubble */
export const PROP_KINDS = 8;
export const PROP_VARIANTS = 3;

/**
 * Kind 7 is the per-stage set-piece and is never rolled by the weighted decor
 * spawner — the engine places exactly one per stage. Its four "variants" are
 * the four themes rather than three cosmetic passes, which is why `prop()`
 * indexes modulo the built set's own length instead of `PROP_VARIANTS`.
 */
export const WRECK_KIND = 7;

/**
 * Sprite footprint per kind, in ART pixels — width x height, anchored to the
 * ground at the bottom edge. Roomier than the top-down footprints they
 * replace: a side-view tree or lamp needs real height to read as one.
 */
export const PROP_SIZE: readonly (readonly [number, number])[] = [
  [14, 22], // 0 tombstone slab
  [18, 15], // 1 tombstone block (a low chest tomb)
  [22, 38], // 2 dead tree
  [10, 40], // 3 lamp pole
  [34, 18], // 4 wrecked car
  [16, 15], // 5 jersey barrier
  [24, 12], // 6 rubble pile
  [80, 46], // 7 stage set-piece wreck
];

const P = {
  stone: ["#5a6478", "#465066", "#333c4e", "#222938"],
  moss: "#3c5232",
  bark: ["#463b2e", "#352c22", "#251f18", "#171310"],
  metal: ["#4a5058", "#383e46", "#282d34", "#191d22"],
  rust: ["#7a4e2c", "#5c3a20", "#3f2816"],
  glass: "#2a3a44",
  concrete: ["#57544c", "#43413a", "#312f2a", "#201f1b"],
  hazard: "#b08828",
  dark: "#12151a",
} as const;

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Speckle a body with its own darker steps so a flat fill reads as material. */
function grain(b: PixelBuf, r: () => number, ramp: readonly string[], n: number) {
  for (let i = 0; i < n; i++) {
    const x = Math.floor(r() * b.w);
    const y = Math.floor(r() * b.h);
    if (b.get(x, y)[3] === 0) continue; // only inside the silhouette
    b.px(x, y, ramp[1 + Math.floor(r() * 2)]);
  }
}

function tombstoneSlab(b: PixelBuf, v: number, r: () => number) {
  const w = b.w, h = b.h;
  const top = 4 + (v === 2 ? 2 : 0); // variant 2 leans shorter, cracked
  // the slab, standing on the ground with a rounded head
  b.rect(2, top, w - 4, h - top - 1, P.stone[1]);
  b.oval(w / 2 - 0.5, top, w / 2 - 2.5, 3, P.stone[1]);
  b.col(2, top, h - 2, P.stone[0]); // lit face
  b.col(w - 3, top, h - 2, P.stone[3]); // shadow face
  // engraved cross
  const cx = Math.floor(w / 2), cy = top + 6;
  b.col(cx, cy, cy + 6, P.stone[3]);
  b.row(cx - 2, cx + 2, cy + 2, P.stone[3]);
  if (v === 2) b.line(2, h - 8, w - 3, h - 12, P.stone[3]); // a fracture across the face
  if (v === 1) for (let i = 0; i < 5; i++) b.px(2 + Math.floor(r() * (w - 4)), h - 3 + Math.floor(r() * 2), P.moss);
  grain(b, r, P.stone, 16);
}

function tombstoneBlock(b: PixelBuf, v: number, r: () => number) {
  const w = b.w, h = b.h;
  const top = 3;
  b.rect(1, top, w - 2, h - top - 1, P.stone[1]);
  b.row(1, w - 2, top, P.stone[0]);
  b.col(1, top, h - 2, P.stone[0]);
  b.row(1, w - 2, h - 2, P.stone[3]);
  b.col(w - 2, top, h - 2, P.stone[3]);
  // a sunken panel on the near face — a chest tomb's carved front
  b.rect(3 + (v === 1 ? 1 : 0), top + 3, w - 6, h - top - 6, P.stone[2]);
  if (v === 2) b.line(3, top + 2, w - 4, h - 5, P.stone[3]);
  if (v === 0) for (let i = 0; i < 6; i++) b.px(2 + Math.floor(r() * (w - 4)), top + 1 + Math.floor(r() * 3), P.moss);
  grain(b, r, P.stone, 16);
}

function deadTree(b: PixelBuf, v: number, r: () => number) {
  const w = b.w, h = b.h;
  const cx = w / 2 - 0.5;
  const groundY = h - 1;
  const crown = h * (0.32 + v * 0.04);
  // trunk, thickest at the base
  b.line(cx, groundY, cx + (v - 1), crown, P.bark[2]);
  b.line(cx - 1, groundY, cx - 1 + (v - 1), crown, P.bark[3]);
  b.line(cx + 1, groundY, cx + 1 + (v - 1), crown, P.bark[1]);
  // bare limbs radiating up and out from the crown point — mostly negative
  // space, which is what a dead tree actually is
  const limbs = 5 + v;
  for (let i = 0; i < limbs; i++) {
    const a = Math.PI * (1.15 + (i / (limbs - 1)) * 1.7) + r() * 0.15; // fan upward
    const len = crown * (0.55 + r() * 0.4);
    const ex = cx + Math.cos(a) * len, ey = crown + Math.sin(a) * len;
    b.line(cx, crown, ex, ey, P.bark[2]);
    for (const [at, sp] of [[0.55, 0.6], [0.8, -0.7]] as const) {
      const bx = cx + Math.cos(a) * len * at, by = crown + Math.sin(a) * len * at;
      const fa = a + sp;
      const fl = len * (0.25 + r() * 0.2);
      b.line(bx, by, bx + Math.cos(fa) * fl, by + Math.sin(fa) * fl, P.bark[3]);
    }
  }
  grain(b, r, P.bark, 8);
}

function lampPole(b: PixelBuf, v: number) {
  const w = b.w, h = b.h;
  const cx = w / 2 - 0.5;
  const groundY = h - 1;
  const headY = 4;
  b.col(cx, headY + 3, groundY, P.metal[2]);
  b.col(cx - 1, headY + 3, groundY, P.metal[3]);
  // a slight curve at the top toward the fixture
  b.line(cx, headY + 3, cx + 3, headY, P.metal[2]);
  if (v === 1) {
    // square fixture — a different pole on the same street
    b.rect(cx, headY - 3, 6, 5, P.metal[2]);
    b.rect(cx + 1, headY - 2, 4, 3, P.metal[1]);
    b.rect(cx + 2, headY - 1, 2, 1, "#fdba74");
    return;
  }
  b.oval(cx + 3, headY, 3, 2.4, P.metal[2]);
  if (v === 2) {
    // dead: the housing is there, the bulb is out and the glass is broken
    b.oval(cx + 3, headY, 1.4, 1.2, "#8a7a5a");
    return;
  }
  b.oval(cx + 3, headY, 1.6, 1.3, "#fdba74");
}

function wreckedCar(b: PixelBuf, v: number, r: () => number) {
  const w = b.w, h = b.h;
  const groundY = h - 1;
  const bodyY = h - 8;
  b.rect(2, bodyY, w - 4, 7, P.metal[2]); // lower body shell, resting on the ground
  b.rect(6, bodyY - 7, w - 16, 8, P.metal[1]); // cabin roofline
  b.rect(8, bodyY - 5, w - 20, 5, P.glass); // cabin glass
  b.rect(2, bodyY, w - 4, 2, P.metal[3]); // rocker shadow
  // wheels, sitting on the ground line
  for (const wx of [8, w - 10]) {
    b.oval(wx, groundY - 1, 3.4, 3.4, P.dark);
    b.oval(wx, groundY - 1, 1.6, 1.6, P.metal[2]);
  }
  // headlight nose
  b.rect(w - 5, bodyY + 1, 3, 3, "#c9b98a");
  if (v === 1) {
    // burnt out: roof gone, rust through the shell
    b.rect(8, bodyY - 5, w - 20, 5, P.dark);
    for (let i = 0; i < 20; i++) b.px(2 + Math.floor(r() * (w - 4)), bodyY - 6 + Math.floor(r() * 12), P.rust[1]);
  }
  if (v === 2) {
    // rolled: crumpled across the whole shell, rust through
    for (let i = 0; i < 30; i++) b.px(2 + Math.floor(r() * (w - 4)), bodyY - 7 + Math.floor(r() * 13), P.rust[Math.floor(r() * 3)]);
  }
  grain(b, r, P.metal, 14);
}

function jerseyBarrier(b: PixelBuf, v: number, r: () => number) {
  const w = b.w, h = b.h;
  const groundY = h - 1;
  const topW = w * 0.35;
  // a concrete wedge, wider at the base than the top — the real barrier profile
  b.rect((w - topW) / 2, 2, topW, h - 3, P.concrete[1]);
  for (let y = 2; y < h - 1; y++) {
    const t = (y - 2) / (h - 3);
    const hw = (topW / 2) + (w / 2 - topW / 2) * t;
    b.row(w / 2 - hw, w / 2 + hw - 1, y, P.concrete[1]);
  }
  b.col(2, h - 6, groundY, P.concrete[0]); // lit base edge
  b.col(w - 3, h - 6, groundY, P.concrete[3]);
  // hazard bands across the face
  for (const y of [Math.round(h * 0.4), Math.round(h * 0.65)]) b.row(w * 0.28, w * 0.72, y, P.hazard);
  if (v === 1) b.line(3, 5, w - 4, 9, P.concrete[3]); // chipped
  if (v === 2) for (let i = 0; i < 8; i++) b.px(2 + Math.floor(r() * (w - 4)), 2 + Math.floor(r() * (h - 4)), P.concrete[3]);
  grain(b, r, P.concrete, 10);
}

function rubblePile(b: PixelBuf, v: number, r: () => number) {
  const w = b.w, h = b.h;
  const groundY = h - 1;
  // a low heap of broken slabs, piled up from the ground
  const chunks = 7 + v * 2;
  for (let i = 0; i < chunks; i++) {
    const x = r() * w;
    const cw = 3 + Math.floor(r() * 5), ch = 2 + Math.floor(r() * 4);
    const y = groundY - ch - Math.floor(r() * (h * 0.4));
    b.rect(x - cw / 2, y, cw, ch, P.concrete[1 + Math.floor(r() * 3)]);
    b.row(x - cw / 2, x + cw / 2 - 1, y, P.concrete[0]);
    b.row(x - cw / 2, x + cw / 2 - 1, y + ch - 1, "#1a1916");
  }
  // exposed rebar poking out of the heap
  for (let i = 0; i < 2 + v; i++) {
    const x = r() * w;
    b.line(x, groundY, x + r() * 6 - 3, groundY - h * (0.5 + r() * 0.4), P.rust[1]);
  }
  grain(b, r, P.concrete, 12);
}


/* ---------------- stage set-pieces, one per theme ---------------- */

/** Collapsed mausoleum — cemetery. */
function cryptWreck(b: PixelBuf, r: () => number) {
  const w = b.w, h = b.h;
  const groundY = h - 1;
  b.rect(4, 10, w - 8, h - 12, P.stone[2]);
  b.rect(6, 12, w - 12, h - 16, P.stone[1]);
  // the roof has fallen in down the middle
  b.oval(w / 2, 12, 16, 6, P.dark);
  for (let i = 0; i < 30; i++) {
    const x = w / 2 + (r() - 0.5) * 30, y = 10 + r() * 10;
    b.rect(x, y, 2 + r() * 3, 2 + r() * 3, P.stone[1 + Math.floor(r() * 3)]);
  }
  // columns still standing at the corners
  for (const cx of [8, w - 10]) {
    b.rect(cx, 8, 4, groundY - 8, P.stone[0]);
    b.rect(cx + 1, 8, 2, groundY - 8, P.stone[2]);
  }
  grain(b, r, P.stone, 34);
}

/** Wrecked school bus — suburbs. */
function busWreck(b: PixelBuf, r: () => number) {
  const w = b.w, h = b.h;
  const groundY = h - 1;
  const bodyY = h - 14;
  b.rect(2, bodyY, w - 4, 12, P.rust[1]); // body
  b.row(2, w - 3, bodyY + 4, "#8a6a2a"); // the one stripe that says school bus
  for (let x = 6; x < w - 8; x += 8) {
    b.rect(x, bodyY + 2, 5, 6, P.glass); // window band
    b.px(x + 1, bodyY + 3, "#3d525e");
  }
  b.rect(w - 12, bodyY - 4, 10, 6, P.rust[0]); // crumpled nose
  for (const wx of [8, w / 2, w - 14]) {
    b.oval(wx, groundY - 1, 3.6, 3.6, P.dark);
    b.oval(wx, groundY - 1, 1.7, 1.7, P.metal[2]);
  }
  for (let i = 0; i < 30; i++) b.px(2 + Math.floor(r() * (w - 4)), bodyY + Math.floor(r() * 12), P.rust[Math.floor(r() * 3)]);
  grain(b, r, P.metal, 20);
}

/** Jackknifed semi — highway. */
function semiWreck(b: PixelBuf, r: () => number) {
  const w = b.w, h = b.h;
  const groundY = h - 1;
  const trailerY = h - 24;
  b.rect(2, trailerY, w - 22, 22, P.metal[1]); // trailer
  b.row(2, w - 23, trailerY, P.metal[0]);
  for (let x = 5; x < w - 24; x += 7) b.col(x, trailerY + 1, groundY - 6, P.metal[2]); // ribs
  b.rect(w - 20, trailerY + 6, 18, 16, P.rust[1]); // cab, crumpled at the front
  b.rect(w - 17, trailerY + 9, 8, 6, P.glass);
  for (const wx of [8, 20, w - 12]) {
    b.oval(wx, groundY - 1, 3.6, 3.6, P.dark);
    b.oval(wx, groundY - 1, 1.7, 1.7, P.metal[2]);
  }
  // spilled load
  for (let i = 0; i < 20; i++) {
    const x = 4 + r() * (w - 28), y = groundY - 2 - r() * 6;
    b.rect(x, y, 2 + r() * 3, 2 + r() * 2, P.concrete[1 + Math.floor(r() * 3)]);
  }
  grain(b, r, P.metal, 26);
}

/** Downed helicopter — arena. */
function heloWreck(b: PixelBuf, r: () => number) {
  const w = b.w, h = b.h;
  const groundY = h - 1;
  const cy = groundY - 8;
  b.oval(w * 0.36, cy, 16, 9, P.metal[2]); // fuselage, tipped on its side
  b.oval(w * 0.36, cy, 14, 7, P.metal[1]);
  b.oval(w * 0.2, cy, 5, 5, P.glass); // nose glass
  b.rect(w * 0.5, cy - 2, w * 0.34, 4, P.metal[2]); // tail boom
  b.rect(w - 10, cy - 8, 3, 12, P.metal[1]); // tail fin
  // main rotor, bent, drooping toward the ground
  for (const a of [2.9, 3.5, 4.3]) {
    b.line(w * 0.36, cy - 4, w * 0.36 + Math.cos(a) * 26, cy - 4 + Math.sin(a) * 14, P.metal[0]);
  }
  b.oval(w * 0.36, cy - 4, 2.5, 2.5, P.metal[3]);
  // scorching around the impact, at the base
  for (let i = 0; i < 30; i++) {
    const x = w * 0.3 + r() * w * 0.4, y = groundY - r() * 4;
    b.px(Math.round(x), Math.round(y), "#241a16");
  }
  for (let i = 0; i < 16; i++) b.px(Math.floor(r() * w), Math.floor(cy - 9 + r() * 18), P.rust[Math.floor(r() * 3)]);
  grain(b, r, P.metal, 22);
}

const WRECKS = [cryptWreck, busWreck, semiWreck, heloWreck];

const BUILDERS = [
  tombstoneSlab, tombstoneBlock, deadTree,
  (b: PixelBuf, v: number, _r: () => number) => lampPole(b, v),
  wreckedCar, jerseyBarrier, rubblePile,
  // kind 7 dispatches on theme rather than cosmetic variant — see WRECK_KIND
  (b: PixelBuf, v: number, r: () => number) => WRECKS[v % WRECKS.length](b, r),
];

/**
 * Every variant of one decor kind. Pure: same kind in, same pixels out.
 * Outlined once at the end — a prop against a dark floor needs the separation,
 * and outlining inside each builder would stamp borders through overlapping
 * chunks.
 */
export function buildPropBufs(kind: number): PixelBuf[] {
  const k = Math.max(0, Math.min(PROP_KINDS - 1, kind | 0));
  const [w, h] = PROP_SIZE[k];
  const out: PixelBuf[] = [];
  const count = k === WRECK_KIND ? WRECKS.length : PROP_VARIANTS;
  for (let v = 0; v < count; v++) {
    const b = new PixelBuf(w, h);
    BUILDERS[k](b, v, rng(k * 0x9e3779b1 + v * 0x85ebca6b + 7));
    if (k !== 3) b.outline("#0a0d12"); // the lamp is a light source, not a solid
    out.push(b);
  }
  return out;
}
