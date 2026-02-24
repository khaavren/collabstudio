import { TagChip } from "@/components/TagChip";
import { timeAgo } from "@/lib/utils";
import type { AssetWithTags } from "@/lib/types";

type AssetCardProps = {
  asset: AssetWithTags;
  isSelected: boolean;
  onSelect: () => void;
};

export function AssetCard({ asset, isSelected, onSelect }: AssetCardProps) {
  return (
    <button
      className={`group rounded-xl border bg-[var(--card)] text-left transition ${
        isSelected
          ? "border-[#D1CEC6] ring-1 ring-[#D1CEC6]"
          : "border-[var(--border)] hover:bg-[var(--accent)]"
      }`}
      onClick={onSelect}
      type="button"
    >
      <div className="aspect-[4/3] overflow-hidden rounded-t-xl bg-[var(--muted)]">
        <img
          alt={asset.title}
          className="h-full w-full object-cover"
          loading="lazy"
          src={asset.image_url}
        />
      </div>

      <div className="space-y-2 p-3">
        <h3 className="line-clamp-2 text-sm font-medium text-[var(--foreground)]">{asset.title}</h3>

        <div className="flex flex-wrap gap-1.5">
          {asset.tags.map((tag) => (
            <TagChip key={`${asset.id}-${tag}`}>{tag}</TagChip>
          ))}
        </div>

        <p className="text-xs text-[var(--muted-foreground)]">
          Edited {timeAgo(asset.updated_at)} · {asset.edited_by}
        </p>
      </div>
    </button>
  );
}
