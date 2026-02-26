import { Upload, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { GenerateInput } from "@/lib/types";

type GenerateModalProps = {
  initialValues?: Partial<GenerateInput>;
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (payload: GenerateInput) => Promise<void>;
};

const defaultValues: GenerateInput = {
  title: "",
  prompt: "",
  style: "Product Photography",
  size: "1024x1024",
  notes: "",
  referenceFile: null
};

export function GenerateModal({
  initialValues,
  isOpen,
  onClose,
  onGenerate
}: GenerateModalProps) {
  const [form, setForm] = useState<GenerateInput>(defaultValues);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setForm({
      ...defaultValues,
      ...initialValues,
      referenceFile: null
    });
  }, [initialValues, isOpen]);

  if (!isOpen) return null;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.prompt.trim()) return;

    setIsSubmitting(true);
    try {
      await onGenerate(form);
      onClose();
    } catch {
      // Parent handles displaying error state.
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-xl rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
        <header className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-medium text-[var(--foreground)]">Generate Concept</h3>
          <button
            className="rounded-lg p-1 text-[var(--muted-foreground)] hover:bg-[var(--accent)]"
            onClick={onClose}
            type="button"
          >
            <X className="h-5 w-5" />
          </button>
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
            placeholder="Describe the concept to generate"
            rows={4}
            value={form.prompt}
          />
        </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm text-[var(--foreground)]">
              Style
              <select
                className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm outline-none"
                onChange={(event) => setForm((current) => ({ ...current, style: event.target.value }))}
                value={form.style}
              >
                <option>Product Photography</option>
                <option>Technical Drawing</option>
                <option>3D Render</option>
                <option>Sketch</option>
              </select>
            </label>

            <label className="block text-sm text-[var(--foreground)]">
              Size
              <select
                className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm outline-none"
                onChange={(event) => setForm((current) => ({ ...current, size: event.target.value }))}
                value={form.size}
              >
                <option>1024x1024</option>
                <option>1024x768</option>
                <option>768x1024</option>
                <option>2048x2048</option>
              </select>
            </label>
          </div>

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

          <div className="flex items-center justify-end gap-3">
            <button
              className="text-sm text-[var(--muted-foreground)]"
              onClick={onClose}
              type="button"
            >
              Cancel
            </button>
            <button
              className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              disabled={isSubmitting}
              type="submit"
            >
              {isSubmitting ? "Generating..." : "Generate"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
