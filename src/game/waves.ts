/**
 * The wave director's pure helpers. No stages, no acts — just a single
 * endless wave counter (1, 2, 3, …) that keeps escalating forever, with a
 * real boss fight breaking up the fodder every 5th wave.
 */

/** Every 5th wave (5, 10, 15, …) is a boss fight instead of ordinary fodder. */
export function isBossWave(wave: number): boolean {
  return wave > 0 && wave % 5 === 0;
}

/** The difficulty scalar every combat-balance formula reads (spawn count,
 * zombie hp/speed/dmg, boss hp...). Unbounded — this is endless mode, so it
 * keeps climbing for as long as a run lasts. */
export function difficultyFor(wave: number): number {
  return wave / 6;
}

/**
 * Weighted pick across a spawn-weight table, keyed by ZType id (kept as a
 * plain string here — waves.ts doesn't depend on engine.ts's private types).
 * `rng` is injected so this is deterministic under test, same pattern as
 * `rollLoot` in loot.ts.
 */
export function rollEnemy(weights: Partial<Record<string, number>>, rng: () => number = Math.random): string {
  const entries = Object.entries(weights).filter((e): e is [string, number] => (e[1] ?? 0) > 0);
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let roll = rng() * total;
  for (const [type, w] of entries) {
    roll -= w;
    if (roll < 0) return type;
  }
  return entries[entries.length - 1][0];
}
