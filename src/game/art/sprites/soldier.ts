/**
 * The player, as a side-view pixel-art soldier — standing on a ground line,
 * seen from the side the way a run-and-gun character always has been.
 *
 * Authored procedurally in (lean, height) coordinates rather than as hand-drawn
 * bitmaps: every part is placed relative to a fixed vertical stack (boots at
 * the bottom, head at the top) and a horizontal lean that flips with facing.
 * `height` is screen-space up/down and never flips — only `lean` (forward/back)
 * responds to which way the character faces, via `axesFor`'s fx.
 *
 * Body and weapon are separate sprites (see `drawGun`) so the gun can be swapped
 * per class without redrawing the body, and so a future free-aim could angle the
 * gun independently — today it just points along the facing.
 *
 * Neither draw function outlines itself — the caller composites body and gun
 * first and outlines once, or the gun's border would be stamped across the
 * body underneath it.
 */
import { PixelBuf } from "../pixel";
import { RAMPS } from "../palette";
import type { WeaponClass } from "../../weapons";

/** Art-pixel size of a character sprite (square frame; feet sit on the bottom
 * edge). 26 x PX_SCALE = 52 canvas units. */
export const SOLDIER_SIZE = 26;
/** Facings baked per sprite: 0 = right, 1 = left. A side view only ever shows two. */
export const DIRS = 2;
/** Walk-cycle frames. */
export const FRAMES = 4;

const C = SOLDIER_SIZE / 2;

/** Overhead light comes from the upper-left in SCREEN space and does not rotate
 * with facing — a light that flipped with the character would read as the
 * world tilting. */
const LIT_DX = -1;
const LIT_DY = -1;

export interface Axes {
  /** unit vector along the facing lean (horizontal only — +1 right, -1 left) */
  fx: number; fy: number;
  /** unit vector along screen height (always straight down) */
  sx: number; sy: number;
}

/** Side-view axes: `fwd` in every blob()/limb() call below is a horizontal lean
 * that flips with facing, `side` is screen height and never flips — so a part
 * placed above the belt always renders above it, whichever way the body faces. */
export function axesFor(dir: number, dirs = DIRS): Axes {
  const facing = dir % dirs === 0 ? 1 : -1;
  return { fx: facing, fy: 0, sx: 0, sy: 1 };
}

/**
 * Filled oval placed in (lean, height) space. `rf`/`rs` are its radii along
 * those axes — `rf` is thickness front-to-back, `rs` is vertical half-height.
 */
export function blob(
  b: PixelBuf, ax: Axes, fwd: number, side: number,
  rf: number, rs: number, color: string, cx = C, cy = C,
): void {
  const ox = cx + ax.fx * fwd + ax.sx * side;
  const oy = cy + ax.fy * fwd + ax.sy * side;
  const rad = Math.ceil(Math.max(rf, rs)) + 1;
  for (let y = Math.floor(oy - rad); y <= Math.ceil(oy + rad); y++) {
    for (let x = Math.floor(ox - rad); x <= Math.ceil(ox + rad); x++) {
      const dx = x - ox, dy = y - oy;
      const df = dx * ax.fx + dy * ax.fy;
      const ds = dx * ax.sx + dy * ax.sy;
      if ((df * df) / (rf * rf) + (ds * ds) / (rs * rs) <= 1) b.px(x, y, color);
    }
  }
}

/**
 * A tapered limb between two (lean, height) points — a run of shrinking blobs
 * rather than two endpoints, so a reaching arm or a striding leg stays one
 * connected shape instead of a floating hand/foot.
 */
export function limb(
  b: PixelBuf, ax: Axes,
  f0: number, s0: number, f1: number, s1: number,
  r0: number, r1: number, color: string, cx = C, cy = C,
): void {
  const steps = Math.max(2, Math.ceil(Math.hypot(f1 - f0, s1 - s0)));
  for (let i = 0; i <= steps; i++) {
    const k = i / steps;
    const r = r0 + (r1 - r0) * k;
    blob(b, ax, f0 + (f1 - f0) * k, s0 + (s1 - s0) * k, r, r, color, cx, cy);
  }
}

/**
 * One walk-cycle body pose, standing on the ground line at the bottom of the
 * frame. `frame` drives a scissoring stride; pass -1 for a still idle pose.
 */
