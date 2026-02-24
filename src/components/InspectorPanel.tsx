import { RefreshCw, X } from "lucide-react";
import { CommentThread } from "@/components/CommentThread";
import { timeAgo } from "@/lib/utils";
import type { Annotation, AssetVersion, Comment, AssetWithTags } from "@/lib/types";

type InspectorPanelProps = {
  activeVersionId: string | null;
  asset: AssetWithTags;
  annotations: Annotation[];
  comments: Comment[];
  onAddComment: (content: string) => Promise<void>;
  onClose: () => void;
  onRegenerate: (version: AssetVersion) => void;
  onSelectVersion: (versionId: string) => void;
  versions: AssetVersion[];
};

export function InspectorPanel({
  activeVersionId,
  asset,
  annotations,
  comments,
  onAddComment,
  onClose,
  onRegenerate,
  onSelectVersion,
  versions
}: InspectorPanelProps) {
  const orderedVersions = [...versions].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  const activeVersion =
    versions.find((version) => version.id === activeVersionId) ?? orderedVersions[0] ?? null;

  return (
    <aside className="hidden h-full w-[400px] flex-col border-l border-[var(--border)] bg-[var(--card)] xl:flex">
      <div className="border-b border-[var(--border)] px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-medium text-[var(--foreground)]">{asset.title}</h3>
            <p className="text-xs text-[var(--muted-foreground)]">{asset.current_version}</p>
          </div>
          <button
            className="rounded-lg p-1 text-[var(--muted-foreground)] hover:bg-[var(--accent)]"
            onClick={onClose}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <section className="space-y-2">
          <h4 className="text-sm font-medium text-[var(--foreground)]">Version Timeline</h4>
          <div className="space-y-1">
            {orderedVersions.map((version) => (
              <button
                className={`w-full rounded-lg px-3 py-2 text-left text-sm ${
                  version.id === activeVersion?.id
                    ? "bg-[var(--accent)]"
                    : "hover:bg-[var(--accent)]"
                }`}
                key={version.id}
                onClick={() => onSelectVersion(version.id)}
                type="button"
              >
                <p className="font-medium text-[var(--foreground)]">{version.version}</p>
                <p className="text-xs text-[var(--muted-foreground)]">
                  {new Date(version.created_at).toLocaleString()} · {version.editor}
                </p>
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <h4 className="text-sm font-medium text-[var(--foreground)]">Prompt History</h4>
          <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {orderedVersions.map((version, index) => (
              <article className="space-y-2 rounded-lg border border-[var(--border)] p-3" key={version.id}>
                <div className="flex items-center justify-between gap-2 text-xs text-[var(--muted-foreground)]">
                  <span className="font-medium text-[var(--foreground)]">{version.version}</span>
                  <span>{timeAgo(version.created_at)}</span>
                </div>

                <p className="rounded-lg bg-[var(--accent)] p-2 text-sm text-[var(--foreground)]">
                  {version.prompt}
                </p>

                <div className="text-xs text-[var(--muted-foreground)]">
                  <p>
                    Size: <span className="text-[var(--foreground)]">{version.size}</span>
                  </p>
                  <p>
                    Style: <span className="text-[var(--foreground)]">{version.style}</span>
                  </p>
                  {version.notes ? <p className="italic">Notes: {version.notes}</p> : null}
                </div>

                <div className="flex items-center gap-3 text-xs">
                  {index < orderedVersions.length - 1 ? (
                    <button className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]" type="button">
                      View Diff
                    </button>
                  ) : null}
                  <button
                    className="inline-flex items-center gap-1 text-[#D97706]"
                    onClick={() => onRegenerate(version)}
                    type="button"
                  >
                    <RefreshCw className="h-3 w-3" /> Regenerate
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <h4 className="text-sm font-medium text-[var(--foreground)]">Image Preview</h4>
          <div className="relative aspect-[4/3] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--muted)]">
            <img alt={asset.title} className="h-full w-full object-cover" src={asset.image_url} />
            {annotations.map((annotation) => (
              <span
                className="absolute inline-flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[var(--primary)] text-[10px] font-medium text-white"
                key={annotation.id}
                style={{
                  left: `${annotation.x_position}%`,
                  top: `${annotation.y_position}%`
                }}
              >
                {annotation.number}
              </span>
            ))}
          </div>
        </section>

        <CommentThread comments={comments} onAddComment={onAddComment} />
      </div>
    </aside>
  );
}
