// src/app/projects/[projectId]/components/PromptOverlay.tsx

"use client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader, Plus as PlusIcon, Paperclip } from "lucide-react";

type Props = {
  isPromptDocked: boolean;
  promptText: string;
  isGenerating: boolean;
  attachedPromptDocName: string | null;
  onGenerate: () => void;
  onChangePrompt: () => void;
  onAttachClick: () => void;
  onPromptFocus: () => void;
  onPromptBlur: () => void;
  onPromptChange: (v: string) => void;
  promptTextareaRef: React.RefObject<HTMLTextAreaElement>;
  promptDocInputRef: React.RefObject<HTMLInputElement>;
  autosize: (el?: HTMLTextAreaElement | null) => void;
  dockTopPx: number;
};

export default function PromptOverlay(props: Props) {
  const {
    isPromptDocked,
    promptText,
    isGenerating,
    attachedPromptDocName,
    onGenerate,
    onChangePrompt,
    onAttachClick,
    onPromptFocus,
    onPromptBlur,
    onPromptChange,
    promptTextareaRef,
    promptDocInputRef,
    autosize,
    dockTopPx,
  } = props;

  return (
    <div className="absolute inset-0 z-20 pointer-events-none">
      <div
        className="absolute left-1/2 w-[min(100%,80rem)] px-4 transition-all duration-300 ease-out pointer-events-auto"
        style={{
          willChange: "transform, top",
          top: isPromptDocked ? dockTopPx : "50%",
          transform: isPromptDocked
            ? "translate(-50%, 0) scale(0.92)"
            : "translate(-50%, -50%) scale(1)",
        }}
      >
        <div
          className={[
            "relative mx-auto transition-all duration-300 ease-out",
            isPromptDocked ? "max-w-md" : "max-w-3xl",
          ].join(" ")}
        >
          <input
            ref={promptDocInputRef}
            type="file"
            accept=".txt,text/plain"
            className="hidden"
          />
          <Card
            className={[
              "relative transition-all duration-300 ease-out border bg-card shadow-md",
              isPromptDocked ? "h-10 p-0 overflow-hidden rounded-2xl" : "",
            ].join(" ")}
          >
            {isPromptDocked ? (
              <div className="h-10 px-2 sm:px-3 flex items-center justify-between">
                <div className="truncate text-xs sm:text-sm opacity-60">
                  Ready to tweak your image?
                </div>
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="h-6 sm:h-8 px-2 sm:px-3 text-xs sm:text-sm rounded-full cursor-pointer"
                    onClick={onGenerate}
                    disabled={isGenerating || !promptText.trim()}
                    title="Regenerate with current prompt"
                    aria-label="Regenerate"
                  >
                    {isGenerating ? (
                      <>
                        <Loader className="h-4 w-4 animate-spin" />
                        <span className="ml-1.5 hidden sm:inline">
                          Generating…
                        </span>
                      </>
                    ) : (
                      <>
                        <PlusIcon className="h-4 w-4" />
                        <span className="ml-1.5 hidden sm:inline">
                          Regenerate
                        </span>
                      </>
                    )}
                  </Button>

                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-6 sm:h-8 px-2 sm:px-3 text-xs sm:text-sm rounded-full cursor-pointer"
                    onClick={onChangePrompt}
                    title="Change prompt"
                    aria-label="Change prompt"
                  >
                    Change prompt
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <textarea
                  ref={promptTextareaRef}
                  className="w-full bg-transparent border-none outline-none resize-none focus:overflow-y-auto rounded-2xl pl-5 pr-24 text-base min-h-[7rem] mb-4 placeholder:text-muted-foreground focus:ring-0 focus:outline-none whitespace-pre-wrap break-words overflow-hidden transition-all duration-300"
                  placeholder="Describe what to generate…"
                  value={promptText}
                  onFocus={() => {
                    onPromptFocus();
                    setTimeout(() => autosize(), 0);
                  }}
                  onBlur={() => setTimeout(onPromptBlur, 120)}
                  onChange={(e) => onPromptChange(e.target.value)}
                  onInput={(e) => autosize(e.currentTarget)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      onGenerate();
                    }
                  }}
                  rows={4}
                />
                <button
                  type="button"
                  onClick={onAttachClick}
                  className="absolute left-3 bottom-2 inline-flex items-center gap-1 text-xs rounded-full px-2 py-1 border hover:bg-background hover:scale-110 bg-accent/40 transition"
                  title="Upload prompt (.txt)"
                  aria-label="Upload prompt"
                >
                  <Paperclip className="h-3 w-3" />
                  Attach
                </button>
                <Button
                  type="button"
                  className="h-6 sm:h-8 absolute right-3 bottom-2 rounded-full text-xs sm:text-sm cursor-pointer"
                  onClick={onGenerate}
                  disabled={isGenerating || !promptText.trim()}
                  title="Generate"
                >
                  {isGenerating ? (
                    <>
                      <Loader className="h-4 w-4 animate-spin" />
                      <span className="ml-1.5 hidden sm:inline">
                        Generating…
                      </span>
                    </>
                  ) : (
                    <>
                      <PlusIcon className="h-4 w-4" />
                      <span className="ml-1.5 hidden sm:inline">Generate</span>
                    </>
                  )}
                </Button>
              </>
            )}
          </Card>

          {!isPromptDocked && attachedPromptDocName && (
            <div className="mt-1">
              <Badge variant="secondary">{attachedPromptDocName}</Badge>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
