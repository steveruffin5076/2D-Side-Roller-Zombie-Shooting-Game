import type { PlacedItem } from "./grid";
import type { WeaponClass } from "./weapons";

export const SAVE_VERSION = 4;

/** A single run's checkpoint — written at every boss-wave clear, restored on
 * death to resume from there. Resets to nothing on a genuine game over. */
export interface SaveData {
  version: number;
  /** the wave to resume at — always one past the boss wave just cleared */
  wave: number;
  level: number;
  xp: number;
  xpNext: number;
  score: number;
  kills: number;
  playTime: number;
  kind: string;
  stacks: Record<string, number>;
  /** persistent stash (item ids, unordered) — survives death, unlike the carried backpack */
  deposit: string[];
  backpack: PlacedItem[];
}

const SAVE_KEY = "graveyard-shift-save";

/** Migrates an older/malformed save forward. Returns null if it's unsalvageable. */
export function migrate(raw: unknown): SaveData | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Partial<SaveData>;
  // version 3 and earlier were stage-based (a different shape entirely) —
  // rather than migrate a "stage" into a "wave", just drop the old save
  if (typeof d.version !== "number" || d.version > SAVE_VERSION || d.version < 4) return null;
  if (
    typeof d.wave !== "number" || typeof d.level !== "number" ||
    !Array.isArray(d.deposit) || !Array.isArray(d.backpack)
  ) return null;
  return {
    version: SAVE_VERSION,
    wave: d.wave,
    level: d.level,
    xp: d.xp ?? 0,
    xpNext: d.xpNext ?? 12,
    score: d.score ?? 0,
    kills: d.kills ?? 0,
    playTime: d.playTime ?? 0,
    kind: d.kind ?? "p365",
    stacks: d.stacks ?? {},
    deposit: d.deposit,
    backpack: d.backpack,
  };
}

export function saveRun(data: SaveData): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    // storage full/unavailable — a lost checkpoint isn't worth crashing the run over
  }
}

export function loadRun(): SaveData | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return migrate(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function clearRun(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // nothing to do — no save, no problem
  }
}

/* ------------------------------------------------------------------ */
/* Profile — persistent lifetime progression, never cleared by death   */
/* ------------------------------------------------------------------ */

export const PROFILE_VERSION = 1;

export interface ProfileData {
  version: number;
  metaXp: number;
  metaLevel: number;
  totalKills: number;
  bestWave: number;
  totalScrap: number;
  equipped: Partial<Record<WeaponClass, string>>;
  /** per-weapon mastery XP (kills made with that weapon equipped) — keyed by
   * weapon id, not class, so P365 and Glock 18 level up independently even
   * though both are pistols. Drives attachment unlocks (see attachments.ts). */
  weaponXp: Record<string, number>;
  /** the one attachment equipped per weapon, if any — keyed by weapon id */
  equippedAttachment: Record<string, string | null>;
}

const PROFILE_KEY = "graveyard-shift-profile";

export function defaultProfile(): ProfileData {
  return {
    version: PROFILE_VERSION,
    metaXp: 0,
    metaLevel: 1,
    totalKills: 0,
    bestWave: 0,
    totalScrap: 0,
    equipped: { pistol: "p365" },
    weaponXp: {},
    equippedAttachment: {},
  };
}

function migrateProfile(raw: unknown): ProfileData | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Partial<ProfileData>;
  if (typeof d.version !== "number" || d.version > PROFILE_VERSION) return null;
  const base = defaultProfile();
  return {
    version: PROFILE_VERSION,
    metaXp: d.metaXp ?? base.metaXp,
    metaLevel: d.metaLevel ?? base.metaLevel,
    totalKills: d.totalKills ?? base.totalKills,
    bestWave: d.bestWave ?? base.bestWave,
    totalScrap: d.totalScrap ?? base.totalScrap,
    equipped: d.equipped ?? base.equipped,
    weaponXp: d.weaponXp ?? base.weaponXp,
    equippedAttachment: d.equippedAttachment ?? base.equippedAttachment,
  };
}

export function loadProfile(): ProfileData {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return defaultProfile();
    return migrateProfile(JSON.parse(raw)) ?? defaultProfile();
  } catch {
    return defaultProfile();
  }
}

export function saveProfile(data: ProfileData): void {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(data));
  } catch {
    // storage full/unavailable — lifetime progress just won't persist this write
  }
}