export function drawSoldier(b: PixelBuf, dir: number, frame: number): void {
  const ax = axesFor(dir);
  const phase = frame < 0 ? 0 : (frame / FRAMES) * Math.PI * 2;
  const stride = frame < 0 ? 0 : Math.sin(phase) * 3.4;
  const bob = frame < 0 ? 0 : Math.abs(Math.cos(phase)) * 1.1;

  const suit = RAMPS.playerSuit;
  const rig = RAMPS.playerRig;
  const hat = RAMPS.playerHelmet;
  const skin = RAMPS.skin;
  const steel = RAMPS.steel;

  const HIP = -1.5 - bob;
  const CHEST = -6.5 - bob;
  const HEAD = -10.8 - bob;
  const FOOT = 11.2 - bob * 0.4;
  // where the engine actually draws the gun (chestY = feet - CHEST_H, a fixed
  // world-space height independent of this sprite's own coordinate system) —
  // the grip-hand must land exactly here or the arm visibly floats off the gun
  const GRIP = -2 - bob;

  // ---- back leg, trailing behind the lean ----
  blob(b, ax, -stride * 0.9, FOOT, 2.3, 1.7, steel[3]);
  limb(b, ax, -1.0, HIP, -stride, FOOT - 1.5, 2.0, 1.6, suit[2]);

  // ---- backpack, trailing opposite the facing lean ----
  blob(b, ax, -4.0, CHEST + 1, 2.6, 4.2, rig[2]);
  blob(b, ax, -4.6, CHEST + 1, 1.6, 2.6, rig[3]);

  // ---- torso: the widest mass ----
  blob(b, ax, 0.6, CHEST, 3.6, 5.2, suit[1]);
  // lit side, offset in screen space so the light never rotates with facing
  blob(b, ax, 0.6, CHEST - 0.6, 2.7, 3.9, suit[0], C + LIT_DX, C + LIT_DY);
  // shadow along the trailing edge
  blob(b, ax, -1.4, CHEST + 1.6, 2.0, 2.6, suit[2]);

  // ---- front leg, forward of the lean ----
  limb(b, ax, 1.0, HIP, stride, FOOT - 1.5, 2.0, 1.6, suit[3]);
  blob(b, ax, stride * 0.9, FOOT, 2.3, 1.7, steel[3]);

  // ---- vest webbing across the chest ----
  blob(b, ax, 2.0, CHEST - 1, 1.1, 4.4, rig[2]);
  blob(b, ax, -0.6, CHEST + 1, 1.0, 4.0, rig[3]);
  blob(b, ax, 2.6, CHEST + 1.6, 1.6, 1.7, rig[0]);

  // ---- shoulder, the near one only (the side view hides the far one) ----
  blob(b, ax, 1.0, CHEST - 4.2, 2.6, 2.2, rig[1]);
  // squad marking on the pad
  blob(b, ax, 1.6, CHEST - 4.4, 1.1, 0.9, RAMPS.playerMark[1]);

  // ---- neck + helmet, sitting atop the torso ----
  blob(b, ax, 0.8, CHEST - 5.4, 1.5, 1.4, skin[2]);
  blob(b, ax, 0.6, HEAD, 3.9, 3.7, hat[2]);
  blob(b, ax, 0.9, HEAD - 0.5, 2.8, 2.7, hat[1], C + LIT_DX, C + LIT_DY);
  blob(b, ax, 0.9, HEAD - 0.8, 1.6, 1.6, hat[0], C + LIT_DX, C + LIT_DY);
  // brim, jutting toward the facing direction
  blob(b, ax, 3.4, HEAD - 0.4, 1.6, 1.0, hat[3]);
  // face sliver + visor, the clearest "which way is front" cue
  blob(b, ax, 3.4, HEAD + 1.0, 1.1, 1.6, skin[1]);
  blob(b, ax, 3.9, HEAD + 1.0, 0.8, 1.4, RAMPS.visor[0]);

  // ---- firing arm, shoulder to the actual grip point ----
  limb(b, ax, 1.4, CHEST - 2.4, 6.4, GRIP, 1.7, 1.4, suit[2]);
  blob(b, ax, 6.7, GRIP + 0.2, 1.3, 1.2, skin[0]);

  // ---- support arm, tucked under for a two-handed hold ----
  limb(b, ax, 2.2, CHEST - 1.0, 5.3, GRIP + 1.1, 1.5, 1.2, suit[3]);
  blob(b, ax, 5.5, GRIP + 1.3, 1.0, 0.9, skin[0]);
}

/**
 * Art-pixel size of a weapon sprite. Wider than the body frame: a carbine
 * barrel reaches far out from centre and would clip a smaller box.
 */
export const GUN_SIZE = 34;
const CG = GUN_SIZE / 2;

/** Barrel length in art pixels per class — drives the muzzle offset too. */
const GUN_LEN: Record<WeaponClass, number> = {
  pistol: 5,
  smg: 7.5,
  shotgun: 9,
  carbine: 11,
};

/**
 * Muzzle distance from the sprite centre, in ART pixels. The engine multiplies
 * by PX_SCALE to place the muzzle flash and tracer origin on the actual barrel
 * tip.
 */
export function muzzleReach(cls: WeaponClass): number {
  return 5 + GUN_LEN[cls] + 2;
}

/** The held weapon, pointing along the facing lean. Centred in its own GUN_SIZE frame. */
export function drawGun(b: PixelBuf, dir: number, cls: WeaponClass): void {
  const ax = axesFor(dir);
  const steel = RAMPS.steel;
  const len = GUN_LEN[cls];
  // held at chest height, matching the arm's grip point above
  const height = -1.0;

  const g = (f: number, s: number, rf: number, rs: number, col: string, lit = false) =>
    blob(b, ax, f, s, rf, rs, col, CG + (lit ? LIT_DX : 0), CG + (lit ? LIT_DY : 0));

  // both hands on the grip
  g(4.4, height, 1.8, 1.7, RAMPS.skin[2]);
  g(4.4, height + 2.3, 1.6, 1.5, RAMPS.skin[2]);

  // receiver
  g(5 + len / 2, height, len / 2, 1.8, steel[1]);
  // lit top edge
  g(5 + len / 2, height - 1, len / 2 - 1, 0.9, steel[0], true);
  // barrel
  g(5 + len, height, 2.0, 1.0, steel[2]);

  // class tells, so the four read differently at gameplay size
  if (cls === "shotgun") {
    g(5 + len * 0.6, height - 1.9, len * 0.45, 0.8, steel[2]);
  }
  if (cls === "carbine") {
    g(1.4, height, 3.0, 1.4, steel[2]); // stock, back past the shoulder
    g(5.8, height + 2.7, 1.4, 2.1, steel[2]); // magazine hanging below
    g(8.0, height - 1.7, 1.8, 0.8, steel[0]); // optic rail
  }
  if (cls === "smg") {
    g(5.8, height + 2.5, 1.3, 1.9, steel[2]);
  }
  if (cls === "pistol") {
    g(5.0, height + 1.8, 1.3, 1.4, steel[2]); // stubby grip only
  }
}
