import { ImagePlus } from "lucide-react";

type EmptyStateProps = {
  onGenerate: () => void;
};

export function EmptyState({ onGenerate }: EmptyStateProps) {
  return (
    <div className="flex h-[calc(100vh-180px)] items-center justify-center px-6">
      <div className="max-w-md rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)] p-8 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--muted-foreground)]">
          <ImagePlus className="h-5 w-5" />
        </div>
        <h3 className="text-base font-medium text-[var(--foreground)]">No projects yet</h3>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">Generate your first concept</p>
        <button
          className="mt-4 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white"
          onClick={onGenerate}
          type="button"
        >
          Generate
        </button>
      </div>
    </div>
  );
}
