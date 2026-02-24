import type { PropsWithChildren } from "react";

export function TagChip({ children }: PropsWithChildren) {
  return (
    <span className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--accent)] px-2.5 py-1 text-xs text-[var(--muted-foreground)]">
      {children}
    </span>
  );
}
