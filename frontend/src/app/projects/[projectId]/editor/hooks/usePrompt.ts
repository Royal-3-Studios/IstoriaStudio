// src/app/projects/[projectId]/hooks/usePrompt.tsx

"use client";
import { useRef, useState } from "react";

export function usePrompt() {
  const [promptText, setPromptText] = useState("");
  const [isPromptFocused, setIsPromptFocused] = useState(false);
  const promptTextareaRef = useRef<HTMLTextAreaElement>(null);
  const promptDocInputRef = useRef<HTMLInputElement>(null);

  const autosize = (el?: HTMLTextAreaElement | null) => {
    const t = el ?? promptTextareaRef.current;
    if (!t) return;
    t.style.height = "0px";
    t.style.height = Math.min(t.scrollHeight, 260) + "px";
  };

  const dock = () => {
    setIsPromptFocused(false);
    promptTextareaRef.current?.blur();
  };

  return {
    promptText,
    setPromptText,
    isPromptFocused,
    setIsPromptFocused,
    promptTextareaRef,
    promptDocInputRef,
    autosize,
    dock,
  };
}
