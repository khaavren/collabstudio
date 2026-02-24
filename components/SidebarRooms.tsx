"use client";

import { useState } from "react";
import type { Room } from "@/lib/types";

type SidebarRoomsProps = {
  canCreateRoom?: boolean;
  currentRoomId?: string;
  isCreating?: boolean;
  onCreateRoom: (name: string) => Promise<void>;
  onSelectRoom: (roomId: string) => void;
  rooms: Room[];
};

export function SidebarRooms({
  canCreateRoom = true,
  currentRoomId,
  isCreating = false,
  onCreateRoom,
  onSelectRoom,
  rooms
}: SidebarRoomsProps) {
  const [name, setName] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canCreateRoom) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    await onCreateRoom(trimmed);
    setName("");
  }

  return (
    <aside className="flex h-full w-full flex-col border-r border-stone-300 bg-[#f7f6f3]">
      <div className="border-b border-stone-300 px-4 py-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-700">Rooms</h2>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-3">
        {rooms.map((room) => {
          const isActive = room.id === currentRoomId;
          return (
            <button
              className={`mb-1 w-full rounded-md px-3 py-2 text-left text-sm transition ${
                isActive
                  ? "bg-stone-900 text-white"
                  : "text-stone-700 hover:bg-stone-200 hover:text-stone-900"
              }`}
              key={room.id}
              onClick={() => onSelectRoom(room.id)}
              type="button"
            >
              {room.name}
            </button>
          );
        })}
      </div>

      <form className="space-y-2 border-t border-stone-300 p-3" onSubmit={handleSubmit}>
        <input
          className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-stone-500"
          disabled={!canCreateRoom}
          onChange={(event) => setName(event.target.value)}
          placeholder={canCreateRoom ? "New room name" : "Editors/Admins can create rooms"}
          value={name}
        />
        <button
          className="w-full rounded-md bg-stone-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isCreating || !canCreateRoom}
          type="submit"
        >
          {isCreating ? "Creating..." : "Create room"}
        </button>
      </form>
    </aside>
  );
}
