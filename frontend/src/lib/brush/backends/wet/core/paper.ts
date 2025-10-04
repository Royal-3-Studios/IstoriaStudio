export type PaperModel = {
  width: number;
  height: number;
  tooth: number; // 0..1
  sizing: number; // 0..1
  granulation: number; // 0..1
  seed: number;
};

export function paperModel(opts: {
  width: number;
  height: number;
  tooth: number;
  sizing: number;
  granulation: number;
  seed: number;
}): PaperModel {
  return {
    width: Math.max(1, Math.floor(opts.width)),
    height: Math.max(1, Math.floor(opts.height)),
    tooth: Math.max(0, Math.min(1, opts.tooth)),
    sizing: Math.max(0, Math.min(1, opts.sizing)),
    granulation: Math.max(0, Math.min(1, opts.granulation)),
    seed: opts.seed >>> 0 || 1,
  };
}
