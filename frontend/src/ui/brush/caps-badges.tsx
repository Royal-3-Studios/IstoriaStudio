// FILE: src/ui/brush/caps-badges.tsx
import * as React from "react";
import type { EngineConfig } from "@/lib/brush/engine.types";

export type BrushCaps = {
  tilt?: boolean;
  wet?: boolean;
  smudge?: boolean;
  heightfield?: boolean;
  lighting?: boolean;
  grainMotion?: boolean;
};

export function inferCapsFromEngine(engine?: EngineConfig): BrushCaps {
  const e = engine ?? {};
  const b = e.backend;
  const grainMotion =
    (e.grain?.motion && e.grain.motion !== "paperLocked") || false;

  const byBackend: BrushCaps =
    b === "wet"
      ? { wet: true }
      : b === "smudge"
        ? { smudge: true }
        : b === "impasto"
          ? { heightfield: true, lighting: true, tilt: true }
          : b === "spray"
            ? { tilt: true }
            : b === "ribbon"
              ? { tilt: true }
              : b === "stamping"
                ? { tilt: true }
                : b === "pattern"
                  ? { tilt: true, grainMotion }
                  : b === "particle"
                    ? { tilt: true }
                    : {};

  const tiltFromOverrides =
    (e.overrides?.tiltToFan ?? 0) > 0 ||
    (e.overrides?.tiltToSize ?? 0) > 0 ||
    (e.overrides?.tiltToGrainScale ?? 0) > 0 ||
    (e.overrides?.tiltToEdgeNoise ?? 0) > 0;

  return {
    ...byBackend,
    grainMotion: byBackend.grainMotion || grainMotion,
    tilt: byBackend.tilt || tiltFromOverrides || false,
  };
}

type CapsBadgesProps = {
  caps?: BrushCaps;
  engine?: EngineConfig;
  className?: string;
  compact?: boolean;
};

export function CapsBadges({
  caps,
  engine,
  className,
  compact = false,
}: CapsBadgesProps) {
  const c = React.useMemo(
    () => caps ?? inferCapsFromEngine(engine),
    [caps, engine]
  );

  const items = [
    {
      key: "tilt",
      label: "Tilt",
      title: "Brush responds to stylus tilt (fan, size, angle, grain).",
      show: !!c.tilt,
      icon: <IconTilt />,
    },
    {
      key: "wet",
      label: "Wet",
      title: "Watercolor-like diffusion & wet edges.",
      show: !!c.wet,
      icon: <IconDroplet />,
    },
    {
      key: "smudge",
      label: "Smudge",
      title: "Picks up and blends existing pigment.",
      show: !!c.smudge,
      icon: <IconFinger />,
    },
    {
      key: "heightfield",
      label: "Heightfield",
      title: "Impasto-style relief with shading from a height map.",
      show: !!c.heightfield,
      icon: <IconLayers />,
    },
    {
      key: "lighting",
      label: "Lighting",
      title: "Uses lighting/specular highlights (e.g., impasto).",
      show: !!c.lighting,
      icon: <IconSun />,
    },
    {
      key: "grainMotion",
      label: "Grain",
      title:
        "Pattern/grain can move (tip/animated) rather than being paper-locked.",
      show: !!c.grainMotion,
      icon: <IconGrid />,
    },
  ] as const satisfies ReadonlyArray<{
    key: keyof BrushCaps;
    label: string;
    title: string;
    show: boolean;
    icon: React.ReactNode;
  }>;

  const visible = items.filter((i) => i.show);
  if (visible.length === 0) return null;

  const pill = compact
    ? "text-[10px] px-1.5 py-0.5 rounded-md"
    : "text-xs px-2 py-1 rounded-lg";
  const base =
    "inline-flex items-center gap-1 bg-zinc-800/70 text-zinc-100 border border-zinc-700";

  return (
    <div
      className={
        "flex flex-wrap items-center gap-1.5 select-none " + (className ?? "")
      }
      aria-label="Brush capabilities"
    >
      {visible.map((it) => (
        <span
          key={it.key}
          className={`${base} ${pill}`}
          title={it.title}
          aria-label={it.label}
        >
          <span className="opacity-90 -ml-0.5">{it.icon}</span>
          <span>{it.label}</span>
        </span>
      ))}
    </div>
  );
}

/* ------------------------------- Icons ------------------------------- */

function IconTilt() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      role="img"
      aria-hidden="true"
    >
      <path
        d="M6 18l12-12M14.5 5.5l4 4M5.5 14.5l4 4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

function IconDroplet() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      role="img"
      aria-hidden="true"
    >
      <path
        d="M12 3c4 6 6 8 6 11a6 6 0 11-12 0c0-3 2-5 6-11z"
        fill="currentColor"
      />
    </svg>
  );
}

function IconFinger() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      role="img"
      aria-hidden="true"
    >
      <path
        d="M7 12v-1a3 3 0 116 0v4l1.5-1a2 2 0 112 3l-3.5 2.5A6 6 0 017 16v-4z"
        fill="currentColor"
      />
    </svg>
  );
}

function IconLayers() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      role="img"
      aria-hidden="true"
    >
      <path
        d="M12 3l9 5-9 5-9-5 9-5zm0 8l9 5-9 5-9-5 9-5z"
        fill="currentColor"
      />
    </svg>
  );
}

function IconSun() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      role="img"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" fill="currentColor" />
      <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12" />
        <path d="M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12" />
      </g>
    </svg>
  );
}

function IconGrid() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      role="img"
      aria-hidden="true"
    >
      <g stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="18" height="18" fill="none" />
        <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
      </g>
    </svg>
  );
}

export default CapsBadges;
