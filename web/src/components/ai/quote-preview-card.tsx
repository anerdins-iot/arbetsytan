"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@/components/ui/table";
import { FileText, Check, X, Loader2, Pencil, FolderOpen, Download } from "lucide-react";

export type QuoteLineItem = {
  description: string;
  quantity: number;
  unit: string; // "st", "tim", "m", "m2"
  unitPrice: number;
  vatRate?: number; // Default 0.25
};

export type QuotePreviewData = {
  projectId?: string;
  projectName?: string;
  clientName: string;
  clientEmail?: string;
  title: string;
  items: QuoteLineItem[];
  validUntil?: string; // ISO date
  notes?: string;
  includeRot?: boolean;
};

type Props = {
  data: QuotePreviewData;
  onGenerate: () => Promise<{ success: boolean; error?: string; downloadUrl?: string; fileId?: string }>;
  onCancel?: () => void;
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("sv-SE", {
    style: "currency",
    currency: "SEK",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("sv-SE");
  } catch {
    return iso;
  }
}

export function QuotePreviewCard({ data, onGenerate, onCancel }: Props) {
  const [status, setStatus] = useState<"pending" | "generating" | "done" | "error">("pending");
  const [error, setError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  const handleGenerate = async () => {
    setStatus("generating");
    setError(null);

    try {
      const result = await onGenerate();
      if (result.success) {
        setStatus("done");
        if (result.downloadUrl) setDownloadUrl(result.downloadUrl);
      } else {
        setStatus("error");
        setError(result.error ?? "Kunde inte generera offert");
      }
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Ett oväntat fel uppstod");
    }
  };

  // Calculate totals
  const subtotal = data.items.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice,
    0
  );
  const vatRate = data.items[0]?.vatRate ?? 0.25;
  const vatAmount = subtotal * vatRate;
  const total = subtotal + vatAmount;

  return (
    <Card className="w-full max-w-lg border-primary/20 bg-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="rounded-full bg-primary/10 p-2">
              <FileText className="h-4 w-4 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">Offert</CardTitle>
              <CardDescription className="text-xs">
                Granska innan PDF genereras
              </CardDescription>
            </div>
          </div>
          <Badge variant="outline" className="gap-1">
            <FileText className="h-3 w-3" />
            PDF
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 pb-3">
        {/* Project */}
        {data.projectName && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Projekt</p>
            <p className="text-sm font-medium flex items-center gap-1">
              <FolderOpen className="h-3 w-3 text-primary" />
              {data.projectName}
            </p>
          </div>
        )}

        {/* Client + Title */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Kund</p>
            <p className="text-sm font-medium">{data.clientName}</p>
            {data.clientEmail && (
              <p className="text-xs text-muted-foreground">{data.clientEmail}</p>
            )}
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Titel</p>
            <p className="text-sm font-medium">{data.title}</p>
          </div>
        </div>

        {/* Valid until */}
        {data.validUntil && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Giltig till</p>
            <p className="text-sm">{formatDate(data.validUntil)}</p>
          </div>
        )}

        {/* Line items table */}
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Beskrivning</TableHead>
                <TableHead className="text-xs text-right w-16">Antal</TableHead>
                <TableHead className="text-xs w-12">Enhet</TableHead>
                <TableHead className="text-xs text-right w-20">Pris</TableHead>
                <TableHead className="text-xs text-right w-24">Summa</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((item, idx) => {
                const lineTotal = item.quantity * item.unitPrice;
                return (
                  <TableRow key={idx}>
                    <TableCell className="text-xs">{item.description}</TableCell>
                    <TableCell className="text-xs text-right">{item.quantity}</TableCell>
                    <TableCell className="text-xs">{item.unit}</TableCell>
                    <TableCell className="text-xs text-right">
                      {formatCurrency(item.unitPrice)}
                    </TableCell>
                    <TableCell className="text-xs text-right font-medium">
                      {formatCurrency(lineTotal)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={4} className="text-xs text-right">
                  Delsumma
                </TableCell>
                <TableCell className="text-xs text-right font-medium">
                  {formatCurrency(subtotal)}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell colSpan={4} className="text-xs text-right">
                  Moms ({Math.round(vatRate * 100)}%)
                </TableCell>
                <TableCell className="text-xs text-right font-medium">
                  {formatCurrency(vatAmount)}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell colSpan={4} className="text-xs text-right font-bold">
                  Totalt inkl. moms
                </TableCell>
                <TableCell className="text-xs text-right font-bold">
                  {formatCurrency(total)}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>

        {/* ROT indicator */}
        {data.includeRot && (
          <Badge variant="secondary" className="text-xs">
            ROT-avdrag tillämpas
          </Badge>
        )}

        {/* Notes */}
        {data.notes && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Anteckningar</p>
            <div className="rounded-md bg-muted/50 p-3">
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {data.notes}
              </p>
            </div>
          </div>
        )}

        {/* Status messages */}
        {status === "done" && (
          <div className="flex items-center gap-2 rounded-md bg-success/10 p-3 text-success">
            <Check className="h-4 w-4" />
            <span className="text-sm font-medium">Offert-PDF genererad!</span>
          </div>
        )}

        {status === "error" && error && (
          <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-destructive">
            <X className="h-4 w-4" />
            <span className="text-sm">{error}</span>
          </div>
        )}
      </CardContent>

      <CardFooter className="flex gap-2 pt-0">
        {status === "pending" && (
          <>
            {onCancel && (
              <Button variant="ghost" size="sm" onClick={onCancel}>
                Avbryt
              </Button>
            )}
            <Button
              size="sm"
              className="ml-auto gap-2"
              onClick={handleGenerate}
            >
              <FileText className="h-4 w-4" />
              Generera Offert (PDF)
            </Button>
          </>
        )}

        {status === "generating" && (
          <Button size="sm" disabled className="ml-auto gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Genererar...
          </Button>
        )}

        {status === "done" && (
          <div className="flex items-center gap-2 w-full">
            <p className="text-xs text-muted-foreground">Offert sparad i fillistan</p>
            {downloadUrl && (
              <Button
                size="sm"
                variant="default"
                className="ml-auto gap-2"
                asChild
              >
                <a href={downloadUrl} download target="_blank" rel="noopener noreferrer">
                  <Download className="h-4 w-4" />
                  Ladda ner PDF
                </a>
              </Button>
            )}
          </div>
        )}

        {status === "error" && (
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            onClick={() => setStatus("pending")}
          >
            Försök igen
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
