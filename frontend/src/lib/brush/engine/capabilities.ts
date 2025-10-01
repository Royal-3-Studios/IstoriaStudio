// FILE: src/lib/brush/engine/capabilities.ts

export type Capabilities = {
  shape: boolean; // brush footprint (tip/ribbon/etc.)
  grain: boolean; // paper/texture modulation
  wetEdges: boolean; // wet-edge darkening/halos
  perDabFlow: boolean; // per-dab flow/opacity
  perDistanceEmission: boolean; // emits per distance (spray/particle)
  pickupColor: boolean; // samples canvas/composite colors (smudge)
  heightMap: boolean; // writes height/normal for lighting (impasto)
};

export const BACKEND_CAPS: Record<string, Capabilities> = {
  // In use today
  stamping: {
    shape: true,
    grain: true,
    wetEdges: false,
    perDabFlow: true,
    perDistanceEmission: false,
    pickupColor: false,
    heightMap: false,
  },
  ribbon: {
    shape: true,
    grain: false,
    wetEdges: false,
    perDabFlow: true,
    perDistanceEmission: false,
    pickupColor: false,
    heightMap: false,
  },
  spray: {
    shape: true,
    grain: false,
    wetEdges: false,
    perDabFlow: true,
    perDistanceEmission: true,
    pickupColor: false,
    heightMap: false,
  },
  wet: {
    shape: true,
    grain: true,
    wetEdges: true,
    perDabFlow: true,
    perDistanceEmission: false,
    pickupColor: false,
    heightMap: false,
  },
  pattern: {
    shape: true,
    grain: false,
    wetEdges: false,
    perDabFlow: true,
    perDistanceEmission: false,
    pickupColor: false,
    heightMap: false,
  },

  // Future-ready
  smudge: {
    shape: true,
    grain: false,
    wetEdges: false,
    perDabFlow: true,
    perDistanceEmission: false,
    pickupColor: true,
    heightMap: false,
  },
  impasto: {
    shape: true,
    grain: true,
    wetEdges: false,
    perDabFlow: true,
    perDistanceEmission: false,
    pickupColor: false,
    heightMap: true,
  },
  particle: {
    shape: true,
    grain: false,
    wetEdges: false,
    perDabFlow: true,
    perDistanceEmission: true,
    pickupColor: false,
    heightMap: false,
  },
};
