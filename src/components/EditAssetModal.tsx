import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";

type EditAssetModalProps = {
  isOpen: boolean;
  assetDescription?: string | null;
  assetTags: string[];
  assetTitle: string;
  onClose: () => void;
  onDelete?: () => void;
  onSave: (data: {
    title: string;
    tags: string[];
    description: string;
  }) => void;
};

function cleanTag(value: string) {
  return value.trim().replace(/^#+/, "");
}

export function EditAssetModal({
  assetDescription = "",
  assetTags,
  assetTitle,
  isOpen,
  onClose,
  onDelete,
  onSave
}: EditAssetModalProps) {
  const [title, setTitle] = useState(assetTitle);
  const [tags, setTags] = useState<string[]>(assetTags);
  const [description, setDescription] = useState(assetDescription ?? "");
  const [newTag, setNewTag] = useState("");

  useEffect(() => {
    if (!isOpen) return;

    setTitle(assetTitle);
    setTags(assetTags);
    setDescription(assetDescription ?? "");
    setNewTag("");
  }, [assetDescription, assetTags, assetTitle, isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  const canAddTag = useMemo(() => {
    const normalized = cleanTag(newTag);
    if (!normalized) return false;
    if (tags.length >= 10) return false;
    return !tags.some((tag) => tag.toLowerCase() === normalized.toLowerCase());
  }, [newTag, tags]);

  function handleAddTag() {
    const normalized = cleanTag(newTag);
    if (!normalized) return;
    if (!canAddTag) return;

    setTags((current) => [...current, normalized]);
    setNewTag("");
  }

  function handleRemoveTag(tagToRemove: string) {
    setTags((current) => current.filter((tag) => tag !== tagToRemove));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;

    onSave({
      title: trimmedTitle,
      tags,
      description: description.trim()
    });
  }

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--card)] shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] p-6">
          <h2 className="text-lg font-medium text-[var(--foreground)]">Edit Asset Details</h2>
          <button
            className="rounded-md p-1 text-[var(--muted-foreground)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--foreground)]"
            onClick={onClose}
            type="button"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form className="space-y-6 p-6" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <label className="text-sm font-medium text-[var(--foreground)]">Asset Title</label>
            <input
              autoFocus
              className="w-full rounded-lg border border-[var(--border)] bg-[color-mix(in_srgb,var(--accent)_60%,white)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--primary)_50%,white)]"
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Enter asset title..."
              value={title}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-[var(--foreground)]">Description (optional)</label>
            <textarea
              className="w-full resize-none rounded-lg border border-[var(--border)] bg-[color-mix(in_srgb,var(--accent)_60%,white)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--primary)_50%,white)]"
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Brief description of this asset..."
              rows={3}
              value={description}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-[var(--foreground)]">Tags</label>

            {tags.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <div
                    className="flex items-center gap-1.5 rounded-full bg-[var(--accent)] px-3 py-1 text-sm text-[var(--foreground)]"
                    key={tag}
                  >
                    <span>#{tag}</span>
                    <button
                      className="rounded-full p-0.5 text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
                      onClick={() => handleRemoveTag(tag)}
                      type="button"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="flex gap-2">
              <input
                className="flex-1 rounded-lg border border-[var(--border)] bg-[color-mix(in_srgb,var(--accent)_60%,white)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--primary)_50%,white)]"
                onChange={(event) => setNewTag(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    handleAddTag();
                  }
                }}
                placeholder="Add tag..."
                value={newTag}
              />
              <button
                className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm text-[var(--foreground)] transition-colors hover:opacity-80 disabled:opacity-50"
                disabled={!canAddTag}
                onClick={handleAddTag}
                type="button"
              >
                <Plus className="h-4 w-4" />
                Add
              </button>
            </div>
            <p className="text-xs text-[var(--muted-foreground)]">
              Press Enter or click Add to create a new tag (max 10)
            </p>
          </div>

          <div className="flex justify-end gap-3 border-t border-[var(--border)] pt-4">
            {onDelete ? (
              <button
                className="mr-auto rounded-lg px-4 py-2 text-sm text-[#b42318] transition-colors hover:bg-[#fef3f2]"
                onClick={onDelete}
                type="button"
              >
                Delete Asset
              </button>
            ) : null}
            <button
              className="rounded-lg px-4 py-2 text-sm text-[var(--muted-foreground)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--foreground)]"
              onClick={onClose}
              type="button"
            >
              Cancel
            </button>
            <button
              className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!title.trim()}
              type="submit"
            >
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
