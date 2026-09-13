import { useEffect } from "react";
import { ArrowLeft, ArrowRight, ArrowUp, Zap, Hand, Bot, Crosshair } from "lucide-react";

interface Props {
  /** presses/releases a virtual keyboard key — same effect as the real key */
  onPressKey: (code: string) => void;
  onReleaseKey: (code: string) => void;
  onDash: () => void;
  onJump: () => void;
  onFireStart: () => void;
  onFireEnd: () => void;
  /** held-E equivalent: crate open / boss force-target */
  showInteract: boolean;
  onInteractStart: () => void;
  onInteractEnd: () => void;
  /** dash cooldown is done — tints the Dash button instead of a separate
   * status readout, since that would sit right where these buttons are */
  dashReady: boolean;
  /** auto vs manual trigger — Hud hides its own toggle on touch (same
   * bottom-right corner these buttons occupy) so this is its only control */
  autoFire: boolean;
  onToggleFireMode: () => void;
}

const btnClass =
  "flex items-center justify-center rounded-full border border-white/10 bg-black/50 text-white/80 backdrop-blur-sm active:bg-white/20 active:text-white touch-none select-none";

/** One directional hold-button: presses a virtual key on pointerdown, releases
 * it on pointerup/cancel/leave — a plain D-pad half, not an analog stick. */
function DirButton({
  code, label, icon, onPressKey, onReleaseKey,
}: {
  code: string;
  label: string;
  icon: React.ReactNode;
  onPressKey: (code: string) => void;
  onReleaseKey: (code: string) => void;
}) {
  useEffect(() => () => onReleaseKey(code), [code, onReleaseKey]);
  return (
    <button
      className={`${btnClass} h-20 w-20`}
      onPointerDown={(e) => {
        e.preventDefault();
        onPressKey(code);
      }}
      onPointerUp={() => onReleaseKey(code)}
      onPointerCancel={() => onReleaseKey(code)}
      onPointerLeave={() => onReleaseKey(code)}
      aria-label={label}
    >
      {icon}
    </button>
  );
}

export default function TouchControls({
  onPressKey,
  onReleaseKey,
  onDash,
  onJump,
  onFireStart,
  onFireEnd,
  showInteract,
  onInteractStart,
  onInteractEnd,
  dashReady,
  autoFire,
  onToggleFireMode,
}: Props) {
  useEffect(() => {
    return () => {
      onFireEnd();
      onInteractEnd();
    };
  }, [onFireEnd, onInteractEnd]);

  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      {/* left: move — two hold-buttons instead of a joystick, straight left or right */}
      <div className="pointer-events-auto absolute bottom-10 left-10 flex items-center gap-3">
        <DirButton code="ArrowLeft" label="Move left" icon={<ArrowLeft className="h-9 w-9" />} onPressKey={onPressKey} onReleaseKey={onReleaseKey} />
        <DirButton code="ArrowRight" label="Move right" icon={<ArrowRight className="h-9 w-9" />} onPressKey={onPressKey} onReleaseKey={onReleaseKey} />
      </div>

      {/* interact — only shown near a crate/gate, mirrors held KeyE. Centered
       * above the move/fire buttons so it never sits under either thumb. */}
      {showInteract && (
        <div className="pointer-events-auto absolute bottom-56 left-1/2 -translate-x-1/2">
          <button
            className={`${btnClass} h-20 w-20`}
            onPointerDown={(e) => {
              e.preventDefault();
              onInteractStart();
            }}
            onPointerUp={onInteractEnd}
            onPointerCancel={onInteractEnd}
            onPointerLeave={onInteractEnd}
            aria-label="Interact"
          >
            <Hand className="h-9 w-9" />
          </button>
        </div>
      )}

      {/* right: dash + fire-mode sit in a utility row well clear of the
       * Fire/Jump row below (96px tall, bottom-10) — a fixed gap so they
       * never visually overlap regardless of screen size. Hud.tsx hides
       * its own fire-mode/dash panels on touch (`touch` prop), so this is
       * the only copy of that UI on a touch device. */}
      <div className="pointer-events-auto absolute bottom-40 right-10 flex items-center gap-4">
        <button
          className={`${btnClass} h-16 w-16 ${dashReady ? "border-cyan-300/60 text-cyan-200 shadow-[0_0_14px_rgba(103,232,249,0.4)]" : ""}`}
          onPointerDown={(e) => {
            e.preventDefault();
            onDash();
          }}
          aria-label="Dash"
        >
          <Zap className="h-7 w-7" />
        </button>
        <button
          className={`flex h-14 w-14 items-center justify-center rounded-full border backdrop-blur-sm touch-none select-none transition-colors ${
            autoFire
              ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-200"
              : "border-amber-400/50 bg-amber-500/15 text-amber-200"
          }`}
          onPointerDown={(e) => {
            e.preventDefault();
            onToggleFireMode();
          }}
          aria-label={autoFire ? "Switch to manual fire" : "Switch to auto fire"}
        >
          {autoFire ? <Bot className="h-6 w-6" /> : <Hand className="h-6 w-6" />}
        </button>
      </div>

      {/* right: Jump + Fire, side by side so both thumbs' resting spot stays
       * put — Jump is a tap, Fire is held for continuous manual fire (auto
       * mode shoots on its own once a target is in the lane, so Fire just
       * doubles as a "look busy" button then, but still works). */}
      <div className="pointer-events-auto absolute bottom-10 right-10 flex items-center gap-4">
        <button
          className={`${btnClass} h-24 w-24 border-cyan-400/30 text-cyan-200`}
          onPointerDown={(e) => {
            e.preventDefault();
            onJump();
          }}
          aria-label="Jump"
        >
          <ArrowUp className="h-10 w-10" />
        </button>
        <button
          className={`${btnClass} h-24 w-24 border-amber-400/30 text-amber-200`}
          onPointerDown={(e) => {
            e.preventDefault();
            onFireStart();
          }}
          onPointerUp={onFireEnd}
          onPointerCancel={onFireEnd}
          onPointerLeave={onFireEnd}
          aria-label="Fire"
        >
          <Crosshair className="h-10 w-10" />
        </button>
      </div>
    </div>
  );
}
