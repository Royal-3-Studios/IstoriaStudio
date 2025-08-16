"use client";

export type Step = "image" | "type" | "text" | "layout" | "export";

export default function StepHeader({
  step,
  steps,
  enabled,
  onChangeAction,
}: {
  step: Step;
  steps: Step[];
  enabled: Step[];
  onChangeAction: (s: Step) => void;
}) {
  const labels: Record<Step, string> = {
    image: "Generate",
    type: "Type",
    text: "Text",
    layout: "Spine / Back",
    export: "Export",
  };

  return (
    <div className="flex items-center gap-3 border-b px-4 py-3 w-full">
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
            title={isEnabled ? labels[s] : "Complete previous step"}
            className={[
              "text-sm px-3 py-1 rounded-full transition",
              active
                ? "bg-primary text-primary-foreground"
                : isEnabled
                  ? "hover:bg-muted"
                  : "opacity-50 border border-dashed",
            ].join(" ")}
          >
            {labels[s]}
          </button>
        );
      })}
    </div>
  );
}
