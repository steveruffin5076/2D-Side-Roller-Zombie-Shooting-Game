/**
 * The five zombie types as side-view pixel art — standing on the same ground
 * line as the player, each with its own SILHOUETTE (the thing that actually
 * reads at gameplay speed) built from its own flesh/rag ramps in `palette.ts`.
 *
 * Sprite sizes are derived from each type's collision radius in engine.ts's
 * ZCONF (walker 19, runner ~13, spitter ~15, brute 45, screamer ~13), so what
 * the player sees is what they can actually shoot.
 *
 * Like the soldier, nothing here outlines itself; the atlas outlines once
 * after the body is complete.
 */
import { PixelBuf } from "../pixel";
import { CLAW, EYE_ALERT, EYE_HOSTILE, RAMPS, ZOMBIE_RAMPS } from "../palette";
import { axesFor, blob, limb } from "./soldier";

const TAU = Math.PI * 2;

export type ZSpriteType = "walker" | "runner" | "brute" | "spitter" | "screamer";

/** Facings baked per zombie: 0 = right, 1 = left — same two-facing side view as the player. */
export const Z_DIRS = 2;
/** Shamble-cycle frames. */
export const Z_FRAMES = 4;
/**
 * Body variants per type. `mkZombie` gives every instance a random `tint`,
 * which picks a variant instead of a flat color, so a crowd varies without
 * per-instance scaling that would break pixel alignment.
 */
export const Z_VARIANTS = 2;

/** Art-pixel frame size per type — roughly 2x the type's collision radius. */
export const Z_SIZE: Record<ZSpriteType, number> = {
  walker: 26,
  runner: 20,
  spitter: 22,
  brute: 56,
  screamer: 20,
};

const LIT_DX = -1;
const LIT_DY = -1;

interface Shape {
  /** torso radii: forward (depth) and vertical half-height */
  rf: number; rs: number;
  /** torso centre height (negative = up), as a fraction of the half-size */
  chestY: number;
  /** head height and radius */
  headY: number; headR: number;
  /** how far forward the arms reach, and their height */
  armReach: number; armY: number;
  /** foot height (near the bottom edge) and stride amplitude */
  footY: number; stride: number;
  /** forward lean of the whole body (runners hunch into their sprint) */
  lean: number;
}

/**
 * Per-type proportions, as a fraction of the sprite's half-size, so one set of
 * numbers describes a 20px runner and a 56px brute alike.
 */
const SHAPES: Record<ZSpriteType, Shape> = {
  // upright and roughly symmetric — the baseline everything else reads against
  walker: { rf: 0.30, rs: 0.40, chestY: -0.06, headY: -0.72, headR: 0.26, armReach: 0.56, armY: -0.06, footY: 0.86, stride: 0.16, lean: 0.04 },
  // hunched into a sprint, head thrown forward, legs driving hard
  runner: { rf: 0.28, rs: 0.34, chestY: -0.02, headY: -0.62, headR: 0.24, armReach: 0.30, armY: 0.02, footY: 0.82, stride: 0.30, lean: 0.20 },
  // enormously bulky, head sunk low, arms thick and reaching
  brute: { rf: 0.44, rs: 0.52, chestY: -0.02, headY: -0.60, headR: 0.22, armReach: 0.62, armY: 0.02, footY: 0.88, stride: 0.10, lean: 0.02 },
  // bloated and round, with a sac on its back
  spitter: { rf: 0.40, rs: 0.44, chestY: -0.02, headY: -0.66, headR: 0.24, armReach: 0.38, armY: -0.02, footY: 0.86, stride: 0.10, lean: 0.0 },
  // thin, head thrown back, arms splayed wide and high
  screamer: { rf: 0.24, rs: 0.36, chestY: -0.10, headY: -0.80, headR: 0.26, armReach: 0.40, armY: -0.24, footY: 0.84, stride: 0.14, lean: -0.06 },
};

/**
 * One zombie pose. `variant` selects a body variation; `frame` drives the
 * shamble. Drawn standing on the ground line at the bottom of a `Z_SIZE[type]` square.
 */
