// FILE: src/ui/brush/strings.ts
//   * **Stabilization** (primary)
//   * “StreamLine” (alias)
//   * “Motion filtering” (tooltip)
//     Tooltips should mention it affects prediction and spacing at speed.

export type Locale = "en" | "de" | "fr" | "es" | "ja" | "zh";

type BrushUiKeys =
  | "stabilization.label"
  | "stabilization.alias"
  | "stabilization.tooltip";

type Dict = Record<BrushUiKeys, string>;

const EN: Dict = {
  "stabilization.label": "Stabilization",
  "stabilization.alias": "StreamLine",
  "stabilization.tooltip":
    "Reduces wobble by filtering motion and adding a small prediction. At higher values, the engine also increases spacing at speed to keep results smooth.",
};

const DE: Dict = {
  "stabilization.label": "Stabilisierung",
  "stabilization.alias": "StreamLine",
  "stabilization.tooltip":
    "Verringert Zittern, indem Bewegungen gefiltert und leicht vorhergesagt werden. Bei höheren Werten erhöht die Engine zudem den Abstand bei hoher Geschwindigkeit für gleichmäßige Ergebnisse.",
};

const FR: Dict = {
  "stabilization.label": "Stabilisation",
  "stabilization.alias": "StreamLine",
  "stabilization.tooltip":
    "Réduit les tremblements via un filtrage du mouvement et une légère prédiction. À des valeurs élevées, le moteur augmente aussi l’espacement à vitesse pour garder la fluidité.",
};

const ES: Dict = {
  "stabilization.label": "Estabilización",
  "stabilization.alias": "StreamLine",
  "stabilization.tooltip":
    "Reduce el temblor filtrando el movimiento y aplicando una ligera predicción. Con valores altos, el motor incrementa el espaciado a alta velocidad para mantener la suavidad.",
};

const JA: Dict = {
  "stabilization.label": "安定化",
  "stabilization.alias": "StreamLine",
  "stabilization.tooltip":
    "動きをフィルタし少し先読みしてブレを低減します。値を上げると、高速移動時に間隔も自動調整され、描画の滑らかさを保ちます。",
};

const ZH: Dict = {
  "stabilization.label": "稳定",
  "stabilization.alias": "StreamLine",
  "stabilization.tooltip":
    "通过运动过滤与少量预测降低抖动。在较高数值下，引擎还会在高速移动时增加采样间距，以保持笔迹平滑。",
};

const TABLE: Record<Locale, Dict> = {
  en: EN,
  de: DE,
  fr: FR,
  es: ES,
  ja: JA,
  zh: ZH,
};

/** Simple i18n getter with English fallback. */
export function t(key: BrushUiKeys, locale: Locale = "en"): string {
  const dict = TABLE[locale] ?? EN;
  return dict[key] ?? EN[key];
}

/** Convenience accessors (so UI code doesn’t hardcode keys). */
export const BrushStrings = {
  stabilizationLabel: (locale?: Locale) => t("stabilization.label", locale),
  stabilizationAlias: (locale?: Locale) => t("stabilization.alias", locale),
  stabilizationTooltip: (locale?: Locale) => t("stabilization.tooltip", locale),
};
