import { describe, it, expect } from "vitest";
import { isBossWave, difficultyFor, rollEnemy } from "./waves";

describe("isBossWave", () => {
  it("is true on every multiple of 5", () => {
    for (const w of [5, 10, 15, 20, 100]) expect(isBossWave(w)).toBe(true);
  });

  it("is false everywhere else, including wave 0", () => {
    for (const w of [0, 1, 2, 3, 4, 6, 11, 99]) expect(isBossWave(w)).toBe(false);
  });
});

describe("difficultyFor", () => {
  it("is monotonically increasing", () => {
    let prev = -Infinity;
    for (let wave = 1; wave <= 200; wave++) {
      const d = difficultyFor(wave);
      expect(d).toBeGreaterThan(prev);
      prev = d;
    }
  });

  it("starts low and climbs unbounded", () => {
    expect(difficultyFor(1)).toBeLessThan(1);
    expect(difficultyFor(300)).toBeGreaterThan(40);
  });
});

describe("rollEnemy", () => {
  it("is deterministic under injected rng", () => {
    const weights = { walker: 1, runner: 1 };
    expect(rollEnemy(weights, () => 0)).toBe("walker");
    expect(rollEnemy(weights, () => 0.99)).toBe("runner");
  });

  it("ignores zero/undefined weights", () => {
    const weights = { walker: 1, runner: 0, splitter: undefined };
    const results = new Set();
    for (let i = 0; i < 50; i++) {
      results.add(rollEnemy(weights));
    }
    expect([...results]).toEqual(["walker"]);
  });
});
