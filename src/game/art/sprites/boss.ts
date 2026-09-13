/**
 * Bosses as side-view pixel art — a hulking silhouette standing on the same
 * ground line as the player and the zombies.
 *
 * One body, tinted per boss rather than authored per boss: `BOSS_DEFS` already
 * carries a single `color` for exactly this reason ("drawBoss() shades this
 * into torso/head/limb tones"), and every boss is the same hulking silhouette.
 */
import { PixelBuf } from "../pixel";
import { rgba } from "../pixel";
import { axesFor, blob, limb } from "./soldier";

const TAU = Math.PI * 2;

/** Facings: 0 = right, 1 = left — the same two-facing side view as everything else. */
export const BOSS_DIRS = 2;
/** Stomp-cycle frames. */
export const BOSS_FRAMES = 4;

/**
 * Art-pixel frame for a boss of collision radius `r`.
 *
 * Sized at 1.6x the hitbox rather than the 1:1 the zombies use — the
 * silhouette has to say "boss" at a glance, and `r` stays the tuned gameplay
 * number.
 */
export function bossArtSize(r: number): number {
  return Math.max(36, Math.round(r * 1.6));
}

/** Lit-side offset, matching the zombie and soldier bodies. */
const LIT_DX = -1;
const LIT_DY = -1;

/**
 * A 4-step light-to-dark ramp from one base color. `BOSS_DEFS.color` is a
 * single dark hex per boss, so the tones are derived rather than authored —
 * a new boss needs one color, not a palette entry.
 */
export function rampFrom(hex: string): [string, string, string, string] {
  const [r, g, b] = rgba(hex);
  const at = (m: number) => {
    const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * m)));
    return `#${[c(r), c(g), c(b)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  };
  return [at(1.85), at(1.35), at(1), at(0.68)];
}

/**
 * One boss pose, standing on the ground line. The silhouette is deliberately
 * the heaviest thing on screen: a wide armoured back, shoulders well outside
 * the torso, and short thick arms, so it reads as a boss at a glance even in
 * a crowd of brutes.
 */
export function drawBoss(
  b: PixelBuf, dir: number, frame: number, color: string,
): void {
  const size = b.w;
  const C = size / 2;
  const U = C;
  const ax = axesFor(dir, BOSS_DIRS);
  const ramp = rampFrom(color);
  const plate = ramp[1];
  const plateLit = ramp[0];
  const deep = ramp[3];

  const phase = (frame / BOSS_FRAMES) * TAU;
  const swing = Math.sin(phase);
  const heave = Math.cos(phase * 0.5) * 0.03;

  const g = (f: number, s: number, rf: number, rs: number, col: string, lit = false) =>
    blob(b, ax, f * U, s * U, rf * U, rs * U, col,
      C + (lit ? LIT_DX : 0), C + (lit ? LIT_DY : 0));
  const lm = (f0: number, s0: number, f1: number, s1: number, r0: number, r1: number, col: string) =>
    limb(b, ax, f0 * U, s0 * U, f1 * U, s1 * U, r0 * U, r1 * U, col, C, C);

  const chestY = -0.05 + heave;

  // ---- legs: short and planted, barely visible under the bulk ----
  const st = swing * 0.08;
  lm(0, 0.30, -st, 0.86, 0.15, 0.13, deep);
  lm(0, 0.30, st, 0.86, 0.15, 0.13, deep);

  // ---- torso: a broad slab, tall and thick ----
  g(0.02, chestY, 0.42, 0.52, plate);
  g(0.02, chestY - 0.15, 0.32, 0.40, plateLit, true);

  // ---- shoulder pauldron, set high and forward so the outline reads wide ----
  g(0.16, chestY - 0.55, 0.22, 0.20, plate);
  g(0.18, chestY - 0.60, 0.15, 0.13, plateLit, true);

  // ---- arm, swinging with the stomp ----
  const arm = swing * 0.06;
  lm(0.20, chestY - 0.30, 0.56 + arm, chestY + 0.20, 0.17, 0.14, ramp[2]);
  // fist
  g(0.58 + arm, chestY + 0.22, 0.15, 0.15, deep);

  // ---- armour banding across the back ----
  for (const s of [chestY - 0.30, chestY + 0.05]) {
    lm(-0.30, s, -0.30, s + 0.001, 0.05, 0.05, deep);
  }

  // ---- head: small and sunk between the shoulders, which is what sells
  //      the mass of everything around it ----
  g(0.30, chestY - 0.86, 0.22, 0.20, ramp[2]);
  g(0.34, chestY - 0.90, 0.15, 0.14, ramp[1], true);
  // eyes — the only saturated thing on the body, so the facing is unmistakable
  g(0.42, chestY - 0.90, 0.06, 0.06, "#ef4444");
}
