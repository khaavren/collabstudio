import { type FormEvent, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

type EditRoomModalProps = {
  isOpen: boolean;
  roomName: string;
  onClose: () => void;
  onSave: (newName: string) => void;
};

export function EditRoomModal({ isOpen, onClose, onSave, roomName }: EditRoomModalProps) {
  const [value, setValue] = useState(roomName);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    setValue(roomName);
    setError(null);

    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });

    return () => cancelAnimationFrame(frame);
  }, [isOpen, roomName]);

  if (!isOpen) return null;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmed = value.trim();
    if (!trimmed) {
      setError("Room name is required.");
      return;
    }

    onSave(trimmed);
    onClose();
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
              className="text-sm text-[var(--muted-foreground)]"
              onClick={onClose}
              type="button"
            >
              Cancel
            </button>
            <button
              className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white"
              type="submit"
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
