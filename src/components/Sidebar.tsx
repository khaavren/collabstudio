import { Plus } from "lucide-react";
import type { Room } from "@/lib/types";

type SidebarProps = {
  activeSlug: string;
  onCreateRoom: () => void;
  onSelectRoom: (slug: string) => void;
  rooms: Room[];
};

export function Sidebar({ activeSlug, onCreateRoom, onSelectRoom, rooms }: SidebarProps) {
  return (
    <aside className="flex h-full w-[240px] flex-col border-r border-[var(--border)] bg-[#FBFBFA]">
      <div className="border-b border-[var(--border)] px-5 py-4">
        <h1 className="text-base font-medium text-[var(--foreground)]">Band Joes Studio</h1>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {rooms.map((room) => {
          const active = room.slug === activeSlug;
          return (
            <button
              className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                active
                  ? "bg-[var(--accent)] text-[var(--foreground)]"
                  : "text-[var(--muted-foreground)] hover:bg-[var(--accent)]"
              }`}
              key={room.id}
              onClick={() => onSelectRoom(room.slug)}
              type="button"
            >
              {room.name}
            </button>
          );
        })}

        <button
          className="mt-2 inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-[var(--muted-foreground)] transition hover:bg-[var(--accent)] hover:text-[var(--foreground)]"
          onClick={onCreateRoom}
          type="button"
        >
          <Plus className="h-3.5 w-3.5" />
          New Room
        </button>
      </nav>

      <div className="border-t border-[var(--border)] px-4 py-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-1.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--muted)] text-xs font-medium text-[var(--foreground)]">
            P
          </div>
          <div>
            <p className="text-sm text-[var(--foreground)]">Phil</p>
            <p className="text-xs text-[var(--muted-foreground)]">Product Lead</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
