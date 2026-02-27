import { ArrowLeft, Grid2x2, LogOut, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/app/context/auth-context";
import { EditRoomModal } from "@/components/EditRoomModal";
import type { Room } from "@/lib/types";

type SidebarProps = {
  activeSlug: string;
  onCreateRoom: () => void;
  onDeleteRoom: (room: Room) => Promise<boolean> | boolean;
  onRenameRoom: (room: Room, name: string) => Promise<boolean> | boolean;
  onSelectRoom: (slug: string) => void;
  rooms: Room[];
  workspaceName?: string;
  userName?: string;
  userSubtitle?: string;
};

export function Sidebar({
  activeSlug,
  onCreateRoom,
  onDeleteRoom,
  onRenameRoom,
  onSelectRoom,
  rooms,
  workspaceName = "Workspace",
  userName = "Member",
  userSubtitle = "Workspace member"
}: SidebarProps) {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [hoveredRoomId, setHoveredRoomId] = useState<string | null>(null);
  const avatarLetter = userName.trim().charAt(0).toUpperCase() || "U";

  async function handleSaveRoom(newName: string) {
    if (!editingRoom) return false;
    return onRenameRoom(editingRoom, newName);
  }

  async function handleDeleteRoom() {
    if (!editingRoom) return false;
    return onDeleteRoom(editingRoom);
  }

  async function handleLogout() {
    await logout();
    navigate("/", { replace: true });
  }

  return (
    <>
      <aside className="flex h-full w-[240px] flex-col border-r border-[var(--border)] bg-[#FBFBFA]">
        <div className="border-b border-[var(--border)] px-5 py-4">
          <div className="flex items-center gap-2">
            <Link
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--muted-foreground)] transition hover:bg-[var(--accent)] hover:text-[var(--foreground)]"
              title="Back to workspaces"
              to="/"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <h1 className="truncate text-base font-medium text-[var(--foreground)]">{workspaceName}</h1>
          </div>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {rooms.map((room) => {
            const active = room.slug === activeSlug;
            return (
              <div
                key={room.id}
                className="relative group"
                onMouseEnter={() => setHoveredRoomId(room.id)}
                onMouseLeave={() => setHoveredRoomId(null)}
              >
                <button
                  className={`w-full rounded-lg px-3 py-2 pr-8 text-left text-sm transition ${
                    active
                      ? "bg-[var(--accent)] text-[var(--foreground)]"
                      : "text-[var(--muted-foreground)] hover:bg-[var(--accent)]"
                  }`}
                  onClick={() => onSelectRoom(room.slug)}
                  type="button"
                >
                  {room.name}
                </button>

                {hoveredRoomId === room.id ? (
                  <button
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 transition-colors hover:bg-[var(--accent)]"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setEditingRoom(room);
                    }}
                    title="Edit room"
                    type="button"
                  >
                    <Pencil className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
                  </button>
                ) : null}
              </div>
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
          <a
            className="mb-2 block rounded-lg px-2 py-1 text-xs text-[var(--muted-foreground)] transition hover:bg-[var(--accent)] hover:text-[var(--foreground)]"
            href="/settings/profile"
          >
            Profile Settings
          </a>
          <a
            className="mb-2 block rounded-lg px-2 py-1 text-xs text-[var(--muted-foreground)] transition hover:bg-[var(--accent)] hover:text-[var(--foreground)]"
            href="/admin"
          >
            Admin Panel
          </a>
          <div className="flex items-center gap-3 rounded-lg px-2 py-1.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--muted)] text-xs font-medium text-[var(--foreground)]">
              {avatarLetter}
            </div>
            <div>
              <p className="text-sm text-[var(--foreground)]">{userName}</p>
              <p className="text-xs text-[var(--muted-foreground)]">{userSubtitle}</p>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <Link
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-xs text-[var(--foreground)] transition hover:bg-[var(--accent)]"
              to="/"
            >
              <Grid2x2 className="h-3.5 w-3.5" />
              Workspaces
            </Link>
            <button
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-xs text-[var(--foreground)] transition hover:bg-[var(--accent)]"
              onClick={() => {
                void handleLogout();
              }}
              type="button"
            >
              <LogOut className="h-3.5 w-3.5" />
              Logout
            </button>
          </div>
        </div>
      </aside>

      <EditRoomModal
        onDelete={handleDeleteRoom}
        isOpen={editingRoom !== null}
        onClose={() => setEditingRoom(null)}
        onSave={handleSaveRoom}
        roomName={editingRoom?.name ?? ""}
      />
    </>
  );
}
