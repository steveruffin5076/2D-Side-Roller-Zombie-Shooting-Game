import { UPGRADES, type UpgradeDef } from "./upgrades";
import {
  WEAPONS as WDEF, WEAPON_IDS, CLASS_ORDER, CLASS_LABEL, CLASS_ROLE, byClass, STARTER,
  shellReloadTime, type WeaponClass, type WeaponDef,
} from "./weapons";
import { Sfx } from "./audio";
import { loadSettings, saveSettings } from "./settings";
import { ATTACHMENT_ORDER, applyAttachment, unlockedAttachments, weaponLevelFor, type AttachmentId } from "./attachments";
import { isBossWave, difficultyFor, rollEnemy } from "./waves";
import { WEAPON_UNLOCK_LEVEL, metaXpFor, ownedWeaponsForLevel, isWeaponUnlocked } from "./progression";
import { THEMES, type ThemeDef } from "./themes";
import { BACKPACK_SIZE, moveItem, placeItem, removeItem, type PlacedItem } from "./grid";
import { ITEMS, shapeOfItem, itemForHotkey, type ConsumableKey } from "./items";
import { rollLoot, type CrateTier } from "./loot";
import {
  saveRun, loadRun, clearRun, SAVE_VERSION, type SaveData,
  loadProfile, saveProfile, type ProfileData,
} from "./save";
import {
  BOSS_DEFS, CHARGE_SPEED, CHARGE_TIME, bossSpeed, cooldownFor, phaseFor, pickAttack, windupFor,
  type AimTarget, type BossAttack,
} from "./boss";
import {
  BOSS_DIRS, BOSS_FRAMES, DIRS, FRAMES, GUN_HALF, PROP_VARIANTS, PX_SCALE, SOLDIER_HALF,
  SpriteAtlas, TILE_UNITS, WRECK_KIND,
  Z_DIRS, Z_FRAMES, dirFor, groundTheme, tileVariant, type ZSpriteType,
} from "./art/cache";
import { muzzleReach } from "./art/sprites/soldier";
import type { EngineEvent, GameStats, HudState, InventorySnapshot, ProfileSnapshot, UpgradeChoice } from "./types";

/* ------------------------------------------------------------------ */
/* constants + helpers                                                 */
/* ------------------------------------------------------------------ */

const W = 1280;
const H = 720;
/** The one ground line every character stands on — a side view, not a top-down
 * field. Zombies and the boss keep `y === GROUND` always; only the player can
 * leave it, briefly, by jumping. */
const GROUND = 584;
/** Chest/gun height above GROUND — everything that aims or fires does so from
 * here, not from the feet the position actually tracks. */
const CHEST_H = 30;
/** Jump physics — a single hop, no double-jump. Tuned so the arc clears a
 * zombie's head (~50 units) with room to spare, and lands in well under a
 * second so it stays a dodge, not a float. */
const GRAV = 2400;
const JUMP_SPEED = 820;
/** One continuous world — no more stages/acts to switch between, so this is
 * the whole map, wide enough that the wreck set-piece and decor have room. */
const WORLD_W = 2880;
/** Theme order the per-theme wrecks are authored in (see props.ts). */
const WRECK_THEMES = ["cemetery", "suburbs", "highway", "arena"];
const TAU = Math.PI * 2;
/** Settings zoom bounds. The floor is 1 on purpose: at >= 1 the visible world
 * only ever shrinks, so render()'s culling bounds stay a superset and need no
 * rework. Allowing zoom-out would break that. */
// Zoom range. The floor stays at 1: the pixel sprites are authored at
// PX_SCALE canvas units per art pixel, and zooming below 1 shrinks an art
// pixel under one screen pixel, which drops detail rather than showing more.
// The ceiling was raised for the pixel-art pass — at zoom 1 a 24x24 sprite is
// a small figure on a 1280-wide field, and the detail it now carries only
// reads once the camera is closer.
const ZOOM_MIN = 1;
const ZOOM_MAX = 2;

const R = (a: number, b: number) => a + Math.random() * (b - a);
const RI = (a: number, b: number) => Math.floor(R(a, b + 1));
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const chance = (p: number) => Math.random() < p;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Darkens (factor<1) or lightens (factor>1) a "#rrggbb" hex color — used to
 * derive a boss's torso/limb/head tones from one BossDef.color. */

type ZType = "walker" | "runner" | "brute" | "spitter" | "screamer";
type ModalKind = "levelup" | "bossclear";

interface ZConf {
  hp: number; speed: number; dmg: number; r: number; scale: number; xp: number; score: number;
}

const ZCONF: Record<ZType, ZConf> = {
  walker: { hp: 34, speed: 52, dmg: 9, r: 19, scale: 1, xp: 1, score: 10 },
  runner: { hp: 20, speed: 128, dmg: 7, r: 15, scale: 0.88, xp: 2, score: 14 },
  spitter: { hp: 30, speed: 46, dmg: 8, r: 16, scale: 0.95, xp: 2, score: 22 },
  brute: { hp: 150, speed: 36, dmg: 22, r: 30, scale: 1.5, xp: 6, score: 45 },
  // the Screamer — fragile and slow, but punishes a sloppy kill hard
  // (an ambush), so worth notably more than her stats alone suggest
  screamer: { hp: 18, speed: 40, dmg: 6, r: 15, scale: 0.85, xp: 4, score: 35 },
};

/** A rare, deliberate encounter across every stage — not power-scaled like the
 * base roster, so she stays a fixed low-probability spice pick, never fodder. */
const SCREAMER_WEIGHT = 0.18;

/** How long the boss spends rising out of its grave —
 * invulnerable and inert — before the fight actually starts. */
const BOSS_EMERGE_DURATION = 1.6;

/** Seconds an uncollected XP/scrap gem sits before despawning — long enough
 * that mid-fight drops aren't lost, short enough that gems don't pile up
 * forever if you never backtrack for them. Fades out over the last 2s. */
const GEM_LIFETIME = 12;

const WAVE_SUBS = [
  "they see your light",
  "hold the line",
  "the horde thickens",
  "no mercy",
  "they just keep coming",
  "stay quiet, stay dark",
];

const BLOOD = ["#7f1d1d", "#991b1b", "#b91c1c", "#5f1118"];

interface Zombie {
  x: number; y: number; vx: number; vy: number;
  hp: number; maxHp: number; speed: number; dmg: number; r: number; scale: number;
  type: ZType; xp: number; score: number;
  t: number; atk: number; flash: number; face: number; dead: boolean; spit: number;
  tint: number; boss: boolean; wob: number;
  /** sleeper: inert until a hit (an instant quiet kill), a fast player passing close, or a hazard */
  dormant: boolean;
  /** screamer only: 0 idle, >0 counting down to her scream, -1 already spent */
  alertT: number;
  /** Incendiary Rounds — seconds left burning, and current damage-per-second */
  burnT: number;
  burnDps: number;
}

/** The Juggernaut Alpha — a unique boss encounter, deliberately kept out of `zombies[]` so its
 * windup/attack state machine doesn't have to fit the generic per-zombie walk-toward-player loop. */
interface Boss extends AimTarget {
  /** which BOSS_DEFS entry this instance is — looked up wherever attack/timing/art needs it */
  defId: string;
  vx: number; vy: number; face: 1 | -1; flash: number; hurtT: number;
  hp: number; maxHp: number; phase: 0 | 1 | 2;
  /** "emerge" — rising out of its grave, invulnerable and inert, on spawn */
  state: "emerge" | "seek" | "windup" | "attack" | "cooldown";
  attack: BossAttack | null;
  /** counts down within the current state */
  timer: number;
  /** melee contact-damage cooldown, same idiom as Zombie.atk */
  atk: number;
  /** locked-in strike point for Puke Mortar, set the instant its windup starts */
  targetX: number; targetY: number;
  /** unit vector a Shield Charge is committed to, locked when its windup ends */
  chargeX: number; chargeY: number;
  tint: number; wob: number; t: number;
}

interface Bullet {
  x: number; y: number; vx: number; vy: number;
  dmg: number; pierce: number; crit: boolean; life: number;
  hits: Set<Zombie>;
  /** guards against re-hitting the boss on a later frame while a piercing shot is still overlapping it */
  hitBoss: boolean;
}

interface EShot { x: number; y: number; vx: number; vy: number; dmg: number; life: number }

interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; max: number; size: number; color: string; grav: number; add: boolean;
}

interface Gem {
  x: number; y: number; vx: number; vy: number; val: number;
  /** bob-animation phase, randomized at spawn — not an age, see `age` for that */
  t: number;
  /** seconds since spawn — despawns at GEM_LIFETIME if never collected */
  age: number;
  rest: boolean; kind: "xp" | "scrap";
}
interface FloatText { x: number; y: number; vy: number; life: number; max: number; text: string; color: string; size: number }
interface Decal { x: number; y: number; s: number; a: number }
interface SpawnItem { type: ZType; boss?: boolean }
interface Banner { text: string; sub: string; t: number; dur: number }
// kind 0 stone-a 1 stone-b 2 tree 3 lamp 4 wrecked car 5 barrier 6 rubble pile
interface Decor { x: number; y: number; kind: number; v: number; ph: number }
/** Solid-collision radius per decor kind (world units, scaled by the decor's own `s`).
 * 0 means walk-through — just the lamp post's thin light pole. */
const DECOR_SOLID_R = [8, 10, 7, 0, 15, 8, 11, 34];
// These are no longer scaled per instance. Variety is three authored sprite
// variants per kind instead of a 0.7-1.25x scale, so every prop of a kind now
// has the hitbox its art actually draws — the Phase 1 art/hitbox fix again.
interface Crate { x: number; y: number; tier: CrateTier; opened: boolean }
interface GrenadeProj { x: number; y: number; vx: number; vy: number; fuse: number }

/* ------------------------------------------------------------------ */
/* engine                                                              */
/* ------------------------------------------------------------------ */

