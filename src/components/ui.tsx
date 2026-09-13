import type { Rarity } from "../game/types";
import {
  Crosshair, Gauge, Layers, ChevronsRight, Target, Wind, HeartPulse, Footprints,
  Droplets, Magnet, Activity, Ghost, Zap, Flame, Shield, Bomb, Copy, type LucideIcon,
} from "lucide-react";

export const ICONS: Record<string, LucideIcon> = {
  Crosshair, Gauge, Layers, ChevronsRight, Target, Wind, HeartPulse,
  Footprints, Droplets, Magnet, Activity, Ghost, Zap, Flame, Shield, Bomb, Copy,
};

export const RARITY_STYLE: Record<Rarity, { border: string; glow: string; tag: string; label: string }> = {
  common: { border: "border-zinc-500/40", glow: "hover:shadow-[0_0_40px_rgba(161,161,170,0.15)]", tag: "bg-zinc-500/15 text-zinc-300", label: "COMMON" },
  rare: { border: "border-cyan-400/50", glow: "hover:shadow-[0_0_40px_rgba(34,211,238,0.2)]", tag: "bg-cyan-400/15 text-cyan-300", label: "RARE" },
  epic: { border: "border-fuchsia-400/50", glow: "hover:shadow-[0_0_40px_rgba(232,121,249,0.25)]", tag: "bg-fuchsia-400/15 text-fuchsia-300", label: "EPIC" },
  weapon: { border: "border-amber-400/70", glow: "hover:shadow-[0_0_50px_rgba(245,158,11,0.35)]", tag: "bg-amber-400/20 text-amber-300", label: "NEW WEAPON" },
};

export function MenuButton({
  primary, onClick, icon, label,
}: { primary?: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-center gap-2.5 rounded-xl px-6 py-3 text-base font-bold tracking-[0.2em] transition-all duration-150 active:scale-[0.98] ${
        primary
          ? "bg-gradient-to-b from-amber-400 to-amber-600 text-amber-950 shadow-[0_0_30px_rgba(245,158,11,0.3)] hover:scale-[1.02]"
          : "border border-white/10 bg-white/5 text-zinc-200 hover:border-white/25 hover:bg-white/10"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

export function StatBox({
  icon, label, value, accent,
}: { icon: React.ReactNode; label: string; value: string; accent?: boolean }) {
  return (
    <div className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-3 ${
      accent ? "border-amber-400/30 bg-amber-400/5" : "border-white/10 bg-white/[0.03]"
    }`}>
      <div className={accent ? "text-amber-300" : "text-zinc-500"}>{icon}</div>
      <div className={`font-display text-2xl tracking-wider tabular-nums ${accent ? "text-amber-300" : "text-zinc-100"}`}>{value}</div>
      <div className="text-[11px] font-bold tracking-[0.25em] text-zinc-500">{label}</div>
    </div>
  );
}