export function drawZombie(
  b: PixelBuf, type: ZSpriteType, dir: number, frame: number, variant = 0,
): void {
  const size = Z_SIZE[type];
  const C = size / 2;
  const ax = axesFor(dir, Z_DIRS);
  const sh = SHAPES[type];
  const { flesh, cloth } = ZOMBIE_RAMPS[type];

  const U = C;
  const phase = (frame / Z_FRAMES) * TAU;
  // the two variants shamble out of phase, so a crowd never moves in lockstep
  const ph = phase + (variant ? Math.PI * 0.5 : 0);
  const swing = Math.sin(ph);
  const lurch = Math.cos(ph * 0.5) * 0.4;

  const g = (f: number, s: number, rf: number, rs: number, col: string, lit = false) =>
    blob(b, ax, f * U, s * U, rf * U, rs * U, col,
      C + (lit ? LIT_DX : 0), C + (lit ? LIT_DY : 0));
  const lm = (f0: number, s0: number, f1: number, s1: number, r0: number, r1: number, col: string) =>
    limb(b, ax, f0 * U, s0 * U, f1 * U, s1 * U, r0 * U, r1 * U, col, C, C);

  const lean = sh.lean;
  const chestF = lean, chestY = sh.chestY;
  const hipY = (sh.footY + chestY) * 0.55;

  // ---- back leg, trailing behind the lean ----
  const st = sh.stride * swing;
  lm(lean * 0.6, hipY, lean * 0.4 - st, sh.footY, 0.12, 0.10, flesh[3]);
  g(lean * 0.4 - st, sh.footY, 0.11, 0.07, flesh[3]);

  // ---- spitter's acid sac, on its back, before the torso covers it ----
  if (type === "spitter") {
    g(-0.42, chestY + 0.06, 0.24, 0.28, RAMPS.rotSick[0]);
    g(-0.46, chestY + 0.12, 0.13, 0.15, "#a3e63588");
  }

  // ---- torso, in torn clothing ----
  g(chestF + lurch * 0.05, chestY, sh.rf, sh.rs, cloth[1]);
  g(chestF + lurch * 0.05, chestY - sh.rs * 0.2, sh.rf * 0.72, sh.rs * 0.72, cloth[0], true);
  // exposed flesh where the clothing is torn through
  const tearR = Math.min(sh.rf * 0.34, 3.4 / U);
  g(chestF + 0.06, chestY + (variant ? 0.14 : -0.10), tearR, tearR * 0.9, flesh[2]);
  const woundR = Math.min(sh.rf * 0.22, 2.2 / U);
  g(chestF - 0.06, chestY + (variant ? -0.16 : 0.18), woundR, woundR * 0.9, RAMPS.blood[3]);

  // ---- brute's shoulder slab: the whole point of its silhouette ----
  if (type === "brute") {
    g(chestF + 0.10, chestY - sh.rs * 0.7, 0.22, 0.20, flesh[1]);
    g(chestF + 0.12, chestY - sh.rs * 0.78, 0.14, 0.12, flesh[0], true);
  }

  // ---- front leg, forward of the lean ----
  lm(lean * 0.6, hipY, lean * 0.4 + st, sh.footY, 0.13, 0.10, flesh[2]);
  g(lean * 0.4 + st, sh.footY, 0.11, 0.07, flesh[2]);

  // ---- arm reaching forward ----
  const reach = sh.armReach + swing * 0.05;
  const armR = type === "brute" ? 0.15 : 0.10;
  const shF = chestF + sh.rf * 0.3, shY = chestY + sh.rs * 0.55;
  lm(shF, shY, reach, sh.armY, armR, armR * 0.75, flesh[1]);
  g(reach, sh.armY, armR * 0.95, armR * 0.95, flesh[0], true);
  // a second arm hangs near the torso for chunkiness
  lm(shF - 0.05, shY, shF - 0.16 - swing * 0.08, shY + 0.30, armR * 0.9, armR * 0.7, flesh[2]);
  // claws — a few near-white pixels past the hand read as menace at this size
  if (type !== "spitter") {
    g(reach + armR * 1.15, sh.armY - 0.04, 0.05, 0.04, CLAW);
  }

  // ---- head, on a short neck so it reads as attached ----
  lm(chestF + sh.rf * 0.2, chestY - sh.rs * 0.9, chestF + lean * 0.6, sh.headY + sh.headR * 0.6, sh.headR * 0.5, sh.headR * 0.7, flesh[2]);
  g(chestF + lean * 0.6, sh.headY, sh.headR, sh.headR, flesh[1]);
  g(chestF + lean * 0.6 - LIT_DX * 0.02, sh.headY - 0.02, sh.headR * 0.62, sh.headR * 0.62, flesh[0], true);

  const headF = chestF + lean * 0.6;
  if (type === "screamer") {
    // mouth thrown wide — her tell, and the reason to shoot her first
    g(headF + 0.10, sh.headY + 0.10, sh.headR * 0.6, sh.headR * 0.7, "#2a1016");
    g(headF + 0.14, sh.headY + 0.10, sh.headR * 0.34, sh.headR * 0.42, EYE_ALERT);
  } else {
    // hanging jaw
    g(headF + 0.06, sh.headY + 0.20, sh.headR * 0.42, sh.headR * 0.46, flesh[2]);
    g(headF + 0.08, sh.headY + 0.24, sh.headR * 0.22, sh.headR * 0.26, "#2a1016");
  }

  // eyes, the clearest "it has seen you" cue on the sprite
  const eye = type === "screamer" ? EYE_ALERT : EYE_HOSTILE;
  g(headF + 0.16, sh.headY - 0.02, 0.05, 0.05, eye);
}