export class Engine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private onEvent: (e: EngineEvent) => void;
  readonly sfx = new Sfx();
  private debug = new URLSearchParams(window.location.search).get("debug") === "1";

  private worldW = WORLD_W;
  private theme: ThemeDef = THEMES.cemetery;

  private raf = 0;
  private last = 0;
  private tGlobal = 0;

  mode: "attract" | "play" = "attract";
  /** persistent lifetime progression — loaded once, survives every run in this session */
  private profile: ProfileData = loadProfile();
  private over = false;
  private paused = false;
  private modals = new Set<ModalKind>();
  private get modalOpen() {
    return this.modals.size > 0;
  }

  private keys = new Set<string>();
  /** true while the fire button/click is held — manual-trigger mode only */
  private mouse = { down: false };
  /** world magnification from Settings, 1 = off */
  private zoomPref = 1;
  /** blocks fire() briefly after a lane flip; scaled by the weapon's pivotMul */
  private pivotT = 0;

  // world state — a side view: only `cam` (world-x of the visible window's
  // left edge) ever pans. Every character's y is the fixed GROUND line.
  private cam = 0;
  private shakeMag = 0;
  private shakeX = 0;
  private shakeY = 0;

  private pl = this.freshPlayer();
  private st = this.baseStats();
  private stacks: Record<string, number> = {};
  /** weapons the player permanently owns */
  private owned = new Set<string>([STARTER]);
  /** which variant is selected within each class */
  private equipped: Partial<Record<WeaponClass, string>> = { pistol: STARTER };
  /** currently equipped weapon id */
  kind: string = STARTER;
  /** rounds currently in each weapon's magazine */
  private ammo: Record<string, number> = {};
  /** spare rounds per weapon (-1 = unlimited) */
  private reserve: Record<string, number> = {};
  private reloading = false;
  private reloadT = 0;
  private reloadDur = 0;

  /* --- targeting / fire mode --- */
  /** true = Automated Engagement, false = Manual Trigger */
  private autoFire = true;
  /** lane the player is locked to */
  private facing: 1 | -1 = 1;
  /** whatever the laser ray is currently crossing — a Zombie or the Boss, see acquireRayTarget() */
  private target: AimTarget | null = null;
  private onTarget = false;
  private laserFlash = 0;
  /** blocks fire() briefly after a lane flip; scaled by the weapon's pivotMul */

  /** re-entrancy guard so overlapping triggers can't stack ambushes */
  private ambushT = 0;

  private zombies: Zombie[] = [];
  private bullets: Bullet[] = [];
  private eshots: EShot[] = [];
  private particles: Particle[] = [];
  private gems: Gem[] = [];
  private texts: FloatText[] = [];
  private decals: Decal[] = [];

  /* --- boss: The Juggernaut Alpha, spawned every 5th wave --- */
  private boss: Boss | null = null;
  /** where the boss's grave split open — a lasting visual scar */
  private bossGrave: { x: number; y: number } | null = null;
  /** toggled by KeyE while the boss is alive — forces auto-aim onto it over a close add */
  private bossForceTarget = false;
  /** after any boss windup starts, regular lane-edge zombie spawns pause this long —
   * keeps the telegraph readable instead of a fresh walker wandering into frame mid-tell */
  private spawnSuppressT = 0;

  private power = 0;             // difficulty scalar, drives every balance formula
  /** the one global progression counter — no stages or acts, just wave 1, 2, 3, … forever */
  private wave = 0;
  private phase: "break" | "active" | "prep" = "break";
  private breakT = 0;
  /** what breakT started at — the HUD draws a countdown bar against it */
  private breakMax = 0;
  private spawnT = 0;
  private queue: SpawnItem[] = [];
  private waveTotal = 0;

  /* --- inventory: fixed 4x4 backpack, a persistent safe-house stash, loot crates --- */
  private backpack: PlacedItem[] = [];
  private deposit: string[] = [];
  /** bumped on every backpack/deposit mutation — the UI polls this, not HudState */
  private invVer = 0;
  private nextItemSeq = 1;
  private crates: Crate[] = [];
  /** hold-to-open progress (seconds held) on whichever crate is currently in range */
  private crateOpenT = 0;
  private grenades: GrenadeProj[] = [];
  /** active Tactical Stim buff remaining, seconds */
  private stimT = 0;


  private score = 0;
  private kills = 0;
  private playTime = 0;
  private lvlPending = 0;
  private banners: Banner[] = [];
  private ambientT = 0;
  private moteT = 0;
  private high = 0;

  // decor
  /** Pre-rendered pixel-art sprites, built lazily per entity type. */
  private atlas = new SpriteAtlas();
  private decor: Decor[] = [];
  private tufts: { x: number; y: number; h: number; s: number }[] = [];

  constructor(canvas: HTMLCanvasElement, onEvent: (e: EngineEvent) => void) {
    this.canvas = canvas;
    this.onEvent = onEvent;
    this.ctx = canvas.getContext("2d")!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Sprites are authored at one art pixel per PX_SCALE canvas units and
    // blitted up. Left smoothing on, the browser bilinear-filters that upscale
    // and the pixel art turns to mush — this single line is what keeps it crisp.
    this.ctx.imageSmoothingEnabled = false;
    this.high = Number(localStorage.getItem("graveyard-shift-high") || 0);
    const saved = loadSettings();
    this.sfx.setVolume(saved.volume);
    this.zoomPref = clamp(saved.zoom, ZOOM_MIN, ZOOM_MAX);
    this.reset();
    this.cam = 0; // attract mode frames the world edge as a backdrop
    this.bind();
  }

  /* ---------------- lifecycle ---------------- */

  begin() {
    this.last = performance.now();
    const tick = (now: number) => {
      this.raf = requestAnimationFrame(tick);
      let dt = (now - this.last) / 1000;
      this.last = now;
      dt = Math.min(dt, 1 / 30);
      this.tGlobal += dt;
      if (this.mode === "attract") this.updateAttract(dt);
      else if (!this.paused && !this.modalOpen && !this.over) this.update(dt);
      this.updateBanner(dt);
      this.render();
    };
    this.raf = requestAnimationFrame(tick);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    document.removeEventListener("visibilitychange", this.onVis);
    this.canvas.removeEventListener("mousedown", this.onMouseDown);
    window.removeEventListener("mouseup", this.onMouseUp);
    this.canvas.removeEventListener("contextmenu", this.onCtx);
  }

  /** Starts a fresh run at wave 1, discarding any saved one. The discard
   * matters: die() restores from whatever checkpoint exists, so without it a
   * new run that never reached a checkpoint would warp the player into the
   * *previous* run's progress. Also reached from the pause menu's RESTART and
   * game-over's RETRY, where starting over should likewise not inherit an old
   * checkpoint. */
  startGame() {
    this.sfx.ensure();
    clearRun();
    this.reset();
    this.recompute();
    this.pl.hp = this.st.maxHp;
    this.mode = "play";
    this.phase = "break";
    this.breakT = 2.2;
    this.breakMax = 2.2;
    this.announce("THE DEAD DON'T SLEEP", "hold the line as long as you can", 2.6);
  }

  toMenu() {
    // flush this run's lifetime meta-progress — it's otherwise only persisted
    // at a boss-wave clear/death, so quitting mid-run would silently drop it
    saveProfile(this.profile);
    this.reset();
    this.mode = "attract";
    this.cam = 0;
  }

  /** Loadout screen: picks which owned weapon a class starts equipped with next run.
   * Persists immediately — this is lifetime progression, not per-run state. */
  setLoadout(weaponId: string) {
    const w = WDEF[weaponId];
    if (!w || !isWeaponUnlocked(weaponId, this.profile.metaLevel)) return;
    this.profile.equipped = { ...this.profile.equipped, [w.cls]: weaponId };
    saveProfile(this.profile);
  }

  /** Loadout + Profile screen data — read-only snapshot, polled separately from HudState. */
  getProfile(): ProfileSnapshot {
    return {
      metaLevel: this.profile.metaLevel,
      metaXp: this.profile.metaXp,
      metaXpNext: metaXpFor(this.profile.metaLevel),
      totalKills: this.profile.totalKills,
      bestWave: this.profile.bestWave,
      totalScrap: this.profile.totalScrap,
      equipped: { ...this.profile.equipped },
      weaponXp: { ...this.profile.weaponXp },
      equippedAttachment: { ...this.profile.equippedAttachment },
    };
  }

  /** Weapon-mastery attachment picker — validates the level is actually
   * unlocked before equipping, same guard pattern as equip()/setLoadout(). */
  equipAttachment(weaponId: string, attachmentId: AttachmentId | null) {
    if (attachmentId) {
      const xp = this.profile.weaponXp[weaponId] ?? 0;
      const unlocked = unlockedAttachments(xp).some((a) => a.id === attachmentId);
      if (!unlocked) return;
    }
    this.profile.equippedAttachment[weaponId] = attachmentId;
    saveProfile(this.profile);
  }

  /** Base weapon stats with its equipped attachment's modifiers applied —
   * every gameplay-affecting read of a weapon's mag/reload/reserve/range/
   * swap should go through this, not WDEF[id] directly. */
  private effWeapon(kind: string): WeaponDef {
    const base = WDEF[kind] ?? WDEF.pistol;
    const att = this.profile.equippedAttachment[kind] as AttachmentId | null | undefined;
    return applyAttachment(base, att);
  }

  private gainWeaponXp(kind: string, v: number) {
    const before = weaponLevelFor(this.profile.weaponXp[kind] ?? 0);
    this.profile.weaponXp[kind] = (this.profile.weaponXp[kind] ?? 0) + v;
    const after = weaponLevelFor(this.profile.weaponXp[kind]);
    if (after > before) {
      const unlocked = ATTACHMENT_ORDER[after - 1];
      this.announce("ATTACHMENT UNLOCKED", `${unlocked.name} — ${WDEF[kind]?.name ?? kind}`, 2.4);
    }
  }

  togglePause() {
    if (this.mode !== "play" || this.over || this.modalOpen) return;
    this.paused = !this.paused;
    this.onEvent({ type: "pause", value: this.paused });
  }

  setPaused(v: boolean) {
    if (this.mode !== "play" || this.over) return;
    this.paused = v;
    this.onEvent({ type: "pause", value: v });
  }

  toggleMute() {
    this.sfx.ensure();
    this.sfx.muted = !this.sfx.muted;
    this.sfx.click();
  }

  getVolume() {
    return this.sfx.getVolume();
  }

  /** Settings-screen volume slider — persists immediately, separate from the quick mute toggle. */
  setVolume(v: number) {
    this.sfx.setVolume(v);
    saveSettings({ ...loadSettings(), volume: v });
  }

  getZoom() {
    return this.zoomPref;
  }

  /** Settings-screen zoom slider. Magnifies the world only — the HUD lives in a
   * separately scaled DOM layer (see App.tsx) and is unaffected. */
  setZoom(v: number) {
    this.zoomPref = clamp(v, ZOOM_MIN, ZOOM_MAX);
    saveSettings({ ...loadSettings(), zoom: this.zoomPref });
  }

  /* ---------------- setup ---------------- */

  private freshPlayer() {
    return {
      x: this.worldW / 2, y: GROUND, vx: 0, vy: 0,
      hp: 100, level: 1, xp: 0, xpNext: 12,
      face: 1 as 1 | -1, aim: 0, cd: 0, ifr: 0, flash: 0, hurtT: 0,
      dashT: 0, dashCd: 0, dashDir: 1 as 1 | -1,
      walk: 0,
      /** blocks fire() while > 0 — consumable "use" animation lockout */
      useT: 0,
      grounded: true, jumps: 0,
    };
  }

  private baseStats() {
    return {
      damage: 13, fireRate: 3.1, bulletSpeed: 800, jitter: 0.02,
      projectiles: 1, projSpread: 0, projJitter: 1,
      pierce: 0, crit: 0.05,
      speed: 275, maxHp: 100, magnet: 1, lifesteal: 0,
      regen: 0, dashMax: 2.3, reloadMul: 1,
    };
  }

  private reset() {
    this.power = 0;
    this.wave = 0;
    this.initWorld();
    this.pl = this.freshPlayer();
    this.st = this.baseStats();
    this.stacks = {};
    // ownership is a function of lifetime meta level, not run state — every
    // weapon unlocked so far is available from the start of every run
    this.owned = new Set<string>(ownedWeaponsForLevel(this.profile.metaLevel));
    this.equipped = {};
    for (const cls of CLASS_ORDER) {
      const pick = this.profile.equipped[cls];
      if (pick && this.owned.has(pick)) this.equipped[cls] = pick;
    }
    this.kind = this.equipped.pistol ?? STARTER;
    this.ammo = {};
    this.reserve = {};
    for (const id of WEAPON_IDS) {
      const w = this.effWeapon(id);
      this.ammo[id] = w.mag;
      this.reserve[id] = w.reserve;
    }
    this.reloading = false;
    this.reloadT = 0;
    this.reloadDur = 0;
    this.autoFire = true;
    this.facing = 1;
    this.target = null;
    this.onTarget = false;
    this.ambushT = 0;
    this.laserFlash = 0;
    this.zombies = [];
    this.bullets = [];
    this.eshots = [];
    this.particles = [];
    this.gems = [];
    this.texts = [];
    this.decals = [];
    this.boss = null;
    this.bossForceTarget = false;
    this.spawnSuppressT = 0;
    this.waveTotal = 0;
    this.queue = [];
    this.backpack = [];
    this.deposit = [];
    this.invVer++;
    this.crates = [];
    this.crateOpenT = 0;
    this.grenades = [];
    this.stimT = 0;
    this.score = 0;
    this.kills = 0;
    this.playTime = 0;
    this.lvlPending = 0;
    this.banners = [];
    this.over = false;
    this.paused = false;
    this.modals.clear();
    this.cam = clamp(this.pl.x - this.viewW / 2, 0, this.worldW - this.viewW);
    // Clear held input so a key/fire state stuck by a touch gesture that never
    // saw its pointerup can't be inherited by a fresh run (death -> Restart).
    this.keys.clear();
    this.pivotT = 0;
    this.mouse.down = false;
  }

  /** Sets up the one continuous world a run plays in — called once per run,
   * never again, since there are no more stages/acts to switch between. */
  private initWorld() {
    this.worldW = WORLD_W;
    this.theme = THEMES.cemetery;
    this.genDecor(this.theme, this.worldW);
    this.bossGrave = null;
  }

  private genDecor(theme: ThemeDef, worldW: number) {
    // called once per run, from initWorld() — never accumulate across runs
    this.decor = [];
    this.tufts = [];
    this.theme = theme;
    // decor scattered along the ground line (x only — every prop stands at
    // GROUND, same as the player and every zombie). Density is per world
    // width so a wide stage doesn't feel sparser than the tuned reference.
    const weights = theme.decorWeights;
    const wTotal = weights.reduce((a, b) => a + b, 0) || 1;
    const decorCount = Math.round(worldW / 210);
    // keep a clear patch around the stage's own spawn point (worldW/2) so a
    // solid obstacle can never spawn on top of the player at stage start
    const spawnX = worldW / 2;
    for (let i = 0; i < decorCount; i++) {
      let roll = Math.random() * wTotal;
      let kind = 0;
      for (let k = 0; k < weights.length; k++) {
        if ((roll -= weights[k]) < 0) { kind = k; break; }
      }
      let x = 0;
      for (let tries = 0; tries < 5; tries++) {
        x = R(40, worldW - 40);
        if (Math.abs(x - spawnX) > 120) break;
      }
      this.decor.push({ x, y: GROUND, kind, v: Math.floor(R(0, PROP_VARIANTS)), ph: R(0, TAU) });
    }

    // One set-piece wreck — a landmark to navigate by — pushed clear of the spawn point.
    const themeIdx = WRECK_THEMES.indexOf(theme.id);
    let wx = worldW * R(0.22, 0.78);
    if (Math.abs(wx - spawnX) < 260) wx += wx < spawnX ? -worldW * 0.18 : worldW * 0.18;
    wx = clamp(wx, 90, worldW - 90);
    this.decor.push({ x: wx, y: GROUND, kind: WRECK_KIND, v: Math.max(0, themeIdx), ph: 0 });
    // ground tufts, scattered the same way along x
    const tuftCount = Math.round(worldW / 55);
    for (let i = 0; i < tuftCount; i++) {
      this.tufts.push({ x: R(0, worldW), y: GROUND, h: R(5, 14), s: R(0.6, 1.3) });
    }
  }

  /** Solid decor (gravestones, wrecks, barriers, rubble, tree trunks) blocks
   * the player along the ground line — pushes them back the shortest way out
   * instead of letting them walk straight through. Purely cosmetic decor
   * (the lamp post's thin pole) is excluded via a 0 radius in DECOR_SOLID_R. */
  private resolvePlayerObstacles() {
    const p = this.pl;
    // airborne clears every ground obstacle outright — jumping is a full
    // dodge here already (see the zombie/boss contact-damage checks), and a
    // hop that still got shoved back by a tombstone would feel broken
    if (!p.grounded) return;
    const playerR = 13;
    for (const d of this.decor) {
      const solidR = DECOR_SOLID_R[d.kind];
      if (solidR <= 0) continue;
      const dx = p.x - d.x;
      const dist = Math.abs(dx) || 1;
      const min = solidR + playerR;
      if (dist < min) {
        const push = min - dist;
        p.x += Math.sign(dx) * push;
      }
    }
    p.x = clamp(p.x, 26, this.worldW - 26);
  }

  /* ---------------- input ---------------- */

  private onKeyDown = (e: KeyboardEvent) => {
    const c = e.code;
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(c)) e.preventDefault();
    if (e.repeat) return;
    this.keys.add(c);
    this.sfx.ensure();
    if (this.mode !== "play" || this.over) return;
    if (c === "Escape" || c === "KeyP") {
      this.togglePause();
      return;
    }
    if (this.paused || this.modalOpen) return;
    if (c === "ShiftLeft" || c === "ShiftRight") this.dash();
    if (c === "Space" || c === "ArrowUp" || c === "KeyW") this.jump();
    // ENTER skips the rest of a countdown (the boss stage's 10s opener)
    if (c === "Enter" && this.phase === "break") this.breakT = 0;
    if (c.startsWith("Digit")) {
      const i = Number(c.slice(5)) - 1;
      if (i >= 0 && i < CLASS_ORDER.length) this.selectClass(CLASS_ORDER[i]);
    }
    // during a boss fight, E forces the lock onto it over a close add (crate/gate E is
    // a held check elsewhere in update(), so this discrete toggle never steals that input)
    if (c === "KeyE") this.toggleBossForceTarget();
    if (c === "KeyQ") this.cycleWeapon(1);
    if (c === "KeyR") this.startReload(true);
    if (c === "KeyF" || c === "KeyV") this.toggleFireMode();
    if (c === "KeyG") this.useConsumable("G");
    if (c === "KeyB") this.useConsumable("B");
    if (c === "KeyT") this.useConsumable("T");
  };

  private onKeyUp = (e: KeyboardEvent) => this.keys.delete(e.code);

  private onBlur = () => {
    this.keys.clear();
    this.mouse.down = false;
  };

  private onVis = () => {
    if (document.hidden && this.mode === "play" && !this.over && !this.modalOpen && !this.paused)
      this.setPaused(true);
  };

  private onMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return;
    this.sfx.ensure();
    this.mouse.down = true;
  };

  toggleFireMode() {
    this.autoFire = !this.autoFire;
    this.sfx.click();
    this.texts.push({
      x: this.pl.x, y: this.pl.y - 92, vy: -46, life: 0.8, max: 0.8,
      text: this.autoFire ? "AUTO-FIRE ON" : "MANUAL TRIGGER",
      color: this.autoFire ? "#4ade80" : "#fbbf24", size: 13,
    });
  }

  private onMouseUp = () => (this.mouse.down = false);
  private onCtx = (e: Event) => e.preventDefault();

  /* ---------------- touch input (mirrors keyboard/mouse state) ---------------- */

  /** Marks a virtual key as held — same effect as a keydown for movement keys. */
  pressKey(code: string) {
    this.keys.add(code);
  }

  /** Releases a virtual key — same effect as a keyup. */
  releaseKey(code: string) {
    this.keys.delete(code);
  }

  /** Starts/stops continuous fire — same effect as holding/releasing the mouse
   * button (or the on-screen Fire button). Only matters in manual-trigger
   * mode; auto-fire already engages the instant a target is in the lane. */
  setFiring(down: boolean) {
    if (down) this.sfx.ensure();
    this.mouse.down = down;
  }

  /** Triggers a dash, respecting the same game-state guards as the keyboard handler. */
  triggerDash() {
    if (this.mode !== "play" || this.over || this.paused || this.modalOpen) return;
    this.sfx.ensure();
    this.dash();
  }

  /** Triggers a jump, respecting the same game-state guards as the keyboard handler. */
  triggerJump() {
    if (this.mode !== "play" || this.over || this.paused || this.modalOpen) return;
    this.sfx.ensure();
    this.jump();
  }

  /** KeyE (or its touch interact-button equivalent) while a boss is alive forces
   * the boss to win the lane lock over a zombie — see acquireLaneTarget(). */
  toggleBossForceTarget() {
    if (!this.boss || this.boss.dead) return;
    this.bossForceTarget = !this.bossForceTarget;
  }

  private bind() {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    document.addEventListener("visibilitychange", this.onVis);
    this.canvas.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("mouseup", this.onMouseUp);
    this.canvas.addEventListener("contextmenu", this.onCtx);
  }

  /** -1, 0 or 1: which way the movement keys (or the touch Left/Right buttons,
   * which press the same virtual keys via pressKey/releaseKey) are held. */
  private inputDir(): -1 | 0 | 1 {
    const r = this.keys.has("KeyD") || this.keys.has("ArrowRight") ? 1 : 0;
    const l = this.keys.has("KeyA") || this.keys.has("ArrowLeft") ? 1 : 0;
    return (r - l) as -1 | 0 | 1;
  }

  private dash() {
    const p = this.pl;
    if (p.dashCd > 0) return;
    const stDash = this.stacks["dash"] || 0;
    p.dashCd = this.st.dashMax;
    p.dashT = 0.16 + 0.06 * stDash;
    const mov = this.inputDir();
    p.dashDir = mov !== 0 ? mov : this.facing;
    this.sfx.dash();
  }

  private jump() {
    const p = this.pl;
    if (p.jumps >= 1) return;
    p.vy = -JUMP_SPEED;
    p.grounded = false;
    p.jumps++;
    this.sfx.jump();
    for (let i = 0; i < 5; i++)
      this.particles.push({
        x: p.x + R(-8, 8), y: GROUND + 2, vx: R(-50, 50), vy: R(-40, -10),
        life: 0.35, max: 0.35, size: R(2, 4), color: "#3a4552", grav: 300, add: false,
      });
  }

  /* ---------------- attract (menu bg) ---------------- */

  private updateAttract(dt: number) {
    this.ambientT -= dt;
    if (this.ambientT <= 0 && this.zombies.length < 7) {
      this.ambientT = R(1.2, 2.6);
      const fromLeft = chance(0.5);
      const type: ZType = chance(0.72) ? "walker" : chance(0.5) ? "runner" : "brute";
      const c = ZCONF[type];
      const z = this.mkZombie(type, fromLeft ? -60 : W + 60, GROUND, 1, 1);
      z.vx = (fromLeft ? 1 : -1) * c.speed * R(0.35, 0.6);
      this.zombies.push(z);
    }
    for (const z of this.zombies) {
      z.t += dt;
      z.x += z.vx * dt;
      z.face = z.vx >= 0 ? 1 : -1;
    }
    this.zombies = this.zombies.filter((z) => z.x > -120 && z.x < W + 120);
    this.updateParticles(dt);
    this.motes(dt);
  }

  private motes(dt: number) {
    this.moteT -= dt;
    if (this.moteT <= 0 && this.particles.length < 320) {
      this.moteT = 0.35;
      this.particles.push({
        x: this.cam + R(0, W), y: R(120, GROUND - 40),
        vx: R(-6, 6), vy: R(-8, -2),
        life: R(3, 6), max: 6, size: R(1, 2.2),
        color: "#fbbf24", grav: -2, add: true,
      });
    }
  }

  /* ---------------- core update ---------------- */

  private update(dt: number) {
    const p = this.pl;
    this.playTime += dt;
    this.motes(dt);

    // timers
    p.cd -= dt; p.ifr -= dt; p.hurtT -= dt; p.flash -= dt; p.dashCd -= dt; p.useT -= dt;
    if (this.stimT > 0) this.stimT -= dt;

    // side-view movement: horizontal only — every character stands on GROUND
    const mov = this.inputDir();
    if (p.dashT > 0) {
      p.dashT -= dt;
      const speed = 1350;
      p.vx = p.dashDir * speed;
      const pdx = p.dashDir * 10;
      this.particles.push({ x: p.x - pdx, y: p.y - 30, vx: -pdx * R(3, 9), vy: R(-50, 50), life: 0.3, max: 0.3, size: R(4, 10), color: "#67e8f9", grav: 0, add: true });
    } else {
      // Tactical Stim: temporary speed rush
      const speed = this.st.speed * (this.stimT > 0 ? 1.35 : 1);
      p.vx = lerp(p.vx, mov * speed, Math.min(1, 14 * dt));
    }

    // Update position — x is free; y only ever moves while jumping
    p.x = clamp(p.x + p.vx * dt, 26, this.worldW - 26);
    this.resolvePlayerObstacles();

    p.vy += GRAV * dt;
    p.y += p.vy * dt;
    if (p.y >= GROUND) {
      p.y = GROUND;
      p.vy = 0;
      p.grounded = true;
      p.jumps = 0;
    }

    // Animation: walk cycle based on speed
    const vel = Math.abs(p.vx);
    p.walk += dt * (vel > 26 ? 10 + vel * 0.014 : 3);

    // ---- DIRECTIONAL LOCK: movement input pivots the lane ----
    // A brief lockout after flipping (scaled by the weapon's pivotMul) means
    // a heavy weapon can't instantly snap the other way for free.
    if (this.pivotT > 0) this.pivotT -= dt;
    if (mov !== 0 && mov !== this.facing && this.pivotT <= 0) {
      this.facing = mov;
      this.pivotT = 0.12 * (this.effWeapon(this.kind).pivotMul ?? 1);
      this.target = null;
    }
    p.face = this.facing;

    // Aim: flat along the faced lane, or angled at a locked target's body
    // centre — about the only "aiming" a side view needs. `target.y` is feet
    // (every character stands on GROUND), so the centre of mass sits `r`
    // above that, same height hitZombie()/hitBoss() actually check against.
    this.acquireLaneTarget();
    if (this.target && !this.target.dead) {
      const tx = this.target.x;
      const ty = this.target.y - this.target.r;
      p.aim = Math.atan2(ty - (p.y - CHEST_H), tx - p.x);
    } else {
      p.aim = this.facing === 1 ? 0 : Math.PI;
    }
    if (this.laserFlash > 0) this.laserFlash -= dt;

    // reload + auto-fire (all weapons are full-auto; rate differs per weapon)
    this.updateReload(dt);
    const wantsFire = this.autoFire ? this.onTarget : this.mouse.down;
    if (this.reloading) {
      // a tube gun cuts its reload short the moment it has a shell to fire
      if (
        wantsFire && this.ammo[this.kind] > 0 && p.cd <= 0 && p.useT <= 0 &&
        this.effWeapon(this.kind).tubeReload
      ) {
        this.reloading = false;
        this.reloadT = 0;
        this.fire();
      }
    } else if (this.ammo[this.kind] <= 0) {
      this.startReload(); // auto reload the instant the mag runs dry
    } else if (p.cd <= 0 && this.pivotT <= 0 && p.useT <= 0) {
      // AUTO-FIRE ON: shoot only when a zombie is in the faced lane.
      // AUTO-FIRE OFF: manual trigger via mouse/tap.
      if (wantsFire) this.fire();
    }
    if (this.ambushT > 0) this.ambushT -= dt;

    // regen
    if (this.st.regen > 0) p.hp = Math.min(this.st.maxHp, p.hp + this.st.regen * dt);

    this.updateCrates(dt);
    this.updateGrenades(dt);

    // waves — one endless counter, no stages/acts to advance between
    if (this.phase === "break") {
      this.breakT -= dt;
      if (this.breakT <= 0) this.startWave(this.wave + 1);
    } else if (this.phase === "active") {
      if (this.spawnSuppressT > 0) this.spawnSuppressT -= dt;
      this.spawnT -= dt;
      const cap = Math.min(42, 10 + this.power * 1.1);
      if (this.spawnSuppressT <= 0 && this.spawnT <= 0 && this.queue.length > 0 && this.zombies.length < cap) {
        this.spawnT = Math.max(0.2, 1.15 - this.power * 0.08);
        const n = this.power >= 4 && this.queue.length > 2 && chance(0.45) ? 2 : 1;
        for (let i = 0; i < n && this.queue.length > 0; i++) this.spawnZombie(this.queue.shift()!);
      }
      if (this.queue.length === 0 && this.zombies.length === 0 && (!this.boss || this.boss.dead)) {
        this.score += 50 * this.power;
        if (isBossWave(this.wave)) {
          // a boss wave clear is the run's checkpoint — same beat the old
          // stage-clear screen hit, just every 5th wave instead of once per stage
          this.completeBossWave();
        } else {
          const milestone = this.wave % 3 === 0;
          this.beginRest(1.4);
          p.hp = Math.min(this.st.maxHp, p.hp + 12);
          this.spawnCrate(milestone ? 2 : 1);
          this.announce(
            `WAVE ${this.wave} CLEARED`,
            `wave ${this.wave + 1} next — breathe while you can`
          );
        }
      }
    }

    this.updateZombies(dt);
    this.updateBoss(dt);
    this.updateBullets(dt);
    this.updateEshots(dt);
    this.updateGems(dt);
    this.updateParticles(dt);
    this.updateTexts(dt);

    // decals fade
    for (const d of this.decals) d.a -= dt * 0.02;
    this.decals = this.decals.filter((d) => d.a > 0.05);

    // camera — side view: only the horizontal pan follows the player
    {
      const targetX = clamp(p.x - this.viewW / 2, 0, this.worldW - this.viewW);
      this.cam = lerp(this.cam, targetX, Math.min(1, 5 * dt));
    }
    this.shakeMag = Math.max(0, this.shakeMag - dt * 26);
    this.shakeX = R(-this.shakeMag, this.shakeMag);
    this.shakeY = R(-this.shakeMag, this.shakeMag) * 0.7;
  }

  /* ============ TARGETING: directional lock auto-aim ============ */

  /** Nearest zombie in the faced lane, within the weapon's effective range —
   * plus the boss lock rule: with a boss alive, it wins the lock unless a
   * regular zombie ("add") is within 130px, or the player forced it with KeyE
   * (`bossForceTarget`). */
  private acquireLaneTarget() {
    const p = this.pl;
    const w = this.effWeapon(this.kind);
    const range = w.range * (1 + 0.12 * (this.stacks["velo"] || 0));
    let best: AimTarget | null = null;
    let bestD = Infinity;

    for (const z of this.zombies) {
      if (z.dead) continue;
      const dx = z.x - p.x;
      // strictly the lane we're facing
      if (this.facing === 1 ? dx < -14 : dx > 14) continue;
      const d = Math.abs(dx);
      if (d > range) continue;
      if (d < bestD) { bestD = d; best = z; }
    }

    const boss = this.boss;
    if (boss && !boss.dead && boss.state !== "emerge") {
      const dx = boss.x - p.x;
      const inLane = this.facing === 1 ? dx >= -14 : dx <= 14;
      const d = Math.abs(dx);
      if (inLane && d <= range) {
        const addIsClose = best !== null && bestD < 130;
        if (!addIsClose || this.bossForceTarget) best = boss;
      }
    }

    const had = this.onTarget;
    this.target = best;
    this.onTarget = best !== null;
    if (this.onTarget && !had) this.laserFlash = 0.25;
  }

  /* ============ AMBUSH ============ */

  /** Spawn Runners behind the player — triggered by Screamer's shriek, boss's
   * Screaming Call, camping in place too long, or a hazard. */
  private triggerAmbush(count: number) {
    this.ambushT = 6;
    const behind = -this.facing as 1 | -1;
    for (let i = 0; i < count; i++) {
      const x = clamp(this.pl.x + behind * (400 + R(0, 200)), 22, this.worldW - 22);
      const z = this.mkZombie("runner", x, GROUND, 1 + (this.power - 1) * 0.2, 1.25);
      z.face = x > this.pl.x ? -1 : 1;
      this.zombies.push(z);
      for (let k = 0; k < 8; k++)
        this.particles.push({
          x, y: GROUND, vx: behind * R(40, 80), vy: R(-60, 0),
          life: R(0.3, 0.6), max: 0.6,
          size: R(2, 5), color: "#7f1d1d", grav: 0, add: false,
        });
    }
    this.announce("THEY HEARD YOU", "runners closing from behind");
    this.sfx.wave();
    this.shake(5);
  }

  /** Begin a reload if it makes sense to. */
  startReload(manual = false) {
    const w = this.effWeapon(this.kind);
    if (this.reloading) return;
    if (this.ammo[this.kind] >= w.mag) {
      if (manual) this.sfx.click();
      return;
    }
    // limited reserve weapons need spare rounds (pistols are unlimited)
    if (this.reserve[this.kind] === 0) {
      // a class-typed ammo box in the backpack auto-loads before giving up
      const boxInst = this.backpack.find((it) => ITEMS[it.itemId]?.ammoClass === w.cls);
      if (boxInst) {
        const def = ITEMS[boxInst.itemId];
        this.backpack = removeItem(this.backpack, boxInst.id);
        this.invVer++;
        this.reserve[this.kind] = def.ammoAmount ?? 0;
        this.texts.push({
          x: this.pl.x, y: this.pl.y - 88, vy: -46, life: 0.8, max: 0.8,
          text: `+${def.ammoAmount} RESERVE`, color: "#67e8f9", size: 12,
        });
      } else {
        if (manual) {
          this.sfx.dryFire();
          this.texts.push({
            x: this.pl.x, y: this.pl.y - 88, vy: -46, life: 0.9, max: 0.9,
            text: "NO RESERVE AMMO", color: "#f87171", size: 12,
          });
        }
        return;
      }
    }
    this.reloading = true;
    // a tube gun clocks one shell at a time — same empty-to-full total, it just
    // no longer has to run to completion
    this.reloadDur = (w.tubeReload ? shellReloadTime(w) : w.reload) * this.st.reloadMul;
    this.reloadT = this.reloadDur;
    this.sfx.reloadStart();
    if (!w.tubeReload) {
      // eject spent magazine — a tube gun has none to drop
      const p = this.pl;
      this.particles.push({
        x: p.x, y: p.y - 40, vx: -p.face * R(40, 90), vy: R(-40, 10),
        life: 0.7, max: 0.7, size: 3, color: "#78716c", grav: 1400, add: false,
      });
    }
  }

  private finishReload() {
    const w = this.effWeapon(this.kind);
    const need = w.mag - this.ammo[this.kind];
    if (this.reserve[this.kind] < 0) {
      this.ammo[this.kind] = w.mag; // unlimited reserve (pistols)
    } else {
      const take = Math.min(need, this.reserve[this.kind]);
      this.ammo[this.kind] += take;
      this.reserve[this.kind] -= take;
    }
    this.reloading = false;
    this.reloadT = 0;
    this.sfx.reloadEnd();
    this.texts.push({
      x: this.pl.x, y: this.pl.y - 78, vy: -46, life: 0.7, max: 0.7,
      text: "RELOADED", color: "#fbbf24", size: 12,
    });
  }

  private updateReload(dt: number) {
    if (!this.reloading) return;
    this.reloadT -= dt;
    if (this.reloadT > 0) return;
    const w = this.effWeapon(this.kind);
    if (!w.tubeReload) {
      this.finishReload();
      return;
    }
    this.loadOneShell();
    const full = this.ammo[this.kind] >= w.mag;
    if (full || this.reserve[this.kind] === 0) {
      this.reloading = false;
      this.reloadT = 0;
      this.sfx.reloadEnd();
      if (full) {
        this.texts.push({
          x: this.pl.x, y: this.pl.y - 78, vy: -46, life: 0.7, max: 0.7,
          text: "RELOADED", color: "#fbbf24", size: 12,
        });
      }
      return;
    }
    this.reloadT += this.reloadDur; // keep feeding, carrying any overshoot
  }

  /** One shell into a tube gun. A reserve of -1 means unlimited — no tube
   * shotgun carries that today, but the guard keeps the arithmetic honest. */
  private loadOneShell() {
    this.ammo[this.kind]++;
    if (this.reserve[this.kind] > 0) this.reserve[this.kind]--;
    this.sfx.click();
  }

  private fire() {
    const p = this.pl;
    const st = this.st;
    const w = this.effWeapon(this.kind);
    // out of ammo -> auto reload
    if (this.ammo[this.kind] <= 0) {
      this.sfx.dryFire();
      this.startReload();
      p.cd = 0.25;
      return;
    }
    this.ammo[this.kind]--;
    // Tactical Stim: temporary fire-rate rush
    p.cd = 1 / (st.fireRate * (this.stimT > 0 ? 1.4 : 1));
    p.flash = 0.07;
    // eject a spent casing, at chest height
    this.particles.push({
      x: p.x - Math.cos(p.aim) * 4, y: p.y - CHEST_H,
      vx: -p.face * R(60, 150), vy: R(-210, -150),
      life: 0.6, max: 0.6, size: 1.8, color: "#fbbf24", grav: 1500, add: false,
    });
    const n = st.projectiles;
    const base = p.aim;
    const wc = WDEF[this.kind].cls;
    const muzzle = wc === "carbine" ? 58 : wc === "smg" ? 48 : 46;
    // bullets spawn from the gun's real position — chest height, same origin
    // the laser sight and the drawn gun use
    const mzx = p.x + Math.cos(base) * muzzle;
    const mzy = p.y - CHEST_H + Math.sin(base) * muzzle;
    const spread = st.projSpread;
    const jit = st.jitter;
    for (let i = 0; i < n; i++) {
      const off = n > 1 ? (i - (n - 1) / 2) * spread : 0;
      const a = base + off + R(-jit, jit);
      const crit = chance(st.crit);
      this.bullets.push({
        x: mzx, y: mzy,
        vx: Math.cos(a) * st.bulletSpeed, vy: Math.sin(a) * st.bulletSpeed,
        dmg: st.damage * (crit ? 2.2 : 1) * R(0.92, 1.08),
        pierce: st.pierce, crit,
        // bullets expire at the weapon's effective range
        life: (w.range * (1 + 0.12 * (this.stacks["velo"] || 0))) / st.bulletSpeed,
        hits: new Set(),
        hitBoss: false,
      });
    }
    for (let i = 0; i < 5; i++)
      this.particles.push({ x: mzx, y: mzy, vx: Math.cos(base + R(-0.5, 0.5)) * R(120, 420), vy: Math.sin(base + R(-0.5, 0.5)) * R(120, 420), life: R(0.08, 0.16), max: 0.16, size: R(1.5, 3.5), color: chance(0.5) ? "#fde68a" : "#f59e0b", grav: 0, add: true });
    this.particles.push({ x: p.x - Math.cos(base) * 4, y: p.y - CHEST_H, vx: -p.face * R(50, 130), vy: R(-190, -140), life: 0.55, max: 0.55, size: 2, color: "#fbbf24", grav: 1500, add: false });
    // recoil kicks the player back along the lane, opposite the facing
    p.vx -= this.facing * (w.recoil * 0.55);
    this.shake(w.shake);
    this.sfx.shoot();
  }

  private updateZombies(dt: number) {
    const p = this.pl;
    const movingFast = Math.abs(p.vx) > 220;
    for (const z of this.zombies) {
      z.t += dt;
      z.flash -= dt;
      if (z.dormant) {
        // sleepers wake when the player passes close while running/dashing
        const near = Math.abs(p.x - z.x) < 90;
        if (near && movingFast) this.wakeZombie(z);
        else continue; // still asleep — no movement, no attack timer, no contact damage
      }
      // the Screamer: crossing her path starts a windup; if she's still alive
      // when it expires she shrieks and triggers an ambush — a second Screamer
      // mid-ambush can't stack one, the ambushT guard is already shared
      if (z.type === "screamer" && z.alertT >= 0) {
        if (z.alertT === 0) {
          const close = Math.abs(p.x - z.x) < 260 && Math.abs(p.y - z.y) < 90;
          if (close) z.alertT = 1.4;
        } else {
          z.alertT -= dt;
          if (z.alertT <= 0) {
            z.alertT = -1; // spent — a killed-or-survived Screamer never re-triggers
            if (this.ambushT <= 0) this.triggerAmbush(3);
          }
        }
      }
      z.atk -= dt;
      if (z.burnT > 0) {
        z.burnT -= dt;
        z.hp -= z.burnDps * dt;
        if (chance(0.3)) {
          this.particles.push({
            x: z.x + R(-6, 6), y: z.y - 10 * z.scale, vx: R(-20, 20), vy: R(-60, -20),
            life: R(0.2, 0.4), max: 0.4, size: R(2, 3), color: "#f97316", grav: -50, add: true,
          });
        }
        if (z.hp <= 0) { this.killZombie(z, z.face); continue; }
      }
      const dx = p.x - z.x;
      const dy = p.y - z.y;
      const dir = dx > 0 ? 1 : -1;
      z.face = dir;
      const dist2d = Math.hypot(dx, dy) || 1;
      const ux = dx / dist2d;

      if (z.type === "spitter") {
        {
          // keep-away kiting along the lane
          if (dist2d > 400) z.vx = ux * z.speed;
          else if (dist2d < 230) z.vx = -ux * z.speed * 0.6;
          else z.vx *= 0.85;
        }
        z.spit -= dt;
        if (z.spit <= 0 && dist2d < 640) {
          z.spit = R(2.1, 3.1);
          this.spitAt(z);
        }
      } else {
        // chase the player along the ground line
        z.vx = lerp(z.vx, ux * z.speed, Math.min(1, 6 * dt));
      }
      z.x = clamp(z.x + z.vx * dt, 10, this.worldW - 10);
      z.y = GROUND;

      // contact damage — a jump that clears the zombie's head (dy very
      // negative, since zombies stand at GROUND) dodges the hit, same as
      // it already does against boss attacks
      if (Math.abs(dx) < z.r + 15 && dy > -60 && z.atk <= 0) {
        z.atk = z.type === "brute" ? 1.15 : 0.8;
        this.hurtPlayer(z.dmg * R(0.9, 1.1), dir * (z.type === "brute" ? 300 : 150));
      }
    }
    // separation, along the shared ground line
    const zs = this.zombies;
    for (let i = 0; i < zs.length; i++) {
      for (let j = i + 1; j < zs.length; j++) {
        const a = zs[i], b = zs[j];
        const sdx = b.x - a.x;
        const sepDist = Math.abs(sdx) || 1;
        const min = (a.r + b.r) * 0.72;
        if (sepDist < min) {
          const push = (min - sepDist) * 0.5;
          const sux = Math.sign(sdx);
          a.x -= sux * push;
          b.x += sux * push;
        }
      }
    }
    this.zombies = zs.filter((z) => !z.dead);
  }

  private static readonly BOSS_PITCH: Record<BossAttack, number> = { slam: 90, mortar: 260, call: 170, shieldcharge: 130 };

  private updateBoss(dt: number) {
    const b = this.boss;
    if (!b || b.dead) return;
    const p = this.pl;
    b.t += dt;
    b.flash = Math.max(0, b.flash - dt);
    b.hurtT = Math.max(0, b.hurtT - dt);
    b.phase = phaseFor(b.hp / b.maxHp);
    const dx = p.x - b.x;
    const dy = p.y - b.y;
    b.face = dx >= 0 ? 1 : -1;

    if (b.state === "emerge") {
      // invulnerable and immobile while it rises — see drawBoss() for the
      // visual, and updateBullets()/targeting for why it can't be hit or
      // locked onto yet
      b.timer -= dt;
      if (chance(0.35)) {
        this.particles.push({
          x: b.x + R(-20, 20), y: b.y, vx: R(-30, 30), vy: R(-140, -60),
          life: R(0.3, 0.6), max: 0.6, size: R(2, 4), color: "#1c1712", grav: 400, add: false,
        });
      }
      if (b.timer <= 0) {
        b.state = "seek";
        b.timer = R(1, 1.8);
      }
      return;
    }

    const def = BOSS_DEFS[b.defId];
    if (b.state === "seek" || b.state === "cooldown") {
      const bd = Math.hypot(dx, dy) || 1;
      const sp = bossSpeed(def, b.phase);
      b.vx = lerp(b.vx, (dx / bd) * sp, Math.min(1, 4 * dt));
      b.x = clamp(b.x + b.vx * dt, 10, this.worldW - 10);
      b.y = GROUND;
      b.timer -= dt;
      if (b.atk > 0) b.atk -= dt;
      else if (bd < b.r + 30) {
        b.atk = 1.1;
        this.hurtPlayer(26 * (1 + (this.power - 1) * 0.05), Math.sign(dx || 1) * 260);
      }
      if (b.timer <= 0) {
        if (b.state === "seek") {
          b.attack = pickAttack(b.attack, def.attacks);
          b.state = "windup";
          b.timer = windupFor(b.attack, b.phase, def);
          this.spawnSuppressT = 2;
          if (b.attack === "mortar") { b.targetX = p.x; b.targetY = p.y; }
          this.sfx.bossWindup(Engine.BOSS_PITCH[b.attack]);
        } else {
          b.state = "seek";
          b.timer = R(0.6, 1.2);
        }
      }
    } else if (b.state === "windup") {
      b.vx = 0;
      b.vy = 0;
      b.timer -= dt;
      if (b.timer <= 0) {
        this.executeBossAttack(b);
        // Shield Charge hands off to the charge state, which ends in cooldown
        // itself; every other attack resolves instantly and falls through here
        if (b.state === "windup") {
          b.state = "cooldown";
          b.timer = cooldownFor(b.phase, def);
        }
      }
    } else if (b.state === "attack") {
      // A committed lunge along the vector locked when the windup ended. It
      // deliberately does NOT steer: sidestepping is the counter-play, and a
      // charge that tracks you is just a fast chase with extra steps.
      b.vx = b.chargeX * CHARGE_SPEED;
      b.x = clamp(b.x + b.vx * dt, 10, this.worldW - 10);
      b.y = GROUND;
      b.timer -= dt;
      if (b.atk > 0) b.atk -= dt;
      else if (Math.hypot(dx, dy) < b.r + 34) {
        b.atk = 1.1;
        this.hurtPlayer(34 * (1 + (this.power - 1) * 0.05), b.chargeX * 420);
        this.shake(7);
      }
      // dust off the shoulder, so the lunge reads as weight rather than a slide
      this.particles.push({
        x: b.x - b.chargeX * b.r, y: b.y - b.chargeY * b.r,
        vx: R(-70, 70) - b.chargeX * 120, vy: R(-70, 70) - b.chargeY * 120,
        life: R(0.2, 0.4), max: 0.4, size: R(2, 4.5), color: "#6b7280", grav: 0, add: false,
      });
      if (b.timer <= 0) {
        b.vx = 0;
        b.vy = 0;
        b.state = "cooldown";
        b.timer = cooldownFor(b.phase, def);
      }
    }
  }

  private executeBossAttack(b: Boss) {
    const p = this.pl;
    if (b.attack === "slam") {
      const radius = 150;
      this.sfx.bossSlam();
      this.shake(11);
      const dx = p.x - b.x;
      if (Math.hypot(dx, p.y - b.y) < radius) {
        this.hurtPlayer(32 * (1 + (this.power - 1) * 0.05), Math.sign(dx || 1) * 340);
      }
      for (let i = 0; i < 26; i++)
        this.particles.push({
          x: b.x + R(-radius, radius), y: b.y + R(-radius * 0.6, radius * 0.6), vx: R(-100, 100), vy: R(-100, 100),
          life: R(0.3, 0.6), max: 0.6, size: R(2, 5), color: "#7a6a52", grav: 0, add: false,
        });
    } else if (b.attack === "mortar") {
      const radius = 95;
      this.sfx.hurt();
      const dx = b.targetX - p.x, dy = b.targetY - p.y;
      if (dx * dx + dy * dy < radius * radius) {
        this.hurtPlayer(27 * (1 + (this.power - 1) * 0.05), Math.sign(-dx || 1) * 260);
      }
      for (let i = 0; i < 20; i++)
        this.particles.push({
          x: b.targetX + R(-30, 30), y: b.targetY + R(-30, 30), vx: R(-140, 140), vy: R(-140, 140),
          life: R(0.3, 0.65), max: 0.65, size: R(2, 5), color: "#65a30d", grav: 0, add: true,
        });
    } else if (b.attack === "shieldcharge") {
      // The Neighborhood Watch's signature move. It used to be a standing AOE
      // with a different tell colour — fine in a lane, useless once the player
      // could walk away. Now it is the lunge its name promises: lock a heading
      // and commit, handing off to the "attack" state which does the travel.
      const dx = p.x - b.x, dy = p.y - b.y;
      const d = Math.hypot(dx, dy) || 1;
      b.chargeX = dx / d;
      b.chargeY = dy / d;
      b.state = "attack";
      b.timer = CHARGE_TIME;
      b.atk = 0; // the charge gets its own contact hit, not the seek cooldown's
      this.sfx.bossSlam();
      this.shake(9);
    } else {
      // Screaming Call — reuses the existing runner-ambush system rather than
      // rebuilding add-spawning; "one active ambush max" falls out for free
      this.sfx.bossRoar();
      if (this.ambushT <= 0) this.triggerAmbush(2);
    }
  }

  private hitBoss(b: Boss, bullet: Bullet) {
    b.hp -= bullet.dmg;
    b.flash = 0.09;
    b.hurtT = 0.3;
    const dir = Math.sign(bullet.vx);
    for (let i = 0; i < (bullet.crit ? 8 : 5); i++)
      this.particles.push({ x: bullet.x, y: bullet.y, vx: dir * R(30, 190) + R(-60, 60), vy: R(-130, 40), life: R(0.25, 0.5), max: 0.5, size: R(2, 4.5), color: BLOOD[RI(0, BLOOD.length - 1)], grav: 1100, add: false });
    this.texts.push({ x: b.x + R(-8, 8), y: b.y - 30 * b.scale, vy: -60, life: 0.55, max: 0.55, text: String(Math.round(bullet.dmg)), color: bullet.crit ? "#fbbf24" : "rgba(255,255,255,.8)", size: bullet.crit ? 17 : 12 });
    if (this.st.lifesteal > 0) this.pl.hp = Math.min(this.st.maxHp, this.pl.hp + bullet.dmg * this.st.lifesteal);
    this.sfx.zhit();
    if (b.hp <= 0) this.killBoss(b);
  }

  private killBoss(b: Boss) {
    const def = BOSS_DEFS[b.defId];
    b.dead = true;
    b.hp = 0;
    this.kills++;
    this.score += Math.round(600 * (1 + this.power * 0.06));
    this.shake(12);
    this.sfx.zdie();
    this.gainXp(40);
    for (let i = 0; i < 40; i++)
      this.particles.push({ x: b.x + R(-10, 10), y: b.y - 60 * b.scale + R(-16, 16), vx: R(-160, 160), vy: R(-220, 60), life: R(0.3, 0.75), max: 0.75, size: R(2.5, 6), color: BLOOD[RI(0, BLOOD.length - 1)], grav: 1200, add: false });
    this.decals.push({ x: b.x, y: b.y, s: b.scale * 1.6, a: 0.6 });
    this.announce(def.deathBanner, def.deathSub, 2.6);
  }

  /** Rouses one sleeper. A loud wake (walking into a gate, a hazard) spreads to nearby sleepers too. */
  private wakeZombie(z: Zombie, spread = false) {
    if (!z.dormant) return;
    z.dormant = false;
    z.atk = R(0, 0.3);
    for (let i = 0; i < 5; i++)
      this.particles.push({
        x: z.x, y: z.y - 50 * z.scale, vx: R(-30, 30), vy: R(-50, -10),
        life: 0.4, max: 0.4, size: 2, color: "#fde047", grav: 0, add: true,
      });
    if (spread) {
      for (const other of this.zombies) {
        if (other !== z && other.dormant && Math.abs(other.x - z.x) < 220) this.wakeZombie(other);
      }
    }
  }

  private spitAt(z: Zombie) {
    const p = this.pl;
    // straight at the player — there is no "up" to lob into in a 2D world
    const dx = p.x - z.x;
    const dy = p.y - z.y;
    const d = Math.hypot(dx, dy) || 1;
    const sp = 330;
    const originY = z.y;
    this.eshots.push({
      x: z.x, y: originY,
      vx: (dx / d) * sp, vy: (dy / d) * sp,
      dmg: z.dmg, life: 3,
    });
    this.sfx.spit();
    for (let i = 0; i < 4; i++)
      this.particles.push({ x: z.x, y: originY, vx: R(-40, 40), vy: R(-40, 40), life: 0.3, max: 0.3, size: R(2, 4), color: "#a3e635", grav: 0, add: true });
  }

  private updateBullets(dt: number) {
    for (const b of this.bullets) {
      b.life -= dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      for (const z of this.zombies) {
        if (z.dead || b.hits.has(z)) continue;
        // z.y is the zombie's feet — its hittable mass is centred a body's
        // worth of height above that
        const cy = z.y - z.r;
        const rr = z.r + 7;
        const dx = b.x - z.x, dy = b.y - cy;
        if (dx * dx + dy * dy < rr * rr * 1.25) {
          b.hits.add(z);
          // any hit on a still-dormant sleeper is a takedown, not a firefight
          if (z.dormant) this.quietKill(z);
          else this.hitZombie(z, b);
          if (b.pierce > 0) b.pierce--;
          else { b.life = 0; break; }
        }
      }
      if (b.life > 0 && this.boss && !this.boss.dead && this.boss.state !== "emerge" && !b.hitBoss) {
        const boss = this.boss;
        const cy = boss.y - boss.r;
        const rr = boss.r + 7;
        const dx = b.x - boss.x, dy = b.y - cy;
        if (dx * dx + dy * dy < rr * rr * 1.25) {
          b.hitBoss = true;
          this.hitBoss(boss, b);
          if (b.pierce > 0) b.pierce--;
          else b.life = 0;
        }
      }
    }
    this.bullets = this.bullets.filter((b) => b.life > 0 && b.x > -60 && b.x < this.worldW + 60);
  }

  private updateEshots(dt: number) {
    const p = this.pl;
    for (const s of this.eshots) {
      s.life -= dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (chance(0.5))
        this.particles.push({ x: s.x, y: s.y, vx: R(-12, 12), vy: R(-12, 12), life: 0.3, max: 0.3, size: 2.4, color: "#84cc16", grav: 0, add: true });
      const dx = s.x - p.x, dy = s.y - p.y;
      if (dx * dx + dy * dy < 22 * 22) {
        s.life = 0;
        this.hurtPlayer(s.dmg, Math.sign(s.vx) * 110);
      }
    }
    this.eshots = this.eshots.filter((s) => s.life > 0);
  }

  private updateGems(dt: number) {
    const p = this.pl;
    const mr = 110 * this.st.magnet;
    for (const g of this.gems) {
      g.t += dt;
      g.age += dt;
      // no more -34 head offset — p.y is the player's own top-down center now,
      // not a feet position with the body drawn 34px above it
      const dx = p.x - g.x, dy = p.y - g.y;
      const d = Math.hypot(dx, dy);
      if (d < mr) {
        const pull = 620 * (1.15 - d / mr);
        g.vx = (dx / (d || 1)) * pull;
        g.vy = (dy / (d || 1)) * pull;
        g.rest = false;
      } else if (!g.rest) {
        // top-down: no gravity, no fixed floor — the gem scatters from the
        // kill and settles wherever it lands instead of falling to a
        // universal ground height unrelated to where it dropped
        g.vx = lerp(g.vx, 0, Math.min(1, 4 * dt));
        g.vy = lerp(g.vy, 0, Math.min(1, 4 * dt));
        if (Math.hypot(g.vx, g.vy) < 8) { g.rest = true; g.vx = 0; g.vy = 0; }
      }
      g.x += g.vx * dt;
      g.y += g.vy * dt;
      if (d < 24) {
        g.val = -g.val; // mark collected
        if (g.kind === "scrap") {
          this.profile.totalScrap += Math.abs(g.val);
          this.gainMetaXp(2);
          this.particles.push({ x: p.x, y: p.y - 34, vx: R(-30, 30), vy: R(-60, -10), life: 0.3, max: 0.3, size: 3, color: "#94a3b8", grav: 0, add: true });
        } else {
          this.gainXp(Math.abs(g.val));
          this.particles.push({ x: p.x, y: p.y - 34, vx: R(-30, 30), vy: R(-60, -10), life: 0.3, max: 0.3, size: 3, color: "#a78bfa", grav: 0, add: true });
        }
        this.sfx.gem();
      }
    }
    this.gems = this.gems.filter((g) => g.val > 0 && g.age < GEM_LIFETIME);
  }

  private updateParticles(dt: number) {
    // no ground line: a kill can happen at any y, so debris just arcs under
    // its own gravity and fades on its life timer
    for (const q of this.particles) {
      q.life -= dt;
      q.vy += q.grav * dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
    }
    this.particles = this.particles.filter((q) => q.life > 0);
    if (this.particles.length > 500) this.particles.splice(0, this.particles.length - 500);
  }

  private updateTexts(dt: number) {
    for (const t of this.texts) {
      t.life -= dt;
      t.y += t.vy * dt;
      t.vy = lerp(t.vy, -18, Math.min(1, 3 * dt));
    }
    this.texts = this.texts.filter((t) => t.life > 0);
    if (this.texts.length > 40) this.texts.splice(0, this.texts.length - 40);
  }

  /* ---------------- combat resolution ---------------- */

  private hitZombie(z: Zombie, b: Bullet) {
    z.hp -= b.dmg;
    z.flash = 0.09;
    // weapon-specific stagger (Deagle/shotguns hurl zombies backwards)
    const kb = WDEF[this.kind]?.knock ?? 60;
    z.vx += (Math.sign(b.vx) * kb * (b.crit ? 1.6 : 1)) / (z.scale * (z.boss ? 3 : 1));
    const dir = Math.sign(b.vx);
    for (let i = 0; i < (b.crit ? 8 : 5); i++)
      this.particles.push({ x: b.x, y: b.y, vx: dir * R(30, 190) + R(-60, 60), vy: R(-130, 40), life: R(0.25, 0.5), max: 0.5, size: R(2, 4.5), color: BLOOD[RI(0, BLOOD.length - 1)], grav: 1100, add: false });
    this.texts.push({ x: z.x + R(-8, 8), y: z.y - 18 * z.scale, vy: -60, life: 0.55, max: 0.55, text: String(Math.round(b.dmg)), color: b.crit ? "#fbbf24" : "rgba(255,255,255,.8)", size: b.crit ? 17 : 12 });
    if (this.st.lifesteal > 0) this.pl.hp = Math.min(this.st.maxHp, this.pl.hp + b.dmg * this.st.lifesteal);
    this.sfx.zhit();
    const incendiary = this.stacks["incendiary"] || 0;
    if (incendiary > 0) {
      // refreshes on every hit rather than stacking additively — keeps
      // sustained fire on one target strong without compounding into an
      // unbounded DoT if you tag it repeatedly
      z.burnT = 3;
      z.burnDps = b.dmg * 0.25 * incendiary;
    }
    if (z.hp <= 0) this.killZombie(z, dir);
  }

  private killZombie(z: Zombie, dir: number) {
    z.dead = true;
    this.kills++;
    this.profile.totalKills++;
    this.gainMetaXp(1);
    this.gainWeaponXp(this.kind, 1);
    this.score += Math.round(z.score * (1 + this.power * 0.06));
    this.shake(z.type === "brute" ? 5 : 1.6);
    this.sfx.zdie();
    // the top-down body is flat, so the zombie's own y is the burst origin
    const cx = z.x, cy = z.y;
    for (let i = 0; i < (z.boss ? 30 : 16); i++)
      this.particles.push({ x: cx + R(-8, 8), y: cy + R(-14, 14), vx: dir * R(20, 160) + R(-110, 110), vy: R(-110, 110), life: R(0.3, 0.7), max: 0.7, size: R(2, 5.5), color: BLOOD[RI(0, BLOOD.length - 1)], grav: 0, add: false });
    this.decals.push({ x: z.x, y: z.y, s: z.scale, a: 0.55 });
    if (this.decals.length > 70) this.decals.shift();
    // xp gems
    const total = z.xp;
    const n = Math.min(8, Math.max(1, Math.round(total)));
    for (let i = 0; i < n; i++) {
      const ang = R(0, TAU);
      this.gems.push({
        x: cx + R(-10, 10), y: cy,
        vx: Math.cos(ang) * R(60, 150),
        vy: Math.sin(ang) * R(60, 150),
        val: total / n, t: R(0, 9), age: 0, rest: false, kind: "xp",
      });
    }
    // scrap — no longer spendable; it feeds the lifetime total and meta XP, so
    // it drops on every stage rather than only on the old arena
    if (chance(0.22)) {
      this.gems.push({ x: cx + R(-10, 10), y: cy, vx: R(-90, 90), vy: R(-80, 80), val: 1, t: R(0, 9), age: 0, rest: false, kind: "scrap" });
    }
  }

  /** Bombardment upgrade — an instant, one-time strike wiping every regular
   * zombie currently alive. Spares anything boss-tier (the Boss
   * entity is untouched by definition since it isn't in `zombies[]`, and a
   * `z.boss` mini-boss like a horde finale's brute is excluded here too) so
   * it can't trivialize the one fight in a wave meant to actually matter. */
  private executeBombardment() {
    for (const z of this.zombies) {
      if (z.dead || z.boss) continue;
      this.killZombie(z, z.face);
    }
    this.shake(16);
    this.sfx.zdie();
    for (let i = 0; i < 60; i++) {
      const ang = R(0, TAU);
      this.particles.push({
        x: this.pl.x + Math.cos(ang) * R(0, 260), y: this.pl.y + Math.sin(ang) * R(0, 260),
        vx: Math.cos(ang) * R(60, 220), vy: Math.sin(ang) * R(60, 220) - 40,
        life: R(0.4, 0.9), max: 0.9, size: R(3, 7), color: chance(0.5) ? "#f97316" : "#fde68a", grav: 0, add: true,
      });
    }
    this.announce("BOMBARDMENT", "the wave is cleared", 2.4);
  }

  /** A suppressed hit on a still-dormant sleeper — instant takedown, nearby sleepers stay asleep. */
  private quietKill(z: Zombie) {
    z.hp = 0;
    z.flash = 0.09;
    this.texts.push({
      x: z.x, y: z.y - 74 * z.scale, vy: -60, life: 0.6, max: 0.6,
      text: "QUIET KILL", color: "#67e8f9", size: 12,
    });
    this.killZombie(z, this.facing);
  }

  private hurtPlayer(dmg: number, kx: number) {
    const p = this.pl;
    if (p.ifr > 0 || p.dashT > 0 || this.over) return;
    // Body Armor — flat % reduction on every damage source that funnels
    // through here (zombie melee, spit, boss melee/ranged alike)
    dmg *= 1 - 0.08 * (this.stacks["armor"] || 0);
    p.hp -= dmg;
    p.ifr = 0.9;
    p.hurtT = 1;
    p.vx += kx;
    this.shake(7);
    this.sfx.hurt();
    for (let i = 0; i < 8; i++)
      this.particles.push({ x: p.x, y: p.y - 36, vx: R(-140, 140), vy: R(-160, 20), life: R(0.25, 0.5), max: 0.5, size: R(2, 4), color: BLOOD[RI(0, BLOOD.length - 1)], grav: 1000, add: false });
    this.texts.push({ x: p.x, y: p.y - 72, vy: -60, life: 0.6, max: 0.6, text: `-${Math.round(dmg)}`, color: "#f87171", size: 15 });
    if (p.hp <= 0) {
      p.hp = 0;
      this.die();
    }
  }

  private die() {
    this.shake(13);
    this.sfx.die();
    const p = this.pl;
    for (let i = 0; i < 40; i++)
      this.particles.push({ x: p.x, y: p.y - 34, vx: R(-260, 260), vy: R(-320, 40), life: R(0.4, 1), max: 1, size: R(2, 6), color: chance(0.6) ? BLOOD[RI(0, BLOOD.length - 1)] : "#0e7490", grav: 1100, add: false });
    this.profile.bestWave = Math.max(this.profile.bestWave, this.wave);
    saveProfile(this.profile);
    // Decisions locked: restart at the last checkpoint, keep level/XP/upgrades/
    // weapons/deposit/progression, lose the carried backpack. Only a genuine
    // game-over (no checkpoint reached yet — before wave 5) ends the run.
    const checkpoint = loadRun();
    if (checkpoint) {
      this.retryFromCheckpoint(checkpoint);
      return;
    }
    this.over = true;
    const isBest = this.score > this.high;
    if (isBest) {
      this.high = this.score;
      localStorage.setItem("graveyard-shift-high", String(this.high));
    }
    const stats: GameStats = {
      wave: this.wave, kills: this.kills, level: this.pl.level,
      score: this.score, time: this.playTime, best: this.high, isBest,
    };
    this.onEvent({ type: "gameover", stats });
  }

  /** reset() then restore progression from the last checkpoint. Shared by
   * dying (which drops the carried backpack as the penalty) and by resuming a
   * saved run from the menu (which doesn't — nobody died, the player just
   * stopped playing). */
  private restoreFrom(
    checkpoint: SaveData,
    opts: { keepBackpack: boolean; banner: string; sub: string }
  ) {
    this.reset();
    this.initWorld();
    // resume right before the wave the checkpoint names — the normal break
    // countdown then calls startWave(this.wave + 1) exactly like any other
    // wave clear
    this.wave = checkpoint.wave - 1;
    this.pl.level = checkpoint.level;
    this.pl.xp = checkpoint.xp;
    this.pl.xpNext = checkpoint.xpNext;
    this.score = checkpoint.score;
    this.kills = checkpoint.kills;
    this.playTime = checkpoint.playTime;
    this.kind = this.owned.has(checkpoint.kind) ? checkpoint.kind : this.kind;
    this.stacks = { ...checkpoint.stacks };
    this.deposit = checkpoint.deposit;
    this.backpack = opts.keepBackpack ? checkpoint.backpack : [];
    this.invVer++;
    this.recompute();
    this.pl.hp = this.st.maxHp;
    this.pl.x = clamp(this.worldW * 0.12, 40, this.worldW - 40);
    this.pl.y = GROUND;
    this.cam = clamp(this.pl.x - this.viewW / 2, 0, this.worldW - this.viewW);
    this.mode = "play";
    this.beginRest(2.4);
    this.announce(opts.banner, opts.sub, 2.8);
  }

  private retryFromCheckpoint(checkpoint: SaveData) {
    this.restoreFrom(checkpoint, {
      // dropping the carried backpack is the whole point of the death penalty
      keepBackpack: false,
      banner: "YOU DIED",
      sub: `back on your feet — wave ${checkpoint.wave} next`,
    });
  }

  /** Wave a saved run would resume at, or null if there's nothing to continue.
   * Drives the menu's CONTINUE button and its label. */
  savedRunWave(): number | null {
    return loadRun()?.wave ?? null;
  }

  /** Resume the checkpoint written by the last boss-wave clear. Unlike dying,
   * this keeps the backpack — the player didn't lose the run, they just
   * stopped playing and came back. */
  continueRun(): boolean {
    const checkpoint = loadRun();
    if (!checkpoint) return false;
    this.sfx.ensure();
    this.restoreFrom(checkpoint, {
      keepBackpack: true,
      banner: `WAVE ${checkpoint.wave}`,
      sub: "picking up where you left off",
    });
    return true;
  }

  private writeCheckpoint(nextWave: number) {
    const data: SaveData = {
      version: SAVE_VERSION, wave: nextWave,
      level: this.pl.level, xp: this.pl.xp, xpNext: this.pl.xpNext,
      score: this.score, kills: this.kills, playTime: this.playTime,
      kind: this.kind, stacks: { ...this.stacks }, deposit: this.deposit, backpack: this.backpack,
    };
    saveRun(data);
    this.profile.bestWave = Math.max(this.profile.bestWave, this.wave);
    saveProfile(this.profile);
  }

  /* ---------------- xp / level / upgrades ---------------- */

  private xpFor(level: number) {
    return Math.round(10 + (level - 1) * 7 + Math.pow(level - 1, 1.6) * 2);
  }

  private gainXp(v: number) {
    const p = this.pl;
    p.xp += v;
    while (p.xp >= p.xpNext) {
      p.xp -= p.xpNext;
      p.level++;
      p.xpNext = this.xpFor(p.level);
      this.lvlPending++;
    }
    if (this.lvlPending > 0 && !this.modalOpen) this.openLevelModal();
  }

  /** Lifetime account progression — permanently unlocks weapons in the Loadout
   * screen as it climbs. Persisted at natural low-frequency checkpoints
   * (stage clear, death), not on every gain, to avoid a localStorage write per kill. */
  private gainMetaXp(v: number) {
    this.profile.metaXp += v;
    while (this.profile.metaXp >= metaXpFor(this.profile.metaLevel)) {
      this.profile.metaXp -= metaXpFor(this.profile.metaLevel);
      this.profile.metaLevel++;
      const unlocked = WEAPON_IDS.filter((id) => WEAPON_UNLOCK_LEVEL[id] === this.profile.metaLevel);
      for (const wid of unlocked) {
        this.owned.add(wid);
        this.announce("WEAPON UNLOCKED", `${WDEF[wid].name} — pick it in Loadout`, 2.6);
      }
    }
  }

  private openLevelModal() {
    this.modals.add("levelup");
    this.sfx.levelup();
    this.onEvent({ type: "levelup", choices: this.rollChoices() });
  }

  private rollChoices(): UpgradeChoice[] {
    // weapon ownership is entirely meta-level-gated now (see progression.ts) —
    // leveling up mid-run only ever offers stat upgrades, never a weapon
    const out: UpgradeChoice[] = [];
    const avail = UPGRADES.filter((u) => (this.stacks[u.id] || 0) < u.max);
    const pool = [...avail];
    while (out.length < 3 && pool.length > 0) {
      const u: UpgradeDef = pool.splice(RI(0, pool.length - 1), 1)[0];
      out.push({
        id: u.id, name: u.name, icon: u.icon, max: u.max, rarity: u.rarity,
        stacks: this.stacks[u.id] || 0,
        desc: u.desc((this.stacks[u.id] || 0) + 1),
      });
    }
    return out;
  }

  applyUpgrade(id: string) {
    if (!this.modalOpen) return;
    this.stacks[id] = (this.stacks[id] || 0) + 1;
    this.recompute();
    if (id === "hp") this.pl.hp = Math.min(this.st.maxHp, this.pl.hp + 30);
    if (id === "bombardment") this.executeBombardment();
    this.sfx.upgrade();
    this.lvlPending--;
    if (this.lvlPending > 0) {
      this.onEvent({ type: "levelup", choices: this.rollChoices() });
    } else {
      // stays frozen on its own if the boss-clear screen is still up —
      // "bossclear" is only ever added/removed by completeBossWave()/continueAfterBoss()
      this.modals.delete("levelup");
      this.onEvent({ type: "resume" });
    }
  }

  /** Equip a specific owned weapon (also becomes that class's active variant). */
  equip(wid: string, silent = false) {
    if (!this.owned.has(wid) || this.kind === wid) return;
    this.kind = wid;
    this.equipped[WDEF[wid].cls] = wid;
    // swapping cancels an in-progress reload (per-weapon mags are preserved)
    this.reloading = false;
    this.reloadT = 0;
    if (this.ammo[wid] === undefined) this.ammo[wid] = this.effWeapon(wid).mag;
    this.recompute();
    // heavier weapons take longer to bring up
    this.pl.cd = Math.max(this.pl.cd, this.effWeapon(wid).swap);
    if (!silent) this.sfx.click();
    for (let i = 0; i < 8; i++)
      this.particles.push({
        x: this.pl.x + R(-10, 10), y: this.pl.y - 40 + R(-10, 10),
        vx: R(-60, 60), vy: R(-70, -10), life: 0.35, max: 0.35,
        size: R(1.5, 3), color: "#fbbf24", grav: 120, add: true,
      });
  }

  /**
   * Press a class key: equip that class's active variant.
   * Pressing it again while already on that class cycles through owned variants.
   */
  selectClass(cls: WeaponClass) {
    const list = byClass(cls).filter((w) => this.owned.has(w));
    if (list.length === 0) return;
    // only allow switching to this class if currently using a different class
    if (WDEF[this.kind].cls !== cls) {
      this.equip(this.equipped[cls] ?? list[0]);
    }
  }

  /** Q cycles between weapon classes only, not within a class. */
  cycleWeapon(dir = 1) {
    const currentCls = WDEF[this.kind].cls;
    const cls = CLASS_ORDER[(CLASS_ORDER.indexOf(currentCls) + dir + CLASS_ORDER.length) % CLASS_ORDER.length];
    this.selectClass(cls);
  }

  private recompute() {
    const s = (id: string) => this.stacks[id] || 0;
    const w = WDEF[this.kind] ?? WDEF.pistol;
    // multishot adds pellets to shotgun, extra rounds to everything else
    const extra = s("multi");
    // Akimbo: a second pistol firing alongside the first — doubles the
    // pistol's base projectile count, but only while a pistol is equipped
    const akimbo = w.cls === "pistol" && s("akimbo") > 0;
    const projectiles = w.projectiles + extra * (w.cls === "shotgun" ? 2 : 1) + (akimbo ? w.projectiles : 0);
    const spread = w.projectiles > 1 ? w.spread : 0.07;
    this.st = {
      damage: w.damage * (1 + 0.3 * s("dmg")),
      fireRate: w.fireRate * (1 + 0.22 * s("rate")),
      bulletSpeed: w.speed * (1 + 0.3 * s("velo")),
      jitter: Math.max(0.002, w.jitter * (1 - 0.22 * s("velo"))),
      projectiles,
      projSpread: spread,
      projJitter: 1,
      pierce: w.pierce + s("pierce"),
      crit: 0.05 + w.critBonus + 0.12 * s("crit"),
      // weapon class governs mobility (shotgun/BR are heavy, SMG/pistol are light)
      speed: 275 * (1 + 0.16 * s("speed")) * w.moveMul,
      maxHp: 100 + 30 * s("hp"),
      magnet: 1 + 0.7 * s("magnet"),
      lifesteal: 0.03 * s("vamp"),
      regen: 0.9 * s("regen"),
      dashMax: 2.3 * Math.pow(0.68, s("dash")),
      // a second pistol means two mags to reload, one-handed each — slower overall
      reloadMul: akimbo ? 1.45 : 1,
    };
  }

  /* ---------------- inventory: crates, backpack, consumables ---------------- */

  private spawnCrate(tier: CrateTier) {
    // scatter along the ground near the player, or it can land somewhere
    // they're nowhere near and never visibly reach
    const x = clamp(this.pl.x + R(-160, 160), 30, this.worldW - 30);
    this.crates.push({ x, y: GROUND, tier, opened: false });
  }

  private isNearCrate(cr: Crate): boolean {
    const p = this.pl;
    return Math.hypot(cr.x - p.x, cr.y - p.y) < 40;
  }

  private updateCrates(dt: number) {
    let near: Crate | null = null;
    for (const cr of this.crates) {
      if (cr.opened) continue;
      if (this.isNearCrate(cr)) { near = cr; break; }
    }
    if (near && this.keys.has("KeyE")) {
      this.crateOpenT += dt;
      if (this.crateOpenT >= 1.2) {
        this.openCrate(near);
        this.crateOpenT = 0;
      }
    } else {
      this.crateOpenT = Math.max(0, this.crateOpenT - dt * 2);
    }
  }

  /** Rolls a loot tier straight into the backpack and returns a human summary
   * ("Field Bandage x2, Frag Grenade" / "nothing usable inside") — shared by
   * an in-world crate open and any loot granted with no physical crate
   * (stage-clear supplies, which would otherwise spawn a crate in a world
   * about to be torn down for the next stage, unreachable). */
  private grantLoot(tier: CrateTier): string {
    const drops = rollLoot(tier);
    const gainedCounts = new Map<string, number>();
    let lost = 0;
    for (const d of drops) {
      const placed = placeItem(BACKPACK_SIZE, this.backpack, shapeOfItem, {
        id: `it${this.nextItemSeq++}`, itemId: d.itemId,
      });
      if (placed) {
        this.backpack = placed;
        gainedCounts.set(d.itemId, (gainedCounts.get(d.itemId) ?? 0) + 1);
      } else lost++;
    }
    this.invVer++;
    // name the actual items collected instead of a bare count — capped at 2
    // named entries since the banner draws this as one non-wrapping line
    // (see drawBanner)
    const gainedEntries = [...gainedCounts.entries()]
      .map(([itemId, n]) => `${ITEMS[itemId]?.name ?? itemId}${n > 1 ? ` x${n}` : ""}`);
    const gainedList = gainedEntries.length > 2
      ? `${gainedEntries.slice(0, 2).join(", ")} +${gainedEntries.length - 2} more`
      : gainedEntries.join(", ");
    return gainedList
      ? lost > 0 ? `${gainedList} — backpack full, ${lost} left behind` : gainedList
      : "nothing usable inside";
  }

  private openCrate(cr: Crate) {
    cr.opened = true;
    const summary = this.grantLoot(cr.tier);
    this.sfx.levelup();
    this.shake(2);
    this.announce("CRATE OPENED", summary, 2.2);
    for (let i = 0; i < 14; i++)
      this.particles.push({
        x: cr.x, y: cr.y - 10, vx: R(-90, 90), vy: R(-220, -60),
        life: R(0.3, 0.6), max: 0.6, size: R(2, 4), color: "#fbbf24", grav: 700, add: true,
      });
  }

  useConsumable(key: ConsumableKey) {
    if (this.mode !== "play" || this.over || this.paused || this.modalOpen) return;
    if (this.pl.useT > 0) return;
    const def = itemForHotkey(key);
    if (!def) return;
    const inst = this.backpack.find((it) => it.itemId === def.id);
    if (!inst) {
      this.texts.push({
        x: this.pl.x, y: this.pl.y - 88, vy: -44, life: 0.7, max: 0.7,
        text: `NO ${def.short}`, color: "#f87171", size: 11,
      });
      return;
    }
    this.backpack = removeItem(this.backpack, inst.id);
    this.invVer++;
    this.pl.useT = 0.5;
    switch (def.id) {
      case "bandage":
        this.pl.hp = Math.min(this.st.maxHp, this.pl.hp + this.st.maxHp * 0.4);
        break;
      case "grenade":
        this.throwGrenade();
        break;
      case "stim":
        this.stimT = 6;
        break;
    }
    this.sfx.upgrade();
    this.texts.push({
      x: this.pl.x, y: this.pl.y - 88, vy: -44, life: 0.8, max: 0.8,
      text: def.short, color: "#67e8f9", size: 12,
    });
  }

  private throwGrenade() {
    const p = this.pl;
    // tossed down the faced lane at a fixed range
    const speed = 260;
    const vx = this.facing * speed;
    this.grenades.push({ x: p.x, y: p.y, vx, vy: 0, fuse: 1.6 });
    this.sfx.shoot();
  }

  private updateGrenades(dt: number) {
    for (const g of this.grenades) {
      g.fuse -= dt;
      g.x += g.vx * dt;
      g.y += g.vy * dt;
      // Grenades despawn if they go out of bounds
      if (g.x < 0 || g.x > this.worldW) {
        g.fuse = -1;
        // detonate shortly after it actually lands, not wherever it happens
        // to be when the original flight fuse runs out — a grenade that's
        // still sailing through the air 460px from the thrower can't hit
        // anything its own blast radius could ever reach
        g.fuse = Math.min(g.fuse, 0.3);
      }
      if (chance(0.5))
        this.particles.push({ x: g.x, y: g.y, vx: R(-10, 10), vy: R(-10, 10), life: 0.2, max: 0.2, size: 1.6, color: "#9ca3af", grav: 0, add: false });
      if (g.fuse <= 0) this.explodeGrenade(g);
    }
    this.grenades = this.grenades.filter((g) => g.fuse > 0);
  }

  private explodeGrenade(g: GrenadeProj) {
    const blast = 130;
    for (const z of this.zombies) {
      if (z.dead) continue;
      // a grenade is loud regardless of range — wakes sleepers well past its blast radius
      if (z.dormant && Math.hypot(z.x - g.x, z.y - g.y) < blast * 2.5) this.wakeZombie(z, true);
      const d = Math.hypot(z.x - g.x, z.y - 34 * z.scale - g.y);
      if (d < blast) {
        const dmg = 140 * (1 - d / blast);
        z.hp -= dmg;
        z.flash = 0.09;
        const dir = Math.sign(z.x - g.x) || 1;
        z.vx += dir * 260;
        this.texts.push({ x: z.x, y: z.y - 74 * z.scale, vy: -60, life: 0.55, max: 0.55, text: String(Math.round(dmg)), color: "#fbbf24", size: 14 });
        if (z.hp <= 0) this.killZombie(z, dir);
      }
    }
    this.shake(8);
    this.sfx.hurt();
    for (let i = 0; i < 24; i++)
      this.particles.push({
        x: g.x, y: g.y, vx: R(-260, 260), vy: R(-260, 20), life: R(0.3, 0.7), max: 0.7,
        size: R(2, 6), color: chance(0.5) ? "#f97316" : "#fde68a", grav: 900, add: true,
      });
  }

  /** Repositions a backpack item; returns whether the target cell was legal. */
  moveBackpackItem(id: string, x: number, y: number): boolean {
    const moved = moveItem(BACKPACK_SIZE, this.backpack, shapeOfItem, id, x, y);
    if (!moved) return false;
    this.backpack = moved;
    this.invVer++;
    return true;
  }

  /** Moves the whole backpack into the persistent safe-house stash. */
  depositAll() {
    if (this.backpack.length === 0) return;
    this.deposit = [...this.deposit, ...this.backpack.map((it) => it.itemId)];
    this.backpack = [];
    this.invVer++;
    this.sfx.click();
  }

  getInventory(): InventorySnapshot {
    return {
      invVer: this.invVer,
      backpack: this.backpack.map((it) => ({ id: it.id, itemId: it.itemId, x: it.x, y: it.y })),
      deposit: this.deposit,
      backpackSize: BACKPACK_SIZE,
    };
  }

  /* ---------------- waves ---------------- */

  /** Shared enemy weight table for the wave spawner. */
  // Continuous ramps instead of hard power gates — the old thresholds (power
  // >=2/3/4) meant a player saw nothing but walkers for the first several
  // waves, since power only climbs slowly. Every type now has some presence
  // from wave 1, growing with power.
  private zombieWeights(power: number): Partial<Record<string, number>> {
    // Runners (speed 128) are the only fodder that can stay with a moving
    // player at all — everything else is slower than a walk. On a boss wave
    // the cap is raised so the crowd actually applies pressure instead of
    // trailing behind in a line.
    const boss = isBossWave(this.wave);
    return {
      walker: 1,
      runner: Math.min(boss ? 1.2 : 0.6, 0.16 + power * 0.05),
      spitter: Math.max(0, Math.min(0.4, (power - 0.5) * 0.08)),
      brute: Math.max(0, Math.min(boss ? 0.5 : 0.35, (power - 0.8) * 0.06)),
      screamer: SCREAMER_WEIGHT,
    };
  }

  private buildWave(power: number, wave: number): SpawnItem[] {
    const items: SpawnItem[] = [];
    const boss = isBossWave(wave);
    // position within the current 5-wave cycle adds its own escalation on top
    // of power, so each wave visibly spawns more than the last building up to
    // the boss, not just a slow difficulty drift.
    const cyclePos = ((wave - 1) % 5) + 1;
    // A boss wave's fodder runs at 0.85 of the ordinary curve — a step down,
    // since the boss is genuinely worth something, but no longer a discount
    // (a full-strength wave alongside a boss would just be unfair).
    const normal = Math.min(72, Math.round(6 + power * 3.0 + power * power * 0.12 + cyclePos * 1.6));
    const count = boss ? Math.round(normal * 0.85) : normal;
    const weights = this.zombieWeights(power);
    for (let i = 0; i < count; i++) items.push({ type: rollEnemy(weights) as ZType });
    // shuffle the fodder
    for (let i = items.length - 1; i > 0; i--) {
      const j = RI(0, i);
      [items[i], items[j]] = [items[j], items[i]];
    }
    // the boss itself is the real Juggernaut Alpha — spawned separately by
    // startWave(), never through the fodder queue
    return items;
  }

  /** Magnification actually in force. */
  private get zoom() {
    return this.zoomPref;
  }

  /** Width of the visible world window. Zooming in shows *less* world, so
   * every camera clamp measures against this rather than the canvas W. */
  private get viewW() {
    return W / this.zoom;
  }

  /** Magnification only. Whatever is drawn after this must already be in
   * camera-relative coordinates — which covers both styles used in render():
   * the `translate(-cam, camY)` blocks, and the draws that subtract `cam`
   * themselves (drawZombie/drawBoss/drawPlayer, the laser sight).
   *
   * Deliberately NOT scaled about the screen centre: `cam` is the world-x of
   * the visible window's LEFT EDGE, so a plain scale maps cam -> 0 and
   * cam + viewW -> W. Scaling about the centre instead puts the player in the
   * wrong place whenever the camera clamps at a world edge. */
  private applyZoom() {
    this.ctx.scale(this.zoom, this.zoom);
  }

  /** applyZoom() plus the camera pan — the full world-space transform. Scale
   * first: the pan is expressed in world units, so it has to be scaled too. */
  private camTransform(cam: number, camY: number) {
    this.applyZoom();
    this.ctx.translate(-cam, camY);
  }

  /** Starts the rest between waves. */
  private beginRest(breakDur: number) {
    this.phase = "break";
    this.breakT = breakDur;
    this.breakMax = breakDur;
  }


  private startWave(wave: number) {
    this.wave = wave;
    this.power = difficultyFor(wave);
    const boss = isBossWave(wave);
    this.queue = this.buildWave(this.power, wave);
    this.waveTotal = this.queue.length;
    this.phase = "active";
    this.spawnT = 0.6;
    this.boss = null;
    this.bossForceTarget = false;
    if (boss) {
      this.spawnBoss();
      const def = BOSS_DEFS.juggernaut;
      this.announce(def.tellName, def.tellSub);
    } else {
      this.announce(`WAVE ${wave}`, WAVE_SUBS[wave % WAVE_SUBS.length]);
    }
    this.sfx.wave();
  }

  /** Spawns the boss for a 5th-wave boss fight (always the Juggernaut — the
   * only boss currently implemented). */
  private spawnBoss() {
    const def = BOSS_DEFS.juggernaut;
    const hpMul = 1 + (this.power - 1) * 0.22;
    const maxHp = Math.round(150 * hpMul * 4.4 * 1.3 * def.hpMul);
    // rises just off-screen on one side, on the same ground line as everything else
    const side: 1 | -1 = chance(0.5) ? -1 : 1;
    const x = clamp(side < 0 ? this.cam - 200 : this.cam + W + 200, 40, this.worldW - 40);
    const y = GROUND;
    this.boss = {
      defId: def.id,
      x, y, r: def.r, scale: def.scale, dead: false,
      vx: 0, vy: 0, face: -side as 1 | -1, flash: 0, hurtT: 0,
      hp: maxHp, maxHp, phase: 0,
      state: "emerge", attack: null, timer: BOSS_EMERGE_DURATION, atk: 0,
      targetX: this.pl.x, targetY: this.pl.y, chargeX: 0, chargeY: 0,
      tint: Math.random(), wob: R(0, TAU), t: 0,
    };
    // a large grave splits open under the entrance point — drawn directly
    // (not pushed into `decor`) so it never gets a solid-collision radius
    // from DECOR_SOLID_R; a crater the player can't walk into would just
    // trap them against it
    this.bossGrave = { x, y };
    for (let i = 0; i < 24; i++) {
      const ang = R(0, TAU);
      this.particles.push({
        x, y, vx: Math.cos(ang) * R(40, 160), vy: Math.sin(ang) * R(40, 160),
        life: R(0.5, 1), max: 1, size: R(3, 6), color: "#1c1712", grav: 500, add: false,
      });
    }
    this.shake(9);
  }

  /** Called when a boss wave (every 5th) is cleared — this is the run's
   * checkpoint, the same beat the old per-stage clear screen hit. Freezes the
   * sim behind the BossClear/Loadout/SafeHouse screens. */
  private completeBossWave() {
    const cleared = this.wave;
    this.modals.add("bossclear");
    this.phase = "break";
    this.score += 500 * (cleared / 5);
    this.pl.hp = this.st.maxHp;
    // resupply: reserve tops up to 50% (not full)
    for (const id of WEAPON_IDS) {
      if (this.reserve[id] >= 0) this.reserve[id] = Math.max(this.reserve[id], Math.round(this.effWeapon(id).reserve * 0.5));
    }
    // a boss kill deserves a real supply drop — granted straight into the
    // backpack, since the Safe House screen right after is exactly where the
    // player will see it
    this.grantLoot(3);
    this.writeCheckpoint(cleared + 1);
    this.sfx.levelup();
    this.onEvent({ type: "bossclear", wave: cleared, next: cleared + 1 });
  }

  /** Player confirmed the BossClear/Loadout/SafeHouse screens. */
  continueAfterBoss() {
    if (!this.modals.has("bossclear")) return;
    this.modals.delete("bossclear");
    this.bullets = [];
    this.eshots = [];
    // full reload on every weapon — no carrying a half-empty mag into the next cycle
    for (const id of WEAPON_IDS) this.ammo[id] = this.effWeapon(id).mag;
    this.reloading = false;
    this.reloadT = 0;
    // a real countdown to settle in before the next 5-wave cycle starts
    this.beginRest(10);
    this.announce(`WAVE ${this.wave + 1}`, "the horde regroups", 2.8);
  }

  private mkZombie(type: ZType, x: number, y: number, hpMul: number, speedMul: number): Zombie {
    const c = ZCONF[type];
    const scale = c.scale * R(0.94, 1.07);
    const hp = c.hp * hpMul;
    return {
      x, y, vx: 0, vy: 0,
      hp, maxHp: hp,
      speed: c.speed * speedMul * R(0.9, 1.1),
      dmg: c.dmg, r: c.r * scale, scale,
      type, xp: c.xp, score: c.score,
      t: R(0, 10), atk: R(0, 0.4), flash: 0, face: 1, dead: false, spit: R(1, 2.4),
      tint: Math.random(), boss: false, wob: R(0, TAU), dormant: false,
      alertT: 0, burnT: 0, burnDps: 0,
    };
  }

  private spawnZombie(it: SpawnItem) {
    const power = this.power;
    const hpMul = (1 + (power - 1) * 0.22) * (it.boss ? 4.4 : 1);
    const speedMul = 1 + Math.min(0.55, (power - 1) * 0.035);
    const dmgMul = 1 + (power - 1) * 0.07;

    // Spawns from either edge of the lane, just past the visible window — a
    // uniform coin flip on which side, biased toward the direction the player
    // is actually moving so running one way isn't free forever. Clamped into
    // the world so a spawn near the world's own edge still lands on solid
    // ground instead of past it.
    const p = this.pl;
    const movingDir = p.vx > 40 ? 1 : p.vx < -40 ? -1 : 0;
    const ahead = movingDir !== 0 && chance(0.65);
    const side: 1 | -1 = ahead ? (movingDir as 1 | -1) : chance(0.5) ? 1 : -1;
    const x = clamp(
      side === 1 ? this.cam + this.viewW + R(20, 160) : this.cam - R(20, 160),
      22, this.worldW - 22
    );
    const y = GROUND;

    const z = this.mkZombie(it.type, x, y, hpMul, speedMul);
    z.dmg *= dmgMul;
    if (it.boss) {
      z.scale *= 1.32;
      z.r = 30 * z.scale;
      z.boss = true;
      z.xp = 16;
      z.score = 200;
      this.announce("SOMETHING BIG STIRS", "bring it down");
      this.shake(4);
    }
    z.face = x > this.pl.x ? -1 : 1;
    this.zombies.push(z);

    for (let i = 0; i < 8; i++)
      this.particles.push({
        x, y,
        vx: -side * R(30, 70),
        vy: R(-40, 40),
        life: R(0.3, 0.6), max: 0.6, size: R(2, 5), color: "#241d18", grav: 0, add: false
      });
  }

  /* ---------------- fx helpers ---------------- */

  private shake(m: number) {
    this.shakeMag = Math.min(16, this.shakeMag + m);
  }

  private announce(text: string, sub: string, dur = 2.2) {
    this.banners.push({ text, sub, t: dur, dur });
  }

  private updateBanner(dt: number) {
    if (this.banners.length > 0) {
      this.banners[0].t -= dt;
      if (this.banners[0].t <= 0) this.banners.shift();
    }
  }

  /* ---------------- hud ---------------- */

  getHud(): HudState {
    const p = this.pl;
    const nearCrate = this.crates.find((c) => !c.opened && this.isNearCrate(c)) ?? null;
    return {
      hp: Math.max(0, Math.ceil(p.hp)),
      maxHp: this.st.maxHp,
      xp: Math.round(p.xp),
      xpNext: p.xpNext,
      level: p.level,
      wave: this.wave,
      isBossWave: isBossWave(this.wave),
      waveTotal: this.waveTotal,
      remaining: this.queue.length + this.zombies.length,
      phase: this.phase,
      score: this.score,
      kills: this.kills,
      high: this.high,
      dashT: Math.max(0, p.dashCd),
      dashMax: this.st.dashMax,
      weapon: WDEF[this.kind].name,
      weaponRole: CLASS_ROLE[WDEF[this.kind].cls],
      weapons: CLASS_ORDER.map((cls, i) => {
        const ownedInClass = byClass(cls).filter((w) => this.owned.has(w));
        const active = this.equipped[cls] ?? ownedInClass[0];
        const shown = active ?? byClass(cls)[0];
        return {
          cls,
          label: CLASS_LABEL[cls],
          short: ownedInClass.length > 0 ? WDEF[shown].short : CLASS_LABEL[cls],
          owned: ownedInClass.length > 0,
          active: WDEF[this.kind].cls === cls,
          key: String(i + 1),
          ammo: this.ammo[shown] ?? 0,
          mag: this.effWeapon(shown).mag,
          variants: ownedInClass.length,
        };
      }),
      ammo: this.ammo[this.kind] ?? 0,
      mag: this.effWeapon(this.kind).mag,
      reserve: this.reserve[this.kind] ?? 0,
      autoFire: this.autoFire,
      facing: this.facing,
      onTarget: this.onTarget,
      range: this.effWeapon(this.kind).range,
      reloading: this.reloading,
      reloadPct: this.reloadDur > 0 ? 1 - this.reloadT / this.reloadDur : 0,
      paused: this.paused,
      muted: this.sfx.muted,
      playing: this.mode === "play" && !this.over,
      crateNear: nearCrate !== null,
      crateTier: nearCrate?.tier ?? 0,
      crateOpenPct: clamp(this.crateOpenT / 1.2, 0, 1),
      breakT: Math.max(0, this.breakT),
      breakMax: this.breakMax,
      bossActive: !!this.boss && !this.boss.dead,
      bossName: this.boss ? BOSS_DEFS[this.boss.defId].name : null,
      bossHp: this.boss?.hp ?? 0,
      bossHpMax: this.boss?.maxHp ?? 0,
      bossPhase: this.boss?.phase ?? 0,
      bossAttack: this.boss?.state === "windup" ? this.boss.attack : null,
      bossWindupPct: this.boss?.state === "windup" && this.boss.attack
        ? 1 - clamp(this.boss.timer / windupFor(this.boss.attack, this.boss.phase, BOSS_DEFS[this.boss.defId]), 0, 1)
        : 0,
      bossForceTarget: this.bossForceTarget,
    };
  }

  /* ================================================================== */
  /* RENDER                                                             */
  /* ================================================================== */

  private rr(x: number, y: number, w: number, h: number, r: number) {
    const c = this.ctx;
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  /** Draws gems/crates/zombies/player/bullets/grenades/enemy-shots/particles/
   * float-texts, cam-relative. */
  private drawEntities(cam: number, camY: number, t: number) {
    const c = this.ctx;
    c.save();
    this.camTransform(cam, camY);
    for (const g of this.gems) this.drawGem(g, t);
    for (const cr of this.crates) if (!cr.opened) this.drawCrate(cr, t);
    c.restore();

    // these three subtract `cam` themselves instead of drawing under a camera
    // transform, so they only need the magnification laid over the top
    c.save();
    this.applyZoom();
    for (const z of this.zombies) this.drawZombie(z, cam, camY, t);
    if (this.boss && !this.boss.dead) this.drawBoss(this.boss, cam, camY, t);
    if (this.mode === "play" && !this.over) this.drawPlayer(cam, camY, t);
    c.restore();

    c.save();
    this.camTransform(cam, camY);
    // bullets (additive tracers)
    c.globalCompositeOperation = "lighter";
    for (const b of this.bullets) {
      c.strokeStyle = b.crit ? "rgba(251,191,36,0.95)" : "rgba(253,230,138,0.85)";
      c.lineWidth = b.crit ? 3.4 : 2.4;
      c.beginPath();
      c.moveTo(b.x - b.vx * 0.016, b.y - b.vy * 0.016);
      c.lineTo(b.x, b.y);
      c.stroke();
      c.fillStyle = "#fff7d6";
      c.beginPath();
      c.arc(b.x, b.y, b.crit ? 2.6 : 1.8, 0, TAU);
      c.fill();
    }
    c.globalCompositeOperation = "source-over";
    // thrown grenades
    for (const g of this.grenades) {
      const spin = t * 14;
      c.save();
      c.translate(g.x, g.y);
      c.rotate(spin);
      c.fillStyle = g.fuse < 0.35 ? (Math.sin(t * 40) > 0 ? "#f87171" : "#7f1d1d") : "#3f6212";
      c.beginPath();
      c.arc(0, 0, 4, 0, TAU);
      c.fill();
      c.restore();
    }
    // enemy shots
    for (const s of this.eshots) {
      const gr = c.createRadialGradient(s.x, s.y, 0, s.x, s.y, 12);
      gr.addColorStop(0, "rgba(190,242,100,0.95)");
      gr.addColorStop(0.4, "rgba(132,204,22,0.5)");
      gr.addColorStop(1, "rgba(132,204,22,0)");
      c.fillStyle = gr;
      c.fillRect(s.x - 12, s.y - 12, 24, 24);
      c.fillStyle = "#d9f99d";
      c.beginPath();
      c.arc(s.x, s.y, 3.4, 0, TAU);
      c.fill();
    }
    c.restore();

    /* --- particles --- */
    c.save();
    this.camTransform(cam, camY);
    let additive = false;
    for (const q of this.particles) {
      if (q.add !== additive) {
        c.globalCompositeOperation = q.add ? "lighter" : "source-over";
        additive = q.add;
      }
      const a = clamp(q.life / q.max, 0, 1);
      c.globalAlpha = a * (q.add ? 0.8 : 1);
      c.fillStyle = q.color;
      c.beginPath();
      c.arc(q.x, q.y, q.size * (0.5 + 0.5 * a), 0, TAU);
      c.fill();
    }
    c.globalAlpha = 1;
    c.globalCompositeOperation = "source-over";
    c.restore();

    /* --- float texts --- */
    c.save();
    this.camTransform(cam, camY);
    c.textAlign = "center";
    for (const ft of this.texts) {
      const a = clamp(ft.life / ft.max, 0, 1);
      c.globalAlpha = a;
      c.font = `700 ${ft.size}px "Space Grotesk", sans-serif`;
      c.fillStyle = ft.color;
      c.fillText(ft.text, ft.x, ft.y);
    }
    c.restore();
  }

  private render() {
    const c = this.ctx;
    const t = this.tGlobal;
    const cam = this.cam + this.shakeX;
    // draw code uses the "py = worldY + camY" convention (see drawPlayer/
    // drawZombie/drawBoss). A side view never pans vertically, but `camY`
    // still has to cancel out zoom's scale — applyZoom() scales the whole
    // canvas about its origin, so without this offset GROUND would render at
    // GROUND*zoom instead of staying pinned at a fixed screen height (the
    // same reason `cam` is centered on viewW/2, not W/2).
    const camY = GROUND / this.zoom - GROUND + this.shakeY;

    c.clearRect(0, 0, W, H);

    // the player's actual screen position — usually screen-centered, but the
    // camera clamps at world edges (see cam/camY assignments), so anything
    // meant to track the player (light pool, vignette, flashlight cone) has
    // to use this, not a hardcoded W/2,H/2, or it visibly detaches near edges
    // zoom is applied about the screen centre, so these full-screen effects —
    // which are drawn untransformed — have to project the player themselves
    // rather than just subtracting the camera
    const zf = this.zoom;
    const px = (this.pl.x - cam) * zf;
    const py = (this.pl.y + camY) * zf;

    /* --- sky (per-stage theme) --- */
    const theme = this.theme;
    const sky = c.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, theme.skyTop);
    sky.addColorStop(0.5, theme.skyMid);
    sky.addColorStop(0.82, theme.skyHorizon);
    sky.addColorStop(1, theme.skyBottom);
    c.fillStyle = sky;
    c.fillRect(0, 0, W, H);

    /* --- parallax skyline: two silhouette layers, slower than the world --- */
    this.drawSkyline(cam, 0.18, theme.groundMid, false);
    this.drawSkyline(cam, 0.42, theme.groundDeep, true);

    /* --- ground band (gradient) --- */
    const gg = c.createLinearGradient(0, GROUND, 0, H);
    gg.addColorStop(0, theme.groundTop);
    gg.addColorStop(0.15, theme.groundMid);
    gg.addColorStop(1, theme.groundDeep);
    c.fillStyle = gg;
    c.fillRect(0, GROUND, W, H - GROUND);

    c.save();
    this.camTransform(cam, camY);
    // visible world-space x bounds, inverse of the translate above
    const wx0 = cam - 80, wx1 = cam + W + 80;

    // tiled floor texture, a couple of tile-rows deep under the ground line.
    // Variant per tile comes from hashing its coordinates, so the layout is a
    // pure function of position — no per-tile state, identical across a reload.
    const gt = groundTheme(theme.id);
    const t0x = Math.floor(wx0 / TILE_UNITS), t1x = Math.floor(wx1 / TILE_UNITS);
    const t0y = Math.floor((GROUND - 6) / TILE_UNITS), t1y = Math.floor((H + 40) / TILE_UNITS);
    for (let ty = t0y; ty <= t1y; ty++) {
      for (let tx = t0x; tx <= t1x; tx++) {
        c.drawImage(
          this.atlas.tile(gt, tileVariant(tx, ty)),
          tx * TILE_UNITS, ty * TILE_UNITS, TILE_UNITS, TILE_UNITS
        );
      }
    }
    // the top edge of the ground, a bright seam everything stands on
    c.strokeStyle = "rgba(74,124,82,0.5)";
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(wx0, GROUND + 0.5);
    c.lineTo(wx1, GROUND + 0.5);
    c.stroke();

    // ground tufts, rooted along the ground line
    c.strokeStyle = "rgba(52,84,56,0.7)";
    c.lineWidth = 1.4;
    for (const tu of this.tufts) {
      if (tu.x < wx0 || tu.x > wx1) continue;
      const sway = Math.sin(t * 1.4 + tu.x) * 1.4;
      c.beginPath();
      c.moveTo(tu.x, GROUND + 1);
      c.quadraticCurveTo(tu.x + sway, GROUND - tu.h * 0.6, tu.x - 3 * tu.s + sway, GROUND - tu.h);
      c.moveTo(tu.x + 4, GROUND + 1);
      c.quadraticCurveTo(tu.x + 4 + sway, GROUND - tu.h * 0.5, tu.x + 7 * tu.s + sway, GROUND - tu.h * 0.8);
      c.stroke();
    }

    // blood decals, flat pools at the ground line
    for (const d of this.decals) {
      if (d.x < wx0 || d.x > wx1) continue;
      c.fillStyle = `rgba(80,14,18,${d.a})`;
      c.beginPath();
      c.ellipse(d.x, GROUND + 4, 18 * d.s, 4.5 * d.s, 0, 0, TAU);
      c.fill();
      c.fillStyle = `rgba(60,10,12,${d.a * 0.8})`;
      c.beginPath();
      c.ellipse(d.x + 12 * d.s, GROUND + 7, 8 * d.s, 2.5 * d.s, 0, 0, TAU);
      c.fill();
    }

    // the boss's grave — a lasting scar at the ground line, drawn flat like
    // the blood decals above rather than through the decor/collision system
    // (see spawnBoss())
    if (this.bossGrave) {
      const g = this.bossGrave;
      c.fillStyle = "rgba(10,8,6,0.75)";
      c.beginPath();
      c.ellipse(g.x, GROUND + 3, 46, 9, 0, 0, TAU);
      c.fill();
      c.strokeStyle = "rgba(60,50,40,0.5)";
      c.lineWidth = 2;
      for (let i = 0; i < 5; i++) {
        const ang = (i / 5) * TAU + g.x * 0.01;
        c.beginPath();
        c.moveTo(g.x + Math.cos(ang) * 20, GROUND + Math.sin(ang) * 4);
        c.lineTo(g.x + Math.cos(ang) * 54, GROUND + Math.sin(ang) * 10);
        c.stroke();
      }
    }

    // decor, standing on the ground line
    for (const d of this.decor) {
      if (d.x < wx0 || d.x > wx1) continue;
      this.drawDecor(d, t);
    }
    c.restore();

    /* --- vignette (darkness at the screen edges) --- */
    const vg = c.createRadialGradient(px, py, H * 0.35, px, py, H * 0.9);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.45)");
    c.fillStyle = vg;
    c.fillRect(0, 0, W, H);

    /* --- gems / crates / zombies / player / projectiles --- */
    this.drawEntities(cam, camY, t);

    /* --- foreground fog wisps --- */
    for (let i = 0; i < 2; i++) {
      const fx = W - ((t * (10 + i * 5) + i * 640) % (W + 560)) + 280 - 280;
      const fg = c.createRadialGradient(fx, GROUND + 40, 0, fx, GROUND + 40, 200);
      fg.addColorStop(0, "rgba(148,163,184,0.045)");
      fg.addColorStop(1, "rgba(148,163,184,0)");
      c.fillStyle = fg;
      c.fillRect(fx - 200, GROUND - 80, 400, 240);
    }

    /* --- hurt / low-hp vignette --- */
    if (this.mode === "play" && !this.over) {
      const pct = this.pl.hp / this.st.maxHp;
      const lowHp = pct < 0.32 ? (0.32 - pct) * (1.4 + 0.5 * Math.sin(t * 5.5)) : 0;
      const a = clamp(this.pl.hurtT * 0.3 + lowHp, 0, 0.5);
      if (a > 0.01) {
        const hg = c.createRadialGradient(px, py, H * 0.32, px, py, H * 0.72);
        hg.addColorStop(0, "rgba(153,27,27,0)");
        hg.addColorStop(1, `rgba(127,20,20,${a})`);
        c.fillStyle = hg;
        c.fillRect(0, 0, W, H);
      }
      // dash ghost cooldown glow at player feet
      if (this.pl.dashCd <= 0 && this.paused === false && this.modalOpen === false) {
        c.save();
        this.applyZoom();
        c.translate(this.pl.x - cam, this.pl.y + 16 + camY);
        c.globalAlpha = 0.12 + 0.08 * Math.sin(t * 4);
        c.fillStyle = "#67e8f9";
        c.beginPath();
        c.ellipse(0, 0, 22, 4.5, 0, 0, TAU);
        c.fill();
        c.restore();
      }
    }

    /* --- LASER SIGHT (effective range indicator) --- */
    if (this.mode === "play" && !this.over && !this.reloading) {
      const p = this.pl;
      const w = this.effWeapon(this.kind);
      const range = w.range * (1 + 0.12 * (this.stacks["velo"] || 0));
      // the beam is a world-space distance, so it magnifies with everything else.
      // Origin at chest height, same as the gun sprite and the real bullet
      // spawn point in fire() — p.y alone is the player's feet.
      c.save();
      this.applyZoom();
      const ox = p.x - cam + Math.cos(p.aim) * 20;
      const oy = p.y - CHEST_H + camY + Math.sin(p.aim) * 20;
      const ex = ox + Math.cos(p.aim) * range;
      const ey = oy + Math.sin(p.aim) * range;
      const hot = this.onTarget;
      const flash = Math.max(0, this.laserFlash);
      c.save();
      c.globalCompositeOperation = "lighter";
      // outer glow beam
      c.strokeStyle = hot
        ? `rgba(255,60,60,${0.5 + 0.3 * Math.sin(t * 18) + flash})`
        : "rgba(255,40,40,0.16)";
      c.lineWidth = hot ? 3.2 : 1.6;
      c.beginPath();
      c.moveTo(ox, oy);
      c.lineTo(ex, ey);
      c.stroke();
      // bright core
      c.strokeStyle = hot ? "rgba(255,220,220,0.95)" : "rgba(255,120,120,0.3)";
      c.lineWidth = hot ? 1.3 : 0.7;
      c.beginPath();
      c.moveTo(ox, oy);
      c.lineTo(ex, ey);
      c.stroke();
      // range terminator tick
      c.strokeStyle = hot ? "rgba(255,90,90,0.9)" : "rgba(255,60,60,0.35)";
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(ex - Math.sin(p.aim) * 7, ey + Math.cos(p.aim) * 7);
      c.lineTo(ex + Math.sin(p.aim) * 7, ey - Math.cos(p.aim) * 7);
      c.stroke();
      // dot on the locked target's body centre, same height p.aim actually targets
      if (hot && this.target) {
        const tx = this.target.x - cam;
        const ty = this.target.y - this.target.r + camY;
        c.fillStyle = "rgba(255,70,70,0.9)";
        c.beginPath();
        c.arc(tx, ty, 3.5 + Math.sin(t * 20) * 1.2, 0, TAU);
        c.fill();
        c.strokeStyle = "rgba(255,120,120,0.7)";
        c.lineWidth = 1.4;
        c.beginPath();
        c.arc(tx, ty, 11 + Math.sin(t * 12) * 1.6, 0, TAU);
        c.stroke();
      }
      c.restore();
      c.restore(); // the magnification opened above
    }

    /* --- reload ring above player --- */
    if (this.mode === "play" && !this.over && this.reloading) {
      const rx = this.pl.x - cam;
      const ry = this.pl.y - 96 + camY;
      const pct = this.reloadDur > 0 ? 1 - this.reloadT / this.reloadDur : 0;
      c.save();
      c.lineCap = "round";
      c.strokeStyle = "rgba(0,0,0,0.5)";
      c.lineWidth = 4.5;
      c.beginPath();
      c.arc(rx, ry, 13, 0, TAU);
      c.stroke();
      c.strokeStyle = "#fbbf24";
      c.lineWidth = 3.4;
      c.beginPath();
      c.arc(rx, ry, 13, -Math.PI / 2, -Math.PI / 2 + TAU * pct);
      c.stroke();
      c.textAlign = "center";
      c.font = '700 11px "Space Grotesk", sans-serif';
      c.fillStyle = "#fde68a";
      c.fillText("RELOAD", rx, ry + 25);
      c.restore();
    }

    /* --- low / empty ammo warning --- */
    if (this.mode === "play" && !this.over && !this.reloading) {
      const cur = this.ammo[this.kind] ?? 0;
      const mag = this.effWeapon(this.kind).mag;
      if (cur === 0) {
        c.save();
        c.textAlign = "center";
        c.globalAlpha = 0.6 + 0.4 * Math.sin(t * 9);
        c.font = '700 15px "Space Grotesk", sans-serif';
        c.fillStyle = "#f87171";
        (c as unknown as { letterSpacing: string }).letterSpacing = "3px";
        c.fillText("PRESS R TO RELOAD", this.pl.x - cam, this.pl.y - 96 + camY);
        (c as unknown as { letterSpacing: string }).letterSpacing = "0px";
        c.restore();
      } else if (cur / mag <= 0.25) {
        c.save();
        c.textAlign = "center";
        c.globalAlpha = 0.45 + 0.3 * Math.sin(t * 6);
        c.font = '700 13px "Space Grotesk", sans-serif';
        c.fillStyle = "#fbbf24";
        c.fillText("LOW AMMO", this.pl.x - cam, this.pl.y - 96 + camY);
        c.restore();
      }
    }

    /* --- banner --- */
    if (this.banners.length > 0) this.drawBanner(this.banners[0]);

    /* --- next wave countdown --- */
    if (this.mode === "play" && !this.over && this.phase === "break" && !this.modalOpen && this.wave > 0) {
      c.textAlign = "center";
      c.font = '600 15px "Space Grotesk", sans-serif';
      c.fillStyle = "rgba(226,232,240,0.55)";
      (c as unknown as { letterSpacing: string }).letterSpacing = "4px";
      c.fillText(`NEXT WAVE IN ${Math.max(1, Math.ceil(this.breakT))}`, W / 2, H - 48);
      (c as unknown as { letterSpacing: string }).letterSpacing = "0px";
    }

    /* --- debug overlay (?debug=1) --- */
    if (this.debug) {
      c.save();
      c.textAlign = "left";
      c.font = '600 11px monospace';
      c.fillStyle = "#4ade80";
      c.fillText(
        `wave:${this.wave} phase:${this.phase} power:${this.power.toFixed(1)} metaLv:${this.profile.metaLevel}`,
        8, H - 8
      );
      c.restore();
    }
  }

  private drawBanner(b: Banner) {
    const c = this.ctx;
    const p = 1 - b.t / b.dur;
    const a = p < 0.12 ? p / 0.12 : p > 0.72 ? (1 - p) / 0.28 : 1;
    const s = 1 + (1 - Math.min(1, p * 7)) * 0.35;
    c.save();
    c.translate(W / 2, 208);
    c.scale(s, s);
    c.globalAlpha = clamp(a, 0, 1);
    c.textAlign = "center";
    (c as unknown as { letterSpacing: string }).letterSpacing = "10px";
    c.font = "400 58px Anton, sans-serif";
    c.shadowColor = "rgba(245,158,11,0.5)";
    c.shadowBlur = 30;
    c.fillStyle = "#f4efe6";
    c.fillText(b.text, 0, 0);
    c.shadowBlur = 0;
    c.font = '600 17px "Space Grotesk", sans-serif';
    (c as unknown as { letterSpacing: string }).letterSpacing = "5px";
    c.fillStyle = "#f59e0b";
    c.fillText(b.sub.toUpperCase(), 0, 36);
    (c as unknown as { letterSpacing: string }).letterSpacing = "0px";
    c.restore();
  }

  /**
   * A repeating skyline silhouette, one rectangle "building" per slot along x.
   * Height/width per slot come from a cheap deterministic hash (sin/cos of the
   * slot index) rather than stored state, so the skyline never has to be
   * regenerated or persisted — it's a pure function of world position, same
   * idea as `tileVariant`. `parallax` < 1 scrolls the layer slower than the
   * world, which is what sells the depth between a far and a near layer. */
  private drawSkyline(cam: number, parallax: number, color: string, near: boolean) {
    const c = this.ctx;
    const slot = near ? 130 : 190;
    const camP = cam * parallax;
    const x0 = Math.floor((camP - 100) / slot) * slot;
    const x1 = camP + W + 100;
    c.save();
    c.translate(-camP, 0);
    c.fillStyle = color;
    for (let x = x0; x < x1; x += slot) {
      const i = Math.round(x / slot);
      const seed = i * (near ? 12.9898 : 7.233) + (near ? 3.1 : 9.7);
      const frac = (v: number) => v - Math.floor(v);
      const h = (near ? 70 : 40) + frac(Math.sin(seed) * 43758.5453) * (near ? 170 : 110);
      const w = slot * (0.55 + frac(Math.cos(seed * 1.7) * 12345.678) * 0.35);
      c.fillRect(x, GROUND - h, w, h + 40);
    }
    c.restore();
  }

  /**
   * One decor prop, standing on the ground line — one atlas blit, plus the two
   * effects that can't be baked into a sprite because they're state-driven:
   * the contact shadow and the lamp's flicker.
   */
  private drawDecor(d: Decor, t: number) {
    const c = this.ctx;
    const [hw, hh] = this.atlas.propHalf(d.kind);
    const fullH = hh * 2;

    if (d.kind === 3) {
      // lamp glow, near the top of the pole rather than the prop's centre —
      // from the pre-baked glow rather than a fresh createRadialGradient per
      // lamp per frame
      const flick = 0.75 + 0.25 * Math.sin(t * 9 + d.ph) * Math.sin(t * 3.7 + d.ph);
      c.save();
      c.globalAlpha = flick;
      c.drawImage(this.atlas.glow("rgba(251,146,60,0.5)"), d.x - 46 + hw, d.y - fullH - 14, 92, 92);
      c.restore();
    } else {
      // contact shadow, flat on the ground under the prop's footprint
      c.fillStyle = "rgba(0,0,0,0.35)";
      c.beginPath();
      c.ellipse(d.x, d.y + 2, hw * 0.9, 3.5, 0, 0, TAU);
      c.fill();
    }

    // anchored by its bottom edge — every prop stands on the ground line
    c.drawImage(this.atlas.prop(d.kind, d.v), d.x - hw, d.y - fullH, hw * 2, fullH);
  }

  private static readonly GEM_PALETTE: Record<Gem["kind"], [string, string, string, string]> = {
    xp: ["rgba(167,139,250,0.5)", "rgba(167,139,250,0)", "#c4b5fd", "#ede9fe"],
    scrap: ["rgba(148,163,184,0.5)", "rgba(148,163,184,0)", "#cbd5e1", "#f1f5f9"],
  };

  private drawGem(g: Gem, t: number) {
    const c = this.ctx;
    const bob = Math.sin(t * 3 + g.t) * 2.5;
    const y = g.rest || g.vy === 0 ? g.y + bob : g.y;
    const s = 3.5 + Math.min(3, g.val);
    const [glowA, glowB, fill, core] = Engine.GEM_PALETTE[g.kind];
    // fade out over the last 2s before it despawns, so vanishing never looks
    // like a pop — same idea as any other timed-life effect in this file
    const fadeStart = GEM_LIFETIME - 2;
    c.save();
    if (g.age > fadeStart) c.globalAlpha = Math.max(0, 1 - (g.age - fadeStart) / 2);
    c.globalCompositeOperation = "lighter";
    const gr = c.createRadialGradient(g.x, y, 0, g.x, y, s * 4);
    gr.addColorStop(0, glowA);
    gr.addColorStop(1, glowB);
    c.fillStyle = gr;
    c.fillRect(g.x - s * 4, y - s * 4, s * 8, s * 8);
    c.globalCompositeOperation = "source-over";
    c.fillStyle = fill;
    c.beginPath();
    c.moveTo(g.x, y - s);
    c.lineTo(g.x + s * 0.8, y);
    c.lineTo(g.x, y + s);
    c.lineTo(g.x - s * 0.8, y);
    c.closePath();
    c.fill();
    c.fillStyle = core;
    c.beginPath();
    c.moveTo(g.x, y - s * 0.5);
    c.lineTo(g.x + s * 0.35, y);
    c.lineTo(g.x, y + s * 0.5);
    c.lineTo(g.x - s * 0.35, y);
    c.closePath();
    c.fill();
    c.restore();
  }

  private drawCrate(cr: Crate, t: number) {
    const c = this.ctx;
    const tierColor = cr.tier === 3 ? "#fbbf24" : cr.tier === 2 ? "#a78bfa" : "#94a3b8";
    const bob = Math.sin(t * 2 + cr.x) * 1.5;
    c.save();
    c.translate(cr.x, cr.y - 12 + bob);
    // shadow
    c.fillStyle = "rgba(0,0,0,0.4)";
    c.beginPath();
    c.ellipse(0, 14, 16, 4, 0, 0, TAU);
    c.fill();
    // crate body
    c.fillStyle = "#3f2a18";
    this.rr(-15, -14, 30, 28, 3);
    c.fill();
    c.strokeStyle = tierColor;
    c.lineWidth = 2;
    this.rr(-15, -14, 30, 28, 3);
    c.stroke();
    // strap cross
    c.strokeStyle = "rgba(0,0,0,0.35)";
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(-15, 0); c.lineTo(15, 0);
    c.moveTo(0, -14); c.lineTo(0, 14);
    c.stroke();
    // tier pips
    for (let i = 0; i < cr.tier; i++) {
      c.fillStyle = tierColor;
      c.beginPath();
      c.arc(-6 + i * 6, -20, 2, 0, TAU);
      c.fill();
    }
    // glow
    c.globalCompositeOperation = "lighter";
    const glow = c.createRadialGradient(0, 0, 2, 0, 0, 30);
    glow.addColorStop(0, `${tierColor}33`);
    glow.addColorStop(1, `${tierColor}00`);
    c.fillStyle = glow;
    c.fillRect(-30, -30, 60, 60);
    c.globalCompositeOperation = "source-over";
    c.restore();
  }


  /** Zombie, standing on the ground line and facing left or right — a side
   * view, so only the two facings the pre-rendered art actually bakes. */
  private drawZombie(z: Zombie, cam: number, camY: number, t: number) {
    const c = this.ctx;
    const px = z.x - cam;
    if (px < -100 || px > W + 100) return;
    const py = z.y + camY;

    const type = z.type as ZSpriteType;
    const half = this.atlas.zombieHalf(type);
    const full = half * 2;
    const top = py - full;
    const mid = py - half;

    // soft contact shadow, flat on the ground under the feet
    c.fillStyle = "rgba(0,0,0,0.45)";
    c.beginPath();
    c.ellipse(px, py + 1, half * 0.7, half * 0.2, 0, 0, TAU);
    c.fill();

    // Facing: the sprite is pre-rendered for left/right, so pick whichever
    // matches the chase direction (or the last faced way, if idle) rather
    // than rotating the bitmap — ctx.rotate would resample the art and smear
    // the pixels it exists to keep crisp.
    const heading = Math.abs(z.vx) > 4 ? (z.vx > 0 ? 0 : Math.PI) : z.face >= 0 ? 0 : Math.PI;
    const dir = dirFor(heading, Z_DIRS);
    // shamble phase -> frame index, matching the old `z.t * (2.4 + speed*0.03)`
    const phase = z.dormant ? 0 : z.t * (2.4 + z.speed * 0.03);
    const frame = z.dormant ? 0 : Math.floor(phase / (Math.PI / 2)) % Z_FRAMES;
    // `tint` used to pick a flat body color; it now picks a whole body variant,
    // which varies a crowd without the per-instance scaling that would break
    // pixel alignment
    const variant = z.tint < 0.5 ? 0 : 1;

    const spr = this.atlas.zombie(type, variant, dir, frame);
    c.drawImage(spr, px - half, top, full, full);

    // hit flash — re-blit the same sprite forced to white, so the flash takes
    // the sprite's exact silhouette instead of an approximating oval
    if (z.flash > 0) {
      c.save();
      c.globalAlpha = clamp(z.flash * 9, 0, 0.85);
      c.drawImage(this.atlas.mask(spr), px - half, top, full, full);
      c.restore();
    }

    // eyes — the sprite bakes in a hostile stare, so the only thing left to
    // draw is the state the art can't carry: a dormant zombie's eyes are shut,
    // and a screamer's escalate once her windup starts
    if (!z.dormant) {
      const alert = z.boss || z.type === "brute" || (z.type === "screamer" && z.alertT > 0);
      if (alert) {
        c.save();
        c.globalCompositeOperation = "lighter";
        // sized to the head, not the body: a glow the width of a brute reads
        // as the whole zombie lighting up rather than its eyes catching you
        const hx = px + Math.cos(heading) * half * 0.3;
        const hy = top + full * 0.22;
        const er = half * 0.34;
        c.globalAlpha = 0.42;
        c.drawImage(this.atlas.glow("#ef4444"), hx - er, hy - er, er * 2, er * 2);
        c.restore();
      }
    } else {
      // shut eyes: darken the whole body so a sleeper doesn't give itself away.
      // A black silhouette at partial alpha does this without ctx.filter, which
      // is far too slow to run per zombie per frame.
      c.save();
      c.globalAlpha = 0.45;
      c.globalCompositeOperation = "source-atop";
      c.drawImage(spr, px - half, top, full, full);
      c.restore();
    }

    // spitter sac, glowing at the chest
    if (z.type === "spitter") {
      const pulse = 1 + Math.sin(t * 5 + z.wob) * 0.12;
      const gr = half * 0.7 * pulse;
      c.save();
      c.globalCompositeOperation = "lighter";
      c.globalAlpha = 0.55;
      c.drawImage(this.atlas.glow("#bef264"), px - gr, mid - gr, gr * 2, gr * 2);
      c.restore();
    }

    // boss crown of gore (finale-swarm tier, distinct from the unique Boss)
    if (z.boss) {
      c.save();
      c.fillStyle = "rgba(127,29,29,0.5)";
      c.beginPath();
      c.ellipse(px, mid, half * 0.95, half * 0.95, 0, 0, TAU);
      c.fill();
      c.restore();
    }

    // hp bar, clear above the sprite's head
    if (z.hp < z.maxHp) {
      const wBar = half * 1.2;
      const xBar = px - wBar / 2;
      const yBar = top - 6;
      c.fillStyle = "rgba(0,0,0,0.55)";
      c.fillRect(xBar, yBar, wBar, 3.4);
      c.fillStyle = z.boss ? "#f87171" : "#dc2626";
      c.fillRect(xBar, yBar, wBar * clamp(z.hp / z.maxHp, 0, 1), 3.4);
    }

    // sleeper tell — drifting zzz, the only hint it's dormant from a distance
    if (z.dormant) {
      c.save();
      c.textAlign = "center";
      c.font = '700 10px "Space Grotesk", sans-serif';
      c.fillStyle = "rgba(148,163,184,0.55)";
      for (let i = 0; i < 3; i++) {
        const ph = (t * 0.6 + i * 0.9) % 2.7;
        c.globalAlpha = clamp(1 - ph / 2.7, 0, 1) * 0.7;
        c.fillText("z", px + half * 0.5 + i * 3, top - 2 - ph * 10);
      }
      c.restore();
    }

    // Screamer windup tell — a tightening, faster-pulsing ring as the scream nears
    if (z.type === "screamer" && z.alertT > 0) {
      const pct = 1 - clamp(z.alertT / 1.4, 0, 1);
      c.save();
      c.globalAlpha = 0.3 + 0.4 * pct + 0.2 * Math.sin(t * (10 + pct * 20));
      c.strokeStyle = "#ef4444";
      c.lineWidth = 2;
      c.beginPath();
      c.arc(px, mid, half * (0.8 + pct * 0.3), 0, TAU);
      c.stroke();
      c.restore();
    }
  }
  private static readonly BOSS_TELL_COLOR: Record<BossAttack, string> = {
    slam: "#f97316", mortar: "#84cc16", call: "#c084fc", shieldcharge: "#38bdf8",
  };

  /** Ground telegraphs for the boss's windups — drawn under the boss so the tell reads clearly. */
  private drawBossTelegraphs(b: Boss, cam: number, camY: number) {
    if (b.state !== "windup" || !b.attack) return;
    const c = this.ctx;
    const def = BOSS_DEFS[b.defId];
    const pct = 1 - clamp(b.timer / windupFor(b.attack, b.phase, def), 0, 1);
    const color = Engine.BOSS_TELL_COLOR[b.attack];

    // Shield Charge telegraphs a LANE, not a circle — the counter-play is to
    // step out of the line, so the tell has to show where the line is. A ring
    // here would say "back away", which is the one thing that doesn't work.
    if (b.attack === "shieldcharge") {
      const dx = this.pl.x - b.x, dy = this.pl.y - b.y;
      const len = CHARGE_SPEED * CHARGE_TIME;
      const half = (b.r + 34) * (0.5 + 0.5 * pct);
      c.save();
      c.translate(b.x - cam, b.y + camY);
      c.rotate(Math.atan2(dy, dx));
      c.globalAlpha = 0.22 + 0.2 * Math.sin(pct * 18);
      c.fillStyle = color;
      c.fillRect(0, -half, len, half * 2);
      c.globalAlpha = 0.6;
      c.strokeStyle = color;
      c.lineWidth = 2;
      c.strokeRect(0, -half, len, half * 2);
      c.restore();
      return;
    }

    const isMortar = b.attack === "mortar";
    const cx = isMortar ? b.targetX - cam : b.x - cam;
    const cy = isMortar ? b.targetY + camY : b.y + camY;
    const radius = (isMortar ? 95 : b.attack === "slam" ? 150 : 0) * (0.35 + 0.65 * pct);
    if (radius > 0) {
      c.save();
      c.globalAlpha = 0.35 + 0.25 * Math.sin(pct * 18);
      c.strokeStyle = color;
      c.lineWidth = 3;
      c.beginPath();
      // full circle, seen from above — not the squashed side-view ellipse
      c.arc(cx, cy, radius, 0, TAU);
      c.stroke();
      c.restore();
    }
  }

  /**
   * Boss, standing on the ground line. The body is an atlas blit like the
   * player and the zombies; the emerge rise, the windup core glow and the hit
   * flash stay here because they are state, not art.
   */
  private drawBoss(b: Boss, cam: number, camY: number, t: number) {
    const c = this.ctx;
    const px = b.x - cam;
    if (px < -140 || px > W + 140) return;
    const py = b.y + camY;
    const def = BOSS_DEFS[b.defId];
    // rising out of its grave: starts small and faded, grows into place as the
    // emerge timer runs out — see spawnBoss()/updateBoss()
    const emergeT = b.state === "emerge" ? clamp(1 - b.timer / BOSS_EMERGE_DURATION, 0, 1) : 1;
    const visScale = 0.4 + 0.6 * emergeT;
    this.drawBossTelegraphs(b, cam, camY);

    c.fillStyle = "rgba(0,0,0,0.5)";
    c.beginPath();
    c.ellipse(px, py + 2, b.r * 0.9 * visScale, b.r * 0.24 * visScale, 0, 0, TAU);
    c.fill();

    const frame = b.state === "windup" ? 0 : Math.floor(b.t * 3.2) % BOSS_FRAMES;
    const spr = this.atlas.boss(b.defId, def.color, b.r, dirFor(Math.atan2(b.vy, b.vx), BOSS_DIRS), frame);
    const half = (spr.width * PX_SCALE) / 2 * visScale;
    const full = half * 2;
    const top = py - full;
    c.save();
    c.globalAlpha = 0.35 + 0.65 * emergeT;
    c.drawImage(spr, px - half, top, full, full);
    c.restore();

    // hit flash — the pre-baked white silhouette, never a ctx.filter
    if (b.flash > 0) {
      c.save();
      c.globalAlpha = clamp(b.flash * 9, 0, 0.8);
      c.drawImage(this.atlas.mask(spr), px - half, top, full, full);
      c.restore();
    }

    // windup core — brighter and faster the deeper into the telegraph
    const windupPct = b.state === "windup" && b.attack
      ? 1 - clamp(b.timer / windupFor(b.attack, b.phase, def), 0, 1) : 0;
    if (windupPct > 0) {
      const coreColor = b.attack ? Engine.BOSS_TELL_COLOR[b.attack] : "#ef4444";
      const coreR = (14 + windupPct * 12 + Math.sin(t * (6 + windupPct * 14)) * 2.5) * visScale;
      const coreY = top + full * 0.4;
      c.save();
      c.globalCompositeOperation = "lighter";
      c.globalAlpha = 0.5 + 0.4 * windupPct;
      c.drawImage(this.atlas.glow(coreColor), px - coreR, coreY - coreR, coreR * 2, coreR * 2);
      c.restore();
    }
  }


  /** Player, standing on the ground line: a body that faces the locked lane,
   * a gun that tilts with the aim (flat down the lane, or angled up slightly
   * at a locked target's head), and legs that scissor while running. */
  private drawPlayer(cam: number, camY: number, t: number) {
    const c = this.ctx;
    const p = this.pl;
    const px = p.x - cam;
    const py = p.y + camY;
    const chestY = py - CHEST_H;

    // soft contact shadow, pinned to the ground (not the jumping body) —
    // shrinks with height so it still reads as "directly below you"
    const groundPy = GROUND + camY;
    const airT = clamp((groundPy - py) / 140, 0, 1);
    const shadowScale = 1 - airT * 0.5;
    c.fillStyle = `rgba(0,0,0,${0.45 * (1 - airT * 0.6)})`;
    c.beginPath();
    c.ellipse(px, groundPy + 2, SOLDIER_HALF * 0.55 * shadowScale, SOLDIER_HALF * 0.16 * shadowScale, 0, 0, TAU);
    c.fill();

    c.save();
    if (p.ifr > 0) c.globalAlpha = 0.55 + 0.45 * Math.sin(t * 42);
    if (p.dashT > 0) c.globalAlpha = 0.82;

    // Body faces the locked lane; the gun tilts with the aim angle — the two
    // usually agree, but the gun alone tips up at a locked target's head.
    const vel = Math.abs(p.vx);
    const run = vel > 26 && p.grounded;
    const bodyDir = dirFor(this.facing === 1 ? 0 : Math.PI, DIRS);
    const frame = run ? Math.floor(p.walk / (Math.PI / 2)) % FRAMES : 0;

    const body = this.atlas.soldier(bodyDir, frame);
    const bs = SOLDIER_HALF * 2;
    const bodyTop = py - bs;
    c.drawImage(body, px - SOLDIER_HALF, bodyTop, bs, bs);

    const wcls = WDEF[this.kind].cls;
    const gun = this.atlas.gun(wcls, dirFor(p.aim, DIRS));
    const gs = GUN_HALF * 2;
    c.drawImage(gun, px - GUN_HALF, chestY - GUN_HALF, gs, gs);

    // hurt flash takes the sprite's own silhouette
    if (p.hurtT > 0) {
      c.save();
      c.globalAlpha = clamp(p.hurtT * 3, 0, 0.6);
      c.drawImage(this.atlas.mask(body), px - SOLDIER_HALF, bodyTop, bs, bs);
      c.restore();
    }
    c.restore();

    // ---- muzzle flash, at the real barrel tip ----
    // muzzleReach is in ART pixels; PX_SCALE converts to canvas units, so this
    // tracks whatever barrel length the sprite actually draws
    const reach = muzzleReach(wcls) * PX_SCALE;
    if (p.flash > 0) {
      const fa = clamp(p.flash * 16, 0, 1);
      const mx = px + Math.cos(p.aim) * reach;
      const my = chestY + Math.sin(p.aim) * reach;
      c.save();
      c.globalCompositeOperation = "lighter";
      const fg = c.createRadialGradient(mx, my, 0, mx, my, 24);
      fg.addColorStop(0, `rgba(254,240,138,${0.95 * fa})`);
      fg.addColorStop(0.4, `rgba(251,146,60,${0.55 * fa})`);
      fg.addColorStop(1, "rgba(251,146,60,0)");
      c.fillStyle = fg;
      c.fillRect(mx - 24, my - 24, 48, 48);
      c.strokeStyle = `rgba(254,240,138,${0.85 * fa})`;
      c.lineWidth = 2;
      c.beginPath();
      const ca = Math.cos(p.aim), sa = Math.sin(p.aim);
      c.moveTo(mx, my); c.lineTo(mx + ca * 14 * fa - sa * 6 * fa, my + sa * 14 * fa + ca * 6 * fa);
      c.moveTo(mx, my); c.lineTo(mx + ca * 16 * fa + sa * 5 * fa, my + sa * 16 * fa - ca * 5 * fa);
      c.moveTo(mx, my); c.lineTo(mx + ca * 10 * fa, my + sa * 10 * fa);
      c.stroke();
      c.restore();

      // muzzle world light
      c.save();
      c.globalCompositeOperation = "lighter";
      const lg = c.createRadialGradient(mx, my, 4, mx, my, 120);
      lg.addColorStop(0, `rgba(251,191,36,${0.16 * fa})`);
      lg.addColorStop(1, "rgba(251,191,36,0)");
      c.fillStyle = lg;
      c.fillRect(mx - 120, my - 120, 240, 240);
      c.restore();
    }
  }
}
