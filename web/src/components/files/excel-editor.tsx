"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Save, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { saveEditedExcel } from "@/actions/files";

type ExcelSheet = {
  sheetName: string;
  headers: string[];
  rows: (string | number | null)[][];
};

type ExcelEditorProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileId: string;
  fileName: string;
  projectId?: string;
  sheets: ExcelSheet[];
  onSaved?: () => void;
};

export function ExcelEditor({
  open,
  onOpenChange,
  fileId,
  fileName,
  projectId,
  sheets: initialSheets,
  onSaved,
}: ExcelEditorProps) {
  const t = useTranslations("excelEditor");
  const [sheets, setSheets] = useState<ExcelSheet[]>(() =>
    initialSheets.map((s) => ({
      ...s,
      headers: [...s.headers],
      rows: s.rows.map((r) => [...r]),
    }))
  );
  const [activeSheet, setActiveSheet] = useState(
    initialSheets[0]?.sheetName ?? ""
  );
  const [newFileName, setNewFileName] = useState(() => {
    const base = fileName.replace(/\.xlsx?$/i, "");
    return `${base}-redigerad.xlsx`;
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleCellChange = useCallback(
    (sheetName: string, rowIdx: number, colIdx: number, value: string) => {
      setSheets((prev) =>
        prev.map((sheet) => {
          if (sheet.sheetName !== sheetName) return sheet;
          const newRows = sheet.rows.map((r) => [...r]);
          // Try to preserve numeric values
          const numVal = Number(value);
          newRows[rowIdx]![colIdx] =
            value !== "" && !isNaN(numVal) ? numVal : value;
          return { ...sheet, rows: newRows };
        })
      );
    },
    []
  );

  const handleHeaderChange = useCallback(
    (sheetName: string, colIdx: number, value: string) => {
      setSheets((prev) =>
        prev.map((sheet) => {
          if (sheet.sheetName !== sheetName) return sheet;
          const newHeaders = [...sheet.headers];
          newHeaders[colIdx] = value;
          return { ...sheet, headers: newHeaders };
        })
      );
    },
    []
  );

  const handleAddRow = useCallback(
    (sheetName: string) => {
      setSheets((prev) =>
        prev.map((sheet) => {
          if (sheet.sheetName !== sheetName) return sheet;
          const colCount = sheet.headers.length || (sheet.rows[0]?.length ?? 1);
          const newRow = Array(colCount).fill("") as (string | number | null)[];
          return { ...sheet, rows: [...sheet.rows, newRow] };
        })
      );
    },
    []
  );

  const handleSave = useCallback(async () => {
    if (isSaving) return;

    const trimmedName = newFileName.trim();
    if (!trimmedName) {
      setSaveError(t("errorEmptyFileName"));
      return;
    }
    if (!trimmedName.toLowerCase().endsWith(".xlsx")) {
      setSaveError(t("errorMustEndXlsx"));
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    try {
      const result = await saveEditedExcel({
        sourceFileId: fileId,
        projectId: projectId ?? null,
        newFileName: trimmedName,
        sheets: sheets.map((s) => ({
          name: s.sheetName,
          headers: s.headers,
          rows: s.rows.map((r) =>
            r.map((cell) => {
              if (cell === null || cell === undefined) return "";
              return typeof cell === "number" ? cell : String(cell);
            })
          ),
        })),
      });

      if (!result.success) {
        setSaveError(result.error);
        return;
      }

      onSaved?.();
      onOpenChange(false);
    } catch {
      setSaveError(t("errorGeneric"));
    } finally {
      setIsSaving(false);
    }
  }, [fileId, projectId, newFileName, sheets, isSaving, onSaved, onOpenChange, t]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl p-0" showCloseButton={true}>
        <div className="flex max-h-[90vh] flex-col">
          <DialogHeader className="border-b border-border px-6 py-4">
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="size-4" />
              {t("title")}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {t("description", { fileName })}
            </DialogDescription>
          </DialogHeader>

          {/* Sheet tabs + editable table */}
          <div className="flex-1 overflow-hidden">
            {sheets.length > 1 ? (
              <Tabs
                value={activeSheet}
                onValueChange={setActiveSheet}
                className="flex h-full flex-col"
              >
                <div className="border-b border-border px-4 pt-2">
                  <TabsList>
                    {sheets.map((sheet) => (
                      <TabsTrigger
                        key={sheet.sheetName}
                        value={sheet.sheetName}
                      >
                        {sheet.sheetName}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </div>
                {sheets.map((sheet) => (
                  <TabsContent
                    key={sheet.sheetName}
                    value={sheet.sheetName}
                    className="mt-0 flex-1 overflow-hidden"
                  >
                    <SheetTable
                      sheet={sheet}
                      onCellChange={handleCellChange}
                      onHeaderChange={handleHeaderChange}
                      onAddRow={handleAddRow}
                      t={t}
                    />
                  </TabsContent>
                ))}
              </Tabs>
            ) : sheets.length === 1 ? (
              <SheetTable
                sheet={sheets[0]!}
                onCellChange={handleCellChange}
                onHeaderChange={handleHeaderChange}
                onAddRow={handleAddRow}
                t={t}
              />
            ) : null}
          </div>

          {/* Footer: file name + save */}
          <div className="flex flex-col gap-3 border-t border-border px-6 py-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex flex-col gap-1.5 sm:min-w-[300px]">
              <Label htmlFor="excel-new-filename" className="text-sm font-medium">
                {t("newFileName")}
              </Label>
              <Input
                id="excel-new-filename"
                value={newFileName}
                onChange={(e) => setNewFileName(e.target.value)}
                placeholder={t("fileNamePlaceholder")}
                className="text-sm"
              />
            </div>
            <div className="flex flex-col items-end gap-1">
              {saveError && (
                <p className="text-xs text-destructive">{saveError}</p>
              )}
              <Button
                onClick={() => void handleSave()}
                disabled={isSaving}
                className="gap-1.5"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    {t("saving")}
                  </>
                ) : (
                  <>
                    <Save className="size-4" />
                    {t("saveAsNew")}
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Inner component for rendering an editable sheet table
function SheetTable({
  sheet,
  onCellChange,
  onHeaderChange,
  onAddRow,
  t,
}: {
  sheet: ExcelSheet;
  onCellChange: (
    sheetName: string,
    rowIdx: number,
    colIdx: number,
    value: string
  ) => void;
  onHeaderChange: (sheetName: string, colIdx: number, value: string) => void;
  onAddRow: (sheetName: string) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <ScrollArea className="h-[50vh]">
      <div className="p-4">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 text-center text-xs text-muted-foreground">
                  #
                </TableHead>
                {sheet.headers.map((header, idx) => (
                  <TableHead key={idx} className="min-w-[120px] p-1">
                    <Input
                      value={header}
                      onChange={(e) =>
                        onHeaderChange(sheet.sheetName, idx, e.target.value)
                      }
                      className="h-7 text-xs font-semibold"
                    />
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sheet.rows.map((row, rowIdx) => (
                <TableRow key={rowIdx}>
                  <TableCell className="text-center text-xs text-muted-foreground">
                    {rowIdx + 1}
                  </TableCell>
                  {row.map((cell, cellIdx) => (
                    <TableCell key={cellIdx} className="p-1">
                      <Input
                        value={
                          cell !== null && cell !== undefined ? String(cell) : ""
                        }
                        onChange={(e) =>
                          onCellChange(
                            sheet.sheetName,
                            rowIdx,
                            cellIdx,
                            e.target.value
                          )
                        }
                        className="h-7 text-xs"
                      />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onAddRow(sheet.sheetName)}
          className="mt-3"
        >
          {t("addRow")}
        </Button>
      </div>
    </ScrollArea>
  );
}
