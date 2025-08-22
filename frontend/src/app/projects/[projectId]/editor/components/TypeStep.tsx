// src/app/projects/[projectId]/components/TypeStep.tsx

"use client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import PresetGallery from "@/components/editor/PresetGallery";
import PresetSelector from "@/components/editor/PresetSelector";
import { ArrowBigRight } from "lucide-react";
import { PRESET_PLACEHOLDER, type Preset } from "@/data/presets";

type Props = {
  projectType?: string;
  selectedId: string;
  hasUserSelectedPreset: boolean;
  canContinue: boolean;
  justEnabledContinue: boolean;
  showContinueLabel: boolean;
  onSelectAction: (id: string) => void; // -> onValueChangeAction passthrough
  onContinueAction: () => void;
  dockTopPx: number;
};

export default function TypeStep({
  projectType,
  selectedId,
  hasUserSelectedPreset,
  canContinue,
  justEnabledContinue,
  showContinueLabel,
  onSelectAction,
  onContinueAction,
  dockTopPx,
}: Props) {
  return (
    <div className="absolute inset-0 z-20 pointer-events-none">
      <div
        className="absolute left-1/2 w-[min(100%,64rem)] px-4 transition-all duration-300 ease-out pointer-events-auto"
        style={{
          willChange: "transform, top",
          top: hasUserSelectedPreset ? dockTopPx : "50%",
          transform: hasUserSelectedPreset
            ? "translate(-50%, 0) scale(0.92)"
            : "translate(-50%, -50%) scale(1)",
        }}
      >
        <div className="relative mx-auto transition-all duration-300 ease-out w-full">
          {!hasUserSelectedPreset ? (
            <Card className="mb-20 relative transition-all duration-300 ease-out border bg-card shadow-md px-4 pb-10 pt-8">
              <div className="flex w-full flex-col gap-4">
                <div className="text-xs sm:text-sm text-muted-foreground text-center font-bold">
                  Pick a size/type to preview the canvas.
                </div>
                <div className="mx-auto w-full">
                  <div className="max-w-4xl mx-auto">
                    <PresetGallery
                      presets={
                        /* you can pass PRESETS here if you want to keep it inside page */ [] as unknown as Preset[]
                      }
                      value={
                        selectedId !== PRESET_PLACEHOLDER.id ? selectedId : null
                      }
                      onChangeAction={onSelectAction}
                      projectType={projectType}
                      showFilters
                    />
                  </div>
                </div>
              </div>
            </Card>
          ) : (
            <div className="grid grid-cols-[1fr_auto_1fr] items-center w-full">
              <div />
              <div className="justify-self-center max-w-md w-full">
                <PresetSelector
                  value={selectedId}
                  onValueChangeAction={onSelectAction}
                />
              </div>
              <div className="ml-1 mt-4 justify-self-end">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={onContinueAction}
                  disabled={!canContinue}
                  className={[
                    "text-xs sm:text-sm group rounded-full transition-all duration-300 flex items-center overflow-hidden h-8 mt-1 cursor-pointer hover:scale-110",
                    justEnabledContinue
                      ? "scale-120 bg-primary text-background"
                      : "scale-100",
                    showContinueLabel ? "px-2" : "px-1",
                  ].join(" ")}
                  title="Continue to Generate"
                >
                  <ArrowBigRight className="h-4 w-4 shrink-0" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
