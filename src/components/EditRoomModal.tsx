import { type FormEvent, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

type EditRoomModalProps = {
  isOpen: boolean;
  roomName: string;
  onClose: () => void;
  onDelete: () => Promise<boolean> | boolean;
  onSave: (newName: string) => Promise<boolean> | boolean;
};

export function EditRoomModal({ isOpen, onClose, onDelete, onSave, roomName }: EditRoomModalProps) {
  const [value, setValue] = useState(roomName);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    setValue(roomName);
    setError(null);
    setIsSubmitting(false);

    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });

    return () => cancelAnimationFrame(frame);
  }, [isOpen, roomName]);

  if (!isOpen) return null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    const trimmed = value.trim();
    if (!trimmed) {
      setError("Room name is required.");
      return;
    }

    setIsSubmitting(true);
    try {
      const ok = await onSave(trimmed);
      if (ok !== false) {
        onClose();
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete() {
    if (isSubmitting) return;

    setIsSubmitting(true);
    try {
      const ok = await onDelete();
      if (ok !== false) {
        onClose();
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border border-[var(--border)] bg-white p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-medium text-[var(--foreground)]">Edit Room</h2>
          <button
            className="rounded-lg p-1 text-[var(--muted-foreground)] transition hover:bg-[var(--accent)]"
            onClick={onClose}
            type="button"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block text-sm text-[var(--foreground)]">
            Room name
            <input
              className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm outline-none"
              onChange={(event) => {
                setValue(event.target.value);
                if (error) setError(null);
              }}
              ref={inputRef}
              required
              value={value}
            />
          </label>

          {error ? <p className="text-xs text-[#9d4d3d]">{error}</p> : null}

          <div className="flex items-center justify-end gap-3">
            <button
              className="mr-auto text-sm text-[#9d4d3d] transition hover:underline disabled:opacity-60"
              disabled={isSubmitting}
              onClick={() => {
                void handleDelete();
              }}
              type="button"
            >
              Delete Room
            </button>
            <button
              className="text-sm text-[var(--muted-foreground)]"
              disabled={isSubmitting}
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
              {isSubmitting ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
