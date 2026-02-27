import { Upload, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { GenerateInput } from "@/lib/types";

type GenerateInlinePanelProps = {
  initialValues?: Partial<GenerateInput>;
  onClose?: () => void;
  onGenerate: (payload: GenerateInput) => Promise<void>;
};

const defaultValues: GenerateInput = {
  title: "",
  prompt: "",
  style: "Product Photography",
  size: "1024x1024",
  notes: "",
  referenceFile: null,
  generationMode: "auto"
};

export function GenerateInlinePanel({
  initialValues,
  onClose,
  onGenerate
}: GenerateInlinePanelProps) {
  const [form, setForm] = useState<GenerateInput>(defaultValues);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const imageModeEnabled = form.generationMode === "force_image";

  useEffect(() => {
    setForm({
      ...defaultValues,
      ...initialValues,
      referenceFile: null
    });
  }, [initialValues]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.prompt.trim()) return;

    setIsSubmitting(true);
    try {
      await onGenerate(form);
      setForm((current) => ({
        ...current,
        prompt: "",
        notes: "",
        referenceFile: null
      }));
    } catch {
      // Parent handles displaying error state.
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="w-full max-w-xl rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
      <header className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-medium text-[var(--foreground)]">Start Project Prompt</h3>
        {onClose ? (
          <button
            className="rounded-lg p-1 text-[var(--muted-foreground)] hover:bg-[var(--accent)]"
            onClick={onClose}
            type="button"
          >
            <X className="h-5 w-5" />
          </button>
        ) : null}
      </header>

      <form className="space-y-4" onSubmit={handleSubmit}>
        <label className="block text-sm text-[var(--foreground)]">
          Project title
          <input
            className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm outline-none"
            onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
            placeholder="Enter project title"
            value={form.title}
          />
        </label>

        <label className="block text-sm text-[var(--foreground)]">
          Prompt
          <textarea
            className="mt-1 min-h-28 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm outline-none"
            onChange={(event) => setForm((current) => ({ ...current, prompt: event.target.value }))}
            placeholder="Ask a question or describe a concept"
            rows={4}
            value={form.prompt}
          />
        </label>

        <label className="block text-sm text-[var(--foreground)]">
          Response Mode
          <select
            className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm outline-none"
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                generationMode: event.target.value === "force_image" ? "force_image" : "auto"
              }))
            }
            value={form.generationMode ?? "auto"}
          >
            <option value="auto">Auto (chat-style)</option>
            <option value="force_image">Image generation</option>
          </select>
        </label>

        {imageModeEnabled ? (
          <>
            <label className="block text-sm text-[var(--foreground)]">
              Notes (optional)
              <input
                className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm outline-none"
                onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                placeholder="Add optional notes"
                value={form.notes}
              />
            </label>

            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--border)] bg-[var(--background)] px-3 py-4 text-sm text-[var(--muted-foreground)]">
              <Upload className="h-4 w-4" />
              <span>{form.referenceFile ? form.referenceFile.name : "Upload reference image (optional)"}</span>
              <input
                accept="image/*"
                className="hidden"
                onChange={(event) =>
                  setForm((current) => ({ ...current, referenceFile: event.target.files?.[0] ?? null }))
                }
                type="file"
              />
            </label>
          </>
        ) : null}

        <div className="flex items-center justify-end gap-3">
          {onClose ? (
            <button
              className="text-sm text-[var(--muted-foreground)]"
              onClick={onClose}
              type="button"
            >
              Cancel
            </button>
          ) : null}
          <button
            className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? "Sending..." : imageModeEnabled ? "Generate" : "Start"}
          </button>
        </div>
      </form>
    </div>
  );
}
