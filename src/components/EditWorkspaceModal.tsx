import { FormEvent, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

type EditWorkspaceModalProps = {
  isOpen: boolean;
  workspaceName: string;
  workspaceDescription: string;
  onClose: () => void;
  onDelete: () => void;
  onSave: (next: { name: string; description: string }) => Promise<boolean>;
};

export function EditWorkspaceModal({
  isOpen,
  workspaceName,
  workspaceDescription,
  onDelete,
  onClose,
  onSave
}: EditWorkspaceModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(workspaceName);
  const [description, setDescription] = useState(workspaceDescription);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setName(workspaceName);
    setDescription(workspaceDescription);
  }, [workspaceDescription, workspaceName, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    inputRef.current?.focus();
  }, [isOpen]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName || isSaving) return;

    setIsSaving(true);
    try {
      const saved = await onSave({
        name: trimmedName,
        description: description.trim()
      });
      if (saved) {
        onClose();
      }
    } finally {
      setIsSaving(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4">
      <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-medium text-[var(--foreground)]">Edit Workspace</h2>
          <button
            className="rounded-md p-1 text-[var(--muted-foreground)] transition hover:bg-[var(--accent)] hover:text-[var(--foreground)]"
            onClick={onClose}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form className="space-y-3" onSubmit={handleSubmit}>
          <label className="block space-y-1">
            <span className="text-sm text-[var(--foreground)]">Workspace Name</span>
            <input
              className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--foreground)] outline-none"
              onChange={(event) => setName(event.target.value)}
              ref={inputRef}
              required
              value={name}
            />
          </label>

          <label className="block space-y-1">
            <span className="text-sm text-[var(--foreground)]">Description</span>
            <textarea
              className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--foreground)] outline-none"
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              value={description}
            />
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <button
              className="mr-auto rounded-lg px-3 py-2 text-sm text-[#b42318] transition hover:bg-[#fef3f2]"
              disabled={isSaving}
              onClick={onDelete}
              type="button"
            >
              Delete Workspace
            </button>
            <button
              className="rounded-lg px-3 py-2 text-sm text-[var(--muted-foreground)] transition hover:bg-[var(--accent)] hover:text-[var(--foreground)]"
              disabled={isSaving}
              onClick={onClose}
              type="button"
            >
              Cancel
            </button>
            <button
              className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
              disabled={isSaving}
              type="submit"
            >
              {isSaving ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
