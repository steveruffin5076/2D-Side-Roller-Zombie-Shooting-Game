import { describe, expect, it } from "vitest";
import {
  Z_POSES, buildGunBufs, buildSoldierBufs, buildZombieBufs, dirFor, poseIndex, zombieIndex,
} from "./sheets";
import { DIRS, FRAMES, GUN_SIZE, SOLDIER_SIZE } from "./sprites/soldier";
import { Z_DIRS, Z_FRAMES, Z_SIZE, Z_VARIANTS, type ZSpriteType } from "./sprites/zombies";

const TYPES: ZSpriteType[] = ["walker", "runner", "brute", "spitter", "screamer"];

/** Opaque pixels, i.e. how much of the frame the body actually fills. */
function coverage(b: { w: number; h: number; data: Uint8ClampedArray }) {
  let n = 0;
  for (let i = 3; i < b.data.length; i += 4) if (b.data[i] > 0) n++;
  return n / (b.w * b.h);
}

describe("soldier sheet", () => {
  const bufs = buildSoldierBufs();

  it("covers every facing and walk frame exactly once", () => {
    expect(bufs).toHaveLength(DIRS * FRAMES);
  });

  it("draws something in every pose", () => {
    // a silently-empty pose renders as an invisible player, which no
    // type-check or build would ever catch
    bufs.forEach((b, i) => {
      expect(b.isEmpty(), `soldier pose ${i} is blank`).toBe(false);
    });
  });

  it("sizes every pose to the sprite frame", () => {
    for (const b of bufs) {
      expect(b.w).toBe(SOLDIER_SIZE);
      expect(b.h).toBe(SOLDIER_SIZE);
    }
  });

  it("fills a usable share of the frame at every facing", () => {
    // guards the bug the first draft actually had: a body so small inside its
    // frame that it read as a dot with a wide transparent margin
    for (const b of bufs) {
      const c = coverage(b);
      expect(c).toBeGreaterThan(0.2);
      expect(c).toBeLessThan(0.95);
    }
  });

  it("indexes poses dir-major", () => {
    expect(poseIndex(0, 0, FRAMES)).toBe(0);
    expect(poseIndex(1, 0, FRAMES)).toBe(FRAMES);
    expect(poseIndex(2, 3, FRAMES)).toBe(2 * FRAMES + 3);
  });

  it("differs between facings", () => {
    // if axesFor were ignored, every direction would be byte-identical
    const a = bufs[poseIndex(0, 0, FRAMES)].data;
    const b = bufs[poseIndex(1, 0, FRAMES)].data;
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
  });
});

describe("gun sheets", () => {
  it("builds one pose per facing for each class, all non-empty", () => {
    for (const cls of ["pistol", "smg", "shotgun", "carbine"] as const) {
      const bufs = buildGunBufs(cls);
      expect(bufs).toHaveLength(DIRS);
      for (const b of bufs) {
        expect(b.w).toBe(GUN_SIZE);
        expect(b.isEmpty()).toBe(false);
      }
    }
  });

  it("gives longer classes a longer barrel", () => {
    // the four classes must be tellable apart in the player's hands
    const px = (cls: "pistol" | "carbine") => {
      const b = buildGunBufs(cls)[0]; // facing +x
      let far = 0;
      for (let y = 0; y < b.h; y++) {
        for (let x = 0; x < b.w; x++) if (b.get(x, y)[3] > 0) far = Math.max(far, x);
      }
      return far;
    };
    expect(px("carbine")).toBeGreaterThan(px("pistol"));
  });
});

describe("zombie sheets", () => {
  it("builds every variant x facing x frame for every type", () => {
    for (const t of TYPES) {
      const bufs = buildZombieBufs(t);
      expect(bufs, t).toHaveLength(Z_POSES);
      expect(Z_POSES).toBe(Z_VARIANTS * Z_DIRS * Z_FRAMES);
      bufs.forEach((b, i) => {
        expect(b.w, `${t} pose ${i}`).toBe(Z_SIZE[t]);
        expect(b.isEmpty(), `${t} pose ${i} is blank`).toBe(false);
      });
    }
  });

  it("indexes variant-major, then dir, then frame", () => {
    expect(zombieIndex(0, 0, 0)).toBe(0);
    expect(zombieIndex(0, 1, 0)).toBe(Z_FRAMES);
    expect(zombieIndex(1, 0, 0)).toBe(Z_DIRS * Z_FRAMES);
    expect(zombieIndex(Z_VARIANTS - 1, Z_DIRS - 1, Z_FRAMES - 1)).toBe(Z_POSES - 1);
  });

  it("gives each type its own silhouette size", () => {
    // the old art drew one oval for all five and scaled it; sizes must now
    // actually differ or the types are back to being told apart by size alone
    expect(Z_SIZE.brute).toBeGreaterThan(Z_SIZE.walker);
    expect(Z_SIZE.walker).toBeGreaterThan(Z_SIZE.runner);
  });

  it("makes the two variants of a pose differ", () => {
    const bufs = buildZombieBufs("walker");
    const a = bufs[zombieIndex(0, 0, 0)].data;
    const b = bufs[zombieIndex(1, 0, 0)].data;
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
  });
});

describe("dirFor", () => {
  it("snaps the cardinal angles to their own facing", () => {
    expect(dirFor(0, 8)).toBe(0);
    expect(dirFor(Math.PI / 2, 8)).toBe(2);
    expect(dirFor(Math.PI, 8)).toBe(4);
  });

  it("wraps negative angles and angles past a full turn", () => {
    // atan2 returns (-PI, PI], so negatives are the common case, not an edge one
    expect(dirFor(-Math.PI / 2, 8)).toBe(6);
    expect(dirFor(-Math.PI, 8)).toBe(4);
    expect(dirFor(Math.PI * 2, 8)).toBe(0);
    expect(dirFor(Math.PI * 2.5, 8)).toBe(2);
  });

  it("stays in range for any angle", () => {
    for (let a = -20; a < 20; a += 0.37) {
      const d = dirFor(a, 16);
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThan(16);
    }
  });
});
