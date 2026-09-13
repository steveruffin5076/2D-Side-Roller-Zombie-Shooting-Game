import type { Rarity } from "./types";

export interface UpgradeDef {
  id: string;
  name: string;
  icon: string;
  max: number;
  rarity: Rarity;
  desc: (nextLevel: number) => string;
}

export const UPGRADES: UpgradeDef[] = [
  { id: "dmg", name: "Hollow Points", icon: "Crosshair", max: 6, rarity: "common", desc: (n) => `+30% bullet damage  ·  DMG LV ${n}` },
  { id: "rate", name: "Hair Trigger", icon: "Gauge", max: 6, rarity: "common", desc: (n) => `+22% fire rate  ·  ROF LV ${n}` },
  { id: "multi", name: "Scatter Kit", icon: "Layers", max: 3, rarity: "epic", desc: () => `Fire +1 projectile per shot` },
  { id: "pierce", name: "AP Rounds", icon: "ChevronsRight", max: 3, rarity: "rare", desc: () => `Bullets pierce through +1 zombie` },
  { id: "crit", name: "Deadeye", icon: "Target", max: 4, rarity: "rare", desc: (n) => `+12% crit chance — crits hit 2.2x  ·  LV ${n}` },
  { id: "velo", name: "Rifled Barrel", icon: "Wind", max: 3, rarity: "common", desc: () => `+30% bullet velocity, tighter spread` },
  { id: "hp", name: "Field Plate", icon: "HeartPulse", max: 5, rarity: "common", desc: () => `+30 max HP and mend 30 HP now` },
  { id: "speed", name: "Combat Boots", icon: "Footprints", max: 4, rarity: "common", desc: (n) => `+16% move speed  ·  SPD LV ${n}` },
  { id: "vamp", name: "Vampiric Rounds", icon: "Droplets", max: 3, rarity: "rare", desc: () => `Heal for 3% of all damage dealt` },
  { id: "magnet", name: "Scavenger", icon: "Magnet", max: 3, rarity: "common", desc: () => `+70% pickup radius for XP shards` },
  { id: "regen", name: "Adrenal Shot", icon: "Activity", max: 3, rarity: "rare", desc: () => `Regenerate +0.9 HP every second` },
  { id: "dash", name: "Phantom Step", icon: "Ghost", max: 2, rarity: "epic", desc: () => `Dash recharges 32% faster, longer phase` },
  {
    id: "incendiary", name: "Incendiary Rounds", icon: "Flame", max: 3, rarity: "rare",
    desc: (n) => `Bullets ignite zombies — burn for 25% weapon damage/sec, 3s  ·  LV ${n}`,
  },
  {
    id: "armor", name: "Body Armor", icon: "Shield", max: 5, rarity: "rare",
    desc: (n) => `-8% damage taken  ·  ARMOR LV ${n}`,
  },
  {
    id: "bombardment", name: "Bombardment", icon: "Bomb", max: 1, rarity: "epic",
    desc: () => `Instantly kill every zombie in the wave (bosses untouched) — used the moment you pick it`,
  },
  {
    id: "akimbo", name: "Akimbo", icon: "Copy", max: 1, rarity: "epic",
    desc: () => `Dual-wield your pistol — fires a second round every shot, but pistol reload takes 45% longer`,
  },
];
