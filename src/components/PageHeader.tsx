import { Search } from "lucide-react";
import type { AssetFilter } from "@/lib/types";

type PageHeaderProps = {
  collaboratorCount: number;
  projectCount: number;
  filter: AssetFilter;
  onFilterChange: (value: AssetFilter) => void;
  onGenerate: () => void;
  onSearchChange: (value: string) => void;
  roomTitle: string;
  searchValue: string;
};

export function PageHeader({
  collaboratorCount,
  projectCount,
  filter,
  onFilterChange,
  onGenerate,
  onSearchChange,
  roomTitle,
  searchValue
}: PageHeaderProps) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--card)] px-6 py-4">
      <div>
        <h2 className="text-lg font-medium text-[var(--foreground)]">{roomTitle}</h2>
        <p className="text-sm text-[var(--muted-foreground)]">
          {projectCount} projects · {collaboratorCount} collaborators
        </p>
      </div>

      <div className="flex flex-1 items-center justify-end gap-2 max-sm:w-full max-sm:flex-wrap max-sm:justify-start">
        <label className="relative min-w-[220px] max-sm:w-full">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-[var(--muted-foreground)]" />
          <input
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] py-2 pl-9 pr-3 text-sm text-[var(--foreground)] outline-none transition focus:border-[#D2D0CB]"
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search projects"
            value={searchValue}
          />
        </label>

        <select
          className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] outline-none"
          onChange={(event) => onFilterChange(event.target.value as AssetFilter)}
          value={filter}
        >
          <option value="All">All</option>
          <option value="Images">Images</option>
          <option value="Connectors">Connectors</option>
          <option value="Kits">Kits</option>
        </select>

        <button
          className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
          onClick={onGenerate}
          type="button"
        >
          Generate
        </button>
      </div>
    </header>
  );
}
