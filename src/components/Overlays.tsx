import type { GameStats, UpgradeChoice } from "../game/types";
import {
  Play, RotateCcw, Home, Trophy, Timer, Skull, TrendingUp, Volume2, VolumeX,
  Crosshair, Gauge, ChevronsRight, HeartPulse, Infinity as InfinityIcon, BookOpen, Settings as SettingsIcon,
  Maximize, Minimize, FastForward,
} from "lucide-react";
import { ICONS, RARITY_STYLE, MenuButton, StatBox } from "./ui";

/* ------------------------------------------------------------------ */

export function Menu({
  onEndless, onTutorial, onSettings, high, muted, onMute, touch = false,
  savedStage = null, onContinue,
  canFullscreen = false, fullscreen = false, onFullscreen,
}: {
  onEndless: () => void; onTutorial: () => void; onSettings: () => void;
  high: number; muted: boolean; onMute: () => void;
  /** swaps the keyboard hint row for the on-screen control equivalents */
  touch?: boolean;
  /** stage a saved run would resume at — null hides Continue entirely */
  savedStage?: number | null;
  onContinue?: () => void;
  /** hidden where the Fullscreen API isn't available (notably iPhone Safari) */
  canFullscreen?: boolean;
  fullscreen?: boolean;
  onFullscreen?: () => void;
}) {
  return (
    <div className="pointer-events-auto absolute inset-0 z-30 flex flex-col items-center justify-center overflow-y-auto bg-gradient-to-b from-black/60 via-transparent to-black/85 px-4 py-4">
      {/* stacked, not a row: each button is a 44px touch target in REAL pixels, so in
        * the layer's own 1280x720 units it grows as uiScale shrinks. A row of three
        * reaches far enough left on a small phone to clip the "D" of GRAVEYARD; a
        * column is only ever one button wide, so it clears the title at every size. */}
      <div className="absolute flex flex-col items-end gap-2 right-6 top-6">
        {canFullscreen && (
          <button
            onClick={onFullscreen}
            className="flex items-center justify-center rounded-lg border border-amber-400/30 bg-amber-500/10 text-amber-200 backdrop-blur-sm transition hover:border-amber-400/60 hover:text-white h-10 w-10"
            aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            title={fullscreen ? "Exit fullscreen" : "Fullscreen — bigger play area on a phone"}
          >
            {fullscreen ? <Minimize className="h-4.5 w-4.5" /> : <Maximize className="h-4.5 w-4.5" />}
          </button>
        )}
        <button
          onClick={onSettings}
          className="flex items-center justify-center rounded-lg border border-white/10 bg-black/50 text-white/70 backdrop-blur-sm transition hover:border-white/25 hover:text-white h-10 w-10"
          aria-label="Settings"
        >
          <SettingsIcon className="h-4.5 w-4.5" />
        </button>
        <button
          onClick={onMute}
          className="flex items-center justify-center rounded-lg border border-white/10 bg-black/50 text-white/70 backdrop-blur-sm transition hover:border-white/25 hover:text-white h-10 w-10"
          aria-label="Mute"
        >
          {muted ? <VolumeX className="h-4.5 w-4.5" /> : <Volume2 className="h-4.5 w-4.5" />}
        </button>
      </div>

      <div className="anim-rise mb-5 flex items-center gap-3 text-[13px] font-bold tracking-[0.5em] text-amber-400/90">
        <span className="h-px w-10 bg-amber-400/40" />
        THE DEAD DON'T SLEEP
        <span className="h-px w-10 bg-amber-400/40" />
      </div>

      <h1 className="anim-rise text-center font-display leading-[0.9]" style={{ animationDelay: "60ms" }}>
        <span className="title-outline anim-flicker block text-[7.5rem] tracking-[0.06em]">
          GRAVEYARD
        </span>
        <span className="title-blood anim-title-glow block text-[10rem] tracking-[0.08em]">
          SHIFT
        </span>
      </h1>

      <p className="anim-rise mt-5 max-w-md text-center text-base leading-relaxed text-zinc-400" style={{ animationDelay: "120ms" }}>
        The infected see nothing in the dark — only your laser sight, and the
        instant it crosses one, its tracking locks to you. Two lanes. One
        survivor. Every shot you fire tells them exactly where you are.
      </p>

      {savedStage != null && (
        <button
          onClick={onContinue}
          className="anim-rise group relative mt-9 flex items-center gap-3 overflow-hidden rounded-xl bg-gradient-to-b from-emerald-400 to-emerald-600 px-12 py-4 text-xl font-bold tracking-[0.25em] text-emerald-950 shadow-[0_0_50px_rgba(52,211,153,0.35)] transition-all duration-200 hover:scale-[1.04] hover:shadow-[0_0_70px_rgba(52,211,153,0.5)] active:scale-[0.98]"
          style={{ animationDelay: "180ms" }}
        >
          <FastForward className="h-5 w-5 transition-transform group-hover:translate-x-0.5" />
          CONTINUE · STAGE {savedStage}
        </button>
      )}

      <button
        onClick={onEndless}
        className={`anim-rise group relative flex items-center gap-3 overflow-hidden rounded-xl transition-all duration-200 hover:scale-[1.04] active:scale-[0.98] ${
          savedStage != null
            ? "mt-3 border border-white/12 bg-white/5 px-8 py-2.5 text-sm font-bold tracking-[0.2em] text-zinc-300 hover:border-white/30 hover:bg-white/10"
            : "mt-9 bg-gradient-to-b from-amber-400 to-amber-600 px-12 py-4 text-xl font-bold tracking-[0.25em] text-amber-950 shadow-[0_0_50px_rgba(245,158,11,0.35)] hover:shadow-[0_0_70px_rgba(245,158,11,0.5)]"
        }`}
        style={{ animationDelay: savedStage != null ? "210ms" : "180ms" }}
      >
        <InfinityIcon className={savedStage != null ? "h-4 w-4" : "h-5 w-5 transition-transform group-hover:translate-x-0.5"} />
        {savedStage != null ? "NEW RUN" : "ENDLESS MODE"}
      </button>

      <button
        onClick={onTutorial}
        className="anim-rise mt-3 flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-5 py-2 text-sm font-bold tracking-[0.18em] text-zinc-300 transition hover:border-white/25 hover:bg-white/10"
        style={{ animationDelay: "210ms" }}
      >
        <BookOpen className="h-4 w-4" />
        HOW TO PLAY
      </button>

      {high > 0 && (
        <div className="anim-rise mt-5 flex items-center gap-2 text-sm font-semibold tracking-widest text-zinc-500" style={{ animationDelay: "220ms" }}>
          <Trophy className="h-3.5 w-3.5 text-amber-400/80" />
          BEST SCORE {high.toLocaleString()}
        </div>
      )}

      <div className="anim-rise mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-[12px] font-semibold tracking-wider text-white/40" style={{ animationDelay: "260ms" }}>
        {touch ? (
          <>
            <span className="flex items-center gap-1.5"><span className="kbd">◄ ►</span> MOVE</span>
            <span className="flex items-center gap-1.5"><span className="kbd">◎</span> FIRE</span>
            <span className="flex items-center gap-1.5"><span className="kbd">⚡</span> DASH</span>
            <span className="flex items-center gap-1.5"><span className="kbd">✋</span> AUTO / MANUAL FIRE</span>
            <span className="flex items-center gap-1.5"><span className="kbd">TAP</span> WEAPON TO SWITCH</span>
          </>
        ) : (
          <>
            <span className="flex items-center gap-1.5"><span className="kbd">A</span><span className="kbd">D</span> MOVE</span>
            <span className="flex items-center gap-1.5"><span className="kbd">MOUSE</span> FIRE</span>
            <span className="flex items-center gap-1.5"><span className="kbd">SHIFT</span> DASH</span>
            <span className="flex items-center gap-1.5"><span className="kbd">1</span>-<span className="kbd">4</span> WEAPON CLASS</span>
            <span className="flex items-center gap-1.5"><span className="kbd">R</span> RELOAD</span>
            <span className="flex items-center gap-1.5"><span className="kbd">F</span> AUTO / MANUAL FIRE</span>
            <span className="flex items-center gap-1.5"><span className="kbd">ESC</span> PAUSE</span>
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function LevelUpModal({
  choices, level, onPick,
}: { choices: UpgradeChoice[]; level: number; onPick: (id: string) => void }) {
  return (
    <div className="pointer-events-auto absolute inset-0 z-40 flex items-center-safe justify-center overflow-y-auto bg-black/75 py-4 backdrop-blur-[6px]">
      <div className="anim-pop w-full max-w-3xl px-8">
        <div className="mb-2 text-center text-[13px] font-bold tracking-[0.5em] text-violet-300/80">
          LEVEL {level} REACHED
        </div>
        <h2 className="title-blood mb-1 text-center font-display text-5xl tracking-[0.1em]">
          CHOOSE AN UPGRADE
        </h2>
        <p className="mb-8 text-center text-sm tracking-widest text-zinc-500">
          PRESS 1 · 2 · 3 OR CLICK TO EQUIP
        </p>

        <div className="grid grid-cols-3 gap-5">
          {choices.map((u, i) => {
            const Icon = ICONS[u.icon] ?? Crosshair;
            const r = RARITY_STYLE[u.rarity];
            return (
              <button
                key={u.id}
                onClick={() => onPick(u.id)}
                className={`anim-rise group relative flex flex-col rounded-2xl border bg-zinc-950/90 p-6 text-left transition-all duration-200 hover:-translate-y-1.5 ${r.border} ${r.glow}`}
                style={{ animationDelay: `${i * 70}ms` }}
              >
                <div className="mb-4 flex items-center justify-between">
                  <div className={`rounded-md px-2 py-0.5 text-[11px] font-bold tracking-[0.2em] ${r.tag}`}>
                    {r.label}
                  </div>
                  <span className="kbd opacity-60">{i + 1}</span>
                </div>
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-amber-300 transition-colors group-hover:border-amber-300/40 group-hover:bg-amber-400/10">
                  <Icon className="h-7 w-7" />
                </div>
                <div className="text-lg font-bold tracking-wide text-zinc-100">{u.name}</div>
                <div className="mt-1.5 min-h-9 text-sm leading-relaxed text-zinc-400">{u.desc}</div>
                <div className="mt-4 flex gap-1">
                  {Array.from({ length: u.max }).map((_, j) => (
                    <span
                      key={j}
                      className={`h-1 flex-1 rounded-full ${
                        j < u.stacks ? "bg-amber-400" : j === u.stacks ? "bg-amber-400/40 animate-pulse" : "bg-white/10"
                      }`}
                    />
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function PauseMenu({
  onResume, onRestart, onQuit, muted, onMute, onSettings,
}: {
  onResume: () => void; onRestart: () => void; onQuit: () => void;
  muted: boolean; onMute: () => void; onSettings: () => void;
}) {
  return (
    <div className="pointer-events-auto absolute inset-0 z-40 flex items-center-safe justify-center overflow-y-auto bg-black/70 py-4 backdrop-blur-[6px]">
      <div className="anim-pop flex w-72 flex-col items-stretch gap-3">
        <h2 className="mb-3 text-center font-display text-4xl tracking-[0.2em] text-zinc-100">
          PAUSED
        </h2>
        <MenuButton primary onClick={onResume} icon={<Play className="h-4 w-4" fill="currentColor" />} label="RESUME" />
        <MenuButton onClick={onRestart} icon={<RotateCcw className="h-4 w-4" />} label="RESTART" />
        <MenuButton onClick={onSettings} icon={<SettingsIcon className="h-4 w-4" />} label="SETTINGS" />
        <MenuButton onClick={onQuit} icon={<Home className="h-4 w-4" />} label="MAIN MENU" />
        <MenuButton
          onClick={onMute}
          icon={muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          label={muted ? "UNMUTE" : "MUTE"}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function StageClear({
  stage, next, stageName, wavesPerStage, onContinue,
}: { stage: number; next: number; stageName: string; wavesPerStage: number; onContinue: () => void }) {
  return (
    <div className="pointer-events-auto absolute inset-0 z-40 flex items-center-safe justify-center overflow-y-auto bg-gradient-to-b from-emerald-950/30 via-black/80 to-black/90 py-4 backdrop-blur-[5px]">
      <div className="anim-pop flex w-full max-w-lg flex-col items-center px-8 text-center">
        <div className="anim-rise mb-3 flex items-center gap-3 text-[13px] font-bold tracking-[0.45em] text-emerald-300/80">
          <span className="h-px w-8 bg-emerald-400/40" />
          {wavesPerStage} / {wavesPerStage} WAVES SURVIVED
          <span className="h-px w-8 bg-emerald-400/40" />
        </div>
        <h2
          className="anim-rise font-display text-6xl tracking-[0.1em] text-emerald-300 drop-shadow-[0_0_34px_rgba(52,211,153,0.45)]"
          style={{ animationDelay: "60ms" }}
        >
          STAGE {stage} CLEAR
        </h2>
        <p className="anim-rise mt-2 text-lg font-semibold text-white" style={{ animationDelay: "90ms" }}>
          {stageName}
        </p>
        <p className="anim-rise mt-3 max-w-sm text-base leading-relaxed text-zinc-400" style={{ animationDelay: "120ms" }}>
          You held the line. Wounds patched, ammo scavenged — but the horde grows
          hungrier the deeper you go.
        </p>

        <div className="anim-rise mt-6 flex items-center gap-6" style={{ animationDelay: "170ms" }}>
          <div className="flex flex-col items-center">
            <div className="font-display text-4xl text-zinc-100">{stage}</div>
            <div className="text-[11px] font-bold tracking-[0.25em] text-zinc-500">CLEARED</div>
          </div>
          <ChevronsRight className="h-6 w-6 text-amber-400" />
          <div className="flex flex-col items-center">
            <div className="font-display text-4xl text-amber-300">{next}</div>
            <div className="text-[11px] font-bold tracking-[0.25em] text-amber-500/70">NEXT UP</div>
          </div>
        </div>

        <div className="anim-rise mt-5 flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-1.5 text-[13px] font-bold tracking-[0.2em] text-emerald-300" style={{ animationDelay: "200ms" }}>
          <HeartPulse className="h-3.5 w-3.5" />
          FULL HEAL + STAGE BONUS
        </div>

        <button
          onClick={onContinue}
          className="anim-rise mt-8 flex items-center gap-3 rounded-xl bg-gradient-to-b from-amber-400 to-amber-600 px-11 py-4 text-lg font-bold tracking-[0.22em] text-amber-950 shadow-[0_0_45px_rgba(245,158,11,0.35)] transition-all hover:scale-[1.04] active:scale-[0.98]"
          style={{ animationDelay: "250ms" }}
        >
          <Play className="h-5 w-5" fill="currentColor" />
          CONTINUE
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function GameOver({ stats, onRestart, onQuit }: { stats: GameStats; onRestart: () => void; onQuit: () => void }) {
  const mins = Math.floor(stats.time / 60);
  const secs = Math.floor(stats.time % 60);
  return (
    <div className="pointer-events-auto absolute inset-0 z-40 flex items-center-safe justify-center overflow-y-auto bg-gradient-to-b from-red-950/40 via-black/75 to-black/90 py-4 backdrop-blur-[4px]">
      <div className="anim-pop flex w-full max-w-md flex-col items-center px-8">
        <div className="anim-rise mb-2 flex h-16 w-16 items-center justify-center rounded-2xl border border-red-500/30 bg-red-950/50">
          <Skull className="h-8 w-8 text-red-400" />
        </div>
        <h2 className="anim-rise font-display text-6xl tracking-[0.12em] text-red-500 drop-shadow-[0_0_30px_rgba(220,38,38,0.5)]" style={{ animationDelay: "60ms" }}>
          OVERRUN
        </h2>
        <p className="anim-rise mt-2 text-sm tracking-[0.35em] text-zinc-500" style={{ animationDelay: "100ms" }}>
          THE HORDE TAKES ANOTHER
        </p>

        {stats.isBest && (
          <div className="anim-pop mt-4 flex items-center gap-2 rounded-full border border-amber-400/40 bg-amber-400/10 px-4 py-1.5 text-[13px] font-bold tracking-[0.25em] text-amber-300" style={{ animationDelay: "150ms" }}>
            <Trophy className="h-3.5 w-3.5" />
            NEW BEST SCORE
          </div>
        )}

        <div className="anim-rise mt-7 grid w-full grid-cols-3 gap-3" style={{ animationDelay: "180ms" }}>
          <StatBox icon={<TrendingUp className="h-4 w-4" />} label="STAGE" value={`${stats.stage}-${stats.wave}`} />
          <StatBox icon={<Skull className="h-4 w-4" />} label="KILLS" value={stats.kills.toLocaleString()} />
          <StatBox icon={<Timer className="h-4 w-4" />} label="TIME" value={`${mins}:${String(secs).padStart(2, "0")}`} />
          <StatBox icon={<Trophy className="h-4 w-4" />} label="SCORE" value={stats.score.toLocaleString()} accent />
          <StatBox icon={<Gauge className="h-4 w-4" />} label="LEVEL" value={String(stats.level)} />
          <StatBox icon={<Trophy className="h-4 w-4" />} label="BEST" value={stats.best.toLocaleString()} />
        </div>

        <div className="anim-rise mt-8 flex w-full gap-3" style={{ animationDelay: "240ms" }}>
          <button
            onClick={onRestart}
            className="flex flex-1 items-center justify-center gap-2.5 rounded-xl bg-gradient-to-b from-amber-400 to-amber-600 px-6 py-3.5 text-base font-bold tracking-[0.2em] text-amber-950 shadow-[0_0_40px_rgba(245,158,11,0.35)] transition-all hover:scale-[1.03] active:scale-[0.98]"
          >
            <RotateCcw className="h-4 w-4" />
            RETRY
          </button>
          <button
            onClick={onQuit}
            className="flex flex-1 items-center justify-center gap-2.5 rounded-xl border border-white/10 bg-white/5 px-6 py-3.5 text-base font-bold tracking-[0.2em] text-zinc-200 transition-all hover:border-white/25 hover:bg-white/10 active:scale-[0.98]"
          >
            <Home className="h-4 w-4" />
            MENU
          </button>
        </div>
      </div>
    </div>
  );
}
