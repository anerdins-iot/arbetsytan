"use client";

import { Bot } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MODEL_OPTIONS, type ProviderKey } from "@/lib/ai/providers";

type ModelSelectorProps = {
  currentModel: ProviderKey;
  onSelect: (model: ProviderKey) => void;
  disabled?: boolean;
};

export function ModelSelector({ currentModel, onSelect, disabled }: ModelSelectorProps) {
  const currentOption = MODEL_OPTIONS.find((m) => m.key === currentModel);

  return (
    <Select
      value={currentModel}
      onValueChange={(value) => onSelect(value as ProviderKey)}
      disabled={disabled}
    >
      <SelectTrigger
        size="sm"
        className="h-7 gap-1.5 border-border/50 bg-muted/50 text-xs max-w-[160px]"
      >
        <Bot className="size-3.5 shrink-0 text-muted-foreground" />
        <SelectValue>
          {currentOption?.label ?? currentModel}
        </SelectValue>
      </SelectTrigger>
      <SelectContent position="popper" align="start">
        {MODEL_OPTIONS.map((option) => (
          <SelectItem key={option.key} value={option.key}>
            <div className="flex flex-col">
              <span>{option.label}</span>
              <span className="text-xs text-muted-foreground">{option.description}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
