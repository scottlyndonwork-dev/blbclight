"use client";

import { AlertTriangle, CheckCircle2, Download, FileUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { FormField } from "@/components/shared/form-field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { commitImportAction, previewImportAction } from "../import-actions";
import type { ParsedImport } from "../import-parse";

export function ImportWizard({ statuses, defaultStatusId }: { statuses: Array<{ id: string; name: string }>; defaultStatusId: string }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ParsedImport | null>(null);
  const [statusId, setStatusId] = useState(defaultStatusId);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function runPreview() {
    if (!file) return;
    setError(null);
    const data = new FormData();
    data.set("file", file);
    startTransition(async () => {
      const result = await previewImportAction(data);
      if (result.ok) setPreview(result.data);
      else setError(result.error);
    });
  }

  function commit() {
    if (!preview) return;
    startTransition(async () => {
      const result = await commitImportAction(preview.valid.map((v) => v.values), statusId);
      if (result.ok) {
        toast.success(result.message);
        router.push("/members?sort=newest");
      } else {
        setError(result.error);
        toast.error(result.error);
      }
    });
  }

  const blocking = preview?.errors.some((e) => e.row <= 1) ?? false;

  return (
    <div className="space-y-5">
      <section className="rounded-lg border bg-card p-4">
        <h2 className="text-sm font-semibold">1. Prepare your spreadsheet</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Use the template so the columns are recognized. Up to 2,000 members per import. The whole file is imported together: if anything fails, nothing is saved.
        </p>
        <Button variant="outline" size="sm" className="mt-3" asChild>
          <a href="/api/exports/member-template">
            <Download /> Download template
          </a>
        </Button>
      </section>

      <section className="rounded-lg border bg-card p-4">
        <h2 className="text-sm font-semibold">2. Upload and check</h2>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            type="file"
            accept=".xlsx,.csv"
            className="sm:max-w-sm"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setPreview(null);
            }}
          />
          <Button onClick={runPreview} disabled={!file || pending}>
            <FileUp /> {pending && !preview ? "Checking…" : "Check file"}
          </Button>
        </div>
        {error && (
          <Alert variant="destructive" className="mt-3">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </section>

      {preview && (
        <section className="space-y-4 rounded-lg border bg-card p-4">
          <h2 className="text-sm font-semibold">3. Review and import</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Rows found</p>
              <p className="text-xl font-semibold">{preview.total}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Ready to import</p>
              <p className="text-xl font-semibold text-success">{preview.valid.length}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Rows with problems</p>
              <p className={`text-xl font-semibold ${preview.errors.length ? "text-destructive" : ""}`}>{preview.errors.length}</p>
            </div>
          </div>

          {preview.unknownHeaders.length > 0 && (
            <p className="text-sm text-muted-foreground">Ignored columns: {preview.unknownHeaders.join(", ")}</p>
          )}

          {preview.warnings.length > 0 && (
            <Alert className="border-warning/40 bg-warning/5">
              <AlertTriangle className="text-warning" />
              <AlertTitle>Possible duplicates in the file</AlertTitle>
              <AlertDescription>
                <ul className="list-disc pl-4">
                  {preview.warnings.slice(0, 20).map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {preview.errors.length > 0 && (
            <div className="max-h-72 overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Row</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Problem</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.errors.map((e) => (
                    <TableRow key={`${e.row}-${e.name}`}>
                      <TableCell>{e.row || "—"}</TableCell>
                      <TableCell>{e.name}</TableCell>
                      <TableCell className="whitespace-normal text-destructive">{e.messages.join(" ")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {preview.errors.length > 0 && !blocking && (
            <p className="text-sm text-muted-foreground">
              Fix the rows above in your spreadsheet and check the file again, or import only the {preview.valid.length} valid rows.
            </p>
          )}

          <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-end sm:justify-between">
            <FormField id="import_status" label="Status for imported members" className="sm:w-64">
              <Select value={statusId} onValueChange={setStatusId}>
                <SelectTrigger id="import_status" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statuses.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <Button onClick={commit} disabled={pending || blocking || preview.valid.length === 0}>
              <CheckCircle2 /> {pending ? "Importing…" : `Import ${preview.valid.length} members`}
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
