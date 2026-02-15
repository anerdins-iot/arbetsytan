"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Plus, Trash2, FileOutput, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { fillTemplate } from "@/actions/files";

type LoopDef = {
  name: string;
  variables: string[];
};

type TemplateAnalysis = {
  fileId: string;
  fileName: string;
  variables: string[];
  loops: LoopDef[];
};

type TemplateFillData = Record<string, unknown>;

type TemplateFillerProps = {
  analysis: TemplateAnalysis;
  projectId: string;
  translationNamespace: "projects.files" | "personal.files";
  onGenerated?: (file: { fileId: string; fileName: string; downloadUrl: string }) => void;
  onCancel?: () => void;
};

function formatLabel(variable: string): string {
  return variable
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase())
    .trim();
}

export function TemplateFiller({
  analysis,
  projectId,
  translationNamespace,
  onGenerated,
  onCancel,
}: TemplateFillerProps) {
  const t = useTranslations(translationNamespace);

  // State for simple variables
  const [variables, setVariables] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const v of analysis.variables) {
      initial[v] = "";
    }
    return initial;
  });

  // State for loops (array of objects per loop)
  const [loops, setLoops] = useState<Record<string, Record<string, string>[]>>(() => {
    const initial: Record<string, Record<string, string>[]> = {};
    for (const loop of analysis.loops) {
      const emptyRow: Record<string, string> = {};
      for (const v of loop.variables) {
        emptyRow[v] = "";
      }
      initial[loop.name] = [{ ...emptyRow }];
    }
    return initial;
  });

  // Expanded loops state
  const [expandedLoops, setExpandedLoops] = useState<Set<string>>(() => {
    return new Set(analysis.loops.map((l) => l.name));
  });

  // Output file name
  const extension = analysis.fileName.toLowerCase().endsWith(".pptx") ? ".pptx" : ".docx";
  const baseName = analysis.fileName.replace(/\.(docx|pptx)$/i, "");
  const [newFileName, setNewFileName] = useState(`${baseName}-filled${extension}`);

  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleVariableChange = useCallback((name: string, value: string) => {
    setVariables((prev) => ({ ...prev, [name]: value }));
  }, []);

  const handleLoopFieldChange = useCallback(
    (loopName: string, rowIndex: number, fieldName: string, value: string) => {
      setLoops((prev) => {
        const rows = [...(prev[loopName] ?? [])];
        rows[rowIndex] = { ...rows[rowIndex], [fieldName]: value };
        return { ...prev, [loopName]: rows };
      });
    },
    []
  );

  const addLoopRow = useCallback(
    (loopName: string) => {
      const loopDef = analysis.loops.find((l) => l.name === loopName);
      if (!loopDef) return;
      const emptyRow: Record<string, string> = {};
      for (const v of loopDef.variables) {
        emptyRow[v] = "";
      }
      setLoops((prev) => ({
        ...prev,
        [loopName]: [...(prev[loopName] ?? []), emptyRow],
      }));
    },
    [analysis.loops]
  );

  const removeLoopRow = useCallback((loopName: string, rowIndex: number) => {
    setLoops((prev) => {
      const rows = [...(prev[loopName] ?? [])];
      rows.splice(rowIndex, 1);
      return { ...prev, [loopName]: rows };
    });
  }, []);

  const toggleLoop = useCallback((loopName: string) => {
    setExpandedLoops((prev) => {
      const next = new Set(prev);
      if (next.has(loopName)) {
        next.delete(loopName);
      } else {
        next.add(loopName);
      }
      return next;
    });
  }, []);

  const handleGenerate = useCallback(async () => {
    if (isGenerating) return;
    setIsGenerating(true);
    setError(null);

    // Build data object
    const data: TemplateFillData = { ...variables };
    for (const [loopName, rows] of Object.entries(loops)) {
      data[loopName] = rows.filter((row) =>
        Object.values(row).some((v) => v.trim() !== "")
      );
    }

    try {
      const result = await fillTemplate({
        projectId,
        sourceFileId: analysis.fileId,
        newFileName: newFileName.trim() || `${baseName}-filled${extension}`,
        data,
      });

      if (!result.success) {
        setError(result.error);
        return;
      }

      onGenerated?.(result.file);
    } catch {
      setError("FILL_TEMPLATE_FAILED");
    } finally {
      setIsGenerating(false);
    }
  }, [
    isGenerating,
    variables,
    loops,
    projectId,
    analysis.fileId,
    newFileName,
    baseName,
    extension,
    onGenerated,
  ]);

  const totalVariables = analysis.variables.length;
  const totalLoops = analysis.loops.length;

  return (
    <div className="flex h-full flex-col">
      {/* Header info */}
      <div className="border-b border-border px-4 py-3">
        <p className="text-sm font-medium text-foreground">
          {t("templateFillTitle")}
        </p>
        <p className="text-xs text-muted-foreground">
          {t("templateFillDescription", {
            fileName: analysis.fileName,
            variables: totalVariables,
            loops: totalLoops,
          })}
        </p>
      </div>

      {/* Scrollable form area */}
      <ScrollArea className="flex-1">
        <div className="space-y-6 p-4">
          {/* Output file name */}
          <div className="space-y-2">
            <Label htmlFor="template-output-name" className="text-sm font-medium">
              {t("templateOutputFileName")}
            </Label>
            <Input
              id="template-output-name"
              value={newFileName}
              onChange={(e) => setNewFileName(e.target.value)}
              className="text-sm"
            />
          </div>

          {/* Simple variables */}
          {totalVariables > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-foreground">
                {t("templateVariables")}
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {analysis.variables.map((v) => (
                  <div key={v} className="space-y-1">
                    <Label htmlFor={`var-${v}`} className="text-xs text-muted-foreground">
                      {formatLabel(v)}
                    </Label>
                    <Input
                      id={`var-${v}`}
                      value={variables[v] ?? ""}
                      onChange={(e) => handleVariableChange(v, e.target.value)}
                      placeholder={`{${v}}`}
                      className="text-sm"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Loops */}
          {analysis.loops.map((loop) => {
            const rows = loops[loop.name] ?? [];
            const isExpanded = expandedLoops.has(loop.name);

            return (
              <div
                key={loop.name}
                className="rounded-md border border-border"
              >
                {/* Loop header */}
                <button
                  type="button"
                  onClick={() => toggleLoop(loop.name)}
                  className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-muted/50"
                >
                  <span className="text-sm font-medium text-foreground">
                    {formatLabel(loop.name)}{" "}
                    <span className="text-muted-foreground">
                      ({rows.length})
                    </span>
                  </span>
                  {isExpanded ? (
                    <ChevronDown className="size-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="size-4 text-muted-foreground" />
                  )}
                </button>

                {/* Loop rows */}
                {isExpanded && (
                  <div className="border-t border-border px-3 pb-3">
                    <div className="space-y-3 pt-3">
                      {rows.map((row, rowIdx) => (
                        <div
                          key={rowIdx}
                          className="relative rounded-md border border-dashed border-border p-3"
                        >
                          {/* Row number + delete */}
                          <div className="mb-2 flex items-center justify-between">
                            <span className="text-xs font-medium text-muted-foreground">
                              #{rowIdx + 1}
                            </span>
                            {rows.length > 1 && (
                              <Button
                                variant="ghost"
                                size="icon"
                                type="button"
                                className="size-6"
                                onClick={() => removeLoopRow(loop.name, rowIdx)}
                              >
                                <Trash2 className="size-3 text-destructive" />
                                <span className="sr-only">{t("templateRemoveRow")}</span>
                              </Button>
                            )}
                          </div>

                          {/* Row fields */}
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {loop.variables.map((fieldName) => (
                              <div key={fieldName} className="space-y-1">
                                <Label
                                  htmlFor={`loop-${loop.name}-${rowIdx}-${fieldName}`}
                                  className="text-xs text-muted-foreground"
                                >
                                  {formatLabel(fieldName)}
                                </Label>
                                <Input
                                  id={`loop-${loop.name}-${rowIdx}-${fieldName}`}
                                  value={row[fieldName] ?? ""}
                                  onChange={(e) =>
                                    handleLoopFieldChange(
                                      loop.name,
                                      rowIdx,
                                      fieldName,
                                      e.target.value
                                    )
                                  }
                                  placeholder={`{${fieldName}}`}
                                  className="text-sm"
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Add row button */}
                    <Button
                      variant="outline"
                      size="sm"
                      type="button"
                      onClick={() => addLoopRow(loop.name)}
                      className="mt-3 w-full gap-1.5"
                    >
                      <Plus className="size-3.5" />
                      {t("templateAddRow")}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}

          {/* Error */}
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>
      </ScrollArea>

      {/* Footer with actions */}
      <div className="flex items-center justify-between border-t border-border px-4 py-3">
        <Button variant="outline" size="sm" type="button" onClick={onCancel}>
          {t("templateCancel")}
        </Button>
        <Button
          size="sm"
          type="button"
          onClick={() => void handleGenerate()}
          disabled={isGenerating || !newFileName.trim()}
          className="gap-1.5"
        >
          {isGenerating ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              {t("templateGenerating")}
            </>
          ) : (
            <>
              <FileOutput className="size-4" />
              {t("templateGenerate")}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
