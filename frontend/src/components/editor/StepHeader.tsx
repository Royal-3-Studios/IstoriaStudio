// src/components/editor/StepHeader.tsx
"use client";

export type Step = "type" | "edit" | "variants" | "qa" | "export";

export default function StepHeader({
  step,
  steps,
  enabled,
  onChangeAction,
  labels,
}: {
  step: Step;
  steps: Step[];
  enabled: Step[];
  onChangeAction: (s: Step) => void;
  /** Optional label overrides, e.g. { qa: "Checks" } */
  labels?: Partial<Record<Step, string>>;
}) {
  const defaultLabels: Record<Step, string> = {
    type: "Type",
    edit: "Edit",
    variants: "Variants",
    qa: "QA",
    export: "Export",
  };
  const mergedLabels = { ...defaultLabels, ...(labels ?? {}) };

  return (
    <div className="flex items-center gap-3 border-b px-2 py-1 w-full">
      {steps.map((s) => {
        const active = s === step;
        const isEnabled = enabled.includes(s);

        return (
          <button
            key={s}
            type="button"
            onClick={() => isEnabled && onChangeAction(s)}
            disabled={!isEnabled}
            aria-current={active ? "step" : undefined}
            title={isEnabled ? mergedLabels[s] : "Complete previous step"}
            className={[
              "text-xs px-3 py-1 rounded-full transition",
              active
                ? "bg-primary text-primary-foreground"
                : isEnabled
                  ? "hover:bg-muted"
                  : "opacity-50 border border-dashed",
            ].join(" ")}
          >
            {mergedLabels[s]}
          </button>
        );
      })}
    </div>
  );
}
