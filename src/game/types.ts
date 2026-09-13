import type { BossAttack } from "./boss";
import type { WeaponClass } from "./weapons";

export interface WeaponSlot {
  /** weapon class this slot represents */
  cls: string;
  label: string;
  /** short name of the equipped variant in this class */
  short: string;
  owned: boolean;
  active: boolean;
  key: string;
  ammo: number;
  mag: number;
  /** how many variants of this class the player owns */
  variants: number;
}

export interface HudState {
  hp: number;
  maxHp: number;
  xp: number;
  xpNext: number;
  level: number;
  /** the one global wave counter — no stages or acts, just 1, 2, 3, … forever */
  wave: number;
  /** true every 5th wave (5, 10, 15, …) — a boss fight instead of ordinary fodder */
  isBossWave: boolean;
  remaining: number;
  waveTotal: number;
  phase: "break" | "active" | "prep";
  score: number;
  kills: number;
  high: number;
  dashT: number;
  dashMax: number;
  weapon: string;
  weaponRole: string;
  weapons: WeaponSlot[];
  ammo: number;
  mag: number;
  /** spare rounds; -1 means unlimited (pistols) */
  reserve: number;
  reloading: boolean;
  /** 0..1 reload progress */
  reloadPct: number;
  /** true = auto engage, false = manual trigger */
  autoFire: boolean;
  /** which lane the player is locked to */
  facing: 1 | -1;
  /** a target is currently on the laser line */
  onTarget: boolean;
  range: number;
  paused: boolean;
  muted: boolean;
  playing: boolean;
  /** simple scalar crate feedback — bulk grid contents go through getInventory(), not here */
  crateNear: boolean;
  crateTier: 0 | 1 | 2 | 3;
  /** 0..1 hold-to-open progress */
  crateOpenPct: number;
  /** seconds left in the rest before the next wave, and what it started at —
   * the HUD only draws a countdown for the long ones (after a boss falls) */
  breakT: number;
  breakMax: number;
  /** the boss is alive — gates the 3-segment boss bar */
  bossActive: boolean;
  /** display name for the boss bar — data-driven per BOSS_DEFS, null when no boss is active */
  bossName: string | null;
  bossHp: number;
  bossHpMax: number;
  bossPhase: 0 | 1 | 2;
  /** the attack currently telegraphing, if the boss is mid-windup */
  bossAttack: BossAttack | null;
  /** 0..1 windup progress toward that attack landing */
  bossWindupPct: number;
  /** KeyE toggle — forces auto-aim onto the boss over a close add */
  bossForceTarget: boolean;
}

export type Rarity = "common" | "rare" | "epic" | "weapon";

export interface UpgradeChoice {
  id: string;
  name: string;
  desc: string;
  icon: string;
  stacks: number;
  max: number;
  rarity: Rarity;
}

export interface GameStats {
  wave: number;
  kills: number;
  level: number;
  score: number;
  time: number;
  best: number;
  isBest: boolean;
}

export interface InventoryItem {
  id: string;
  itemId: string;
  x: number;
  y: number;
}

/**
 * Polled through Engine.getInventory(), never folded into HudState — the
 * backpack/deposit arrays are bulkier and change far less often than the
 * 66ms combat HUD poll, so the UI gates re-renders on `invVer` instead.
 */
export interface InventorySnapshot {
  invVer: number;
  backpack: InventoryItem[];
  deposit: string[];
  backpackSize: { w: number; h: number };
}

/** Loadout + Profile screen data — Engine.getProfile(), polled separately from HudState. */
export interface ProfileSnapshot {
  metaLevel: number;
  metaXp: number;
  metaXpNext: number;
  totalKills: number;
  bestWave: number;
  totalScrap: number;
  equipped: Partial<Record<WeaponClass, string>>;
  /** per-weapon mastery XP, keyed by weapon id — see attachments.ts */
  weaponXp: Record<string, number>;
  equippedAttachment: Record<string, string | null>;
}

export type EngineEvent =
  | { type: "levelup"; choices: UpgradeChoice[] }
  | { type: "resume" }
  | { type: "gameover"; stats: GameStats }
  | { type: "bossclear"; wave: number; next: number }
  | { type: "pause"; value: boolean };
