import type { InventorySnapshot } from "../game/types";
import { Play, PackageCheck, ShieldCheck, Gem } from "lucide-react";
import GridPanel from "./GridPanel";

interface Props {
  next: number;
  inv: InventorySnapshot;
  onMove: (id: string, x: number, y: number) => boolean;
  onDepositAll: () => void;
  onContinue: () => void;
}

/** Shown after BossClear, before continueAfterBoss() — resupply + backpack logistics. */
export default function SafeHouseOverlay({ next, inv, onMove, onDepositAll, onContinue }: Props) {
  return (
    <div className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center bg-gradient-to-b from-cyan-950/20 via-black/85 to-black/95 backdrop-blur-[5px]">
      <div className="anim-pop flex w-full max-w-2xl flex-col items-center px-8 text-center">
        <div className="anim-rise mb-3 flex items-center gap-3 text-[13px] font-bold tracking-[0.45em] text-cyan-300/80">
          <span className="h-px w-8 bg-cyan-400/40" />
          SAFE HOUSE
          <span className="h-px w-8 bg-cyan-400/40" />
        </div>
        <h2 className="anim-rise font-display text-5xl tracking-[0.1em] text-cyan-200" style={{ animationDelay: "60ms" }}>
          RESUPPLY & LOAD OUT
        </h2>

        <div className="anim-rise mt-4 flex items-center gap-4 text-[13px] font-bold tracking-[0.15em] text-cyan-300/90" style={{ animationDelay: "110ms" }}>
          <span className="flex items-center gap-1.5 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1">
            <ShieldCheck className="h-3.5 w-3.5" /> RESERVE +50%
          </span>
        </div>

        <div className="anim-rise mt-6 flex w-full items-start justify-center gap-6" style={{ animationDelay: "150ms" }}>
          <div className="flex flex-col items-center gap-2">
            <div className="text-[12px] font-bold tracking-[0.25em] text-zinc-400">BACKPACK</div>
            <div className="rounded-xl border border-white/10 bg-black/40 p-2">
              <GridPanel items={inv.backpack} size={inv.backpackSize} onMove={onMove} cell={54} />
            </div>
          </div>

          <div className="flex flex-col items-center gap-3 pt-6">
            <button
              onClick={onDepositAll}
              disabled={inv.backpack.length === 0}
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-bold tracking-[0.15em] text-zinc-200 transition-all hover:border-white/25 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <PackageCheck className="h-4 w-4" />
              DEPOSIT ALL
            </button>
            <div className="flex items-center gap-1.5 text-[12px] font-semibold text-zinc-500">
              <Gem className="h-3 w-3 text-violet-400" /> {inv.deposit.length} IN STASH
            </div>
            <div className="text-[11px] leading-relaxed text-zinc-600">
              Deposited items are safe<br />even if you don't make it back.
            </div>
          </div>
        </div>

        <button
          onClick={onContinue}
          className="anim-rise mt-8 flex items-center gap-3 rounded-xl bg-gradient-to-b from-amber-400 to-amber-600 px-11 py-4 text-lg font-bold tracking-[0.22em] text-amber-950 shadow-[0_0_45px_rgba(245,158,11,0.35)] transition-all hover:scale-[1.04] active:scale-[0.98]"
          style={{ animationDelay: "220ms" }}
        >
          <Play className="h-5 w-5" fill="currentColor" />
          ENTER WAVE {next}
        </button>
      </div>
    </div>
  );
}
