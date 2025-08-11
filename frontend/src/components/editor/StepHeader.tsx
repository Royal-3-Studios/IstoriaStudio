"use client";

type Step = "image" | "type" | "text" | "layout" | "export";
export type { Step };

export default function StepHeader({
  step,
  steps,
  onChange,
}: {
  step: Step;
  steps: Step[];
  onChange: (s: Step) => void;
}) {
  const labels: Record<Step, string> = {
    image: "Generate Image",
    type: "Choose Type",
    text: "Add Text",
    layout: "Spine / Back",
    export: "Export",
  };

  return (
    <div className="flex items-center gap-3 border-b px-4 py-3">
      {steps.map((s, i) => {
        const active = s === step;
        return (
          <button
            key={s}
            onClick={() => onChange(s)}
            className={`text-sm px-3 py-1 rounded ${
              active ? "bg-primary text-primary-foreground" : "hover:bg-muted"
            }`}
          >
            {i + 1}. {labels[s]}
          </button>
        );
      })}
    </div>
  );
}
